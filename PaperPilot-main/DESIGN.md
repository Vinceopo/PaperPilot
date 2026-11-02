# PaperPilot design system

Product: AI-powered academic manuscript formatting compliance for researchers and students.
Surfaces: web SPA (`web/`) and Expo mobile (`mobile/`). Tokens below are the source of truth; do not invent a second palette.

## Intent

| Question | Answer |
| --- | --- |
| Who | Authors checking campus / journal format rules |
| What | Upload PDF → score → short detail → full results → click-to-trace fixes |
| Worst case | Silent empty Results after refresh; password change with no confirmation; scores that disagree with listed issues |

## Brand & visual character

- **Look:** Calm academic cockpit — deep navy chrome, mint accent, light slate workspace. Not purple SaaS, not newspaper, not cream-serif.
- **Mark:** Mint tile + teal document check (`PaperPilotMark`). Wordmark: Quicksand bold, tracking wide.
- **Accent:** Teal `#16bfa8` for primary actions and active nav; navy `#101a30` / `#0F1B2D` for sidebar and auth header.
- **Score bands:** Emerald ≥80, Amber 50–79, Rose <50, Slate not evaluated.

## Color tokens

| Token | Value | Use |
| --- | --- | --- |
| `navy` / `sidebar` | `#0F1B2D` / `#101a30` | Auth header, sidebar |
| `sidebarActive` | `#1a2943` | Active nav item |
| `text` | `#172033` | Body / titles |
| `muted` / `slate` | `#94a3b8` / `#64748b` | Secondary copy |
| `pageBg` | `#f3f5f7` | App canvas |
| `authFormBg` | `#EEF1F5` | Auth form panel |
| `card` / `white` | `#ffffff` | Surfaces |
| `border` | `#e2e8f0` | Hairlines |
| `accent` | `#16bfa8` | Primary CTA, focus |
| `accentHover` | `#12ae99` | CTA hover/press |
| `rose` | `#e11d48` | Destructive / non-compliant |
| `emerald` | `#059669` | Compliant / success |
| `amber` | `#d97706` | Warnings / under review |

Web scrollbar (`pp-scroll`): thumb `#7dcdc2`, track `#e8eef4`, hover `#16bfa8`.

## Type

- **Brand:** Quicksand (must load before lockup ships).
- **UI:** Existing sans stacks on web/mobile; keep tabular nums on scores.
- Scale: kickers 10–11px uppercase; body 14; titles 18–22; hero score 40–48.

## Space & radius

- Spacing scale: 4 / 8 / 12 / 16 / 20 / 28.
- Cards: `borderRadius` 12–16; pills full round.
- Soft shadow preferred over heavy elevation: `0 1px 3px rgba(15,23,41,0.05)`.

## Hierarchy

1. **Primary** — one accent CTA per region (Analyse, View full results, Continue to sign in).
2. **Secondary** — outline / navy buttons (Download, Trace).
3. **Tertiary** — text links, nested nav (Compliance Result under My Manuscripts).

Scanning pattern: kicker → title → one supporting line → actions. Prefer density with clear sections over card stacks in heroes.

## Component states

Every interactive screen must cover:

| State | Pattern |
| --- | --- |
| Loading | Spinner + short label; never blank navy |
| Empty | Title + one sentence + primary route out |
| Error | Inline alert (`role="alert"` / a11y alert); retry when safe |
| Success | Confirmation screen or toast; password change uses dedicated screen |
| Partial | e.g. trimmed scan → hydrate + “Loading breakdown…” |
| Offline / network | Auth/network copy from `authMessage`; no false sign-out |

## Feedback & affordance

- Press feedback <100ms (opacity / bg change).
- Destructive: ConfirmDialog before delete manuscript/version.
- Clickable must look clickable (button chrome or underlined text link).
- Touch targets ≥44px on mobile; icon-only rails use ≥36px hit area + tooltip/`title`/`accessibilityLabel`.

## Forms

- Labels via floating label or explicit `label` above field.
- Validate on blur + submit; keep OTP progressive (email → code → password).
- Smart default: Remember me on; PDF-only manuscript accept list.
- Password rules checklist visible while typing.

## Responsive (<640px)

- Web sidebar → overlay drawer; desktop → expandable / icon rail.
- Manuscript detail: stack Versions above Short result; independent scrolls.
- Tables → cards; unit stats → 3-up or wrap; bottom bars / CTAs stay thumb-reachable.
- Auth: single column; brand header then form.

## Navigation parity

- **Web:** Collapsible sidebar (`<<` / `>>`), nested Compliance Result, `#/results` session-only (hard refresh → My Manuscripts).
- **Mobile:** Drawer sidebar; Results empty → My Manuscripts / Upload; DocumentReference for click-to-trace (no auto-jump until user selects).

## Do / don’t

- Do keep Compliant / Non-Compliant **labels + bar**; do not show bar percentages in public results.
- Do gate signup / reset with email OTP.
- Don’t ship Google sign-in UI.
- Don’t invent purple gradients or cream-serif marketing looks.
