export type EngagementListItem = { id: number };

/**
 * Keeps a current selection when it is still available to the authenticated
 * owner. After a list refresh, a stale or deleted selection falls back to the
 * first available record; an empty list intentionally produces no selection.
 * While the list has not resolved, the current selection is preserved so the
 * workspace does not discard it during the initial request.
 */
export function reconcileSelectedEngagementId<T extends EngagementListItem>(
  selectedId: number | null,
  engagements: readonly T[] | undefined,
): number | null {
  if (!engagements) return selectedId;
  if (selectedId !== null && engagements.some(engagement => engagement.id === selectedId)) {
    return selectedId;
  }
  return engagements[0]?.id ?? null;
}

export function engagementExists<T extends EngagementListItem>(
  selectedId: number | null,
  engagements: readonly T[] | undefined,
): selectedId is number {
  return selectedId !== null && Boolean(engagements?.some(engagement => engagement.id === selectedId));
}

/**
 * A list result can be retained briefly while it is being refreshed. Do not
 * fetch a selected record during that interval: its cached ID may have been
 * deleted or may belong to a prior owner-scoped list. Once the list settles,
 * only IDs present in that current list are eligible for a record query.
 */
export function shouldQuerySelectedEngagement<T extends EngagementListItem>(
  selectedId: number | null,
  engagements: readonly T[] | undefined,
  isListFetching: boolean,
): selectedId is number {
  return !isListFetching && engagementExists(selectedId, engagements);
}

/** Reads the `?engagement=<id>` deep link. Anything but a positive integer is ignored. */
export function engagementIdFromSearch(search: string): number | null {
  const value = new URLSearchParams(search).get("engagement");
  return value && /^[1-9]\d*$/.test(value) ? Number(value) : null;
}
