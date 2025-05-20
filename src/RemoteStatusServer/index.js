var __classPrivateFieldSet = (this && this.__classPrivateFieldSet) || function (receiver, state, value, kind, f) {
    if (kind === "m") throw new TypeError("Private method is not writable");
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
    return (kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value)), value;
};
var __classPrivateFieldGet = (this && this.__classPrivateFieldGet) || function (receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var _RemoteStatusServer_keys;
import {EventEmitter} from 'node:events';
import {z} from "zod";
import {IO} from "../getHttpServer.js";
import {ConnectionHandler} from "./connectionHandler";

const AuthenticationObject = z.object({
    token: z.string()
});
class RemoteStatusServer extends EventEmitter {
    constructor(keys) {
        super();
        _RemoteStatusServer_keys.set(this, void 0);
        this.connectionHandlers = new Map();
        this.io = IO.of('/remote-status-server/v2');
        __classPrivateFieldSet(this, _RemoteStatusServer_keys, keys, "f");
        for (let key of keys) {
            this.connectionHandlers.set(key.clientId, new ConnectionHandler());
        }
        this.io.on("connection", client => {
            try {
                // Attempt to authenticate the client
                const authData = AuthenticationObject.parse(client.handshake.auth);
                let key = __classPrivateFieldGet(this, _RemoteStatusServer_keys, "f").find(key => key.secret === authData.token);
                if (!key)
                    throw new Error("Key does not match");
                let handler = this.connectionHandlers.get(key.clientId);
                if (!handler)
                    throw new Error("Could not find connection handler");
                handler.attachSocket(client);
            }
            catch (e) {
                console.error(e);
                client.disconnect();
            }
            console.log("CLIENT SERVER CONNECTED");
            client.on("ping", () => {
                console.log("PONG!");
                client.emit("pong");
            });
        });
    }
    broadcastCommand(command, silent = false) {
        let object = {
            type: "message",
            data: command,
            silent
        };
        this.io.emit("sendCommand", object);
    }
}
_RemoteStatusServer_keys = new WeakMap();
export default RemoteStatusServer;
