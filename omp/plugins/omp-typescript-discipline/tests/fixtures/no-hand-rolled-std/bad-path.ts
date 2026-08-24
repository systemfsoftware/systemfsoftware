const dir = '/tmp'
const name = 'file.txt'
const p = dir + '/' + name
const p2 = dir + '/' + name
const segments = p.split('/')
const combined = segments.join('/')
