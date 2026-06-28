# ARCHITECTURE.md — Hermes Mobile (unofficial)

> The map. How the system is shaped, why, and the decisions behind it.
> Source of truth for _what goes where_. Reflects the current code (kept in sync — last
> reconciled against the codebase after the audit/hardening pass).

---

## 1. System context (C4 level 1)

```text
┌──────────────┐        same-origin HTTPS         ┌─────────────────────────────┐
│   Phone      │  ───────────────────────────────▶│   Hermes Dashboard (FastAPI)│
│  (browser/   │   REST  /api/*                    │                             │
│   installed  │   WS    /api/ws (JSON-RPC)        │  ┌───────────────────────┐  │
│   PWA)       │◀───────────────────────────────  │  │ hermes-pwa plugin     │  │
└──────────────┘   static dashboard-plugins/...    │  │  - manifest.json      │  │
        ▲                                          │  │  - plugin_api.py      │  │
        │ install (Add to Home Screen)             │  │  - dist/ (PWA bundle) │  │
        │ web push (VAPID)                         │  └───────────────────────┘  │
        │                                          │  Sessions · Profiles · Kanban│
        │                                          │  Cron · MCP · Gateway · Auth │
        │                                          └─────────────────────────────┘
   reachability:                                                  │
   Tailscale Serve HTTPS                                          ▼
                                                          Hermes core (agents,
                                                          models, tools, memory)
```

The PWA is a **thin client**. All truth lives in Hermes core. The client renders state and issues commands.
It is an **independent, unofficial** client (see `NOTICE`) built clean-room against the public Hermes API.

---

## 2. The big idea: Core / Shell split (portability)

This is the single most important architectural rule. It exists because the PWA is a pilot for future **native iOS/Android**.

```text
┌───────────────────────────────────────────────────────────────┐
│ packages/core   (TypeScript, ZERO React, ZERO DOM)           │
│                                                               │
│   transport/   REST client  +  WS JSON-RPC client            │
│   domain/      Session, Profile, Task, Approval, Agent, ...   │
│   stores/      Zustand stores (chat, sessions, activity, ...) │
│   platform.ts  Platform port (implemented per shell)          │
│   diagnostics.ts  error normalization + readiness checks      │
│                                                               │
│   ↳ knows about HTTP, WebSocket, and Hermes semantics.        │
│   ↳ knows NOTHING about rendering or platform.               │
└───────────────────────────────────────────────────────────────┘
                ▲                         ▲                    ▲
                │ imports                 │ imports            │ imports
   ┌────────────┴─────────┐   ┌───────────┴──────────┐  ┌──────┴─────────────┐
   │ packages/web (NOW)   │   │ Capacitor shell      │  │ React Native shell │
   │ React + Vite PWA     │   │ (LATER, ~free port)  │  │ (LATER, optional)  │
   │ service worker,      │   │ wraps web bundle     │  │ native UI, reuses  │
   │ install, web push    │   │ + native plugins     │  │ core stores/logic  │
   └──────────────────────┘   └──────────────────────┘  └────────────────────┘
```

**Rule:** anything that would also be true on a native phone goes in `core`. Anything that only makes sense
in a browser DOM goes in a shell. The web shell isolates browser-only APIs under `packages/web/src/pwa/`
(service worker, `beforeinstallprompt`, web push, `navigator.*`).

A quick test before writing code: _"Would this line still make sense inside a React Native app with no DOM?"_
If yes → `core`. If no → shell.

> Note: a `Platform` port is declared in `core/src/platform.ts` (`canInstall` / `promptInstall` /
> `isStandalone` / `share`) for the future native shell. The current web shell does **not** route through a
> single `platform.web.ts`; it uses the browser modules under `packages/web/src/pwa/` directly
> (`install.ts`, `push.ts`, `registerSW.ts`). Wiring the web shell through the `Platform` port is a future
> cleanup, not a current invariant.

---

## 3. Component view (C4 level 3, `packages/core`)

```text
core/src/
├── transport/
│   ├── http.ts            # fetch wrapper: base URL, credentials:'include', AbortController timeout, HermesHttpError
│   ├── rest.ts            # typed REST methods (status, auth, sessions, profiles, kanban, cron, push, audio, ws-ticket)
│   ├── ws.ts              # WebSocket lifecycle: connect(ticket), close-old-before-new, send throws if not OPEN
│   ├── jsonrpc.ts         # newline-delimited JSON-RPC: request/response correlation + per-request timeout + event emitter
│   ├── jsonrpc-contract.ts# typed contract for /api/ws (method + event shapes), reconstructed from the public API
│   └── auth.ts            # auth status/provider mapping helpers
├── domain/                # pure mappers raw(JSON) → typed: one file per area
│   ├── status.ts auth.ts session.ts activity.ts agent.ts profile.ts project.ts model.ts
│   ├── config.ts cron.ts mcp.ts env.ts artifact.ts skills.ts system.ts spawn.ts update.ts
├── stores/                # Zustand stores (state + actions); depend on transport
│   ├── connection.ts      # status/auth/version + ws state machine + reconnect/backoff + purge-on-logout
│   ├── chat.ts            # active session, streaming buffer, send/interrupt, throttled local transcript cache
│   ├── sessions.ts activity.ts projects.ts agents.ts profiles.ts cron.ts model.ts config.ts spawnStore.ts
├── platform.ts            # Platform port (interface only)
├── diagnostics.ts         # explainConnectionError, connection labels, readiness
└── index.ts               # public surface
```

`stores` depend on `transport`; `transport` depends on `domain`. No cycles. Web components import only
`stores` (+ `domain` types). There is no committed `core/src/generated/` (OpenAPI types are not wired in;
the WS contract is hand-typed in `jsonrpc-contract.ts`).

---

## 4. Web shell view (`packages/web`)

```text
web/src/
├── app/
│   ├── App.tsx            # creates http/rest/ws/rpc clients, drives connection.init(), top-level state routing
│   ├── AppShell.tsx       # bottom tab bar, header, drawer (focus-trapped), connection dot, update banner, push sync
│   └── AppPreview.tsx     # design preview mode (?preview) with in-memory fixtures
├── screens/               # Chat, Activity, Agents, Projects, Sessions, Profiles, Settings, Cron,
│                          #   Artifacts, CommandCenter, Home, Login, Skills (hidden) — read core stores
├── components/            # design-system primitives + feature cards (MessageBubble, Composer, ApprovalCard/Inline,
│                          #   ToolGroup, BottomSheet, ConnectionBanner, UpdateNotification, Icon, ...)
├── hooks/                 # useVoiceConversation, useMicRecorder, useVoiceRecorder, usePresence, useReducedMotion
├── lib/                   # screenStorage (last-screen persistence), toolView (tool-call rendering model)
├── pwa/
│   ├── registerSW.ts      # service-worker registration + silent freshness update() on focus/visibility
│   ├── install.ts         # beforeinstallprompt capture, prompt, iOS/standalone detection
│   └── push.ts            # web-push subscribe/unsubscribe/sync (VAPID), iOS-standalone gating
└── styles/
    ├── tokens.css         # design tokens (see DESIGN_SYSTEM.md) — light/dark via [data-theme]
    └── prototype.css      # component + layout styles
```

The shell holds **only**: navigation/layout, rendering, and browser-only APIs (SW, install, push, audio).
It never talks HTTP/WS directly — all of that goes through `core`. There is no `routes.tsx`; navigation is a
screen switch in `AppShell` (state-driven, persisted via `lib/screenStorage`), not a URL router.

---

## 5. Data flow

### 5.1 Connect, version-check & authenticate

```text
App mount
  → connection.init()
      → rest.status()              GET /api/status      (version + auth_required + providers)
      → if server version < MIN_SUPPORTED_HERMES_VERSION → state "unsupported"  (blocking screen)
      → if auth_required:
            rest.providers()        GET /api/auth/providers   (which providers support password)
            <Login screen>          (password form only if a provider supportsPassword)
            rest.passwordLogin()    POST /api/auth/password-login   (cookie set)
            rest.me()               GET /api/auth/me
      → connectWs()
            rest.wsTicket()         POST /api/auth/ws-ticket   (single-use, ~30s)
            ws open                 WSS /api/ws with Sec-WebSocket-Protocol: hermes.ws-ticket, <ticket>
            on 'gateway.ready' → state "connected"
```

### 5.2 Send a prompt (live chat over WS JSON-RPC)

```text
Composer.send(text)
  → chat.submit(text)
      → rpc.request("prompt.submit", { session_id, text })   → returns { status:"streaming" } (ack, immediate)
      → the model's reply streams as event frames over the same socket:
            { method:"event", params:{ type:"message.start"    } }
            { method:"event", params:{ type:"message.delta",   payload:{ text } } }
            { method:"event", params:{ type:"tool.start" | "tool.generating" | "tool.complete" } }
            { method:"event", params:{ type:"thinking.delta" | "reasoning.available" } }
            { method:"event", params:{ type:"approval.request" | "clarify.request" } }
            { method:"event", params:{ type:"message.complete" } }
            { method:"event", params:{ type:"status.update" | "session.info" } }
      → chat store appends/patches messages; activity store mirrors approvals/clarifications
```

> **Important:** the long-running turn streams over **WS events**, not as the `prompt.submit` response.
> `prompt.submit` resolves immediately with `{status:"streaming"}`. This is why the per-request RPC timeout
> (30s) does not cut off long turns — only the ack. The whole client is coupled to this contract.

### 5.3 Approve an action

```text
ApprovalCard.approve()
  → activity.respond(approvalId, "approve")
      → rpc.request("approval.respond", { id, session_id, decision })
      → server resumes the agent; emits follow-up events
```

### 5.4 Web push (out-of-app notifications)

```text
Settings → enable notifications
  → push.subscribe()  (VAPID public key from backend) → POST /api/plugins/hermes-pwa/push/subscribe
Backend (push_common.py) on approval.request / turn complete
  → sends a VAPID web-push to enabled subscriptions (scoped by profile)
Service worker 'push' → showNotification; 'notificationclick' → focus/navigate (same-origin './' only)
```

---

## 6. PWA installability & updates

The `Mobile` dashboard tab is a **readiness/diagnostics page** + install entry point.

Requirements the build and `plugin_api.py` satisfy:

- HTTPS origin (or `localhost`); the tab detects and warns otherwise.
- `manifest.json` reachable, `display: standalone`, **relative** `start_url`/`scope`/`id` (`./`), icons 192 + 512 (maskable).
- `service-worker.js` same-origin, scope `./`, correct `Content-Type`.
- Caching: HTML `no-store`; hashed assets `immutable`. The SW caches the app shell for offline startup
  only — never `/api/*` data (excluded explicitly).

**Updates** are two independent mechanisms today:

- **Service-worker freshness:** `registerSW.ts` calls `registration.update()` on focus/visibility. The SW
  uses `skipWaiting()`+`clients.claim()`. _Known gap (AUDIT PWA-1):_ there is no `controllerchange`→reload
  prompt, so an open tab can keep running the old in-memory bundle until a manual reload.
- **Release notification:** `UpdateNotification` (fed by `domain/update.ts` / backend) shows a banner when a
  newer plugin release exists; applying it is a manual `npx hermes-pwa@latest install --force` / reinstall.

---

## 7. State machine: connection

```text
        ┌─────────┐  status ok, no auth   ┌───────────┐
        │  INIT   │──────────────────────▶│ TICKETING │
        └────┬────┘                       └─────┬─────┘
             │ auth_required                     │ ws open + gateway.ready
             ▼                                   ▼
        ┌─────────┐  login ok           ┌─────────────┐
        │  LOGIN  │────────────────────▶│  CONNECTED  │
        └─────────┘                     └──────┬──────┘
             ▲                                 │ ws close / network drop
             │ 401 / expired                   ▼
             │                          ┌─────────────┐  backoff retry (max → OFFLINE)
             └──────────────────────────│ RECONNECTING│──────────────┐
                                        └─────────────┘              │
                                               ▲                     │
                                               └─────────────────────┘
   Any state → OFFLINE      if /api/status unreachable (show Tailscale Serve setup).
   INIT      → UNSUPPORTED  if server version < MIN_SUPPORTED_HERMES_VERSION (blocking screen, no retry).
```

Reconnect uses exponential backoff with jitter (cap 30s, max attempts → OFFLINE); a fresh ws-ticket is
fetched before every (re)connect because tickets are single-use and ~30s-lived. The old socket is closed
before a new one opens; the `gateway.ready` listener is bound/removed symmetrically with the socket lifecycle.

---

## 8. Security & privacy model

- **No secrets client-side.** Provider keys, tokens, `.env` live only in Hermes backend.
- **Auth** = existing dashboard session cookie (`credentials:'include'`) + per-connection ws-ticket (in memory only).
- **High-impact actions** → explicit approval screen, consequence summary, spaced buttons. Never a silent tap.
- **Local cache:** the active transcript, pinned sessions, kanban board, and last screen are cached in
  `localStorage` for fast restore. This is **purged on logout and on user switch** (`purgeLocalPrivateCache`).
- **Static vs data:** static assets may be public; `/api/*` requires auth. The backend plugin endpoints
  require an authenticated dashboard session via `Depends(_require_dashboard_auth)`.
- Production exposure uses Tailscale Serve and **requires** dashboard auth on.

For the full statement and current known gaps, see `docs/SECURITY.md`.

---

## 9. Architecture Decision Records (ADRs)

Each ADR: Context · Decision · Status · Consequences. Append new ones; never rewrite history (supersede instead).

### ADR-0001 — Ship as a Hermes Dashboard plugin, not a fork
**Decision:** Distribute `hermes-pwa` as a dashboard plugin (GitHub install primary, npm wrapper secondary), same-origin.
**Status:** Accepted. **Consequences:** `dashboard/dist` is committed so users don't run Vite.

### ADR-0002 — Serve under the plugin path; relative scope
**Context:** Plugin static lives under `dashboard-plugins/<plugin>/...`, API under `/api/plugins/<plugin>/...`. SW scope is path-bound.
**Decision:** Serve the PWA + SW + manifest under the plugin's static path with **relative** `scope`/`start_url`/`id` (`./`),
so the bundle is mount-path agnostic. Production install URL is e.g.
`https://<machine>.<tailnet>.ts.net/dashboard-plugins/hermes-pwa/dist/mobile/`.
**Status:** Accepted. **Consequences:** No top-level `/mobile` route needed; relative `id` means OS app-identity is tied to the mount path.

### ADR-0003 — REST for metadata, WS JSON-RPC for live chat; avoid `/api/pty`
**Decision:** REST for status/auth/sessions/profiles/kanban/cron/config/push/audio; `/api/ws` for streaming chat/approvals/interrupts.
**Status:** Accepted. **Consequences:** Two transports in `core`; a hand-typed WS contract (`jsonrpc-contract.ts`).

### ADR-0004 — Map "Projects" to Kanban boards
**Decision:** Projects screen maps onto `/api/plugins/kanban/*`; `domain/project.ts` is the board/task model.
**Status:** Accepted (MVP). **Consequences:** If a real projects API lands, only `domain/project.ts` + `stores/projects.ts` change.

### ADR-0005 — Core/Shell split for native portability
**Decision:** Framework-agnostic `packages/core` (no React/DOM) consumed by a thin web shell; future Capacitor/RN shells reuse `core`.
**Status:** Accepted. **Consequences:** A little indirection now; large savings on native port. Overrides convenience.

### ADR-0006 — Capacitor as the first native path
**Decision:** Plan Capacitor first (reuses the web bundle + `core`); keep RN possible by isolating UI.
**Status:** Proposed (revisit after pilot).

### ADR-0007 — Styling via design tokens (CSS variables) + plain CSS; no Tailwind
**Decision:** Tokens as CSS variables (`tokens.css`), component styles in `prototype.css`; light/dark via `[data-theme]`.
Token values documented in `DESIGN_SYSTEM.md` so they can be re-expressed natively.
**Status:** Accepted. **Consequences:** No utility-class ecosystem; portable and consistent.

### ADR-0008 — Server version compatibility gating
**Context:** This is a third-party client to an API we do not control; protocol drift breaks all users at once.
**Decision:** Read `status.version`; if below `MIN_SUPPORTED_HERMES_VERSION`, enter a blocking `UNSUPPORTED` state.
The probe is **fail-open** (unparseable/missing version → treated as compatible) to not break pre-version gateways.
**Status:** Accepted. **Consequences:** Catches clearly-old servers; does not gate the WS event contract itself (AUDIT PROTO-5).

### ADR-0009 — Web push notifications (VAPID), scoped by profile
**Decision:** Subscribe via the service worker + VAPID; the backend (`push_common.py`) sends pushes on
approval/turn-complete, scoped per profile. Notification payloads never include the assistant's reply text.
**Status:** Accepted. **Consequences:** New private surface on the backend (`pending_approvals.json`); see AUDIT SEC-3/7.

### ADR-0010 — Local transcript cache, purged on logout
**Context:** Cold-start chat restore needs the last transcript before the backend snapshot loads.
**Decision:** Cache the active session (messages/thinking/tool output) in `localStorage`, throttled during streaming,
and **purge it on logout**. (Earlier docs claimed "no persistent client state"; this ADR supersedes that.)
**Status:** Accepted. **Consequences:** Privacy depends on the purge being complete (AUDIT SEC-1/SEC-1-bis).

---

## 10. Open technical questions (track, decide, then ADR)

- Q1: ~~Exact `/api/ws` event `type` names~~ — **Resolved**: typed in `jsonrpc-contract.ts`, verified against working clients.
- Q2: Should we add a real `controllerchange`→reload flow for SW updates? (AUDIT PWA-1)
- Q3: Should the version probe also gate the **WS event contract** (not just a min server version)? Fail-open is a risk (PROTO-5).
- Q4: Defense-in-depth auth on the plugin's own `/api` endpoints vs relying on the host gate (AUDIT SEC-3).
- Q5: Remote auth mode for non-browser native clients (Capacitor/RN) — cookie vs token?
- Q6: A real recorded-gateway contract test to catch upstream protocol drift (AUDIT TEST-1).
