import * as http from "http";
import {Server, Socket} from "socket.io";
import {EventEmitter} from 'node:events';
import * as crypto from "crypto";
import {Client} from "socket.io/dist/client";

interface MinecraftPlayerData {
    username: string,
    id: string,
    experience: {
        level: number,
        xp: number
    },
    position: [number, number, number],
    dimension: string,
    dead: boolean
}

interface IncomingMessage {
    type: string
    data: object
}

interface IncomingLoginMessage extends IncomingMessage {
    type: "playerConnect",
    data: MinecraftPlayerData
}

interface IncomingLogoutMessage extends IncomingMessage {
    type: "playerDisconnect",
    data: MinecraftPlayerData
}

interface IncomingChatMessage extends IncomingMessage {
    type: "message"
    data: {
        player: MinecraftPlayerData,
        message: string,
        submitted: boolean
    }
}

interface IncomingMessagePlayerList extends IncomingMessage {
    type: "player_list",
    data: MinecraftPlayerData[]
}

interface OutgoingMessage {
    type: "message"
    data: {
        players: MinecraftPlayerData[],
        message: string
    }
}

interface OutgoingCommand {
    type: "message"
    data: string
}

interface IncomingAdvancementMessage extends IncomingMessage {
    type: "playerAdvancementEarn",
    data: {
        player: MinecraftPlayerData,
        advancement: {
            id: string,
            display: {
                title: string,

            }
        }
    }
}

export default class RemoteStatusServer extends EventEmitter {
    readonly server
    readonly io
    private readonly aesKey
    private server_connections: any = {}

    constructor(encryptionKey: string, verification_keys: string[], port: number = 6028) {
        super()

        this.server = http.createServer()
        this.io = new Server(this.server)
        this.aesKey = Buffer.from(encryptionKey, "base64")

        this.encrypt.bind(this)
        this.decrypt.bind(this)

        for (let key of verification_keys) {
            this.server_connections[key] = {}
            const func = (res) => {
                this.server_connections[key].attachClient = res
            }

            this.server_connections[key].server = new ServerConnection(
                this,
                func,
                (data) => this.encrypt(data),
                (data) => this.decrypt(data)
            )
        }

        this.io.on("connection", client => {
            client.on("verify_connection", data => {
                try {
                    let key = this.decrypt(data)
                    if (this.server_connections[key] && !this.server_connections[key].server.connected) {
                        // Attach this connection to the correct ServerConnection object.
                        this.server_connections[key].attachClient(client)
                    }
                } catch (e) {
                    console.error(e)
                }
            })
        })

        this.server.listen(port)
    }

    private decrypt(string: string) {
        const parts = string.split(":")

        const iv = parts[0]
        const decipher = crypto.createDecipheriv("aes-256-cbc", this.aesKey, Buffer.from(iv, "base64"));
        let decrypted = decipher.update(parts[1], "base64", "utf-8");
        decrypted += decipher.final("utf-8");
        return decrypted
    }

    private encrypt(string: string) {
        const iv = crypto.randomBytes(16)

        const cipher = crypto.createCipheriv("aes-256-cbc", this.aesKey, iv);
        let encrypted = cipher.update(string)
        encrypted = Buffer.concat([encrypted, cipher.final()])
        return iv.toString("base64") + ":" + encrypted.toString("base64")
    }

    public broadcastCommand(command: string) {
        let object: OutgoingCommand = {
            type: "message",
            data: command
        }

        let _message = this.encrypt(JSON.stringify(object))
        console.log(_message)

        this.io.emit("sendCommand", _message)
    }

    get connections(): {[key: string]: ServerConnection} {
        let object = {}
        for (let item of Object.keys(this.server_connections)) object[item] = this.server_connections[item].server
        return object
    }
}

interface IServerConnectionEvents  {
    message: [string, Player],
    "typing_start": [Player],
    playerDisconnect: [Player],
    playerChangedDimension: [Player],
    playerXpPickup: [Player],
    playerXpChanged: [Player],
    playerLevelChanged: [Player],
    playerDeath: [Player],
    playerRespawn: [Player],
    playerConnect: [Player],
    playerAdvancementEarn: [{id: string, display: {title: string}}, Player],
    playerDataUpdate: [Player],
}

class ServerConnection extends EventEmitter {
    private readonly parent: RemoteStatusServer;
    private io_clients: Socket[] = []
    private _players: any = {}

    private readonly encrypt: (string) => string
    private readonly decrypt: (string) => string

    constructor(
        parent: RemoteStatusServer,
        attachClientsFunc: (func: (socket: Socket) => void) => void,
        encrypt: (string) => string,
        decrypt: (string) => string
    ) {
        super()
        this.parent = parent
        this.encrypt = encrypt
        this.decrypt = decrypt
        this.attachIOClient.bind(this)

        // The attachClientsFunc parameters provides a secure way for the parent code to pass a new client connection in to this class
        const func = (socket: Socket) => {
            this.attachIOClient(socket)
        }
        func.bind(this)
        attachClientsFunc(func)
    }

    on<T extends keyof IServerConnectionEvents>(eventName: T, listener: (...args: IServerConnectionEvents[T]) => void): this {
        return super.on(eventName, listener)
    }

    emit<T extends keyof IServerConnectionEvents>(eventName: T, ...args: IServerConnectionEvents[T]): boolean {
        return super.emit(eventName, ...args)
    }

    get connected() {
        return this.io_clients.length !== 0
    }

    get players(): Player[] {
        return Object.keys(this._players).map(i => this._players[i].player)
    }

    private attachIOClient(client: Socket) {
        console.log("Attached client")
        this._requestPlayerList(client)

        client.on("message", data => {
            try {
                let object = JSON.parse(this.decrypt(data)) as IncomingChatMessage
                let player = this.getPlayer(object.data.player, client)

                if (object.data.submitted) {
                    // Broadcast event
                    player.setTyping()
                    this.emit("message", object.data.message, player)
                } else {
                    // Broadcast event
                    let trigger_event = !player.isTyping
                    console.log("HERE!")
                    player.setTyping(object.data.message)
                    if (trigger_event) this.emit("typing_start", player)
                }
            } catch (e) {
                console.log(e)
            }
        })

        client.on("playerConnect", data => {
            try {
                let object = JSON.parse(this.decrypt(data)) as IncomingLoginMessage

                let player = this.getPlayer(object.data, client)
                console.log(object)
            } catch (e) {
                console.log(e)
            }
        })

        client.on("playerDisconnect", data => {
            try {
                let object = JSON.parse(this.decrypt(data)) as IncomingLogoutMessage

                console.log(object)
                let player = this._players[object.data.id]
                this.emit("playerDisconnect", player.player)
                delete this._players[object.data.id]
                console.log(this._players)
            } catch (e) {
                console.log(e)
            }
        })

        client.on("playerChangedDimension", data => {
            try {
                let object = JSON.parse(this.decrypt(data)) as IncomingLoginMessage

                let player = this.getPlayer(object.data, client)
                this.emit("playerChangedDimension", player)
            } catch (e) {
                console.log(e)
            }
        })

        client.on("playerXpPickup", data => {
            try {
                let object = JSON.parse(this.decrypt(data)) as IncomingLoginMessage

                let player = this.getPlayer(object.data, client)
                this.emit("playerXpPickup", player)
            } catch (e) {
                console.log(e)
            }
        })

        client.on("playerXpChanged", data => {
            try {
                let object = JSON.parse(this.decrypt(data)) as IncomingLoginMessage

                let player = this.getPlayer(object.data, client)
                this.emit("playerXpChanged", player)
            } catch (e) {
                console.log(e)
            }
        })

        client.on("playerLevelChanged", data => {
            try {
                let object = JSON.parse(this.decrypt(data)) as IncomingLoginMessage

                let player = this.getPlayer(object.data, client)
                this.emit("playerLevelChanged", player)
            } catch (e) {
                console.log(e)
            }
        })

        client.on("playerDeath", data => {
            try {
                let object = JSON.parse(this.decrypt(data)) as IncomingLoginMessage

                let player = this.getPlayer(object.data, client)
                this.emit("playerDeath", player)
            } catch (e) {
                console.log(e)
            }
        })

        client.on("playerRespawn", data => {
            try {
                let object = JSON.parse(this.decrypt(data)) as IncomingLoginMessage

                let player = this.getPlayer(object.data, client)
                this.emit("playerRespawn", player)
            } catch (e) {
                console.log(e)
            }
        })

        client.on("playerList", data => {
            try {
                let object = JSON.parse(this.decrypt(data)) as IncomingMessagePlayerList
                console.log(object)

                for (let _player of object.data) {
                    let player = this.getPlayer(_player, client)
                }
            } catch (e) {
                console.log(e)
            }
        })

        client.on("playerAdvancementEarn", data => {
            try {
                let object = JSON.parse(this.decrypt(data)) as IncomingAdvancementMessage

                let player = this.getPlayer(object.data.player, client)
                this.emit("playerAdvancementEarn", object.data.advancement, player)
            } catch (e) {
                console.log(e)
            }
        })

        client.on("disconnect", () => {
            // Broadcast disconnect event for all players
            for (let player of Object.keys(this._players)) this.emit("playerDisconnect", this._players[player].player)

            // Remove the client from the connection list
            this.io_clients.splice(this.io_clients.indexOf(client), 1)
        })

        this.io_clients.push(client)
    }

    private _requestPlayerList(client: Socket) {
        this.broadcast("requestPlayerList")
    }

    requestPlayerList(): Promise<Player[]> {
        return new Promise((resolve) => {
            let count = this.io_clients.length
            for (let client of this.io_clients) {
                client.once("playerList", (data) => {
                    count -= 1
                    if (count === 0) {resolve(this.players)}
                })
                this._requestPlayerList(client);
            }
        })
    }

    private getPlayer(playerData: MinecraftPlayerData | string, client?: Socket) {
        // Ensure not to accidentally duplicate
        if (typeof playerData === "string") {
            if (this._players[playerData]) return this._players[playerData].player as Player;
            return undefined
        }
        else {
            if (!this._players[playerData.id]) {
                this._players[playerData.id] = {}
                const updatePlayerInfo = (func) => {
                    this._players[playerData.id].updateInfo = func
                }
                this._players[playerData.id].player = new Player(playerData, this, updatePlayerInfo)

                this.emit("playerConnect", this._players[playerData.id].player)
            } else {
                this._players[playerData.id].updateInfo(playerData)
            }
            if (client) this._players[playerData.id].client = client
            return this._players[playerData.id].player as Player
        }
    }

    private broadcast(event: string, data?: string) {
        for (let client of this.io_clients) client.emit(event, data)
    };

    // PUBLIC METHODS

    public broadcastCommand(command: string) {
        let object: OutgoingCommand = {
            type: "message",
            data: command
        }

        let _message = this.encrypt(JSON.stringify(object))
        console.log(_message)

        this.broadcast("sendCommand", _message)
    }

    public broadcastMessage(message: string, players?: Player[]) {
        let object: OutgoingMessage = {
            type: "message",
            data: {
                players: [],
                message
            }
        }

        let _message = this.encrypt(JSON.stringify(object))
        console.log(_message)

        this.broadcast("sendMessage", _message)
    }
}

class Player {
    readonly id: string
    readonly username: string
    readonly parent: ServerConnection
    private _typing_message: string
    private _typing_timeout: NodeJS.Timeout

    private _data: MinecraftPlayerData;

    constructor(data: MinecraftPlayerData, parent: ServerConnection, onUpdatePlayerInfo: (d: (data: MinecraftPlayerData) => void) => void) {
        this.id = data.id
        this.username = data.username
        this.parent = parent
        this.updatePlayerInfo(data)

        onUpdatePlayerInfo((data) => {
            this.updatePlayerInfo(data)
        })
    }

    private updatePlayerInfo(data: MinecraftPlayerData) {
        this._data = data
        this.parent.emit("playerDataUpdate", this)
    }

    get isTyping() {return !!this._typing_message}
    get isTypingMessage() {return this._typing_message}
    get position() {return this._data.position}
    get dimension() {return this._data.dimension}
    get experience() {return this._data.experience}

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