# Planned improvements

Backlog of things worth building **if they improve the mobile UX**. These are ideas, not
commitments. Concrete, trackable work lives in
[GitHub Issues](https://github.com/stasstepv/hermes-pwa/issues) — this doc is the high-level
view; issue numbers are linked inline below.

Some entries came from comparing this client with other Hermes frontends, notably
[`deboboy/hermes-pwa`](https://github.com/deboboy/hermes-pwa) — a Next.js + shadcn/ui
reference implementation. Where it does something we don't, it is credited below.

---

## Resolved

### WebSocket ticket transport compatibility with official Hermes backend — fixed in 0.1.2-beta

- **Discovered:** live post-update testing against Hermes-Agent `main` (`b699d27a`).
- **Symptom:** a fresh install could hang forever on `Connecting…` against an auth-gated remote
  Dashboard even though REST auth, `/api/auth/ws-ticket`, Dashboard, and gateway were all healthy.
- **Root cause — transport contract mismatch:**
  - the PWA sent the single-use WS ticket only as a subprotocol
    (`Sec-WebSocket-Protocol: hermes.ws-ticket, <ticket>`) and connected to `/api/ws` with no ticket
    in the URL;
  - official Hermes-Agent `main` currently accepts only the legacy query path
    `/api/ws?ticket=<ticket>` (`ws.query_params.get("ticket")` in `hermes_cli/web_server.py`); the
    official WebUI on that commit also uses `?ticket=`. So upstream is self-consistent and our
    subprotocol-only client was not compatible — it gets HTTP `403` (socket closes before open).
- **Fix (`packages/core/src/transport/ws.ts`):** keep the subprotocol path as **primary** (it does
  not leak the ticket through URLs/proxy logs), and add a **one-shot** fallback to
  `/api/ws?ticket=<encoded-ticket>` **only if the primary closes before it ever opens**. Post-open
  closes are normal runtime/reconnect failures and never trigger the fallback.
- **Not done here (separate upstream work):** a Hermes-Agent backend patch that also accepts the
  subprotocol ticket would be cleaner, but PWA publication must not depend on it landing first.

---

## High value — borrow these

### 1. Cross-session full-text search
- **Tracked:** [#8](https://github.com/stasstepv/hermes-pwa/issues/8)
- **Now:** the Sessions screen only filters the already-loaded session list. There is no
  full-text search across past transcripts.
- **Goal:** search every session by message content, combining a local **IndexedDB** cache
  (instant, offline) with **Hermes server-side full-text search** for the long tail.
- **Why (UX):** on a phone, finding "that conversation where the agent edited X" should take
  one search box, not endless scrolling.
- **Inspiration:** `deboboy` ships this (`src/lib/hermes-search.ts`, `session-search-client.ts`,
  `/api/search`, IndexedDB transcript store).
- **Touches:** `packages/core` (search domain + a REST/WS method), a search sheet in
  `packages/web`, and an IndexedDB caching layer for transcripts.

### 2. Push: external trigger webhook + self-test + stable client id
- **Tracked:** [#9](https://github.com/stasstepv/hermes-pwa/issues/9)
- **Now:** Web Push works via the Python plugin (`pywebpush`) with subscribe/status/send,
  gated by Dashboard auth. There is no clean "external job → notify" entry point or in-app test.
- **Goal:**
  - a documented endpoint Hermes (or any service) can **POST** to when an async job finishes,
    protected by a shared secret/bearer token;
  - a stable per-install **client id** so a device keeps its subscription across reloads;
  - a **"Send test notification"** button in Settings so users can verify push end-to-end.
- **Why (UX):** the whole point of push is "your agent finished / needs approval" while the app
  is closed — that path must be reliable and easy to verify.
- **Inspiration:** `deboboy` exposes `/api/push/send` (bearer token) + `/api/push/test` and
  assigns each install a `clientId`.
- **Touches:** `dashboard/plugin_api.py` + `push_common`, the push UI in
  `packages/web/src/screens/Settings.tsx`, and a note in `docs/SECURITY.md` about the trigger auth.

---

## Worth considering (not obviously a win)

### 3. shadcn/ui chat primitives
- Evaluate whether shadcn's new chat components (e.g. `MessageScroller`) would reduce the custom
  chat CSS we maintain.
- **Caveat:** we deliberately run a **bespoke, clean-room design system** (`tokens.css`,
  Bodoni Moda / Hanken Grotesk). Adopt only if it clearly improves UX *without* diluting the visual
  identity or the clean-room stance. Most likely we keep bespoke — logged for completeness.

---

## Fixing in 0.1.1 (install & docs, from post-release E2E)

Tracked under [milestone 0.1.1](https://github.com/stasstepv/hermes-pwa/milestone/1):

- [#6](https://github.com/stasstepv/hermes-pwa/issues/6) — `npx install` does not enable the
  plugin; add the enable step to docs + installer output, plus an opt-in `--enable` flag.
  Workaround today: run `hermes plugins enable hermes-pwa` after `npx hermes-pwa install`.
- [#7](https://github.com/stasstepv/hermes-pwa/issues/7) — use explicit `/index.html` in
  user-facing PWA URLs (the bare directory URL can 404 in some contexts).

---

## Already on the roadmap (not from the comparison)

These were already planned and remain valid:

- iOS in-app "Add to Home Screen" hint.
- Resilience to upstream Hermes API changes (version probe + contract tests).
- Performance: code-splitting, lighter bundle, smoother long chats.
- Clearer chat message states and system-message display.
- Smarter in-app update flow.
- Upgrade the Vite/Vitest dev toolchain (dev-only audit advisories).

---

_When starting any item, open an issue, link it here, and keep the clean-room rule:
features are reimplemented from public API/protocol behavior, never copied from upstream or
other clients' source._
