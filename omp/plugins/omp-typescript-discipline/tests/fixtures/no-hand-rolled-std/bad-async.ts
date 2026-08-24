// bad-async: hand-rolled async primitives (intentional bad fixtures for TTSR test)
await new Promise(resolve => setTimeout(resolve, 100))
let t: ReturnType<typeof setTimeout>
function debounce(fn: () => void) {
  clearTimeout(t)
  t = setTimeout(fn, 200)
}
for (let i = 0; i < 3; i++) {
  try {
  } catch (e) {
    setTimeout(() => {}, 100)
  }
}
