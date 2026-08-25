/**
 * Creates a URL to the page where a consumer can report a bug against this
 * project.
 *
 * The tracker is ours. The ported original addressed the upstream StrykerJS
 * repository, along with its label and issue-template parameters, so every bug
 * a consumer filed from a Stryker run arrived at a project that does not own
 * this code (`REPO-O1`) and prefilled a template that does not exist here.
 *
 * @param titleSuggestion The title to be prefilled in.
 */
export function strykerReportBugUrl(titleSuggestion: string): string {
  const title = encodeURIComponent(titleSuggestion)
  return `https://github.com/systemfsoftware/systemfsoftware/issues/new?title=${title}`
}
