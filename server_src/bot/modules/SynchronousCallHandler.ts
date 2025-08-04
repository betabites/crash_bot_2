export class SynchronousCallHandler {
    #pendingSynchronousCalls: (() => Promise<void>)[] = []
    #processingSynchronousCall: boolean = false

    /**
     * If an synchronous task is already processing, place the new task in a queue. Otherwise, start the queue handler
     * and process that item.
     * @param call
     */
    async _startSynchronousCall(call: () => Promise<void>) {
        if (this.#processingSynchronousCall) {
            this.#pendingSynchronousCalls.push(call)
        } else {
            this.#processingSynchronousCall = true
            await call().catch(console.error)
            for (
                let item = this.#pendingSynchronousCalls.shift();
                item;
                item = this.#pendingSynchronousCalls.shift()
            ) {
                await item().catch(console.error)
            }
            this.#processingSynchronousCall = false
        }
    }
}

/**
 * Only one synchronous task per module is ever executed at a given time. All other synchronous calls must queue.
 * @constructor
 * @param originalMethod
 * @param context
 */
export function Synchronous<ARGS extends any[], RESULT extends any>(
    originalMethod: (...args: ARGS) => Promise<RESULT>,
    context: ClassMethodDecoratorContext<SynchronousCallHandler>
) {
    function replacementFunction(this: SynchronousCallHandler, ...args: ARGS) {
        originalMethod.bind(this)
        const obj = this

        return new Promise<RESULT>((resolve, reject) => {
            const call = () => originalMethod.call(obj, ...args).then(resolve).catch(reject)
            void this._startSynchronousCall(call)
        })
    }

    return replacementFunction
}