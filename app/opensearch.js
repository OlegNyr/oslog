'use strict';
// Minimal OpenSearch HTTP client: basic auth, custom CA / insecure TLS,
// timeouts, response size limit. Only `<index>/_search` is ever called.
// Never logs request or response bodies — they contain prod data.
const fs = require('fs');
const http = require('http');
const https = require('https');
const tls = require('tls');

const MAX_RESPONSE = 256 * 1024 * 1024;
const TIMEOUT_MS = 60000;
const INDEX_RE = /^[\w.*,-]+$/;

// Default roots + OS store (corporate CAs installed in Windows) + optional .pem.
function caList(caPath) {
  let ca = tls.rootCertificates.slice();
  try { if (tls.getCACertificates) ca = ca.concat(tls.getCACertificates('system')); } catch (e) { /* no system store */ }
  if (caPath) {
    let pem;
    try { pem = fs.readFileSync(caPath, 'utf8'); } catch (e) { throw new Error('не удалось прочитать CA-сертификат: ' + caPath); }
    if (pem.indexOf('-----BEGIN CERTIFICATE-----') < 0) throw new Error('CA-сертификат: ожидается PEM (-----BEGIN CERTIFICATE-----)');
    ca.push(pem);
  }
  return ca;
}

function errorText(e) {
  const code = e && e.code;
  const map = {
    ECONNREFUSED: 'соединение отклонено',
    ENOTFOUND: 'адрес не найден (DNS)',
    EAI_AGAIN: 'DNS недоступен — нет сети?',
    ETIMEDOUT: 'таймаут соединения',
    ECONNRESET: 'соединение сброшено',
    EHOSTUNREACH: 'хост недоступен',
    ENETUNREACH: 'нет сети',
    SELF_SIGNED_CERT_IN_CHAIN: 'сертификат не доверен (самоподписанный в цепочке) — укажите CA или «не проверять»',
    DEPTH_ZERO_SELF_SIGNED_CERT: 'самоподписанный сертификат — укажите CA или «не проверять»',
    UNABLE_TO_VERIFY_LEAF_SIGNATURE: 'не удалось проверить сертификат — укажите CA',
    UNABLE_TO_GET_ISSUER_CERT_LOCALLY: 'неизвестный издатель сертификата — укажите CA',
    CERT_HAS_EXPIRED: 'сертификат сервера просрочен',
    ERR_TLS_CERT_ALTNAME_INVALID: 'имя хоста не совпадает с сертификатом',
  };
  if (code && map[code]) return map[code] + ' (' + code + ')';
  return (e && e.message) || String(e);
}

function osErrorText(status, body) {
  if (status === 401) return '401: неверный логин или пароль';
  if (status === 403) return '403: нет прав на индекс';
  let reason = '';
  try {
    const j = JSON.parse(body);
    const rc = j.error && (j.error.root_cause && j.error.root_cause[0] || j.error);
    reason = rc ? (rc.type ? rc.type + ': ' : '') + (rc.reason || '') : '';
    const cb = (rc && rc.caused_by) || (j.error && j.error.caused_by);
    if (cb && cb.reason && reason.indexOf(cb.reason) < 0) {
      reason += ' — ' + cb.reason.split('\n')[0];
    }
  } catch (e) { reason = String(body || '').slice(0, 300); }
  return status + (reason ? ': ' + reason.slice(0, 500) : '');
}

// conn: {url, username, password, caPath, insecure}
function request(conn, method, path, body, opts) {
  opts = opts || {};
  return new Promise((resolve, reject) => {
    let u;
    try { u = new URL(conn.url + path); } catch (e) { return reject(new Error('неверный URL OpenSearch')); }
    const isHttps = u.protocol === 'https:';
    const payload = body == null ? null : Buffer.from(JSON.stringify(body));
    const headers = { Accept: 'application/json' };
    if (payload) { headers['Content-Type'] = 'application/json'; headers['Content-Length'] = payload.length; }
    if (conn.username) headers.Authorization = 'Basic ' + Buffer.from(conn.username + ':' + (conn.password || '')).toString('base64');
    const reqOpts = { method, headers, timeout: opts.timeout || TIMEOUT_MS };
    if (isHttps) {
      if (conn.insecure) reqOpts.rejectUnauthorized = false;
      else {
        try { reqOpts.ca = caList(conn.caPath); } catch (e) { return reject(e); }
      }
    }
    const req = (isHttps ? https : http).request(u, reqOpts, (res) => {
      const chunks = [];
      let size = 0;
      res.on('data', (c) => {
        size += c.length;
        if (size > MAX_RESPONSE) { req.destroy(new Error('слишком большой ответ OpenSearch')); return; }
        chunks.push(c);
      });
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode < 200 || res.statusCode >= 300) return reject(new Error(osErrorText(res.statusCode, text)));
        try { resolve(JSON.parse(text)); } catch (e) { reject(new Error('ответ OpenSearch не JSON')); }
      });
      res.on('error', (e) => reject(new Error(errorText(e))));
    });
    req.on('timeout', () => req.destroy(Object.assign(new Error('таймаут запроса'), { code: 'ETIMEDOUT' })));
    req.on('error', (e) => reject(new Error(errorText(e))));
    if (opts.signal) {
      if (opts.signal.aborted) return req.destroy(new Error('остановлено'));
      opts.signal.addEventListener('abort', () => req.destroy(new Error('остановлено')), { once: true });
    }
    req.end(payload);
  });
}

// A search answers 200 even when some shards failed (e.g. a bad Lucene query
// fails only on shards that weren't skipped by the time range) — the hits are
// then incomplete or empty, so that is an error too.
function shardFailure(r) {
  const sh = r && r._shards;
  if (!sh || !sh.failed) return null;
  const f = sh.failures && sh.failures[0] && sh.failures[0].reason;
  let reason = f ? (f.type ? f.type + ': ' : '') + (f.reason || '') : '';
  if (f && f.caused_by && f.caused_by.reason) reason += ' — ' + f.caused_by.reason.split('\n')[0];
  return 'сбой на ' + sh.failed + ' из ' + sh.total + ' шардов' + (reason ? ': ' + reason.slice(0, 500) : '');
}

async function search(conn, index, body, opts) {
  if (typeof index !== 'string' || !INDEX_RE.test(index)) throw new Error('неверное имя индекса');
  const r = await request(conn, 'POST', '/' + encodeURI(index) + '/_search', body, opts);
  const failed = shardFailure(r);
  if (failed) throw new Error(failed);
  return r;
}

// "Проверить соединение": a size-0 search on the index — needs only the
// permissions the app needs anyway (GET / is often forbidden for plain users).
async function testConnection(conn, index) {
  const t0 = Date.now();
  const r = await search(conn, index, {
    size: 0,
    track_total_hits: true,
    query: { range: { '@timestamp': { gte: 'now-15m' } } },
  }, { timeout: 20000 });
  const total = r.hits && r.hits.total;
  return {
    ms: Date.now() - t0,
    total: typeof total === 'number' ? total : (total && total.value) || 0,
    shards: r._shards ? { total: r._shards.total, failed: r._shards.failed } : null,
  };
}

// ---------- log search (stage 2) ----------
const PAGE = 1000;
const TIE_PAGE = 10000; // one millisecond holding more than a page of hits
const MAX_LIMIT = 100000;
const APP_RE = /^[\w.-]{1,100}$/;
const SOURCE = ['@timestamp', 'message', 'pod_labels.app', 'pod', 'namespace', 'container', 'node', 'k8sClusterName'];
const SORT = [{ '@timestamp': { order: 'desc', unmapped_type: 'boolean' } }];

// req from the renderer: {index, apps[], from, to (epoch ms), query?, limit}
function validateSearch(req) {
  if (!req || typeof req !== 'object') throw new Error('неверный запрос');
  const index = req.index;
  if (typeof index !== 'string' || !INDEX_RE.test(index) || index.length > 512) throw new Error('неверное имя индекса');
  const apps = req.apps;
  if (!Array.isArray(apps) || !apps.length || apps.length > 20 || !apps.every((a) => typeof a === 'string' && APP_RE.test(a))) {
    throw new Error('выберите хотя бы один сервис');
  }
  const from = req.from, to = req.to;
  if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from < 0 || from > to) throw new Error('неверный интервал');
  const query = req.query == null ? '' : req.query;
  if (typeof query !== 'string' || query.length > 4000) throw new Error('слишком длинный запрос');
  const limit = req.limit;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) throw new Error('лимит: от 1 до ' + MAX_LIMIT);
  return { index, apps: Array.from(new Set(apps)), from, to, query: query.trim(), limit };
}

function searchBody(q, gte, lte, size, trackTotal) {
  const filter = [
    { range: { '@timestamp': { gte, lte, format: 'epoch_millis' } } },
    { bool: { should: q.apps.map((a) => ({ match_phrase: { 'pod_labels.app': a } })), minimum_should_match: 1 } },
  ];
  if (q.query) filter.push({ query_string: { query: q.query, analyze_wildcard: true } });
  return { size, sort: SORT, _source: SOURCE, track_total_hits: trackTotal, query: { bool: { filter } } };
}

function sourceField(s, path) {
  if (Object.prototype.hasOwnProperty.call(s, path)) return s[path];
  let v = s;
  for (const p of path.split('.')) { if (v && typeof v === 'object' && p in v) v = v[p]; else return undefined; }
  return v;
}

// Only what the viewer needs: key for dedupe, ingest ts (ms), the log line, k8s fields.
function compactHit(h) {
  const s = h._source || {};
  let msg = s.message;
  if (typeof msg !== 'string') msg = msg == null ? '' : JSON.stringify(msg);
  const ts = h.sort && typeof h.sort[0] === 'number' ? h.sort[0] : Date.parse(s['@timestamp']);
  return {
    key: h._index + '/' + h._id,
    ts,
    msg,
    k8s: {
      app: sourceField(s, 'pod_labels.app'),
      pod: s.pod,
      namespace: s.namespace,
      container: s.container,
      node: s.node,
      cluster: s.k8sClusterName,
    },
  };
}

// Newest → oldest in pages of PAGE. The next page repeats the query with
// lte = the last hit's time and drops hits already seen (by _index/_id), so
// hits sharing a timestamp across a page edge are never lost. No search_after
// / PIT — works on any OpenSearch version.
// Resolves {hits, total, reason: 'done'|'limit'|'stopped', error?}; rejects
// only if nothing was loaded.
async function searchLogs(conn, req, opts) {
  opts = opts || {};
  const q = validateSearch(req);
  const signal = opts.signal;
  const progress = opts.onProgress || (() => {});
  const seen = new Set();
  const out = [];
  let total = null;
  let lte = q.to;
  let reason = 'done';

  function take(hits) {
    let added = 0;
    for (const h of hits) {
      const key = h._index + '/' + h._id;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(compactHit(h));
      added++;
      if (out.length >= q.limit) break;
    }
    return added;
  }

  try {
    for (;;) {
      const r = await search(conn, q.index, searchBody(q, q.from, lte, PAGE, total === null), { signal });
      if (total === null) {
        const t = r.hits && r.hits.total;
        total = typeof t === 'number' ? t : (t && t.value) || 0;
      }
      const hits = (r.hits && r.hits.hits) || [];
      const added = take(hits);
      progress({ loaded: out.length, total });
      if (out.length >= q.limit) { reason = 'limit'; break; }
      if (hits.length < PAGE) break;
      const last = hits[hits.length - 1].sort && hits[hits.length - 1].sort[0];
      if (typeof last !== 'number') throw new Error('нет значения сортировки в ответе');
      if (added === 0) {
        // the whole page is one millisecond: fetch that millisecond in full, then step past it
        const rt = await search(conn, q.index, searchBody(q, last, last, TIE_PAGE, false), { signal });
        take((rt.hits && rt.hits.hits) || []);
        progress({ loaded: out.length, total });
        if (out.length >= q.limit) { reason = 'limit'; break; }
        if (last - 1 < q.from) break;
        lte = last - 1;
      } else {
        lte = last;
      }
      if (signal && signal.aborted) { reason = 'stopped'; break; }
    }
  } catch (e) {
    if (signal && signal.aborted) reason = 'stopped';
    else if (out.length) return { hits: out, total, reason: 'error', error: e.message };
    else throw e;
  }
  return { hits: out, total, reason };
}

module.exports = { request, search, testConnection, searchLogs, validateSearch, compactHit };
