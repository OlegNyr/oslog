'use strict';
// SQLite cache of OpenSearch hits (built-in node:sqlite, no native build).
//
//   hits(pattern, key, app, ts, raw, meta, fetched_at)  PK (pattern, key)
//   coverage(pattern, app, from_ms, to_ms)              inclusive ms intervals
//
// `pattern` is "<cluster url>|<index pattern>", so the same index on two
// clusters (or under two patterns) never mixes. `key` is _index/_id, `ts` the
// hit's @timestamp in ms (what the range query filters on), `raw` the log
// line, `meta` the k8s fields as JSON. A coverage interval means: every hit of
// that pattern+app with ts inside it is in `hits`. Touching intervals merge.
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS hits (
  pattern    TEXT NOT NULL,
  key        TEXT NOT NULL,
  app        TEXT NOT NULL,
  ts         INTEGER NOT NULL,
  raw        TEXT NOT NULL,
  meta       TEXT NOT NULL,
  fetched_at INTEGER NOT NULL,
  PRIMARY KEY (pattern, key)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS hits_pat_app_ts ON hits (pattern, app, ts);
CREATE INDEX IF NOT EXISTS hits_ts ON hits (ts);
CREATE TABLE IF NOT EXISTS coverage (
  pattern TEXT NOT NULL,
  app     TEXT NOT NULL,
  from_ms INTEGER NOT NULL,
  to_ms   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS coverage_pat_app ON coverage (pattern, app, from_ms);
`;

function openCache(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  // auto_vacuum only takes effect on a new database (before the first table)
  db.exec('PRAGMA auto_vacuum = INCREMENTAL; PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;');
  db.exec(SCHEMA);

  const st = {
    covIn: db.prepare('SELECT from_ms, to_ms FROM coverage WHERE pattern = ? AND app = ? AND to_ms >= ? AND from_ms <= ? ORDER BY from_ms'),
    covTouch: db.prepare('SELECT rowid, from_ms, to_ms FROM coverage WHERE pattern = ? AND app = ? AND to_ms >= ? AND from_ms <= ?'),
    covDel: db.prepare('DELETE FROM coverage WHERE rowid = ?'),
    covIns: db.prepare('INSERT INTO coverage (pattern, app, from_ms, to_ms) VALUES (?, ?, ?, ?)'),
    hitIns: db.prepare('INSERT OR REPLACE INTO hits (pattern, key, app, ts, raw, meta, fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?)'),
    count: db.prepare('SELECT count(*) AS n FROM hits WHERE pattern = ? AND app = ? AND ts BETWEEN ? AND ?'),
  };

  function tx(fn) {
    db.exec('BEGIN');
    try { const r = fn(); db.exec('COMMIT'); return r; }
    catch (e) { db.exec('ROLLBACK'); throw e; }
  }

  // [from, to] split into covered / uncovered pieces, oldest first.
  function segments(pattern, app, from, to) {
    const out = [];
    let pos = from;
    for (const c of st.covIn.all(pattern, app, from, to)) {
      if (c.from_ms > pos) out.push({ from: pos, to: c.from_ms - 1, covered: false });
      const a = Math.max(pos, c.from_ms), b = Math.min(to, c.to_ms);
      if (a <= b) out.push({ from: a, to: b, covered: true });
      pos = Math.max(pos, c.to_ms + 1);
      if (pos > to) break;
    }
    if (pos <= to) out.push({ from: pos, to, covered: false });
    return out;
  }

  function addCoverage(pattern, app, from, to) {
    if (from > to) return;
    tx(() => {
      let a = from, b = to;
      for (const c of st.covTouch.all(pattern, app, from - 1, to + 1)) {
        a = Math.min(a, c.from_ms); b = Math.max(b, c.to_ms);
        st.covDel.run(c.rowid);
      }
      st.covIns.run(pattern, app, a, b);
    });
  }

  // hits: compact hits from opensearch.searchLogs ({key, ts, msg, k8s})
  function store(pattern, app, hits, now) {
    if (!hits.length) return;
    tx(() => {
      for (const h of hits) st.hitIns.run(pattern, h.key, app, h.ts, h.msg, JSON.stringify(h.k8s || {}), now);
    });
  }

  function count(pattern, app, from, to) { return st.count.get(pattern, app, from, to).n; }

  // The newest `limit` hits of these apps in [from, to], newest first, in the
  // same shape searchLogs returns.
  function read(pattern, apps, from, to, limit) {
    const rows = db.prepare(
      'SELECT key, ts, raw, meta FROM hits WHERE pattern = ? AND app IN (' + apps.map(() => '?').join(',') + ')' +
      ' AND ts BETWEEN ? AND ? ORDER BY ts DESC LIMIT ?'
    ).all(pattern, ...apps, from, to, limit);
    return rows.map((r) => {
      let k8s = {};
      try { k8s = JSON.parse(r.meta); } catch (e) { /* keep {} */ }
      return { key: r.key, ts: r.ts, msg: r.raw, k8s };
    });
  }

  // Logical size: pages in use (the file itself shrinks only on vacuum).
  function bytes() {
    const page = db.prepare('PRAGMA page_size').get().page_size;
    const pages = db.prepare('PRAGMA page_count').get().page_count;
    const free = db.prepare('PRAGMA freelist_count').get().freelist_count;
    return (pages - free) * page;
  }

  // Drops hits older than cutoff (by ts) and trims coverage to match.
  function dropBefore(cutoff) {
    return tx(() => {
      const n = db.prepare('DELETE FROM hits WHERE ts < ?').run(cutoff).changes;
      db.prepare('DELETE FROM coverage WHERE to_ms < ?').run(cutoff);
      db.prepare('UPDATE coverage SET from_ms = ? WHERE from_ms < ?').run(cutoff, cutoff);
      return n;
    });
  }

  // Retention by age, then by size: the oldest hits go first. Returns rows removed.
  function cleanup({ days, maxBytes, now }) {
    let removed = dropBefore(now - days * 86400000);
    for (let i = 0; i < 20 && bytes() > maxBytes; i++) {
      const total = db.prepare('SELECT count(*) AS n FROM hits').get().n;
      if (!total) break;
      // drop the oldest share proportional to the overshoot (at least 5%)
      const share = Math.min(1, Math.max(0.05, 1 - maxBytes / bytes()));
      const nth = Math.max(1, Math.floor(total * share));
      const row = db.prepare('SELECT ts FROM hits ORDER BY ts LIMIT 1 OFFSET ?').get(nth - 1);
      removed += dropBefore(row.ts + 1);
    }
    if (removed) db.exec('PRAGMA incremental_vacuum; PRAGMA wal_checkpoint(TRUNCATE);');
    return removed;
  }

  function stats() {
    const r = db.prepare('SELECT count(*) AS n, min(ts) AS oldest, max(ts) AS newest FROM hits').get();
    return { enabled: true, hits: r.n, bytes: bytes(), oldest: r.oldest, newest: r.newest };
  }

  function clear() {
    const n = db.prepare('SELECT count(*) AS n FROM hits').get().n;
    tx(() => { db.exec('DELETE FROM hits; DELETE FROM coverage;'); });
    db.exec('VACUUM; PRAGMA wal_checkpoint(TRUNCATE);'); // give the space back to the disk
    return { enabled: true, removed: n };
  }

  return { segments, addCoverage, store, count, read, bytes, cleanup, stats, clear, close: () => db.close() };
}

module.exports = { openCache };
