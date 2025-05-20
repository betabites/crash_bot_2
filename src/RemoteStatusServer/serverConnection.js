import {EventEmitter} from "node:events";

export class ServerConnection extends EventEmitter {
    constructor(parent, attachClientsFunc, encrypt, decrypt) {
        super();
        this.io_clients = [];
        this._players = {};
        this.parent = parent;
        this.encrypt = encrypt;
        this.decrypt = decrypt;
        this.attachIOClient.bind(this);
        // The attachClientsFunc parameters provides a secure way for the parent code to pass a new client connection in to this class
        const func = (socket) => {
            this.attachIOClient(socket);
        };
        func.bind(this);
        attachClientsFunc(func);
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
        return Object.keys(this._players).map(i => this._players[i].player);
    }
    attachIOClient(client) {
        client.on("message", data => {
            try {
                let object = JSON.parse(this.decrypt(data));
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
                let object = JSON.parse(this.decrypt(data));
                let player = this.getPlayer(object.data, client);
            }
            catch (e) {
                console.log(e);
            }
        });
        client.on("playerDisconnect", data => {
            try {
                let object = JSON.parse(this.decrypt(data));
                let player = this._players[object.data.id];
                this.emit("playerDisconnect", player.player);
                delete this._players[object.data.id];
            }
            catch (e) {
                console.log(e);
            }
        });
        client.on("playerChangedDimension", data => {
            try {
                let object = JSON.parse(this.decrypt(data));
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
                let object = JSON.parse(this.decrypt(data));
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
                let object = JSON.parse(this.decrypt(data));
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
                let object = JSON.parse(this.decrypt(data));
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
                let object = JSON.parse(this.decrypt(data));
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
                let object = JSON.parse(this.decrypt(data));
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
                let object = JSON.parse(this.decrypt(data));
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
                let object = JSON.parse(this.decrypt(data));
                let player = this.getPlayer(object.data.player, client);
                if (player.lastAchievementID === object.data.advancement.id)
                    return;
                player.lastAchievementID = object.data.advancement.id;
                if (!player)
                    throw new Error("Player not found");
                this.emit("playerAdvancementEarn", object.data.advancement, player);
            }
            catch (e) {
                console.log(e);
            }
        });
        client.on("disconnect", () => {
            // Broadcast disconnect event for all players
            for (let player of Object.keys(this._players))
                this.emit("playerDisconnect", this._players[player].player);
            this._players = {};
            // Remove the client from the connection list
            this.io_clients.splice(this.io_clients.indexOf(client), 1);
            this.emit("serverDisconnect");
        });
        this.emit("serverConnect");
        this.io_clients.push(client);
        this._requestPlayerList();
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
            if (this._players[playerData])
                return this._players[playerData].player;
            return undefined;
        }
        else {
            if (!this._players[playerData.id]) {
                this._players[playerData.id] = {};
                const updatePlayerInfo = (func) => {
                    this._players[playerData.id].updateInfo = func;
                };
                this._players[playerData.id].player = new Player(playerData, this, updatePlayerInfo);
                this.emit("playerConnect", this._players[playerData.id].player);
            }
            else {
                this._players[playerData.id].updateInfo(playerData);
            }
            if (client)
                this._players[playerData.id].client = client;
            return this._players[playerData.id].player;
        }
    }
    broadcast(event, data) {
        for (let client of this.io_clients)
            client.emit(event, data);
    }
    ;
    // PUBLIC METHODS
    broadcastCommand(command, silent = false) {
        let object = {
            type: "message",
            data: command,
            silent
        };
        let _message = this.encrypt(JSON.stringify(object));
        this.broadcast("sendCommand", _message);
    }
    broadcastMessage(message, players) {
        let object = {
            type: "message",
            data: {
                players: [],
                message
            }
        };
        let _message = this.encrypt(JSON.stringify(object));
        this.broadcast("sendMessage", _message);
    }
}
