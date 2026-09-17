export type LifecycleMetadata = Record<string, boolean | number | string | null>;

const allowedMetadataKeys = new Set(["status", "fromStatus", "toStatus", "helpCompleted"]);

export function sanitizeLifecycleMetadata(
  metadata: LifecycleMetadata | undefined,
): LifecycleMetadata | undefined {
  if (!metadata) return undefined;

  return Object.fromEntries(
    Object.entries(metadata).filter(([key, value]) =>
      allowedMetadataKeys.has(key) &&
      (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null),
    ),
  );
}