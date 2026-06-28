# DESIGN_SYSTEM.md — Hermes Mobile

> The visual and interaction language. Mobile-first; it takes visual cues from the Hermes desktop app (our reference) so it feels familiar to Hermes users, while remaining an **independent, unofficial** client — its own reimplementation, not a copy.
> Implemented as CSS-variable tokens (`packages/web/src/styles/tokens.css`) so values can be re-expressed natively later (ADR-0007).
>
> **`packages/web/src/styles/tokens.css` is the single source of truth for token values.** The blocks below mirror it; if they ever disagree, the CSS wins — update this doc.

---

## 1. Design principles

1. **AI OS cockpit, not a toy chatbot.** Serious, operational, calm, technical. No cute mascots, no rounded-everything bubbles.
2. **Mobile-first, not a shrunk desktop.** Big tap targets, bottom navigation, cards over dense panels, minimal tables.
3. **The main agent is the center.** First tab is Chat. Delegation/profiles are visible but never required.
4. **Approval-first safety.** High-impact actions are deliberate, spaced, and explained. Hard to do by accident.
5. **Familiar, but independent.** Takes visual cues from the desktop Hermes app — light-surface, neutral, a calm single accent, a status-bar idiom — so it feels familiar, while staying a separate, unofficial client (its own reimplementation, not a copy).
6. **Tell the user what to do.** Errors and empty states are instructional, never dead ends.

---

## 2. Theming

Two themes, **light default**, full dark support. Dark is selected by the `data-theme="dark"` attribute on `:root` (an attribute, not a class). With no explicit `data-theme`, `prefers-color-scheme: dark` applies the dark palette automatically. Components only ever read tokens.

```css
/* tokens.css — semantic tokens */
:root {                            /* LIGHT (default) */
  --hm-color-bg:        #f4f6fc;   /* app background */
  --hm-color-surface:   #ffffff;   /* cards, sheets */
  --hm-color-surface-2: #f5f7fd;   /* inset / sidebar */
  --hm-color-border:    #e7eaf3;

  --hm-color-text:           #161a27; /* primary text */
  --hm-color-text-2:         #2b3346; /* strong secondary */
  --hm-color-text-muted:     #6b7384; /* secondary */
  --hm-color-text-secondary: #868fa1;
  --hm-color-text-faint:     #9aa2b4; /* inactive / disabled */
  --hm-color-text-subtle:    #c4cad8;

  --hm-color-primary:      #2540ff;   /* primary action / active / links */
  --hm-color-primary-tint: #eef1ff;
  --hm-color-primary-text: #ffffff;
  /* aliases for older .hm-* classes: --hm-color-accent → primary, accent-weak → primary-tint, on-accent → primary-text */

  --hm-color-success: #15a06a;  --hm-color-warning: #d98a16;  --hm-color-danger: #dc4b46;
  --hm-color-running: #2540ff;  /* active/running task — the same blue as primary */
  /* AA-contrast text colors for use on tinted backgrounds: */
  --hm-color-success-strong: #065f46;  --hm-color-warning-strong: #92400e;  --hm-color-danger-strong: #991b1b;

  --hm-color-success-bg: #e3fbef;  --hm-color-warning-bg: #fff7ed;
  --hm-color-danger-bg:  #fdeaea;  --hm-color-info-bg:    #e7f4fd;
}

:root[data-theme='dark'] {
  --hm-color-bg:        #0e1116;  --hm-color-surface: #161b22;  --hm-color-surface-2: #1c222b;  --hm-color-border: #2a313c;
  --hm-color-text:      #e6e9ee;  --hm-color-text-2: #c8cdd8;   --hm-color-text-muted: #9aa3b0;  --hm-color-text-faint: #6b7382;
  --hm-color-primary:   #5c7cff;  --hm-color-primary-tint: #1b2440;  --hm-color-primary-text: #0e1116;
  --hm-color-success:   #51cf66;  --hm-color-warning: #ffc14d;  --hm-color-danger: #ff6b6b;  --hm-color-running: #5c7cff;
  --hm-color-success-bg: #11261a;  --hm-color-warning-bg: #2a2110;  --hm-color-danger-bg: #2a1414;
}
/* The same dark values apply automatically via @media (prefers-color-scheme: dark) when no data-theme is set. */
```

> Known gap (a11y): the dark theme does not yet remap `--hm-color-text-secondary`, `--hm-color-text-subtle`, or the `*-strong` contrast tokens — they fall back to the light values. Remap them when tightening dark-mode contrast.

### Color semantics (do not improvise meanings)

| Token | Meaning |
|---|---|
| `success` / green | ready, success, safe |
| `warning` / amber | attention, setup required, degraded |
| `danger` / red | dangerous, destructive, failure |
| `running` / blue | active / running agent or task (currently the same blue as `primary`) |
| `primary` / blue | primary action, selected, links (`accent` is a back-compat alias) |
| `text-faint` / gray | inactive, archived, disabled |
| `*-strong` | AA-contrast text on the matching tinted `*-bg` |

---

## 3. Spacing, radius, elevation

```css
:root {
  /* 4px base scale */
  --hm-space-1: 4px;  --hm-space-2: 8px;  --hm-space-3: 12px;
  --hm-space-4: 16px; --hm-space-5: 24px; --hm-space-6: 32px; --hm-space-8: 48px;

  --hm-radius-xs: 6px;  --hm-radius-sm: 8px;  --hm-radius-md: 11px;
  --hm-radius-card: 14px; --hm-radius-lg: 15px; --hm-radius-xl: 16px; --hm-radius-full: 999px;

  --hm-elev-1:      0 1px 2px rgba(20,30,60,.04), 0 1px 1px rgba(20,30,60,.03);
  --hm-elev-2:      0 4px 12px rgba(20,30,60,.08);
  --hm-elev-3:      0 6px 20px rgba(37,64,255,.07);
  --hm-elev-sheet:  0 -8px 28px rgba(20,30,60,.14);
  --hm-elev-drawer: 14px 0 40px rgba(15,20,40,.18);

  --hm-tap-min: 44px;   /* minimum interactive height/width */
}
```

Default card padding `--hm-space-4`; screen gutters `--hm-space-4`; section gaps `--hm-space-5`.

---

## 4. Typography

Brand fonts (loaded from Google Fonts in `index.html`) — **not** a pure system stack:

```css
:root {
  --hm-font-display: 'Bodoni Moda', Georgia, serif;                              /* display / hero */
  --hm-font-sans:    'Hanken Grotesk', system-ui, -apple-system, sans-serif;     /* default UI */
  --hm-font-mono:    'JetBrains Mono', 'SF Mono', 'Cascadia Code', Consolas, monospace;

  --hm-fs-display: 28px;  /* first-run / install hero (uses --hm-font-display) */
  --hm-fs-title:   20px;  /* screen titles */
  --hm-fs-heading: 16px;  /* card titles */
  --hm-fs-body:    15px;  /* default */
  --hm-fs-small:   13px;  /* meta, captions */
  --hm-fs-label:   11px;  /* tiny labels / chips */
  --hm-fs-mono:    13px;  /* code, logs */

  --hm-fw-regular: 400; --hm-fw-medium: 500; --hm-fw-semibold: 600; --hm-fw-bold: 700;
}
```

Line-heights are applied in component CSS, not on the size tokens. Body text `--hm-fs-body` / `text`. Meta `--hm-fs-small` / `text-muted`. Code uses `--hm-font-mono` in a `surface-2` block. The Bodoni Moda display face is reserved for hero/wordmark moments.

Motion tokens (see §7): `--hm-duration-fast: 150ms`, `--hm-duration-normal: 220ms`, `--hm-ease-out: cubic-bezier(0.16, 1, 0.3, 1)`.

---

## 5. Layout (mobile-first)

```text
Baseline widths: 375 (iPhone SE/baseline) · 390 (modern iPhone) · 430 (large) · 768 (tablet bonus)

┌──────────────────────────┐
│ Header  (title · conn dot)│  56px, surface, bottom border
├──────────────────────────┤
│                          │
│  Screen content (scroll) │  gutters --hm-space-4
│                          │
├──────────────────────────┤
│ Chat │Proj│Activ│Agent│Set│  Bottom tab bar, 56px + safe-area-inset-bottom
└──────────────────────────┘
```

- Bottom tab bar is the primary nav: **Chat · Projects · Activity · Agents · Settings**.
- Respect `env(safe-area-inset-*)` (notch / home indicator).
- Detail views and high-impact confirmations use **bottom sheets**, not full-page navigation, where it keeps context.
- Tablet (≥768px): content max-width ~640px centered; do not stretch chat lines full width.

---

## 6. Component inventory

Each component: variants, states, a11y note. Built as design-system primitives in `packages/web/src/components/`.

### Primitives
- **Button** — variants: `primary`, `secondary` (surface+border), `ghost`, `danger`. States: default/hover/active/disabled/loading. Min height `--hm-tap-min`.
- **IconButton** — 44×44, accessible name required.
- **Card** — `surface`, `--hm-radius-card`, `--hm-elev-1`, padding `--hm-space-4`.
- **BottomSheet** — drag handle, `--hm-elev-sheet`, backdrop, focus trap, swipe/scrim dismiss.
- **StatusDot** — semantic color; used for connection + worker state.
- **Badge / Pill** — status labels (`running`, `done`, `blocked`).
- **Input / Textarea** — 44px min, clear focus ring `2px primary`.
- **Spinner / Skeleton** — loading states.
- **Toast** — transient feedback (non-blocking).
- **EmptyState** — icon + title + instructional copy + optional action.

### Domain components
- **MessageBubble** — `user` (primary-tint, right) vs `assistant` (surface, left, markdown). Code blocks in mono on `surface-2`.
- **ToolGroup** — wraps one or more tool calls under a shared header (`Tool actions · 2 steps · done`). Each row shows the tool name and target; tapping expands the raw output. Never dump raw logs inline.
- **ApprovalCard / ApprovalInline** — consequence summary; `[Reject]` and `[Approve]` spaced far apart; `danger` styling for destructive actions.
- **TaskCard** — title, status pill, assignee/profile, priority, last update.
- **ConnectionBanner** — offline/reconnecting state with the network recipe.
- **UpdateNotification** — banner when a newer plugin release is available.

---

## 7. Interaction & motion

- Motion is functional and quick: `--hm-duration-fast` (150ms) / `--hm-duration-normal` (220ms) with `--hm-ease-out` for sheets/toasts; no decorative animation.
- Streaming chat appends tokens smoothly; auto-scroll only when the user is already at the bottom.
- Honor `prefers-reduced-motion`: `tokens.css` globally reduces animation/transition durations.
- Destructive confirmations: two-step (sheet → confirm), or swipe-to-confirm for high-impact. Buttons never adjacent for irreversible actions.

---

## 8. Iconography

- Sparse, consistent line icons (inline SVG via the `Icon` component). Icons support meaning, never decorate.
- The dashboard tab icon is `Smartphone` (per `dashboard/manifest.json`).
- App icons: maskable 192×192 and 512×512, plus an Apple touch icon; calm mark on a solid surface — readable at small sizes.

---

## 9. Accessibility (target WCAG 2.1 AA)

- Contrast ≥ 4.5:1 for body text, ≥ 3:1 for large text and UI borders. Verify both themes (note the dark-mode gap in §2).
- Every interactive element keyboard-focusable with a visible focus ring and an accessible name.
- Tap targets ≥ 44×44px.
- Don't encode meaning in color alone — pair status color with an icon/label.
- Respect `prefers-reduced-motion` and `prefers-color-scheme` (default theme follows OS unless the user overrides in Settings).

---

## 10. Install / readiness page

The dashboard `Mobile` tab doubles as a readiness/landing page. Layout: hero + a vertical stack of status cards + actions.

```text
✅ Plugin installed
✅ API reachable
✅ Auth configured
⚠️ HTTPS required
⚠️ Phone network access not verified

[Open Hermes Mobile]  [Setup Tailscale Serve]
```

It should read as *"this is polished; Hermes is a real operating layer"* — not *"another chatbot webview."*

---

## 11. Visual cues from the desktop app

The desktop Hermes app is the visual reference (not a source to copy). Take cues — the light neutral surface palette, the calm single accent, the status-bar idiom (Gateway state · model · version), and the restrained, technical tone — and **translate** them into the mobile-first layout above. Do not reproduce desktop's multi-pane density on mobile, and do not copy its code or assets (see [`NOTICE`](./NOTICE)).
