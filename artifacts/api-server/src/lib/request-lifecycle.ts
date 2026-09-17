import { db, requestLifecycleEventsTable, type RequestLifecycleEvent } from "@workspace/db";
import type { RequestActor } from "./request-access";
import {
  sanitizeLifecycleMetadata,
  type LifecycleMetadata,
} from "./request-audit-safety";

export type RequestLifecycleAction =
  | "created"
  | "updated"
  | "accepted"
  | "status_changed"
  | "completed"
  | "help_result_changed"
  | "cancelled"
  | "soft_deleted"
  | "restored";

export function buildRequestLifecycleEventValues(input: {
  requestId: number;
  action: RequestLifecycleAction;
  actor: RequestActor | null;
  reason?: string | null;
  metadata?: LifecycleMetadata;
}) {
  const metadata = sanitizeLifecycleMetadata(input.metadata);

  return {
    requestId: input.requestId,
    action: input.action,
    actorUserId: input.actor?.id ?? null,
    actorRole: input.actor?.userType ?? null,
    reason: input.reason ?? null,
    metadata: metadata ? JSON.stringify(metadata) : null,
  };
}

export async function recordRequestLifecycleEvent(input: {
  requestId: number;
  action: RequestLifecycleAction;
  actor: RequestActor | null;
  reason?: string | null;
  metadata?: LifecycleMetadata;
}): Promise<void> {
  await db.insert(requestLifecycleEventsTable).values(buildRequestLifecycleEventValues(input));
}

export function presentRequestLifecycleEvent(event: RequestLifecycleEvent) {
  let metadata: LifecycleMetadata | null = null;
  if (event.metadata) {
    try {
      const parsed: unknown = JSON.parse(event.metadata);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        metadata = parsed as LifecycleMetadata;
      }
    } catch {
      metadata = null;
    }
  }

  return {
    id: event.id,
    requestId: event.requestId,
    action: event.action,
    actorUserId: event.actorUserId,
    actorRole: event.actorRole,
    reason: event.reason,
    metadata,
    createdAt: event.createdAt.toISOString(),
  };
}