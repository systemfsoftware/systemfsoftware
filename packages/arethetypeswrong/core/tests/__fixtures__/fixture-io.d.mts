/** List entries of a directory URL. */
export declare const listDirectory: (dirUrl: URL) => string[]

/** Read a file as raw bytes. */
export declare const readBytes: (fileUrl: URL) => Uint8Array

/** Read a text file as a UTF-8 string. */
export declare const readTextFile: (fileUrl: URL) => string

/** Write a text file, replacing any existing content. */
export declare const writeTextFile: (fileUrl: URL, text: string) => void

/** Whether a file exists at the URL. */
export declare const fileExists: (fileUrl: URL) => boolean

/** A process environment variable, or undefined when unset. */
export declare const readEnv: (name: string) => string | undefined

/** Parse a JSON document into a plain value. */
export declare const parseJson: (text: string) => unknown