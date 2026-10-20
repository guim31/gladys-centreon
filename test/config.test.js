import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_CONFIG,
  MAX_GROUPS,
  addressOf,
  normalizeConfig,
  parseApiUrl,
  parseGroups,
} from '../src/config.js';

test('the address, with or without scheme, path or API path, gives the REST API URL', () => {
  const api = 'http://192.0.2.5/centreon/api/latest';
  const cases = {
    '192.0.2.5': api,
    'http://192.0.2.5': api,
    'http://192.0.2.5/': api,
    'http://192.0.2.5/centreon': api,
    'http://192.0.2.5/centreon/': api,
    // Copied from the browser, or from the API documentation.
    'http://192.0.2.5/centreon/monitoring/resources?filter=x': api,
    'http://192.0.2.5/centreon/api/latest/monitoring/hosts': api,
    'http://192.0.2.5/centreon/api/v24.10': api,
    ' centreon.lan:8080 ': 'http://centreon.lan:8080/centreon/api/latest',
    'https://192.0.2.5': 'https://192.0.2.5/centreon/api/latest',
    'https://192.0.2.5:443/centreon': 'https://192.0.2.5/centreon/api/latest',
    '[2001:db8::5]': 'http://[2001:db8::5]/centreon/api/latest',
    // A web interface served at another path, or at the root.
    'https://monitoring.example.com/supervision/':
      'https://monitoring.example.com/supervision/api/latest',
    'https://monitoring.example.com/api/latest': 'https://monitoring.example.com/api/latest',
  };
  for (const [typed, expected] of Object.entries(cases)) {
    assert.equal(parseApiUrl(typed), expected, typed);
  }
  const bad = ['', '   ', 'ftp://192.0.2.5', 'http://admin:pass@192.0.2.5', 'https://', 42];
  for (const typed of bad) {
    assert.equal(parseApiUrl(typed), null, String(typed));
  }
  assert.equal(addressOf(api), '192.0.2.5/centreon');
});

test('host groups: separated by commas, `;` or new lines, without duplicates', () => {
  assert.deepEqual(parseGroups(' homelab, linux-servers ;Homelab\noffice,,'), [
    'homelab',
    'linux-servers',
    'office',
  ]);
  assert.deepEqual(parseGroups(undefined), []);
  assert.equal(
    parseGroups(Array.from({ length: 30 }, (_, i) => `g${i}`).join(',')).length,
    MAX_GROUPS,
  );
});

test('normalizeConfig: defaults, an invalid address, booleans as strings', () => {
  const empty = normalizeConfig({});
  assert.equal(empty.apiUrl, null);
  assert.equal(empty.invalidUrl, false);
  assert.equal(empty.pollIntervalMs, 60_000);
  assert.equal(empty.allowAcknowledge, true);
  assert.equal(empty.allowSelfSigned, false, 'certificates are checked unless ticked');
  assert.equal(empty.language, DEFAULT_CONFIG.language);
  assert.deepEqual(empty.groups, []);

  const config = normalizeConfig({
    centreon_url: 'ftp://192.0.2.5',
    username: ' gladys ',
    password: ' abc \n',
    host_groups: 'homelab',
    poll_interval: 120,
    allow_acknowledge: 'false',
    allow_self_signed: 'true',
    language: 'xx',
  });
  assert.equal(config.invalidUrl, true);
  assert.equal(config.username, 'gladys');
  assert.equal(config.password, 'abc');
  assert.deepEqual(config.groups, ['homelab']);
  assert.equal(config.pollIntervalMs, 120_000);
  assert.equal(config.allowAcknowledge, false);
  assert.equal(config.allowSelfSigned, true);
  assert.equal(config.language, 'fr');
  assert.equal(normalizeConfig({ poll_interval: '15' }).pollIntervalMs, 60_000);
});
