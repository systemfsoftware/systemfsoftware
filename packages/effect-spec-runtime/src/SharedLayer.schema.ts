import { Schema } from 'effect'

export class SharedLayerNotBuilt extends Schema.TaggedError<SharedLayerNotBuilt, { readonly brand: unique symbol }>()(
  'SharedLayerNotBuilt',
  {},
) {
  override get message(): string {
    return 'A shared layer was read before its build ran'
  }
}
