# CODING_RULES.md — Hermes Mobile

> Conventions that keep the codebase consistent, portable, and safe.
> Read with `ARCHITECTURE.md`. When in doubt, the core/shell boundary wins.

---

## 1. Language & TypeScript

- TypeScript **strict** everywhere. No plain `.js` in `src`. `tsconfig` has `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `exactOptionalPropertyTypes`.
- **No `any`.** Use `unknown` + narrowing at boundaries. `// @ts-expect-error` is allowed only with an inline reason.
- Prefer `type` aliases for data shapes; `interface` for extendable contracts (e.g. the `Platform` port).
- All exported functions/types from `core` have explicit return/param types. No inferred public API.
- No default exports except React screen/page components. Named exports elsewhere (greppability).

```ts
// good — boundary validation, explicit types
export function toSession(raw: unknown): Session {
  const r = raw as Record<string, unknown>;
  return {
    id: String(r.id),
    title: typeof r.title === "string" ? r.title : "Untitled",
    updatedAt: Number(r.updated_at ?? 0),
  };
}
```

---

## 2. The core/shell rule (most important)

- `packages/core` imports **nothing** from React, the DOM, `window`, `document`, `navigator`, or `packages/web`. Enforced by ESLint `no-restricted-imports` + an env check.
- Components **never** call `fetch` or `new WebSocket`. They read/dispatch through `core` stores.
- Browser-only capabilities (service worker, install prompt, web push, audio, share) live in
  `packages/web/src/pwa/` (`registerSW.ts`, `install.ts`, `push.ts`) and `packages/web/src/hooks/`.
- A `Platform` port is declared in `core` for the future native shell:

```ts
// core/src/platform.ts
export interface Platform {
  canInstall(): boolean;
  promptInstall(): Promise<"accepted" | "dismissed" | "unavailable">;
  isStandalone(): boolean;
  share(data: { title?: string; url?: string; text?: string }): Promise<void>;
}
```

> Reality check: the current web shell uses the `pwa/` browser modules **directly**; it does not yet route
> through a single `platform.web.ts` implementation of this port. Keep new browser-only code under `pwa/`
> so a native shell can later supply its own modules. Wiring the shell through `Platform` is a future cleanup.

---

## 3. Naming

| Thing | Convention | Example |
|---|---|---|
| Files (TS modules) | `kebab-case` | `jsonrpc-contract.ts` |
| React components | `PascalCase` file + export | `ApprovalCard.tsx` |
| Types / interfaces | `PascalCase` | `Session`, `Platform` |
| Functions / vars | `camelCase` | `connectWs`, `wsTicket` |
| Constants | `UPPER_SNAKE` | `MIN_SUPPORTED_HERMES_VERSION` |
| Zustand stores | `useXStore` | `useChatStore` |
| CSS Modules | `Component.module.css` | `ApprovalCard.module.css` |
| Design tokens | `--hm-<group>-<name>` | `--hm-color-bg`, `--hm-space-3` |

Domain terms match the backend where reasonable (`session`, `profile`, `approval`, `kanban/task`). Map snake_case API fields to camelCase **at the transport boundary**, not in components.

---

## 4. React conventions

- Function components + hooks only. No class components.
- One component per file (plus small private subcomponents in the same file if tightly coupled).
- Props typed explicitly; destructure in the signature. Provide sensible defaults so components render with no required props where feasible (eases storybook/testing).
- Side effects only in `useEffect`/event handlers; keep render pure.
- Data comes from store selectors; select narrowly to avoid re-renders:

```tsx
const messages = useChatStore((s) => s.messages);      // good — narrow
const everything = useChatStore((s) => s);             // bad — re-renders on any change
```

- Lists need stable keys (domain `id`, never array index).
- Accessibility: every interactive element is keyboard-focusable with an accessible name; tap targets ≥ 44px (see `DESIGN_SYSTEM.md`).

---

## 5. State management (Zustand in `core`)

- Stores hold normalized data + actions. Actions call `transport`; components call actions.
- No business logic in components. "Should this run on native too?" → it goes in the store/transport.
- Async actions set explicit status (`idle | loading | error`) instead of throwing into render.
- Keep stores small and feature-scoped. Current stores: `connection`, `chat`, `sessions`, `activity`, `projects`, `agents`, `profiles`, `cron`, `model`, `config`, `spawnStore`. Cross-store reads go through selectors, not by importing another store's internals.

---

## 6. Transport rules

- Single `http.ts` wrapper: base URL injection, `credentials: "include"`, `AbortController` timeout (default 15s), uniform error type `HermesHttpError(status, statusText, body)`.
- Validate/normalize every response into a domain type before returning (see §1). Treat response shapes as **hints**, not guarantees (many Hermes responses are `{}` or partial); the `domain/*` mappers default missing fields.
- WS client: one connection, request/response correlation by `id` with a **per-request timeout** (default 30s), event frames dispatched to a typed emitter (`jsonrpc-contract.ts`). Reconnect with exponential backoff + jitter; fetch a fresh ws-ticket before each connect; close the old socket before opening a new one. Long turns stream over **events**, not the `prompt.submit` response (which acks immediately) — so the request timeout never cuts a turn.
- Never log secrets, cookies, tickets, or full prompt bodies at info level.

---

## 7. Errors & empty/offline states

- Every error message tells the user **what to do**, not just what failed.

```text
BAD : "WebSocket failed"
GOOD: "WebSocket failed. Your reverse proxy may not forward Upgrade headers.
       If using nginx, set proxy_set_header Upgrade and Connection."
```

- Every list/screen has: loading, empty, error, and offline variants. Copy lives with the component; tone defined in `DESIGN_SYSTEM.md`.

---

## 8. Security rules (hard)

- **No secrets in client code.** No API keys, provider tokens, `.env`, MCP credentials in `core` or `web`. CI greps for common secret patterns and fails the build.
- Client auth state = browser session cookie (managed by the browser) + in-memory ws-ticket. Do not persist tickets to `localStorage`.
- Mark and gate high-impact actions (see `ARCHITECTURE.md` §8). No silent destructive taps.
- Treat all server data as untrusted input; sanitize before rendering as HTML (markdown renderer must escape; no `dangerouslySetInnerHTML` with raw server strings).

---

## 9. Testing

- **Unit tests are mandatory for `core`** (transport mapping, store actions, JSON-RPC correlation, reconnect/backoff logic). Tool: Vitest.
- Components: test behavior (renders states, fires actions), not implementation. Tool: Vitest + Testing Library.
- A test for every bug fix that reproduces it first.
- `npm test` must be green before a task is "done". No skipped tests merged without a tracking note.
- Beware tests that only assert against their own mocks — for protocol-facing code, assert mappers against recorded real frames where possible (a recorded-gateway contract test guards this).
- Manual PWA check for shipping changes: install on real Android Chrome + iPhone Safari; run `npm run verify:pwa`.

---

## 10. Lint / format

- ESLint (typescript-eslint, react-hooks, import order, `no-restricted-imports` for the core/shell boundary) + Prettier.
- `npm run lint` and `npm run format` are clean before commit. CI enforces.
- No disabled lint rules inline without a reason comment.

---

## 11. Commits & branches

- **Conventional Commits**, English, imperative:
  `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`, `build:`, `perf:`.
  Scope optional: `feat(chat): stream assistant deltas`.
- Every commit **signed off** (DCO): `git commit -s` (see `CONTRIBUTING.md`).
- One concern per commit. No "wip"/"misc" dumps.
- Branches: `type/<short>` (e.g. `feat/voice-input`, `fix/reconnect-double-timer`).
- PRs: small, one concern; describe the user-visible change and any boundary/security implications. See `CONTRIBUTING.md` for the full PR process, quality gates, and merge rules.

---

## 12. Dependencies

- Adding a runtime dependency to `core` or `web` needs justification in the PR; anything that pulls in DOM assumptions is banned from `core`.
- No CSS framework, no Redux, no Next.js, no Tauri/Electron without an ADR (see `ARCHITECTURE.md`).
- Pin versions; keep `core` dependency-light (it must survive a native port).

---

## 13. Performance (mobile budget)

- Initial PWA shell (HTML+critical CSS+JS) target < 150 KB gzipped; lazy-load non-Chat tabs.
- Virtualize long message/task lists; memoize list rows (`React.memo`) so streaming re-renders one bubble, not all.
- Hashed assets cached `immutable`; HTML never cached hard. Service worker caches the shell for offline startup/error screen only — never `/api/*` data.
- Avoid layout thrash in the streaming chat (append, don't re-render the whole list).

> Status (be honest): the budget, code-splitting/lazy-loading, list virtualization, and `React.memo` on
> `MessageBubble` are **targets not yet met** — the current bundle is a single ~495 KB JS chunk and lists
> are unvirtualized. These remain a work in progress; new code should move toward these, not away.

---

## 14. Definition of Done

- [ ] typecheck clean · [ ] lint clean · [ ] tests green (+ test for any bug fix)
- [ ] core/shell boundary respected · [ ] no secrets added · [ ] commits signed off (DCO)
- [ ] error/empty/offline states handled · [ ] a11y + 44px targets
- [ ] `CHANGELOG.md` updated for non-trivial work · [ ] `npm run verify:pwa` / `verify:pack` pass · [ ] `dashboard/dist` rebuilt & committed if web/tab changed
