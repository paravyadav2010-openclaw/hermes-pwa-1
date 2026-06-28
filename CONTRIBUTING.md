# Contributing to Hermes-Agent PWA (unofficial)

Thanks for considering a contribution! This is an **independent, community-built,
unofficial** mobile PWA client for [Hermes Agent](https://github.com/NousResearch/Hermes-Agent).
It is **not** affiliated with or endorsed by Nous Research — see [`NOTICE`](./NOTICE).

Before writing code, please read the three rules in **[Ground rules](#ground-rules)**
below — they are specific to this project and one of them (clean-room) is a hard
legal requirement, not a style preference.

---

## Table of contents

- [Ground rules](#ground-rules)
- [Code of conduct](#code-of-conduct)
- [Project layout](#project-layout)
- [Development setup](#development-setup)
- [Testing rules](#testing-rules)
- [Quality gates — before commit & before PR](#quality-gates--before-commit--before-pr)
- [Branching & fork workflow](#branching--fork-workflow)
- [Commit conventions](#commit-conventions)
- [Developer Certificate of Origin (sign-off)](#developer-certificate-of-origin-sign-off)
- [Pull request process](#pull-request-process)
- [Continuous integration (CI)](#continuous-integration-ci)
- [Merge requirements](#merge-requirements)
- [Releases (CD)](#releases-cd)
- [AI-assisted contributions](#ai-assisted-contributions)
- [Reporting bugs](#reporting-bugs)
- [Reporting security issues](#reporting-security-issues)
- [Where to start](#where-to-start)

---

## Ground rules

These three are non-negotiable. A PR that violates them will be closed regardless
of quality.

### 1. Clean-room — never copy upstream or third-party code (legal)

This client is built **clean-room** against the **publicly observable** Hermes
Agent HTTP/WebSocket API.

- ✅ **Allowed:** read the public API behavior, event names, and payload shapes;
  reimplement compatible logic yourself.
- ❌ **Forbidden:** copy/paste source from the Hermes desktop app, the Hermes web
  UI, or any other proprietary or unlicensed codebase into this repo — even
  "just the transport" or "just a helper". The Hermes desktop app has **no
  license** (all rights reserved); copying from it is a copyright violation.
- The Hermes backend is MIT (© 2025 Nous Research). MIT code may be reused **only**
  with attribution in [`NOTICE`](./NOTICE) — but prefer reimplementing.
- Protocol knowledge belongs in the typed contract module
  (`packages/core/src/transport/`), with a comment noting it was reconstructed
  from the public API — not pasted from their files.

By opening a PR you certify the code is your own (see
[DCO sign-off](#developer-certificate-of-origin-sign-off)).

### 2. Respect the upstream brand

This is an **unofficial** client. Don't imply endorsement by Nous Research. Refer
to "Hermes" only nominatively ("client for Hermes"), never as part of branding or
logos. See [`NOTICE`](./NOTICE).

### 3. Security & privacy first — this client drives a powerful agent

- **Never commit secrets** (API keys, tokens, `.env`, certificates). CI and
  `.gitignore` guard against this; don't work around them.
- **Never persist credentials** (session tokens, ws-tickets) — they live in memory
  only. Don't add code that writes them to `localStorage`/`IndexedDB`/cookies.
- **Approvals must stay explicit and unspoofable.** Don't add "auto-approve" paths
  or anything that lets the UI act on the agent without a clear user decision.
- Treat anything the agent returns (markdown, tool output) as **untrusted** — no
  `dangerouslySetInnerHTML`, no `eval`.

---

## Code of conduct

Be respectful and constructive. Harassment, discrimination, or abusive behavior
is not tolerated. We follow the spirit of the
[Contributor Covenant](https://www.contributor-covenant.org/). Report conduct
issues privately to the maintainer (see [security reporting](#reporting-security-issues)
for the private channel).

---

## Project layout

This is an npm-workspaces monorepo. The split is intentional and enforced — read
[`ARCHITECTURE.md`](./ARCHITECTURE.md) and [`CODING_RULES.md`](./CODING_RULES.md)
before your first change.

| Package         | What it is                                                       | Hard rule                                                                |
| --------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `packages/core` | Framework-agnostic TypeScript: transport, domain mappers, stores | **No React, no DOM APIs.** Portable to native later. Enforced by eslint. |
| `packages/web`  | React PWA shell: screens, components, service worker             | No raw `fetch`/`WebSocket` in components — go through `core`.            |
| `packages/tab`  | Hermes Dashboard tab plugin entry                                | Thin.                                                                    |
| `dashboard/`    | Plugin manifest + Python plugin API + built `dist/`              | —                                                                        |

The agent guidance in [`AGENTS.md`](./AGENTS.md) also applies to human contributors.

---

## Development setup

Requirements: **Node.js 18+ (LTS)** and **npm** (workspaces).

```bash
git clone https://github.com/<your-fork>/HermesAgent-MobilePWA.git
cd HermesAgent-MobilePWA
npm install
npm run dev          # Vite dev server on http://localhost:3010
```

The client is designed to run **same-origin** as a Hermes Dashboard plugin
(installs as a "Mobile" tab → opens the PWA). For local dev against a running
Hermes instance, see [`docs/INSTALL.md`](./docs/INSTALL.md) and the network
recipes in [`docs/`](./docs/).

---

## Testing rules

Tests are part of the change, not an afterthought.

- **Every behavior change ships with tests.** A bug fix starts with a **failing
  test** that reproduces the bug, then the fix turns it green.
- **What to test where:**
  - `packages/core` — unit tests for transport, domain mappers, and stores
    (Vitest). Core logic must be covered; this is the portable, framework-agnostic
    layer.
  - `packages/web` — component/screen behavior (Vitest + Testing Library).
  - `dashboard/` (Python) — `python -m unittest` under `dashboard/tests`.
- **No flaky tests.** Do not depend on wall-clock time, `Date.now()`, random
  values, or async ordering. Use fake timers and deterministic inputs.
- **Don't test the mock.** Mocking our own transport and asserting it echoes the
  mock proves nothing about the real gateway. For protocol-facing code, assert
  mappers/parsers against **recorded real frames** where possible (the project ships a recorded-gateway contract test for this).
- **Don't lower coverage thresholds** to make a build pass. Raise coverage instead.
- Run the full suite locally with coverage before pushing:
  ```bash
  npm run test:coverage
  npm run test:python
  ```

## Quality gates — before commit & before PR

There are **no automated git hooks** in this repo — the gates are your
responsibility. They mirror the [CI pipeline](#continuous-integration-ci) exactly,
so a green local run means a green CI run.

**Before each commit** (fast loop):

```bash
npm run typecheck     # tsc, strict
npm run lint          # eslint (incl. core/shell boundary)
npm test              # vitest run
```

**Before opening / updating a PR** (full gate — must all be green):

```bash
npm run typecheck       # tsc, strict
npm run lint            # eslint (incl. core/shell boundary)
npm run format:check    # prettier --check (configs, workflows, docs)
npm test                # vitest run
npm run test:python     # Python dashboard plugin tests
npm run version:check   # version is consistent across all manifests
npm run build           # production build
npm run verify:pwa      # PWA readiness (manifest, SW, no external services)
npm run verify:pack     # npm package payload check
```

> **Committed build output.** `dashboard/dist/**` is tracked in git (the plugin
> ships the prebuilt bundle). If your change touches `packages/web`/`packages/tab`,
> run `npm run build` and **commit the regenerated `dashboard/dist`** in the same
> PR, so the shipped bundle matches the source.

> **Tip:** `format:check` currently lint-checks configs/workflows/docs, not all
> source — run `npm run format` (prettier write) on any source you touch so style
> stays consistent regardless.

---

## Branching & fork workflow

1. **Fork** the repo and clone your fork.
2. Create a topic branch off the default branch:
   ```bash
   git checkout -b feat/short-description
   ```
   Branch naming: `type/short-description` (e.g. `fix/reconnect-double-timer`,
   `docs/contributing`). Types match the commit types below.
3. Make your change in small, focused commits.
4. Keep your branch up to date by rebasing on the default branch.
5. Push to your fork and open a PR (see [PR process](#pull-request-process)).

---

## Commit conventions

We use **[Conventional Commits](https://www.conventionalcommits.org/)**:

```
type(scope): short imperative summary
```

- **Types:** `feat`, `fix`, `docs`, `refactor`, `perf`, `test`, `build`, `chore`.
- **Scope:** the area touched, e.g. `pwa`, `core`, `chat`, `transport`, `push`,
  `ci` (optional but encouraged — matches existing history like `fix(pwa): …`).
- Subject in the imperative, ≤ ~72 chars, no trailing period.
- Reference issues in the body: `Closes #123` / `Fixes #456`.

Example:

```
fix(transport): reject pending RPC requests on websocket close

Pending promises previously hung forever when the socket dropped mid-request,
freezing the composer. Reject them so callers can recover.

Closes #42
```

---

## Developer Certificate of Origin (sign-off)

To keep the project's IP clean (important for an independent third-party client),
every commit must be **signed off** under the
[Developer Certificate of Origin 1.1](https://developercertificate.org/):

```bash
git commit -s -m "fix(transport): ..."
```

This appends a `Signed-off-by: Your Name <you@example.com>` line and certifies that:

- you wrote the contribution yourself (or have the right to submit it under the
  project's MIT license), **and**
- you did **not** copy it from a proprietary or unlicensed source (see
  [clean-room](#1-clean-room--never-copy-upstream-or-third-party-code-legal)).

Use a real name/identity. PRs with unsigned commits will be asked to re-sign.

---

## Pull request process

1. **Open an issue first** for anything non-trivial (new feature, large refactor,
   protocol change) so the approach can be agreed before you build it. Small bug
   fixes and docs can go straight to a PR.
2. **One concern per PR.** Keep it focused and reviewable — ideally **under ~500
   changed lines** and a handful of files. Split large work into stacked PRs.
3. Fill in the PR description: what changed, **why**, and how you tested it.
   Include `Closes #NNN`.
4. Make sure **all [quality gates](#quality-gates--before-commit--before-pr) pass**
   and commits are **signed off**.
5. Enable **"Allow edits from maintainers"** so small fixups can be applied.
6. **Dependencies** (`package.json` / `package-lock.json`) should be changed only
   when the PR genuinely needs them, with justification — gratuitous dependency
   bumps will be rejected.
7. A maintainer reviews; address feedback by pushing follow-up commits (don't
   force-push away review history until the final squash).

For functional areas, stabilize transport/reconnect/privacy before cosmetic
cleanup, so PRs don't refactor on top of known-unstable code.

---

## Continuous integration (CI)

Every **push to `main`** and every **pull request targeting `main`** runs
`.github/workflows/ci.yml` on Node 20. The pipeline is the source of truth — it
runs, in order, and **fails the build on the first red step**:

1. `npm ci` — clean install from the lockfile
2. `npm run typecheck`
3. `npm run lint`
4. `npm run format:check`
5. `npm test`
6. `npm run test:python`
7. `npm run version:check` — version consistent across all manifests
8. `npm run build`
9. `npm run verify:pwa`
10. `npm run verify:pack`

Rules:

- **Don't push to bypass CI.** If a step is red locally it will be red in CI; fix
  it first (the [pre-PR gate](#quality-gates--before-commit--before-pr) is the same
  set of commands).
- **Never disable, skip, or weaken a CI step** to get a PR green. If a check is
  wrong, fix the check in its own PR with justification.
- Keep `package-lock.json` in sync — CI uses `npm ci` and will fail on drift.
- CI must be **green on the PR head commit** before merge.

## Merge requirements

A PR may be merged only when **all** of the following hold:

- ✅ CI is green on the latest commit.
- ✅ At least **one maintainer approval**, with review feedback resolved.
- ✅ Branch is **up to date with `main`** (rebase if needed).
- ✅ All commits are **[signed off](#developer-certificate-of-origin-sign-off)** (DCO).
- ✅ Scope is **one concern**, description explains _what/why/how-tested_, linked
  issue (`Closes #NNN`).
- ✅ If `packages/web`/`tab` changed, the regenerated `dashboard/dist` is committed.

Merge style: **squash merge**, keeping a [Conventional Commit](#commit-conventions)
title. Maintainers should preserve the `Signed-off-by` trailer(s) in the squashed
commit. Direct pushes to `main` are not allowed — everything lands via PR.

> Maintainers: enable branch protection on `main` — require the `CI` status check,
> require 1 review, require branch up-to-date, and disallow force-push/deletion.

## Releases (CD)

Releases are tag-driven. Pushing a tag matching `v*.*.*` triggers
`.github/workflows/release.yml`, which **re-runs the entire CI gate** and then:

- `npm publish --provenance --access public` (publishes the package; needs the
  `NPM_TOKEN` secret),
- creates a **GitHub Release** with auto-generated notes.

Release rules:

- **Only maintainers cut releases.** Contributors never publish.
- **Bump the version in one place of truth and keep it consistent** — `version:check`
  enforces that the version matches across `package.json` (×3), `plugin.yaml`,
  both `manifest.json` files, and `health()` in `dashboard/plugin_api.py`. A
  mismatched version fails the release.
- **Tag matches the version.** Tag `vX.Y.Z` must equal the manifests' version.
- Move shipped items out of `CHANGELOG.md` `Unreleased` into the new version
  section **before** tagging.
- Follow **semver**; while pre-1.0, breaking changes bump the minor.
- A release only happens off a **green** tagged commit — the gate runs again in
  `release.yml`, so a broken tag does not publish.

---

## AI-assisted contributions

AI tools are welcome, but **there must be a human in the loop.** You are
responsible for understanding, reviewing, and being able to explain every line you
submit — including that it does not violate the
[clean-room rule](#1-clean-room--never-copy-upstream-or-third-party-code-legal).
Unreviewed, machine-generated PRs will be declined.

---

## Reporting bugs

Open a GitHub issue with enough context to reproduce **without external links**:

- what you did, what you expected, what happened;
- Hermes server version (from the dashboard) and this client's version;
- platform (iOS/Android, browser, installed-as-PWA or in-browser);
- relevant console/network output (with secrets redacted).

The maintainer cannot fix what can't be reproduced — a clear repro is the most
valuable part of a bug report.

---

## Reporting security issues

**Do not open a public issue for vulnerabilities.** This client can drive a
powerful agent, so handle security findings privately: email the maintainer
(see the repository owner's GitHub profile) with details and reproduction steps,
and allow reasonable time for a fix before disclosure. See
[`docs/SECURITY.md`](./docs/SECURITY.md) for the security model.

---

## Where to start

- Good first areas: documentation, accessibility, test coverage, and small
  cleanups (dead code / duplication) — **after** the functional blockers are resolved.
- Read [`CODING_RULES.md`](./CODING_RULES.md), [`ARCHITECTURE.md`](./ARCHITECTURE.md),
  and [`docs/THIRD_PARTY_CLIENT.md`](./docs/THIRD_PARTY_CLIENT.md) to understand
  the constraints this project operates under.

Thank you for helping make a self-hosted agent usable from a phone. 📱
