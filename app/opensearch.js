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
    if (j.error && j.error.caused_by && j.error.caused_by.reason && reason.indexOf(j.error.caused_by.reason) < 0) {
      reason += ' — ' + j.error.caused_by.reason;
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

function search(conn, index, body, opts) {
  if (typeof index !== 'string' || !INDEX_RE.test(index)) return Promise.reject(new Error('неверное имя индекса'));
  return request(conn, 'POST', '/' + encodeURI(index) + '/_search', body, opts);
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

module.exports = { request, search, testConnection };
