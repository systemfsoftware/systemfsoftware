import type { Location, Position, schema } from '@systemfsoftware/stryker-js-plugin-api/core'
import type { OpenEndLocation } from 'mutation-testing-report-schema'

/**
 * Positions cross the report boundary in both directions, so both conversions
 * live here. They were split across two modules - the encode half beside the
 * result mapping, the decode half beside file selection - which put the two
 * halves of one correspondence out of each other's sight.
 *
 * Encoding adds one to each axis: a run counts lines and columns from zero, the
 * report schema counts from one.
 */
export const toSchemaPosition = (pos: Position): schema.Position => ({
  column: pos.column + 1,
  line: pos.line + 1,
})

export const toSchemaLocation = (location: Location): schema.Location => ({
  start: toSchemaPosition(location.start),
  end: toSchemaPosition(location.end),
})

/**
 * Decoding rebuilds the position from its two axes, dropping whatever else the
 * report carried on the object.
 */
function reportPositionToStrykerPosition({ line, column }: Position): Position {
  return { line, column }
}

export function reportOpenEndLocationToStrykerLocation({ start, end }: OpenEndLocation): OpenEndLocation {
  if (end === undefined) {
    return { start: reportPositionToStrykerPosition(start) }
  }
  return {
    start: reportPositionToStrykerPosition(start),
    end: reportPositionToStrykerPosition(end),
  }
}

export function reportLocationToStrykerLocation({ start, end }: Location): Location {
  return {
    start: reportPositionToStrykerPosition(start),
    end: reportPositionToStrykerPosition(end),
  }
}
