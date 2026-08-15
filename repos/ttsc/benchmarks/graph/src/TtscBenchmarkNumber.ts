/** Numeric parsing and aggregation helpers shared by benchmark runners. */
export namespace TtscBenchmarkNumber {
  /** Parses an integer option and rejects negative or fractional values. */
  export function parseNonNegative(value: string, label: string): number {
    const parsed: number = Number(value);
    if (Number.isInteger(parsed) === false || parsed < 0)
      throw new Error(`${label} must be a non-negative integer`);
    return parsed;
  }

  /** Parses an integer option and rejects zero, negative, or fractional values. */
  export function parsePositive(value: string, label: string): number {
    const parsed: number = parseNonNegative(value, label);
    if (parsed === 0) throw new Error(`${label} must be greater than zero`);
    return parsed;
  }

  /** Returns the median of a numeric sample, or zero for an empty sample. */
  export function median(values: readonly number[]): number {
    if (values.length === 0) return 0;
    const sorted: number[] = [...values].sort((x, y) => x - y);
    const middle: number = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? (sorted[middle - 1]! + sorted[middle]!) / 2
      : sorted[middle]!;
  }
}
