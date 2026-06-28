# Planned improvements

Backlog of things worth building **if they improve the mobile UX**. These are ideas, not
commitments — turn an item into a GitHub issue when you pick it up.

Some entries came from comparing this client with other Hermes frontends, notably
[`deboboy/hermes-pwa`](https://github.com/deboboy/hermes-pwa) — a Next.js + shadcn/ui
reference implementation. Where it does something we don't, it is credited below.

---

## High value — borrow these

### 1. Cross-session full-text search
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
