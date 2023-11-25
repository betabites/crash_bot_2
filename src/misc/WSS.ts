import {Server, IncomingMessage, ServerResponse} from "http";
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

    // async updateBank() {
    //     try {
    //         for (const client1 of this.fetchAllClients()) {
    //             let player = new CrashBotUser(client1.key)
    //             await player.get()
    //             let data_output = {
    //                 "action": "bank_update",
    //                 "data": {
    //                     "currency": player.currency,
    //                     "players": await CrashBotUser.listplayer_names(),
    //                     "available_resources": bank.tradeResources.map(resource => {
    //                         return {
    //                             name: resource.name,
    //                             tag_name: resource.tag_name,
    //                             stock: resource.stock,
    //                             max_stock: resource.max_inventory,
    //                             worth: resource.calculateWorth()
    //                         }
    //                     })
    //                 }
    //             }
    //             client1.send(JSON.stringify(data_output))
    //         }
    //
    //         // let online_players = await mcServer.getOnlinePlayers()
    //         //
    //         // let commands = [
    //         //     "scoreboard objectives remove bank",
    //         //     "scoreboard objectives add bank dummy Bank",
    //         //     "scoreboard objectives setdisplay list bank"
    //         // ]
    //         // for (let player of CrashBotUser.map) {
    //         //     if (await online_players.players.indexOf(player[1].player_name) !== -1) {
    //         //         commands.push(`scoreboard players set "${player[1].player_name}" bank ${player[1].currency}`)
    //         //     }
    //         // }
    //         // console.log(commands)
    //         // mcServer.sendCommand(commands.join("\n"))
    //     } catch (e) {
    //         console.log(e)
    //     }
    // }
}