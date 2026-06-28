# Security & Privacy

Hermes Mobile is a **thin client** for your Hermes Agent instance. It stores no credentials and implements no secondary auth system.

## No secrets in the client

- API keys, model config, and agent logic stay on your Hermes server.
- The PWA does not use `localStorage`, `sessionStorage`, or `IndexedDB` for credentials.
- The PWA may keep non-secret local UI/session cache while signed in: active chat transcript cache, pinned session ids, the selected Kanban board, and the last selected screen.
- Logout clears the local PWA transcript/session cache and related UI cache keys even if the backend logout request fails.
- The service-worker cache persists only the app shell (HTML, JS, CSS, icons) and explicitly refuses to cache `/api/*` data routes.

## Same-origin session auth

- Hermes Mobile reuses the existing Dashboard session cookie.
- All API calls use `credentials: 'include'` so the browser sends the same cookie it uses for the Dashboard.
- No custom tokens, JWTs, or API keys are exchanged or stored by the PWA.
- If the session expires, the user is redirected to the Dashboard login page and returns to the PWA automatically after signing in.

## Transport security

- The PWA should be served over HTTPS in production through Tailscale Serve (see [NETWORK_TAILSCALE.md](./NETWORK_TAILSCALE.md)).
- WebSocket JSON-RPC uses the same origin and cookie as REST calls.
- The service worker explicitly refuses to cache `/api/*` data routes; only the app shell is cached locally.

## High-impact actions

- Approvals that can publish, delete, or act on the user’s behalf are marked `highImpact`.
- The UI requires an explicit confirmation (swipe or deliberate two-step tap) for high-impact approvals.
- No action is auto-approved; the safe choice is always the default.

## Telemetry

- Hermes Mobile does not include analytics, telemetry, or third-party trackers.
- No usage data, crash reports, or device identifiers are sent anywhere.
- Diagnostics in the Mobile tab are computed locally and exposed only through your own Hermes instance.

## Server-side plugin

- The plugin backend (`dashboard/plugin_api.py`) serves the PWA app shell and exposes same-origin endpoints for local diagnostics, backups metadata, pending approvals, messaging-session bindings, push subscription management, and update checks.
- Sensitive plugin API routes are protected by the Dashboard auth layer and also perform an explicit defense-in-depth dashboard auth check before returning local data or mutating push state. The `/health` route is intentionally public for external monitors and returns bounded readiness only.
- It does not proxy app URLs to external QR or image services.
- It confines plugin-owned persistent state to the Hermes home/plugin storage paths; it reads selected Hermes local state needed for the Mobile control plane (for example sessions, backups metadata, pending approvals, and push subscription records).

## Reporting issues

If you discover a security issue in Hermes Mobile, please follow the private reporting process in the repository root [`SECURITY.md`](../SECURITY.md).
