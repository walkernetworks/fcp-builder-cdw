/**
 * The one place that knows who can see and change an engagement. Every engagement query in db.ts composes
 * `visibleEngagements(viewer)`; tables that hang off engagements are reached only through a visible engagement.
 * docs/VSA-TRACKER-DATA-MODEL.md section 8.
 */
import { and, eq, type SQL } from "drizzle-orm";
import { engagements, type Engagement, type User } from "../drizzle/schema";

export type Viewer = Pick<User, "id" | "workspaceId" | "role">;

export function viewerFor(user: User): Viewer {
  return { id: user.id, workspaceId: user.workspaceId, role: user.role };
}

/** Records are visible to every user in the same workspace. `ownerId` is attribution, not visibility. */
export function visibleEngagements(viewer: Viewer): SQL {
  return eq(engagements.workspaceId, viewer.workspaceId);
}

/** Delete is limited to the record's owner or an admin, within the workspace. */
export function deletableEngagements(viewer: Viewer): SQL {
  const visible = visibleEngagements(viewer);
  return viewer.role === "admin" ? visible : (and(visible, eq(engagements.ownerId, viewer.id)) as SQL);
}

export function canEditEngagement(viewer: Viewer, row: Pick<Engagement, "workspaceId">) {
  return row.workspaceId === viewer.workspaceId;
}

export function canDeleteEngagement(viewer: Viewer, row: Pick<Engagement, "workspaceId" | "ownerId">) {
  return canEditEngagement(viewer, row) && (viewer.role === "admin" || row.ownerId === viewer.id);
}
