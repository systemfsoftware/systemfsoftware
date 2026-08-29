function logged(value: unknown, context: ClassDecoratorContext): void {}
function bound(_value: unknown, _context: ClassFieldDecoratorContext): void {}

@logged
class Counter {
  @bound
  accessor value = 0
  @bound
  increment(): void {
    this.value++
  }
  static {
    // static block
  }
}
export { Counter }
