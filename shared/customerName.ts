/**
 * The customer name lives in two places: the engagement column (tracker, board, import) and the FCP document
 * (`data.fields.customerName`). This decides what an FCP save writes to both, so a stale FCP copy never overwrites a
 * name changed in the tracker or by the SharePoint import.
 *
 * - `incoming`: the name in the document being saved.
 * - `base`: the name the FCP workspace loaded (or last saved). When it equals `incoming`, the name was not edited in
 *   the FCP, so the column wins and the document is brought in line with it.
 * - `storedDocName`: the name currently in the stored document, used when an older client sends no `base`.
 * - `column`: the current engagement column value.
 */
export function resolveCustomerNameOnFcpSave(input: { incoming: string; base?: string | null; storedDocName: string | null; column: string }): { column: string; docName: string } {
  const incoming = input.incoming.trim();
  const reference = input.base !== undefined && input.base !== null ? input.base.trim() : (input.storedDocName ?? "").trim();
  const editedInFcp = incoming !== "" && incoming !== reference;
  if (editedInFcp) return { column: incoming, docName: incoming };
  return { column: input.column, docName: input.column };
}
