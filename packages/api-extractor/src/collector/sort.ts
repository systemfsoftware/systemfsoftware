export const compareByValue = <T>(
  x: T | null | undefined,
  y: T | null | undefined,
): number => {
  if (x === y) {
    return 0
  }
  if (x === undefined) {
    return -1
  }
  if (y === undefined) {
    return 1
  }
  if (x === null) {
    return -1
  }
  if (y === null) {
    return 1
  }
  if (x < y) {
    return -1
  }
  if (leftGreaterThanRight(x, y)) {
    return 1
  }
  return 0
}

const leftGreaterThanRight = <T>(x: T, y: T): boolean => x > y

export const sortBy = <T, K>(
  array: T[],
  keySelector: (element: T) => K,
  comparer: (a: K, b: K) => number = compareByValue,
): void => {
  array.sort((a, b) => comparer(keySelector(a), keySelector(b)))
}

export const sortSet = <T>(
  set: Set<T>,
  comparer: (a: T, b: T) => number = compareByValue,
): void => {
  const array = Array.from(set)
  array.sort(comparer)
  set.clear()
  for (const item of array) {
    set.add(item)
  }
}
