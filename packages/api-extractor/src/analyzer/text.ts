const newLineRegExp = /\r\n|\r|\n/g

export const convertToLf = (input: string): string => input.replace(newLineRegExp, '\n')
