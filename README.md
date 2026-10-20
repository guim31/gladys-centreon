# Centreon for Gladys Assistant

A [Gladys Assistant](https://gladysassistant.com) integration for
[Centreon](https://www.centreon.com/): your monitored hosts and their services
in Gladys, scenes that react when a host goes down or a service fails, the
problems of a host acknowledged from a scene, and a dashboard widget of the
problems in progress.

It reads the REST API v2 of Centreon (`/centreon/api/latest`) on your local
network, with a dedicated Centreon user.

## Features

- **One device per host** (every host the Centreon user sees, or the hosts of
  chosen host groups): host up, services WARNING, CRITICAL and UNKNOWN,
  unhandled problems, host acknowledged, in downtime.
- **A "Centreon" device**: the hosts down and the service problems of the
  whole setup.
- **Scene triggers**: a host goes down, a host is back up, a service has a
  problem (filter: WARNING, CRITICAL, UNKNOWN), a service is OK again,
  Centreon no longer answers. HARD states only; problems in a downtime are
  held, as Centreon holds its notifications.
- **Scene actions**: acknowledge the problems of a host (with a comment, can
  be turned off), read the problems (counts and list).
- **Widget**: the hosts down and the services in problem, the most serious
  first, with the unhandled ones.
- Feature names, messages and documentation in English, French, German and
  Spanish.

## Requirements

- Gladys Assistant 5.1.0 or later.
- Centreon with its REST API v2 (tested on 24.10), its web interface reachable
  from Gladys.
- A dedicated, non-administrator Centreon user allowed to "Reach API
  Realtime", with an ACL resource holding the hosts (and the host groups to
  filter on) and, to acknowledge, the ACL actions to acknowledge hosts and
  services.

## Installation

1. In Gladys, open **Integrations** → **Install from GitHub** and enter the
   address of this repository: `https://github.com/guim31/gladys-centreon` (or
   install **Centreon** from the catalog once it is listed).
2. In **Configuration**, enter the address of Centreon (`192.168.1.2`:
   `http://` and `/centreon` are added), the user and its password. Save, then
   click **Test the connection**.
3. Open the **Discover** tab and add the hosts to follow.

The user guide is in [`docs/en.md`](docs/en.md) (also in
[French](docs/fr.md), [German](docs/de.md) and [Spanish](docs/es.md)); Gladys
links it from the Configuration screen.

## How it works

The integration logs in once (`POST /login`, token in `X-AUTH-TOKEN`, logged
in again when Centreon ends the session). Every minute by default, it reads
`monitoring/hosts` (state, state type, acknowledgement, downtime depth,
checked, last state change) and `monitoring/services` with the search
`{"service.state":{"$in":[1,2,3]}}` (the services in a problem), page by page,
plus `monitoring/hostgroups` when the configuration filters on host groups and
`platform/versions` once an hour. A device is keyed on the Centreon host id: a
host renamed in Centreon keeps its device. The states of the added devices are
sent only when they change (and every 6 hours), the scene events on every HARD
change, added device or not. The problems already seen are kept in `/data`: a
restart neither repeats nor misses one. Acknowledgements are POSTs on
`monitoring/hosts/<id>/acknowledgements` and
`monitoring/hosts/<id>/services/<id>/acknowledgements`, sticky, persistent,
without notification.

## Checked on a real Centreon

On 20/10/2026, the Docker image of the integration ran with the constraints of
the Gladys sandbox (read-only rootfs, no capability, 256 MB) against Centreon
24.10.12 (community all-in-one image `yelfoss/centreon:24.10`, its web
installer run by hand) with a dedicated non-administrator user: checks driven
by files (WARNING, CRITICAL, UNKNOWN, SOFT then HARD), a host DOWN, a host
UNREACHABLE behind it, a host in a downtime, a host never checked (PENDING),
acknowledgements, users without "Reach API Realtime", without ACL, without
the acknowledgement actions. The answers are kept as fixtures in
[`test/fixtures/centreon`](test/fixtures/centreon).

## Limitations

- One Centreon per integration (the central server); host and service states
  only (no metrics, no performance data, no BAM).
- Polling: a problem that comes and goes between two reads is missed.
- A service in problem removed from monitoring counts as OK again.
- At most 30 scene events per read.
- Not checked: Centreon before 24.10, a remote server, LDAP or SSO users,
  Centreon behind a reverse proxy.

## Development

```bash
npm ci
npm run format:check && npm run lint && npm test
npx -y github:GladysAssistant/integration-store --skip-image-check .
```

The tests run against the fake Gladys of the SDK and an in-memory Centreon
(`test/helpers/fakeCentreon.js`) seeded with real answers. See
[`CLAUDE.md`](CLAUDE.md) for the project rules.

## Credits

- Started from the official
  [integration template](https://github.com/GladysAssistant/integration-template-js)
  and the [integration SDK](https://github.com/GladysAssistant/integration-sdk-js)
  of Gladys Assistant (Apache-2.0).
- The [Centreon REST API v2 documentation](https://docs.centreon.com/docs/api/rest-api-v2/)
  and the answers of a real Centreon 24.10 were the references for the API
  calls; no code is copied from another project.
- Cover: the Centreon logo (`logo-centreon-white.svg`) from the
  [Centreon repository](https://github.com/centreon/centreon/tree/develop/centreon/www/img)
  (Apache-2.0), a trademark of Centreon.
- Architecture shared with
  [gladys-icinga](https://github.com/guim31/gladys-icinga) and
  [gladys-checkmk](https://github.com/guim31/gladys-checkmk).

## Disclaimer

Not affiliated with Centreon. Centreon is a trademark of Centreon.

## License

[Apache-2.0](LICENSE)
