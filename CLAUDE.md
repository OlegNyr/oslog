# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**oslog** — an Electron desktop app for browsing Spring Boot ECS logs (logback → ECS via `FormatterElastic`) straight from **OpenSearch**, with a local **SQLite cache**. The UI is a fork of the single-file viewer from the sibling project `logview` (list, timeline, filters, "Обмен" exchange panel, detail panel). Target users: the author and colleagues on Windows (portable `.exe`).

**`docs/PLAN.md` is the source of truth for scope, design and stages — read it before starting work.** It is written in Russian; the user communicates in Russian.

## Current state

Stages 1 (skeleton) and 2 (search) are done: Electron window, settings with `safeStorage`, «проверить соединение», and the OpenSearch query bar (index, service toggles, interval + 15м/1ч/6ч/24ч, Lucene, limit, загрузить/стоп, progress/errors) feeding the viewer through `setRecords()`. `cacheStats` / `clearCache` are still stubs in `app/main.js`; `app/cache.js` doesn't exist yet. Next is stage 3 (SQLite cache) from the plan.

Verified: `node:sqlite` works in Electron 44.5.1 (Node 24.21, SQLite 3.53.4) in the main process — no `better-sqlite3` needed.

When a stage lands, update this section and the layout below so they match the code.

## Layout (see PLAN.md §2)

- `src/` — the renderer page. `src/index.html` is the shell with two build markers: `/*@build:styles@*/` inside `<style>` and `/*@build:script@*/` inside the one `"use strict"` IIFE. `src/styles.css` holds all CSS. `src/js/NN-*.js` are script fragments **concatenated in filename order into that single IIFE** — they share one closure (`ALL`, `VIEW`, `filters`, …); no modules, no imports. Add a section as `NN-name.js`, choosing `NN` for its position.
- `build.js` — plain Node, no dependencies; inlines CSS + JS into `app/renderer/index.html` (generated, git-ignored; don't hand-edit) and puts the inline script's sha256 into the page CSP (`'@build:script-hash@'` in `src/index.html`). So: exactly one inline `<script>`, no inline event handlers (`onclick="…"`), no `eval`.
- `app/` — Electron: `main.js` (window, navigation lock, IPC handlers with sender check, `{ok,data}|{ok:false,error}` envelope), `preload.js` (`contextBridge` → `window.osApi`, unwraps the envelope into promises), `opensearch.js` (HTTP client: basic auth, default+system+`.pem` CAs, timeouts, error texts in Russian), `settings.js` (`userData/settings.json` + `password.bin`), `cache.js` (SQLite, stage 3).
- `src/js/12-hits.js` — `hitToRecord` / `hitsToRecords`: OpenSearch hits → viewer records (`norm()` + `r.k8s`, sorted by log time, then `sequenceNumber`). `fieldValue` resolves `k8s.*` from `r.k8s`, so ⊕/▦ work on RAW records too; `showDetail` has a «kubernetes» section.
- `src/js/87-settings.js` — the settings dialog; `src/js/88-query-bar.js` — the query bar (state in `localStorage` `oslog.query`; a quick range is relative and re-anchors to now on every load). Both appear only when `window.osApi` exists, so the page still works as a plain viewer in a browser.
- `app/opensearch.js` `searchLogs()` — validation, query body, `lte`+dedupe pagination (a full page of one millisecond is fetched in one 10 000-hit request, then stepped past), stop via `AbortSignal`; resolves `{hits, total, reason: done|limit|stopped|error, error?}`. `search()` treats `_shards.failed > 0` as an error: OpenSearch answers 200 when a bad Lucene query fails only on the shards the time range didn't skip.
- `dev/` — local OpenSearch 2 in Docker (`docker compose -f dev/docker-compose.yml up -d`, http://localhost:9200, no auth), `node dev/load-sample.js` (the `docs/response.json` hits as is), `node dev/load-synthetic.js [count]` (≈8 000 matrixkc/acd records over the last hour with parsed `app.*`, errors, request/response pairs, a RAW banner and 1 500 hits sharing one `@timestamp`).
- Password storage: `safeStorage`; on Linux without a keyring (WSL) the backend is `basic_text` — `settings.js` then enables plain-text mode and the dialog warns (`passwordStorage: 'weak'`). Windows uses DPAPI.
- `docs/request.json`, `docs/response.json` — a real OpenSearch Dashboards request/response for `pod_labels.app: matrixkc`. Use them for parsing tests and the OpenSearch stub.
- `docs/logview-CLAUDE.md` — the original viewer's guide: detailed architecture (`norm`/`pick`, `ALL`/`VIEW`, `corrIndex`, `applyFilters`, virtual list, columns, timeline, `showDetail`). Read it before changing viewer code.

## Running & testing

`npm install`, then `npm start` (build + `electron .`); in WSL the window appears via WSLg. For scripted checks run `npx electron . --remote-debugging-port=9333 --user-data-dir=<tmp>` and drive the page over CDP (`/json` → WebSocket, `Runtime.evaluate`, `Page.captureScreenshot`); a separate `--user-data-dir` keeps test settings away from the real ones. There is no test harness — verify parsing with Node scripts against `docs/response.json`, the OpenSearch client and cache against the Docker OpenSearch in `dev/` (`app/opensearch.js` has no Electron imports, so `node -e "require('./app/opensearch').searchLogs(...)"` works), and the real cluster / window / `.exe` manually. Docker runs inside WSL — never call Windows binaries (`docker.exe`).

## Key design points

- **Data path:** each hit's `_source.message` is the original ndjson line → existing `norm()` unchanged. Attach k8s metadata as `parsed.k8s = {app, pod, namespace, container, node, cluster}` and append app/pod to `hay`. Non-JSON `message` → `RAW` record, time from the hit's `@timestamp`. Sort records by log time, then `sequenceNumber`. Feed the viewer via `setRecords(recs, name, what)` (split out of `loadText()`).
- **OpenSearch query:** `range @timestamp` (epoch_millis) + `pod_labels.app` any-of (`bool.should` of `match_phrase`) + optional `query_string`; `_source` limited to `@timestamp, message, pod_labels.app, pod, namespace, container, node, k8sClusterName`; `sort @timestamp desc`. **Pagination:** repeat with `lte` = last hit's sort value and dedupe by `_index/_id` (no `search_after`/PIT — ties at page edges must not be lost).
- **Cache:** `hits` + `coverage(pattern, app, from_ms, to_ms)`; fetch only uncovered gaps; mark coverage only for fully downloaded ranges (on limit/stop: `[last ts, to]`); never mark the last 5 minutes covered; Lucene queries bypass the cache. Prefer built-in `node:sqlite`; fall back to `better-sqlite3` only if it isn't available in Electron's Node.

## Conventions

- **Renderer: ES5-style vanilla JS** (`var`, function expressions, no modules/classes/transpiling), matching the forked viewer. Main/preload are Node CommonJS; modern syntax is fine there.
- **Zero runtime dependencies in the renderer** — no CDN, fetch of external resources, or fonts. npm deps only where needed (`electron`, `electron-builder`, possibly `better-sqlite3`).
- Always HTML-escape log-derived strings with `esc()` before `innerHTML`; highlighting via `hl()` / `jsonHighlight()` (both escape first). Reuse existing helpers (`tryJson`, `fmtTime`/`fmtFull`, `kv`/`kvSection`, `toLocalInput`, `toast`).
- **Never add variable-height content to list rows** — the virtual list assumes fixed `ROW_H` (24px). Rich content goes in the detail panel.
- Style with the CSS tokens at the top of `styles.css` (`--accent`, `--bg-2`, `--line`, `--lv-*`, `--mono`).
- UI text is in Russian, like the viewer.

## Electron security (non-negotiable)

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, strict CSP (local resources only).
- The renderer gets only the narrow `window.osApi` (`search(req, onProgress)`, `stopSearch`, `getSettings`, `saveSettings`, `testConnection`, `cacheStats`, `clearCache`) — never generic HTTP, fs, or shell access.
- Main validates every IPC argument: index name against `[\w.*,-]+`, only `_search`, size limits.
- The password is stored with `safeStorage` and **never sent back to the renderer**. Logs contain prod data (matrix ids, IPs, URLs) — don't log them to the console or anywhere outside the cache.

## Log schema (from `FormatterElastic`)

Top level: `@timestamp`, `level` (`TRACE/DEBUG/INFO/WARN/ERROR`), `logger`, `process.thread.name`, `process.pid` (optional), `servicesc.*`, `message`, `sequenceNumber`, `error.{type,message,stack_trace}` (stack root-last), `tags[]`, `ecs.version`.

- **MDC** fields are written flat at the root with dots **not** split: `correlation`, `origin`, `operation`, `traceId`, `spanId`, `client.ip`, `matrix.id` are single root keys.
- **KeyValuePairs** split dotted keys into nested objects and stringify values: `header.*` is a real nested object; `url` and `duration` (`"58"`) are strings.
- `pick(o, paths)` always splits paths on `.`, so it misses flat dotted MDC keys — use `fieldValue` (flat key first) for those.
- `correlation` pairs one request↔response; `traceId` is the whole distributed trace.

In OpenSearch the same document also appears parsed under `_source.app.*` plus k8s fields at the `_source` root (`pod`, `namespace`, `pod_labels.app`, …); `_source.@timestamp` is ingest time (ms), while `app.@timestamp` / the log line's `@timestamp` is the app's own time (ns).
