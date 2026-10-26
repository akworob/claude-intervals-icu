import type { DayLoad, Ride, Snapshot, Workout } from '../types'

export const API = 'https://intervals.icu/api/v1'

// The same file run-mcp.sh sources for the MCP server, relative to $HOME.
export const CREDENTIALS = '.config/intervals-icu/credentials.env'

export type Credentials = { apiKey: string; athleteId: string }

type Row = Record<string, unknown>

/** KEY=value lines of credentials.env; null until both values are filled in. */
export function parseCredentials(text: string): Credentials | null {
  const values: Record<string, string> = {}
  for (const line of text.split('\n')) {
    const [, key, value] = /^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/.exec(line) ?? []
    if (key) values[key] = (value ?? '').replace(/^["']|["']$/g, '')
  }
  const apiKey = values.INTERVALS_ICU_API_KEY ?? ''
  const athleteId = values.INTERVALS_ICU_ATHLETE_ID ?? ''

  return apiKey && athleteId ? { apiKey, athleteId } : null
}

/** YYYY-MM-DD of `ms` in the host's local time, shifted by `offsetDays`. */
export function localDate(ms: number, offsetDays = 0): string {
  const day = new Date(ms)
  day.setDate(day.getDate() + offsetDays)
  const pad = (n: number) => String(n).padStart(2, '0')

  return `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`
}

export type Zone = { label: string; color: 'error' | 'success' | 'subtle' | 'suggestion' }

/**
 * Friel's form zones on form as a percentage of fitness, the way the
 * intervals.icu fitness chart bands them. Transition (very fresh) is not split
 * from Fresh: its threshold could not be confirmed.
 */
export function formZone(formPercent: number): Zone {
  if (formPercent < -30) return { label: 'Wysokie ryzyko', color: 'error' }
  if (formPercent < -10) return { label: 'Optymalna', color: 'success' }
  if (formPercent <= 5) return { label: 'Szara strefa', color: 'subtle' }

  return { label: 'Świeżość', color: 'suggestion' }
}

const num = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null

const str = (value: unknown): string => (typeof value === 'string' ? value : '')

const rows = (value: unknown): Row[] =>
  Array.isArray(value) ? value.filter((one): one is Row => typeof one === 'object' && one !== null) : []

const minutes = (seconds: unknown): number | null => {
  const s = num(seconds)
  return s === null ? null : Math.round(s / 60)
}

const PLANNED = new Set(['WORKOUT', 'RACE_A', 'RACE_B', 'RACE_C'])

/** One pane's worth of data from the wellness, events and activities responses. */
export function buildSnapshot(input: {
  fetchedAt: number
  today: string
  wellness: unknown
  events: unknown
  activities: unknown
}): Snapshot {
  const { fetchedAt, today } = input

  const days: DayLoad[] = rows(input.wellness)
    .map(row => ({ date: str(row.id), ctl: num(row.ctl), atl: num(row.atl) }))
    .filter(day => day.date !== '' && day.date <= today && day.ctl !== null && day.atl !== null)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(day => ({ date: day.date, ctl: day.ctl!, atl: day.atl!, tsb: day.ctl! - day.atl! }))
    .slice(-7)

  const latest = days.at(-1) ?? null
  const latestRow = rows(input.wellness).find(row => str(row.id) === latest?.date)

  const workouts: Workout[] = rows(input.events)
    .filter(row => PLANNED.has(str(row.category)) && str(row.start_date_local).startsWith(today))
    .map(row => ({
      name: str(row.name) || 'Trening bez nazwy',
      kind: str(row.category).startsWith('RACE') ? `Start ${str(row.category).slice(5)}` : str(row.type),
      minutes: minutes(row.moving_time),
      load: num(row.icu_training_load),
      description: str(row.description).trim().split('\n').slice(0, 15).join('\n'),
    }))

  // Ride, GravelRide, VirtualRide, MountainBikeRide, EBikeRide...; a daily Pilates must not hide the last ride.
  // Strava-synced activities come back without a type, so they are not counted.
  const ride = rows(input.activities)
    .filter(row => str(row.start_date_local) !== '' && str(row.type).includes('Ride'))
    .sort((a, b) => str(b.start_date_local).localeCompare(str(a.start_date_local)))[0]

  const lastRide: Ride | null = ride
    ? {
        name: str(ride.name) || 'Jazda',
        date: str(ride.start_date_local).slice(0, 10),
        kind: str(ride.type),
        minutes: minutes(ride.moving_time),
        km: num(ride.distance) === null ? null : Math.round(num(ride.distance)! / 100) / 10,
        load: num(ride.icu_training_load),
        normalizedWatts: num(ride.icu_weighted_avg_watts),
        avgHr: num(ride.average_heartrate),
      }
    : null

  return {
    fetchedAt,
    today,
    ctl: latest?.ctl ?? null,
    atl: latest?.atl ?? null,
    tsb: latest?.tsb ?? null,
    formPercent: latest && latest.ctl > 0 ? (latest.tsb / latest.ctl) * 100 : null,
    rampRate: num(latestRow?.rampRate),
    days,
    workouts,
    lastRide,
  }
}

/** 95 -> "1 h 35 min", 40 -> "40 min". */
export function duration(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  return h > 0 ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min`
}

/** One decimal with an explicit sign, e.g. "+3.1", "-7.7". */
export function signed(value: number): string {
  const rounded = Math.round(value * 10) / 10
  return `${rounded > 0 ? '+' : ''}${rounded.toFixed(1)}`
}
