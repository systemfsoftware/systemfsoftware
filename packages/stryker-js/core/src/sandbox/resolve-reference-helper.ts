export function resolveProjectReferencePath(ref: { path: string }): string {
  return ref.path.endsWith('.json') ? ref.path : `${ref.path}/tsconfig.json`;
}
