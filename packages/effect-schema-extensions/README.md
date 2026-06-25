# @systemfsoftware/effect-schema-extensions

Extra [Effect](https://effect.website) `Schema` codecs for hex strings.

Branded, decode/encode-ready schemas with generated arbitraries:

- **`HexString`** — a `0x`-prefixed hex string.
- **`PrefixedHex`** — prefixed hex with length constraints.
- **`StrictHex`** — bare hex (no prefix).
- **`ColonHex`** — colon-separated hex octets.

```ts
import { HexString } from '@systemfsoftware/effect-schema-extensions'
import { Schema as S } from 'effect'

const decode = S.decodeUnknownSync(HexString)
decode('0xdeadbeef') // branded HexString
```

## Install

```bash
pnpm add @systemfsoftware/effect-schema-extensions
```

> [!NOTE]
> `effect` is a peer dependency — you bring your own.
