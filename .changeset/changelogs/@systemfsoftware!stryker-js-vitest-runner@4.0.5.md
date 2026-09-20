## 4.0.5

### Patch Changes

- Each package's published entry point now names its type declarations explicitly, so a type resolver reads them from the manifest rather than inferring the declaration file beside the JavaScript. Exported names, declarations and behaviour are otherwise unchanged.
