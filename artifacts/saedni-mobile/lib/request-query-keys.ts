export const REQUEST_LIST_PAGE_SIZE = 100;

export const requestQueryKeys = {
  customer: (userId: number, role: string) =>
    ["my-requests", userId, role, "all", "all", "all", 1, REQUEST_LIST_PAGE_SIZE] as const,
  helperAvailable: (
    userId: number,
    role: string,
    area: string,
    category: string,
  ) =>
    ["available-requests", userId, role, "available", area, category, 1, REQUEST_LIST_PAGE_SIZE] as const,
  helperAssigned: (userId: number, role: string) =>
    ["helper-my-requests", userId, role, "assigned", "all", "all", 1, REQUEST_LIST_PAGE_SIZE] as const,
  contactedHelpers: (viewerId: number, requestId: number) =>
    ["contacted-helpers", viewerId, requestId] as const,
};

const REQUEST_QUERY_PREFIXES = new Set([
  "my-requests",
  "helper-my-requests",
  "available-requests",
  "contacted-helpers",
]);

export function isRequestQueryKey(queryKey: readonly unknown[]): boolean {
  return typeof queryKey[0] === "string" && REQUEST_QUERY_PREFIXES.has(queryKey[0]);
}

export function mergeRequestsById<T extends { id: number; createdAt?: string }>(
  ...lists: Array<readonly T[] | undefined>
): T[] {
  const byId = new Map<number, T>();
  for (const list of lists) {
    for (const request of list ?? []) {
      byId.set(request.id, request);
    }
  }
  return Array.from(byId.values()).sort((a, b) => {
    const createdAtDifference =
      new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime();
    return createdAtDifference || b.id - a.id;
  });
}