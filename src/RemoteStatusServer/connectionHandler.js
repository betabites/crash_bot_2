var __classPrivateFieldGet = (this && this.__classPrivateFieldGet) || function (receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var _ConnectionHandler_players;
import {EventEmitter} from "node:events";
import {
    IncomingAdvancementMessage,
    IncomingChatMessage,
    IncomingLoginMessage,
    IncomingLogoutMessage,
    IncomingMessagePlayerList
} from "./types.js";
import {Player} from "./player.js";

export class ConnectionHandler extends EventEmitter {
    constructor() {
        super();
        this.io_clients = [];
        _ConnectionHandler_players.set(this, new Map);
    }
    attachSocket(client) {
        client.on("message", data => {
            try {
                let object = IncomingChatMessage.parse(data);
                let player = this.getPlayer(object.data.player, client);
                if (!player)
                    throw new Error("Player not found");
                if (object.data.submitted) {
                    // Broadcast event
                    player.setTyping();
                    this.emit("message", object.data.message, player);
                }
                else {
                    // Broadcast event
                    let trigger_event = !player.isTyping;
                    player.setTyping(object.data.message);
                    if (trigger_event)
                        this.emit("typing_start", player);
                }
            }
            catch (e) {
                console.log(e);
            }
        });
        client.on("playerConnect", data => {
            try {
                let object = IncomingLoginMessage.parse(data);
                let player = this.getPlayer(object.data, client);
            }
            catch (e) {
                console.log(e);
            }
        });
        client.on("playerDisconnect", data => {
            try {
                let object = IncomingLogoutMessage.parse(data);
                let player = __classPrivateFieldGet(this, _ConnectionHandler_players, "f").get(object.data.id);
                if (!player)
                    return;
                this.emit("playerDisconnect", player);
                __classPrivateFieldGet(this, _ConnectionHandler_players, "f").delete(object.data.id);
            }
            catch (e) {
                console.log(e);
            }
        });
        client.on("playerChangedDimension", data => {
            try {
                let object = IncomingLoginMessage.parse(data);
                let player = this.getPlayer(object.data, client);
                if (!player)
                    throw new Error("Player not found");
                this.emit("playerChangedDimension", player);
            }
            catch (e) {
                console.log(e);
            }
        });
        client.on("playerXpPickup", data => {
            try {
                let object = IncomingLoginMessage.parse(data);
                let player = this.getPlayer(object.data, client);
                if (!player)
                    throw new Error("Player not found");
                this.emit("playerXpPickup", player);
            }
            catch (e) {
                console.log(e);
            }
        });
        client.on("playerXpChanged", data => {
            try {
                let object = IncomingLoginMessage.parse(data);
                let player = this.getPlayer(object.data, client);
                if (!player)
                    throw new Error("Player not found");
                this.emit("playerXpChanged", player);
            }
            catch (e) {
                console.log(e);
            }
        });
        client.on("playerLevelChanged", data => {
            try {
                let object = IncomingLoginMessage.parse(data);
                let player = this.getPlayer(object.data, client);
                if (!player)
                    throw new Error("Player not found");
                this.emit("playerLevelChanged", player);
            }
            catch (e) {
                console.log(e);
            }
        });
        client.on("playerDeath", data => {
            try {
                let object = IncomingLoginMessage.parse(data);
                let player = this.getPlayer(object.data, client);
                if (!player)
                    throw new Error("Player not found");
                this.emit("playerDeath", player);
            }
            catch (e) {
                console.log(e);
            }
        });
        client.on("playerRespawn", data => {
            try {
                let object = IncomingLoginMessage.parse(data);
                let player = this.getPlayer(object.data, client);
                if (!player)
                    throw new Error("Player not found");
                this.emit("playerRespawn", player);
            }
            catch (e) {
                console.log(e);
            }
        });
        client.on("playerList", data => {
            try {
                let object = IncomingMessagePlayerList.parse(data);
                for (let _player of object.data) {
                    let player = this.getPlayer(_player, client);
                }
            }
            catch (e) {
                console.log(e);
            }
        });
        client.on("playerAdvancementEarn", data => {
            try {
                let object = IncomingAdvancementMessage.parse(data);
                let player = this.getPlayer(object.data.player, client);
                if (!player)
                    throw new Error("Player not found");
                if (player.lastAchievementID === object.data.advancement.id)
                    return;
                player.lastAchievementID = object.data.advancement.id;
                this.emit("playerAdvancementEarn", object.data.advancement, player);
            }
            catch (e) {
                console.log(e);
            }
        });
        client.on("disconnect", () => {
            // Broadcast disconnect event for all players
            for (let player of __classPrivateFieldGet(this, _ConnectionHandler_players, "f"))
                this.emit("playerDisconnect", player[1]);
            __classPrivateFieldGet(this, _ConnectionHandler_players, "f").clear();
            // Remove the client from the connection list
            this.io_clients.splice(this.io_clients.indexOf(client), 1);
            this.emit("serverDisconnect");
        });
        this.emit("serverConnect");
        this.io_clients.push(client);
        this._requestPlayerList();
    }
    on(eventName, listener) {
        // @ts-ignore
        return super.on(eventName, listener);
    }
    emit(eventName, ...args) {
        return super.emit(eventName, ...args);
    }
    get connected() {
        return this.io_clients.length !== 0;
    }
    get players() {
        return __classPrivateFieldGet(this, _ConnectionHandler_players, "f").values();
    }
    _requestPlayerList() {
        this.broadcast("requestPlayerList");
    }
    requestPlayerList() {
        return new Promise((resolve) => {
            let count = this.io_clients.length;
            for (let client of this.io_clients) {
                client.once("playerList", (data) => {
                    count -= 1;
                    if (count === 0) {
                        resolve(this.players);
                    }
                });
                this._requestPlayerList();
            }
        });
    }
    getPlayer(playerData, client) {
        // Ensure not to accidentally duplicate
        if (typeof playerData === "string") {
            return __classPrivateFieldGet(this, _ConnectionHandler_players, "f").get(playerData);
        }
        else {
            let player = __classPrivateFieldGet(this, _ConnectionHandler_players, "f").get(playerData.id);
            if (!player) {
                player = new Player(playerData, this);
                __classPrivateFieldGet(this, _ConnectionHandler_players, "f").set(playerData.id, player);
                this.emit("playerConnect", player);
            }
            else {
                player.updatePlayerInfo(playerData);
            }
            return player;
        }
    }
    broadcast(event, ...data) {
        for (let client of this.io_clients)
            client.emit(event, ...data);
    }
    ;
    // PUBLIC METHODS
    broadcastCommand(command, silent = false) {
        let object = {
            type: "message",
            data: command,
            silent
        };
        this.broadcast("sendCommand", object);
    }
    broadcastMessage(message, players) {
        let object = {
            type: "message",
            data: {
                players: [],
                message
            }
        };
        this.broadcast("sendMessage", object);
    }
}
_ConnectionHandler_players = new WeakMap();
