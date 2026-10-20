// -----------------------------------------------------------------------------
// Centreon REST API v2 client (`http(s)://<host>/centreon/api/latest`), with
// a Centreon user allowed to reach the real-time API.
//
// The client logs in once (`POST /login`, answer `security.token`) and sends
// the token in `X-AUTH-TOKEN`; a 401 on a later request (session expired,
// Centreon restarted) logs in again, once.
//
// One read (snapshot) = the version (`platform/versions`, once an hour), the
// hosts (`monitoring/hosts`), their host groups (`monitoring/hostgroups`,
// only when the configuration filters on them) and the services WARNING,
// CRITICAL or UNKNOWN (`monitoring/services` with a `search` on the state),
// page by page.
// Acknowledgements are POSTs to `monitoring/hosts/<id>/acknowledgements` and
// `monitoring/hosts/<id>/services/<id>/acknowledgements`.
//
// Errors are thrown as CentreonError with a `kind` (ERROR_KINDS): the hub and
// the texts know what to tell the user from it.
// -----------------------------------------------------------------------------

import { httpRequest } from './http.js';

export const ERROR_KINDS = Object.freeze({
  UNREACHABLE: 'unreachable', // no answer, timeout, 502/503/504
  TLS: 'tls', // the certificate does not verify (self-signed without the option)
  AUTH: 'auth', // login or password refused
  CREDENTIALS_MISSING: 'credentials_missing', // no login or password in the configuration
  NOT_CENTREON: 'not_centreon', // something answers, but not the API of Centreon
  HTTPS_REQUIRED: 'https_required', // http:// redirected to https://
  NO_HOSTS: 'no_hosts', // no host visible: no ACL on any host for this user
  NO_GROUPS: 'no_groups', // none of the host groups typed is visible (name, or ACL)
  PERMISSION: 'permission', // 403: the user may not reach the real-time API, or act
  API: 'api', // the API refused a request (parameters)
  HTTP: 'http', // anything else
});

export class CentreonError extends Error {
  /**
   * @param {string} kind one of ERROR_KINDS
   * @param {string} message for the logs (never a secret)
   * @param {object} [extra] e.g. { status }
   */
  constructor(kind, message, extra = {}) {
    super(message);
    this.name = 'CentreonError';
    this.kind = kind;
    Object.assign(this, extra);
  }
}

const TLS_CODES = new Set([
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'CERT_HAS_EXPIRED',
  'ERR_TLS_CERT_ALTNAME_INVALID',
]);

// Rows per page: Centreon answers 10 by default.
export const PAGE_SIZE = 1000;
// Pages read at most per list (a million objects: far beyond a home setup).
export const MAX_PAGES = 1000;

// Centreon states. Hosts: 0 UP, 1 DOWN, 2 UNREACHABLE, 4 PENDING; services:
// 0 OK, 1 WARNING, 2 CRITICAL, 3 UNKNOWN, 4 PENDING.
// Only the services in a problem: on a real setup, most services are OK.
export const SERVICE_SEARCH = JSON.stringify({ 'service.state': { $in: [1, 2, 3] } });

/**
 * Whether a host is in the scope of the configuration: in one of the host
 * groups (all hosts when none is set). Names compare without case.
 */
export function inScope(host, { groups = [] } = {}) {
  if (groups.length === 0) {
    return true;
  }
  const wanted = new Set(groups.map((group) => group.toLowerCase()));
  return host.groups.some((group) => wanted.has(group.toLowerCase()));
}

// The first line of a check output (Centreon ends it with a new line).
const firstLine = (text) => String(text ?? '').split('\n')[0];

// "2026-10-20T15:54:39+00:00" -> seconds; null (never changed) -> 0.
const seconds = (date) => {
  const ms = typeof date === 'string' ? Date.parse(date) : NaN;
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : 0;
};

const isId = (value) => Number.isInteger(value) && value > 0;

export class CentreonClient {
  /**
   * @param {object} options
   * @param {string} options.url base URL of the API (…/api/latest)
   * @param {string} [options.username] Centreon login
   * @param {string} [options.password] its password
   * @param {boolean} [options.insecure] accept a certificate that does not verify
   * @param {typeof httpRequest} [options.request] test seam
   * @param {number} [options.timeoutMs]
   */
  constructor({
    url,
    username = '',
    password = '',
    insecure = false,
    request = httpRequest,
    timeoutMs = 15_000,
  }) {
    this.url = url;
    this.username = username;
    this.password = password;
    this.insecure = insecure;
    this.request = request;
    this.timeoutMs = timeoutMs;
    this.info = null;
    this.token = null;
  }

  /** Forget the version: read again before the next request (Centreon upgraded). */
  reset() {
    this.info = null;
  }

  /**
   * One HTTP exchange, errors of the transport and of the answer translated.
   * @returns {Promise<{ status: number, data: object|null }>} data: null for a 204
   * @throws {CentreonError}
   */
  async exchange(path, { method = 'GET', params = [], body, token } = {}) {
    // Not URLSearchParams: a `+` for a space is not decoded everywhere.
    const query = params
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join('&');
    const headers = { accept: 'application/json' };
    if (token) {
      headers['x-auth-token'] = token;
    }
    if (body) {
      headers['content-type'] = 'application/json';
    }
    let response;
    try {
      response = await this.request(`${this.url}${path}${query ? `?${query}` : ''}`, {
        method,
        body: body ? JSON.stringify(body) : '',
        headers,
        insecure: this.insecure,
        timeoutMs: this.timeoutMs,
      });
    } catch (err) {
      if (TLS_CODES.has(err.code)) {
        throw new CentreonError(ERROR_KINDS.TLS, `Certificate refused (${err.code})`);
      }
      if (!err.code) {
        // The server answers, but not as expected (an answer too large…).
        throw new CentreonError(ERROR_KINDS.HTTP, err.message);
      }
      throw new CentreonError(ERROR_KINDS.UNREACHABLE, `${err.code}`);
    }

    const { status } = response;
    if ([502, 503, 504].includes(status)) {
      // A reverse proxy in front of a stopped Centreon.
      throw new CentreonError(ERROR_KINDS.UNREACHABLE, `HTTP ${status}`, { status });
    }
    if (status >= 300 && status < 400) {
      const location = String(response.headers?.location ?? '');
      throw new CentreonError(
        this.url.startsWith('http:') && location.startsWith('https:')
          ? ERROR_KINDS.HTTPS_REQUIRED
          : ERROR_KINDS.NOT_CENTREON,
        `Redirected (HTTP ${status})`,
        { status },
      );
    }
    if (status === 204) {
      return { status, data: null };
    }
    let parsed;
    try {
      parsed = JSON.parse(response.body);
    } catch {
      parsed = null;
    }
    if (!parsed || typeof parsed !== 'object') {
      // The web page of another server, or a Centreon without this path.
      throw new CentreonError(
        status === 401 ? ERROR_KINDS.AUTH : ERROR_KINDS.NOT_CENTREON,
        `Not a Centreon API answer (HTTP ${status})`,
        { status },
      );
    }
    if (status >= 200 && status < 300) {
      return { status, data: parsed };
    }
    // {"code": 403, "message": "..."}
    const detail = typeof parsed.message === 'string' ? parsed.message.slice(0, 200) : '';
    if (status === 401) {
      throw new CentreonError(ERROR_KINDS.AUTH, `${method} ${path}: ${detail} (HTTP 401)`, {
        status,
      });
    }
    if (status === 403) {
      throw new CentreonError(ERROR_KINDS.PERMISSION, `${method} ${path}: ${detail} (HTTP 403)`, {
        status,
        detail,
      });
    }
    if (status === 404 && !('code' in parsed)) {
      throw new CentreonError(ERROR_KINDS.NOT_CENTREON, `${path}: HTTP 404`, { status });
    }
    throw new CentreonError(ERROR_KINDS.API, `${method} ${path}: ${detail} (HTTP ${status})`, {
      status,
    });
  }

  /** Log in, keep the token. */
  async login() {
    if (!this.username || !this.password) {
      throw new CentreonError(ERROR_KINDS.CREDENTIALS_MISSING, 'No login or password configured');
    }
    this.token = null;
    const answer = await this.exchange('/login', {
      method: 'POST',
      body: { security: { credentials: { login: this.username, password: this.password } } },
    });
    const token = answer.data?.security?.token;
    if (typeof token !== 'string' || !token) {
      throw new CentreonError(ERROR_KINDS.NOT_CENTREON, 'No token in the login answer');
    }
    this.token = token;
    return token;
  }

  /**
   * One authenticated request; logs in first, and again once on a 401.
   * @returns {Promise<object|null>} the parsed answer (null for a 204)
   * @throws {CentreonError}
   */
  async call(path, options = {}) {
    let fresh = !this.token;
    let token = this.token ?? (await this.login());
    for (;;) {
      try {
        return (await this.exchange(path, { ...options, token })).data;
      } catch (err) {
        if (err.kind !== ERROR_KINDS.AUTH) {
          throw err;
        }
        if (fresh) {
          // Logged in a moment ago: a 401 now (empty body, seen on an
          // acknowledgement without the ACL action) is a missing right.
          throw new CentreonError(ERROR_KINDS.PERMISSION, err.message, { status: err.status });
        }
        // The session expired (Centreon forgets it after its inactivity time).
        fresh = true;
        token = await this.login();
      }
    }
  }

  /** Every row of a list, page by page. */
  async list(path, params = []) {
    const rows = [];
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const answer = await this.call(path, {
        params: [...params, ['limit', String(PAGE_SIZE)], ['page', String(page)]],
      });
      if (!Array.isArray(answer?.result)) {
        throw new CentreonError(ERROR_KINDS.NOT_CENTREON, `${path}: no result list`);
      }
      rows.push(...answer.result);
      const total = Number(answer.meta?.total);
      if (answer.result.length < PAGE_SIZE || !(rows.length < total)) {
        break;
      }
    }
    return rows;
  }

  /** Read the version once (again after reset()); unknown is not an error. */
  async detect() {
    if (this.info) {
      return this.info;
    }
    let version = '';
    try {
      const answer = await this.call('/platform/versions');
      version = typeof answer?.web?.version === 'string' ? answer.web.version : '';
    } catch (err) {
      if (err.kind !== ERROR_KINDS.PERMISSION && err.kind !== ERROR_KINDS.API) {
        throw err;
      }
    }
    this.info = { version };
    return this.info;
  }

  /**
   * Host id -> names of its host groups, and the names of the groups visible.
   * A user sees a group only when an ACL resource of theirs grants it: the
   * hosts alone are not enough (seen on 24.10).
   */
  async hostGroups() {
    const groups = await this.list('/monitoring/hostgroups', [['show_host', 'true']]);
    const byHost = new Map();
    const names = new Set();
    for (const group of groups) {
      if (typeof group?.name !== 'string' || !Array.isArray(group.hosts)) {
        continue;
      }
      names.add(group.name.toLowerCase());
      for (const host of group.hosts) {
        if (isId(host?.id)) {
          byHost.set(host.id, [...(byHost.get(host.id) ?? []), group.name]);
        }
      }
    }
    return { byHost, names };
  }

  /**
   * Everything one cycle needs, in the scope of the configuration.
   * A host: `name` is its Centreon id (as text: the key of everything), `alias`
   * the name shown in Centreon.
   * @param {{ groups?: string[] }} [scope]
   * @returns {Promise<{ version: string, hosts: object[], services: object[], total: number }>}
   * @throws {CentreonError}
   */
  async snapshot(scope = {}) {
    const info = await this.detect();
    const rawHosts = await this.list('/monitoring/hosts');
    const filtered = scope.groups?.length > 0;
    const { byHost: groupsOf, names } = filtered
      ? await this.hostGroups()
      : { byHost: new Map(), names: new Set() };
    const all = rawHosts
      .filter((host) => isId(host?.id) && typeof host.name === 'string' && host.name)
      .map((host) => ({
        name: String(host.id),
        alias: host.name,
        // 0 UP, 1 DOWN, 2 UNREACHABLE (behind a parent that is down); null
        // until checked once (PENDING).
        state:
          host.checked === false || ![0, 1, 2].includes(Number(host.state))
            ? null
            : Number(host.state),
        acknowledged: host.acknowledged === true,
        downtime: Number(host.scheduled_downtime_depth) > 0,
        since: seconds(host.last_state_change),
        // SOFT (0) while Centreon retries before alerting; HARD (1) once confirmed.
        hard: Number(host.state_type) !== 0,
        groups: groupsOf.get(host.id) ?? [],
      }));
    // A user who sees no host (no ACL): taken as is, every problem would end,
    // then start again once the ACL is fixed.
    if (all.length === 0) {
      throw new CentreonError(ERROR_KINDS.NO_HOSTS, 'No host visible to the user');
    }
    if (filtered && !scope.groups.some((group) => names.has(group.toLowerCase()))) {
      // A typo, or an ACL without host groups: every host would leave the scope.
      throw new CentreonError(ERROR_KINDS.NO_GROUPS, 'None of the host groups is visible');
    }
    const hosts = all.filter((host) => inScope(host, scope));
    const byName = new Map(hosts.map((host) => [host.name, host]));

    const rawServices = await this.list('/monitoring/services', [['search', SERVICE_SEARCH]]);
    const services = rawServices
      .filter(
        (service) =>
          isId(service?.id) &&
          byName.has(String(service.host?.id)) &&
          [1, 2, 3].includes(Number(service.state)),
      )
      .map((service) => ({
        host: String(service.host.id),
        // The service id: what the API acknowledges.
        name: String(service.id),
        service:
          typeof service.display_name === 'string' && service.display_name
            ? service.display_name
            : String(service.description ?? service.id),
        // 1 WARNING, 2 CRITICAL, 3 UNKNOWN.
        state: Number(service.state),
        acknowledged: service.is_acknowledged === true || service.acknowledged === true,
        // A downtime of the service or of its host: Centreon does not notify.
        downtime:
          Number(service.scheduled_downtime_depth) > 0 ||
          byName.get(String(service.host.id)).downtime,
        since: seconds(service.last_state_change),
        hard: Number(service.state_type) !== 0,
        output: firstLine(service.output),
      }));
    return { ...info, hosts, services, total: all.length };
  }

  /** Acknowledgement body: sticky (until OK again), kept, no notification. */
  static ackBody(comment, extra = {}) {
    return {
      comment,
      is_notify_contacts: false,
      is_persistent_comment: true,
      is_sticky: true,
      ...extra,
    };
  }

  /**
   * Acknowledge the problem of a host (not its services: acknowledged one by one).
   * @returns {Promise<number>} 1 once Centreon accepted it
   */
  async acknowledgeHost(hostId, comment) {
    await this.call(`/monitoring/hosts/${encodeURIComponent(hostId)}/acknowledgements`, {
      method: 'POST',
      body: CentreonClient.ackBody(comment, { with_services: false }),
    });
    return 1;
  }

  /**
   * Acknowledge services of a host by their ids.
   * @returns {Promise<number>} the services acknowledged
   */
  async acknowledgeServices(hostId, serviceIds, comment) {
    let count = 0;
    for (const serviceId of serviceIds) {
      await this.call(
        `/monitoring/hosts/${encodeURIComponent(hostId)}/services/${encodeURIComponent(serviceId)}/acknowledgements`,
        { method: 'POST', body: CentreonClient.ackBody(comment) },
      );
      count += 1;
    }
    return count;
  }
}
