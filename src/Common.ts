export function makeid(length: number) {
    var result = '';
    var characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    var charactersLength = characters.length;
    for (var i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() *
            charactersLength));
    }
    return result;
}

export class QueueManager {
    items: any[] = [];
    private subqueues: subqueue[] = []
    private _stop = false
    private _started = false
    public auto_start = true
    constructor(subqueues = 4) {
        for (let i = 0; i < subqueues; i++) this.subqueues.push(new subqueue(this))
    }

    get started() {
        return this._started
    }

    get is_stopping() {
        return this._stop
    }

    pushToQueue(func: (...a: any[]) => Promise<any>, args: any[]) {
        console.log("New item added to queue")
        console.trace()
        this.items.push([func, args])
        if (!this.started && this.auto_start) this.start()
    }

    async start() {
        console.log("Queue started")
        this._started = true
        this._stop = false
        await Promise.all(this.subqueues.map(queue => queue.start()))
        this._started = false
        console.log("Queue finished")
    }

    stop() {
        this._stop = true
    }
}

class subqueue {
    private ParentQueue: QueueManager;
    constructor(ParentQueue: QueueManager) {
        this.ParentQueue = ParentQueue
    }

    start(): Promise<void> {
        return new Promise(async resolve => {
            while (this.ParentQueue.items.length > 0 && !this.ParentQueue.is_stopping) {
                let current_item = this.ParentQueue.items.splice(0, 1)[0]
                await current_item[0](...current_item[1])
                console.log("(" + this.ParentQueue.items.length + " items left to process)")
            }
            resolve()
        })
    }
}

export function ShuffleArray<T>(array: T[]): T[] {
    let curId = array.length;
    // There remain elements to shuffle
    while (0 !== curId) {
        // Pick a remaining element
        let randId = Math.floor(Math.random() * curId);
        curId -= 1;
        // Swap it with the current element.
        let tmp = array[curId];
        array[curId] = array[randId];
        array[randId] = tmp;
    }
    return array;
}

export async function wait(milliseconds: number): Promise<void> {
    return new Promise(resolve => {
        setTimeout(() => {
            resolve()
        }, milliseconds)
    })
}