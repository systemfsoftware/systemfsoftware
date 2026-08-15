import fs from "node:fs";
import path from "node:path";

/**
 * Lists the delivered requirement documents that declare at least one section.
 *
 * Every Markdown reference in both arms' graphs selects `h2` and `h3` under
 * `docs/analysis/`, so this is the set of documents that must contribute units.
 * Deriving it from the copied requirements is what lets a case assert that a
 * reference reached all of them without any expectation written down here: the
 * runner copies `benchmarks/evidence/requirements/<subject>/` byte-for-byte, so
 * the documents are whatever the frozen subject contains.
 *
 * Fenced blocks are skipped. A `##` inside a code fence is content, not a
 * heading, and counting one would make this report a document as owing units it
 * never declared — a false failure about the fixture rather than about the
 * graph.
 *
 * @param workspace Absolute path of the prepared workspace.
 * @returns Workspace-relative POSIX paths, sorted.
 */
export const requirementDocumentsDeclaringSections = (
  workspace: string,
): string[] => {
  const analysis: string = path.join(workspace, "docs", "analysis");
  const found: string[] = [];
  for (const file of walk(analysis)) {
    if (!declaresSection(fs.readFileSync(file, "utf8"))) continue;
    found.push(path.relative(workspace, file).split(path.sep).join("/"));
  }
  return found.sort((left, right) => left.localeCompare(right));
};

const declaresSection = (source: string): boolean => {
  let fenced: boolean = false;
  for (const line of source.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (!fenced && /^(##|###)\s+\S/.test(line)) return true;
  }
  return false;
};

const walk = (directory: string): string[] => {
  const found: string[] = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const location: string = path.join(directory, entry.name);
    if (entry.isDirectory()) found.push(...walk(location));
    else if (entry.isFile() && entry.name.endsWith(".md")) found.push(location);
  }
  return found;
};
