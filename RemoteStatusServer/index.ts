import {Namespace, Server} from "socket.io";
import {EventEmitter} from 'node:events';
import {IO} from "../dist/misc/getHttpServer.js";
import {z} from "zod";
import {ConnectionHandler} from "./connectionHandler.js";

type ServerKey<CLIENT_ID extends string, SECRET extends string> = { clientId: CLIENT_ID, secret: SECRET }

interface OutgoingCommand {
    type: "message"
    data: string
    silent: boolean
}

const AuthenticationObject = z.object({
    token: z.string()
})

export default class RemoteStatusServer<CLIENT_ID extends string, KEYS extends ServerKey<CLIENT_ID, string>[]> extends EventEmitter {
    readonly io: Namespace | Server
    #keys: KEYS
    connectionHandlers = new Map<CLIENT_ID, ConnectionHandler>()

    constructor(keys: KEYS) {
        super()

        this.io = IO.of('/remote-status-server/v2')
        this.#keys = keys
        for (let key of keys) {
            this.connectionHandlers.set(key.clientId, new ConnectionHandler())
        }

        this.io.on("connection", client => {
            try {
                // Attempt to authenticate the client
                const authData = AuthenticationObject.parse(client.handshake.auth)
                let key = this.#keys.find(key => key.secret === authData.token)
                if (!key) throw new Error("Key does not match")

                let handler = this.connectionHandlers.get(key.clientId)
                if (!handler) throw new Error("Could not find connection handler")
                handler.attachSocket(client)
            } catch (e) {
                console.error(e)
                client.disconnect()
            }
            console.log("CLIENT SERVER CONNECTED")
            client.on("ping", () => {
                console.log("PONG!")
                client.emit("pong")
            })
        })
    }

    public broadcastCommand(command: string, silent = false) {
        let object: OutgoingCommand = {
            type: "message",
            data: command,
            silent
        }

        this.io.emit("sendCommand", object)
    }
}

