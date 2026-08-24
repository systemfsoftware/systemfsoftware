const a = new Uint8Array([1, 2, 3])
const out = new Uint8Array(a.length)
for (let i = 0; i < a.length; i++) {
  out[i] = a[i]
}
const b = new Uint8Array([4, 5])
const concat = new Uint8Array(a.length + b.length)
for (let i = 0; i < a.length; i++) concat[i] = a[i]
for (let i = 0; i < b.length; i++) concat[a.length + i] = b[i]
