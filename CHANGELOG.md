# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

## [1.0.0] - 2026-10-20

### Added

- One device per Centreon host (every host the Centreon user sees, or the
  hosts of chosen host groups): host up, services WARNING, CRITICAL and
  UNKNOWN, unhandled problems, host acknowledged, in downtime. A host renamed
  in Centreon keeps its device.
- A "Centreon" device: the hosts down and the service problems of the whole
  setup.
- Scene triggers: a host goes down, a host is back up, a service has a problem
  (filter by state: WARNING, CRITICAL, UNKNOWN), a service is OK again,
  Centreon no longer answers. HARD states only; problems in a downtime are
  announced only if they outlast them.
- Scene actions: acknowledge the problems of a host with a comment (can be
  turned off in the configuration), read the problems for a message.
- Dashboard widget: the hosts down and the services in problem, the most
  serious first, with the unhandled ones.
- Centreon REST API v2 with a dedicated user (token login, renewed when the
  session ends), HTTP or HTTPS; clear messages for missing API rights, ACL and
  host groups; feature names, messages and documentation in English, French,
  German and Spanish.

[Unreleased]: https://github.com/guim31/gladys-centreon/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/guim31/gladys-centreon/releases/tag/v1.0.0
