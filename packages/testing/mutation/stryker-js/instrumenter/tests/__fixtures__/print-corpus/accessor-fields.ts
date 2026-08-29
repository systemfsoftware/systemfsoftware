class Point {
  accessor x = 0
  accessor y: number = 0
  static accessor origin: Point | null = null
  #private = 1
  private accessor _internal = 2
  accessor computed!: string
  get doubled(): number {
    return this.x * 2
  }
  set doubled(v: number) {
    this.x = v / 2
  }
}
export { Point }
