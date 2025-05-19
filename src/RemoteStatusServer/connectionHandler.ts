import {EventEmitter} from "node:events";
import {Socket} from "socket.io";
import {
    IncomingAdvancementMessage,
    IncomingChatMessage,
    IncomingLoginMessage,
    IncomingLogoutMessage,
    IncomingMessagePlayerList,
    IServerConnectionEvents,
    MinecraftPlayerData,
    OutgoingCommand,
    type OutgoingMessage
} from "./types.ts";
import {Player} from "./player.ts";
import {z} from "zod";

export class ConnectionHandler extends EventEmitter {
    private io_clients: Socket[] = []
    #players = new Map<string, Player>


    constructor() {
        super()
    }

    attachSocket(client: Socket) {
        client.on("message", data => {
            try {
                let object = IncomingChatMessage.parse(data)
                let player = this.getPlayer(object.data.player, client)
                if (!player) throw new Error("Player not found")

                if (object.data.submitted) {
                    // Broadcast event
                    player.setTyping()
                    this.emit("message", object.data.message, player)
                }
                else {
                    // Broadcast event
                    let trigger_event = !player.isTyping
                    player.setTyping(object.data.message)
                    if (trigger_event) this.emit("typing_start", player)
                }
            } catch (e) {
                console.log(e)
            }
        })

        client.on("playerConnect", data => {
            try {
                let object = IncomingLoginMessage.parse(data)

                let player = this.getPlayer(object.data, client)
            } catch (e) {
                console.log(e)
            }
        })

        client.on("playerDisconnect", data => {
            try {
                let object = IncomingLogoutMessage.parse(data)

                let player = this.#players.get(object.data.id)
                if (!player) return
                this.emit("playerDisconnect", player)
                this.#players.delete(object.data.id)
            } catch (e) {
                console.log(e)
            }
        })

        client.on("playerChangedDimension", data => {
            try {
                let object = IncomingLoginMessage.parse(data)

                let player = this.getPlayer(object.data, client)
                if (!player) throw new Error("Player not found")
                this.emit("playerChangedDimension", player)
            } catch (e) {
                console.log(e)
            }
        })

        client.on("playerXpPickup", data => {
            try {
                let object = IncomingLoginMessage.parse(data)

                let player = this.getPlayer(object.data, client)
                if (!player) throw new Error("Player not found")
                this.emit("playerXpPickup", player)
            } catch (e) {
                console.log(e)
            }
        })

        client.on("playerXpChanged", data => {
            try {
                let object = IncomingLoginMessage.parse(data)

                let player = this.getPlayer(object.data, client)
                if (!player) throw new Error("Player not found")
                this.emit("playerXpChanged", player)
            } catch (e) {
                console.log(e)
            }
        })

        client.on("playerLevelChanged", data => {
            try {
                let object = IncomingLoginMessage.parse(data)

                let player = this.getPlayer(object.data, client)
                if (!player) throw new Error("Player not found")
                this.emit("playerLevelChanged", player)
            } catch (e) {
                console.log(e)
            }
        })

        client.on("playerDeath", data => {
            try {
                let object = IncomingLoginMessage.parse(data)

                let player = this.getPlayer(object.data, client)
                if (!player) throw new Error("Player not found")
                this.emit("playerDeath", player)
            } catch (e) {
                console.log(e)
            }
        })

        client.on("playerRespawn", data => {
            try {
                let object = IncomingLoginMessage.parse(data)

                let player = this.getPlayer(object.data, client)
                if (!player) throw new Error("Player not found")
                this.emit("playerRespawn", player)
            } catch (e) {
                console.log(e)
            }
        })

        client.on("playerList", data => {
            try {
                let object = IncomingMessagePlayerList.parse(data)

                for (let _player of object.data) {
                    let player = this.getPlayer(_player, client)
                }
            } catch (e) {
                console.log(e)
            }
        })

        client.on("playerAdvancementEarn", data => {
            try {
                let object = IncomingAdvancementMessage.parse(data)

                let player = this.getPlayer(object.data.player, client)
                if (!player) throw new Error("Player not found")
                if (player.lastAchievementID === object.data.advancement.id) return
                player.lastAchievementID = object.data.advancement.id
                this.emit("playerAdvancementEarn", object.data.advancement, player)
            } catch (e) {
                console.log(e)
            }
        })

        client.on("disconnect", () => {
            // Broadcast disconnect event for all players
            for (let player of this.#players) this.emit("playerDisconnect", player[1])
            this.#players.clear()

            // Remove the client from the connection list
            this.io_clients.splice(this.io_clients.indexOf(client), 1)
            this.emit("serverDisconnect")
        })
        this.emit("serverConnect")

        this.io_clients.push(client)
        this._requestPlayerList()
    }

    on<T extends keyof IServerConnectionEvents>(eventName: T, listener: (...args: IServerConnectionEvents[T]) => void): this {
        // @ts-ignore
        return super.on(eventName, listener)
    }

    emit<T extends keyof IServerConnectionEvents>(eventName: T, ...args: IServerConnectionEvents[T]): boolean {
        return super.emit(eventName, ...args)
    }

    get connected() {
        return this.io_clients.length !== 0
    }

    get players() {
        return this.#players.values()
    }

    private _requestPlayerList() {
        this.broadcast("requestPlayerList")
    }

    requestPlayerList(): Promise<Iterable<Player>> {
        return new Promise((resolve) => {
            let count = this.io_clients.length
            for (let client of this.io_clients) {
                client.once("playerList", (data) => {
                    count -= 1
                    if (count === 0) {
                        resolve(this.players)
                    }
                })
                this._requestPlayerList();
            }
        })
    }

    getPlayer(playerData: string, client?: Socket): Player | undefined
    getPlayer(playerData: z.infer<typeof MinecraftPlayerData>, client?: Socket): Player
    getPlayer(playerData: z.infer<typeof MinecraftPlayerData> | string, client?: Socket) {
        // Ensure not to accidentally duplicate
        if (typeof playerData === "string") {
            return this.#players.get(playerData)
        }
        else {
            let player = this.#players.get(playerData.id)
            if (!player) {
                player = new Player(playerData, this)
                this.#players.set(playerData.id, player)

                this.emit("playerConnect", player)
            }
            else {
                player.updatePlayerInfo(playerData)
            }
            return player
        }
    }

    private broadcast(event: string, ...data: any[]) {
        for (let client of this.io_clients) client.emit(event, ...data)
    };

    // PUBLIC METHODS

    public broadcastCommand(command: string, silent = false) {
        let object: OutgoingCommand = {
            type: "message",
            data: command,
            silent
        }

        this.broadcast("sendCommand", object)
    }

    public broadcastMessage(message: string, players?: Player[]) {
        let object: OutgoingMessage = {
            type: "message",
            data: {
                players: [],
                message
            }
        }

        this.broadcast("sendMessage", object)
    }
}
