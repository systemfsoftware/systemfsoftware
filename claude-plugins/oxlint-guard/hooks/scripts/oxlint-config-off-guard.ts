import { isEditTool, isOxlintConfig, parseHookInput } from "../lib/input.ts";

type Verdict =
  | { kind: "exit0" }
  | { kind: "exit2"; message: string };

const RESOLVER_EXIT = 1;

declare const Deno: {
  stdin: { readable: ReadableStream<Uint8Array> };
  exit(code: number): never;
  stat(path: string): Promise<{ isFile: boolean; isSymlink: boolean }>;
  readTextFile(path: string): Promise<string>;
  writeTextFile(path: string, content: string): Promise<void>;
};

const OFF_DIRECTIVE_PATTERNS: RegExp[] = [
  /:\s*["']?off\b/,
  /\bdisable[_-]?next[_-]?line\b/i,
  /\boxlint-disable(?:-next-line)?\b/,
  /\b(?:rules|categories|plugins)\s*:\s*\{\s*\}/,
  /\bremoveConfig\b/,
];

const TS_MODULE_RE = /\.(?:ts|tsx|js|jsx|mts|mjs|cts|cjs)$/;
const JSON_CONFIG_RE = /(?:^|\/)(?:oxlint\.json|\.oxlintrc\.json)$/;

interface DetectArgs {
  toolName: string;
  filePath: string;
  content: string;
  oldString: string | null;
  newString: string | null;
}

export function detectConfigWeakening({
  toolName,
  filePath,
  content,
  oldString,
  newString,
}: DetectArgs): { weaken: boolean; reason: string } {
  if (!isEditTool(toolName)) return { weaken: false, reason: "" };
  if (filePath === "") return { weaken: false, reason: "" };
  if (!isOxlintConfig(filePath)) return { weaken: false, reason: "" };

  if (oldString !== null && newString !== null) {
    for (const re of OFF_DIRECTIVE_PATTERNS) {
      if (re.test(newString) && !re.test(oldString)) {
        return {
          weaken: true,
          reason: `Patch adds a config-weakening directive (matched ${re.source}) to ${filePath}. The constitution forbids weakening the oxlint config.`,
        };
      }
    }
    return { weaken: false, reason: "" };
  }

  if (TS_MODULE_RE.test(filePath)) {
    if (!/\bdefineConfig\b/.test(content)) {
      return {
        weaken: true,
        reason:
          `${filePath} does not declare an oxlint \`defineConfig(...)` +
          `\` export. Add the missing export so the config is a real rule surface, not just any module.`,
      };
    }
    for (const re of OFF_DIRECTIVE_PATTERNS) {
      if (re.test(content)) {
        return {
          weaken: true,
          reason: `${filePath} contains a config-weakening directive (matched ${re.source}). The constitution forbids weakening the oxlint config.`,
        };
      }
    }
    return { weaken: false, reason: "" };
  }

  if (JSON_CONFIG_RE.test(filePath)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      return {
        weaken: true,
        reason: `${filePath} is not valid JSON. The oxlint config must be parseable, not a malformed stub.`,
      };
    }
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {
        weaken: true,
        reason:
          `${filePath} must be a JSON object (the oxlint config shape), not ${Array.isArray(parsed) ? "an array" : typeof parsed}.`,
      };
    }
    const obj = parsed as Record<string, unknown>;
    const categories = obj.categories;
    const rules = obj.rules;
    if (categories === undefined && rules === undefined) {
      return {
        weaken: true,
        reason:
          `${filePath} has neither \`categories\` nor \`rules\`. An empty oxlint config gives the edit a free pass; declare at least one.`,
      };
    }
    if (rules && typeof rules === "object") {
      for (const value of Object.values(rules as Record<string, unknown>)) {
        if (value === "off") {
          return {
            weaken: true,
            reason: `${filePath} disables at least one rule (\`"off"\`). The constitution forbids weakening the oxlint config.`,
          };
        }
      }
    }
    return { weaken: false, reason: "" };
  }

  return { weaken: false, reason: "" };
}

if ((import.meta as { main?: boolean }).main) {
  const raw = await new Response(Deno.stdin.readable).text();
  const { toolName, filePath } = parseHookInput(raw);
  let toolInput: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && "tool_input" in parsed) {
      const candidate = (parsed as Record<string, unknown>).tool_input;
      if (candidate && typeof candidate === "object") toolInput = candidate as Record<string, unknown>;
    }
  } catch {
    toolInput = {};
  }
  const content = typeof toolInput.content === "string" ? toolInput.content : "";
  const oldString = typeof toolInput.old_string === "string" ? toolInput.old_string : null;
  const newString = typeof toolInput.new_string === "string" ? toolInput.new_string : null;
  try {
    const verdict = detectConfigWeakening({ toolName, filePath, content, oldString, newString });
    if (verdict.weaken) {
      console.error(verdict.reason);
      Deno.exit(RESOLVER_EXIT);
    }
  } catch (err) {
    console.error(`oxlint-config-off-guard: unexpected error: ${(err as Error).message}`);
    Deno.exit(RESOLVER_EXIT);
  }
}