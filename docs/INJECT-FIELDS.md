# Field Injector (`scripts/inject-fields.mts`)

**Local development only.** Applies a JSON "fields" block to an existing engagement through the local tRPC API. It doesn't change the builder's schema or UI. RVTools inventory is left as it is; only `data.fields` changes, and then readiness and both timelines are regenerated.

## Run

The app and the dev SSO proxy must be running (`fcp-dev-tools/start-fcp.sh`). Then, from `fcp-builder-cdw/`:

```bash
pnpm exec tsx scripts/inject-fields.mts --id <engagementId> --fields path/to/fields.json
# optional: --dry-run                  merge, coerce and validate, but don't post
# optional: --url http://localhost:3100  the default
```

The file can be a bare fields object or `{ "fields": { ... } }`.

### Finding the engagement ID

- **In the workspace URL:** open the engagement and read the number after `engagement=`, e.g. `http://localhost:3100/?engagement=4`. This needs PR #4 ("Keep the selected engagement ID in the workspace URL").
- **From the API:** with the app running, this lists your engagements with their IDs:

  ```bash
  curl -s http://localhost:3100/api/trpc/engagement.list | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.table(JSON.parse(s).result.data.json.map(e=>({id:e.id,title:e.title,customer:e.customerName,status:e.status}))))'
  ```

## What it does

1. **Loads** the engagement the way the browser does: `engagement.get`, then `migrateDocument()` (`client/src/pages/Home.tsx`).
2. **Coerces** common phrasings to the exact allowed value, using the shared coercion in `shared/fieldCoercion.ts` (the same rules the Customer brief import uses). Examples: `"new hardware"`→`new`, `"monthly"`→`month`, `"vSAN"`→`vsan`, `"VCF 9.1"`→`ESXi 9.1`, `"IaC"`→`infrastructure-as-code`, `"Tier 2"`→`tier-2`, `"$1,250,000"`→`1250000`, `"12 weeks"`→`12`, `"yes"`→`true`. A value is only ever replaced by one of the schema's own options. If it can't be mapped, it's left unchanged and a warning names the field and value.
3. **Deep-merges** the JSON into `data.fields`. Values present in the JSON win, and anything absent keeps the engagement's current value.
4. **Recomputes** the plan. It sets `planAuthority: "generated"` and forces a rebuild, the same as the workspace's "Rebuild Generated Plan" button. Setting `planAuthority` alone would not regenerate the timelines, because `migrateDocument` keeps the existing ones.
5. **Validates** the merged fields with `minimalFieldsSchema` and the whole document with `engagementDocumentSchema`. If either check fails, it prints the zod errors, posts nothing and exits with code 1.
6. **Posts** `engagement.update { id, title, data }`.
7. **Reads the engagement back** and fails if `inventory` or `inventorySources` differ from what was loaded. On success it prints the engagement id and a confirmation.

## How the API calls work

- The server uses the **superjson** transformer. Inputs are sent as `superjson.serialize(input)` (`{"json": …}`), and results come back as `{"result": {"data": {"json": …}}}`.
- **Batching isn't required.** A single non-batched request works through the dev proxy:
  - Queries: `GET /api/trpc/engagement.get?input=<url-encoded {"json":{"id":N}}>`
  - Mutations: `POST /api/trpc/engagement.update` with a JSON body
- Identity comes from the dev proxy on port 3100, which injects the SSO headers. Local requests without an `Origin` header are allowed through.

## Behaviour to be aware of

- **`entitlementEnd` is always overwritten** by the builder with `entitlementStart` + 12 months. The script prints a note if the JSON gave a different date.
- **Lists replace instead of merging.** `priorities` and the focus lists replace the current list completely; objects merge key by key.
- **`null` is treated as absent**, so a skeleton with blanks left as `null` can be sent unchanged.
- **Unknown keys** get a warning and are dropped, because the schema would strip them silently.
- **Dates** use the format `YYYY-MM-DD`.

## Allowed values (version 11, `shared/fcp.ts`)

These values were read from the live schemas. The injector also reads them from the schemas at runtime, so they can't drift.

| Field | Allowed values |
|---|---|
| `hardwareAvailability` | `existing` \| `new` \| `unknown` |
| `adoptionCadence` | `month` \| `week` |
| `compatibilityTargetRelease` | `ESXi 9.0` \| `ESXi 9.1` |
| `commercialPlan` | `true` \| `false`: the plan is built as Commercial (Building Blocks workbook, VVF allowed) |
| `customerSegment` | Deprecated: read only once, for documents saved before `commercialPlan`. The deal segment is set on the tracker record. |
| `priorities[]` | `operations` \| `automation` \| `networking` \| `security` \| `resilience` \| `kubernetes` \| `private-ai` |
| `adoptionDetails.upgradePath` | `undecided` \| `in-place` \| `converge` \| `import-workload-domain` \| `greenfield` \| `hybrid` \| `design-only` \| `new-build` \| `migration-waves` (the last two are older values the builder converts) |
| `adoptionDetails.platformEdition` | `vcf` \| `vvf` (VVF applies only when `commercialPlan` is `true`) |
| `adoptionDetails.domainTopology` | `undecided` \| `consolidated` \| `standard` |
| `adoptionDetails.principalStorage` | `undecided` \| `vsan` \| `nfs-v3` \| `vmfs-fc` \| `other-existing` |
| `adoptionDetails.industryTemplate` | `general-enterprise` \| `healthcare-life-sciences` \| `financial-services-insurance` \| `manufacturing-retail-distributed` \| `public-sector-education` \| `digital-products-technology` |
| `adoptionDetails.operations[]` (max 6) | `lifecycle` \| `observability` \| `capacity-cost` \| `custom-dashboards` \| `identity-certificates` \| `event-integration` |
| `adoptionDetails.automation[]` (max 6) | `vm-self-service` \| `infrastructure-as-code` \| `day-2-automation` \| `governance` \| `application-provisioning` \| `data-services` |
| `adoptionDetails.networking[]` (max 6) | `physical-fabric` \| `edge-cluster-routing` \| `overlay-transport` \| `vpc` \| `load-balancing` \| `network-operations` |
| `adoptionDetails.security[]` (max 8) | `segmentation` \| `identity-rbac` \| `hardening-compliance` \| `ids-ips` \| `malware-prevention` \| `identity-firewall` \| `security-intelligence` \| `waf` |
| `adoptionDetails.resilience[]` (max 4) | `recovery-architecture` \| `recovery-exercises` \| `cyber-recovery` \| `cloud-cyber-recovery` |
| `adoptionDetails.kubernetes[]` (max 3) | `workload-domains` \| `platform-operations` \| `developer-experience` |
| `adoptionDetails.privateAi[]` (max 3) | `gpu-capacity` \| `ai-guardrails` \| `pilot-onboarding` |
| `adoptionDetails.softPrerequisites[]` (max 3) | `dns-ntp` \| `ip-pools` \| `tor-switch-design` |
| `adoptionDetails.componentDepths` | keys `operations`, `automation`, `networkingSecurity`, `kubernetesAi`, `efficiency`; each is `not-selected` \| `tier-1` \| `tier-2` \| `tier-3` |
| `exportPreferences` | `{ includeVcfReadiness: boolean, includeOperationalTimeline: boolean }` |

## Example `fields.json`

```json
{
  "customerName": "Test Customer Inc.",
  "accountId": "TC-001",
  "location": "Charlotte, NC",
  "primaryContact": "Jordan Example",
  "entitlementAmount": "$1,250,000",
  "entitlementStart": "2026-11-01",
  "hardwareAvailability": "new hardware",
  "hardwareLeadWeeks": "12 weeks",
  "priorities": ["Operations", "Automation", "Private AI", "DR"],
  "adoptionCadence": "monthly",
  "compatibilityTargetRelease": "VCF 9.1",
  "commercialPlan": true,
  "adoptionDetails": {
    "upgradePath": "in-place upgrade",
    "domainTopology": "Standard",
    "principalStorage": "vSAN",
    "componentDepths": { "operations": "Tier 2", "automation": "tier1" },
    "operations": ["Lifecycle", "Capacity & Cost"],
    "automation": ["IaC", "Day 2 Automation"],
    "industryTemplate": "Healthcare & Life Sciences"
  },
  "exportPreferences": { "includeOperationalTimeline": "yes" }
}
```

## Verification (2026-09-23)

Tested on a local test engagement that had made-up inventory (6 hosts, 140 VMs, one source file; not a real RVTools file):

- **Unmappable value:** `upgradePath: "sideways upgrade"` produced a warning and a zod error, and nothing was posted (exit 1).
- **The example above:** 21 values were coerced and 18 field values changed. After posting:
  - `inventory` and `inventorySources` were byte-identical to before.
  - Both timelines and the readiness section were regenerated.
  - The engagement's status became `ready`.
  - Fields that weren't in the JSON kept their values.
- **Second run with the same file:** 0 field values changed.
- The script type-checks cleanly. `pnpm check` doesn't cover `scripts/`, because `tsconfig.json` only includes `client/`, `shared/` and `server/`, so it was checked with a temporary config that includes it.
