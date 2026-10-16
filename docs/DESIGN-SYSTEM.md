# App design system

The app UI uses the CDW brand: the official logo, CDW Red as its one accent, and the cool grays. The layout is a calm, dense dashboard. This file covers brand and compliance rules. `docs/VSA-TRACKER-UI.md` covers screens, components, and patterns. `server/designSystem.test.ts` enforces the parts that can be checked.

Exported FCP documents (HTML/PDF, condensed FCP, handoff, Building Blocks) are **out of scope**. They keep their own palette. Do not restyle the renderers to match the app.

## Tokens

There is one token block on `:root` and one on `.dark`, both in `client/src/index.css`. Brand values come from `cdw-branding/assets/brand-tokens.json`. Never hand-type a brand hex anywhere else. Use the Tailwind utilities generated from the tokens (`bg-surface`, `text-ink`, `border-s100`, `bg-state-warn-soft`, …).

| Role | Tokens | Rule |
|---|---|---|
| Brand | `--cdw-red` `#CC0000` (PMS 186c), `--cdw-red-deep`, `--cdw-red-text`, `--accent-soft` | The one accent: primary buttons, active navigation, focus, and a key metric. Never a large fill or a hero field |
| Secondary | `--cool-11`, `--cool-8`, `--cool-4` | Support red; never replace it |
| Neutral | `--s50` to `--s600`, `--surface`, `--surface-sunken`, `--ink`, `--ink-muted`, `--ink-subtle` | One ramp, one naming scheme |
| State | `--state-pass`, `--state-warn`, `--state-blocked`, `--state-unknown` (each with `-text` and `-soft`) | Verdicts only, shown as low-saturation badges, never decoration. `--state-blocked` shares the brand hex and keeps its own name |
| Figures | `--fig-pos`, `--fig-neg` | Signed money; not a state |

Every color token has a dark value, except the brand red fills and the white text on them. A test checks this.

No teal, and no `#E31837` or `#c8102e`. The test fails on these and on the retired navy chrome.

## Type

Inter, **bundled** through `@fontsource-variable/inter`. The brand guides specify no typeface. The app makes no outbound calls, so there are no remote font links.

## Elements

`client/src/components/vsa/elements.tsx` provides the elements. Their styles are in `index.css` under "Element set".

- **`PageHeader`** and **`Panel`**: the page title row, and bordered sections with a header row.
- **`KpiCard`** (`kpi-card`): a small tile. Every figure carries a `sub` that states its basis or its change.
- **`Pill`** (`pill-go`, `-ready`, `-warn`, `-stop`, `-refresh`, `-remediate`, `-unknown`): a verdict, shown as a small badge that is always a word plus an icon.
- **`Chip`** (`chip`): a label or a filter. Neutral; never colored by state.
- **Buttons:** two styles only. The `Button` component maps `default` to `btn-primary` and everything else to `btn-secondary`; `ghost` is the secondary style without a border. Destructive actions are secondary plus a confirm step, never a red primary.
- **`EmptyState`** and **`DataMount`:** every data area renders exactly one of loading (skeleton), error, empty, or ready, and records it in `data-state`. In development, `AppShell` logs any `[data-tile-mount]` without a state.
- **Tables** use `.tbl`: a sunken header row, hairline rows, hover, and `.num` for figures. Risk shows as a 2px left rule plus a pill.
- **Detail views** open in the shared right-side record drawer (`useShell().openRecord`). Esc and the backdrop close it.

## FCP workspace (`/fcp`)

- **Toolbar:** back to the Pipeline, switch engagement, title, Tracker details (opens the record drawer), Versions, Save, Rebuild plans, and a More menu (New FCP, Duplicate, Delete).
- **Header band:** a neutral panel with the work plan headline, and its dates and value as figure tiles that each state their basis.
- **Steps:** a horizontal stepper. The active step has a sunken background and a red underline; a completed step shows a check.
- **Panels:** bordered surfaces on the neutral ramp. Statuses use the state tokens. Compatibility decisions, reconciliation, readiness, and action priority render as pills; evidence state and catalog notes are chips.
- **Exception:** the Entitlement Adoption Timeline bars and their legend keep the workstream colors the FCP document defines, so the preview matches the exported FCP.
- **Money:** every client money formatter shows double zeros.

## Charts

- One measure per chart, drawn in a single neutral series (`--chart-bar`). The title names what is plotted, and bars carry direct labels.
- Risk bands on the Expiry & Burndown page use the soft state colors with a solid edge, plus a text label on every bar, so color is never the only signal.
- The brand's series order (red, then cool grays 11, 8, and 4) fails the data-visualization palette check as a categorical palette. The grays fall below the chroma floor, and Cool Gray 4 is under 3:1 contrast. So comparisons across a second dimension use the pivot table, not colored series.
- No dual axes.
- **Exports:** CSV and XLSX both end with the proprietary legend. The XLSX header uses the table-contract fill (Cool Gray 11, white bold).

## Shell and compliance

- **AppShell** (`client/src/components/vsa/AppShell.tsx`):
  - the official logo with its ® (asserted at nine subpaths);
  - the sidebar, top bar, and breadcrumbs;
  - the proprietary legend on every view: "CDW — Proprietary and confidential. Copying restricted."
- **Money** uses double zeros (`formatMoney`).
- **US spellings only.** The test fails on "programme", "modelled", and similar.
