export function flatten<T>(i: Iterable<T[]>) {
    return Array.from(i).flat(1)
}