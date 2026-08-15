/** Stable identity of the material files and Git baseline in a workspace. */
export interface ITtscEvidenceBenchmarkWorkspaceIdentity {
  /** Digest of every material workspace file. */
  materialSha256: string;

  /** Number of material workspace files included in the digest. */
  fileCount: number;

  /** Prepared workspace baseline commit. */
  gitHead: string;

  /** Exact Git status of the reviewed workspace. */
  gitStatus: string;
}
