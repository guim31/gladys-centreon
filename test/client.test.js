// The REST API client against the fake Centreon (real 24.10.12 answers): the
// login and its token, the snapshot, the scope (host groups), the errors, and
// acknowledgements.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ERROR_KINDS,
  CentreonClient,
  PAGE_SIZE,
  SERVICE_SEARCH,
  inScope,
} from '../src/centreon/client.js';
import { API_URL, FakeCentreon, PASSWORD, USERNAME, hostId } from './helpers/fakeCentreon.js';

const clientFor = (centreon, options = {}) =>
  new CentreonClient({
    url: API_URL,
    username: USERNAME,
    password: PASSWORD,
    request: (url, request) => centreon.request(url, request),
    ...options,
  });

async function rejectsWith(promise, kind) {
  await assert.rejects(promise, (err) => {
    assert.equal(err.kind, kind, err.message);
    return true;
  });
}

const at = (iso) => Date.parse(iso) / 1000;

test('snapshot: version, hosts and the services in a problem, from the real answers', async () => {
  const centreon = new FakeCentreon();
  const snapshot = await clientFor(centreon).snapshot();
  assert.equal(snapshot.version, '24.10.12');
  assert.equal(snapshot.total, 6);
  assert.deepEqual(
    snapshot.hosts.map((host) => [host.alias, host.state, host.downtime, host.hard]),
    [
      ['behindhost', 2, false, true], // behind deadhost, down: UNREACHABLE
      ['deadhost', 1, false, true],
      ['nas', 0, false, true],
      ['newhost', null, false, true], // never checked: PENDING (state 4)
      ['outside', 1, true, true],
      ['router', 0, false, true],
    ],
  );
  assert.equal(snapshot.hosts[2].name, hostId('nas'), 'the key is the Centreon id');
  assert.deepEqual(snapshot.hosts[2].groups, [], 'no host group read without a filter');
  assert.deepEqual(
    snapshot.services.find((service) => service.service === 'backup'),
    {
      host: hostId('nas'),
      name: '12',
      service: 'backup',
      state: 2,
      acknowledged: false,
      downtime: false,
      since: at('2026-10-20T16:03:15+00:00'),
      hard: true,
      output: 'CRITICAL - last backup 26 hours ago',
    },
  );
  const byName = (name) => snapshot.services.find((service) => service.service === name);
  assert.equal(byName('disk').acknowledged, true, 'is_acknowledged');
  assert.equal(byName('http').downtime, true);
  assert.equal(byName('ping4').hard, false, 'SOFT while Centreon retries');
  assert.equal(byName('load').state, 3, 'a service checked on a PENDING host counts');
  assert.equal(snapshot.services.length, 7);
  assert.equal(snapshot.hosts.find((host) => host.alias === 'newhost').since, 0, 'null date');
  // The token of the login, and the search asks for the services in a problem.
  const services = centreon.calls.find((call) => call.path === '/monitoring/services');
  assert.equal(services.params.search, SERVICE_SEARCH);
  assert.equal(services.params.limit, String(PAGE_SIZE));
  assert.equal(centreon.logins, 1);
});

test('host groups keep their hosts, case aside', async () => {
  const centreon = new FakeCentreon();
  const { hosts, services, total } = await clientFor(centreon).snapshot({ groups: ['HomeLab'] });
  assert.deepEqual(
    hosts.map((host) => host.alias),
    ['nas', 'newhost', 'router'],
  );
  assert.deepEqual(hosts[2].groups, ['homelab', 'office']);
  assert.equal(total, 6, 'the total counts every host');
  assert.ok(
    services.every((service) =>
      [hostId('router'), hostId('nas'), hostId('newhost')].includes(service.host),
    ),
  );
  assert.equal(inScope({ groups: [] }, { groups: ['x'] }), false);
  assert.equal(inScope({ groups: [] }, {}), true);
});

test('host groups the user cannot see: a clear error, not an empty scope', async () => {
  const centreon = new FakeCentreon();
  await rejectsWith(clientFor(centreon).snapshot({ groups: ['nope'] }), ERROR_KINDS.NO_GROUPS);
  centreon.missing.add('hostgroups'); // the ACL resource has hosts, no host groups
  await rejectsWith(clientFor(centreon).snapshot({ groups: ['homelab'] }), ERROR_KINDS.NO_GROUPS);
  // One group found is enough.
  centreon.missing.clear();
  const { hosts } = await clientFor(centreon).snapshot({ groups: ['nope', 'office'] });
  assert.equal(hosts.length, 3);
});

test('a service of a host in downtime is in downtime too', async () => {
  const centreon = new FakeCentreon();
  centreon.setService('outside', 'ssh', 2, { scheduled_downtime_depth: 0 });
  const { services } = await clientFor(centreon).snapshot();
  assert.equal(services.find((service) => service.service === 'ssh').downtime, true);
});

test('the output keeps its first line only', async () => {
  const centreon = new FakeCentreon();
  centreon.setService('nas', 'multi', 1, { output: 'WARNING - two disks\ndisk1 ok\ndisk2 85%' });
  const { services } = await clientFor(centreon).snapshot();
  assert.equal(
    services.find((service) => service.service === 'multi').output,
    'WARNING - two disks',
  );
});

test('lists are read page by page', async () => {
  const centreon = new FakeCentreon();
  const base = centreon.host('router');
  for (let index = 0; index < PAGE_SIZE + 5; index += 1) {
    centreon.hosts.push({ ...base, id: 1000 + index, name: `host-${index}` });
  }
  const { hosts } = await clientFor(centreon).snapshot();
  assert.equal(hosts.length, PAGE_SIZE + 11);
  const pages = centreon.calls.filter((call) => call.path === '/monitoring/hosts');
  assert.deepEqual(
    pages.map((call) => call.params.page),
    ['1', '2'],
  );
});

test('the version is read once, again after reset()', async () => {
  const centreon = new FakeCentreon();
  const client = clientFor(centreon);
  await client.snapshot();
  await client.snapshot();
  const reads = () => centreon.calls.filter((call) => call.path === '/platform/versions');
  assert.equal(reads().length, 1);
  client.reset();
  await client.snapshot();
  assert.equal(reads().length, 2);
});

test('an expired session logs in again, once', async () => {
  const centreon = new FakeCentreon();
  const client = clientFor(centreon);
  await client.snapshot();
  centreon.expireSessions();
  await client.snapshot();
  assert.equal(centreon.logins, 2);
});

test('errors: credentials, rights, no host, not Centreon, unreachable, TLS, https', async () => {
  const centreon = new FakeCentreon();
  await rejectsWith(clientFor(centreon, { password: 'wrong' }).snapshot(), ERROR_KINDS.AUTH);
  await rejectsWith(
    clientFor(centreon, { password: '' }).snapshot(),
    ERROR_KINDS.CREDENTIALS_MISSING,
  );

  centreon.missing.add('api'); // no "Reach API Realtime": the login works, then 403
  await rejectsWith(clientFor(centreon).snapshot(), ERROR_KINDS.PERMISSION);
  centreon.missing.clear();

  centreon.missing.add('hosts'); // no ACL resource
  await rejectsWith(clientFor(centreon).snapshot(), ERROR_KINDS.NO_HOSTS);
  centreon.missing.clear();

  centreon.failure = 'not_centreon';
  await rejectsWith(clientFor(centreon).snapshot(), ERROR_KINDS.NOT_CENTREON);
  await rejectsWith(
    clientFor(centreon, { url: 'http://192.0.2.10/other/api/latest' }).snapshot(),
    ERROR_KINDS.NOT_CENTREON,
  );
  centreon.failure = 'https';
  await rejectsWith(clientFor(centreon).snapshot(), ERROR_KINDS.HTTPS_REQUIRED);
  centreon.failure = 'proxy';
  await rejectsWith(clientFor(centreon).snapshot(), ERROR_KINDS.UNREACHABLE);
  centreon.failure = 'down';
  await rejectsWith(clientFor(centreon).snapshot(), ERROR_KINDS.UNREACHABLE);

  await rejectsWith(
    clientFor(centreon, {
      request: async () => ({ status: 401, headers: {}, body: '<html>Proxy login</html>' }),
    }).snapshot(),
    ERROR_KINDS.AUTH,
  );
  const failing = (code) => async () => {
    throw Object.assign(new Error(code), { code });
  };
  await rejectsWith(
    clientFor(centreon, { request: failing('SELF_SIGNED_CERT_IN_CHAIN') }).snapshot(),
    ERROR_KINDS.TLS,
  );
  await rejectsWith(
    clientFor(centreon, { request: failing('ECONNRESET') }).snapshot(),
    ERROR_KINDS.UNREACHABLE,
  );
});

test('the password never appears in an error message nor in a URL', async () => {
  const centreon = new FakeCentreon();
  for (const failure of [null, 'not_centreon', 'proxy', 'down']) {
    centreon.failure = failure;
    await assert.rejects(
      clientFor(centreon, { password: failure ? PASSWORD : 'wrong' }).snapshot(),
      (err) => {
        assert.ok(!err.message.includes(PASSWORD));
        return true;
      },
    );
  }
  centreon.failure = null;
  await clientFor(centreon).snapshot();
  assert.ok(centreon.calls.every((call) => !JSON.stringify(call.params).includes(PASSWORD)));
});

test('acknowledge: the host, then its services one by one, sticky and silent', async () => {
  const centreon = new FakeCentreon();
  const client = clientFor(centreon);
  assert.equal(await client.acknowledgeHost(hostId('deadhost'), 'Seen'), 1);
  assert.equal(centreon.host('deadhost').acknowledged, true);
  const ids = ['backup', 'temperature'].map((name) => String(centreon.service('nas', name).id));
  assert.equal(await client.acknowledgeServices(hostId('nas'), ids, 'Seen'), 2);
  assert.equal(centreon.service('nas', 'backup').is_acknowledged, true);
  assert.deepEqual(centreon.acknowledged[0], {
    host: 'deadhost',
    comment: 'Seen',
    is_notify_contacts: false,
    is_persistent_comment: true,
    is_sticky: true,
    with_services: false,
  });
  await rejectsWith(client.acknowledgeHost('999', 'Seen'), ERROR_KINDS.API);
  // Without the ACL actions, Centreon answers 401 with an empty body.
  centreon.missing.add('ack');
  await rejectsWith(client.acknowledgeHost(hostId('outside'), 'Seen'), ERROR_KINDS.PERMISSION);
});
