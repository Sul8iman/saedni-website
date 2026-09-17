import { Router, type IRouter } from "express";
import { and, eq, isNull, lt, or } from "drizzle-orm";
import { createHmac, randomUUID } from "crypto";
import { db, usersTable, adminNotificationsTable } from "@workspace/db";
import { RegisterBody, LoginBody, VerifyOtpBody, AdminLoginBody } from "@workspace/api-zod";
import { logger } from "../lib/logger";
import { sendHelperWelcomeTemplate, sendWhatsAppOtp } from "../lib/whatsapp";
import { buildNewUserAdminEvent } from "../lib/admin-event-notifications";
import { notifyAdminEvent } from "../lib/admin-event-store";
import { isActiveServiceArea, validatePreferredAreas } from "../lib/service-areas";
import { isUserBlocked } from "../lib/auth-security";

const router: IRouter = Router();

const OTP_EXPIRY_MS = 10 * 60 * 1000;
const HELPER_RECOVERY_MAX_ATTEMPTS = 5;
const HELPER_RECOVERY_LOCKOUT_MS = 15 * 60 * 1000;
const HELPER_WELCOME_LEASE_MS = 2 * 60 * 1000;

const ADMIN_PHONE = process.env.ADMIN_PHONE ?? "98584898";
const ADMIN_PIN   = process.env.ADMIN_PIN   ?? "2724";

// ── Helpers ──────────────────────────────────────────────────────────────────

function generate6DigitCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function maskPhone(phone: string): string {
  if (phone.length <= 6) return "***";
  return phone.slice(0, 3) + "****" + phone.slice(-3);
}

function parseRoles(rolesJson: string | null, userType: string): string[] {
  if (rolesJson) {
    try { return JSON.parse(rolesJson); } catch {}
  }
  return [userType];
}

function hashHelperRecoveryCode(code: string): string {
  const secret = process.env.SESSION_SECRET ?? "dev-secret-change-me";
  return createHmac("sha256", secret).update(code).digest("hex");
}

interface RecoveryRateLimitEntry {
  attempts: number;
  lockedUntil: number | null;
}

const helperRecoveryAttempts = new Map<number, RecoveryRateLimitEntry>();

function canVerifyRecoveryCode(userId: number): { allowed: boolean; retryAfterMs?: number } {
  const now = Date.now();
  const entry = helperRecoveryAttempts.get(userId) ?? { attempts: 0, lockedUntil: null };

  if (entry.lockedUntil !== null && now < entry.lockedUntil) {
    return { allowed: false, retryAfterMs: entry.lockedUntil - now };
  }
  if (entry.lockedUntil !== null) {
    helperRecoveryAttempts.delete(userId);
  }
  return { allowed: true };
}

function recordRecoveryCodeFailure(userId: number): void {
  const entry = helperRecoveryAttempts.get(userId) ?? { attempts: 0, lockedUntil: null };
  const attempts = entry.attempts + 1;
  helperRecoveryAttempts.set(userId, {
    attempts,
    lockedUntil: attempts >= HELPER_RECOVERY_MAX_ATTEMPTS ? Date.now() + HELPER_RECOVERY_LOCKOUT_MS : null,
  });
}

function clearRecoveryCodeFailures(userId: number): void {
  helperRecoveryAttempts.delete(userId);
}

// ── safeUser ──────────────────────────────────────────────────────────────────

function safeUser(user: typeof usersTable.$inferSelect) {
  const {
    passwordHash: _,
    authToken: __,
    helperActivationCodeHash: ___,   // never expose hash
    helperWelcomeMessageLeaseId: ____,
    helperWelcomeMessageLeaseExpiresAt: _____,
    ...safe
  } = user;
  return {
    ...safe,
    roles: parseRoles(safe.roles, safe.userType),
    isActive: !safe.isBlocked,
    createdAt: safe.createdAt.toISOString(),
    lastLogin: safe.lastLogin?.toISOString() ?? null,
    otpCreatedAt: safe.otpCreatedAt?.toISOString() ?? null,
    helperActivationCodeCreatedAt: safe.helperActivationCodeCreatedAt?.toISOString() ?? null,
    helperActivationCodeUsedAt: safe.helperActivationCodeUsedAt?.toISOString() ?? null,
    helperWelcomeMessageSentAt: safe.helperWelcomeMessageSentAt?.toISOString() ?? null,
  };
}

async function createWhatsAppFailureNotification(opts: {
  userId?: number;
  userName?: string;
  phone: string;
  userType?: string;
  error?: string;
}): Promise<void> {
  try {
    await db.insert(adminNotificationsTable).values({
      type: "otp_request",
      title: "فشل إرسال رمز التحقق عبر واتساب",
      userId: opts.userId ?? null,
      userName: opts.userName ?? null,
      phone: opts.phone,
      userType: opts.userType ?? null,
      isRead: false,
    });
    logger.info(
      { maskedPhone: maskPhone(opts.phone), userType: opts.userType },
      "whatsapp: failure notification created for admin",
    );
  } catch (err) {
    logger.error({ err }, "Failed to create WhatsApp failure notification");
  }
}

function isHelperAccount(user: typeof usersTable.$inferSelect): boolean {
  return user.userType === "helper" || parseRoles(user.roles, user.userType).includes("helper");
}

function activateHelperWithRecoveryCode(
  user: typeof usersTable.$inferSelect,
  otp: string,
): { ok: true } | { ok: false; error: string; status?: number } {
  if (!isHelperAccount(user) || user.isVerified || !user.helperActivationCodeActive || !user.helperActivationCodeHash) {
    return { ok: false, error: "رمز التحقق غير صحيح" };
  }

  const rateCheck = canVerifyRecoveryCode(user.id);
  if (!rateCheck.allowed) {
    const minutes = Math.ceil((rateCheck.retryAfterMs ?? HELPER_RECOVERY_LOCKOUT_MS) / 60_000);
    return {
      ok: false,
      status: 429,
      error: `تجاوزت الحد المسموح من المحاولات. حاول مجدداً بعد ${minutes} دقيقة`,
    };
  }

  if (hashHelperRecoveryCode(otp) !== user.helperActivationCodeHash) {
    recordRecoveryCodeFailure(user.id);
    return { ok: false, error: "رمز التحقق غير صحيح" };
  }

  clearRecoveryCodeFailures(user.id);
  return { ok: true };
}

function sendHelperWelcomeOnce(userId: number, phone: string): void {
  void (async () => {
    const leaseId = randomUUID();
    const now = new Date();
    const leaseExpiresAt = new Date(now.getTime() + HELPER_WELCOME_LEASE_MS);
    const [claimed] = await db
      .update(usersTable)
      .set({
        helperWelcomeMessageLeaseId: leaseId,
        helperWelcomeMessageLeaseExpiresAt: leaseExpiresAt,
      })
      .where(and(
        eq(usersTable.id, userId),
        isNull(usersTable.helperWelcomeMessageSentAt),
        or(
          isNull(usersTable.helperWelcomeMessageLeaseExpiresAt),
          lt(usersTable.helperWelcomeMessageLeaseExpiresAt, now),
        ),
      ))
      .returning({ phone: usersTable.phone });

    if (!claimed) return;

    const result = await sendHelperWelcomeTemplate(claimed.phone || phone);
    if (!result.success) {
      await db
        .update(usersTable)
        .set({
          helperWelcomeMessageLeaseId: null,
          helperWelcomeMessageLeaseExpiresAt: null,
        })
        .where(and(eq(usersTable.id, userId), eq(usersTable.helperWelcomeMessageLeaseId, leaseId)));
      reqSafeLogWelcomeFailure(userId, result.error);
      return;
    }

    await db
      .update(usersTable)
      .set({
        helperWelcomeMessageSentAt: new Date(),
        helperWelcomeMessageLeaseId: null,
        helperWelcomeMessageLeaseExpiresAt: null,
      })
      .where(and(
        eq(usersTable.id, userId),
        eq(usersTable.helperWelcomeMessageLeaseId, leaseId),
        isNull(usersTable.helperWelcomeMessageSentAt),
      ));
  })().catch(() => {
      logger.warn({ userId }, "helper welcome message background task failed");
    });
}

function reqSafeLogWelcomeFailure(userId: number, error?: string): void {
  logger.warn(
    { userId, providerError: error === "Network error" ? error : "template request failed" },
    "helper welcome message was not delivered; helper remains active",
  );
}

// ── Routes ───────────────────────────────────────────────────────────────────

// POST /auth/register
router.post("/auth/register", async (req, res): Promise<void> => {
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { name, phone, userType, area, preferredAreas } = parsed.data;

  if (userType === "customer" && area !== undefined && area !== null && !isActiveServiceArea(area)) {
    res.status(400).json({ error: "المنطقة غير متاحة للاختيار الجديد" });
    return;
  }
  if (userType === "helper") {
    const areas = validatePreferredAreas(preferredAreas);
    if (!areas) {
      res.status(400).json({ error: "اختر منطقة خدمة واحدة على الأقل من مناطق مسقط" });
      return;
    }
  }

  const [existing] = await db.select().from(usersTable).where(eq(usersTable.phone, phone));

  if (existing) {
    const existingRoles = parseRoles(existing.roles, existing.userType);
    if (existingRoles.includes(userType)) {
      res.status(400).json({ error: "رقم الهاتف مسجل مسبقاً بهذا النوع" });
      return;
    }

    const updatedRoles = [...existingRoles, userType];

    // Adding either customer or helper access uses the same WhatsApp OTP flow.
    const otp = generate6DigitCode();
    await db.update(usersTable)
      .set({
        roles: JSON.stringify(updatedRoles),
        ...(userType === "customer" ? { area: area ?? null } : {}),
        ...(userType === "helper" ? { preferredAreas: JSON.stringify(validatePreferredAreas(preferredAreas)) } : {}),
        otpCode: otp,
        otpCreatedAt: new Date(),
      })
      .where(eq(usersTable.id, existing.id));

    req.log.info(
      { userId: existing.id, newRole: userType, maskedPhone: maskPhone(phone) },
      "Dual role added; WhatsApp OTP requested",
    );

    const result = await sendWhatsAppOtp(phone, otp, userType);
    if (!result.success) {
      await createWhatsAppFailureNotification({ userId: existing.id, userName: existing.name, phone, userType, error: result.error });
    }
    res.status(201).json({
      message: "تم إضافة الدور الجديد لحسابك. سيتم إرسال رمز التحقق عبر واتساب",
      isVerified: existing.isVerified,
      roleAdded: true,
      otpDelivery: "whatsapp",
    });
    return;
  }

  // New customers and helpers both receive a six-digit WhatsApp OTP.
  const otp = generate6DigitCode();
  const [user] = await db.insert(usersTable).values({
    name, phone, passwordHash: "", userType,
    roles: JSON.stringify([userType]),
    area: userType === "customer" ? area ?? null : null,
    preferredAreas: userType === "helper" ? JSON.stringify(validatePreferredAreas(preferredAreas)) : null,
    isVerified: false, isBlocked: false, otpCode: otp, otpCreatedAt: new Date(),
  }).returning();

  req.log.info(
    { userId: user.id, userType, maskedPhone: maskPhone(phone) },
    `${userType} registered (unverified); WhatsApp OTP requested`,
  );

  await notifyAdminEvent(
    buildNewUserAdminEvent({
      userId: user.id,
      name: user.name,
      phone: user.phone,
      userType: userType === "helper" ? "helper" : "customer",
    }),
  );

  const result = await sendWhatsAppOtp(phone, otp, userType);
  if (!result.success) {
    await createWhatsAppFailureNotification({ userId: user.id, userName: name, phone, userType, error: result.error });
  }
  res.status(201).json({ message: "تم إنشاء الحساب. سيتم إرسال رمز التحقق عبر واتساب", isVerified: false, otpDelivery: "whatsapp" });
});

// POST /auth/login — OTP for regular users; admin-PIN signal for admin phone
router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { phone } = parsed.data;

  if (phone === ADMIN_PHONE) {
    res.json({ message: "أدخل رمز المدير للمتابعة", isAdmin: true });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.phone, phone));
  if (!user) { res.status(404).json({ error: "رقم الهاتف غير مسجل" }); return; }

  if (isUserBlocked(user)) {
    res.status(403).json({ error: "تم تعطيل حسابك، يرجى التواصل مع الإدارة" });
    return;
  }

  req.log.info(
    { userId: user.id, userType: user.userType, maskedPhone: maskPhone(phone), isVerified: user.isVerified },
    "OTP/code generated for login",
  );

  const otp = generate6DigitCode();
  await db.update(usersTable).set({ otpCode: otp, otpCreatedAt: new Date() }).where(eq(usersTable.id, user.id));

  const result = await sendWhatsAppOtp(phone, otp, user.userType);
  if (!result.success) {
    await createWhatsAppFailureNotification({ userId: user.id, userName: user.name, phone, userType: user.userType, error: result.error });
  }
  res.json({
    message: user.isVerified
      ? "تم إرسال رمز التحقق عبر واتساب"
      : "تم إرسال رمز التحقق عبر واتساب، يرجى إدخاله لتفعيل حسابك",
    isVerified: user.isVerified,
    otpDelivery: "whatsapp",
  });
});

// POST /auth/admin-login — PIN login, returns persistent token
router.post("/auth/admin-login", async (req, res): Promise<void> => {
  const parsed = AdminLoginBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { phone, pin } = parsed.data;

  if (phone !== ADMIN_PHONE) { res.status(404).json({ error: "رقم الهاتف غير مسجل" }); return; }
  if (pin !== ADMIN_PIN) { res.status(403).json({ error: "رمز المدير غير صحيح" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.phone, phone));
  if (!user) { res.status(404).json({ error: "رقم الهاتف غير مسجل" }); return; }
  if (isUserBlocked(user)) {
    res.status(403).json({ error: "تم تعطيل حسابك، يرجى التواصل مع الإدارة" });
    return;
  }

  const authToken = user.authToken ?? randomUUID();

  const [updated] = await db
    .update(usersTable)
    .set({ userType: "admin", isBlocked: false, isVerified: true, lastLogin: new Date(), authToken })
    .where(eq(usersTable.id, user.id))
    .returning();

  (req as any).session = (req as any).session || {};
  (req as any).session.userId = updated.id;

  req.log.info({ userId: updated.id }, "Admin logged in via PIN");
  res.json({ user: safeUser(updated), token: authToken });
});

// POST /auth/verify-otp — validates code/OTP, returns persistent token
router.post("/auth/verify-otp", async (req, res): Promise<void> => {
  const parsed = VerifyOtpBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { phone, otp } = parsed.data;

  if (phone === ADMIN_PHONE) {
    res.status(403).json({ error: "يرجى استخدام رمز المدير للدخول" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.phone, phone));
  if (!user) { res.status(404).json({ error: "رقم الهاتف غير مسجل" }); return; }

  if (isUserBlocked(user)) {
    res.status(403).json({ error: "تم تعطيل حسابك، يرجى التواصل مع الإدارة" });
    return;
  }

  // ── Customer/helper path: WhatsApp OTP with 10-min expiry ────────────────
  if (!user.otpCode || user.otpCode !== otp) {
    // Emergency/manual recovery only: the code must have been generated by an
    // admin. The normal mobile flow never mentions this fallback or asks for it.
    const recovery = activateHelperWithRecoveryCode(user, otp);
    if (recovery.ok) {
      const authToken = user.authToken ?? randomUUID();
      const [updated] = await db
        .update(usersTable)
        .set({
          helperActivationCodeActive: false,
          helperActivationCodeUsedAt: new Date(),
          isVerified: true,
          isBlocked: false,
          lastLogin: new Date(),
          authToken,
        })
        .where(eq(usersTable.id, user.id))
        .returning();

      (req as any).session = (req as any).session || {};
      (req as any).session.userId = user.id;
      req.log.info({ userId: user.id }, "Helper activated via admin recovery code");
      sendHelperWelcomeOnce(user.id, user.phone);
      res.json({ user: safeUser(updated), token: authToken });
      return;
    }

    res.status(recovery.status ?? 400).json({ error: recovery.error });
    return;
  }

  if (!user.otpCreatedAt || Date.now() - user.otpCreatedAt.getTime() > OTP_EXPIRY_MS) {
    res.status(400).json({ error: "انتهت صلاحية رمز التحقق، يرجى طلب رمز جديد" });
    return;
  }

  const authToken = user.authToken ?? randomUUID();
  const updates: Partial<typeof usersTable.$inferInsert> = {
    otpCode: null,
    otpCreatedAt: null,
    lastLogin: new Date(),
    authToken,
  };
  if (!user.isVerified) {
    updates.isVerified = true;
    updates.isBlocked = false;
  }

  const [updated] = await db
    .update(usersTable)
    .set(updates)
    .where(eq(usersTable.id, user.id))
    .returning();

  (req as any).session = (req as any).session || {};
  (req as any).session.userId = user.id;

  req.log.info(
    { userId: user.id, userType: user.userType, wasVerified: user.isVerified },
    isHelperAccount(user) ? "Helper logged in via WhatsApp OTP" : "Customer logged in via WhatsApp OTP",
  );
  if (isHelperAccount(user)) {
    sendHelperWelcomeOnce(user.id, user.phone);
  }
  res.json({ user: safeUser(updated), token: authToken });
});

// GET /auth/me — validates token/session and returns fresh user; 403 if blocked
router.get("/auth/me", async (req, res): Promise<void> => {
  const userId = (req as any).session?.userId;
  if (!userId) { res.status(401).json({ error: "غير مصرح" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) { res.status(401).json({ error: "المستخدم غير موجود" }); return; }

  if (isUserBlocked(user)) {
    res.status(403).json({ error: "تم تعطيل حسابك، يرجى التواصل مع الإدارة", isActive: false });
    return;
  }

  res.json(safeUser(user));
});

// PATCH /auth/push-token — save Expo push token for the logged-in helper
router.patch("/auth/push-token", async (req, res): Promise<void> => {
  const userId = (req as any).session?.userId;
  if (!userId) { res.status(401).json({ error: "غير مصرح" }); return; }

  const body = req.body as Record<string, unknown>;
  const expoPushToken = body?.expoPushToken;
  if (!expoPushToken || typeof expoPushToken !== "string") {
    res.status(400).json({ error: "رمز الإشعار مطلوب" });
    return;
  }

  await db.update(usersTable).set({ expoPushToken }).where(eq(usersTable.id, userId));
  res.json({ success: true });
});

// POST /auth/logout — clears persistent token and session
router.post("/auth/logout", async (req, res): Promise<void> => {
  const userId = (req as any).session?.userId;
  if (userId) {
    try {
      await db.update(usersTable).set({ authToken: null }).where(eq(usersTable.id, userId));
    } catch {}
  }
  if ((req as any).session) {
    (req as any).session.userId = null;
  }
  res.json({ success: true });
});

export default router;
