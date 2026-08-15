/**
 * Everything a fixture needs to become a real project on disk.
 *
 * The optional members exist because a consumer's own setup is part of what a
 * rule has to survive. Program membership and compiler settings are not fixture
 * details to be assumed away — they decide which files a rule ever sees, and
 * whether an import that exists only to support a citation is legal at all.
 */
export interface ICreateProjectProps {
  /** Distinguishes temp directories in a failure report. */
  readonly name: string;

  /** File map, project-relative. Values are written verbatim. */
  readonly files: Readonly<Record<string, string>>;

  /**
   * File map relative to the directory the project sits inside.
   *
   * Where a shared document set, a sibling package's schema, or a generated
   * OpenAPI document goes. A population reaches these through its declared
   * `root`, or a Swagger reference through an ancestor-relative `file` — which
   * is behavior no project-relative fixture can exercise at all.
   */
  readonly workspaceFiles?: Readonly<Record<string, string>>;

  /** Complete `lint.config.ts` source, evaluated by the real config loader. */
  readonly lintConfig: string;

  /**
   * Overrides the generated `tsconfig.json` `include` array.
   *
   * Program membership is a real variable in a consumer's setup, not a fixture
   * detail: a file rule only ever sees what the project includes, so whether
   * `lint.config.ts` is linted at all depends on this array. The default keeps
   * the config file in the program.
   */
  readonly include?: readonly string[];

  /**
   * Extra `compilerOptions` merged over the generated defaults.
   *
   * A consumer's compiler settings are part of what a rule has to survive, not
   * a fixture detail: `noUnusedLocals` decides whether an import that exists
   * only to support a citation is legal at all.
   */
  readonly compilerOptions?: Readonly<Record<string, unknown>>;
}
