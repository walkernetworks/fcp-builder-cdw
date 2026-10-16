/**
 * One name, three places: the engagement's customer name (board, drawer, import), the FCP document's customer name
 * (`data.fields.customerName`), and the engagement title shown in the FCP workspace. A rename made in any of them
 * reaches the others, and a stale FCP copy never reverts a rename made elsewhere.
 */

/** A title follows a rename: an exact match becomes the new name, and the old name inside a longer title is replaced. */
export function renameInTitle(title: string, oldName: string, newName: string): string {
  const from = oldName.trim();
  if (!from || from === newName) return title;
  if (title.trim() === from) return newName;
  return title.includes(from) ? title.split(from).join(newName) : title;
}

export type FcpSaveNames = {
  /** Name and title in the document being saved. */
  incomingName: string;
  incomingTitle: string;
  /** What the FCP workspace loaded or last saved. Absent from older clients. */
  baseName?: string | null;
  baseTitle?: string | null;
  /** What is stored now. */
  storedDocName: string | null;
  storedTitle: string;
  column: string;
};

/**
 * Decides the customer name, the FCP document's name, and the title an FCP save writes.
 * - A name edited in the FCP renames everything.
 * - A title edited in the FCP renames the customer too when the title was the customer name.
 * - Otherwise the stored name wins (a stale copy cannot revert it), and the title follows any rename.
 */
export function resolveFcpSaveNames(input: FcpSaveNames): { column: string; docName: string; title: string } {
  const incomingName = input.incomingName.trim();
  const incomingTitle = input.incomingTitle.trim();
  const refName = (input.baseName ?? input.storedDocName ?? "").trim();
  const refTitle = (input.baseTitle ?? input.storedTitle).trim();
  const nameEdited = incomingName !== "" && incomingName !== refName;
  const titleEdited = incomingTitle !== "" && incomingTitle !== refTitle;

  let name = input.column;
  if (nameEdited) name = incomingName;
  else if (titleEdited && refTitle === refName) name = incomingTitle;

  const title = titleEdited ? incomingTitle : renameInTitle(input.storedTitle, input.column, name);
  return { column: name, docName: name, title };
}
