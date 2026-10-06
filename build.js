#!/usr/bin/env node
/*
 * build.js — assembles the renderer page app/renderer/index.html (loaded by
 * the Electron window) from the editable sources in src/.
 *
 *   node build.js
 *
 * It inlines src/styles.css and concatenates every src/js/*.js fragment (in
 * filename order) into the IIFE inside src/index.html. No npm dependencies,
 * no transpiling. The page's CSP gets the sha256 of that inline script.
 * The output is generated — don't hand-edit it.
 */
'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const SRC = path.join(ROOT, 'src');
const JS_DIR = path.join(SRC, 'js');
const OUT = path.join(ROOT, 'app', 'renderer', 'index.html');

// Everything is normalized to LF. The HTML parser turns CRLF into LF before
// the CSP hash of the inline script is checked, so a page written with CRLF
// (a Windows checkout with core.autocrlf) gets its whole script blocked.
function read(p) { return fs.readFileSync(p, 'utf8').replace(/\r\n?/g, '\n'); }

const tpl = read(path.join(SRC, 'index.html'));
const nl = '\n';

const css = read(path.join(SRC, 'styles.css')).replace(/\n$/, '');

const fragments = fs.readdirSync(JS_DIR)
  .filter(f => f.endsWith('.js'))
  .sort();
if (!fragments.length) throw new Error('no js fragments found in ' + JS_DIR);

const script = fragments
  .map(f => read(path.join(JS_DIR, f)).replace(/\n$/, ''))
  .join(nl + nl);

const STYLE_MARK = '/*@build:styles@*/';
const SCRIPT_MARK = '/*@build:script@*/';
if (tpl.indexOf(STYLE_MARK) < 0) throw new Error('missing ' + STYLE_MARK + ' in src/index.html');
if (tpl.indexOf(SCRIPT_MARK) < 0) throw new Error('missing ' + SCRIPT_MARK + ' in src/index.html');

let out = tpl
  .replace(STYLE_MARK, () => css)
  .replace(SCRIPT_MARK, () => script);

// The CSP allows exactly the one inline script, by hash.
const HASH_MARK = '@build:script-hash@';
const m = /<script>([\s\S]*?)<\/script>/.exec(out);
if (!m || out.indexOf('<script', m.index + 1) >= 0) throw new Error('expected exactly one inline <script> in src/index.html');
if (out.indexOf(HASH_MARK) < 0) throw new Error('missing ' + HASH_MARK + ' in the CSP of src/index.html');
const hash = 'sha256-' + crypto.createHash('sha256').update(m[1], 'utf8').digest('base64');
out = out.replace(HASH_MARK, () => hash);

if (out.indexOf('\r') >= 0) throw new Error('CR left in the page — the CSP hash would not match');

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, out);

const kb = (Buffer.byteLength(out, 'utf8') / 1024).toFixed(1);
console.log('built ' + path.relative(ROOT, OUT) + '  (' + fragments.length + ' js fragments, ' + kb + ' KB)');
