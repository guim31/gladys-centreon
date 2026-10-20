# Real answers of Centreon

`centreon-24.10.12.json` holds answers of a real Centreon 24.10.12
(community all-in-one Docker image `yelfoss/centreon:24.10`, web installer run
by hand, 20/10/2026), read with a dedicated non-administrator user allowed to
"Reach API Realtime", with an ACL resource on every host and the ACL actions to
acknowledge hosts and services:

- `login`, `login_refused`: `POST /api/latest/login` (the token is replaced);
- `versions`: `GET /platform/versions` (the widget list left out);
- `hosts`: `GET /monitoring/hosts`, one page of 1000;
- `hostgroups`, `hostgroups_no_acl`: `GET /monitoring/hostgroups?show_host=true`
  with the host groups in the ACL resource, and without them (empty: hosts in
  the resource are not enough);
- `services`: `GET /monitoring/services` with the search
  `{"service.state":{"$in":[1,2,3]}}`;
- `hosts_no_acl`, `hosts_no_api`, `invalid_token`, `ack_host_not_found`: the
  error answers, with their HTTP status.

The test setup: checks driven by files, `nas` (WARNING acknowledged, CRITICAL,
UNKNOWN), `router` (a CRITICAL still SOFT), `deadhost` (DOWN), `behindhost`
(child of `deadhost`: UNREACHABLE), `outside` (in a downtime, with its
services) and `newhost` (no active check: PENDING, with a service UNKNOWN still
SOFT). Addresses are documentation ranges; no secret.

Also seen on this Centreon, and not in the file: an acknowledgement answers
`204` (also for a host UP or a service OK, which the engine then ignores), and
a user without the ACL action answers `401` with an empty body; a `search`
Centreon cannot parse is ignored (every service, OK ones too).
