/** Command-line parsing contracts shared by benchmark entrypoints. */
export namespace TtscBenchmarkCommandLine {
  /** Parsed named values, boolean flags, and positional arguments. */
  export interface IArguments {
    /** Named options that carry string values. */
    values: Record<string, string>;

    /** Boolean option tokens, including their leading `--`. */
    flags: Set<string>;

    /** Arguments that were not introduced by an option token. */
    positional: string[];
  }

  /** Declares how the parser interprets named options. */
  export interface IOptions {
    /** Option names whose repeated values are joined with commas. */
    repeatable?: readonly string[];

    /** Option names that consume the following argument as their value. */
    values?: readonly string[];
  }

  /** Parses GNU-style flags, named values, and positional input. */
  export function parse(
    arguments_: readonly string[],
    options: IOptions = {},
  ): IArguments {
    const repeatable: Set<string> = new Set(options.repeatable ?? []);
    const valueOptions: Set<string> = new Set(options.values ?? []);
    const output: IArguments = {
      values: {},
      flags: new Set<string>(),
      positional: [],
    };
    for (let index: number = 0; index < arguments_.length; ++index) {
      const argument: string = arguments_[index]!;
      if (argument.startsWith("--") === false) {
        output.positional.push(argument);
        continue;
      }
      const equals: number = argument.indexOf("=");
      if (equals !== -1) {
        const name: string = argument.slice(2, equals);
        const value: string = argument.slice(equals + 1);
        if (valueOptions.has(name) === true && value.length === 0)
          throw new Error(`--${name} requires a value`);
        assignValue(output.values, name, value, repeatable);
        continue;
      }
      const name: string = argument.slice(2);
      if (valueOptions.has(name) === true) {
        const value: string | undefined = arguments_[++index];
        if (value === undefined || value.startsWith("--"))
          throw new Error(`${argument} requires a value`);
        assignValue(output.values, name, value, repeatable);
      } else {
        output.flags.add(argument);
      }
    }
    return output;
  }

  /** Parses `--name=value` and `--name value` arguments into a string record. */
  export function parseKeyValue(
    arguments_: readonly string[],
  ): Record<string, string> {
    const output: Record<string, string> = {};
    for (let index: number = 0; index < arguments_.length; ++index) {
      const argument: string = arguments_[index]!;
      const match: RegExpExecArray | null = /^--([^=]+)=(.*)$/.exec(argument);
      if (match !== null) {
        output[match[1]!] = match[2]!;
        continue;
      }
      if (argument.startsWith("--") === false) continue;
      const value: string | undefined = arguments_[index + 1];
      if (value === undefined || value.startsWith("--")) continue;
      output[argument.slice(2)] = value;
      ++index;
    }
    return output;
  }

  /** Splits a comma-delimited option into its non-empty trimmed entries. */
  export function splitCommaSeparated(value: string): string[] {
    return value
      .split(",")
      .map((entry: string): string => entry.trim())
      .filter((entry: string): boolean => entry.length !== 0);
  }

  function assignValue(
    values: Record<string, string>,
    name: string,
    value: string,
    repeatable: ReadonlySet<string>,
  ): void {
    values[name] =
      repeatable.has(name) === true && values[name] !== undefined
        ? `${values[name]},${value}`
        : value;
  }
}
