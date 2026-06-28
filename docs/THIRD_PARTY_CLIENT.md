# Third-party client guide — doing it right

A strategy / engineering note for maintainers of this project.
Not an end-user guide — it's a map of decisions and the constraints this client operates under.

## Context and positioning

This PWA is an **independent, third-party client** for Hermes (a Nous Research product).
We are **not** Hermes/Nous developers. Their web and desktop apps are used **only as "donors"** —
to read the public API and protocol contracts and reimplement a compatible client **from scratch**.

Motivation: using Hermes from Telegram on a phone is painful; we ship the PWA first, and if it lands
with users and Hermes devs, native is the next step.

### Core principle: clean-room via the contract, not copying code

- The API and protocol (`/api/ws`, event names, the ticket flow, REST endpoints) are **not
  copyrightable** — reading them from someone else's web/desktop app and reimplementing them yourself
  is **legal and normal**.
- **Copying source** from someone else's app is **not**.

Donor licenses (verified):

| Source | License | Reuse code? |
|---|---|---|
| `hermes-agent` (backend + web UI) | **MIT**, © Nous Research 2025 | Yes, with attribution |
| Desktop app (built on `@assistant-ui`) | **No license** → all rights reserved | **No — read the contract only** |

Takeaway: our **own from-scratch transport is an asset, not duplication**. It keeps the project legally
clean. Do not vendor upstream code, even if it "would save a few lines."

The protocol lives in one typed contract module as the single source of truth:
[`jsonrpc-contract.ts`](../packages/core/src/transport/jsonrpc-contract.ts). Its header notes that the
contract was reconstructed from the observable public Hermes API, with no copy-paste of their files.

---

## Decided / done

The install and auth model is settled, the right way, and tested:

- Ships as a **plugin in the Hermes web UI** → a **Mobile** tab appears → open the PWA + install
  instructions from there.
- Runs on the **same origin** determined at install (same-origin). No CORS, no mixed-content, no
  storing of anyone's secrets.
- **Auth is fully delegated to Hermes:** the web UI session cookie; if that login lapses, the PWA shows
  its own login page where the user enters their Hermes web UI credentials. We piggyback entirely on their auth.
- The short-lived **ws-ticket** is held in memory only (never persisted) and passed during the WebSocket
  upgrade via `Sec-WebSocket-Protocol`, not in the URL query.
- Network setup: Tailscale Serve is required for a production install — see [`docs/README.md`](./README.md).
- **License / attribution:** own MIT `LICENSE` (© Stanislav Stepchenko); `NOTICE` documents the unofficial
  status, trademark stance, and clean-room interop with Hermes (MIT, © Nous Research).
- **Protocol-drift defenses (shipped):** respect `auth_providers`/`supportsPassword` on the login screen;
  a server version probe with an "unsupported server" screen; unknown WS events are warned and dropped, not
  fatal; a recorded-gateway contract test guards the mappers; per-request RPC timeouts and a fetch timeout.

Why this is right: for a self-hosted audience, same-origin is both simpler and safer. A standalone mode
(we host the PWA, the user types their Hermes URL) drags in CORS, cross-origin auth, and storing other
people's tokens — **deliberately not done**, deferred to native or a separate "advanced" mode with explicit
risk warnings.

---

## Remaining / watch-list

- **Protocol-drift resilience is an ongoing risk, not a one-time fix.** We depend on an API and a login flow
  we don't control; a single Hermes release can break the client for everyone at once. Keep the contract test
  current, keep a PWA ↔ Hermes compatibility matrix in the README, and treat the version probe as a floor,
  not a guarantee (it is fail-open by design — see ADR-0008).
- **Capability transparency:** keep a visible line that this client can run actions on your agent.
- See [`docs/SECURITY.md`](./SECURITY.md) for the security model and current known gaps.

## What we deliberately do NOT do

- Don't vendor transport/UI from the desktop app (no license → not allowed).
- Don't build a standalone / cross-origin mode at this stage (CORS, foreign auth, token storage — deferred).
- Don't fork Hermes — stay a separate, compatible client (easier to "bless" as a plugin later).
