/** A run's start instant and the markers its stages set. Internal. */
import * as Clock from 'effect/Clock'
import * as Effect from 'effect/Effect'

export interface Timer {
  readonly startedAt: number
  readonly markers: ReadonlyMap<string, number>
}

export const makeTimer: Effect.Effect<Timer> = Effect.map(Clock.currentTimeMillis, (startedAt) => ({
  startedAt,
  markers: new Map<string, number>(),
}))

export const markTimer = (timer: Timer, name: string, at: number): Timer => {
  const next = new Map(timer.markers)
  next.set(name, at)
  return {
    startedAt: timer.startedAt,
    markers: next,
  }
}

export const elapsedMs = (timer: Timer, now: number, sinceMarker?: string): number => {
  const marker = sinceMarker !== undefined ? timer.markers.get(sinceMarker) : undefined
  if (marker !== undefined) {
    return now - marker
  }
  return now - timer.startedAt
}

export const elapsedSeconds = (timer: Timer, now: number, sinceMarker?: string): number =>
  Math.floor(elapsedMs(timer, now, sinceMarker) / 1000)

export const humanReadableElapsed = (timer: Timer, now: number, sinceMarker?: string): string => {
  const seconds = elapsedSeconds(timer, now, sinceMarker)
  return new Intl.ListFormat('en').format(
    [humanReadableElapsedMinutes(seconds), humanReadableElapsedSeconds(seconds)].filter(Boolean),
  )
}

const humanReadableElapsedSeconds = (elapsedSecondsValue: number): string => {
  const restSeconds = elapsedSecondsValue % 60
  return formatTime('second', restSeconds)
}

const humanReadableElapsedMinutes = (elapsedSecondsValue: number): string => {
  const elapsedMinutes = Math.floor(elapsedSecondsValue / 60)
  if (elapsedMinutes === 0) {
    return ''
  }
  return formatTime('minute', elapsedMinutes)
}

const formatTime = (word: 'minute' | 'second', elapsed: number): string =>
  elapsed.toLocaleString('en', {
    unit: word,
    style: 'unit',
    unitDisplay: 'long',
  })
