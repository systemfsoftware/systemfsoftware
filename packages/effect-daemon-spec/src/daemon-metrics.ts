import { Metric } from 'effect'

export const supervisorRestartsCounter = Metric.counter(
  'app.daemon.supervisor.restart',
  { description: 'Daemon supervisor restart count' },
)

export const supervisorExhaustionsCounter = Metric.counter(
  'app.daemon.supervisor.exhaustion',
  { description: 'Daemon supervisor exhaustion count' },
)

export const supervisorChildrenGauge = Metric.gauge('app.daemon.supervisor.children', {
  description: 'Daemon supervisor current child count (dynamic supervisors only)',
})

export const healthStateGauge = Metric.gauge('app.daemon.health.state', {
  description: 'Daemon health latch open (1) or closed (0); tagged by daemon name and latch (ready | healthy | paused)',
})
