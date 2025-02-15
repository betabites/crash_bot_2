/**
 * PortMessenger is used for async communications between threads
 */
import {type MessagePort, type TransferListItem, type Worker} from "worker_threads";
import {EventEmitter} from "node:events";

type SerialisedArgument = {
    type: 'string' | 'number' | 'boolean' | 'undefined' | 'symbol' | 'object' | 'bigint';
    data: unknown;
}

type RemoteCallArgument = {
    type: 'function';
    callId: string
}

type Message = {
    type: "eventCall",
    eventName: string,
    args: SerialisedArgument[]
} | {
    type: "functionCall",
    callId: string,
    args: SerialisedArgument[]
}

export class PortMessenger extends EventEmitter {
    #remoteCalls = new Map<string, Function>();

    constructor(private port: MessagePort | Worker) {
        super()
        this.port.on("message", (message: Message) => {
            let args = this.#deserialiseArguments(...message.args)
            if (message.type === "eventCall") {
                super.emit(message.eventName, ...args)
            } else if (message.type === "functionCall") {
                this.#remoteCalls.get(message.callId)?.(...args)
            }
        })
    }

    #serialiseArguments(...args: any[]) {
        return args.map(arg => {
            let type = typeof arg
            if (type === "function") {
                let id = crypto.randomUUID()
                this.#remoteCalls.set(id, arg)
                return {
                    type: 'function',
                    callId: id
                } satisfies RemoteCallArgument;
            }
            else return {
                type, data: arg
            } satisfies SerialisedArgument;
        })
    }

    #deserialiseArguments(...args: (RemoteCallArgument | SerialisedArgument)[]) {
        return args.map(arg => {
            if (arg.type === "function") {
                return (..._args: any) => {
                    this.#callRemoteFunction(arg.callId, _args)
                }
            }
            else return arg.data;
        })
    }

    #callRemoteFunction(callId: string, args: any[]) {
        this.port.postMessage({
            type: "functionCall",
            callId,
            args: this.#serialiseArguments(...args)
        })
    }

    emit(eventName: string, transferListItem: TransferListItem[], ...args: any[]) {
        this.port.postMessage({
            type: "eventCall",
            eventName,
            args: this.#serialiseArguments(...args)
        }, transferListItem);
        return true
    }

    emitWithAck<DATA = any>(eventName: string, transferListItem: TransferListItem[], ...args: any[]) {
        return new Promise<DATA>((resolve, reject) => {
            this.emit(eventName, transferListItem, ...args, resolve, reject)
        })
    }
}
