import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { randomUUID, createHmac } from "crypto";
import { db, usersTable, adminNotificationsTable } from "@workspace/db";
import { RegisterBody, LoginBody, VerifyOtpBody, AdminLoginBody } from "@workspace/api-zod";
import { logger } from "../lib/logger";
import { sendAdminOtpPush } from "../lib/push";
import { sendWhatsAppOtp } from "../lib/whatsapp";

const router: IRouter = Router();

const OTP_EXPIRY_MS = 10 * 60 * 1000;          // customer OTP only
const HELPER_VERIFY_MAX_ATTEMPTS = 5;
const HELPER_VERIFY_LOCKOUT_MS   = 15 * 60 * 1000;

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

/**
 * HMAC-SHA256 of the 6-digit code, keyed on SESSION_SECRET.
 * Never log the plain code; only log/store the hash.
 */
function hashHelperCode(code: string): string {
  const secret = process.env.SESSION_SECRET ?? "dev-secret-change-me";
  return createHmac("sha256", secret).update(code).digest("hex");
}

// ── Per-user rate limiter for helper code verification ────────────────────────

interface RateLimitEntry { attempts: number; lockedUntil: number | null }
const helperVerifyAttempts = new Map<number, RateLimitEntry>();

function checkHelperRateLimit(userId: number): { allowed: boolean; retryAfterMs?: number } {
  const now = Date.now();
  const entry = helperVerifyAttempts.get(userId) ?? { attempts: 0, lockedUntil: null };

  if (entry.lockedUntil !== null && now < entry.lockedUntil) {
    return { allowed: false, retryAfterMs: entry.lockedUntil - now };
  }
  // Reset if lock expired
  if (entry.lockedUntil !== null && now >= entry.lockedUntil) {
    helperVerifyAttempts.set(userId, { attempts: 0, lockedUntil: null });
    return { allowed: true };
  }
  if (entry.attempts >= HELPER_VERIFY_MAX_ATTEMPTS) {
    const lockedUntil = now + HELPER_VERIFY_LOCKOUT_MS;
    helperVerifyAttempts.set(userId, { attempts: entry.attempts, lockedUntil });
    return { allowed: false, retryAfterMs: HELPER_VERIFY_LOCKOUT_MS };
  }
  return { allowed: true };
}

function recordHelperFailedAttempt(userId: number): void {
  const entry = helperVerifyAttempts.get(userId) ?? { attempts: 0, lockedUntil: null };
  helperVerifyAttempts.set(userId, { ...entry, attempts: entry.attempts + 1 });
}

function clearHelperRateLimit(userId: number): void {
  helperVerifyAttempts.delete(userId);
}

// ── safeUser ──────────────────────────────────────────────────────────────────

function safeUser(user: typeof usersTable.$inferSelect) {
  const {
    passwordHash: _,
    authToken: __,
    helperActivationCodeHash: ___,   // never expose hash
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
  };
}

// ── Notification helpers ──────────────────────────────────────────────────────

async function createOtpNotification(opts: {
  userId?: number;
  userName?: string;
  phone: string;
  userType?: string;
}): Promise<number | null> {
  try {
    const [row] = await db.insert(adminNotificationsTable).values({
      type: "otp_request",
      title: "طلب رمز تحقق جديد",
      userId: opts.userId ?? null,
      userName: opts.userName ?? null,
      phone: opts.phone,
      userType: opts.userType ?? null,
      isRead: false,
    }).returning({ id: adminNotificationsTable.id });
    return row?.id ?? null;
  } catch (err) {
    logger.error({ err }, "Failed to create OTP notification");
    return null;
  }
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

/**
 * Returns true for user types that receive a WhatsApp OTP.
 * Helpers always use the admin-mediated activation code flow.
 */
function shouldSendWhatsApp(userType: string): boolean {
  return userType === "customer";
}

// ── Routes ───────────────────────────────────────────────────────────────────

// POST /auth/register
router.post("/auth/register", async (req, res): Promise<void> => {
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { name, phone, userType } = parsed.data;

  const [existing] = await db.select().from(usersTable).where(eq(usersTable.phone, phone));

  if (existing) {
    const existingRoles = parseRoles(existing.roles, existing.userType);
    if (existingRoles.includes(userType)) {
      res.status(400).json({ error: "رقم الهاتف مسجل مسبقاً بهذا النوع" });
      return;
    }

    const updatedRoles = [...existingRoles, userType];

    if (shouldSendWhatsApp(userType)) {
      // Customer dual-role: customer OTP via WhatsApp (with expiry)
      const otp = generate6DigitCode();
      await db.update(usersTable)
        .set({ roles: JSON.stringify(updatedRoles), otpCode: otp, otpCreatedAt: new Date() })
        .where(eq(usersTable.id, existing.id));

      req.log.info({ userId: existing.id, newRole: userType, maskedPhone: maskPhone(phone) }, "Dual role added (customer)");

      const result = await sendWhatsAppOtp(phone, otp, userType);
      if (!result.success) {
        await createWhatsAppFailureNotification({ userId: existing.id, userName: existing.name, phone, userType, error: result.error });
      }
      res.status(201).json({
        message: "تم إضافة دور العميل لحسابك. سيتم إرسال رمز التحقق عبر واتساب",
        isVerified: existing.isVerified,
        roleAdded: true,
      });
    } else {
      // Helper dual-role: non-expiring activation code
      const code = generate6DigitCode();
      await db.update(usersTable)
        .set({
          roles: JSON.stringify(updatedRoles),
          helperActivationCodeHash: hashHelperCode(code),
          helperActivationCodeCreatedAt: new Date(),
          helperActivationCodeUsedAt: null,
          helperActivationCodeActive: true,
        })
        .where(eq(usersTable.id, existing.id));

      req.log.info({ userId: existing.id, newRole: userType, maskedPhone: maskPhone(phone) }, "Dual role added (helper)");

      const notifId = await createOtpNotification({ userId: existing.id, userName: existing.name, phone, userType });
      if (notifId != null) void sendAdminOtpPush(notifId, existing.id, phone, new Date().toISOString(), code);
      res.status(201).json({
        message: "تم إضافة الدور الجديد لحسابك. يرجى التواصل مع الإدارة للحصول على رمز التحقق",
        isVerified: existing.isVerified,
        roleAdded: true,
      });
    }
    return;
  }

  if (shouldSendWhatsApp(userType)) {
    // New customer: WhatsApp OTP (with expiry)
    const otp = generate6DigitCode();
    const [user] = await db.insert(usersTable).values({
      name, phone, passwordHash: "", userType,
      roles: JSON.stringify([userType]),
      isVerified: false, isBlocked: false, otpCode: otp, otpCreatedAt: new Date(),
    }).returning();

    req.log.info({ userId: user.id, userType, maskedPhone: maskPhone(phone) }, "Customer registered (unverified)");

    const result = await sendWhatsAppOtp(phone, otp, userType);
    if (!result.success) {
      await createWhatsAppFailureNotification({ userId: user.id, userName: name, phone, userType, error: result.error });
    }
    res.status(201).json({ message: "تم إنشاء الحساب. سيتم إرسال رمز التحقق عبر واتساب", isVerified: false });
  } else {
    // New helper: non-expiring activation code
    const code = generate6DigitCode();
    const [user] = await db.insert(usersTable).values({
      name, phone, passwordHash: "", userType,
      roles: JSON.stringify([userType]),
      isVerified: false, isBlocked: false,
      helperActivationCodeHash: hashHelperCode(code),
      helperActivationCodeCreatedAt: new Date(),
      helperActivationCodeUsedAt: null,
      helperActivationCodeActive: true,
    }).returning();

    req.log.info({ userId: user.id, userType, maskedPhone: maskPhone(phone) }, "Helper registered (unverified)");

    const notifId = await createOtpNotification({ userId: user.id, userName: name, phone, userType });
    if (notifId != null) void sendAdminOtpPush(notifId, user.id, phone, new Date().toISOString(), code);
    res.status(201).json({
      message: "تم إنشاء الحساب. يرجى التواصل مع الإدارة للحصول على رمز التحقق",
      isVerified: false,
    });
  }
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

  if (user.isBlocked && user.isVerified) {
    res.status(403).json({ error: "تم تعطيل حسابك، يرجى التواصل مع الإدارة" });
    return;
  }

  req.log.info(
    { userId: user.id, userType: user.userType, maskedPhone: maskPhone(phone), isVerified: user.isVerified },
    "OTP/code generated for login",
  );

  if (shouldSendWhatsApp(user.userType)) {
    // Customer: WhatsApp OTP (with expiry)
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
  } else {
    // Helper: generate new non-expiring activation code (invalidates the old one)
    const code = generate6DigitCode();
    await db.update(usersTable)
      .set({
        helperActivationCodeHash: hashHelperCode(code),
        helperActivationCodeCreatedAt: new Date(),
        helperActivationCodeUsedAt: null,
        helperActivationCodeActive: true,
      })
      .where(eq(usersTable.id, user.id));

    const notifId = await createOtpNotification({ userId: user.id, userName: user.name, phone, userType: user.userType });
    if (notifId != null) void sendAdminOtpPush(notifId, user.id, phone, new Date().toISOString(), code);
    res.json({
      message: user.isVerified
        ? "تواصل مع الإدارة للحصول على رمز التفعيل"
        : "حسابك غير مفعل. يرجى إدخال رمز التحقق من الإدارة",
      isVerified: user.isVerified,
      otpDelivery: "admin",
    });
  }
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

  if (user.isBlocked && user.isVerified) {
    res.status(403).json({ error: "تم تعطيل حسابك، يرجى التواصل مع الإدارة" });
    return;
  }

  // ── Helper path: non-expiring activation code ────────────────────────────
  if (!shouldSendWhatsApp(user.userType)) {
    const rateCheck = checkHelperRateLimit(user.id);
    if (!rateCheck.allowed) {
      const minutes = Math.ceil((rateCheck.retryAfterMs ?? HELPER_VERIFY_LOCKOUT_MS) / 60000);
      res.status(429).json({ error: `تجاوزت الحد المسموح من المحاولات. حاول مجدداً بعد ${minutes} دقيقة` });
      return;
    }

    if (!user.helperActivationCodeActive || !user.helperActivationCodeHash) {
      res.status(400).json({ error: "لا يوجد رمز تفعيل نشط. تواصل مع الإدارة لإنشاء رمز جديد" });
      return;
    }

    const expectedHash = hashHelperCode(otp);
    if (expectedHash !== user.helperActivationCodeHash) {
      recordHelperFailedAttempt(user.id);
      res.status(400).json({ error: "رمز التحقق غير صحيح" });
      return;
    }

    // Code is valid — mark as used
    clearHelperRateLimit(user.id);
    const authToken = user.authToken ?? randomUUID();

    const updates: Partial<typeof usersTable.$inferInsert> = {
      helperActivationCodeActive: false,
      helperActivationCodeUsedAt: new Date(),
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
      "Helper logged in via activation code",
    );
    res.json({ user: safeUser(updated), token: authToken });
    return;
  }

  // ── Customer path: WhatsApp OTP with 10-min expiry ───────────────────────
  if (!user.otpCode || user.otpCode !== otp) {
    res.status(400).json({ error: "رمز التحقق غير صحيح" });
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
    "Customer logged in via WhatsApp OTP",
  );
  res.json({ user: safeUser(updated), token: authToken });
});

// GET /auth/me — validates token/session and returns fresh user; 403 if blocked
router.get("/auth/me", async (req, res): Promise<void> => {
  const userId = (req as any).session?.userId;
  if (!userId) { res.status(401).json({ error: "غير مصرح" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) { res.status(401).json({ error: "المستخدم غير موجود" }); return; }

  if (user.isBlocked) {
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
