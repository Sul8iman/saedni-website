import { Router, type IRouter } from "express";
import { eq, count, desc, and } from "drizzle-orm";
import { createHmac } from "crypto";
import { db, usersTable, requestsTable, adminNotificationsTable } from "@workspace/db";
import { VerifyHelperParams, VerifyHelperBody, DeleteUserParams } from "@workspace/api-zod";
import { sendAdminOtpPush } from "../lib/push";
import { logger } from "../lib/logger";

const router: IRouter = Router();

function generate6DigitCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function hashHelperCode(code: string): string {
  const secret = process.env.SESSION_SECRET ?? "dev-secret-change-me";
  return createHmac("sha256", secret).update(code).digest("hex");
}

function safeUser(user: typeof usersTable.$inferSelect) {
  const {
    passwordHash: _,
    helperActivationCodeHash: __,   // never expose hash
    ...safe
  } = user;
  return {
    ...safe,
    isActive: !safe.isBlocked,
    createdAt: safe.createdAt.toISOString(),
    lastLogin: safe.lastLogin?.toISOString() ?? null,
    otpCreatedAt: safe.otpCreatedAt?.toISOString() ?? null,
    helperActivationCodeCreatedAt: safe.helperActivationCodeCreatedAt?.toISOString() ?? null,
    helperActivationCodeUsedAt: safe.helperActivationCodeUsedAt?.toISOString() ?? null,
  };
}

function safeNotification(n: typeof adminNotificationsTable.$inferSelect) {
  return {
    ...n,
    createdAt: n.createdAt.toISOString(),
  };
}

// GET /admin/stats
router.get("/admin/stats", async (_req, res): Promise<void> => {
  const [totalUsersResult] = await db.select({ count: count() }).from(usersTable);
  const [totalHelpersResult] = await db
    .select({ count: count() })
    .from(usersTable)
    .where(eq(usersTable.userType, "helper"));
  const [totalCustomersResult] = await db
    .select({ count: count() })
    .from(usersTable)
    .where(eq(usersTable.userType, "customer"));
  const [totalRequestsResult] = await db.select({ count: count() }).from(requestsTable);
  const [activeRequestsResult] = await db
    .select({ count: count() })
    .from(requestsTable)
    .where(eq(requestsTable.status, "available"));
  const [completedRequestsResult] = await db
    .select({ count: count() })
    .from(requestsTable)
    .where(eq(requestsTable.status, "completed"));
  const [cancelledRequestsResult] = await db
    .select({ count: count() })
    .from(requestsTable)
    .where(eq(requestsTable.status, "cancelled"));

  // Feedback stats
  const [helpCompletedResult] = await db
    .select({ count: count() })
    .from(requestsTable)
    .where(and(eq(requestsTable.status, "completed"), eq(requestsTable.helpCompleted, true)));
  const [helpNotCompletedResult] = await db
    .select({ count: count() })
    .from(requestsTable)
    .where(and(eq(requestsTable.status, "completed"), eq(requestsTable.helpCompleted, false)));

  const helpYes = helpCompletedResult.count;
  const helpNo  = helpNotCompletedResult.count;
  const successRate = (helpYes + helpNo) > 0
    ? Math.round((helpYes / (helpYes + helpNo)) * 100)
    : 0;

  res.json({
    totalUsers: totalUsersResult.count,
    totalHelpers: totalHelpersResult.count,
    totalCustomers: totalCustomersResult.count,
    totalRequests: totalRequestsResult.count,
    activeRequests: activeRequestsResult.count,
    completedRequests: completedRequestsResult.count,
    cancelledRequests: cancelledRequestsResult.count,
    helpCompleted: helpYes,
    helpNotCompleted: helpNo,
    successRate,
  });
});

// PATCH /admin/helpers/:id/verify
router.patch("/admin/helpers/:id/verify", async (req, res): Promise<void> => {
  const params = VerifyHelperParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = VerifyHelperBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updates =
    parsed.data.action === "verify"
      ? { isVerified: true, isBlocked: false }
      : {
          isBlocked: true,
          isVerified: false,
          // Disable any active code when the account is blocked
          helperActivationCodeActive: false,
        };

  const [user] = await db
    .update(usersTable)
    .set(updates)
    .where(eq(usersTable.id, params.data.id))
    .returning();

  if (!user) {
    res.status(404).json({ error: "المستخدم غير موجود" });
    return;
  }

  res.json(safeUser(user));
});

// POST /admin/helpers/:id/regenerate-code
// Generates a new non-expiring activation code for an unverified helper.
// The plain code is sent to the admin via push notification only — never in the response.
router.post("/admin/helpers/:id/regenerate-code", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "معرف غير صالح" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  if (!user) {
    res.status(404).json({ error: "المستخدم غير موجود" });
    return;
  }

  if (user.userType !== "helper" && user.userType !== "customer") {
    res.status(400).json({ error: "هذا الإجراء مخصص للمساعدين فقط" });
    return;
  }

  if (user.isBlocked) {
    res.status(400).json({ error: "لا يمكن إنشاء رمز لحساب محظور" });
    return;
  }

  const code = generate6DigitCode();

  const [updated] = await db
    .update(usersTable)
    .set({
      helperActivationCodeHash: hashHelperCode(code),
      helperActivationCodeCreatedAt: new Date(),
      helperActivationCodeUsedAt: null,
      helperActivationCodeActive: true,
    })
    .where(eq(usersTable.id, id))
    .returning();

  if (!updated) {
    res.status(500).json({ error: "فشل إنشاء الرمز" });
    return;
  }

  logger.info({ userId: id }, "admin: helper activation code regenerated");

  // Notify admin via push (plain code in notification body — never in logs)
  try {
    const [notifRow] = await db.insert(adminNotificationsTable).values({
      type: "otp_request",
      title: "تم إنشاء رمز تفعيل جديد للمساعد",
      userId: id,
      userName: user.name,
      phone: user.phone,
      userType: user.userType,
      isRead: false,
    }).returning({ id: adminNotificationsTable.id });

    if (notifRow?.id != null) {
      void sendAdminOtpPush(notifRow.id, id, user.phone, new Date().toISOString(), code);
    }
  } catch (err) {
    logger.error({ err }, "admin: failed to create regenerate-code notification");
    // Non-fatal — code was saved, continue
  }

  // Return the plain code exactly once in this authenticated admin response.
  // It is never stored in plaintext, never logged, and never returned by any GET endpoint.
  res.json({
    message: "تم إنشاء رمز تفعيل جديد وإلغاء الرمز السابق.",
    activationCode: code,
  });
});

// DELETE /admin/users/:id/delete
router.delete("/admin/users/:id/delete", async (req, res): Promise<void> => {
  const params = DeleteUserParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const currentUserId = (req as any).session?.userId;
  if (currentUserId === params.data.id) {
    res.status(403).json({ error: "لا يمكنك حذف حساب المدير" });
    return;
  }

  await db.delete(requestsTable).where(eq(requestsTable.customerId, params.data.id));

  const [user] = await db
    .delete(usersTable)
    .where(eq(usersTable.id, params.data.id))
    .returning();

  if (!user) {
    res.status(404).json({ error: "المستخدم غير موجود" });
    return;
  }

  res.sendStatus(204);
});

// GET /admin/notifications
router.get("/admin/notifications", async (_req, res): Promise<void> => {
  const notifications = await db
    .select()
    .from(adminNotificationsTable)
    .orderBy(desc(adminNotificationsTable.createdAt));

  res.json(notifications.map(safeNotification));
});

// PATCH /admin/notifications/:id/read
router.patch("/admin/notifications/:id/read", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "معرف غير صالح" });
    return;
  }

  const [notification] = await db
    .update(adminNotificationsTable)
    .set({ isRead: true })
    .where(eq(adminNotificationsTable.id, id))
    .returning();

  if (!notification) {
    res.status(404).json({ error: "الإشعار غير موجود" });
    return;
  }

  res.json(safeNotification(notification));
});

export default router;
