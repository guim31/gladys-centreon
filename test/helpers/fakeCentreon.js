// -----------------------------------------------------------------------------
// An in-memory Centreon REST API v2, seeded with the real answers of Centreon
// 24.10.12 (test/fixtures/centreon): login and token, the hosts, the host
// groups, the services in a problem (the `search` on their state), pages,
// acknowledgements and the real error answers. Tests change its state (host
// states, services, downtimes, failures, rights) between two reads.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';

export const ADDRESS = '192.0.2.10';
export const API_URL = `http://${ADDRESS}/centreon/api/latest`;
export const USERNAME = 'gladys';
export const PASSWORD = 'test-password-0123';

export const fixture = JSON.parse(
  readFileSync(new URL('../fixtures/centreon/centreon-24.10.12.json', import.meta.url), 'utf8'),
);
const answer = (name) => structuredClone(fixture[name].response);

const json = (status, body) => ({
  status,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

const CHECKED = '2026-10-20T16:10:00+00:00';
const SEARCH = '{"service.state":{"$in":[1,2,3]}}';

/** The Centreon id of a host of the fixture, by name (the tests speak in names). */
export function hostId(name) {
  const host = fixture.hosts.response.result.find((row) => row.name === name);
  return host ? String(host.id) : name;
}

export class FakeCentreon {
  constructor({ version = '24.10.12' } = {}) {
    this.version = version;
    this.hosts = answer('hosts').result;
    this.services = answer('services').result;
    this.groups = answer('hostgroups').result;
    /** 'down' (connection refused), 'proxy' (502), 'not_centreon', 'https' (redirect), or null */
    this.failure = null;
    /** Rights the user lacks: 'api' (Reach API Realtime), 'ack', 'hosts', 'hostgroups'. */
    this.missing = new Set();
    this.calls = [];
    this.acknowledged = [];
    this.tokens = new Set();
    this.logins = 0;
    this.nextId = 100;
    /** Services back to OK: no longer listed, still known to Centreon. */
    this.recovered = [];
  }

  host(name) {
    return this.hosts.find((host) => host.name === name);
  }

  service(host, description) {
    return this.services.find(
      (service) => service.host.name === host && service.description === description,
    );
  }

  /** Forget every token: the session expired. */
  expireSessions() {
    this.tokens.clear();
  }

  /** Put a host in a state: 0 UP, 1 DOWN, 2 UNREACHABLE. */
  setHost(name, state, extra = {}) {
    Object.assign(this.host(name), {
      state,
      state_type: 1,
      checked: true,
      last_check: CHECKED,
      acknowledged: false,
      ...extra,
    });
  }

  /** Put a service in a state (0 removes it from the answers: OK). */
  setService(host, description, state, extra = {}) {
    const existing = this.service(host, description);
    if (state === 0) {
      // Out of the answers (OK), but still a service of Centreon.
      if (existing) {
        this.recovered.push({ ...existing, state: 0 });
      }
      this.services = this.services.filter((service) => service !== existing);
      return;
    }
    if (existing) {
      Object.assign(existing, { state, state_type: 1, ...extra });
      return;
    }
    const owner = this.host(host);
    this.services.push({
      id: this.nextId++,
      description,
      display_name: description,
      host: { id: owner.id, name: owner.name, alias: owner.alias, display_name: owner.name },
      is_acknowledged: false,
      scheduled_downtime_depth: 0,
      last_check: CHECKED,
      last_state_change: '2026-10-20T16:00:00+00:00',
      output: `${description} is ${state}\n`,
      state,
      state_type: 1,
      ...extra,
    });
  }

  /** The network seam of the client (src/centreon/http.js). */
  async request(url, { method = 'GET', body, headers = {} }) {
    if (this.failure === 'down') {
      throw Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
    }
    if (this.failure === 'proxy') {
      return { status: 502, headers: {}, body: '<html>Bad Gateway</html>' };
    }
    if (this.failure === 'https') {
      return { status: 301, headers: { location: url.replace('http:', 'https:') }, body: '' };
    }
    if (this.failure === 'not_centreon' || !url.startsWith(API_URL)) {
      return { status: 404, headers: { 'content-type': 'text/html' }, body: '<html>Hi</html>' };
    }
    const target = new URL(url);
    const path = target.pathname.slice(new URL(API_URL).pathname.length);
    const params = Object.fromEntries(target.searchParams);
    this.calls.push({ method, path, params });

    if (method === 'POST' && path === '/login') {
      const { login, password } = JSON.parse(body).security.credentials;
      if (login !== USERNAME || password !== PASSWORD) {
        return json(401, answer('login_refused'));
      }
      this.logins += 1;
      const token = `token-${this.logins}`;
      this.tokens.add(token);
      const reply = answer('login');
      reply.security.token = token;
      return json(200, reply);
    }
    if (!this.tokens.has(headers['x-auth-token'])) {
      return json(401, answer('invalid_token'));
    }
    if (method === 'GET' && path === '/platform/versions') {
      const versions = answer('versions');
      versions.web.version = this.version;
      return json(200, versions);
    }
    if (this.missing.has('api')) {
      return json(403, answer('hosts_no_api'));
    }
    const page = (rows) => {
      const limit = Number(params.limit ?? 10);
      const at = (Number(params.page ?? 1) - 1) * limit;
      return json(200, {
        result: rows.slice(at, at + limit),
        meta: {
          page: Number(params.page ?? 1),
          limit,
          search: {},
          sort_by: {},
          total: rows.length,
        },
      });
    };
    const visible = this.missing.has('hosts') ? [] : this.hosts;
    if (method === 'GET' && path === '/monitoring/hosts') {
      return page(visible);
    }
    if (method === 'GET' && path === '/monitoring/hostgroups') {
      if (this.missing.has('hostgroups')) {
        return page([]);
      }
      return page(
        this.groups.map((group) => ({
          ...group,
          hosts: group.hosts.filter((member) => visible.some((host) => host.id === member.id)),
        })),
      );
    }
    if (method === 'GET' && path === '/monitoring/services') {
      // Centreon ignores a search it cannot parse: every service, OK ones too.
      assert(params.search === SEARCH, `unexpected search ${params.search}`);
      const ids = new Set(visible.map((host) => host.id));
      return page(this.services.filter((service) => ids.has(service.host.id)));
    }
    const ack = path.match(/^\/monitoring\/hosts\/(\d+)(?:\/services\/(\d+))?\/acknowledgements$/);
    if (method === 'POST' && ack) {
      if (this.missing.has('ack')) {
        return { status: 401, headers: {}, body: '' }; // what Centreon answers
      }
      const request = JSON.parse(body);
      const host = this.hosts.find((row) => String(row.id) === ack[1]);
      if (!host) {
        return json(404, answer('ack_host_not_found'));
      }
      if (ack[2]) {
        const service = [...this.services, ...this.recovered].find(
          (row) => String(row.id) === ack[2] && row.host.id === host.id,
        );
        if (!service) {
          return json(404, { code: 404, message: 'Service not found' });
        }
        this.acknowledged.push({ host: host.name, service: service.description, ...request });
        // Centreon Engine ignores the acknowledgement of a service OK.
        service.is_acknowledged = service.state !== 0;
      } else {
        this.acknowledged.push({ host: host.name, ...request });
        // Centreon Engine ignores the acknowledgement of a host UP.
        host.acknowledged = host.state !== 0;
      }
      return { status: 204, headers: {}, body: '' };
    }
    return json(404, {
      code: 404,
      message: `No route found for "${method} ${url}"`,
    });
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
