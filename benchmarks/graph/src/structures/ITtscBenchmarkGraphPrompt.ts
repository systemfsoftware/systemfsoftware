/** Integrity-checked prompt definition in the graph benchmark manifest. */
export interface ITtscBenchmarkGraphPrompt {
  /** Stable prompt identifier used in reports and website cells. */
  id: string;

  /** Graph fixture project selected by the prompt. */
  repo: string;

  /** Tool-neutral prompt family rendered by the public benchmark. */
  family: ITtscBenchmarkGraphPrompt.Family;

  /** Prompt Markdown filename relative to the questions directory. */
  file: string;

  /** Fixture branch required by the prompt; graph benchmarks use `graph`. */
  fixtureBranch?: "graph";

  /** Project-relative tsconfig defining the indexed program. */
  tsconfig: string;

  /** SHA-256 digest of the exact prompt file bytes. */
  questionSha256: string;
}

/** Companion manifest and resolved-text contracts for a graph prompt. */
export namespace ITtscBenchmarkGraphPrompt {
  /** Tool-neutral graph prompt family rendered by the website. */
  export type Family = "common" | "dedicated";

  /** Versioned manifest of graph benchmark prompt definitions. */
  export interface IManifest {
    /** Manifest schema version understood by the runner. */
    schemaVersion: 1;

    /** Prompt definitions integrity checked when loaded. */
    prompts: ITtscBenchmarkGraphPrompt[];
  }

  /** Prompt definition paired with its verified question text. */
  export interface IResolved {
    /** Manifest entry that selected the prompt. */
    entry: ITtscBenchmarkGraphPrompt;

    /** Exact tool-neutral question sent to the measured agent. */
    text: string;

    /** SHA-256 digest recomputed from the loaded question bytes. */
    questionSha256: string;
  }
}
