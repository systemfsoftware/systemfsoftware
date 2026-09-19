import { assertEquals } from '@std/assert'
import { decidePhase } from './release-phase.ts'

Deno.test('unpublished versions publish only when no intents remain', () => {
  assertEquals(decidePhase(7, 0), 'publish')
})

Deno.test('pending intents open a version PR', () => {
  assertEquals(decidePhase(0, 3), 'version')
})

Deno.test('idle when nothing is owed and nothing is pending', () => {
  assertEquals(decidePhase(0, 0), 'none')
})

Deno.test('pending intents win over unpublished versions', () => {
  assertEquals(decidePhase(7, 3), 'version')
})
