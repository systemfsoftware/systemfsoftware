export type SqlStorageValue = ArrayBuffer | string | number | null

export type SqlRow = Readonly<Record<string, SqlStorageValue>>

export interface SqlCursor {
  toArray(): ReadonlyArray<SqlRow>
}

export interface SqlStorage {
  exec(query: string): SqlCursor
}

export interface DurableObjectStorage {
  readonly sql: SqlStorage
  transactionSync<T>(callback: () => T): T
}
