// The capture hook the storybook-testing rule cites; this fixture installs no capture library.
declare module '@storycap-testrun/browser' {
  export const screenshot: (page: unknown, context: unknown) => Promise<void>
}
