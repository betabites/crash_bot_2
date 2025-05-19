import {BasePortMessenger} from "../messageHandlers/RootPortManager.ts";
import {ClientEvents} from "discord.js";
import {Writable} from "stream";

interface VoiceModuleStatic {
    uniqueName: string;
    new(messenger: BasePortMessenger, isOnWorker: true, audioStream: Writable): BaseVoiceModule;
    new(messenger: BasePortMessenger, isOnWorker: false): BaseVoiceModule;
}

export abstract class BaseVoiceModule {
    abstract uniqueName: string;

    /**
     * Runs on the worker thread when things are read
     */
    abstract _onThreadReady(): any;

    /**
     * Runs on the main thread when everything is ready (including the worker)
     */
    abstract _onReady(): any;

    onThreadReady() {
        this._onThreadReady()
    }

    @MainThread()
    async onReady() {
        this._onReady()
    }

    @WorkerThread()
    async onWorkerReady() {
        this._onThreadReady()
        // Trigger 'onReady' on the main thread
        void this.onReady()
    }

    constructor(messenger: BasePortMessenger, isOnWorker: true, audioStream: Writable)
    constructor(messenger: BasePortMessenger, isOnWorker: false)
    constructor(
        protected messenger: BasePortMessenger,
        protected isOnWorker: boolean,
        public audioStream?: Writable
    ) {
        messenger.on("callRemoteFunction", (message, resolve, reject) => {
            try {
                // @ts-expect-error
                let res = await this[message.functionName]?.(...message.args)
                resolve(res)
            } catch(e) {
                reject(e)
            }
        })
    }
}

/**
 * Declares a method in the voice module that runs on the main thread
 * @param thisArg
 * @constructor
 */
export function MainThread<Event extends keyof ClientEvents>(thisArg?: BaseVoiceModule) {
    function decorator(originalMethod: (...args: any[]) => Promise<any>, context: ClassMethodDecoratorContext<BaseVoiceModule>) {
        async function replacementMethod(this: BaseVoiceModule, ...args: ClientEvents[Event]) {
            // console.log(thisArg)
            let self = thisArg || this
            if (self.isOnWorker) {
                await self.messenger.emitWithAck("callRemoteFunction", [], {
                    functionName: originalMethod.name,
                    args: args,
                })
            }
            else return await originalMethod.call(thisArg || this, ...args)
        }
        return replacementMethod
    }
    return decorator
}

/**
 * Declares a method in the voice module that runs on the worker thread
 * @param thisArg
 * @constructor
 */
export function WorkerThread<Event extends keyof ClientEvents>(thisArg?: any) {
    function decorator(originalMethod: (...args: any[]) => Promise<any>, context: ClassMethodDecoratorContext<BaseVoiceModule>) {
        async function replacementMethod(this: BaseVoiceModule, ...args: ClientEvents[Event]) {
            // console.log(thisArg)
            let self = thisArg || this
            if (!self.isOnWorker) {
                await self.messenger.emitWithAck("callRemoteFunction", [], {
                    functionName: originalMethod.name,
                    args: args,
                })
            }
            else return await originalMethod.call(thisArg || this, ...args)
        }
        return replacementMethod
    }
    return decorator
}
