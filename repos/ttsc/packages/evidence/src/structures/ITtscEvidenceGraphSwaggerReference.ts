import type { ITtscEvidenceGraphReferenceBase } from "./ITtscEvidenceGraphReferenceBase";

/**
 * A population of Swagger or OpenAPI operations that the owning claim must
 * cite.
 *
 * Swagger references are evidence-only: an API operation can ground a
 * TypeScript or Markdown claim, but a Swagger document cannot host `@evidence`
 * declarations. Every operation under the normalized document's `paths` object
 * becomes one independent evidence unit.
 */
export interface ITtscEvidenceGraphSwaggerReference extends ITtscEvidenceGraphReferenceBase<"swagger"> {
  /**
   * Exact Swagger or OpenAPI document location.
   *
   * A location is either a local file path or an `http:`/`https:` URL. A local
   * path is resolved against the active `ttsc` project root and may name a JSON
   * or YAML document anywhere on the filesystem: inside the project
   * (`api/openapi.yaml`), above it (`../contracts/swagger.json`), or absolute
   * (`/srv/contracts/swagger.json`, `C:/contracts/swagger.json`). An OpenAPI
   * document is routinely generated somewhere with no relationship to the
   * project that consumes it, and the local form is the one an author can pin
   * and diff. A drive-relative Windows path such as `C:openapi.json` is
   * refused, because it resolves against whatever directory that drive
   * currently sits on rather than against a stable base.
   *
   * URLs are fetched while the project rule runs, so an unavailable remote
   * document fails the build instead of silently removing its operations from
   * the evidence graph.
   *
   * This value is an exact location, not a glob and not a directory. The
   * document is normalized through `@typia/utils` to `OpenApi.IDocument` before
   * its operations are indexed. Use a claim's `reference` array when it owes
   * separate coverage to more than one Swagger document.
   *
   * Operation targets use the whitespace-free `<METHOD>:<path>` form, such as
   * `POST:/members` or `GET:/members/{id}`.
   */
  file: string;
}
