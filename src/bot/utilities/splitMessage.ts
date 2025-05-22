export function splitMessage(message: string): string[] {
    let messages: string[] = []
    while (message.length > 0) {
        messages.push(message.slice(0, 2000))
        message = message.slice(2000, message.length)
    }
    console.log(messages)
    return messages
}