/** Routes into the FCP workspace (pages/FcpWorkspace.tsx). Pure, so old links can be tested. */

export const WORKSPACE_SECTION_IDS = ["sources", "engagement", "funding", "estate", "scope", "plan", "narrative", "review"] as const;
export type WorkspaceSection = (typeof WORKSPACE_SECTION_IDS)[number];

/** The six-step page's ?stage= values, mapped to the section that now holds that work. */
export const STAGE_TO_SECTION: Record<string, WorkspaceSection> = { engagement: "engagement", plan: "scope", staffing: "plan", technical: "estate", report: "narrative", package: "review" };

/** The section a workspace URL asks for: ?section=, else an old ?stage=, else Sources. */
export function sectionFromSearch(search: string): WorkspaceSection {
  const params = new URLSearchParams(search);
  const requested = params.get("section") ?? "";
  if ((WORKSPACE_SECTION_IDS as readonly string[]).includes(requested)) return requested as WorkspaceSection;
  return STAGE_TO_SECTION[params.get("stage") ?? ""] ?? "sources";
}

/** Where an old `/fcp?engagement=<id>&stage=<step>` link goes now, or null when it names no engagement. */
export function workspaceUrlFor(search: string): string | null {
  const params = new URLSearchParams(search);
  const id = Number(params.get("engagement"));
  if (!Number.isInteger(id) || id <= 0) return null;
  const section = STAGE_TO_SECTION[params.get("stage") ?? ""];
  return `/engagements/${id}/fcp${section ? `?section=${section}` : ""}`;
}
