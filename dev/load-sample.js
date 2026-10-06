#!/usr/bin/env node
// Loads the hits of an OpenSearch response (default docs/response.json) into
// the local dev OpenSearch, keeping their _index, _id and _source as is.
//   node dev/load-sample.js [response.json] [http://localhost:9200]
'use strict';
const fs = require('fs');
const path = require('path');

const file = process.argv[2] || path.join(__dirname, '..', 'docs', 'response.json');
const base = (process.argv[3] || 'http://localhost:9200').replace(/\/+$/, '');

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

async function waitUp() {
  for (let i = 0; i < 90; i++) {
    try {
      const h = await call('GET', '/_cluster/health');
      if (h.status === 'green' || h.status === 'yellow') return;
    } catch (e) { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error('OpenSearch at ' + base + ' did not come up');
}

(async () => {
  const hits = JSON.parse(fs.readFileSync(file, 'utf8')).hits.hits;
  await waitUp();

  // Same field types as the real cluster where the app depends on them.
  await call('PUT', '/_index_template/oslog-dev', {
    index_patterns: ['plchat-k8s-*'],
    template: {
      settings: { number_of_replicas: 0 },
      mappings: {
        properties: {
          '@timestamp': { type: 'date' },
          message: { type: 'text' },
          pod_labels: { properties: { app: { type: 'keyword' } } },
          pod: { type: 'keyword' },
          namespace: { type: 'keyword' },
          container: { type: 'keyword' },
          node: { type: 'keyword' },
          k8sClusterName: { type: 'keyword' },
        },
      },
    },
  });

  const lines = [];
  for (const h of hits) {
    lines.push(JSON.stringify({ index: { _index: h._index, _id: h._id } }));
    lines.push(JSON.stringify(h._source));
  }
  const r = await call('POST', '/_bulk?refresh=true', lines.join('\n') + '\n', true);
  if (r.errors) {
    const bad = r.items.filter((i) => i.index && i.index.error);
    throw new Error('bulk errors: ' + JSON.stringify(bad[0].index.error).slice(0, 300));
  }
  const indices = Array.from(new Set(hits.map((h) => h._index)));
  const c = await call('GET', '/' + indices.join(',') + '/_count');
  console.log('loaded ' + hits.length + ' hits into ' + indices.join(', ') + ' (count now ' + c.count + ')');
})().catch((e) => { console.error(e.message); process.exit(1); });
