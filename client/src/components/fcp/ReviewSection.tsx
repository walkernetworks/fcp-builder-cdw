import { IssuedVersionsList, IssuePanel, ReportFormatPicker } from "@/components/fcp/IssuedVersions";
import { ReportContentEditor } from "@/components/ReportContentEditor";
import { Button } from "@/components/ui/button";
import { Panel, Pill } from "@/components/vsa/elements";
import type { EngagementDocument } from "@shared/fcp";
import { defaultReportFormat, type ReportFormatChoice } from "@shared/reportFormat";
import { internalChecklistItems, reviewChecklist, type FixSection } from "@shared/reviewChecklist";
import type { Segment } from "@shared/vsaStage";
import { ChevronDown } from "lucide-react";
import { useState } from "react";

const SECTION_NAMES: Record<FixSection, string> = { engagement: "Engagement", funding: "Funding", estate: "Estate", scope: "Scope", plan: "Plan" };

type IssueActions = Parameters<typeof IssuePanel>[0];

/**
 * Review and issue, one flow from the top: what must be fixed before issuing, the issue itself with the versions and
 * their approvals and downloads (the FCP, its Delivery Handoff and its Building Blocks workbook) under it, and the sources
 * behind a "More" fold. The draft FCP is exported from the header.
 */
export function ReviewSection({ document, segmentWarning, wavesWarning, onFix, segment, reportFormat, formatChoice, onFormatChoice, issueActions, onChange }: {
  document: EngagementDocument;
  segmentWarning: string | null;
  wavesWarning: string | null;
  onFix: (section: FixSection) => void;
  segment: Segment | null;
  reportFormat: ReportFormatChoice;
  formatChoice: ReportFormatChoice | null;
  onFormatChoice: (choice: ReportFormatChoice | null) => void;
  issueActions: IssueActions;
  onChange: (document: EngagementDocument) => void;
}) {
  // The funding result comes from the issue check; until it has run the checklist says so. It belongs to the document
  // it was run on, so any edit afterwards puts the item back to "not checked".
  const [checked, setChecked] = useState<{ document: EngagementDocument; fundingProblem: string | null } | undefined>();
  const funding = checked?.document === document ? checked : undefined;
  const items = reviewChecklist(document, { segmentWarning, wavesWarning, fundingProblem: funding?.fundingProblem });
  const open = items.filter(item => !item.ready);
  const internal = internalChecklistItems(document);
  const fallback = defaultReportFormat(segment);
  const [more, setMore] = useState(false);
  return (
    <div className="space-y-5">
      <Panel title="Ready to issue" sub="Everything below should be ready before the FCP goes to the customer. Each item that is not says where to fix it." actions={<Pill verdict={open.length ? "warn" : "ready"}>{open.length ? `${open.length} to fix` : "Ready"}</Pill>} bodyClassName="p-0">
        <ul className="divide-y divide-s100">
          {items.map(item => (
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">{item.label}</p>
                {item.detail && <p className="mt-0.5 max-w-3xl text-xs leading-5 text-ink-muted">{item.detail}</p>}
              </div>
              <div className="flex items-center gap-2">
                {item.pending ? <Pill verdict="unknown">Not checked</Pill> : item.ready ? <Pill verdict="ready">Ready</Pill> : <Pill verdict="warn">To fix</Pill>}
                {!item.ready && <Button variant="outline" size="sm" className="h-7" onClick={() => onFix(item.fixIn)}>Fix in {SECTION_NAMES[item.fixIn]}</Button>}
              </div>
            </li>
          ))}
        </ul>
        {internal.length > 0 && (
          <div className="border-t border-s100 px-4 py-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">Internal items, not printed in customer documents</p>
            <ul className="mt-2 space-y-1 text-xs text-ink">{internal.map(row => <li key={row.item}><span className="font-semibold">{row.item}</span> <span className="text-s500">· {row.owner}{row.gates ? ` · gates ${row.gates}` : ""}</span></li>)}</ul>
          </div>
        )}
      </Panel>

      <section className="space-y-4" aria-label="Issue to the customer">
        <ReportFormatPicker segment={segment} value={reportFormat} overridden={formatChoice !== null && formatChoice !== fallback} onChange={choice => onFormatChoice(choice === fallback ? null : choice)} />
        <IssuePanel {...issueActions} onChecked={result => setChecked(result ? { document, fundingProblem: result.fundingProblem } : undefined)} />
        <IssuedVersionsList {...issueActions} />
      </section>

      <section className="rounded-lg border border-s100 bg-surface">
        <button type="button" className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left" aria-expanded={more} onClick={() => setMore(value => !value)}>
          <span className="text-sm font-semibold text-ink">More<span className="ml-2 text-xs font-normal text-ink-muted">Sources cited in the report footer</span></span>
          <ChevronDown className={`size-4 text-ink-muted transition-transform ${more ? "rotate-180" : ""}`} />
        </button>
        {more && <div className="border-t border-s100 px-4 pb-4"><ReportContentEditor document={document} onChange={onChange} sections={["sources"]} /></div>}
      </section>
    </div>
  );
}
