import { describe, it } from '@effect/vitest'
import * as Arr from 'effect/Array'
import * as Option from 'effect/Option'
import * as Order from 'effect/Order'
import * as Result from 'effect/Result'
import { explodeBundle, ExplodeBundleCommand } from '../explode-bundle.workflow.js'

const signatureOf = (components: readonly { readonly sku: string; readonly quantity: number }[]): string =>
  Arr.join(
    Arr.sort(
      Arr.map(components, (component) => `${component.sku}#${component.quantity}`),
      Order.String,
    ),
    '|',
  )

const expectedSignature = (command: ExplodeBundleCommand): string =>
  signatureOf(
    Arr.flatMap(command.lines, (line) =>
      Option.match(Arr.findFirst(command.kits, (kit) => kit.kitSku === line.sku), {
        onNone: () => Arr.of({ sku: line.sku, quantity: line.quantity }),
        onSome: (kit) =>
          Arr.map(kit.components, (component) => ({
            sku: component.sku,
            quantity: component.quantity * line.quantity,
          })),
      })),
  )

describe('explodeBundle — conservation', () => {
  it.prop('∀c_ExplodeBundle_=Kits', [ExplodeBundleCommand], ([command]) =>
    Result.match(explodeBundle(command), {
      onFailure: () => false,
      onSuccess: (decision) => signatureOf(decision.components) === expectedSignature(command),
    }))
})
