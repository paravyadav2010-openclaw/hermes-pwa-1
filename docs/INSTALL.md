# Hermes Mobile installation contract

Hermes Mobile must be a zero-touch Dashboard plugin install.

A user should not patch Hermes core, edit `config.yaml`, copy files by hand, or know which static-file extensions Hermes allows. The install contract is:

```bash
hermes plugins install stasstepv/hermes-pwa
hermes plugins enable hermes-pwa
# restart Dashboard/gateway as instructed by Hermes if it is already running
```

Or, using npm:

```bash
npx hermes-pwa install
```

Then the Dashboard shows a **Mobile** tab. From that tab the user opens Hermes Mobile and installs it from the browser.

## Runtime routes

The plugin ships prebuilt Dashboard assets in `dashboard/dist/` because `hermes plugins install` clones the repo; it does not run `npm install` or `npm run build` for the user.

| Purpose | Route |
|---|---|
| Dashboard tab bundle | `/dashboard-plugins/hermes-pwa/dist/index.js` |
| Dashboard tab CSS | `/dashboard-plugins/hermes-pwa/dist/style.css` |
| Public PWA shell | `/dashboard-plugins/hermes-pwa/dist/mobile/index.html` |
| Public PWA manifest | `/dashboard-plugins/hermes-pwa/dist/mobile/manifest.json` |
| Public service worker | `/dashboard-plugins/hermes-pwa/dist/mobile/service-worker.js` |
| Plugin diagnostics API | `/api/plugins/hermes-pwa/diagnostics` |

## Why the manifest is `manifest.json`

Do **not** rename it back to `manifest.webmanifest` unless the Hermes static asset allowlist is guaranteed in every supported Hermes release.

Older Hermes Dashboard static serving already allows `.json`, but may not allow `.webmanifest`. Browser manifests are valid JSON, and `application/json`/`application/manifest+json` are both acceptable for installability in current target browsers. Using `manifest.json` makes installation work on stock Hermes without asking users to patch Hermes core.

The plugin API still serves `manifest.json` as `application/manifest+json` when accessed via `/api/plugins/hermes-pwa/app/manifest.json`, but the user-facing install path uses the public `/dashboard-plugins/...` route so manifest and service-worker fetches do not require custom auth headers.

## Authentication model

Hermes Mobile does not implement separate mobile auth. It reuses the Dashboard session:

1. The PWA loads from the public plugin asset route.
2. On startup it calls `/api/status`.
3. If Dashboard auth is required, it calls `/api/auth/me` with `credentials: 'include'`.
4. If the session is missing/expired, it links to `/login?next=<current-pwa-url>`.
5. After Dashboard login, the user returns to the same PWA URL.

No credentials are stored by the plugin. No secrets belong in this repo.

## Network setup

For the phone to reach Hermes Mobile in production, Tailscale is part of the install contract:

- The phone and the Hermes host must be in the same tailnet.
- The PWA must be opened from the Dashboard origin exposed with **Tailscale Serve**.
- The plugin does not introduce a separate CORS origin, token store, or mobile auth system. It inherits the same Dashboard/gateway origin and sends same-origin requests with `credentials: 'include'`.
- Do not require users to patch Hermes core or add CORS exceptions for the PWA.

Supported production URL shape:

```text
https://<machine-name>.<tailnet-name>.ts.net/dashboard-plugins/hermes-pwa/dist/mobile/
```

See [Private access with Tailscale](./NETWORK_TAILSCALE.md) for the required setup.

## Release checklist

Before publishing or tagging a plugin release:

```bash
npm install
npm run typecheck
npm run build
npm run verify:pwa
```

`npm run verify:pwa` must confirm:

- `dashboard/dist/mobile/index.html` links `./manifest.json`.
- `dashboard/dist/mobile/manifest.json` exists and has `display: standalone`, `start_url: ./index.html`, and `scope: ./`.
- `dashboard/dist/mobile/service-worker.js` avoids caching Hermes `/api/*` data routes.
- PWA icons exist and have valid dimensions.
- `dashboard/plugin_api.py` does not send app URLs to third-party QR/image services.

For live verification against an installed plugin:

```bash
PWA_VERIFY_URL=https://<machine-name>.<tailnet-name>.ts.net/dashboard-plugins/hermes-pwa/dist/mobile/ npm run verify:pwa
```

Expected live checks:

- `index.html` returns 200 `text/html`.
- `manifest.json` returns 200 with JSON/manifest content type + `no-cache`.
- `service-worker.js` returns 200 JavaScript + `no-cache`.

## Non-goals

- Do not require users to patch `hermes_cli/web_server.py`.
- Do not require users to copy built files into `~/.hermes/plugins` manually.
- Do not add a second auth system for mobile.
- Do not document a separate public reverse-proxy origin as the release install path; production HTTPS is expected to come from Tailscale Serve.
- Do not use third-party QR code/image APIs that receive the private Dashboard URL.
