import {IncomingMessage, Server, ServerResponse} from "http";
import ws from "ws";
import {EventEmitter} from "node:events";
// import {CrashBotUser} from "./UserManager.js";

let ws_server: ws.Server, wss_server: ws.Server

export default class WSS extends EventEmitter{
    constructor(
        http_server: Server<typeof IncomingMessage, typeof ServerResponse>,
        https_server: Server<typeof IncomingMessage, typeof ServerResponse>
    ) {
        super()
        ws_server = new ws.Server({server: http_server})
        wss_server = new ws.Server({server: https_server})

        ws_server.on("connection", ws => this.emit("connection", ws))
        wss_server.on("connection", ws => this.emit("connection", ws))
    }

    fetchAllClients() {
        let clients = []
        for (let client of ws_server.clients) {
            clients.push(client)
        }

        for (let client of wss_server.clients) {
            clients.push(client)
        }
        return clients
    }

    broadcast(msg: string){
        // console.log(msg);
        try {
            this.fetchAllClients().forEach(function (client) {
                client.send(msg);
            });
        } catch (e) {
        }
    }
}