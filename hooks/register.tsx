import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import {
  API,
  CREDENTIALS,
  buildSnapshot,
  duration,
  formZone,
  localDate,
  parseCredentials,
  signed,
} from './intervals'

const PANE = 'intervals-form'
const TITLE = 'Forma · intervals.icu'
const EVERY_MS = 30 * 60 * 1000

const snapshot = atom({ plugin: 'intervals-form', key: 'snapshot' } as const, null)
const error = atom({ plugin: 'intervals-form', key: 'error' } as const, null)
const isLoading = atom({ plugin: 'intervals-form', key: 'isLoading' } as const, false)

async function refresh($: EngineInterface): Promise<void> {
  await update($, isLoading, () => true)
  try {
    const home = await $.env.get('HOME')
    const creds = parseCredentials(String(await $.fs.read(`${home}/${CREDENTIALS}`)))
    if (!creds) {
      throw new Error(`Uzupełnij klucz API i Athlete ID w ~/${CREDENTIALS}`)
    }

    const fetchedAt = await $.clock.now()
    const today = localDate(fetchedAt)
    const tomorrow = localDate(fetchedAt, 1)
    const headers = { Authorization: `Basic ${btoa(`API_KEY:${creds.apiKey}`)}`, Accept: 'application/json' }
    const get = async (path: string, query: string): Promise<unknown> => {
      const res = await $.http.fetch(`${API}/athlete/${creds.athleteId}${path}?${query}`, { headers })
      if (res.status === 401 || res.status === 403) {
        throw new Error('intervals.icu odrzuciło klucz API albo Athlete ID')
      }
      if (!res.ok) {
        throw new Error(`intervals.icu odpowiedziało ${res.status} na ${path}`)
      }
      return JSON.parse(res.text) as unknown
    }

    // `newest` is tomorrow so the window holds today whether the API treats it as inclusive or not.
    const [wellness, events, activities] = await Promise.all([
      get('/wellness', `oldest=${localDate(fetchedAt, -8)}&newest=${tomorrow}`),
      get('/events', `oldest=${today}&newest=${tomorrow}`),
      get('/activities', `oldest=${localDate(fetchedAt, -30)}&newest=${tomorrow}`),
    ])

    await update($, snapshot, () => buildSnapshot({ fetchedAt, today, wellness, events, activities }))
    await update($, error, () => null)
  } catch (failure) {
    await update($, error, () => (failure instanceof Error ? failure.message : String(failure)))
  } finally {
    await update($, isLoading, () => false)
  }
}

// Module state: a reload starts it over, and the engine drops the old timer with it.
let timer: Timer | undefined

async function show($: EngineInterface): Promise<void> {
  await $.ui.open({ id: PANE, title: TITLE })
  void refresh($)
  timer ??= $.clock.every(EVERY_MS, () => void refresh($))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'forma',
      description: 'Pokaż formę (CTL/ATL/TSB) i dzisiejszy trening z intervals.icu',
    })

    return next(e)
  })

  on('command.run', { command: 'forma' }, async $ => {
    await show($)

    return { text: 'Panel formy otwarty, pobieram dane z intervals.icu.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Code } = $.ui.resolve(e)
    const data = await read($, snapshot)
    const problem = await read($, error)
    const loading = await read($, isLoading)

    const header = (
      <Box flexDirection="row" justifyContent="space-between">
        <Text dimColor>
          {loading
            ? 'Pobieram…'
            : data
              ? `Stan na ${data.today}, pobrano ${new Date(data.fetchedAt).toTimeString().slice(0, 5)}`
              : 'Brak danych'}
        </Text>
        <Button key="refresh" label="Odśwież" onPress={() => void refresh($)} />
      </Box>
    )

    if (!data) {
      return (
        <Box flexDirection="column" gap={1}>
          {header}
          {problem && <Text color="error">{problem}</Text>}
        </Box>
      )
    }

    const zone = data.formPercent === null ? null : formZone(data.formPercent)
    const metric = (label: string, value: string, color?: string) => (
      <Box flexDirection="row">
        <Box width={18}>
          <Text dimColor>{label}</Text>
        </Box>
        <Text tabular bold color={color}>
          {value}
        </Text>
      </Box>
    )

    return (
      <Box flexDirection="column" gap={1}>
        {header}
        {problem && <Text color="error">{problem}</Text>}

        <Box flexDirection="column">
          {metric('Fitness (CTL)', data.ctl === null ? 'brak' : data.ctl.toFixed(1))}
          {metric('Zmęczenie (ATL)', data.atl === null ? 'brak' : data.atl.toFixed(1))}
          {metric(
            'Forma (TSB)',
            data.tsb === null
              ? 'brak'
              : `${signed(data.tsb)}${data.formPercent === null ? '' : ` (${data.formPercent > 0 ? '+' : ''}${Math.round(data.formPercent)}%)`}${zone ? ` · ${zone.label}` : ''}`,
            zone?.color,
          )}
          {data.rampRate !== null && metric('Ramp rate', `${signed(data.rampRate)} CTL / 7 dni`)}
        </Box>

        {data.days.length > 1 && (
          <Box flexDirection="column">
            <Text weight="semibold">Ostatnie dni</Text>
            {data.days.map(day => (
              <Text mono tabular dimColor={day.date !== data.today}>
                {`${day.date.slice(5)}  CTL ${day.ctl.toFixed(0).padStart(3)}  ATL ${day.atl.toFixed(0).padStart(3)}  TSB ${signed(day.tsb).padStart(6)}`}
              </Text>
            ))}
          </Box>
        )}

        <Box flexDirection="column">
          <Text weight="semibold">Dziś w planie</Text>
          {data.workouts.length === 0 && <Text dimColor>Brak zaplanowanego treningu.</Text>}
          {data.workouts.map(workout => (
            <Box flexDirection="column">
              <Text bold>{workout.name}</Text>
              <Text dimColor>
                {[
                  workout.kind,
                  workout.minutes === null ? '' : duration(workout.minutes),
                  workout.load === null ? '' : `obciążenie ${workout.load}`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
              {workout.description !== '' && <Code source={workout.description} />}
            </Box>
          ))}
        </Box>

        {data.lastRide && (
          <Box flexDirection="column">
            <Text weight="semibold">Ostatnia jazda</Text>
            <Text>{data.lastRide.name}</Text>
            <Text dimColor>
              {[
                data.lastRide.date,
                data.lastRide.kind,
                data.lastRide.minutes === null ? '' : duration(data.lastRide.minutes),
                data.lastRide.km === null ? '' : `${data.lastRide.km} km`,
                data.lastRide.load === null ? '' : `obciążenie ${data.lastRide.load}`,
                data.lastRide.normalizedWatts === null ? '' : `NP ${data.lastRide.normalizedWatts} W`,
                data.lastRide.avgHr === null ? '' : `HR ${Math.round(data.lastRide.avgHr)}`,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </Box>
        )}
      </Box>
    )
  })
}
