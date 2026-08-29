async function withResources(): Promise<void> {
  using file = openFile('data.txt')
  await using _conn = openConnection()
  {
    using a = getA(), b = getB()
    console.log(a, b)
  }
  for (using x of getItems()) {
    console.log(x)
  }
}
declare function openFile(path: string): Disposable
declare function openConnection(): Promise<AsyncDisposable>
declare function getA(): Disposable
declare function getB(): Disposable
declare function getItems(): Iterable<Disposable>
export { withResources }
