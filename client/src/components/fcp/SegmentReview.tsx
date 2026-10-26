import { Button } from "@/components/ui/button";
import { Chip } from "@/components/vsa/elements";
import { trpc } from "@/lib/trpc";
import { refreshDerivedDocument, type EngagementDocument } from "@shared/fcp";
import { commercialPlanForSegment, SEGMENT_NAMES, segmentWarning, type SegmentChoice, type SegmentReview as Review } from "@shared/fcpRecord";
import type { Segment } from "@shared/vsaStage";
import { AlertTriangle, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type Props = {
  engagementId: number;
  document: EngagementDocument;
  segment: Segment | null;
  segmentSource: "inferred_from_fcp" | null;
  review: Review | null;
  readOnly: boolean;
  /** Applies the change and saves it before the decision is recorded. */
  saveDocument: (next: EngagementDocument) => Promise<void>;
};

const planName = (commercialPlan: boolean) => (commercialPlan ? "Commercial" : "Standard");

/**
 * The deal segment from the tracker, read-only, beside the plan type. When they disagree, a readiness warning that only
 * a person resolves: change the plan type to match the tracker, or keep the plan as built. Either choice is logged in
 * History; the system never picks one.
 */
export function SegmentReview({ engagementId, document, segment, segmentSource, review, readOnly, saveDocument }: Props) {
  const utils = trpc.useUtils();
  const decide = trpc.fcpRecord.decideSegment.useMutation();
  const [pending, setPending] = useState<SegmentChoice | null>(null);
  const commercialPlan = document.fields.commercialPlan;
  const warning = segmentWarning(segment, commercialPlan, review);

  const choose = async (choice: SegmentChoice) => {
    if (!segment || pending) return;
    setPending(choice);
    try {
      if (choice === "match-tracker") await saveDocument(refreshDerivedDocument({ ...document, fields: { ...document.fields, commercialPlan: commercialPlanForSegment(segment) } }));
      await decide.mutateAsync({ id: engagementId, choice });
      await Promise.all([utils.tracker.get.invalidate({ id: engagementId }), utils.fcpRecord.versions.invalidate({ id: engagementId })]);
      toast.success(choice === "match-tracker" ? `Plan changed to ${planName(commercialPlanForSegment(segment))}; the decision is in History` : "Plan kept as built; the decision is in History");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The decision was not recorded.");
    } finally {
      setPending(null);
    }
  };

  return (
    <section className="rounded-lg border border-s100 bg-surface p-4" aria-label="Deal segment">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <span className="flex items-center gap-2">
          <span className="text-ink-muted">Tracker segment</span>
          <strong className="text-ink">{segment ? SEGMENT_NAMES[segment] : "Not set"}</strong>
          {segment && segmentSource === "inferred_from_fcp" && <Chip>Filled from the FCP, not confirmed</Chip>}
        </span>
        <span className="flex items-center gap-2">
          <span className="text-ink-muted">Plan built as</span>
          <strong className="text-ink">{planName(commercialPlan)}</strong>
        </span>
      </div>
      <p className="mt-2 text-xs leading-5 text-ink-muted">The deal segment is set on the tracker record and only shown here. The plan type below is this FCP's own input; neither is ever copied over the other.</p>
      {warning && segment && (
        <div className="mt-3 rounded-lg border border-state-warn/30 bg-state-warn-soft p-3" role="status">
          <p className="flex items-start gap-2 text-sm font-medium text-state-warn-text"><AlertTriangle className="mt-0.5 size-4 shrink-0" /> {warning}</p>
          <p className="mt-1 pl-6 text-xs leading-5 text-s600">Choose which is right. Changing the plan type changes the plan and the delivery package (the Building Blocks workbook comes with a Commercial plan). Your choice is saved in History with your name.</p>
          <div className="mt-3 flex flex-wrap gap-2 pl-6">
            <Button size="sm" variant="outline" className="bg-surface" disabled={readOnly || Boolean(pending)} onClick={() => void choose("match-tracker")}>
              {pending === "match-tracker" && <Loader2 className="size-4 animate-spin" />} Build as {planName(commercialPlanForSegment(segment))} to match the tracker
            </Button>
            <Button size="sm" variant="outline" className="bg-surface" disabled={readOnly || Boolean(pending)} onClick={() => void choose("keep-plan")}>
              {pending === "keep-plan" && <Loader2 className="size-4 animate-spin" />} Keep the plan as {planName(commercialPlan)}
            </Button>
          </div>
        </div>
      )}
      {!warning && review && segment && review.segment === segment && review.commercialPlan === commercialPlan && review.choice === "keep-plan" && (
        <p className="mt-2 text-xs leading-5 text-ink-muted">Kept as {planName(commercialPlan)} by {review.byName ?? "a teammate"} on {review.at.slice(0, 10)}, with the tracker segment {SEGMENT_NAMES[segment]}.</p>
      )}
    </section>
  );
}
