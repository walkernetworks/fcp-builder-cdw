# App design system

The app UI follows the CDW design system for the **application surface**, from the `cdw-branding` and `cdw-report-design` skills. This file records how it is applied here. `server/designSystem.test.ts` enforces the parts that can be checked.

Exported FCP documents (HTML/PDF, condensed FCP, handoff, Building Blocks) are **out of scope**. The design skills leave FCP documents to `fcp-builder`, which keeps its own palette. Do not restyle the renderers to match the app.

## Tokens

One token block on `:root` in `client/src/index.css`. Values come from `cdw-branding/assets/brand-tokens.json` and `cdw-report-design/assets/tokens.js` (`APP.rootVars`). Do not hand-type a brand hex anywhere else; use the Tailwind utilities generated from the tokens (`bg-cdw-red`, `text-ink`, `border-s100`, `bg-state-warn-soft`, …).

| Role | Tokens | Rule |
|---|---|---|
| Brand | `--cdw-red` `#CC0000` (PMS 186c), `--cdw-red-bright`, `--cdw-red-deep` | Red leads: hero band, primary button, active nav, first chart series |
| Secondary | `--cool-11`, `--cool-8`, `--cool-4` | Support red; never replace it |
| Neutral | `--s50` to `--s600`, `--ink`, `--ink-muted`, `--surface` | One ramp, one naming scheme |
| State | `--state-pass`, `--state-warn`, `--state-blocked`, `--state-unknown` (+ `-text`, `-soft`) | Verdicts only, never decoration. `--state-blocked` shares the brand hex and keeps its own name |
| Figures | `--fig-pos`, `--fig-neg` | Signed money; not a state |

No teal, and no `#E31837` or `#c8102e`. The test fails on these and on the retired navy chrome.

## Type

Plus Jakarta Sans, **bundled** through `@fontsource-variable/plus-jakarta-sans`. The skill's Google Fonts link is not used, because the app makes no outbound calls. No remote font links.

## Elements

`client/src/components/vsa/elements.tsx` provides the elements; the class names match the design vocabulary, with styles in `index.css` under "Element set".

- `HeroBand` (`hero-band`, `mah-*`, `hero-kpi-*`): the red field with the orbit behind it. One per screen at most; the board uses it.
- `KpiCard` (`kpi-card`): every figure carries a `sub` that states its basis.
- `Pill` (`pill-go`, `-ready`, `-warn`, `-stop`, `-refresh`, `-remediate`, `-unknown`): a verdict, always a word plus an icon.
- `Chip` (`chip`): a label or a filter. Neutral; never colored by state.
- Buttons: two styles only. The `Button` component maps `default` to `btn-pill-primary` and everything else to `btn-pill-ghost`. Destructive actions are ghost plus a confirm step, never a red primary.
- `EmptyState` and `DataMount`: every data area renders exactly one of loading, error, empty, or ready, and records it in `data-state`. In development, `AppShell` logs any `[data-tile-mount]` without a state.
- Tables use `.tbl`: cool-gray header, zebra rows, a totals rule, and `.num` for figures.
- Detail views open in the right-side drawer (`Sheet`). Esc and the backdrop close it.

## Shell and compliance

- **AppShell** (`client/src/components/vsa/AppShell.tsx`): the official logo with its ® (asserted at nine subpaths), the main navigation, the role-view selector, and the proprietary legend on every view: "CDW — Proprietary and confidential. Copying restricted."
- **Money** uses double zeros (`formatMoney`).
- **US spellings only.** The test fails on "programme", "modelled", and similar.
