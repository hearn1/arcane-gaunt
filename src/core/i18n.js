// Placeholder for future i18n string table. Returns key as-is (identity).
let _lang = "en";

export function setLang(lang) {
  _lang = lang;
}

export function getLang() {
  return _lang;
}

export function t(key) {
  return key;
}

export default { t, setLang, getLang };