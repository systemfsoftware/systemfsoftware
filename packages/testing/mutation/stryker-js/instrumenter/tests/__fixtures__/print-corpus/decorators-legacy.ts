function sealed(constructor: Function): void {}
function readonly(_target: unknown, _key: string, descriptor: PropertyDescriptor): void {}

@sealed
class Greeter {
  @readonly
  greeting: string = 'hello'
  @readonly
  accessor count = 0
  @sealed
  greet(@readonly name: string): string {
    return `${this.greeting} ${name}`
  }
}
export { Greeter }
