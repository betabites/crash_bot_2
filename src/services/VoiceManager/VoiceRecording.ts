import {EncodingOptions} from "../../models/types.js";
import {EndBehaviorType, VoiceConnection} from "@discordjs/voice";
import DiscordOpus from "@discordjs/opus"
import {VoiceBasedChannel} from "discord.js";
import {createReadStream, createWriteStream, existsSync, mkdir, rm} from "fs"
import path from "path"
import {PassThrough, Readable, Transform, type TransformCallback, Writable} from "stream";
import {v4 as uuidv4} from "uuid"
import SafeQuery, {SafeTransaction, SafeTransactionQueryFunc, sql} from "../SQL.js";
import ffmpeg from "fluent-ffmpeg";

function secondsToBuffer(seconds: number, options: EncodingOptions): Buffer[] {
    const bytes = secondsToBytes(seconds, options.sampleRate, options.numChannels, options.bytesPerElement);
    return bytesToBuffer(bytes, options.chunkSize);
}

function secondsToBytes(silenceTimeSec: number, sampleRate: number, numChannels: number, bytesPerElement: number): number {
    const totalSamples = silenceTimeSec * sampleRate;
    return totalSamples * numChannels * bytesPerElement;
}

function bytesToBuffer(bytes: number, chunkSize: number): Buffer[] {
    const silentPerChunk = Math.floor(bytes / chunkSize);
    const buffers: Buffer[] = [];
    for (let i = 0; i < silentPerChunk; ++i) {
        buffers.push(Buffer.alloc(chunkSize));
    }

    return buffers;
}

async function combineStreams(sources: Readable[], destination: Writable) {
    for (const stream of sources) {
        await new Promise((resolve, reject) => {
            stream.pipe(destination, { end: false })
            stream.on('end', resolve)
            stream.on('error', reject)
        })
    }
    destination.emit('end')
}

type OpusRecordingFile = {
    start: Date,
    end: Date,
    id: string
}

const SAMPLE_RATE = 48_000
const CHANNEL_COUNT = 2
const BYTES_PER_ELEMENT = 2

console.log(DiscordOpus)
const encoder = new DiscordOpus.OpusEncoder(SAMPLE_RATE, CHANNEL_COUNT)

export const ENCODING_OPTIONS = {
    numChannels: CHANNEL_COUNT,
    sampleRate: SAMPLE_RATE,
    chunkSize: (20 / 1000) * SAMPLE_RATE * 2 * Uint8Array.BYTES_PER_ELEMENT * BYTES_PER_ELEMENT,
    // (chunkTimeMs / 1000) * sampleRate * numChannels * Uint8Array.BYTES_PER_ELEMENT * bytesPerElement
    bytesPerElement: BYTES_PER_ELEMENT
}

function deleteVoiceRecordingClipTransaction(id: string, path: string, query: SafeTransactionQueryFunc) {
    void query(sql`DELETE FROM VoiceRecordingClips WHERE id = ${id}`)
    rm(path, () => {})
}


export class VoiceRecording {
    readonly userId: string;
    readonly id: string;
    protected opusFiles: OpusRecordingFile[] = []

    static async fromSaved(id: string, userId: string) {
        let clips = await SafeQuery<{id: string, start: Date, end: Date}>(sql`SELECT id, start, "end" FROM VoiceRecordingClips WHERE recording_id = ${id}`)
        return new VoiceRecording(id, userId, clips.recordset.map(i => ({...i, id: i.id.toLowerCase()})))
    }

    protected constructor(id: string, userId: string, opusFiles: OpusRecordingFile[]) {
        this.userId = userId
        this.id = id
        this.opusFiles = opusFiles

        // Check that the directory for this recording exists
        if (!existsSync(this.path)) {
            mkdir(this.path, {recursive: true}, () => {})
        }
    }

    get path() {
        return path.resolve(`./voice_recordings`, this.id)
    }

    mergeOpusFiles(onMergeComplete: (path: string) => void = () => {}): Readable {
        if (this.opusFiles.length === 0) return Readable.from([])
        else if (this.opusFiles.length === 1) {
            return createReadStream(path.join(this.path, this.opusFiles[0].id))
        }

        let streams: Readable[] = []
        let processedClipIds: string[] = []
        for (let i = 0; i < this.opusFiles.length; i++) {
            if (i !== 0) streams.push(Readable.from(secondsToBuffer(
                (
                    this.opusFiles[i].start.getTime() -
                    this.opusFiles[i - 1].end.getTime()
                ) / 1_000,
                ENCODING_OPTIONS
            )))

            streams.push(createReadStream(path.join(this.path, this.opusFiles[i].id)))
            processedClipIds.push(this.opusFiles[i].id)
        }

        const pipe = new PassThrough()
        let id = uuidv4()
        const writeStream = createWriteStream(path.resolve(this.path, id))
        void combineStreams(streams, pipe)
        pipe.pipe(writeStream)
        let newFile = {
            start: this.opusFiles[0].start,
            end: this.opusFiles.at(-1)?.end ?? this.opusFiles[0].start,
            id: id
        }
        this.opusFiles = [newFile]

        writeStream.on("error", (err) => console.error(err))
        writeStream.on("close", () => {
            void SafeTransaction(query => {
                void query(sql`INSERT INTO VoiceRecordingClips (id, recording_id, start, "end") VALUES (${newFile.id}, ${this.id}, ${newFile.start}, ${newFile.end})`)
                for (let file of processedClipIds) {
                    console.log("Clearing file:", file)
                    deleteVoiceRecordingClipTransaction(file, path.join(this.path, file), query)
                }
            })
            onMergeComplete(path.resolve(this.path, id))
        })

        return pipe
    }

    export(stream: Writable) {
        return new Promise<void>((resolve, reject) => {
            ffmpeg(this.mergeOpusFiles())
                .inputFormat("s16le")
                .audioChannels(2)
                .inputOptions([
                    `-ar ${SAMPLE_RATE}`
                ])
                .on("start", (line) => console.log(line))
                .on("error", (err) => reject(err))
                .on("close", () => resolve())
                .on("progress", (progress) => {
                    console.log(`${progress.percent}% done - Output: ${progress.targetSize}`)
                })
                // .outputFormat("mp3")
                .output("output.mp3")
                // .output(stream)
                .noVideo()
                .run()
        })
    }
}

export class ActiveVoiceRecording extends VoiceRecording {
    readonly voiceConnection: VoiceConnection
    readonly channel: VoiceBasedChannel;

    #recordingActive = false

    static async new(channel: VoiceBasedChannel, voiceConnection: VoiceConnection, userId: string) {
        let id = uuidv4()
        await SafeQuery(sql`INSERT INTO VoiceRecordings (id, user_id)
                            VALUES (${id}, ${userId})`)
        return new ActiveVoiceRecording(id, channel, voiceConnection, userId)
    }

    private constructor(id: string, channel: VoiceBasedChannel, voiceConnection: VoiceConnection, userId: string) {
        super(id, userId, [])
        this.voiceConnection = voiceConnection
        this.channel = channel
    }

    subscribe() {
        if (this.#recordingActive) return
        this.#recordingActive = true

        const receiver = this.voiceConnection.receiver.subscribe(this.userId, {
            end: {
                behavior: EndBehaviorType.AfterInactivity,
                duration: 1000
            }
        })
        let id = uuidv4()
        let start = new Date()

        const decoderStream = new Transform({
            transform(chunk: any, encoding: BufferEncoding, callback: TransformCallback) {
                callback(null, encoder.decode(chunk))
            }
        })
        const writeStream = createWriteStream(path.join(this.path, id), {
            highWaterMark: 32,
        })
        receiver.pipe(decoderStream)
        decoderStream.pipe(writeStream)

        writeStream.on("close", () => {
            let end = new Date()
            this.opusFiles.push({start, end, id})
            this.#recordingActive = false

            SafeQuery(sql`INSERT INTO VoiceRecordingClips (id, recording_id, start, "end")
                          VALUES (${id}, ${this.id}, ${start}, ${end})`
            ).then(() => {if (this.opusFiles.length > 50) this.mergeOpusFiles()})
        })
    }

}
