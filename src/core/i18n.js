import { EN_STRINGS, FORMAT_RE } from "./strings.js";

let _lang = "en";
const _warned = new Set();

function warnOnce(key) {
  if (!_warned.has(key)) {
    _warned.add(key);
    console.warn(`[i18n] missing key: "${key}"`);
  }
}

export function setLang(lang) {
  _lang = lang;
}

export function getLang() {
  return _lang;
}

export function t(key) {
  if (key in EN_STRINGS) return EN_STRINGS[key];
  warnOnce(key);
  return key;
}

export function format(key, params = {}) {
  let str = t(key);
  FORMAT_RE.lastIndex = 0;
  return str.replace(FORMAT_RE, (_, name) =>
    name in params ? String(params[name]) : `$${name}`
  );
}

export default { t, format, setLang, getLang };
