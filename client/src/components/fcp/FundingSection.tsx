import { ConsumptionHistory } from "@/components/fcp/ConsumptionHistory";
import { InternalPanel, ProvenancePill } from "@/components/fcp/Provenance";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Panel } from "@/components/vsa/elements";
import { useScopedEffort } from "@/components/WorkPackageHours";
import { withFieldPatch } from "@/lib/fieldPatch";
import type { EngagementDocument } from "@shared/fcp";
import type { ReportContent } from "@shared/report";
import { confirmAssumedFunding, fundingProvenance, type FundingFact } from "@shared/provenance";
import type { ReactNode } from "react";

type TrackerFunding = { poHours: number | null; poReceivedOn: string | null } | null;

const hours = (value: number) => Math.round(value).toLocaleString("en-US");
// CDW written style: money carries double zeros.
const dollars = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);

function Row({ label, required, hint, fact, onConfirm, readOnly, children }: { label: string; required?: boolean; hint?: string; fact: FundingFact; onConfirm?: () => void; readOnly?: boolean; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}{required && <span className="ml-1 text-cdw-red">*</span>}</Label>
      {children}
      <ProvenancePill provenance={fact.state === "assumed" && fact.assumedValue !== undefined ? { ...fact, source: `${fact.source}: ${fact.assumedValue}` } : fact} onConfirm={onConfirm} disabled={readOnly} />
      {hint && <p className="text-xs leading-5 text-s400">{hint}</p>}
    </div>
  );
}

/**
 * The Funding section: what pays for the plan. Values that print sit in one panel, each with where it comes from;
 * values that never print sit in the locked internal panel beside them. Entitled hours and consumed hours are two
 * numbers from two sources and are labelled apart. docs/FCP-WORKSPACE.md section 9.
 */
export function FundingSection({ engagementId, document, onChange, tracker, readOnly }: { engagementId: number; document: EngagementDocument; onChange: (document: EngagementDocument) => void; tracker: TrackerFunding; readOnly: boolean }) {
  const { fields, report } = document;
  const facts = fundingProvenance(document);
  const effort = useScopedEffort(document);
  const bsasOnly = fields.fundingSource === "bsas";
  const withBsas = fields.fundingSource !== "entitlement";
  const patch = (next: Partial<EngagementDocument["fields"]>) => onChange(withFieldPatch(document, next));
  const setEntitlement = (next: Partial<ReportContent["entitlement"]>) => onChange({ ...document, report: { ...report, entitlement: { ...report.entitlement, ...next } } });
  const confirm = (value: "entitlementEnd" | "bsasStart" | "bsasEnd") => () => onChange(confirmAssumedFunding(document, value));
  const numberOrNull = (raw: string) => (raw === "" ? null : Math.max(0, Number(raw) || 0));

  const internal = effort?.internal;
  const derivation = !internal
    ? "Calculating…"
    : internal.envelopeSource === "entitled hours"
      ? `${hours(internal.envelopeHours ?? 0)} hours, entered as the entitled hours${facts.entitledHours.source === "Signed resource assignments" ? " (the signed resource assignment total)" : ""}.`
      : internal.envelopeSource === "entitlement value"
        ? `${hours(internal.envelopeHours ?? 0)} hours: the entitlement value at the blended rate${internal.valueCapHours !== undefined ? `; ${hours(internal.valueCapHours)} hours after the reserve` : ""}.`
        : "No funded hours yet: enter the entitlement value or the entitled hours.";

  return (
    <div className="space-y-4">
      <Panel title="Prints in the FCP" sub="The customer sees these. The entitlement value is the only dollar figure in the FCP; everything else is hours and dates." bodyClassName="space-y-5 p-4">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Funding<span className="ml-1 text-cdw-red">*</span></Label>
            <Select value={fields.fundingSource} onValueChange={value => patch({ fundingSource: value as typeof fields.fundingSource })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="entitlement">Entitlement only</SelectItem><SelectItem value="entitlement-bsas">Entitlement + BSAS</SelectItem><SelectItem value="bsas">BSAS only</SelectItem></SelectContent>
            </Select>
            <p className="text-xs leading-5 text-s400">Entitlement + BSAS: Broadcom Software Adoption Services fund follow-on work after the entitlement. BSAS only: the plan runs on BSAS hours and the BSAS term.</p>
          </div>
        </div>

        {!bsasOnly && (
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">Entitlement</p>
            <div className="mt-2 grid gap-4 md:grid-cols-3">
              <Row label="Entitlement value (USD)" required fact={facts.entitlementAmount} readOnly={readOnly} hint="The one dollar figure the customer sees.">
                <Input type="number" min={0} step="1000" value={fields.entitlementAmount || ""} placeholder="0" onChange={event => patch({ entitlementAmount: Math.max(0, Number(event.target.value) || 0) })} />
              </Row>
              <Row label="Entitlement starts" required fact={facts.entitlementStart} readOnly={readOnly}>
                <Input type="date" value={fields.entitlementStart} onChange={event => patch({ entitlementStart: event.target.value })} />
              </Row>
              <Row label="Entitlement ends" fact={facts.entitlementEnd} onConfirm={confirm("entitlementEnd")} readOnly={readOnly} hint="Blank uses 12 months from the start, and the FCP says it is to be confirmed. Enter the stated term end to replace it.">
                <Input type="date" value={report.entitlement.termEnd ?? ""} placeholder={facts.entitlementEnd.assumedValue as string | undefined} onChange={event => setEntitlement({ termEnd: event.target.value || null })} />
              </Row>
            </div>
          </div>
        )}

        {withBsas && (
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">Broadcom Software Adoption Services (BSAS)</p>
            <div className="mt-2 grid gap-4 md:grid-cols-3">
              <Row label="BSAS hours" required fact={facts.bsasHours} readOnly={readOnly} hint="Hours from the BSAS quote. Never the BSAS amount or rates.">
                <Input type="number" min={0} step="10" value={fields.bsasHours || ""} placeholder="0" onChange={event => patch({ bsasHours: Math.min(100_000, Math.max(0, Number(event.target.value) || 0)) })} />
              </Row>
              <Row label="BSAS term starts" required={bsasOnly} fact={facts.bsasStart} onConfirm={confirm("bsasStart")} readOnly={readOnly}>
                <Input type="date" value={fields.bsasStart} onChange={event => patch({ bsasStart: event.target.value })} />
              </Row>
              <Row label="BSAS term ends" fact={facts.bsasEnd} onConfirm={confirm("bsasEnd")} readOnly={readOnly} hint="BSAS hours not used by this date are forfeited.">
                <Input type="date" value={fields.bsasEnd} onChange={event => patch({ bsasEnd: event.target.value })} />
              </Row>
            </div>
          </div>
        )}

        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">Hours</p>
          <div className="mt-2 grid gap-4 md:grid-cols-3">
            {!bsasOnly && (
              <Row label="Entitled hours" fact={facts.entitledHours} readOnly={readOnly} hint="What the entitlement funds: the signed Broadcom resource assignment total. Leave blank until they are signed; the plan derives the hours from the entitlement value meanwhile.">
                <Input type="number" min={0} value={report.entitlement.hours ?? ""} onChange={event => setEntitlement({ hours: numberOrNull(event.target.value) })} />
              </Row>
            )}
          </div>
          <div className="mt-4"><ConsumptionHistory engagementId={engagementId} document={document} onChange={onChange} readOnly={readOnly} bsasOnly={bsasOnly} /></div>
        </div>
      </Panel>

      <InternalPanel title="Planning basis" sub="How the hours are derived, and the order details the tracker holds. Used to plan; none of it is printed.">
        <dl className="grid gap-x-6 gap-y-3 text-[13px] md:grid-cols-2">
          <div>
            <dt className="text-xs text-ink-muted">Rate</dt>
            <dd className="text-ink">{internal?.money ? <>{dollars(internal.money.blendedRate)}/hr blended, from the {internal.money.rateSource}</> : internal ? "No blended rate in use for this hours model" : "Calculating…"}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-muted">Entitled hours derivation</dt>
            <dd className="text-ink">{bsasOnly ? "BSAS only: the BSAS hours are the funded hours." : derivation}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-muted">Reserve held back</dt>
            <dd className="mt-1 flex items-center gap-2">
              <Input aria-label="Reserve held back (%)" className="h-8 w-24" type="number" min={0} max={50} step="1" value={fields.estimateInputs.reservePercent ?? ""} placeholder="8" onChange={event => { const raw = event.target.value; const { reservePercent: _previous, ...rest } = fields.estimateInputs; patch({ estimateInputs: raw === "" ? rest : { ...rest, reservePercent: Math.min(50, Math.max(0, Number(raw) || 0)) } }); }} />
              <span className="text-xs text-ink-muted">% of the {bsasOnly ? "BSAS hours" : "entitlement"} kept out of the plan. Blank uses 8%; set 0 once the PO gives the exact figure.</span>
            </dd>
          </div>
          <div>
            <dt className="text-xs text-ink-muted">Purchase order</dt>
            <dd className="text-ink">{tracker?.poReceivedOn || tracker?.poHours ? <>{tracker.poReceivedOn ? `Received ${tracker.poReceivedOn}` : "Not received"}{tracker.poHours ? ` · ${hours(tracker.poHours)} hours` : ""}</> : "Not recorded on the tracker yet"}<span className="block text-xs text-ink-muted">Set on the tracker record.</span></dd>
          </div>
          {withBsas && (
            <div>
              <dt className="text-xs text-ink-muted">BSAS amount</dt>
              <dd className="text-ink">Never entered. BSAS is planned in hours and dates only.</dd>
            </div>
          )}
        </dl>
      </InternalPanel>
    </div>
  );
}
