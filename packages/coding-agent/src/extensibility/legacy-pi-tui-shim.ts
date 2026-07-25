/**
 * Compatibility shim for legacy extensions importing the package root of
 * `@earendil-works/pi-tui` or `@mariozechner/pi-tui`.
 *
 * The historical root exported `decodeKittyPrintable`; the canonical TUI now
 * exposes the equivalent, broader `decodePrintableKey` helper. Keep the legacy
 * name available without reintroducing it into the canonical package surface.
 */
export * from "@oh-my-pi/pi-tui";
export { decodePrintableKey as decodeKittyPrintable } from "@oh-my-pi/pi-tui";
