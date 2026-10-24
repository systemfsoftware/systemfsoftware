import { Layer, type LayerMap } from './layers.schema.ts'

export interface Assignment {
  readonly package: string
  readonly category: Layer
}

export const assignments = (map: LayerMap): readonly Assignment[] =>
  Layer.literals.flatMap((category) => map[category].toSorted().map((name) => ({ package: name, category })))
