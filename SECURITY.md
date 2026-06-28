# Security Policy

Thanks for helping keep Hermes Mobile and its users safe. This client can drive a
powerful self-hosted agent, so security reports are taken seriously.

## Reporting a vulnerability

**Please do not open a public issue for security vulnerabilities.**

Report privately, one of:

- **GitHub Security Advisories** — open a private report at
  <https://github.com/stasstepv/hermes-pwa/security/advisories/new> (preferred), or
- **Email** — `stasstep@gmail.com` with subject `SECURITY: hermes-pwa`.

Please include:

- a description of the issue and its impact,
- steps to reproduce (or a proof of concept),
- affected version / commit, and your environment (browser, OS, install method).

## What to expect

This is a solo, spare-time project, so response is best-effort:

- acknowledgement of your report as soon as reasonably possible,
- an assessment and, if confirmed, a fix and a coordinated disclosure timeline,
- credit for the report if you'd like it.

Please allow reasonable time for a fix before any public disclosure.

## Scope

In scope: this client's code (the PWA, the Dashboard plugin glue in `dashboard/`,
`push_common.py`, `__init__.py`) and its handling of credentials, sessions, and agent
actions.

Out of scope: vulnerabilities in **Hermes Agent itself** (report those to
[Nous Research](https://github.com/NousResearch/Hermes-Agent)), and issues that require
a already-compromised host or physical device access.

For the client's security model and known limitations, see
[`docs/SECURITY.md`](./docs/SECURITY.md).
