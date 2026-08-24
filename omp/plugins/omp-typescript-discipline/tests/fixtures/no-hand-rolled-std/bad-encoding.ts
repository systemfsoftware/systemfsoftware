const data = 'hello'
const encoded = btoa(data)
const decoded = atob(encoded)
const buf = Buffer.from('abc', 'base64')
const str = buf.toString('base64')
const hex = data.charCodeAt(0).toString(16)
