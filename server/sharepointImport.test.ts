import { describe, expect, it } from "vitest";
import { parseCsv } from "../shared/csv";
import {
  IMPORT_FIELDS,
  mapPipelineRow,
  mergeField,
  parsePipelineCsv,
  planImport,
  SHAREPOINT_HOST,
  type ExistingRecord,
  type ImportPlan,
} from "../shared/sharepointImport";

// Synthetic rows only. Column order follows the real export; "ID" is the built-in column the view should add.
const HEADERS = [
  "ID", "Customer Name", "Customer State", "Opportunity ID", "Deal ID or Name", "West vs East", "Program", "BC Segment", "Customer Entitlement Interest",
  "VSA Approval Stage", "Resource Assignments", "Nat. Presales", "DC FSA", "VCF Assessment", "FCP Draft Created Date", "FCP Submitted",
  "FCP Customer Acceptance Date", "FCP Done", "IKOM Date", "CDW Risk Assessment", "Next Steps", "CKOM Date", "FCP Broadcom Acceptance Date",
  "Work Auth Rec'd Date", "Project Status", "VSA Amount", "PO Received", "Project Status Notes", "Estimated Close Date", "Sales Rep / Owner",
  "VSA Expiration", "CDW Account Manager", "New CDW Account %23", "Estimated Deal Value ($)", "Broadcom PO", "PM: Broadcom email",
  "Architect: Broadcom email", "PM", "Sr. Consultant: Broadcom email", "Architect", "Project Start Date", "Sr. Consultant", "Is VSA?",
  "Funding Extension", "Modified", "SER Number", "Client Folder",
];

type Row = Partial<Record<(typeof HEADERS)[number], string>>;
const quote = (value: string) => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
function csv(rows: Row[], headers: string[] = HEADERS) {
  return [headers.map(quote).join(","), ...rows.map(row => headers.map(header => quote(row[header] ?? "")).join(","))].join("\r\n");
}
const base = (overrides: Row = {}): Row => ({
  ID: "101",
  "Customer Name": "Example Health",
  "Deal ID or Name": "C-OPP-1000001",
  "BC Segment": "Corporate",
  "VSA Approval Stage": "1 Customer Discovery & Scoping",
  "Resource Assignments": "1 Not Started",
  "New CDW Account %23": "10000001",
  "SER Number": "SER100001",
  "VSA Amount": "$250,000.00",
  "Is VSA?": "True",
  "Modified": "10/1/2026 9:15 AM",
  "Architect": "[]",
  "Sr. Consultant": "[]",
  ...overrides,
});
const TODAY = "2026-10-16";

/** Applies a plan to in-memory records the way server/db.ts applies it to the database. */
function applyPlan(state: ExistingRecord[], plan: ImportPlan): ExistingRecord[] {
  const next = state.map(record => ({ ...record, assignments: { ...record.assignments } }));
  let id = Math.max(0, ...next.map(record => record.id));
  for (const create of plan.creates) {
    next.push({
      ...Object.fromEntries(IMPORT_FIELDS.map(field => [field, create.fields[field] ?? null])),
      id: ++id,
      customerName: String(create.fields.customerName),
      stage: create.stage,
      stageEnteredOn: create.stageEffectiveOn,
      intakeSource: "sharepoint_import",
      importSnapshot: create.snapshot,
      assignments: { ...create.assignments },
    } as ExistingRecord);
  }
  for (const update of plan.updates) {
    const record = next.find(candidate => candidate.id === update.id)!;
    Object.assign(record, update.fields, { importSnapshot: update.snapshot });
    if (update.stageChange) Object.assign(record, { stage: update.stageChange.to, stageEnteredOn: update.stageChange.effectiveOn });
    for (const [role, value] of Object.entries(update.assignments)) {
      if (value) record.assignments[role as keyof typeof record.assignments] = value;
      else delete record.assignments[role as keyof typeof record.assignments];
    }
  }
  return next;
}

function mapOne(row: Row, headers = HEADERS) {
  const file = parsePipelineCsv(csv([row], headers));
  return mapPipelineRow(file.rows[0], file.columns);
}

describe("CSV parsing", () => {
  it("handles a BOM, CRLF, quotes, doubled quotes, and line breaks inside values", () => {
    expect(parseCsv('\ufeffa,b\r\n"x, y","say ""hi""\nthere"\r\n')).toEqual([["a", "b"], ["x, y", 'say "hi"\nthere']]);
  });

  it("rejects a file cut off inside a quoted value", () => {
    expect(() => parseCsv('a\n"open')).toThrow(/cut off/);
  });

  it("refuses a file that is not a Pipeline List export, and notes a missing ID column", () => {
    expect(parsePipelineCsv("Name,Value\nx,1").problems[0]).toMatch(/Missing columns/);
    expect(parsePipelineCsv(csv([base()], HEADERS.filter(header => header !== "ID"))).problems[0]).toMatch(/No ID column/);
  });
});

describe("row mapping", () => {
  it("maps dates, money, enums, and identifiers", () => {
    const row = mapOne(base({ "PO Received": "5/7/2026", "VSA Expiration": "12/15/2026", "West vs East": "West", Program: "Government: Entitlement", "CDW Risk Assessment": "N/A - Not Interested", "Project Status": "Green", "Customer Entitlement Interest": "Interested - Pursuing VCF" }));
    expect(row.fields).toMatchObject({ sharepointItemId: 101, opportunityNumber: "C-OPP-1000001", serNumber: "SER100001", salesforceCustomerId: "10000001", poReceivedOn: "2026-05-07", deliveryWindowEnd: "2026-12-15", entitlementValue: "250000.00", region: "west", program: "government_entitlement", riskAssessment: "not_applicable", health: "green", entitlementInterest: "interested", segment: "corporate" });
  });

  it("reads the opportunity number and Salesforce ID from the opportunity link", () => {
    const link = '<div class="ExternalClass1"><a href="https&#58;//example.my.salesforce.com/lightning/r/Opportunity/006AB00000xYz12AAA/view" target="_blank">C-OPP-2000002</a></div>';
    const row = mapOne(base({ "Deal ID or Name": "Example deal", "Opportunity ID": link }));
    expect(row.fields).toMatchObject({ opportunityNumber: "C-OPP-2000002", salesforceOpportunityId: "006AB00000xYz12AAA" });
  });

  it("treats AWC-OPP placeholders and free text as missing opportunity numbers", () => {
    expect(mapOne(base({ "Deal ID or Name": "AWC-OPP-123456" }))).toMatchObject({ fields: { opportunityNumber: null }, flags: expect.arrayContaining([expect.stringMatching(/AWC-OPP placeholder/)]) });
    expect(mapOne(base({ "Deal ID or Name": "1234" })).flags).toContainEqual(expect.stringMatching(/"1234" is not a C-OPP number/));
  });

  it("treats $0.00 as a placeholder and flags values it cannot read", () => {
    const row = mapOne(base({ "VSA Amount": "$0.00", "PO Received": "soon", "BC Segment": "" }));
    expect(row.fields.entitlementValue).toBeNull();
    expect(row.fields.poReceivedOn).toBeNull();
    expect(row.flags).toEqual(expect.arrayContaining([expect.stringMatching(/\$0\.00/), expect.stringMatching(/"soon" is not a date/), "Segment not set"]));
  });

  it("makes site-relative client folders into SharePoint links", () => {
    expect(mapOne(base({ "Client Folder": "/:f:/r/sites/Example/Shared%20Documents/Client" })).fields.clientFolderUrl).toBe(`${SHAREPOINT_HOST}/:f:/r/sites/Example/Shared%20Documents/Client`);
  });

  it("reads people columns: empty lists, several names, archived people, and Broadcom emails", () => {
    const row = mapOne(base({ PM: "Z_Archive: Pat Lee", "PM: Broadcom email": "N/A", "Sr. Consultant": "Ana Ruiz,Bo Chen", "Sr. Consultant: Broadcom email": "ana.ruiz@example.test; bo.chen@example.test", Architect: "[]", "DC FSA": "Sam Ito" }));
    expect(row.assignments).toMatchObject({ pm: { displayName: "Pat Lee", broadcomEmail: null }, sr_consultant: { displayName: "Ana Ruiz, Bo Chen", broadcomEmail: "ana.ruiz@example.test; bo.chen@example.test" }, architect: { displayName: "Sam Ito" } });
    expect(row.flags).toEqual(expect.arrayContaining([expect.stringMatching(/PM: archived/), expect.stringMatching(/Sr\. Consultant lists 2 people/)]));
  });

  it("keeps Architect over DC FSA and reports the difference", () => {
    const row = mapOne(base({ Architect: "Kim Park", "DC FSA": "Sam Ito" }));
    expect(row.assignments.architect?.displayName).toBe("Kim Park");
    expect(row.flags).toContainEqual(expect.stringMatching(/DC FSA \(Sam Ito\) differs/));
  });

  it("skips rows that are not VSAs", () => {
    expect(mapOne(base({ "Is VSA?": "False" })).skipReason).toMatch(/Is VSA/);
  });
});

describe("stage from SharePoint", () => {
  const stageOf = (row: Row) => mapOne(base(row));
  it.each([
    [{ "VSA Approval Stage": "0 Waiting on SER Approval" }, "broadcom_request"],
    [{ "VSA Approval Stage": "1 Customer Discovery & Scoping" }, "discovery"],
    [{ "VSA Approval Stage": "2 FCP" }, "fcp_draft"],
    [{ "VSA Approval Stage": "2 FCP", "FCP Submitted": "True" }, "broadcom_approval"],
    [{ "VSA Approval Stage": "2 FCP", "FCP Submitted": "True", "BC Segment": "Commercial" }, "customer_approval"],
    [{ "VSA Approval Stage": "2 FCP", "FCP Broadcom Acceptance Date": "9/1/2026" }, "customer_approval"],
    [{ "VSA Approval Stage": "2 FCP", "FCP Customer Acceptance Date": "9/2/2026" }, "ra_staffing"],
    [{ "VSA Approval Stage": "3 In Delivery", "Resource Assignments": "2 Waiting RA From Broadcom" }, "ra_staffing"],
    [{ "VSA Approval Stage": "3 In Delivery", "PO Received": "9/3/2026" }, "kickoff"],
    [{ "VSA Approval Stage": "3 In Delivery", "Resource Assignments": "7 Project In Flight", "PO Received": "9/3/2026" }, "in_delivery"],
    [{ "VSA Approval Stage": "3 In Delivery", "Resource Assignments": "8 Delivery Complete" }, "complete"],
    [{ "VSA Approval Stage": "3 In Delivery", "Resource Assignments": "9 Delivery Cancelled/Lost" }, "lost"],
    [{ "VSA Approval Stage": "4 Customer Refused" }, "refused"],
    [{ "VSA Approval Stage": "6 Customer Paused" }, "paused"],
    [{ "VSA Approval Stage": "7 Lost" }, "lost"],
  ] as [Row, string][])("%o -> %s", (row, stage) => {
    expect(stageOf(row).stage).toBe(stage);
  });

  it("derives the stage for \"Update From Sales Pending\" from its dates and marks it waiting on sales", () => {
    expect(stageOf({ "VSA Approval Stage": "5 Update From Sales Pending", "FCP Draft Created Date": "8/1/2026" })).toMatchObject({ stage: "fcp_draft", fields: { waitingOn: "sales" } });
  });

  it("dates the stage from its gate date, else from Modified", () => {
    expect(stageOf({ "VSA Approval Stage": "3 In Delivery", "PO Received": "9/3/2026" }).stageEffectiveOn).toBe("2026-09-03");
    expect(stageOf({ "VSA Approval Stage": "1 Customer Discovery & Scoping" }).stageEffectiveOn).toBe("2026-10-01");
  });

  it("flags a delivery stage without a PO date", () => {
    expect(stageOf({ "VSA Approval Stage": "3 In Delivery", "Resource Assignments": "7 Project In Flight" }).flags).toContainEqual("In Delivery without a PO received date");
  });
});

describe("merge rule", () => {
  it("takes SharePoint edits, keeps app edits, and reports two-sided edits", () => {
    expect(mergeField("a", "a", "b")).toBe("take");
    expect(mergeField("a", "x", "a")).toBe("keep");
    expect(mergeField("a", "x", "b")).toBe("conflict");
    expect(mergeField("a", "b", "b")).toBe("keep");
  });

  it("without an earlier import, fills empty fields and reports differences", () => {
    expect(mergeField(undefined, null, "b")).toBe("take");
    expect(mergeField(undefined, "x", "b")).toBe("conflict");
    expect(mergeField(undefined, "x", null)).toBe("keep");
  });
});

describe("import plan", () => {
  it("creates new records, and importing the same file again changes nothing", () => {
    const file = csv([base(), base({ ID: "102", "Customer Name": "Second Co", "Deal ID or Name": "C-OPP-1000002", "New CDW Account %23": "10000002", "SER Number": "SER100002", PM: "Pat Lee" })]);
    const first = planImport(file, [], TODAY);
    expect(first.summary).toMatchObject({ rows: 2, created: 2, updated: 0, skipped: 0 });
    const state = applyPlan([], first);
    const second = planImport(file, state, TODAY);
    expect(second.summary).toMatchObject({ created: 0, updated: 0, unchanged: 2, conflicts: 0 });
    expect(second.updates.every(update => !Object.keys(update.fields).length && !update.stageChange && !Object.keys(update.assignments).length)).toBe(true);
  });

  it("takes SharePoint edits, keeps app edits, and reports a field edited on both sides", () => {
    const state = applyPlan([], planImport(csv([base()]), [], TODAY));
    state[0].health = "red"; // edited in the app
    state[0].nextSteps = "App note"; // edited in the app
    const plan = planImport(csv([base({ "Customer State": "TX", "Next Steps": "SharePoint note" })]), state, TODAY);
    expect(plan.rows[0].changes).toEqual([{ field: "customerState", from: null, to: "TX" }]);
    expect(plan.rows[0].conflicts).toEqual([{ field: "nextSteps", app: "App note", sharepoint: "SharePoint note" }]);
    expect(plan.updates[0].fields).toEqual({ customerState: "TX" });
  });

  it("moves the stage when SharePoint moves it, dated no earlier than the current stage", () => {
    const state = applyPlan([], planImport(csv([base()]), [], TODAY));
    const plan = planImport(csv([base({ "VSA Approval Stage": "2 FCP", "FCP Draft Created Date": "1/5/2026" })]), state, TODAY);
    expect(plan.updates[0].stageChange).toEqual({ from: "discovery", to: "fcp_draft", effectiveOn: "2026-10-01" });
  });

  it("keeps a stage someone moved in the app when SharePoint has not changed it", () => {
    const state = applyPlan([], planImport(csv([base()]), [], TODAY));
    state[0].stage = "source_chain";
    expect(planImport(csv([base()]), state, TODAY).updates[0].stageChange).toBeUndefined();
  });

  it("treats one account with different opportunity numbers as separate engagements", () => {
    const plan = planImport(csv([base(), base({ ID: "102", "Deal ID or Name": "C-OPP-1000002" })]), [], TODAY);
    expect(plan.summary.created).toBe(2);
  });

  it("skips a second row with the same account and opportunity number", () => {
    const plan = planImport(csv([base(), base({ ID: "" })], HEADERS), [], TODAY);
    expect(plan.rows[1]).toMatchObject({ action: "skip", skipReason: expect.stringMatching(/same account and opportunity number/) });
  });

  it("does not match another SharePoint item by a fallback key", () => {
    const state = applyPlan([], planImport(csv([base()]), [], TODAY));
    const plan = planImport(csv([base({ ID: "999", "Deal ID or Name": "C-OPP-1000009" })]), state, TODAY);
    expect(plan.summary.created).toBe(1);
  });

  it("refuses a different SharePoint item that reuses an opportunity number", () => {
    const state = applyPlan([], planImport(csv([base()]), [], TODAY));
    const plan = planImport(csv([base({ ID: "999" })]), state, TODAY);
    expect(plan.rows[0]).toMatchObject({ action: "skip", skipReason: expect.stringMatching(/different SharePoint item/) });
  });

  it("matches on the account only when exactly one record fits and no opportunity disagrees", () => {
    const noIds = HEADERS.filter(header => header !== "ID");
    const state = applyPlan([], planImport(csv([base({ "Deal ID or Name": "", "SER Number": "" })], noIds), [], TODAY));
    expect(planImport(csv([base({ "Deal ID or Name": "", "SER Number": "" })], noIds), state, TODAY).rows[0]).toMatchObject({ action: "unchanged", matchedBy: "salesforceCustomerId" });
    expect(planImport(csv([base({ "SER Number": "" })], noIds), state, TODAY).rows[0]).toMatchObject({ matchedBy: "salesforceCustomerId" });
    const twoPlans = applyPlan(state, planImport(csv([base({ "Deal ID or Name": "C-OPP-1000003", "SER Number": "SER9" })], noIds), state, TODAY));
    expect(planImport(csv([base({ "Deal ID or Name": "C-OPP-1000004", "SER Number": "" })], noIds), twoPlans, TODAY).rows[0].action).toBe("create");
  });

  it("removes an assignment SharePoint cleared, unless the app changed it", () => {
    const state = applyPlan([], planImport(csv([base({ PM: "Pat Lee" })]), [], TODAY));
    expect(planImport(csv([base({ PM: "" })]), state, TODAY).updates[0].assignments).toEqual({ pm: null });
    state[0].assignments.pm = { displayName: "Jo Diaz", broadcomEmail: null };
    const plan = planImport(csv([base({ PM: "" })]), state, TODAY);
    expect(plan.updates[0].assignments).toEqual({});
    expect(plan.rows[0].conflicts).toContainEqual({ field: "assignment.pm", app: "Jo Diaz", sharepoint: null });
  });

  it("lists earlier imports missing from today's file and never deletes them", () => {
    const state = applyPlan([], planImport(csv([base(), base({ ID: "102", "Deal ID or Name": "C-OPP-1000002" })]), [], TODAY));
    const plan = planImport(csv([base()]), state, TODAY);
    expect(plan.missing).toEqual([{ id: 2, customerName: "Example Health", opportunityNumber: "C-OPP-1000002" }]);
  });

  it("never writes a unique value another record already holds", () => {
    const state = applyPlan([], planImport(csv([base(), base({ ID: "102", "Deal ID or Name": "C-OPP-1000002" })]), [], TODAY));
    state[1].importSnapshot = { ...state[1].importSnapshot, opportunityNumber: "C-OPP-1000002" };
    const plan = planImport(csv([base(), base({ ID: "102", "Deal ID or Name": "C-OPP-1000001" })]), state, TODAY);
    expect(plan.updates[1].fields).not.toHaveProperty("opportunityNumber");
    expect(plan.rows[1].flags).toContainEqual(expect.stringMatching(/already on another record/));
  });

  it("leaves existing FCPs that were never imported out of the missing list", () => {
    const fcpOnly = { id: 1, customerName: "FCP only", stage: "fcp_draft", stageEnteredOn: "2026-01-01", intakeSource: "manual", importSnapshot: null, assignments: {} } as ExistingRecord;
    expect(planImport(csv([base()]), [fcpOnly], TODAY).missing).toEqual([]);
  });
});
