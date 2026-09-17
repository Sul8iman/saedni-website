import { adminNotificationsTable, db } from "@workspace/db";
import { dispatchAdminEvent, type AdminEventNotification } from "./admin-event-notifications";
import { logger } from "./logger";
import { sendAdminEventPush } from "./push";

async function createAdminEventRecord(event: AdminEventNotification): Promise<number | null> {
  const [row] = await db
    .insert(adminNotificationsTable)
    .values({
      eventKey: event.eventKey,
      type: event.type,
      title: event.title,
      userId: event.userId,
      userName: event.userName,
      phone: event.phone,
      userType: event.userType,
      isRead: false,
    })
    .onConflictDoNothing({ target: adminNotificationsTable.eventKey })
    .returning({ id: adminNotificationsTable.id });

  return row?.id ?? null;
}

export function notifyAdminEvent(event: AdminEventNotification): Promise<number | null> {
  return dispatchAdminEvent(event, {
    create: createAdminEventRecord,
    push: sendAdminEventPush,
    onRecordError: (error, failedEvent) => {
      logger.error(
        { err: error, eventKey: failedEvent.eventKey, type: failedEvent.type },
        "admin event notification record creation failed",
      );
    },
    onPushError: (error, notificationId, failedEvent) => {
      logger.warn(
        { err: error, notificationId, eventKey: failedEvent.eventKey, type: failedEvent.type },
        "admin event notification push failed",
      );
    },
  });
}