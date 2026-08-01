import { logger } from "./logger";
import { db, usersTable } from "@workspace/db";
import { eq, isNotNull, and } from "drizzle-orm";

interface PushMessage {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: string;
}

async function batchSendPush(
  tokens: string[],
  message: PushMessage,
  logCtx: Record<string, unknown>,
): Promise<void> {
  if (tokens.length === 0) {
    logger.info({ ...logCtx, uniqueTokens: 0 }, "push: no tokens to send");
    return;
  }
  const payload = tokens.map((to) => ({
    to,
    title: message.title,
    body: message.body,
    data: message.data ?? {},
    sound: message.sound ?? "default",
  }));
  for (let i = 0; i < payload.length; i += 100) {
    const batch = payload.slice(i, i + 100);
    try {
      const res = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "Accept-Encoding": "gzip, deflate",
        },
        body: JSON.stringify(batch),
      });
      const json: unknown = await res.json().catch(() => null);
      logger.info(
        { ...logCtx, batchStart: i, batchSize: batch.length, status: res.status, response: json },
        "push: expo batch sent",
      );
    } catch (err) {
      logger.warn({ ...logCtx, batchStart: i, err }, "push: expo batch error");
    }
  }
}

// ── Admin OTP push ──────────────────────────────────────────────────────────

const notifiedOtpIds = new Set<number>();

export async function sendAdminOtpPush(
  notificationId: number,
  userId: number | null | undefined,
  phone: string,
  requestTime: string,
  activationCode?: string,
): Promise<void> {
  if (notifiedOtpIds.has(notificationId)) {
    logger.warn({ notificationId }, "push: admin OTP duplicate suppressed (idempotency)");
    return;
  }
  notifiedOtpIds.add(notificationId);

  try {
    const rows = await db
      .select({
        id: usersTable.id,
        userType: usersTable.userType,
        roles: usersTable.roles,
        expoPushToken: usersTable.expoPushToken,
      })
      .from(usersTable)
      .where(and(eq(usersTable.isBlocked, false), isNotNull(usersTable.expoPushToken)));

    const seenTokens = new Set<string>();
    let adminCount = 0;

    for (const u of rows) {
      let roles: string[];
      try {
        roles = u.roles ? (JSON.parse(u.roles) as string[]) : [u.userType];
      } catch {
        roles = [u.userType];
      }
      if (!roles.includes("admin") && u.userType !== "admin") continue;
      adminCount++;
      if (u.expoPushToken) seenTokens.add(u.expoPushToken);
    }

    const uniqueTokens = [...seenTokens];
    logger.info(
      { notificationId, adminCount, uniqueTokens: uniqueTokens.length },
      "push: admin OTP dispatch started",
    );

    const body = activationCode
      ? `رمز تفعيل المساعد: ${activationCode}\nاضغط لعرض بيانات المستخدم.`
      : "قام مستخدم بطلب رمز تحقق جديد.\nاضغط لعرض بيانات المستخدم.";

    await batchSendPush(
      uniqueTokens,
      {
        title: "طلب رمز تحقق جديد",
        body,
        data: {
          notificationType: "otp_request",
          notificationId,
          userId: userId ?? null,
          phone,
          requestTime,
        },
        sound: "default",
      },
      { notificationId },
    );

    logger.info(
      { notificationId, adminCount, uniqueTokens: uniqueTokens.length },
      "push: admin OTP dispatch complete",
    );
  } catch (err) {
    logger.warn({ notificationId, err }, "push: admin OTP dispatch failed");
  }
}
