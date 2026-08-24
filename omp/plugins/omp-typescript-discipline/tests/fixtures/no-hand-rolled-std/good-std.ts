import { debounce, delay, pooledMap, retry } from 'jsr:@std/async'
import { concat, equals } from 'jsr:@std/bytes'
import { decodeBase64, encodeBase64, encodeHex } from 'jsr:@std/encoding'
import { join, relative } from 'jsr:@std/path'

const bytes = new TextEncoder().encode('hello')
const b64 = encodeBase64(bytes)
const back = decodeBase64(b64)
const hex = encodeHex(bytes)
await delay(100)
const debounced = debounce(() => {}, 200)
await retry(() => fetch('/api'), { minTimeout: 100 })
await pooledMap(4, [1, 2, 3], async (n) => n * 2)
const c = concat([bytes, back])
const p = join('/tmp', 'file.txt')
