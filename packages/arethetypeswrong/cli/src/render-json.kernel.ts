export const renderJson = (
  value: unknown,
  options: { readonly pretty: boolean } = { pretty: true },
): string => {
  if (options.pretty) {
    return JSON.stringify(value, null, 2)
  }
  return JSON.stringify(value)
}
