# PaperPilot design system

Product: academic manuscript compliance — navy authority, teal confirmation, quiet density.
Audience: students and researchers reviewing formatting scores on phone and desktop.
Worst case: unclear scores, accidental deletes, or blocked actions with no recovery path.

## Intent discovery (before UI)

Answer before shipping a screen:

1. **Who** is this for in this moment? (author fixing issues, payer upgrading, signed-out user resetting password)
2. **What** is the one job of this viewport?
3. **Worst case** if they mis-tap or lose connectivity?

## Tokens

### Color

| Token | Value | Use |
| --- | --- | --- |
| `navy` / `sidebar` | `#0F1B2D` / `#101a30` | Chrome, sidebar |
| `sidebarActive` | `#1a2943` | Active nav |
| `text` | `#172033` | Primary copy |
| `muted` / `slate` | `#94a3b8` / `#64748b` | Secondary |
| `pageBg` | `#f3f5f7` | App background |
| `card` / `border` | `#ffffff` / `#e2e8f0` | Surfaces |
| `accent` | `#16bfa8` | Primary actions, focus |
| `accentHover` | `#12ae99` | Pressed primary |
| `rose` | `#e11d48` | Destructive / non-compliant |
| `amber` | `#d97706` | Caution / approximate |
| `emerald` | `#059669` | Compliant / success |

Severity: critical rose · moderate orange · minor amber.

### Type

- Brand: **Quicksand** (700 wordmark, 600 tagline) — must load before relying on metrics.
- UI: system sans; tabular nums for scores.
- Kickers: 10–11px uppercase tracking; titles 17–22px bold; body 14/20.

### Space

`xs 4 · sm 8 · md 12 · lg 16 · xl 20 · xxl 28`

Touch targets ≥ 44×44 on phone. Primary buttons: accent fill; secondary: border white; tertiary: text/link.

### Motion & feedback

- Press feedback &lt; 100ms (opacity / bg shift).
- Confirm before delete (manuscript, version, cancel subscription).
- Loading / empty / error / success required; offline and partial where data can be stale.

### Scroll

Web: `.pp-scroll` — thumb `#7dcdc2`, track `#e8eef4`, hover `#16bfa8`.
Mobile lists: nested `ScrollView` / `FlatList` with independent panes (Versions ≠ Short result).

## Hierarchy

1. **Primary** — analyze, download report, pay, save password
2. **Secondary** — open tracing, filter, change plan
3. **Tertiary** — meta, back links, clear filter

Scan pattern: brand → score → breakdown → issues → actions.

## Forms

- Labels above fields; group identity vs security.
- Validate on blur after first submit attempt.
- OTP for register / forgot / account password change — never skip for production.
- Smart defaults: Remember me on; PDF-only manuscripts.

## Responsive (&lt; 640)

- Tables → stacked cards; amounts stay tabular.
- Sidebar → drawer (mobile) / icon rail (web desktop collapse).
- Bottom bars: keep primary CTA thumb-reachable; avoid dual sticky conflicts.

## State completeness checklist

Every interactive screen: loading · empty · error · success · (partial | offline when applicable).

## Platforms

- Web: `web/src` — Vite React; hash routes; sidebar expand key `paperpilot.sidebarExpanded`.
- Mobile: `mobile/src` — Expo RN; same API contracts and lib semantics (`scanMapper`, `scoreFormat`, `uploadLimits`, `documentPreviewLocate`).
