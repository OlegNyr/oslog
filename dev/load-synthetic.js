#!/usr/bin/env node
// Generates synthetic FormatterElastic-style logs for matrixkc and acd over the
// last hour and loads them into the local dev OpenSearch (index
// plchat-k8s-prod-000008, so the default pattern plchat-k8s-prod-* finds them).
// Includes traces across both services and the pagination edge case: TIES
// hits sharing one @timestamp.
//   node dev/load-synthetic.js [count=6000] [http://localhost:9200]
'use strict';

const COUNT = Number(process.argv[2]) || 6000;
const base = (process.argv[3] || 'http://localhost:9200').replace(/\/+$/, '');
const INDEX = 'plchat-k8s-prod-000008';
const TIES = 1500;

async function call(method, url, body, ndjson) {
  const res = await fetch(base + url, {
    method,
    headers: { 'Content-Type': ndjson ? 'application/x-ndjson' : 'application/json' },
    body: body == null ? undefined : (ndjson ? body : JSON.stringify(body)),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(method + ' ' + url + ' → ' + res.status + ' ' + text.slice(0, 300));
  return JSON.parse(text);
}

let seed = 42; // mulberry32
function rnd() {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function pickOne(a) { return a[Math.floor(rnd() * a.length)]; }
function hex(n) { let s = ''; while (s.length < n) s += Math.floor(rnd() * 16).toString(16); return s; }
function nsIso(ms) { return new Date(ms).toISOString().replace('Z', '') + String(Math.floor(rnd() * 1e6)).padStart(6, '0') + 'Z'; }

const PODS = {
  matrixkc: ['matrixkc-85f84bd596-4vtz9', 'matrixkc-85f84bd596-q7m2x'],
  acd: ['acd-6d9c7b8f4-lk2pp'],
};
const LOGGERS = {
  matrixkc: ['ru.otpbank.kc.matrix.SyncService', 'ru.otpbank.kc.matrix.RoomCache', 'ru.otpbank.kc.matrix.client.MatrixClient'],
  acd: ['ru.otpbank.kc.acd.router.Router', 'ru.otpbank.kc.acd.queue.QueueService', 'ru.otpbank.kc.acd.agent.AgentRegistry'],
};
const MSGS = [
  'sync completed in {n} ms', 'room {r} state updated', 'queue size {n}', 'agent {r} status AVAILABLE',
  'routing chat {r} to agent pool', 'token refreshed', 'cache hit ratio 0.{n}',
];
const seq = {};

function line(app, pod, ms, extra) {
  seq[pod] = (seq[pod] || 0) + 1;
  const o = Object.assign({
    '@timestamp': nsIso(ms),
    level: 'INFO',
    logger: pickOne(LOGGERS[app]),
    process: { pid: 1, thread: { name: 'exec-' + Math.floor(rnd() * 20) } },
    servicesc: { version: '0.1.0', name: app },
    message: pickOne(MSGS).replace('{n}', Math.floor(rnd() * 900 + 10)).replace('{r}', '!' + hex(8) + ':otpbank.ru'),
    sequenceNumber: seq[pod],
    traceId: hex(32),
    spanId: hex(16),
    ecs: { version: '1.2.0' },
  }, extra || {});
  return JSON.stringify(o);
}

function doc(app, pod, ms, message) {
  let parsed;
  try { parsed = JSON.parse(message); } catch (e) { parsed = undefined; } // the cluster's ingest parses it into app.*
  return {
    app: parsed,
    '@timestamp': new Date(ms + 200 + Math.floor(rnd() * 300)).toISOString(),
    message,
    pod_labels: { app },
    pod,
    namespace: 'plchat',
    container: app,
    node: 'worker-' + (pod.length % 3),
    k8sClusterName: 'plchat-prod-0',
    stream: 'stdout',
  };
}

(async () => {
  const now = Date.now();
  const t0 = now - 60 * 60000;
  const docs = [];
  for (let i = 0; i < COUNT; i++) {
    const app = rnd() < 0.6 ? 'matrixkc' : 'acd';
    const pod = pickOne(PODS[app]);
    const ms = t0 + Math.floor(rnd() * (now - t0 - 60000));
    const r = rnd();
    if (r < 0.02) {
      docs.push(doc(app, pod, ms, line(app, pod, ms, {
        level: 'ERROR', message: 'request failed',
        error: { type: 'java.net.SocketTimeoutException', message: 'Read timed out',
          stack_trace: 'java.net.SocketTimeoutException: Read timed out\n\tat java.base/sun.nio.ch.NioSocketImpl.timedRead(NioSocketImpl.java:278)\n\tat ru.otpbank.kc.matrix.client.MatrixClient.sync(MatrixClient.java:118)' },
      })));
    } else if (r < 0.07) {
      docs.push(doc(app, pod, ms, line(app, pod, ms, { level: 'WARN', message: 'slow response ' + Math.floor(rnd() * 5000) + ' ms' })));
    } else if (r < 0.17) {
      // logbook request/response pair sharing a correlation
      const corr = hex(16), trace = hex(32), url = 'https://matrix-frontend/_matrix/client/v3/rooms/!' + hex(8) + '/messages';
      docs.push(doc(app, pod, ms, line(app, pod, ms, { logger: 'ru.otpbank.kc.request.outgoing', message: url, traceId: trace,
        correlation: corr, origin: 'local', operation: 'request', url, method: 'GET' })));
      const d = 20 + Math.floor(rnd() * 400);
      docs.push(doc(app, pod, ms + d, line(app, pod, ms + d, { logger: 'ru.otpbank.kc.request.outgoing', message: '{"chunk":[],"start":"t1"}',
        traceId: trace, correlation: corr, origin: 'remote', operation: 'response', url, duration: String(d) })));
    } else if (r < 0.2) {
      // a trace across both services: acd routes a chat and calls matrixkc
      const trace = hex(32), sa = hex(16), sm = hex(16), room = '!' + hex(8) + ':otpbank.ru';
      const steps = [
        ['acd', 0, sa, 'ru.otpbank.kc.acd.router.Router', 'INFO', 'routing chat ' + room],
        ['acd', 15, sa, 'ru.otpbank.kc.acd.queue.QueueService', 'INFO', 'chat ' + room + ' queued'],
        ['matrixkc', 40, sm, 'ru.otpbank.kc.matrix.client.MatrixClient', 'INFO', 'invite agent to ' + room],
        ['matrixkc', 90 + Math.floor(rnd() * 600), sm, 'ru.otpbank.kc.matrix.RoomCache', rnd() < 0.3 ? 'WARN' : 'INFO', 'room ' + room + ' state updated'],
        ['matrixkc', 750, sm, 'ru.otpbank.kc.matrix.client.MatrixClient', 'INFO', 'invite done'],
        ['acd', 800, sa, 'ru.otpbank.kc.acd.agent.AgentRegistry', 'INFO', 'agent assigned to ' + room],
      ];
      for (const [a, dt, span, logger, level, message] of steps) {
        const p = pickOne(PODS[a]);
        docs.push(doc(a, p, ms + dt, line(a, p, ms + dt, { traceId: trace, spanId: span, logger, level, message })));
      }
    } else {
      docs.push(doc(app, pod, ms, line(app, pod, ms)));
    }
  }
  // a non-JSON line (Spring banner) → RAW record in the viewer
  docs.push(doc('acd', PODS.acd[0], t0 + 1000, '  .   ____          _            __ _ _'));
  // pagination edge case: TIES hits with the same @timestamp
  const tieTs = new Date(now - 30 * 60000).toISOString();
  for (let i = 0; i < TIES; i++) {
    const d = doc('matrixkc', PODS.matrixkc[0], now - 30 * 60000, line('matrixkc', PODS.matrixkc[0], now - 30 * 60000, { message: 'tie ' + i }));
    d['@timestamp'] = tieTs;
    docs.push(d);
  }

  await call('DELETE', '/' + INDEX).catch(() => {});
  for (let i = 0; i < docs.length; i += 2000) {
    const body = docs.slice(i, i + 2000).map((d) => JSON.stringify({ index: { _index: INDEX } }) + '\n' + JSON.stringify(d)).join('\n') + '\n';
    const r = await call('POST', '/_bulk', body, true);
    if (r.errors) throw new Error('bulk errors: ' + JSON.stringify(r.items.find((x) => x.index.error).index.error).slice(0, 300));
  }
  await call('POST', '/' + INDEX + '/_refresh');
  const c = await call('GET', '/' + INDEX + '/_count');
  console.log('loaded ' + c.count + ' docs into ' + INDEX + ' (' + TIES + ' share @timestamp ' + tieTs + ')');
})().catch((e) => { console.error(e.message); process.exit(1); });
