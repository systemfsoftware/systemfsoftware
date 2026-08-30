## 3.0.0

### Major Changes

- The instrumenter parses and prints with oxc and a bundled ESTree printer; all Babel packages are gone. The instrumenter options no longer accept a `plugins` list (oxc parses modern JS/TS, JSX, and decorators natively), the instrumentation header export is named `instrumentationHeader`, and the script transformer is named `transformScript`.
