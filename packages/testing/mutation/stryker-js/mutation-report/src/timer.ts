export class Timer {
  private readonly start: Date
  constructor(private readonly now: () => Date = () => new Date()) {
    this.start = this.now()
  }
  public elapsedSeconds(): number {
    return Math.floor((this.now().getTime() - this.start.getTime()) / 1000)
  }
}
