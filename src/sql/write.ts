type Transaction = {}

const transactionStack: Transaction[] = []

export function write(callback: () => void) {
    let transaction: Transaction = {}
    transactionStack.push(transaction)

    try {
        callback()
    } catch(e) {
        throw e
    }

    transactionStack.pop()
}

export function appendTransactionJob() {

}
