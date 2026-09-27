## 1.3.0

### Minor Changes

- The config now enables `@systemfsoftware/effect-schema/schema-file-imports-pure-modules-only`: a schema file may value-import only pure modules, other schema files and `@systemfsoftware/*` packages. A decision may now call operations imported from a schema file. Move a reported import's code into a schema file, or out to the shell that calls it.
