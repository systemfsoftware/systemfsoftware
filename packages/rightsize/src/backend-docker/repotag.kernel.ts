/**
 * Pure repository/tag splitting for image references (behavioral reference:
 * upstream rightsize-node `src/backend-docker/backend.ts` `splitRepoTag` at
 * the fork point, Apache-2.0).
 *
 * The Engine API splits an image reference into `fromImage` + `tag` query
 * parameters on `POST /images/create` and into `repo` + `tag` on `POST
 * /commit`. A tag-less reference defaults to `latest`, matching Docker's own
 * convention; a digest reference (`image@sha256:…`) skips tag splitting
 * entirely because a digest names the image on its own. The tag separator is
 * the LAST colon after the last slash, so a registry host:port prefix
 * (`localhost:5000/redis`) is never mistaken for one.
 *
 * Pure: reference string in, `[repository, tag]` out.
 *
 * @since 0.1.0
 */

/** `image` split into `[repository, tag]`; a digest reference yields `[image, '']`. */
export const splitRepoTag = (image: string): [string, string] => {
  if (image.includes('@')) {
    return [image, '']
  }
  // The tag separator is the LAST colon after the last slash, so a registry
  // host:port prefix (`localhost:5000/redis`) isn't mistaken for one.
  const slashIdx = image.lastIndexOf('/') + 1
  const relColon = image.slice(slashIdx).lastIndexOf(':')
  if (relColon === -1) {
    return [image, 'latest']
  }
  const colon = slashIdx + relColon
  return [image.slice(0, colon), image.slice(colon + 1)]
}
