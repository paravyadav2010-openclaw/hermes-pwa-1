# Changelog

All notable changes are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/); this project uses [SemVer](https://semver.org/).

## Unreleased

## 0.1.0 — 2026-06-28

Initial public release — an installable, mobile-first PWA control plane for the
self-hosted [Hermes Agent](https://github.com/NousResearch/Hermes-Agent), shipped as a
Hermes Dashboard plugin. Independent, unofficial client.

### Added

- Installable PWA with Add-to-Home-Screen on iOS Safari and Android Chrome.
- Chat with streaming replies; Activity inbox with approvals; Projects/kanban; Agents & system screens.
- Same-origin Dashboard session auth — no separate mobile credentials.
- Web push notifications (VAPID), scoped to the active Hermes profile.
- Read-only update-check endpoint + in-app notification banner with manual update instructions.
- Settings install-prompt button when the browser exposes `beforeinstallprompt`.
- `npx hermes-pwa install` npm installer wrapper.
- Tailscale Serve setup docs and a security/privacy statement.
- GitHub Actions CI and release workflows.

### Security & hardening

- ws-ticket passed via the WebSocket subprotocol (never in the URL); credentials never persisted.
- Local transcript cache purged on logout and on user switch.
- Authenticated Dashboard session required for sensitive plugin endpoints.
- Attachment filename sanitization; sanitized push error state.
