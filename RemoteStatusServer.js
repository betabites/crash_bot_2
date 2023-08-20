import * as http from "http";
import { Server } from "socket.io";
import { EventEmitter } from 'node:events';
import * as crypto from "crypto";
export default class RemoteStatusServer extends EventEmitter {
    constructor(encryptionKey, verification_keys, port = 6028) {
        super();
        this.server_connections = {};
        this.server = http.createServer();
        this.io = new Server(this.server);
        this.aesKey = Buffer.from(encryptionKey, "base64");
        this.encrypt.bind(this);
        this.decrypt.bind(this);
        for (let key of verification_keys) {
            this.server_connections[key] = {};
            const func = (res) => {
                this.server_connections[key].attachClient = res;
            };
            this.server_connections[key].server = new ServerConnection(this, func, (data) => this.encrypt(data), (data) => this.decrypt(data));
        }
        this.io.on("connection", client => {
            client.on("verify_connection", data => {
                try {
                    let key = this.decrypt(data);
                    if (this.server_connections[key] && !this.server_connections[key].server.connected) {
                        // Attach this connection to the correct ServerConnection object.
                        this.server_connections[key].attachClient(client);
                    }
                }
                catch (e) {
                    console.error(e);
                }
            });
        });
        this.server.listen(port);
    }
    decrypt(string) {
        const parts = string.split(":");
        const iv = parts[0];
        const decipher = crypto.createDecipheriv("aes-256-cbc", this.aesKey, Buffer.from(iv, "base64"));
        let decrypted = decipher.update(parts[1], "base64", "utf-8");
        decrypted += decipher.final("utf-8");
        return decrypted;
    }
    encrypt(string) {
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv("aes-256-cbc", this.aesKey, iv);
        let encrypted = cipher.update(string);
        encrypted = Buffer.concat([encrypted, cipher.final()]);
        return iv.toString("base64") + ":" + encrypted.toString("base64");
    }
    broadcastCommand(command) {
        let object = {
            type: "message",
            data: command
        };
        let _message = this.encrypt(JSON.stringify(object));
        console.log(_message);
        this.io.emit("sendCommand", _message);
    }
    requestPlayerList() {
        this.io.emit("requestPlayerList");
    }
    get connections() {
        let object = {};
        for (let item of Object.keys(this.server_connections))
            object[item] = this.server_connections[item].server;
        return object;
    }
}
class ServerConnection extends EventEmitter {
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
    get connected() {
        return this.io_clients.length !== 0;
    }
    attachIOClient(client) {
        console.log("Attached client");
        client.on("message", data => {
            try {
                let object = JSON.parse(this.decrypt(data));
                let player = this.getPlayer(object.data.player);
                if (object.data.submitted) {
                    // Broadcast event
                    player.setTyping();
                    this.emit("message", object.data.message, player);
                }
                else {
                    // Broadcast event
                    let trigger_event = !player.isTyping;
                    console.log("HERE!");
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
                let player = this.getPlayer(object.data);
                console.log(object);
            }
            catch (e) {
                console.log(e);
            }
        });
        client.on("playerChangedDimension", data => {
            try {
                let object = JSON.parse(this.decrypt(data));
                let player = this.getPlayer(object.data);
                this.emit("playerChangedDimension", player);
            }
            catch (e) {
                console.log(e);
            }
        });
        client.on("playerXpPickup", data => {
            try {
                let object = JSON.parse(this.decrypt(data));
                let player = this.getPlayer(object.data);
                this.emit("playerXpPickup", player);
            }
            catch (e) {
                console.log(e);
            }
        });
        client.on("playerXpChanged", data => {
            try {
                let object = JSON.parse(this.decrypt(data));
                let player = this.getPlayer(object.data);
                this.emit("playerXpChanged", player);
            }
            catch (e) {
                console.log(e);
            }
        });
        client.on("playerLevelChanged", data => {
            try {
                let object = JSON.parse(this.decrypt(data));
                let player = this.getPlayer(object.data);
                this.emit("playerLevelChanged", player);
            }
            catch (e) {
                console.log(e);
            }
        });
        client.on("playerDeath", data => {
            try {
                let object = JSON.parse(this.decrypt(data));
                let player = this.getPlayer(object.data);
                this.emit("playerDeath", player);
            }
            catch (e) {
                console.log(e);
            }
        });
        client.on("playerRespawn", data => {
            try {
                let object = JSON.parse(this.decrypt(data));
                let player = this.getPlayer(object.data);
                this.emit("playerRespawn", player);
            }
            catch (e) {
                console.log(e);
            }
        });
        client.on("playerDisconnect", data => {
        });
        client.on("playerList", data => {
            try {
                let object = JSON.parse(this.decrypt(data));
                console.log(object);
                for (let _player of object.data) {
                    let player = this.getPlayer(_player);
                }
            }
            catch (e) {
                console.log(e);
            }
        });
        client.on("playerAdvancementEarn", data => {
            try {
                let object = JSON.parse(this.decrypt(data));
                let player = this.getPlayer(object.data.player);
                this.emit("playerAdvancementEarn", object.data.advancement, player);
            }
            catch (e) {
                console.log(e);
            }
        });
        client.on("disconnect", () => {
            // Remove the client from the connection list
            console.log("Detached client");
            this.io_clients.splice(this.io_clients.indexOf(client), 1);
        });
        this.io_clients.push(client);
    }
    getPlayer(playerData) {
        // Ensure not to accidentally duplicate
        if (!this._players[playerData.id]) {
            this._players[playerData.id] = {};
            const updatePlayerInfo = (func) => {
                this._players[playerData.id].updateInfo = func;
            };
            this._players[playerData.id].player = new Player(playerData, this, updatePlayerInfo);
            console.log("HERE!", this._players[playerData.id].player)
            this.emit("playerConnect", this._players[playerData.id].player);
        }
        else {
            this._players[playerData.id].updateInfo(playerData);
        }
        return this._players[playerData.id].player;
    }
    broadcast(event, data) {
        for (let client of this.io_clients)
            client.emit(event, data);
    }
    ;
    // PUBLIC METHODS
    broadcastCommand(command) {
        let object = {
            type: "message",
            data: command
        };
        let _message = this.encrypt(JSON.stringify(object));
        console.log(_message);
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
        console.log(_message);
        this.broadcast("sendMessage", _message);
    }
}
class Player {
    constructor(data, parent, onUpdatePlayerInfo) {
        this.id = data.id;
        this.username = data.username;
        this.parent = parent;
        this.updatePlayerInfo(data);
        onUpdatePlayerInfo((data) => {
            this.updatePlayerInfo(data);
        });
    }
    updatePlayerInfo(data) {
        this._data = data;
    }
    get isTyping() { return !!this._typing_message; }
    get isTypingMessage() { return this._typing_message; }
    get dimension() { return this._data.dimension; }
    get experience() { return this._data.experience; }
    sendMessage(message) {
        return this.parent.broadcastMessage(message, [this]);
    }
    setTyping(message) {
        this._typing_message = message;
        if (this._typing_timeout)
            clearTimeout(this._typing_timeout);
        if (message)
            this._typing_timeout = setTimeout(() => {
                this._typing_message = null;
            }, 30000);
    }
}
