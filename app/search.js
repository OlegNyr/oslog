'use strict';
// A search request through the cache (PLAN.md §8):
//  - with a Lucene query or a traceId: straight to OpenSearch, nothing cached;
//  - otherwise, per service, newest → oldest over [from, to]: covered pieces
//    are counted from SQLite, uncovered ones fetched from OpenSearch with what
//    is left of the limit and stored; coverage is marked only for what was
//    downloaded in full (on limit / stop / error: (last hit's ts, piece end]),
//    never for the last FRESH_MS; the answer is read back from SQLite.
// If OpenSearch fails, whatever the cache holds is returned with the error.
const opensearch = require('./opensearch');

const FRESH_MS = 5 * 60000;

// getConn() → {url, username, password, ...} or throws (e.g. no URL configured)
// source: the cluster URL, part of the cache key; may be '' when not configured
async function cachedSearch({ cache, getConn, source, req, signal, onProgress, now }) {
  const q = opensearch.validateSearch(req);
  const progress = onProgress || (() => {});

  if (q.query || q.traceId) {
    const r = await opensearch.searchLogs(getConn(), q, { signal, onProgress: (p) => progress({ loaded: p.loaded, total: p.total, cached: 0 }) });
    return Object.assign(r, { cached: 0, fetched: r.hits.length, bypass: true });
  }

  now = now || Date.now();
  const pattern = source + '|' + q.index;
  const freshEdge = now - FRESH_MS;
  let cached = 0, fetched = 0, fetchTotal = 0;
  let error = null, stopped = false;

  outer:
  for (const app of q.apps) {
    let budget = q.limit;
    const segs = cache.segments(pattern, app, q.from, q.to).reverse();
    for (const seg of segs) {
      if (budget <= 0) break;
      if (seg.covered) {
        const n = cache.count(pattern, app, seg.from, seg.to);
        cached += n; budget -= n;
        progress({ loaded: fetched, total: fetchTotal, cached });
        continue;
      }
      let r;
      try {
        const base = { fetched, fetchTotal };
        r = await opensearch.searchLogs(getConn(), { index: q.index, apps: [app], from: seg.from, to: seg.to, limit: budget }, {
          signal,
          onProgress: (p) => progress({ loaded: base.fetched + p.loaded, total: base.fetchTotal + p.total, cached }),
        });
      } catch (e) {
        if (signal && signal.aborted) stopped = true; else error = e.message;
        break outer;
      }
      cache.store(pattern, app, r.hits, now);
      fetched += r.hits.length; budget -= r.hits.length; fetchTotal += r.total || 0;
      const covTo = Math.min(seg.to, freshEdge);
      if (r.reason === 'done') cache.addCoverage(pattern, app, seg.from, covTo);
      else if (r.hits.length) cache.addCoverage(pattern, app, r.hits[r.hits.length - 1].ts + 1, covTo);
      if (r.reason === 'stopped') { stopped = true; break outer; }
      if (r.reason === 'error') { error = r.error; break outer; }
      if (r.reason === 'limit') break;
    }
  }

  const hits = cache.read(pattern, q.apps, q.from, q.to, q.limit);
  const reason = error ? 'error' : stopped ? 'stopped' : hits.length >= q.limit ? 'limit' : 'done';
  return {
    hits,
    total: null,
    reason,
    error: error || undefined,
    fetched,
    cached: Math.max(0, hits.length - fetched),
  };
}

module.exports = { cachedSearch, FRESH_MS };
