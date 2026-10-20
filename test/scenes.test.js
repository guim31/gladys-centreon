import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BASE_CONFIG, createWorld, hostDevice } from './helpers/world.js';

async function world(t, options) {
  const created = await createWorld(options);
  t.after(() => created.app.stop());
  return created;
}

test('acknowledge_host_problems acknowledges the host and its services, with a comment', async (t) => {
  const w = await world(t);
  const device = hostDevice(w.gladys, 'behindhost');
  const ack = await w.fake.sceneAction('acknowledge_host_problems', { device, message: ' Seen ' });
  assert.equal(ack.success, true, ack.error);
  assert.deepEqual(ack.data.outputs, { acknowledged: 2 });
  assert.deepEqual(
    w.centreon.acknowledged.map((entry) => [entry.host, entry.service, entry.comment]),
    [
      ['behindhost', undefined, 'Seen'],
      ['behindhost', 'ping', 'Seen'],
    ],
  );
  // Read again at once: nothing left to acknowledge.
  const again = await w.fake.sceneAction('acknowledge_host_problems', { device });
  assert.deepEqual(again.data.outputs, { acknowledged: 0 });
});

test('acknowledge_host_problems: services only on a host UP, the default comment in its language', async (t) => {
  const w = await world(t, { config: { ...BASE_CONFIG, language: 'fr' } });
  const ack = await w.fake.sceneAction('acknowledge_host_problems', {
    device: hostDevice(w.gladys, 'nas'),
  });
  // The disk was already acknowledged.
  assert.deepEqual(ack.data.outputs, { acknowledged: 2 });
  assert.deepEqual(
    w.centreon.acknowledged.map((entry) => [entry.service, entry.comment, entry.is_sticky]),
    [
      ['backup', 'Acquitté depuis Gladys', true],
      ['temperature', 'Acquitté depuis Gladys', true],
    ],
  );
});

test('acknowledge_host_problems: a problem gone meanwhile is harmless', async (t) => {
  const w = await world(t);
  // Centreon no longer has the service in problem, the integration does not know yet:
  // Centreon accepts the acknowledgement (204) and its engine ignores it.
  w.centreon.setService('nas', 'backup', 0);
  const ack = await w.fake.sceneAction('acknowledge_host_problems', {
    device: hostDevice(w.gladys, 'nas'),
  });
  assert.equal(ack.success, true, ack.error);
  assert.deepEqual(ack.data.outputs, { acknowledged: 2 });
  assert.equal(w.centreon.recovered[0].is_acknowledged, false);
});

test('acknowledge_host_problems: turned off, refused, unknown host', async (t) => {
  const off = await world(t, { config: { ...BASE_CONFIG, allow_acknowledge: false } });
  const disabled = await off.fake.sceneAction('acknowledge_host_problems', {
    device: hostDevice(off.gladys, 'behindhost'),
  });
  assert.equal(disabled.success, false);
  assert.match(disabled.error, /turned off/);
  assert.deepEqual(off.centreon.acknowledged, []);

  const w = await world(t);
  w.centreon.missing.add('ack');
  const refused = await w.fake.sceneAction('acknowledge_host_problems', {
    device: hostDevice(w.gladys, 'behindhost'),
  });
  assert.equal(refused.success, false);
  assert.match(refused.error, /ACL actions/);
  const unknown = await w.fake.sceneAction('acknowledge_host_problems', { device: 'nope' });
  assert.match(unknown.error, /not a Centreon host/);
});

test('get_problems: every host, or one, in words', async (t) => {
  const w = await world(t);
  const all = await w.fake.sceneAction('get_problems', {});
  assert.deepEqual(all.data.outputs, {
    count: 10,
    unhandled: 7,
    hosts_down: 3,
    services_critical: 4,
    services_warning: 1,
    services_unknown: 2,
    names:
      'deadhost: DOWN, outside: DOWN, behindhost: UNREACHABLE, behindhost: ping CRITICAL, ' +
      'outside: http CRITICAL, router: ping4 CRITICAL, nas: backup CRITICAL, ' +
      'nas: temperature UNKNOWN, newhost: load UNKNOWN, nas: disk WARNING',
  });

  const one = await w.fake.sceneAction('get_problems', {
    device: hostDevice(w.gladys, 'behindhost'),
  });
  assert.equal(one.data.outputs.count, 2);
  assert.equal(one.data.outputs.names, 'behindhost: UNREACHABLE, behindhost: ping CRITICAL');
});

test('the scene actions fail clearly while Centreon does not answer', async (t) => {
  const w = await world(t);
  w.centreon.failure = 'down';
  w.clock.advance(20_000);
  const ack = await w.fake.sceneAction('get_problems', {});
  assert.equal(ack.success, false);
  assert.match(ack.error, /does not answer/);
});
