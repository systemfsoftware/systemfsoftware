import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Array, Match, Option, Schema } from 'effect'
import * as Result from 'effect/Result'
import {
  CreateScan,
  GetScan,
  SearchScans,
  UrlScan,
  UrlScanApplied,
  UrlScanCommand,
  UrlScanOutcome,
  UrlScanRefused,
  UrlScanState,
} from './url-scan.schema.js'

const asUuid = (hex: string): string =>
  `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`

const reportUrl = (uuid: string): string => `https://urlscan.io/result/${uuid}/`

const domUrl = (uuid: string): string => `https://urlscan.io/dom/${uuid}/`

const screenshotUrl = (uuid: string): string => `https://urlscan.io/screenshots/${uuid}.png`

const apiUrl = (uuid: string): string => `https://urlscan.io/api/v1/result/${uuid}/`

const baseProcessors = {
  asn: { data: [] },
  dns: { data: [] },
  domainCategories: { data: [] },
  geoip: { data: [] },
  phishing: { data: [] },
  radarRank: { data: [] },
  wappa: { data: [] },
}

const agentReadinessResult = {
  checks: {
    botAccessControl: {
      contentSignals: { status: 'pass' },
      robotsTxtAiRules: { status: 'pass' },
      webBotAuth: { status: 'pass' },
    },
    commerce: {
      acp: { status: 'pass' },
      ap2: { status: 'pass' },
      mpp: { status: 'pass' },
      ucp: { status: 'pass' },
      x402: { status: 'pass' },
    },
    contentAccessibility: {
      markdownNegotiation: { status: 'pass' },
    },
    discovery: {
      a2aAgentCard: { status: 'pass' },
      agentSkills: { status: 'pass' },
      apiCatalog: { status: 'pass' },
      ard: { status: 'pass' },
      authMd: { status: 'pass' },
      mcpServerCard: { status: 'pass' },
      oauthDiscovery: { status: 'pass' },
      oauthProtectedResource: { status: 'pass' },
      webMcp: { status: 'pass' },
    },
    discoverability: {
      dnsAid: { status: 'pass' },
      linkHeaders: { status: 'pass' },
      robotsTxt: { status: 'pass' },
      sitemap: { status: 'pass' },
    },
  },
  level: 2,
  levelName: 'Bot-Aware',
}

const processors = (scan: UrlScan): Schema.Json =>
  Match.value(scan.agentReadiness).pipe(
    Match.when(true, () => ({ ...baseProcessors, agentReadiness: agentReadinessResult })),
    Match.when(false, () => baseProcessors),
    Match.exhaustive,
  )

const report = (scan: UrlScan): Schema.Json => ({
  data: { console: [], cookies: [], globals: [], links: [], performance: [], requests: [] },
  lists: {
    asns: [],
    certificates: [],
    continents: [],
    countries: [],
    domains: [],
    hashes: [],
    ips: [],
    linkDomains: [],
    servers: [],
    urls: [],
  },
  meta: { processors: processors(scan) },
  page: {
    apexDomain: '',
    asn: 'AS0',
    asnname: '',
    city: '',
    country: '',
    domain: '',
    ip: '0.0.0.0',
    mimeType: '',
    server: '',
    status: '',
    title: '',
    tlsAgeDays: 0,
    tlsIssuer: '',
    tlsValidDays: 0,
    tlsValidFrom: '',
    url: scan.url,
  },
  scanner: { colo: '', country: '' },
  stats: {
    IPv6Percentage: 0,
    domainStats: [],
    ipStats: [],
    malicious: 0,
    protocolStats: [],
    resourceStats: [],
    securePercentage: 0,
    secureRequests: 0,
    serverStats: [],
    tlsStats: [],
    totalLinks: 0,
    uniqASNs: 0,
    uniqCountries: 0,
  },
  task: {
    apexDomain: '',
    domURL: domUrl(scan.uuid),
    domain: '',
    method: 'GET',
    options: { customHeaders: {}, screenshotsResolutions: ['desktop'] },
    reportURL: reportUrl(scan.uuid),
    screenshotURL: screenshotUrl(scan.uuid),
    source: 'api',
    success: true,
    time: scan.time,
    url: scan.url,
    uuid: scan.uuid,
    visibility: scan.visibility,
  },
  verdicts: { overall: { categories: [], hasVerdicts: false, malicious: false, tags: [] } },
})

const searchResult = (scan: UrlScan): Schema.Json => ({
  _id: scan.uuid,
  page: { asn: 'AS0', country: '', ip: '0.0.0.0', url: scan.url },
  result: reportUrl(scan.uuid),
  stats: { dataLength: 0, requests: 0, uniqCountries: 0, uniqIPs: 0 },
  task: { time: scan.time, url: scan.url, uuid: scan.uuid, visibility: scan.visibility },
  verdicts: { malicious: false },
})

const createBody = (scan: UrlScan): Schema.Json => ({
  api: apiUrl(scan.uuid),
  message: 'Submission successful',
  options: Option.match(Option.fromUndefinedOr(scan.options.useragent), {
    onNone: () => ({}),
    onSome: (useragent) => ({ useragent }),
  }),
  result: reportUrl(scan.uuid),
  url: scan.url,
  uuid: scan.uuid,
  visibility: scan.visibility,
})

const invalidBody = (detail: string): Schema.Json => ({
  errors: [{ detail, status: 400, title: 'Bad Request' }],
  message: 'Invalid input.',
  status: 400,
})

const refusedInvalid = (state: UrlScanState, detail: string): UrlScanRefused =>
  UrlScanRefused.make({ state, status: 400, body: invalidBody(detail) })

const notFoundBody = (scanId: string): Schema.Json => ({
  errors: [{ detail: 'Scan not found or in progress.', status: 404, title: 'Not Found' }],
  message: 'Scan not found or in progress.',
  status: 404,
  task: { status: 'Queued', time: '', url: '', uuid: scanId, visibility: 'public' },
})

const refusedNotFound = (state: UrlScanState, scanId: string): UrlScanRefused =>
  UrlScanRefused.make({ state, status: 404, body: notFoundBody(scanId) })

const lowerVisibility = (visibility: 'Public' | 'Unlisted' | undefined): UrlScan['visibility'] =>
  Match.value(visibility).pipe(
    Match.when('Public', (): UrlScan['visibility'] => 'public'),
    Match.when('Unlisted', (): UrlScan['visibility'] => 'unlisted'),
    Match.when(undefined, (): UrlScan['visibility'] => 'public'),
    Match.exhaustive,
  )

const scanOptions = (agent: string | undefined): UrlScan['options'] =>
  Option.match(Option.fromUndefinedOr(agent), {
    onNone: () => ({}),
    onSome: (useragent) => ({ useragent }),
  })

const buildScan = (command: UrlScanCommand, request: CreateScan): UrlScan => ({
  agentReadiness: Option.getOrElse(Option.fromUndefinedOr(request.agentReadiness), () => false),
  options: scanOptions(request.customagent),
  time: command.now,
  url: request.url,
  uuid: asUuid(command.newId),
  visibility: lowerVisibility(request.visibility),
})

const createScan = (command: UrlScanCommand, request: CreateScan): UrlScanOutcome => {
  const created = buildScan(command, request)
  const state = Array.append(command.state, created)
  return Match.value(request.url.length === 0).pipe(
    Match.when(true, () => refusedInvalid(command.state, 'A URL is required.')),
    Match.when(false, () => UrlScanApplied.make({ state, status: 200, body: createBody(created) })),
    Match.exhaustive,
  )
}

const findScan = (state: UrlScanState, uuid: string): Option.Option<UrlScan> =>
  Array.findFirst(state, (scan) => scan.uuid === uuid)

const getScan = (command: UrlScanCommand, request: GetScan): UrlScanOutcome =>
  Option.match(findScan(command.state, request.scan_id), {
    onNone: () => refusedNotFound(command.state, request.scan_id),
    onSome: (scan) => UrlScanApplied.make({ state: command.state, status: 200, body: report(scan) }),
  })

const matchesUrl = (scan: UrlScan, wanted: string): boolean =>
  Match.value(scan.url.includes(wanted)).pipe(
    Match.when(true, () => true),
    Match.when(false, () => wanted.includes(scan.url)),
    Match.exhaustive,
  )

const matchesQuery = (q: string | undefined) => (scan: UrlScan): boolean =>
  Option.match(Option.fromUndefinedOr(q), {
    onNone: () => true,
    onSome: (wanted) => matchesUrl(scan, wanted),
  })

const searchScans = (command: UrlScanCommand, request: SearchScans): UrlScanOutcome => {
  const filtered = Array.filter(command.state, matchesQuery(request.q))
  const size = Option.getOrElse(Option.fromUndefinedOr(request.size), () => filtered.length)
  return UrlScanApplied.make({
    state: command.state,
    status: 200,
    body: { results: Array.map(Array.take(filtered, size), searchResult) },
  })
}

const decide = (command: UrlScanCommand): Result.Result<UrlScanOutcome, never> =>
  Result.succeed(
    Match.value(command.request).pipe(
      Match.tag('CreateScan', (request) => createScan(command, request)),
      Match.tag('GetScan', (request) => getScan(command, request)),
      Match.tag('SearchScans', (request) => searchScans(command, request)),
      Match.exhaustive,
    ),
  )

export const urlScan = Workflow.make({
  command: UrlScanCommand,
  decision: UrlScanOutcome,
  error: Schema.Never,
  decide,
})
