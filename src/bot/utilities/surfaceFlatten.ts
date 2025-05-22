export function surfaceFlatten<T>(i: Iterable<T>) {
    return flatten(i, 1)
}
export function flatten<T, DEPTH extends number>(i: Iterable<T>, depth: DEPTH) {
    return Array.from(i).flat(depth)
}