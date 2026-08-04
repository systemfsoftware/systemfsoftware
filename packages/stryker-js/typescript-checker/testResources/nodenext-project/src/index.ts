import { evenOdd } from './util.js'

const numbers = [1, 2, 3, 4]

export const groupedWithEs2024ObjectGroupBy = Object.groupBy(numbers, evenOdd)
