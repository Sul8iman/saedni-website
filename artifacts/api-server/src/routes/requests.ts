import { Router, type IRouter } from "express";
import { and, avg, count, desc, eq, inArray, isNotNull, isNull, or } from "drizzle-orm";
import {
  db,
  helperRatingsTable,
  requestContactsTable,
  requestLifecycleEventsTable,
  requestsTable,
  usersTable,
} from "@workspace/db";
import {
  AcceptRequestBody,
  AcceptRequestParams,
  CancelRequestParams,
  CompleteRequestBody,
  CompleteRequestParams,
  CreateRequestBody,
  DeleteRequestParams,
  GetRequestParams,
  ListRequestsQueryParams,
  ListContactedHelpersParams,
  RecordRequestContactBody,
  UpdateRequestBody,
  UpdateRequestParams,
  UpdateRequestStatusBody,
  UpdateRequestStatusParams,
} from "@workspace/api-zod";
import { logger } from "../lib/logger";
import { buildNewRequestAdminEvent } from "../lib/admin-event-notifications";
import { notifyAdminEvent } from "../lib/admin-event-store";
import {
  actorHasRole,
  isAdminActor,
  requireAdminRequestActor,
  requireRequestActor,
  type RequestActor,
} from "../lib/request-access";
import {
  buildRequestLifecycleEventValues,
  presentRequestLifecycleEvent,
} from "../lib/request-lifecycle";
import { decideRequestPermission, type RequestPermissionDecision } from "../lib/request-security";
import { helperServesArea, isActiveServiceArea, parsePreferredAreas } from "../lib/service-areas";

const router: IRouter = Router();

const CATEGORY_AR: Record<string, string> = {
  transport: "شاحنة للنقل",
  delivery: "مندوب توصيل",
  government: "معاملات ومراجعات",
  shopping: "شراء أغراض",
  home_services: "خدمات منزلية",
  labor: "أخرى",
};

const notifiedRequestIds = new Set<number>();

async function sendNewRequestNotifications(
  requestId: number,
  category: string,
  area: string,
): Promise<void> {
  if (notifiedRequestIds.has(requestId)) {
    logger.warn({ requestId }, "push: duplicate call suppressed by idempotency guard");
    return;
  }
  notifiedRequestIds.add(requestId);

  try {
    const rows = await db
      .select({
        id: usersTable.id,
        userType: usersTable.userType,
        roles: usersTable.roles,
        expoPushToken: usersTable.expoPushToken,
        helperInterests: usersTable.helperInterests,
        preferredAreas: usersTable.preferredAreas,
      })
      .from(usersTable)
      .where(and(eq(usersTable.isBlocked, false), isNotNull(usersTable.expoPushToken)));

    const catLabel = CATEGORY_AR[category] ?? category;
    const seenTokens = new Set<string>();
    let matchedHelpers = 0;

    for (const helper of rows) {
      let roles: string[];
      try {
        roles = helper.roles ? JSON.parse(helper.roles) : [helper.userType];
      } catch {
        roles = [helper.userType];
      }
      if (!roles.includes("helper")) continue;

      if (helper.helperInterests) {
        try {
          const interests: string[] = JSON.parse(helper.helperInterests);
          if (interests.length > 0 && !interests.includes(category)) continue;
        } catch {}
      }

      if (!helperServesArea(helper.preferredAreas, area)) continue;

      matchedHelpers++;
      if (helper.expoPushToken) seenTokens.add(helper.expoPushToken);
    }

    const uniqueTokens = [...seenTokens];
    logger.info(
      { requestId, category, area, matchedHelpers, uniqueTokens: uniqueTokens.length },
      "push: dispatching new-request notifications",
    );
    if (uniqueTokens.length === 0) return;

    const messages = uniqueTokens.map((to) => ({
      to,
      title: "طلب جديد متاح",
      body: `طلب جديد في ${area}\n${catLabel}`,
      data: { type: "new_request", requestId, category, area },
      sound: "default",
    }));

    let sentCount = 0;
    for (let i = 0; i < messages.length; i += 100) {
      const batch = messages.slice(i, i + 100);
      const response = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "Accept-Encoding": "gzip, deflate",
        },
        body: JSON.stringify(batch),
      });
      const json = await response.json().catch(() => null);
      sentCount += batch.length;
      logger.info(
        { requestId, batchStart: i, batchSize: batch.length, status: response.status, response: json },
        "push: expo batch sent",
      );
    }

    logger.info(
      { requestId, matchedHelpers, uniqueTokens: uniqueTokens.length, sentCount },
      "push: dispatch complete",
    );
  } catch (err) {
    logger.warn({ requestId, err }, "push: notification dispatch failed");
  }
}

export async function enrichRequest(
  request: typeof requestsTable.$inferSelect,
  options: { includeContact?: boolean } = {},
) {
  const ids = [request.customerId, request.helperId, request.completedHelperId].filter(Boolean) as number[];
  const users =
    ids.length > 0
      ? await db
          .select({ id: usersTable.id, name: usersTable.name, phone: usersTable.phone })
          .from(usersTable)
          .where(inArray(usersTable.id, ids))
      : [];
  const userMap = Object.fromEntries(users.map((user) => [user.id, user]));

  return {
    ...request,
    createdAt: request.createdAt.toISOString(),
    completedAt: request.completedAt?.toISOString() ?? null,
    deletedAt: request.deletedAt?.toISOString() ?? null,
    customerName: options.includeContact ? (userMap[request.customerId]?.name ?? null) : null,
    customerPhone: options.includeContact ? (userMap[request.customerId]?.phone ?? null) : null,
    helperName: options.includeContact && (request.completedHelperId ?? request.helperId)
      ? (userMap[request.completedHelperId ?? request.helperId!]?.name ?? null) : null,
    helperPhone: options.includeContact && (request.completedHelperId ?? request.helperId)
      ? (userMap[request.completedHelperId ?? request.helperId!]?.phone ?? null) : null,
  };
}

function requestNotFound(res: import("express").Response): void {
  res.status(404).json({ error: "الطلب غير موجود" });
}

function enforceRequestPermission(
  res: import("express").Response,
  decision: RequestPermissionDecision,
): boolean {
  if (decision.allowed) return true;
  res.status(decision.status).json({ error: decision.error });
  return false;
}

function requestContentUnchangedConditions(request: typeof requestsTable.$inferSelect) {
  return [
    eq(requestsTable.category, request.category),
    eq(requestsTable.details, request.details),
    eq(requestsTable.timeType, request.timeType),
    request.scheduledDateTime === null
      ? isNull(requestsTable.scheduledDateTime)
      : eq(requestsTable.scheduledDateTime, request.scheduledDateTime),
    eq(requestsTable.area, request.area),
    eq(requestsTable.offeredAmount, request.offeredAmount),
  ];
}

async function getLiveRequest(id: number) {
  const [request] = await db
    .select()
    .from(requestsTable)
    .where(and(eq(requestsTable.id, id), isNull(requestsTable.deletedAt)));
  return request;
}

router.get("/requests", async (req, res): Promise<void> => {
  const parsed = ListRequestsQueryParams.safeParse(req.query);
  const params = parsed.success ? parsed.data : {};
  const conditions = [isNull(requestsTable.deletedAt)];
  const actor = await requireRequestActor(req, res);
  if (!actor) return;

  const isCustomer = actorHasRole(actor, "customer");
  const isHelper = actorHasRole(actor, "helper");

  if (isAdminActor(actor)) {
    // Administrators can review all live requests.
  } else if (params.customerId !== undefined) {
    if (!isCustomer || Number(params.customerId) !== actor.id) {
      res.status(403).json({ error: "لا يمكنك عرض طلبات مستخدم آخر" });
      return;
    }
    conditions.push(eq(requestsTable.customerId, actor.id));
  } else if (params.helperId !== undefined) {
    if (!isHelper || Number(params.helperId) !== actor.id) {
      res.status(403).json({ error: "لا يمكنك عرض طلبات مساعد آخر" });
      return;
    }
    conditions.push(eq(requestsTable.helperId, actor.id));
  } else if (isHelper) {
    // A helper's unfiltered feed includes available work and their own assignments.
    // This remains correct for accounts that also have the customer role.
    const helperVisibility = or(eq(requestsTable.status, "available"), eq(requestsTable.helperId, actor.id));
    if (helperVisibility) conditions.push(helperVisibility);
  } else if (isCustomer) {
    conditions.push(eq(requestsTable.customerId, actor.id));
  } else {
    res.status(403).json({ error: "لا تملك صلاحية عرض الطلبات" });
    return;
  }

  if (params.category) conditions.push(eq(requestsTable.category, params.category));
  if (params.area) conditions.push(eq(requestsTable.area, params.area));
  if (params.status) conditions.push(eq(requestsTable.status, params.status));
  if (params.customerId) conditions.push(eq(requestsTable.customerId, Number(params.customerId)));
  if (params.helperId) conditions.push(eq(requestsTable.helperId, Number(params.helperId)));

  const rows = await db
    .select()
    .from(requestsTable)
    .where(and(...conditions))
    .orderBy(desc(requestsTable.createdAt), desc(requestsTable.id));

  let actorVisibleRows = rows;
  if (isHelper && !isAdminActor(actor)) {
    const [helper] = await db
      .select({ preferredAreas: usersTable.preferredAreas })
      .from(usersTable)
      .where(eq(usersTable.id, actor.id));
    actorVisibleRows = rows.filter((row) => helperServesArea(helper?.preferredAreas, row.area));
  }

  res.json(await Promise.all(actorVisibleRows.map((row) =>
    enrichRequest(row, {
      includeContact: isAdminActor(actor) || row.customerId === actor.id || row.helperId === actor.id,
    }),
  )));
});

router.post("/requests", async (req, res): Promise<void> => {
  const parsed = CreateRequestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const actor = await requireRequestActor(req, res);
  if (!actor) return;

  if (!isActiveServiceArea(parsed.data.area)) {
    res.status(400).json({ error: "المنطقة غير متاحة للاختيار الجديد" });
    return;
  }

  if (!enforceRequestPermission(
    res,
    decideRequestPermission({ action: "create", actor, customerId: parsed.data.customerId }),
  )) return;

  const [customer] = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      phone: usersTable.phone,
      isBlocked: usersTable.isBlocked,
    })
    .from(usersTable)
    .where(eq(usersTable.id, actor.id));

  if (!customer) {
    res.status(404).json({ error: "المستخدم غير موجود" });
    return;
  }
  if (customer.isBlocked) {
    res.status(403).json({ error: "تم تعطيل حسابك، يرجى التواصل مع الإدارة" });
    return;
  }

  const row = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(requestsTable)
      .values({ ...parsed.data, status: "available" })
      .returning();
    await tx.insert(requestLifecycleEventsTable).values(buildRequestLifecycleEventValues({
      requestId: created.id,
      action: "created",
      actor,
      metadata: { status: created.status },
    }));
    return created;
  });

  await notifyAdminEvent(
    buildNewRequestAdminEvent({
      requestId: row.id,
      category: row.category,
      area: row.area,
      customerId: customer.id,
      customerName: customer.name,
      customerPhone: customer.phone,
    }),
  );

  res.status(201).json(await enrichRequest(row, { includeContact: true }));
  void sendNewRequestNotifications(row.id, row.category, row.area);
});

router.get("/requests/:id", async (req, res): Promise<void> => {
  const params = GetRequestParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const actor = await requireRequestActor(req, res);
  if (!actor) return;
  const row = await getLiveRequest(params.data.id);
  if (!row) {
    requestNotFound(res);
    return;
  }
  const canView = isAdminActor(actor)
    || row.customerId === actor.id
    || (actorHasRole(actor, "helper") && (row.status === "available" || row.helperId === actor.id));
  if (!canView) {
    res.status(403).json({ error: "لا يمكنك عرض هذا الطلب" });
    return;
  }
  res.json(await enrichRequest(row, {
    includeContact: isAdminActor(actor) || row.customerId === actor.id || row.helperId === actor.id,
  }));
});

router.patch("/requests/:id", async (req, res): Promise<void> => {
  const params = UpdateRequestParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateRequestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const actor = await requireRequestActor(req, res);
  if (!actor) return;
  const existing = await getLiveRequest(params.data.id);
  if (!existing) {
    requestNotFound(res);
    return;
  }
  if (!enforceRequestPermission(res, decideRequestPermission({ action: "edit", actor, request: existing }))) return;

  const { status: attemptedStatusChange, ...updates } = parsed.data;
  if (attemptedStatusChange !== undefined) {
    res.status(400).json({ error: "استخدم إجراء حالة الطلب المخصص" });
    return;
  }
  if (Object.keys(updates).length === 0) {
    res.json(await enrichRequest(existing));
    return;
  }

  const row = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(requestsTable)
      .set(updates)
      .where(and(
        eq(requestsTable.id, existing.id),
        eq(requestsTable.status, existing.status),
        isNull(requestsTable.deletedAt),
        ...requestContentUnchangedConditions(existing),
      ))
      .returning();
    if (!updated) return null;
    await tx.insert(requestLifecycleEventsTable).values(buildRequestLifecycleEventValues({
      requestId: updated.id,
      action: "updated",
      actor,
      metadata: { status: updated.status },
    }));
    return updated;
  });
  if (!row) {
    res.status(409).json({ error: "تغير الطلب، حدّث الصفحة ثم أعد المحاولة" });
    return;
  }
  res.json(await enrichRequest(row, { includeContact: true }));
});

// DELETE is an archive operation. There is deliberately no normal-flow hard-delete endpoint.
router.delete("/requests/:id", async (req, res): Promise<void> => {
  const params = DeleteRequestParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const actor = await requireRequestActor(req, res);
  if (!actor) return;
  const existing = await getLiveRequest(params.data.id);
  if (!existing) {
    requestNotFound(res);
    return;
  }
  if (!enforceRequestPermission(res, decideRequestPermission({ action: "archive", actor, request: existing }))) return;

  const row = await db.transaction(async (tx) => {
    const [archived] = await tx
      .update(requestsTable)
      .set({
        deletedAt: new Date(),
        deletedByUserId: actor.id,
        deletedReason: actor.userType === "admin" ? "admin_archived" : "customer_archived",
      })
      .where(and(
        eq(requestsTable.id, existing.id),
        eq(requestsTable.status, existing.status),
        isNull(requestsTable.deletedAt),
      ))
      .returning();
    if (!archived) return null;
    await tx.insert(requestLifecycleEventsTable).values(buildRequestLifecycleEventValues({
      requestId: archived.id,
      action: "soft_deleted",
      actor,
      reason: archived.deletedReason,
      metadata: { status: archived.status },
    }));
    return archived;
  });
  if (!row) {
    res.status(409).json({ error: "تغير الطلب، حدّث الصفحة ثم أعد المحاولة" });
    return;
  }
  res.sendStatus(204);
});

router.patch("/requests/:id/status", async (req, res): Promise<void> => {
  const params = UpdateRequestStatusParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateRequestStatusBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const actor = await requireRequestActor(req, res);
  if (!actor) return;
  const existing = await getLiveRequest(params.data.id);
  if (!existing) {
    requestNotFound(res);
    return;
  }
  if (!enforceRequestPermission(
    res,
    decideRequestPermission({ action: "advance_status", actor, request: existing }),
  )) return;

  const allowed: Record<string, string[]> = {
    accepted: ["in_progress", "completed", "cancelled"],
    in_progress: ["completed", "cancelled"],
  };
  if (!allowed[existing.status]?.includes(parsed.data.status)) {
    res.status(400).json({ error: "تحويل الحالة غير مسموح" });
    return;
  }

  const row = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(requestsTable)
      .set({
        status: parsed.data.status,
        ...(parsed.data.status === "completed" ? { completedAt: new Date() } : {}),
      })
      .where(and(
        eq(requestsTable.id, existing.id),
        eq(requestsTable.helperId, actor.id),
        eq(requestsTable.status, existing.status),
        isNull(requestsTable.deletedAt),
      ))
      .returning();
    if (!updated) return null;
    await tx.insert(requestLifecycleEventsTable).values(buildRequestLifecycleEventValues({
      requestId: updated.id,
      action: "status_changed",
      actor,
      metadata: { fromStatus: existing.status, toStatus: updated.status },
    }));
    if (updated.status === "completed") {
      await tx.insert(requestLifecycleEventsTable).values(buildRequestLifecycleEventValues({
        requestId: updated.id,
        action: "completed",
        actor,
        metadata: { status: updated.status },
      }));
    }
    return updated;
  });
  if (!row) {
    res.status(409).json({ error: "تغير الطلب، حدّث الصفحة ثم أعد المحاولة" });
    return;
  }
  res.json(await enrichRequest(row, { includeContact: true }));
});

router.patch("/requests/:id/accept", async (req, res): Promise<void> => {
  const params = AcceptRequestParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = AcceptRequestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const actor = await requireRequestActor(req, res);
  if (!actor) return;
  const existing = await getLiveRequest(params.data.id);
  if (!existing) {
    requestNotFound(res);
    return;
  }
  if (!enforceRequestPermission(
    res,
    decideRequestPermission({
      action: "accept",
      actor,
      request: existing,
      helperId: parsed.data.helperId,
    }),
  )) return;
  if (existing.status !== "available") {
    res.status(400).json({ error: "هذا الطلب غير متاح للقبول" });
    return;
  }
  const [helper] = await db
    .select({ preferredAreas: usersTable.preferredAreas })
    .from(usersTable)
    .where(eq(usersTable.id, actor.id));
  if (!helperServesArea(helper?.preferredAreas, existing.area)) {
    res.status(403).json({ error: "لا يمكنك قبول طلب خارج مناطق خدمتك" });
    return;
  }

  const row = await db.transaction(async (tx) => {
    const [accepted] = await tx
      .update(requestsTable)
      .set({ helperId: actor.id, status: "accepted" })
      .where(and(
        eq(requestsTable.id, existing.id),
        eq(requestsTable.status, "available"),
        isNull(requestsTable.deletedAt),
      ))
      .returning();
    if (!accepted) return null;
    await tx.insert(requestLifecycleEventsTable).values(buildRequestLifecycleEventValues({
      requestId: accepted.id,
      action: "accepted",
      actor,
      metadata: { fromStatus: existing.status, toStatus: accepted.status },
    }));
    return accepted;
  });
  if (!row) {
    res.status(409).json({ error: "تم قبول الطلب بواسطة مساعد آخر" });
    return;
  }
  res.json(await enrichRequest(row, { includeContact: true }));
});

function normalizePhone(phone: string): string {
  const normalized = phone.replace(/[^\d+]/g, "");
  return normalized.startsWith("00") ? `+${normalized.slice(2)}` : normalized;
}

router.post("/requests/:id/contact", async (req, res): Promise<void> => {
  const params = GetRequestParams.safeParse(req.params);
  const parsed = RecordRequestContactBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const actor = await requireRequestActor(req, res);
  if (!actor) return;
  if (!actorHasRole(actor, "helper")) {
    res.status(403).json({ error: "تسجيل التواصل متاح للمساعد فقط" });
    return;
  }

  const existing = await getLiveRequest(params.data.id);
  if (!existing) {
    requestNotFound(res);
    return;
  }
  if (existing.status === "completed" || existing.status === "cancelled") {
    res.status(400).json({ error: "لا يمكن التواصل بعد انتهاء الطلب" });
    return;
  }
  if (existing.helperId !== null && existing.helperId !== actor.id) {
    res.status(403).json({ error: "لا يمكنك التواصل مع هذا الطلب" });
    return;
  }

  const [helper] = await db
    .select({ preferredAreas: usersTable.preferredAreas })
    .from(usersTable)
    .where(eq(usersTable.id, actor.id));
  if (!helperServesArea(helper?.preferredAreas, existing.area)) {
    res.status(403).json({ error: "لا يمكنك الوصول إلى طلب خارج مناطق خدمتك" });
    return;
  }
  const [customer] = await db
    .select({ phone: usersTable.phone })
    .from(usersTable)
    .where(eq(usersTable.id, existing.customerId));
  if (!customer) {
    res.status(404).json({ error: "العميل غير موجود" });
    return;
  }

  const now = new Date();
  const [contact] = await db
    .insert(requestContactsTable)
    .values({
      requestId: existing.id,
      helperId: actor.id,
      customerId: existing.customerId,
      contactMethod: parsed.data.contactMethod,
      contactPhone: normalizePhone(customer.phone),
      firstContactedAt: now,
      lastContactedAt: now,
    })
    .onConflictDoUpdate({
      target: [requestContactsTable.requestId, requestContactsTable.helperId],
      set: {
        contactMethod: parsed.data.contactMethod,
        contactPhone: normalizePhone(customer.phone),
        lastContactedAt: now,
      },
    })
    .returning();

  res.json({
    ...contact,
    firstContactedAt: contact.firstContactedAt.toISOString(),
    lastContactedAt: contact.lastContactedAt.toISOString(),
  });
});

router.get("/requests/:id/contacted-helpers", async (req, res): Promise<void> => {
  const params = ListContactedHelpersParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const actor = await requireRequestActor(req, res);
  if (!actor) return;
  const request = await getLiveRequest(params.data.id);
  if (!request) {
    requestNotFound(res);
    return;
  }
  if (!isAdminActor(actor) && actor.id !== request.customerId) {
    res.status(403).json({ error: "لا يحق لك عرض قائمة من تواصلوا مع الطلب" });
    return;
  }

  const contacts = await db
    .select()
    .from(requestContactsTable)
    .where(eq(requestContactsTable.requestId, request.id));
  const helperIds = contacts.map((contact) => contact.helperId);
  if (helperIds.length === 0) {
    res.json([]);
    return;
  }
  const helpers = await db
    .select({ id: usersTable.id, name: usersTable.name, rating: usersTable.rating })
    .from(usersTable)
    .where(inArray(usersTable.id, helperIds));
  const ratingRows = await db
    .select({
      helperId: helperRatingsTable.helperId,
      average: avg(helperRatingsTable.stars),
      count: count(),
    })
    .from(helperRatingsTable)
    .where(inArray(helperRatingsTable.helperId, helperIds))
    .groupBy(helperRatingsTable.helperId);
  const helperMap = new Map(helpers.map((helper) => [helper.id, helper]));
  const ratingMap = new Map(ratingRows.map((row) => [row.helperId, row]));

  res.json(contacts.map((contact) => {
    const helper = helperMap.get(contact.helperId);
    const aggregate = ratingMap.get(contact.helperId);
    return {
      helperId: contact.helperId,
      helperName: helper?.name ?? null,
      rating: aggregate?.average == null ? helper?.rating ?? null : Number(aggregate.average),
      ratingCount: Number(aggregate?.count ?? 0),
      contactMethod: contact.contactMethod,
      contactPhone: contact.contactPhone,
      firstContactedAt: contact.firstContactedAt.toISOString(),
      lastContactedAt: contact.lastContactedAt.toISOString(),
    };
  }));
});

router.patch("/requests/:id/complete", async (req, res): Promise<void> => {
  const params = CompleteRequestParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = CompleteRequestBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const actor = await requireRequestActor(req, res);
  if (!actor) return;
  const existing = await getLiveRequest(params.data.id);
  if (!existing) {
    requestNotFound(res);
    return;
  }
  if (!enforceRequestPermission(
    res,
    decideRequestPermission({ action: "complete", actor, request: existing }),
  )) return;

  const { helpCompleted, completedHelperId, ratingStars } = parsed.data;
  if (!isAdminActor(actor) && helpCompleted === undefined) {
    res.status(400).json({ error: "يجب تحديد ما إذا تمت المساعدة" });
    return;
  }
  if (helpCompleted !== true && (completedHelperId != null || ratingStars != null)) {
    res.status(400).json({ error: "لا يمكن اختيار مساعد أو تقييم عند عدم إتمام المساعدة" });
    return;
  }
  if (isAdminActor(actor) && (completedHelperId != null || ratingStars != null || helpCompleted !== undefined)) {
    res.status(403).json({ error: "اختيار المساعد والتقييم متاحان للعميل فقط" });
    return;
  }
  if (helpCompleted === true && completedHelperId == null) {
    res.status(400).json({ error: "اختر المساعد الذي أنجز الطلب" });
    return;
  }

  const result = await db.transaction(async (tx) => {
    const [lockedRequest] = await tx
      .select()
      .from(requestsTable)
      .where(and(eq(requestsTable.id, params.data.id), isNull(requestsTable.deletedAt)));
    if (!lockedRequest) return { kind: "not_found" as const };
    if (lockedRequest.status === "completed" || lockedRequest.status === "cancelled") {
      if (helpCompleted === true && completedHelperId != null && ratingStars != null) {
        const [existingRating] = await tx
          .select({ id: helperRatingsTable.id })
          .from(helperRatingsTable)
          .where(eq(helperRatingsTable.requestId, lockedRequest.id));
        if (existingRating) return { kind: "already_rated" as const };
      }
      return { kind: "conflict" as const };
    }
    if (!isAdminActor(actor) && lockedRequest.customerId !== actor.id) {
      return { kind: "forbidden" as const };
    }

    let ratingInserted = false;
    if (helpCompleted === true && completedHelperId != null) {
      const [contact] = await tx
        .select({ helperId: requestContactsTable.helperId })
        .from(requestContactsTable)
        .where(and(
          eq(requestContactsTable.requestId, lockedRequest.id),
          eq(requestContactsTable.helperId, completedHelperId),
          eq(requestContactsTable.customerId, lockedRequest.customerId),
        ));
      if (!contact) return { kind: "helper_not_contacted" as const };

      if (ratingStars != null) {
        const [existingRating] = await tx
          .select({ id: helperRatingsTable.id })
          .from(helperRatingsTable)
          .where(eq(helperRatingsTable.requestId, lockedRequest.id));
        if (existingRating) return { kind: "already_rated" as const };
        const [insertedRating] = await tx
          .insert(helperRatingsTable)
          .values({
          requestId: lockedRequest.id,
          customerId: lockedRequest.customerId,
          helperId: completedHelperId,
          stars: ratingStars,
          })
          .onConflictDoNothing({ target: helperRatingsTable.requestId })
          .returning({ id: helperRatingsTable.id });
        if (!insertedRating) return { kind: "already_rated" as const };
        ratingInserted = true;
      }
    }

    const [completed] = await tx
      .update(requestsTable)
      .set({
        status: "completed",
        completedAt: new Date(),
        helpCompleted: helpCompleted ?? null,
        completedHelperId: helpCompleted === true ? completedHelperId ?? null : null,
      })
      .where(and(
        eq(requestsTable.id, lockedRequest.id),
        eq(requestsTable.status, lockedRequest.status),
        isNull(requestsTable.deletedAt),
      ))
      .returning();
    if (!completed) return { kind: "conflict" as const };

    await tx.insert(requestLifecycleEventsTable).values(buildRequestLifecycleEventValues({
      requestId: completed.id,
      action: "completed",
      actor,
      metadata: {
        fromStatus: lockedRequest.status,
        toStatus: completed.status,
        completedHelperId: completed.completedHelperId,
        ratingInserted,
      },
    }));
    if (helpCompleted !== undefined && helpCompleted !== lockedRequest.helpCompleted) {
      await tx.insert(requestLifecycleEventsTable).values(buildRequestLifecycleEventValues({
        requestId: completed.id,
        action: "help_result_changed",
        actor,
        metadata: { helpCompleted },
      }));
    }
    return { kind: "ok" as const, request: completed };
  });

  if (result.kind === "not_found") {
    requestNotFound(res);
    return;
  }
  if (result.kind === "forbidden") {
    res.status(403).json({ error: "لا يمكنك إنهاء طلب مستخدم آخر" });
    return;
  }
  if (result.kind === "helper_not_contacted") {
    res.status(400).json({ error: "لا يمكن اختيار مساعد لم يتواصل مع الطلب" });
    return;
  }
  if (result.kind === "already_rated") {
    res.status(409).json({ error: "تم تقييم هذا الطلب مسبقاً" });
    return;
  }
  if (result.kind === "conflict") {
    res.status(409).json({ error: "تغير الطلب، حدّث الصفحة ثم أعد المحاولة" });
    return;
  }
  res.json(await enrichRequest(result.request, { includeContact: true }));
});

router.patch("/requests/:id/cancel", async (req, res): Promise<void> => {
  const params = CancelRequestParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const actor = await requireRequestActor(req, res);
  if (!actor) return;
  const existing = await getLiveRequest(params.data.id);
  if (!existing) {
    requestNotFound(res);
    return;
  }
  if (!enforceRequestPermission(
    res,
    decideRequestPermission({ action: "cancel", actor, request: existing }),
  )) return;

  const row = await db.transaction(async (tx) => {
    const [cancelled] = await tx
      .update(requestsTable)
      .set({ status: "cancelled" })
      .where(and(
        eq(requestsTable.id, existing.id),
        eq(requestsTable.status, existing.status),
        isNull(requestsTable.deletedAt),
      ))
      .returning();
    if (!cancelled) return null;
    await tx.insert(requestLifecycleEventsTable).values(buildRequestLifecycleEventValues({
      requestId: cancelled.id,
      action: "cancelled",
      actor,
      metadata: { fromStatus: existing.status, toStatus: cancelled.status },
    }));
    return cancelled;
  });
  if (!row) {
    res.status(409).json({ error: "تغير الطلب، حدّث الصفحة ثم أعد المحاولة" });
    return;
  }
  res.json(await enrichRequest(row, { includeContact: true }));
});

router.get("/admin/requests/deleted", async (req, res): Promise<void> => {
  const actor = await requireAdminRequestActor(req, res);
  if (!actor) return;

  const rows = await db
    .select()
    .from(requestsTable)
    .where(isNotNull(requestsTable.deletedAt))
    .orderBy(desc(requestsTable.deletedAt));
  res.json(await Promise.all(rows.map((row) => enrichRequest(row, { includeContact: true }))));
});

router.get("/admin/requests/:id/history", async (req, res): Promise<void> => {
  const actor = await requireAdminRequestActor(req, res);
  if (!actor) return;
  const params = GetRequestParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [request] = await db.select({ id: requestsTable.id }).from(requestsTable).where(
    eq(requestsTable.id, params.data.id),
  );
  if (!request) {
    requestNotFound(res);
    return;
  }

  const events = await db
    .select()
    .from(requestLifecycleEventsTable)
    .where(eq(requestLifecycleEventsTable.requestId, request.id))
    .orderBy(desc(requestLifecycleEventsTable.createdAt));
  res.json(events.map(presentRequestLifecycleEvent));
});

router.post("/admin/requests/:id/restore", async (req, res): Promise<void> => {
  const actor = await requireAdminRequestActor(req, res);
  if (!actor) return;
  const params = GetRequestParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [existing] = await db.select().from(requestsTable).where(eq(requestsTable.id, params.data.id));
  if (!existing) {
    requestNotFound(res);
    return;
  }
  if (!existing.deletedAt) {
    res.status(400).json({ error: "هذا الطلب ليس مؤرشفاً" });
    return;
  }

  const row = await db.transaction(async (tx) => {
    const [restored] = await tx
      .update(requestsTable)
      .set({ deletedAt: null, deletedByUserId: null, deletedReason: null })
      .where(and(eq(requestsTable.id, existing.id), isNotNull(requestsTable.deletedAt)))
      .returning();
    if (!restored) return null;
    await tx.insert(requestLifecycleEventsTable).values(buildRequestLifecycleEventValues({
      requestId: restored.id,
      action: "restored",
      actor,
      metadata: { status: restored.status },
    }));
    return restored;
  });
  if (!row) {
    res.status(409).json({ error: "تمت استعادة الطلب بالفعل" });
    return;
  }
  res.json(await enrichRequest(row, { includeContact: true }));
});

export default router;