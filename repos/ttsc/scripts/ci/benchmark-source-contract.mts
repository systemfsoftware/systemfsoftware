import fs from "node:fs";
import path from "node:path";

/** Enforces the reusable-module and executable boundaries of benchmark source. */
export namespace TtscBenchmarkSourceContract {
  const EXPORT_PATTERN =
    /^export\s+(?:(?:abstract|async|declare)\s+)*(class|const|enum|function|interface|let|namespace|type|var)\s+([A-Za-z_$][\w$]*)/gm;
  const NAMESPACE_MEMBER_PATTERN =
    /^\s+export\s+(?:(?:abstract|async|declare)\s+)*(class|const|enum|function|interface|let|namespace|type|var)\s+([A-Za-z_$][\w$]*)/gm;
  const CLASS_PUBLIC_MEMBER_PATTERN =
    /^\s+public\s+(?:(?:abstract|async|get|readonly|set|static)\s+)*(constructor|[A-Za-z_$][\w$]*)\s*(?:<[^>{}]*>)?\s*\(/gm;
  const CLASS_PUBLIC_FIELD_PATTERN =
    /^\s+public\s+(?:(?:declare|readonly|static)\s+)*([A-Za-z_$][\w$]*)[!?]?\s*(?::|=)/gm;
  const CLASS_IMPLICIT_PUBLIC_MEMBER_PATTERN =
    /^  (?!(?:private|protected|public)\b)(?:(?:abstract|async|declare|get|readonly|set|static)\s+)*(constructor|[A-Za-z_$][\w$]*)[!?]?\s*(?:<[^>{}]*>)?\s*(?:\(|:|=)/gm;
  const TOP_LEVEL_PRIVATE_DECLARATION_PATTERN =
    /^(?:(?:abstract|async|declare)\s+)*(class|const|enum|function|interface|let|namespace|type|var)\b(?:\s+([A-Za-z_$][\w$]*))?/gm;
  const TOP_LEVEL_EXPORT_PATTERN = /^export\b/gm;
  const OPENING_BRACE = String.fromCharCode(123);
  const CLOSING_BRACE = String.fromCharCode(125);
  const OPENING_PARENTHESIS = "(";
  const CLOSING_PARENTHESIS = ")";
  const MAX_EXECUTABLE_LINES = 12;

  /**
   * Checks every TypeScript source below a benchmark source root.
   *
   * Executables must remain export-free short bootstraps, while reusable
   * modules expose one documented, filename-matched prefixed class, interface,
   * or namespace.
   *
   * @param sourceRoot Absolute benchmark TypeScript source directory.
   */
  export function main(sourceRoot: string): void {
    const files: string[] = collectTypeScriptFiles(sourceRoot);
    const failures: string[] = [];

    for (const file of files) {
      const source: string = fs.readFileSync(file, "utf8");
      const privateTopLevelDeclarations: RegExpMatchArray[] = Array.from(
        source.matchAll(TOP_LEVEL_PRIVATE_DECLARATION_PATTERN),
      );
      const topLevelExports: RegExpMatchArray[] = Array.from(
        source.matchAll(TOP_LEVEL_EXPORT_PATTERN),
      );
      const exports: { index: number; kind: string; name: string }[] =
        Array.from(
          source.matchAll(EXPORT_PATTERN),
          (
            match: RegExpMatchArray,
          ): { index: number; kind: string; name: string } => ({
            index: match.index ?? 0,
            kind: match[1]!,
            name: match[2]!,
          }),
        );

      const relative: string = path.relative(sourceRoot, file);
      const executable: boolean =
        relative === "executable" ||
        relative.startsWith(`executable${path.sep}`);
      if (executable) {
        failures.push(...checkExecutableBootstrap(relative, source));
        if (topLevelExports.length !== 0)
          failures.push(
            `${relative}: executable entrypoints must not export reusable symbols`,
          );
        continue;
      }
      if (topLevelExports.length !== exports.length) {
        failures.push(
          `${relative}: every export must be one named class, interface, or namespace declaration`,
        );
      }
      for (const declaration of privateTopLevelDeclarations)
        failures.push(
          `${relative}: top-level ${declaration[1]} ${declaration[2] ?? "binding"} must belong to the exported class or namespace`,
        );
      if (exports.length === 0) {
        failures.push(
          `${relative}: reusable modules outside executable require one exported symbol`,
        );
        continue;
      }

      const names: Set<string> = new Set(exports.map((entry) => entry.name));
      if (names.size !== 1) {
        failures.push(
          `${relative}: expected one exported symbol, found ${[...names].join(
            ", ",
          )}`,
        );
        continue;
      }

      const exported = exports[0]!;
      const filename: string = path.basename(file, ".ts");
      if (filename !== exported.name)
        failures.push(
          `${relative}: filename must equal exported symbol ${exported.name}.ts`,
        );

      if (/^I?TtscBenchmark[A-Za-z0-9_$]*$/.test(exported.name) === false)
        failures.push(
          `${relative}: exported symbol ${exported.name} requires the TtscBenchmark or ITtscBenchmark prefix`,
        );

      for (const declaration of exports) {
        if (
          declaration.kind !== "class" &&
          declaration.kind !== "interface" &&
          declaration.kind !== "namespace"
        )
          failures.push(
            `${relative}: standalone export ${declaration.kind} ${declaration.name} is forbidden; expose executable members through a class or namespace`,
          );

        failures.push(
          ...checkLeadingJsDoc(
            relative,
            source,
            declaration.index,
            declaration.name,
          ),
        );
        if (declaration.kind === "class")
          failures.push(
            ...checkClassPublicMembers(relative, source, declaration.index),
          );
        else if (declaration.kind === "interface")
          failures.push(
            ...checkInterfaceFields(relative, source, declaration.index),
          );
        else if (declaration.kind === "namespace")
          failures.push(
            ...checkNamespaceMembers(relative, source, declaration.index),
          );
      }
    }

    if (failures.length !== 0) {
      for (const failure of failures) console.error(failure);
      process.exitCode = 1;
    } else {
      console.log(
        `Source contract passed for ${files.length} TypeScript files under ${path.relative(process.cwd(), sourceRoot)}.`,
      );
    }
  }

  function checkExecutableBootstrap(
    relative: string,
    source: string,
  ): string[] {
    const failures: string[] = [];
    const physicalLines: number = countPhysicalLines(source);
    if (physicalLines > MAX_EXECUTABLE_LINES)
      failures.push(
        `${relative}: executable bootstrap must not exceed ${MAX_EXECUTABLE_LINES} physical lines (found ${physicalLines})`,
      );

    let remaining: string = source.replace(/^#![^\r\n]*(?:\r\n|\r|\n|$)/, "");
    const importedNames: Set<string> = new Set();
    let importCount: number = 0;
    while (true) {
      const statement: RegExpExecArray | null =
        /^\s*import(?=\s|["'{*])[\s\S]*?;/.exec(remaining);
      if (statement === null) break;

      ++importCount;
      const namedImports: RegExpExecArray | null =
        /\{([\s\S]*?)\}\s*from\b/.exec(statement[0]);
      if (namedImports !== null)
        for (const binding of namedImports[1]!.split(",")) {
          const parsed: RegExpExecArray | null =
            /^(?:type\s+)?([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/.exec(
              binding.trim(),
            );
          if (parsed !== null) importedNames.add(parsed[2] ?? parsed[1]!);
        }
      remaining = remaining.slice(statement[0].length);
    }

    const callSource: string = remaining.trim();
    const call: RegExpExecArray | null =
      /^(?:await\s+)?(TtscBenchmark[A-Za-z0-9_$]*)\.main\s*\(/.exec(callSource);
    if (importCount !== 1 || importedNames.size !== 1)
      failures.push(
        `${relative}: executable bootstrap must import exactly one owning symbol`,
      );
    if (call === null) {
      failures.push(
        `${relative}: executable bootstrap must contain imports followed by one TtscBenchmark*.main(...) call`,
      );
      return failures;
    }

    const openingParenthesis: number = call[0].lastIndexOf(OPENING_PARENTHESIS);
    const closingParenthesis: number = findClosingParenthesis(
      callSource,
      openingParenthesis,
    );
    if (
      closingParenthesis === -1 ||
      callSource.slice(closingParenthesis + 1).trim() !== ";"
    )
      failures.push(
        `${relative}: executable bootstrap must contain imports followed by one TtscBenchmark*.main(...) call`,
      );

    const owner: string = call[1]!;
    if (importedNames.has(owner) === false)
      failures.push(
        `${relative}: executable bootstrap owner ${owner} must be a named import`,
      );
    return failures;
  }

  function countPhysicalLines(source: string): number {
    if (source.length === 0) return 0;
    const lines: string[] = source.split(/\r\n|\r|\n/);
    return lines[lines.length - 1] === "" ? lines.length - 1 : lines.length;
  }

  function checkClassPublicMembers(
    relative: string,
    source: string,
    exportIndex: number,
  ): string[] {
    const openingBrace: number = source.indexOf(OPENING_BRACE, exportIndex);
    if (openingBrace === -1)
      return [`${relative}: exported class has no opening brace`];
    const closingBrace: number = findClosingBrace(source, openingBrace);
    if (closingBrace === -1)
      return [`${relative}: exported class has no closing brace`];

    const body: string = source.slice(openingBrace + 1, closingBrace);
    const failures: string[] = [];
    for (const match of body.matchAll(CLASS_PUBLIC_MEMBER_PATTERN)) {
      const name: string = match[1]!;
      const index: number = openingBrace + 1 + (match.index ?? 0);
      failures.push(...checkLeadingJsDoc(relative, source, index, name));
    }
    for (const match of body.matchAll(CLASS_PUBLIC_FIELD_PATTERN)) {
      const name: string = match[1]!;
      const index: number = openingBrace + 1 + (match.index ?? 0);
      failures.push(...checkLeadingJsDoc(relative, source, index, name));
    }
    for (const match of body.matchAll(CLASS_IMPLICIT_PUBLIC_MEMBER_PATTERN)) {
      failures.push(
        `${relative}: class member ${match[1]} requires an explicit public, private, or protected modifier`,
      );
    }
    return failures;
  }

  function checkInterfaceFields(
    relative: string,
    source: string,
    exportIndex: number,
  ): string[] {
    const openingBrace: number = source.indexOf(OPENING_BRACE, exportIndex);
    if (openingBrace === -1)
      return [`${relative}: exported interface has no opening brace`];

    const closingBrace: number = findClosingBrace(source, openingBrace);
    if (closingBrace === -1)
      return [`${relative}: exported interface has no closing brace`];

    const lines: string[] = source
      .slice(openingBrace + 1, closingBrace)
      .split(/\r?\n/);
    const failures: string[] = [];
    for (let index: number = 0; index < lines.length; ++index) {
      const line: string = lines[index]!;
      const field: RegExpExecArray | null =
        /^\s+(?:readonly\s+)?([A-Za-z_$][\w$]*|\[[^\]]+\])\??\s*(?::|\()/.exec(
          line,
        );
      if (field === null) continue;

      let previous: number = index - 1;
      while (previous >= 0 && lines[previous]!.trim().length === 0) --previous;
      if (previous < 0 || lines[previous]!.trim().endsWith("*/") === false) {
        failures.push(`${relative}: field ${field[1]} requires leading JSDoc`);
        continue;
      }

      let commentStart: number = previous;
      while (
        commentStart >= 0 &&
        lines[commentStart]!.includes("/**") === false
      )
        --commentStart;
      if (commentStart < 0)
        failures.push(`${relative}: field ${field[1]} requires leading JSDoc`);
    }
    return failures;
  }

  function checkLeadingJsDoc(
    relative: string,
    source: string,
    index: number,
    symbol: string,
  ): string[] {
    const prefix: string = source.slice(0, index).trimEnd();
    return /\/\*\*[\s\S]*\*\/$/.test(prefix)
      ? []
      : [`${relative}: ${symbol} requires leading JSDoc`];
  }

  function checkNamespaceMembers(
    relative: string,
    source: string,
    exportIndex: number,
  ): string[] {
    const openingBrace: number = source.indexOf(OPENING_BRACE, exportIndex);
    if (openingBrace === -1)
      return [`${relative}: exported namespace has no opening brace`];
    const closingBrace: number = findClosingBrace(source, openingBrace);
    if (closingBrace === -1)
      return [`${relative}: exported namespace has no closing brace`];

    const body: string = source.slice(openingBrace + 1, closingBrace);
    const failures: string[] = [];
    for (const match of body.matchAll(NAMESPACE_MEMBER_PATTERN)) {
      const kind: string = match[1]!;
      const name: string = match[2]!;
      const index: number = openingBrace + 1 + (match.index ?? 0);
      failures.push(...checkLeadingJsDoc(relative, source, index, name));
      if (kind === "class")
        failures.push(...checkClassPublicMembers(relative, source, index));
      else if (kind === "interface")
        failures.push(...checkInterfaceFields(relative, source, index));
    }
    return failures;
  }

  function collectTypeScriptFiles(directory: string): string[] {
    return fs
      .readdirSync(directory, { withFileTypes: true })
      .flatMap((entry: fs.Dirent): string[] => {
        const target: string = path.join(directory, entry.name);
        if (entry.isDirectory()) return collectTypeScriptFiles(target);
        return entry.isFile() && entry.name.endsWith(".ts") ? [target] : [];
      })
      .sort();
  }

  function findClosingBrace(source: string, openingBrace: number): number {
    return findClosingDelimiter(
      source,
      openingBrace,
      OPENING_BRACE,
      CLOSING_BRACE,
    );
  }

  function findClosingDelimiter(
    source: string,
    openingIndex: number,
    openingCharacter: string,
    closingCharacter: string,
  ): number {
    let depth: number = 0;
    for (let index: number = openingIndex; index < source.length; ++index) {
      const character: string = source[index]!;
      if (character === "'" || character === '"') {
        index = skipQuotedLiteral(source, index, character);
        continue;
      }
      if (character === "`") {
        index = skipTemplateLiteral(source, index);
        continue;
      }
      if (character === "/" && source[index + 1] === "/") {
        index = skipLineComment(source, index);
        continue;
      }
      if (character === "/" && source[index + 1] === "*") {
        index = skipBlockComment(source, index);
        continue;
      }
      if (character === "/" && isRegexLiteralStart(source, index)) {
        index = skipRegexLiteral(source, index);
        continue;
      }
      if (character === openingCharacter) ++depth;
      else if (character === closingCharacter && --depth === 0) return index;
    }
    return -1;
  }

  function findClosingParenthesis(
    source: string,
    openingParenthesis: number,
  ): number {
    return findClosingDelimiter(
      source,
      openingParenthesis,
      OPENING_PARENTHESIS,
      CLOSING_PARENTHESIS,
    );
  }

  function isRegexLiteralStart(source: string, slashIndex: number): boolean {
    let previous: number = slashIndex - 1;
    while (previous >= 0 && /\s/.test(source[previous]!)) --previous;
    if (previous < 0) return true;
    if ("([{:;,=!?&|+-*%^~<>".includes(source[previous]!)) return true;

    const precedingWord: RegExpExecArray | null = /([A-Za-z_$][\w$]*)\s*$/.exec(
      source.slice(0, slashIndex),
    );
    return (
      precedingWord !== null &&
      /^(?:await|case|do|else|return|throw|yield)$/.test(precedingWord[1]!)
    );
  }

  function skipBlockComment(source: string, openingSlash: number): number {
    const closingSlash: number = source.indexOf("*/", openingSlash + 2);
    return closingSlash === -1 ? source.length - 1 : closingSlash + 1;
  }

  function skipLineComment(source: string, openingSlash: number): number {
    const newline: number = source.indexOf("\n", openingSlash + 2);
    return newline === -1 ? source.length - 1 : newline;
  }

  function skipQuotedLiteral(
    source: string,
    openingQuote: number,
    quote: string,
  ): number {
    for (let index: number = openingQuote + 1; index < source.length; ++index) {
      if (source[index] === "\\") ++index;
      else if (source[index] === quote) return index;
    }
    return source.length - 1;
  }

  function skipRegexLiteral(source: string, openingSlash: number): number {
    let characterClass: boolean = false;
    for (let index: number = openingSlash + 1; index < source.length; ++index) {
      if (source[index] === "\\") {
        ++index;
        continue;
      }
      if (source[index] === "[") characterClass = true;
      else if (source[index] === "]") characterClass = false;
      else if (source[index] === "/" && characterClass === false) return index;
    }
    return source.length - 1;
  }

  function skipTemplateLiteral(
    source: string,
    openingBacktick: number,
  ): number {
    for (
      let index: number = openingBacktick + 1;
      index < source.length;
      ++index
    ) {
      if (source[index] === "\\") {
        ++index;
        continue;
      }
      if (source[index] === "`") return index;
      if (source[index] === "$" && source[index + 1] === OPENING_BRACE) {
        const closingBrace: number = findClosingBrace(source, index + 1);
        if (closingBrace === -1) return source.length - 1;
        index = closingBrace;
      }
    }
    return source.length - 1;
  }
}

// The three benchmarks under `benchmarks/` differ in kind, and only these two
// are this repository's own harnesses written to the contract above.
// `benchmarks/evidence` is vendored from `samchon/lint-plugin-evidence` and
// keeps that project's conventions, so it is deliberately not checked here.
for (const harness of ["graph", "performance"])
  TtscBenchmarkSourceContract.main(
    path.resolve(import.meta.dirname, "..", "..", "benchmarks", harness, "src"),
  );
