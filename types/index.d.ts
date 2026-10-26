export type DayLoad = { date: string; ctl: number; atl: number; tsb: number }

export type Workout = {
  name: string
  kind: string
  minutes: number | null
  load: number | null
  description: string
}

export type Ride = {
  name: string
  date: string
  kind: string
  minutes: number | null
  km: number | null
  load: number | null
  normalizedWatts: number | null
  avgHr: number | null
}

export type Snapshot = {
  fetchedAt: number
  today: string
  ctl: number | null
  atl: number | null
  tsb: number | null
  formPercent: number | null
  rampRate: number | null
  days: DayLoad[]
  workouts: Workout[]
  lastRide: Ride | null
}

declare module 'claude-code' {
  interface PluginState {
    'intervals-form': {
      snapshot: Snapshot | null
      error: string | null
      isLoading: boolean
    }
  }
}
