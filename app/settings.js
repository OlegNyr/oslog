'use strict';
// Settings in userData/settings.json; the password lives separately in
// userData/password.bin, encrypted with safeStorage (DPAPI on Windows).
// The password never leaves the main process.
const fs = require('fs');
const path = require('path');
const { app, safeStorage } = require('electron');

const DEFAULTS = {
  url: '',
  username: '',
  caPath: '',
  insecure: false,
  index: 'plchat-k8s-prod-*',
  cacheDays: 7,
  cacheMaxMb: 2048,
};

const INDEX_RE = /^[\w.*,-]+$/;

function file(name) { return path.join(app.getPath('userData'), name); }

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return null; }
}

function writeAtomic(p, data) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, data, { mode: 0o600 });
  fs.renameSync(tmp, p);
}

function load() {
  const s = readJson(file('settings.json'));
  const out = Object.assign({}, DEFAULTS);
  if (s && typeof s === 'object') {
    for (const k of Object.keys(DEFAULTS)) if (k in s) out[k] = s[k];
  }
  return out;
}

function hasPassword() { return fs.existsSync(file('password.bin')); }

// 'secure' — OS store (DPAPI on Windows, Keychain, libsecret/kwallet);
// 'weak' — Linux without a keyring (e.g. WSL): Chromium's basic_text backend,
// only obfuscated; allowed for development, flagged in the settings dialog;
// 'none' — cannot store a password at all.
function passwordStorage() {
  // basic_text is checked first: once plain text is enabled,
  // isEncryptionAvailable() reports true for it too
  if (process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text') {
    safeStorage.setUsePlainTextEncryption(true);
    return safeStorage.isEncryptionAvailable() ? 'weak' : 'none';
  }
  return safeStorage.isEncryptionAvailable() ? 'secure' : 'none';
}

function getPassword() {
  if (!hasPassword() || passwordStorage() === 'none') return '';
  try { return safeStorage.decryptString(fs.readFileSync(file('password.bin'))); }
  catch (e) { throw new Error('не удалось расшифровать сохранённый пароль — введите его заново'); }
}

function setPassword(pw) {
  if (passwordStorage() === 'none') throw new Error('шифрование недоступно в этой системе — пароль не сохранён');
  writeAtomic(file('password.bin'), safeStorage.encryptString(pw));
}

function clearPassword() {
  try { fs.unlinkSync(file('password.bin')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
}

// What the renderer may see: everything except the password.
function getPublic() {
  return Object.assign(load(), { hasPassword: hasPassword(), passwordStorage: passwordStorage() });
}

function str(v, name, max) {
  if (typeof v !== 'string') throw new Error(name + ': ожидается строка');
  v = v.trim();
  if (v.length > max) throw new Error(name + ': слишком длинное значение');
  return v;
}

function int(v, name, min, max) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(name + ': число от ' + min + ' до ' + max);
  return n;
}

// Validates a patch from the renderer against the current settings and
// returns {settings, password} where password is undefined (keep), '' (clear)
// or the new value. Throws with a user-facing message on bad input.
function validate(patch, base) {
  if (!patch || typeof patch !== 'object') throw new Error('неверные настройки');
  const s = Object.assign({}, base || load());
  if ('url' in patch) {
    const u = str(patch.url, 'URL', 2048).replace(/\/+$/, '');
    if (u) {
      let parsed;
      try { parsed = new URL(u); } catch (e) { throw new Error('URL: неверный адрес'); }
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new Error('URL: только http(s)');
      if (parsed.username || parsed.password) throw new Error('URL: логин и пароль задаются отдельными полями');
      if (parsed.search || parsed.hash) throw new Error('URL: без параметров и #');
    }
    s.url = u;
  }
  if ('username' in patch) s.username = str(patch.username, 'логин', 256);
  if ('caPath' in patch) s.caPath = str(patch.caPath, 'CA-сертификат', 1024);
  if ('insecure' in patch) s.insecure = patch.insecure === true;
  if ('index' in patch) {
    const ix = str(patch.index, 'индекс', 512);
    if (!INDEX_RE.test(ix)) throw new Error('индекс: допустимы буквы, цифры, _ . * , -');
    s.index = ix;
  }
  if ('cacheDays' in patch) s.cacheDays = int(patch.cacheDays, 'срок хранения кэша', 1, 365);
  if ('cacheMaxMb' in patch) s.cacheMaxMb = int(patch.cacheMaxMb, 'размер кэша', 100, 102400);

  let password;
  if (patch.clearPassword === true) password = '';
  else if ('password' in patch && patch.password !== '' && patch.password != null) {
    if (typeof patch.password !== 'string' || patch.password.length > 1024) throw new Error('пароль: неверное значение');
    password = patch.password;
  }
  return { settings: s, password };
}

function save(patch) {
  const { settings, password } = validate(patch);
  if (password === '') clearPassword();
  else if (password !== undefined) setPassword(password);
  writeAtomic(file('settings.json'), JSON.stringify(settings, null, 2));
  return getPublic();
}

module.exports = { load, getPublic, getPassword, validate, save, INDEX_RE };
