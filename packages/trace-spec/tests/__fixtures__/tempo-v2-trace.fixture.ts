import type { Graph } from '@systemfsoftware/trace-spec'

/**
 * Captured from a real Grafana Tempo answering one read of
 * GET /api/v2/traces/<trace id> after ingesting one OTLP/HTTP JSON trace
 * carrying the hex ids recorded below. The body is the verbatim response;
 * the decoder, not this file, parses it. Wire ids are the base64 proto
 * bytes Tempo serves; the hex ids are what was pushed.
 */
export const TEMPO_IMAGE_REPOSITORY = 'docker.io/grafana/tempo'
export const TEMPO_IMAGE_TAG = 'latest'
export const TEMPO_IMAGE_VERSION = 'v3.0.0'
export const TEMPO_IMAGE_DIGEST = 'sha256:1ce31d6d7ffab62189685e8c47881d4a561c5d38bd0dbd66e40ca83cef07923d'

export const TEMPO_TRACE_ID = '4bf92f3577b34da6a3ce929d0e0e4736'
export const TEMPO_ROOT_SPAN_ID = '00f067aa0ba902b7'
export const TEMPO_CHILD_SPAN_ID = 'b7ad6b7169203331'
export const TEMPO_LINK_TRACE_ID = '5ba9a4b3c1d2e3f4a5b6c7d8e9f00112'
export const TEMPO_LINK_SPAN_ID = 'aabbccddeeff0011'

export const TEMPO_TRACE_ID_WIRE = 'S/kvNXezTaajzpKdDg5HNg=='
export const TEMPO_ROOT_SPAN_ID_WIRE = 'APBnqgupArc='
export const TEMPO_CHILD_SPAN_ID_WIRE = 't61rcWkgMzE='

export const tempoV2TraceBody =
  `{"trace":{"resourceSpans":[{"resource":{"attributes":[{"key":"service.name","value":{"stringValue":"gh476-capture"}}]},"scopeSpans":[{"scope":{"name":"gh476-capture","version":"1.0.0"},"spans":[{"traceId":"S/kvNXezTaajzpKdDg5HNg==","spanId":"APBnqgupArc=","name":"PlaceOrder","kind":"SPAN_KIND_SERVER","startTimeUnixNano":"1716235200000000000","endTimeUnixNano":"1716235201500000000","attributes":[{"key":"app.order.id","value":{"stringValue":"order-7"}},{"key":"http.request.header.accept","value":{"arrayValue":{"values":[{"stringValue":"application/json"},{"stringValue":"application/vnd.tempov2+json"}]}}},{"key":"payment.details","value":{"kvlistValue":{"values":[{"key":"last4","value":{"stringValue":"4242"}}]}}},{"key":"http.status_code","value":{"intValue":"200"}}],"status":{}},{"traceId":"S/kvNXezTaajzpKdDg5HNg==","spanId":"t61rcWkgMzE=","parentSpanId":"APBnqgupArc=","name":"PaymentCapture","kind":"SPAN_KIND_CLIENT","startTimeUnixNano":"1716235200250000000","endTimeUnixNano":"1716235200400000000","attributes":[{"key":"error.type","value":{"stringValue":"card_declined"}},{"key":"app.order.total","value":{"doubleValue":42.5}}],"events":[{"timeUnixNano":"1716235200300000000","name":"capture attempted","attributes":[{"key":"gateway.ref","value":{"stringValue":"gw-114"}}]}],"links":[{"traceId":"W6mks8HS4/SltsfY6fABEg==","spanId":"qrvM3e7/ABE="}],"status":{"message":"card declined","code":"STATUS_CODE_ERROR"}}]}]}]},"metrics":{"inspectedBytes":"29699"}}`

/**
 * The spans the pushed data implies, in the form an observation answers with:
 * the order span carries no status of its own (unset), the kvlist attribute
 * was dropped like any non-scalar attribute value, and the payment span
 * carries the error status, its event, and its link.
 */
export const expectedSpanRecords: ReadonlyArray<Graph.SpanRecord> = [
  {
    traceId: TEMPO_TRACE_ID,
    spanId: TEMPO_ROOT_SPAN_ID,
    parentSpanId: null,
    name: 'PlaceOrder',
    status: 'unset',
    errorType: null,
    startMillis: 1716235200000,
    durationMillis: 1500,
    attributes: {
      'app.order.id': 'order-7',
      'http.status_code': 200,
      'http.request.header.accept': ['application/json', 'application/vnd.tempov2+json'],
    },
    events: [],
    links: [],
  },
  {
    traceId: TEMPO_TRACE_ID,
    spanId: TEMPO_CHILD_SPAN_ID,
    parentSpanId: TEMPO_ROOT_SPAN_ID,
    name: 'PaymentCapture',
    status: 'error',
    errorType: 'card_declined',
    startMillis: 1716235200250,
    durationMillis: 150,
    attributes: { 'error.type': 'card_declined', 'app.order.total': 42.5 },
    events: [{ name: 'capture attempted', attributes: { 'gateway.ref': 'gw-114' } }],
    links: [{ traceId: TEMPO_LINK_TRACE_ID, spanId: TEMPO_LINK_SPAN_ID }],
  },
]
