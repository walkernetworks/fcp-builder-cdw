import { describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";
import { buildTimelineFromFields, createDefaultDocument, createDefaultFields, validateTimeline } from "../shared/fcp";
import { renderFcpHtml } from "./fcpRenderer";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function authenticatedContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 7,
    openId: "cdw-test-user",
    email: "sa@example.test",
    name: "Test SA",
    loginMethod: "trusted-proxy",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  return { user, req: { headers: {}, protocol: "https" }, res: {} } as TrpcContext;
}

describe("FCP sequencing rules", () => {
  it("matches the Meridian golden scenario", () => {
    const fields = createDefaultFields();
    Object.assign(fields, {
      customerName: "Meridian Health",
      cust: "MH",
      vmCount: "1200",
      hardwareVendor: "Dell",
      hardwareLeadMonths: 4,
      hardwareIsNetNew: true,
      drInScope: true,
      drApproach: "SRM",
      vdefendInScope: true,
      k8sInScope: false,
      dsmInScope: false,
    });

    const { timeline, rationale } = buildTimelineFromFields(fields);
    const laneNames = timeline.lanes.map(lane => lane.name);
    const labels = timeline.lanes.flatMap(lane => lane.bars.map(bar => bar.label));

    expect(rationale).toContain("4-month Dell lead");
    expect(rationale).toContain("3 HCX waves");
    expect(laneNames).not.toContain("Modernize App Platform & AI");
    expect(labels.some(label => label.includes("VDefend"))).toBe(true);
    expect(labels.some(label => label.includes("SRM"))).toBe(true);
    expect(timeline.lanes.flatMap(lane => lane.bars).find(bar => bar.id === "bar-acc")?.deferred).toBe(true);
    expect(validateTimeline(timeline)).toEqual([]);
  });

  it("does not include Kubernetes or DSM without explicit scope", () => {
    const fields = createDefaultFields();
    fields.k8sInScope = false;
    fields.dsmInScope = false;
    const { timeline } = buildTimelineFromFields(fields);
    expect(timeline.lanes.map(lane => lane.name)).not.toContain("Modernize App Platform & AI");
  });

  it("detects same-lane overlap", () => {
    const { timeline } = buildTimelineFromFields(createDefaultFields());
    timeline.lanes[0].bars.push({ id: "overlap", startCol: 1, endCol: 3, color: "red", label: "Overlap", milestone: false, deferred: false });
    expect(validateTimeline(timeline)[0]).toContain("overlaps");
  });
});

describe("FCP rendering", () => {
  it("renders all synchronized views without placeholder tokens", () => {
    const fields = createDefaultFields();
    fields.customerName = "Meridian Health";
    fields.cust = "MH";
    fields.vmCount = "1200";
    const draft = buildTimelineFromFields(fields);
    const html = renderFcpHtml("Meridian FCP", { version: 1, fields, ...draft });

    expect(html).toContain("Adoption Sequence & Dependencies");
    expect(html).toContain("Private Cloud Gantt");
    expect(html).toContain("Two-Year Gantt");
    expect(html).toContain("Executive Roadmap");
    expect(html).toContain("Forward Delivery Plan");
    expect(html).not.toMatch(/\[\[[^\]]+\]\]/);
  });

  it("returns an authenticated standalone HTML download with a safe filename", async () => {
    const document = createDefaultDocument();
    document.fields.customerName = "Meridian Health";
    const caller = appRouter.createCaller(authenticatedContext());
    const result = await caller.document.html({ title: "Meridian Health / FCP", data: document });

    expect(result.filename).toBe("Meridian-Health-FCP.html");
    expect(result.mime).toBe("text/html;charset=utf-8");
    expect(result.content).toContain("Meridian Health");
    expect(result.content).not.toMatch(/\[\[[^\]]+\]\]/);
  });
});

describe("API authorization", () => {
  it("rejects unauthenticated engagement access", async () => {
    const ctx = { user: null, req: { headers: {}, protocol: "https" }, res: {} } as TrpcContext;
    const caller = appRouter.createCaller(ctx);
    await expect(caller.engagement.list()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
