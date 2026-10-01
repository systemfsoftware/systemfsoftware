## 5.0.0

### Major Changes

- Rules recognize effect 4.0.0 module paths: `effect/Arbitrary` (and the root `Arbitrary` name), `effect/process/ChildProcessSpawner`, and the `effect/encoding` codecs. A module is judged the same whether it is imported from `effect`, from an `effect/<area>` barrel, or by its own subpath. `schema-file-imports-pure-modules-only` admits `Base64`, `Base64Url`, `Hex` and `EncodingError` from `effect/encoding` in place of the removed `Encoding` module.

- Require `effect` `^4` (stable 4.0.0). Release candidates are no longer supported: imports follow 4.0.0's module layout (`effect/http`, `effect/rpc`, `effect/http-api`, `effect/cluster`, `effect/process`, `effect/socket`, `effect/persistence`, `effect/reactivity`, `effect/encoding`, `effect/Arbitrary`), which does not exist in any 4.0.0 RC.
