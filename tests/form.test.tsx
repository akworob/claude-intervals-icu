import { expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

import { buildSnapshot, formZone, parseCredentials } from '../hooks/intervals'

const PANE = {
  plugin: 'intervals-form',
  component: 'Pane',
  requestId: 'intervals-form',
  props: {
    title: 'Forma · intervals.icu',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

// Midday UTC, so the host's local date is 2026-10-26 in any time zone the test runs in.
const NOW = Date.UTC(2026, 9, 26, 12, 0)
const KEY = 'test-key-123'

const API_ROWS: Record<string, unknown[]> = {
  '/wellness': [
    { id: '2026-10-24', ctl: 58, atl: 61, rampRate: 2.4 },
    { id: '2026-10-25', ctl: 59, atl: 66, rampRate: 2.9 },
    { id: '2026-10-26', ctl: 60, atl: 70, rampRate: 3.1 },
    { id: '2026-10-27', ctl: 59.5, atl: 64, rampRate: 3.0 },
  ],
  '/events': [
    {
      category: 'WORKOUT',
      start_date_local: '2026-10-26T00:00:00',
      name: 'Sweet Spot 3x15',
      type: 'Ride',
      moving_time: 4500,
      icu_training_load: 85,
      description: '- 15m 60%\n3x\n- 15m 90%\n- 5m 55%',
    },
    { category: 'NOTE', start_date_local: '2026-10-26T00:00:00', name: 'Massage' },
  ],
  '/activities': [
    { start_date_local: '2026-10-24T09:00:00', name: 'Old ride', type: 'Ride' },
    {
      start_date_local: '2026-10-25T08:30:00',
      name: 'Gravel loop',
      type: 'GravelRide',
      moving_time: 5520,
      distance: 45230,
      icu_training_load: 88,
      icu_weighted_avg_watts: 231,
      average_heartrate: 142.4,
    },
    { start_date_local: '2026-10-26T07:19:00', name: 'Pilates', type: 'Pilates', moving_time: 2880 },
  ],
}

const RUN = {
  command: 'forma',
  args: '',
  origin: { kind: 'composer' },
  presentation: { isFullscreen: false, columns: 80 },
} as const

function engine(on: Parameters<TestBody>[1], credentials: string, seen: string[]) {
  on('env.get', () => ({ value: '/Users/rider' }))
  on('fs.read', () => ({ value: credentials }))
  on('command.register', () => ({ value: { command: 'forma' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  const clock = mock.clock(on, { now: NOW })
  on('http.fetch', (_, e) => {
    seen.push(e.url)
    const auth = e.init?.headers?.Authorization
    if (auth !== `Basic ${btoa(`API_KEY:${KEY}`)}`) {
      return { value: { status: 401, ok: false, headers: {}, text: '' } }
    }
    const path = Object.keys(API_ROWS).find(one => e.url.includes(`/athlete/i42${one}?`))

    return { value: { status: 200, ok: true, headers: {}, text: JSON.stringify(path ? API_ROWS[path] : []) } }
  })

  return clock
}

test('/forma shows form, today\'s workout and the last ride, on every surface', async ($, on) => {
  const seen: string[] = []
  const clock = engine(on, `# comment\nINTERVALS_ICU_API_KEY=${KEY}\nINTERVALS_ICU_ATHLETE_ID=i42\n`, seen)

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run(RUN)
  await clock.settle()

  expect(seen.some(url => url.includes('/wellness?oldest=2026-10-18&newest=2026-10-27'))).toBe(true)

  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })

    expect((await ui.find({ type: 'Text', text: /Optymalna/ }))?.text).toBe('-10.0 (-17%) · Optymalna')
    expect((await ui.find({ type: 'Text', text: /^60\.0$/ }))?.text).toBe('60.0')
    expect((await ui.find({ type: 'Text', text: /Ramp/ }))?.text).toBe('Ramp rate')
    expect((await ui.find({ type: 'Text', text: /Sweet Spot/ }))?.text).toBe('Sweet Spot 3x15')
    expect((await ui.find({ type: 'Text', text: /obciążenie 85/ }))?.text).toBe('Ride · 1 h 15 min · obciążenie 85')
    expect(await ui.find({ type: 'Text', text: /Massage/ })).toBeUndefined()
    expect((await ui.find({ type: 'Text', text: /^2026-10-25 · Gravel/ }))?.text).toBe(
      '2026-10-25 · GravelRide · 1 h 32 min · 45.2 km · obciążenie 88 · NP 231 W · HR 142',
    )
    await ui.unmount()
  }
})

test('empty credentials say where to put the key and call no API', async ($, on) => {
  const seen: string[] = []
  const clock = engine(on, 'INTERVALS_ICU_API_KEY=\nINTERVALS_ICU_ATHLETE_ID=\n', seen)

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run(RUN)
  await clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /Uzupełnij/ }))?.text).toBe(
    'Uzupełnij klucz API i Athlete ID w ~/.config/intervals-icu/credentials.env',
  )
  expect(seen).toEqual([])
  await ui.unmount()
})

test('a refused key is reported, not shown as empty data', async ($, on) => {
  const clock = engine(on, 'INTERVALS_ICU_API_KEY=wrong\nINTERVALS_ICU_ATHLETE_ID=i42\n', [])

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run(RUN)
  await clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /odrzuciło/ }))?.text).toBe(
    'intervals.icu odrzuciło klucz API albo Athlete ID',
  )
  await ui.unmount()
})

test('form zones follow form as a percentage of fitness', () => {
  expect(formZone(-31).label).toBe('Wysokie ryzyko')
  expect(formZone(-30).label).toBe('Optymalna')
  expect(formZone(-10.5).label).toBe('Optymalna')
  expect(formZone(-10).label).toBe('Szara strefa')
  expect(formZone(5).label).toBe('Szara strefa')
  expect(formZone(5.1).label).toBe('Świeżość')
})

test('credentials parse with quotes and stay null while half empty', () => {
  expect(parseCredentials('INTERVALS_ICU_API_KEY="k"\nINTERVALS_ICU_ATHLETE_ID=i1')).toEqual({ apiKey: 'k', athleteId: 'i1' })
  expect(parseCredentials('INTERVALS_ICU_API_KEY=k\nINTERVALS_ICU_ATHLETE_ID=')).toBeNull()
})

test('the last ride skips newer non-ride activities and typeless Strava rows', () => {
  const snapshot = buildSnapshot({
    fetchedAt: NOW,
    today: '2026-10-26',
    wellness: [],
    events: [],
    activities: [
      { start_date_local: '2026-10-25T11:24:00', name: 'Ojców', type: 'Ride' },
      { start_date_local: '2026-10-26T07:19:00', name: 'Pilates', type: 'Pilates' },
      { start_date_local: '2026-10-26T09:00:00', source: 'STRAVA' },
    ],
  })
  expect(snapshot.lastRide?.name).toBe('Ojców')
  expect(snapshot.tsb).toBeNull()
})
