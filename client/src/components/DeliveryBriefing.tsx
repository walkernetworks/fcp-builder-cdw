import type { EngagementDocument } from "@shared/fcp";
import { deliveryBriefing } from "@shared/deliveryBriefing";

/** The discovery answers on record and what each means for delivery; also printed in the Technical Handoff. */
export function DeliveryBriefing({ document }: { document: EngagementDocument }) {
  const items = deliveryBriefing(document);
  return (
    <section className="rounded-lg border border-s100 bg-surface p-5 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">What delivery needs to know</p>
      <p className="mt-2 max-w-4xl text-xs leading-5 text-s500">Discovery answers on record, from the Copilot brief or the FCP Report Content step, and what each means for the work in this plan. The Technical Handoff document carries the same list.</p>
      {items.length ? (
        <table className="tbl mt-4 w-full">
          <thead><tr className="text-left text-[11px]"><th className="px-2 py-1.5">Topic</th><th className="px-2 py-1.5">On record</th><th className="px-2 py-1.5">What it means for delivery</th></tr></thead>
          <tbody>{items.map(item => <tr key={item.topic} className="border-b border-s100 align-top"><td className="px-2 py-1.5 font-semibold text-ink">{item.topic}</td><td className="px-2 py-1.5 text-ink">{item.detail}</td><td className="px-2 py-1.5 text-s500">{item.why}</td></tr>)}</tbody>
        </table>
      ) : <p className="mt-4 text-xs text-s400">No discovery answers yet. Import a Copilot brief or fill in “Estate, discovery and details” on the FCP Report Content step.</p>}
    </section>
  );
}
