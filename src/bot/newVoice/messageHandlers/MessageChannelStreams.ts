import {Readable, type StreamOptions, Writable} from "stream";
import {type MessagePort} from "worker_threads"
import {RootPortManager} from "./RootPortManager.ts";

export class MessagePortWritable extends Writable {
    pendingChunks: {
        chunk: any,
        encoding: BufferEncoding,
        callback: (error?: (Error | null | undefined)) => void
    }[] = [];
    processingChunks = false

    static fromPort(port: MessagePort) {return new this(new RootPortManager(port))}

    constructor(private port: RootPortManager, options: Omit<StreamOptions<Writable>, "construct" | "destroy"> = {}) {
        // port.on("close", () => this.destroy(new Error("Port closed")))
        super(options);
    }

    _write(chunk: any, encoding: BufferEncoding, callback: (error?: (Error | null | undefined)) => void) {
        this.pendingChunks.push({chunk, encoding, callback});
        if (!this.processingChunks) this.processChunks()
    }

    async processChunks() {
        this.processingChunks = true;
        while (this.pendingChunks.length !== 0) {
            let chunk = this.pendingChunks.shift();
            if (!chunk) throw new Error("Invalid data chunk")
            try {
                let buffer = chunk.chunk instanceof Buffer
                    ? chunk.chunk.buffer
                    : Buffer.from(chunk.chunk).buffer;
                console.log("CHUNK", chunk.chunk)
                await this.port.emitWithAck("dataChunk", [buffer], buffer)
                chunk.callback()
            } catch (e) {
                // @ts-expect-error
                chunk.callback(e)
            }
        }
        this.processingChunks = false
    }

    _final(callback: (error?: (Error | null | undefined)) => void) {
        this.port.emit("final", [], callback)
    }

    _error(error: Error, callback: (error: Error) => void) {
        this.port.emit("error", [], error, callback)
    }
}

export class MessagePortReadable extends Readable {
    chunks: Buffer[] = []
    static fromPort(port: MessagePort) {return new this(new RootPortManager(port))}

    constructor(private port: RootPortManager) {
        super({
            highWaterMark: 1 << 62,
        });

        this.port.on("dataChunk", async (chunk: ArrayBuffer, callback) => {
            if (this.isPaused()) {
                console.log("Paused")
                await this.#waitForResume()
            }

            let decoded = Buffer.from(chunk)
            console.log("DECODED", decoded)
            this.chunks.push(decoded)
            // let hasBufferSpace = this.push(decoded)
            // console.log("Received data chunk")
            // if (!hasBufferSpace) {
            //     console.log("Read buffer size reached")
            //     this.#pauseInternal()
            //     await this.waitForDrain()
            //     this.#resumeInternal()
            // }
            // callback()
        })
        this.port.on("final", (callback) => {
            this.push(null)
            callback()
        })
        this.port.on("error", (error, callback) => {
            this.destroy(error)
            callback()
        })

        // Add logging for other events
        this.on('pipe', (src) => {
            console.log('MessagePortReadable: Stream is being piped to another stream');
        });

        this.on('unpipe', (src) => {
            console.log('MessagePortReadable: Stream has been unpiped');
        });

    }

    waitForDrain() {
        return new Promise(resolve => {this.once("drain", resolve)})
    }

    #pauseInternal() {
        this.port.emit("pause", [])
    }

    pause(): this {
        this.#pauseInternal()
        return super.pause();
    }

    #waitForResume() {
        return new Promise(resolve => {this.once("resume", resolve)})
    }

    #resumeInternal() {
        this.port.emit("resume", [])
    }

    resume(): this {
        this.#resumeInternal()
        return super.resume();
    }

    _destroy(error: Error | null, callback: (error?: (Error | null)) => void) {
        this.port.emit("close", [])
        super._destroy(error, callback);
    }


    // _read(size: number) {
    //     this.push(this.chunks.shift() || null)
    //     // console.log("read", size)
    //     // console.log('_read called - readableFlowing:', this.readableFlowing);
    //     // // Make sure we're in flowing mode
    //     // if (!this.readableFlowing) {
    //     //     console.log('Stream was not flowing, resuming...');
    //     //     this.#resumeInternal();
    //     // }
    // }
}
