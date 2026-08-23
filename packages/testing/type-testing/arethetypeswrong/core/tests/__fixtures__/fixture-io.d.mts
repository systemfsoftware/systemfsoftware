/** List the entry names directly inside a directory URL. */
export declare const listDirectory: (dirUrl: URL) => string[]

/** Read a file as raw bytes. */
export declare const readBytes: (fileUrl: URL) => Uint8Array
