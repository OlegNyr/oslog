# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`log-viewer.html` is a single-file, **zero-dependency** viewer for ECS JSON-lines (ndjson) logs produced by Spring Boot (logback → ECS via `FormatterElastic`). It opens directly from `file://` — no server, no CDN/fetch/external scripts or fonts. The shipped `log-viewer.html` is a **build artifact**: all HTML, CSS, and vanilla JS end up inlined in the one file.

⚠️ **Do not hand-edit `log-viewer.html`** — it is generated. Edit the sources under `src/` and run `node build.js` to regenerate it. The output is still a single self-contained file with zero runtime dependencies; the build itself is plain Node (no npm packages).

`acd.log` and `matrixkc.log` are real sample logs (kubectl-dumped ndjson) for manual testing. `exchange-panel-task.md` is a feature spec (in Russian) for an "Обмен" (request↔response pairing) panel — read it before touching exchange/correlation logic.

## Sources & build

- **`src/index.html`** — the HTML shell. Two markers get filled in by the build: `/*@build:styles@*/` inside `<style>`, and `/*@build:script@*/` inside the one IIFE. Edit the page markup, the `<body>`, and the `"use strict"` IIFE wrapper here.
- **`src/styles.css`** — all CSS (everything that was inside `<style>`).
- **`src/js/NN-*.js`** — the script body, split into ordered fragments (`05-state.js`, `10-field-extraction.js`, … `95-resizable-detail-panel.js`). They are concatenated **in filename order** into the *same* IIFE, so they share one closure (`ALL`, `VIEW`, `filters`, …) exactly as before — there are no ES modules, no imports/exports. Add a new section as `NN-name.js`; pick `NN` to place it in the right order. Match the existing ES5-style vanilla JS.
- **`build.js`** — `node build.js` inlines `styles.css` and all `js/*.js` into `src/index.html` → `log-viewer.html`. Zero dependencies.

## Running & testing

There is no lint or test harness. To verify a change: run `node build.js`, then open the regenerated `log-viewer.html` in a browser and drag one of the sample `.log` files onto the page (or paste ndjson with Ctrl/Cmd+V, or use "open file…"). Check the browser console for errors — that is the only feedback loop. The built `log-viewer.html` **is committed** so GitHub Pages serves it without a build step; always rebuild and commit it together with `src/` changes.

## Architecture

Everything is inside one IIFE in the `<script>` block (assembled from the `src/js/*.js` fragments — see *Sources & build* above). The data flow:

- **`norm(raw, lineNo)`** — parses one ndjson line into a normalized record `{raw, parsed, level, msg, ts, tsMs, logger, thread, seq, traceId, hasErr, hay}`. Uses **`pick(o, [paths])`** to tolerate schema variation (e.g. `level` / `log.level` / `severity`). Unparseable lines become `level:"RAW"`. `hay` is a precomputed lowercase haystack for fast substring search.
- **`ALL`** — array of all normalized records. **`VIEW`** — array of *indices into `ALL`* that pass the current filters. This `ALL`/`VIEW` indirection is central: row IDs (`idx`) are positions in `ALL`; `k` is a position in `VIEW`. Keep them straight.
- **`corrIndex`** — `Map<correlation, number[]>` of indices into `ALL`, rebuilt once per load in `loadText()`. Powers the "Обмен" (exchange) panel: `buildExchange(r)` groups a correlation's records into request/response sides and renders them at the top of the detail panel with navigation buttons (`gotoRecord`). Direction (Входящий/Исходящий) is read from the **request** record's `origin` only.
- **`applyFilters()`** — rebuilds `VIEW` from `filters` (`q`, `regex`, `logger`/`loggerNeg`, `thread`, `trace`, `correlation`, `tsFrom`/`tsTo` time interval, and `fields` — a list of `{path,label,val}` field=value filters) + per-level toggles (`levelOn`), then re-renders chips, status, and the list. Call this after mutating any filter. Each active filter (except `q`/levels) shows a removable chip via `renderChips()`. The time interval uses `datetime-local` inputs (local time, matching the displayed `fmtTime`); records with an unparseable timestamp are excluded while an interval is set. Field filters are added from the **⊕** button on each detail-panel `kv()` row: `addFieldFilter(path,label,rec)` captures `fieldValue(rec,path)` (flat key first for MDC dotted keys, then nested via `pick`) and matches `String(fieldValue(r,path))===val`.
- **Virtual list** (`renderVirtual`) — fixed row height (`ROW_H` = 24px); only the visible slice (+`BUF` overscan) is rendered into `vrows` with a `translateY` offset. **Do not add variable-height content to list rows** — it breaks virtualization. Rich/expandable content goes in the scrollable detail panel only.
- **Columns** — built-in columns (`#`/time/level/logger/thread/message) plus user-added columns (`customCols`, entries `{path,label,var}`). Added two ways: the "колонки" popover lists root-level keys (`rootKeys()`), and the **▦** button on each detail-panel `kv()` row adds that field (supports nested paths like `header.key`, `process.thread.name`, `error.type`). `cellValue(r,path)` resolves via `fieldValue` (flat key → nested `pick`), objects shown as compact JSON. Widths are CSS variables (`--c-*` for built-ins, `--cc-N` per custom) referenced by both `#colHead` and every row cell, so dragging a header resizer updates header + all rows live with no re-render. `buildColHead()` regenerates the header. Custom columns sit between thread and message.
- **`renderTimeline()`** — the strip above the list. Granularity is **adaptive** (`tlField`/`tlKeyOf`): when `VIEW` spans many traces it groups by `traceId`; drilled into one trace it groups by `spanId`; one span → one bar per record. It computes a span (min/max `tsMs`) per group, greedily packs them into lanes, and draws each as a `%`-positioned bar (so it's resize-proof). Rebuilt on every `applyFilters()`; `tlRange` holds the drawn `{t0,t1}` for the drag→interval mapping. Click a bar → `gotoRecord(minIdx)`; drag a region → `setIntervalFilter()` sets `tsFrom`/`tsTo`. `updateTimelineSel()` re-highlights the selected row's group (by `data-key`) without a full rebuild (called from `selectRow`).
- **`showDetail(r)`** — builds the right-hand detail panel imperatively (sections: time, logger, message, trace/context, request/header, process, error+stack, raw JSON). Clickable values carry a `data-act` attribute wired at the end of the function to set a filter (`trace`/`logger`/`thread`) or copy raw.

Filters set elsewhere (clickable detail values, chips) all funnel through `filters.*` then `applyFilters()`. Chips in `renderChips()` mirror active `filters` and clear them on `×`.

## Conventions

- **ES5-style vanilla JS** throughout (`var`, function expressions, no arrow-function classes/modules). Match it — no transpiled syntax, no imports.
- Always **HTML-escape** user/log-derived strings via `esc()` before inserting into `innerHTML`. Highlighting uses `hl()`, JSON coloring uses `jsonHighlight()`, both escape first.
- Reuse existing helpers rather than adding libraries: `tryJson()`, `fmtTime()`/`fmtFull()`, `kv()`/`kvSection()`, `shortLogger()`, `formatStack()`.
- Styling uses the CSS custom properties at the top of `<style>` (`--accent`, `--bg-2`, `--line`, `--lv-*`, etc.). Use these tokens; monospace (`--mono`) for data.

## Log schema (what `FormatterElastic` actually emits)

The logs come from `FormatterElastic.java` (logback → ECS). The schema below is confirmed from that source, not guessed — keep `norm()`/`pick()` in sync with it.

Top-level fields: `@timestamp` (ISO instant), `level` (standard logback `TRACE/DEBUG/INFO/WARN/ERROR` — never `WARNING`), `logger`, `process.thread.name`, `process.pid` (**optional** — absent until Spring Boot's PidFileWriter runs), `servicesc.{name,version,environment,node.name}` plus root-level `system`/`service`/`reporter`, `message`, `sequenceNumber` (real monotonic logback counter), `error.{type,message,stack_trace}` (stack is **root-last** order), `tags[]` (deduped + sorted), `ecs.version`.

**Two distinct channels produce the app-specific fields — they nest differently:**
- **MDC** is written flat to the root with keys written **verbatim, dots NOT split**. So `correlation` / `origin` / `operation` (and `traceId` if it's an MDC key) live at the root as single keys.
- **KeyValuePairs** (SLF4J fluent `addKeyValue`) **do** split dotted keys into nested objects, and **stringify every value**. So `header.key` / `header.client.ip` / `header.matrix.id` are a real nested `header` object, `url` is a string, and `duration` is a **string** (`"58"`), not a number — the viewer already treats it as a string.

⚠️ `pick(o, paths)` always splits each path on `.` and walks nested objects. That means a field arriving as a flat MDC key containing a dot (e.g. an MDC key literally named `trace.id`) would be stored as `o["trace.id"]` but `pick(["trace.id"])` would look for `o.trace.id` and miss it. Only KeyValuePairs are genuinely nested. Watch this when adding fields to `norm()`.

`correlation` pairs one request↔response exchange and is distinct from `traceId` (the whole distributed trace).
