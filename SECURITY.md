# Security policy

## Reporting a vulnerability

Please do **not** report a security problem in a public issue, pull request or
forum post.

Report it privately through GitHub instead: open the **Security** tab of this
repository, then **Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only
asks the maintainers for a private contact, without any detail of the problem,
and send the report there.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- the log lines that help (remove tokens, passwords and addresses first).

The fix ships as a new version of the integration, and the advisory is
published once users can update.

## Supported versions

Only the latest release receives security fixes: update the integration from
Gladys before reporting a problem.

## Scope

In scope: the code of this repository and the Docker image it publishes.

What the integration handles:

- **Secrets**: the password of the Centreon user is a `secret` field of the
  Gladys configuration. The integration reads it from Gladys at startup, keeps
  it in memory, sends it only to the Centreon address of the configuration
  (the body of `POST /api/latest/login`), and never writes it to `/data` nor
  to the logs. The session token Centreon answers is kept in memory only and
  sent in the `X-AUTH-TOKEN` header. The user has the rights Centreon gives
  it: the documentation asks for a dedicated, non-administrator user with
  "Reach API Realtime", ACL resources and, only if acknowledging is wanted,
  the acknowledgement actions; the acknowledgement scene action can be turned
  off.
- **Stored in `/data`**: `centreon-state.json`, the problems already seen
  (host ids, host and service names, state, start time, check output), the
  address and host groups of the configuration, and a truncated hash of the
  login, so that a restart neither repeats nor misses a scene event. No
  password, no token.
- **Network**: requests go only to the Centreon address typed in the
  configuration, in HTTP unless `https://` is typed (the default of a Centreon
  install: on an untrusted network, serve Centreon in HTTPS, as the password
  travels at each login). "Accept self-signed certificates" is off by default;
  ticked, the connection is encrypted but the server is not authenticated.
  The integration opens no port and calls no cloud service.

Out of scope: Gladys Assistant itself (see its
[security policy](https://github.com/GladysAssistant/Gladys/security/policy)),
Centreon itself, and the hosts it monitors.
