export function Names({ names }: { readonly names: readonly string[] }) {
  return <ul>{names.map((name, index) => <li key={index}>{name}</li>)}</ul>
}
