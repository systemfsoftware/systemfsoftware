/** Runtime object guards shared by external JSON boundaries. */
export namespace TtscBenchmarkObject {
  /** Tests whether an optional value is present without changing its type. */
  export function isDefined<T>(input: T | undefined): input is T {
    return input !== undefined;
  }

  /** Tests whether an unknown value is a non-null, non-array object. */
  export function isRecord(input: unknown): input is Record<string, unknown> {
    return (
      typeof input === "object" &&
      input !== null &&
      Array.isArray(input) === false
    );
  }
}
