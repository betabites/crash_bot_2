export function groupItemsWithMatchingNames<T>(items: T[], nameExtractor: (item: T) => string | number): Iterable<T[]> {
    let result: Map<string | number, T[]> = new Map()

    for (let item of items) {
        let name = nameExtractor(item)

        let matchingItems = result.get(name)
        if (matchingItems) {
            matchingItems.push(item)
            result.set(name, matchingItems)
        }
        else result.set(name, [item])
    }

    return result.values()
}