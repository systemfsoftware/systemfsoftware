/**
 * Stable labels and package identities shared by performance benchmark
 * services.
 */
export namespace TtscBenchmarkPerformanceConstant {
  /** Dashboard label for the fixture corpus's supported legacy TypeScript. */
  export const LEGACY_TYPESCRIPT_DISPLAY_VERSION = "v6.0.3";

  /** Complete set of platform packages that stale fixture state may contain. */
  export const PLATFORM_PACKAGES: ReadonlySet<string> = new Set([
    "@ttsc/linux-x64",
    "@ttsc/linux-arm",
    "@ttsc/linux-arm64",
    "@ttsc/darwin-x64",
    "@ttsc/darwin-arm64",
    "@ttsc/win32-x64",
    "@ttsc/win32-arm64",
  ]);
}
