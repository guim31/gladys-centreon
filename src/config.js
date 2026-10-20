// -----------------------------------------------------------------------------
// Integration configuration: defaults (they mirror the `default` values of the
// manifest `config_schema`, see test/manifest.test.js) and normalization, so
// the rest of the code never deals with strings, blanks or `undefined`.
//
// One Centreon, through its REST API v2 (`/centreon/api/latest`). The address
// can be typed with or without scheme and path, or copied from the browser
// (`http://192.0.2.5/centreon/monitoring/resources`) or from an API URL.
// -----------------------------------------------------------------------------

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

// Refresh intervals offered in the configuration, in seconds.
export const POLL_INTERVALS = ['30', '60', '120', '300'];

export const DEFAULT_CONFIG = {
  centreon_url: '',
  username: '',
  password: '',
  host_groups: '',
  poll_interval: '60',
  allow_acknowledge: true,
  allow_self_signed: false,
  language: 'fr',
};

export const MAX_GROUPS = 20;

const API_PATH = '/api/latest';
// Where the packages and the ISO of Centreon install the web interface.
export const DEFAULT_PREFIX = '/centreon';

/**
 * Parse the address typed by the user into the base URL of the REST API:
 * `192.0.2.5`, `centreon.lan:8080`, `https://192.0.2.5/centreon/…`, an API
 * URL, or a web interface served at another path. HTTP unless typed (the
 * default of a Centreon install), path `/centreon` unless typed.
 * @param {unknown} raw
 * @returns {string|null} `http(s)://host[:port]/prefix/api/latest`, null when unusable
 */
export function parseApiUrl(raw) {
  if (typeof raw !== 'string') {
    return null;
  }
  const text = raw.trim();
  if (!text) {
    return null;
  }
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `http://${text}`;
  let url;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) {
    return null;
  }
  // Credentials in the address would end up in the logs.
  if (url.username || url.password) {
    return null;
  }
  // Everything before /api/ is where the web interface lives; a page of the
  // interface (`/centreon/monitoring/resources`) keeps its first segment.
  const path = url.pathname.replace(/\/+$/, '');
  const at = path.search(/\/api(\/|$)/);
  let prefix;
  if (at >= 0) {
    prefix = path.slice(0, at);
  } else if (path) {
    prefix = path.match(/^\/[^/]+/)[0];
  } else {
    prefix = DEFAULT_PREFIX;
  }
  return `${url.origin}${prefix}${API_PATH}`;
}

/** The address shown to the user: host, port and path, without scheme nor API path. */
export const addressOf = (apiUrl) =>
  apiUrl.replace(/^https?:\/\//, '').replace(new RegExp(`${API_PATH}$`), '');

/** Host group names, separated by commas, `;` or new lines. */
export function parseGroups(raw) {
  if (typeof raw !== 'string') {
    return [];
  }
  const seen = new Set();
  const groups = [];
  for (const entry of raw.split(/[\n,;]/)) {
    const name = entry.trim();
    if (name && !seen.has(name.toLowerCase())) {
      seen.add(name.toLowerCase());
      groups.push(name);
    }
  }
  return groups.slice(0, MAX_GROUPS);
}

const isTrue = (value) => value === true || value === 'true';

/**
 * @param {Record<string, unknown>} raw the configuration returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const text = (key) => (typeof source[key] === 'string' ? source[key].trim() : '');
  const pick = (key, list) => {
    const value = source[key] === undefined || source[key] === null ? '' : String(source[key]);
    return list.includes(value) ? value : DEFAULT_CONFIG[key];
  };
  const typed = text('centreon_url');
  const apiUrl = parseApiUrl(typed);
  return {
    apiUrl,
    invalidUrl: Boolean(typed) && !apiUrl,
    username: text('username'),
    // A pasted password often carries a trailing space or new line.
    password: text('password'),
    groups: parseGroups(source.host_groups),
    pollIntervalMs: Number(pick('poll_interval', POLL_INTERVALS)) * 1000,
    allowAcknowledge:
      source.allow_acknowledge === undefined || source.allow_acknowledge === null
        ? DEFAULT_CONFIG.allow_acknowledge
        : isTrue(source.allow_acknowledge),
    // A Centreon behind HTTPS often has a self-signed certificate: off by default all the same.
    allowSelfSigned:
      source.allow_self_signed === undefined || source.allow_self_signed === null
        ? DEFAULT_CONFIG.allow_self_signed
        : isTrue(source.allow_self_signed),
    language: LANGUAGES.includes(source.language) ? source.language : DEFAULT_CONFIG.language,
  };
}
