/**
 * What an admin can change about a user. Pure. Today that is the permission flag (`role`), the default role view
 * (`vsaRole`, not a permission), and the workspace. The admin screen and the `admin.users.update` procedure both read
 * this list, so a later field (for example capabilities) is one more entry here plus its column.
 */
import { z } from "zod";
import { VSA_ROLES } from "./vsaFields";
import { ROLE_VIEW_LABELS } from "./vsaViews";

export const USER_ROLES = ["user", "admin"] as const;
export type UserRole = (typeof USER_ROLES)[number];
export const USER_ROLE_LABELS: Record<UserRole, string> = { user: "User", admin: "Admin" };

export const adminUserPatchSchema = z
  .object({
    role: z.enum(USER_ROLES).optional(),
    vsaRole: z.enum(VSA_ROLES).nullable().optional(),
    workspaceId: z.number().int().positive().optional(),
  })
  .strict()
  .refine(patch => Object.keys(patch).length > 0, "Nothing to change");
export type AdminUserPatchInput = z.infer<typeof adminUserPatchSchema>;
export type AdminUserField = keyof AdminUserPatchInput;

/** The editable columns, in screen order. `options` lists the choices; workspace choices come from the server. */
export const ADMIN_USER_FIELDS: { key: AdminUserField; label: string; hint: string; options?: { value: string; label: string }[] }[] = [
  { key: "role", label: "Role", hint: "Permission. Admins can open Admin, delete any record, and edit any saved report.", options: USER_ROLES.map(value => ({ value, label: USER_ROLE_LABELS[value] })) },
  { key: "vsaRole", label: "Role view", hint: "Default queue in My Queue. Not a permission.", options: VSA_ROLES.map(value => ({ value, label: ROLE_VIEW_LABELS[value] })) },
  { key: "workspaceId", label: "Workspace", hint: "Records are visible to everyone in the same workspace." },
];
