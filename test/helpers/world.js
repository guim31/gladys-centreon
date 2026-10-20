// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys, a fake Centreon, a temporary
// /data and a manual clock, with the integration wired on top through
// registerHandlers. No timer runs: the tests read Centreon with
// `world.hub.pollAll()`.
// -----------------------------------------------------------------------------

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';
import { hostIds, instanceIds } from '../../src/devices.js';
import { Store } from '../../src/store.js';
import { ADDRESS, API_URL, FakeCentreon, PASSWORD, USERNAME, hostId } from './fakeCentreon.js';

// The integration logs every change; keep the test output readable.
process.env.LOG_LEVEL ??= 'silent';

export const BASE_CONFIG = {
  centreon_url: ADDRESS,
  username: USERNAME,
  password: PASSWORD,
  language: 'en',
};

/** A manual clock, shared by the hub and the tests (the fixture was read at 16:0x UTC). */
export function createClock(start = Date.parse('2026-10-20T16:10:00Z')) {
  const clock = {
    time: start,
    now: () => clock.time,
    advance(ms) {
      clock.time += ms;
    },
  };
  return clock;
}

export async function createWorld({
  clock = createClock(),
  centreon = new FakeCentreon(),
  config = BASE_CONFIG,
  devices = [],
  connect = true,
  dataDir = mkdtempSync(join(tmpdir(), 'gladys-centreon-')),
  timings = {},
  timers = false,
} = {}) {
  const gladys = createFakeGladys({ config, devices });
  const app = registerHandlers(gladys, {
    store: new Store(dataDir),
    request: (url, options) => {
      if (!url.startsWith(new URL(API_URL).origin)) {
        throw Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' });
      }
      return centreon.request(url, options);
    },
    timers,
    timings,
    now: clock.now,
  });
  if (connect) {
    await gladys.connect();
    await app.ready;
  }
  return { gladys, fake: gladys.fake, centreon, app, hub: app.hub, clock, dataDir };
}

// Tests speak in host names; the devices are keyed on the Centreon host ids.
export const hostDevice = (gladys, name) => hostIds(gladys, hostId(name)).device;
export const hostFeature = (gladys, name, key) => hostIds(gladys, hostId(name)).feature(key);
export const instanceFeature = (gladys, key) => instanceIds(gladys).feature(key);

/** Add discovered devices in Gladys, as the user would (all by default). */
export async function createDevices(world, filter = () => true) {
  for (const device of world.fake.discoveredDevices.filter(filter)) {
    await world.fake.deviceCreated(device);
  }
}

export { ADDRESS, API_URL, FakeCentreon, PASSWORD, USERNAME, hostId };
