export function loaded<A>(value: A | null): A {
  if (value === null) throw new Error('expected settings to load, got null')
  return value
}
