import {ConnectionHandler} from "./connectionHandler.ts";
import {MinecraftPlayerData} from "./types.ts";
import {z} from "zod";

export class Player {
    readonly id: string
    readonly username: string
    readonly parent: ConnectionHandler
    lastAchievementID = ""
    private _typing_message: string | null | undefined
    private _typing_timeout: NodeJS.Timeout | undefined

    private _data: z.infer<typeof MinecraftPlayerData>;

    constructor(
        data: z.infer<typeof MinecraftPlayerData>,
        parent: ConnectionHandler,
    ) {
        this.id = data.id
        this.username = data.username
        this.parent = parent
        this._data = data
        this.updatePlayerInfo(data)
    }

    get voiceConnectionGroup() {
        return this._data.voiceConnectionGroup
    }

    updatePlayerInfo(data: z.infer<typeof MinecraftPlayerData>) {
        this._data = data
        this.parent.emit("playerDataUpdate", this)
    }

    get isTyping() {
        return !!this._typing_message
    }

    get isTypingMessage() {
        return this._typing_message
    }

    get position() {
        return this._data.position
    }

    get dimension() {
        return this._data.dimension
    }

    get experience() {
        return this._data.experience
    }

    sendMessage(message: string) {
        return this.parent.broadcastMessage(message, [this])
    }

    setTyping(message?: string) {
        this._typing_message = message
        if (this._typing_timeout) clearTimeout(this._typing_timeout)

        if (message) this._typing_timeout = setTimeout(() => {
            this._typing_message = null
        }, 30000)
    }
}
