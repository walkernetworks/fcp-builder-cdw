# VSA Tracker UI

How the tracker screens look and behave, so new work stays consistent. The UI should feel calm, dense, and data-first, with one accent color. The reference points are Linear, Stripe Dashboard, and Vercel. `docs/DESIGN-SYSTEM.md` has the brand rules. `server/designSystem.test.ts` enforces the parts that can be checked.

## Screens

| Route | Screen | What it is for |
|---|---|---|
| `/` | Overview | Landing page. Shows stat tiles, the entitlements nearest expiry (At risk), records needing attention, a pipeline-by-stage chart, and data-quality counts. |
| `/pipeline` | Pipeline | Open records as a sortable, filterable table. The board is a secondary toggle (`?view=board`). |
| `/expiry` | Expiry & Burndown | The analytical view: entitlements by days to expiry, VSA amount by expiry month, and a table sorted by risk. |
| `/queue` | My Queue | Role queues, which are built-in saved filters: Awaiting my action, Assigned to me, As architect, As PM, As sales, As presales, and Needs attention. |
| `/records` | Records | Every record, closed ones included, in the same table. |
| `/fcp` | FCP workspace | Building the FCP for one record. |
| `/import` | Import | Daily SharePoint import. |
| `/reports` | Reports | Custom reports with CSV and Excel export. |
| `/admin` | Admin | Admins only. Collapsible sections, one concern each: Users, Workflow parameters, System status (read-only), and placeholders for Capabilities (Phase 3) and Notification rules (Phase 4). `?section=<id>[,<id>]` opens sections. The sidebar entry is hidden from everyone else, and the server refuses them. |
| `/admin/users/:id` | User profile | Admins only. A user's access (role, role view, workspace; edited here, the only place), the record assignments they hold, last sign-in, and recent activity. |

The Overview tiles and stage rows link into these screens with filters already applied: `?segment=none`, `?flagged=1`, `?stage=<stage>`, and `?q=<queue>`.

## Shell

`client/src/components/vsa/AppShell.tsx` wraps every signed-in route once, in `App.tsx`.

- **Sidebar:** uses the shadcn `sidebar` with `collapsible="icon"`, toggled by Cmd/Ctrl-B or the rail. The open or collapsed state is saved in `localStorage` (`vsa.sidebarOpen`). The shadcn cookie write was removed, so the app still sets no cookies. The active item has a 2px red rule, red icon, and ink text.
- **Navigation list:** `components/vsa/navigation.ts` is the single list behind the sidebar, the command palette, and the breadcrumbs. A test checks that every sidebar item has a route.
- **Top bar:**
  - workspace name;
  - search button that opens the command palette;
  - theme toggle;
  - user menu, which also sets the default queue (`users.vsaRole`).
- **Breadcrumbs:** workspace › group › screen, shown under the top bar.
- **Command palette:** `CommandPalette.tsx`, built on `cmdk`, opens with Cmd/Ctrl-K. It searches records by customer, opportunity number, SER number, or ID, and also lists screens and actions (New engagement, switch theme).
- **ShellContext:** one `RecordDrawer` and one New engagement dialog serve the whole app. Open a record with `useShell().openRecord(id, tab)`. Don't mount another drawer.
- **Legend:** the proprietary legend appears in the footer of every screen.

## Tokens

All tokens are defined in `client/src/index.css`, in one `:root` block and one `.dark` block. Use them through Tailwind utilities, never as raw hex values.

| Group | Tokens | Rule |
|---|---|---|
| Accent | `--cdw-red`, `--cdw-red-deep`, `--cdw-red-text`, `--accent-soft` | Primary buttons, active navigation, focus rings, and at most one key metric per tile row (`KpiCard keyMetric`). Never a large fill. Use `--cdw-red-text` for red text so it keeps contrast in dark mode. |
| Surfaces | `--s50` (page), `--surface` (panels), `--surface-sunken` (table headers, hover, selected) | Panels are `--surface` on a `--s50` page. |
| Neutral scale | `--s100` (hairline border) through `--s600` | One ramp. Borders are 1px `--s100`; inputs use `--s200`. |
| Text | `--ink`, `--ink-muted`, `--ink-subtle` | Values are `--ink`. Labels and secondary text are `--ink-muted`. Placeholders and empty values ("—") are `--ink-subtle`. |
| State | `--state-pass`, `--state-warn`, `--state-blocked`, `--state-unknown`, each with `-text` and `-soft` | Verdicts only, shown as low-saturation badges. Never decoration, never a row fill. |
| Charts | `--chart-bar` | One neutral series. Risk bands use the soft state colors with a solid edge. |
| Depth | `--shadow-card`, `--shadow-pop` | `--shadow-card` is a barely visible 1px lift for panels; `--shadow-pop` is for menus and popovers. |
| Shape | `--radius` = 8px | 4px for pills and chips, 6px for buttons and inputs, 8px for panels. No large rounded cards. |

**Dark mode** uses its own values from the same scale, not an automatic inversion. Rules:
- The brand red stays `#CC0000` for fills.
- Red text and soft fills get dark-specific values.
- A test checks that every color token in `:root` has a `.dark` value.

The theme is handled by `next-themes` (the `class` attribute; light by default; follows the system theme if the user chooses). Use `bg-surface`, never `bg-white`; a test enforces this.

**Type:** Inter, bundled through `@fontsource-variable/inter`, never loaded remotely.

| Use | Size and weight |
|---|---|
| Body | 14px |
| Table text | 13px |
| Page title | 20px / 600 |
| Panel title | 13px / 600 |
| Table header | 11px / 500 / uppercase |
| Stat value | 26px / 600 |

Figures use `tabular-nums` (the `.tabular` class or `.num`).

**Spacing:** a 4px base, with an 8px rhythm between elements. Gutters inside a panel are 16px; space between sections is 24px; the page gutter is 24px.

## Components

All in `client/src/components/vsa/`.

- **`elements.tsx`**
  - `PageHeader`: title, one-line context, and actions on the right.
  - `Panel`: bordered section with a header row.
  - `KpiCard`: stat tile with a tiny label, a big number, and one line of basis or change. It becomes a link with `onClick`.
  - `Pill`: verdict badge, always a word plus an icon.
  - `Chip`: neutral label or toggle filter.
  - `EmptyState`.
  - `DataMount`: renders exactly one of loading (skeleton), error, empty, or ready, and records it in `data-state`.
  - `HeroBand`: neutral header panel used by the FCP workspace.
- **`EngagementTable.tsx`**
  - `EngagementTable`: dense table with columns customer, stage, segment, architect, days in stage, expiry, VSA amount, health, and attention. Click a column header to sort; `aria-sort` is set. Rows are focusable: arrow keys move between rows, Enter opens the record. Empty values sort last in either direction.
  - `FilterBar`: one row containing search, multi-select filters (stage, segment, health, architect), a Needs attention only toggle, Clear, and saved views.
- **`cells.tsx`:** `HealthPill`, `SegmentText`, `DaysLeft`, `ExpiryCell`, `AttentionPill`. Use these so every screen shows the same fact the same way.
- **`PipelineBoard.tsx`:** the secondary board.
  - Columns have no fill; headers are quiet text with a count.
  - Cards are compact and show status as small pills.
  - Dragging a card to another column is optional and follows the same rules as Move stage.
- **`RecordDrawer.tsx`:** a 720px sheet with six tabs. One form (`useRecordForm` in `RecordEditor.tsx`) sits above the tabs, so unsaved edits survive switching tabs. A sticky save bar shows the unsaved count on any tab. Saves send only changed fields with the record's `rowVersion`, so a stale save is refused. Each field has exactly one place it is edited.
  - **Overview:** the editable record. Open items and Customer approval (read-only, derived from the gate dates) sit at the top. Below them, the record-level fields are grouped: identity, classification, status, commercials and term, notes and links.
  - **Stage & gates:** Move stage, the gate dates as an editable vertical timeline (done, next, not yet), and the stage history.
  - **Sources.**
  - **People.**
  - **Files:** "Open client folder" and the record's file links, from `tracker.files` (`server/fileSource.ts`). An empty state when no folder is linked.
  - **FCP:** readiness, who is editing, FCP dates, recent versions.

## Patterns

- **Attention:** `attentionFor(row)` in `client/src/lib/pipeline.ts` combines three things:
  - data-quality flags (`shared/vsaDashboard.ts`): no segment, no or placeholder opportunity number, no VSA amount, no expiry date, no architect after Broadcom Request;
  - a stale stage, using the per-stage thresholds in `STALE_AFTER_DAYS`;
  - stage warnings.

  Tables show the total as one pill, with the full list in its tooltip.
- **Awaiting my action** (`awaitingAction`): the record is open, nobody outside CDW is holding it (`waitingOn` is not the customer or Broadcom), and the user holds a role that owns the stage's next step (`STAGE_OWNERS`). If `waitingOn` is sales, the sales roles own it instead.
- **Expiry risk:** bands are Expired, 0 to 30, 31 to 60, 61 to 90, 91 to 180, over 180 days, and no date. The day limits, the stale-stage thresholds, and the work plan warning are admin settings: read them with `useOperationalSettings()` (`client/src/lib/settings.ts`) and pass them to the pure functions, never the constants directly.
  - Expired and 0 to 30 days are `stop`.
  - 31 to 90 days are `warn`.
  - Tables mark risk with a 2px left rule (`.risk-stop`, `.risk-warn`) plus the pill, never a row fill.
- **Alternative plans:** count once everywhere, through `expiryRows` and `entitlementTotal`.
- **Hours:** records don't carry hours yet.
  - Hours tiles, columns, and the pace panel show "—" or the "No hours recorded yet" empty state.
  - `requiredWeeklyPace` and `fteForPace` (40 hours per FTE week) are ready and tested. A follow-up that adds planned and delivered hours only needs to supply the numbers.
- **Saved views:** stored per browser in `localStorage` (`vsa.savedViews.<scope>`). They are a convenience; the role queues are the shared saved filters.
- **Toasts:** use `sonner`, themed with the app.
- **Destructive actions:** ghost button plus a confirm step.
- **Charts:** one series, labeled bars, a `role="img"` summary, tooltips on hover, and no dual axes. See the dataviz notes in `docs/DESIGN-SYSTEM.md`.
