import { Router, type IRouter } from "express";
import { and, avg, count, eq } from "drizzle-orm";
import { db, helperRatingsTable, usersTable } from "@workspace/db";
import {
  GetUserParams,
  ListUserAreaCountsQueryParams,
  UpdateUserParams,
  UpdateUserBody,
  ListUsersQueryParams,
} from "@workspace/api-zod";
import { isAdminActor, requireRequestActor } from "../lib/request-access";
import {
  ACTIVE_SERVICE_AREAS,
  countHelpersByArea,
  isActiveServiceArea,
  matchesUserAreaFilter,
  normalizeBooleanQuery,
  normalizeAreaQuery,
  parsePreferredAreas,
  validatePreferredAreas,
} from "../lib/service-areas";

const router: IRouter = Router();

async function safeUser(user: typeof usersTable.$inferSelect) {
  const {
    passwordHash: _,
    helperActivationCodeHash: __,   // never expose hash to any client
    authToken: ___,
    otpCode: ____,
    ...safe
  } = user;
  const [ratingAggregate] = await db
    .select({ average: avg(helperRatingsTable.stars), count: count() })
    .from(helperRatingsTable)
    .where(eq(helperRatingsTable.helperId, user.id));
  const ratingCount = Number(ratingAggregate?.count ?? 0);
  const average = ratingAggregate?.average == null ? user.rating : Number(ratingAggregate.average);

  return {
    ...safe,
    rating: average,
    ratingCount,
    serviceAreas: parsePreferredAreas(user.preferredAreas),
    isActive: !safe.isBlocked,
    createdAt: safe.createdAt.toISOString(),
    lastLogin: safe.lastLogin?.toISOString() ?? null,
    otpCreatedAt: safe.otpCreatedAt?.toISOString() ?? null,
    helperActivationCodeCreatedAt: safe.helperActivationCodeCreatedAt?.toISOString() ?? null,
    helperActivationCodeUsedAt: safe.helperActivationCodeUsedAt?.toISOString() ?? null,
  };
}

router.get("/service-areas", async (_req, res): Promise<void> => {
  res.json(ACTIVE_SERVICE_AREAS.map((area) => ({ ...area, isActive: true })));
});

// GET /users/area-counts
router.get("/users/area-counts", async (req, res): Promise<void> => {
  const actor = await requireRequestActor(req, res);
  if (!actor) return;
  if (!isAdminActor(actor)) {
    res.status(403).json({ error: "هذه العملية متاحة للمدير فقط" });
    return;
  }

  const parsed = ListUserAreaCountsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const statusFilter = parsed.data.status;
  const statusCondition = statusFilter === "active"
    ? eq(usersTable.isBlocked, false)
    : statusFilter === "blocked"
      ? eq(usersTable.isBlocked, true)
      : undefined;
  const customerWhere = statusCondition
    ? and(eq(usersTable.userType, "customer"), statusCondition)
    : eq(usersTable.userType, "customer");
  const helperWhere = statusCondition
    ? and(eq(usersTable.userType, "helper"), statusCondition)
    : eq(usersTable.userType, "helper");

  const [customerRows, helperRows] = await Promise.all([
    db
      .select({ area: usersTable.area, count: count() })
      .from(usersTable)
      .where(customerWhere)
      .groupBy(usersTable.area),
    db
      .select({ id: usersTable.id, preferredAreas: usersTable.preferredAreas })
      .from(usersTable)
      .where(helperWhere),
  ]);

  const helperCounts = countHelpersByArea(helperRows);
  const customerCounts = new Map(
    customerRows
      .filter((row) => row.area !== null && isActiveServiceArea(row.area))
      .map((row) => [row.area as string, Number(row.count)]),
  );
  const totalCustomerCount = customerRows.reduce((total, row) => total + Number(row.count), 0);
  const noAreaCustomerCount = customerRows
    .filter((row) => !isActiveServiceArea(row.area))
    .reduce((total, row) => total + Number(row.count), 0);

  res.json({
    areas: ACTIVE_SERVICE_AREAS.map(({ name }) => ({
      area: name,
      helperCount: helperCounts.counts.get(name) ?? 0,
      customerCount: customerCounts.get(name) ?? 0,
    })),
    totalHelperCount: helperCounts.totalCount,
    totalCustomerCount,
    noAreaHelperCount: helperCounts.noAreaCount,
    noAreaCustomerCount,
  });
});

// GET /users
router.get("/users", async (req, res): Promise<void> => {
  const actor = await requireRequestActor(req, res);
  if (!actor) return;
  if (!isAdminActor(actor)) {
    res.status(403).json({ error: "هذه العملية متاحة للمدير فقط" });
    return;
  }

  const parsed = ListUsersQueryParams.safeParse({
    ...req.query,
    area: normalizeAreaQuery(req.query.area),
    isActive: normalizeBooleanQuery(req.query.isActive),
  });
  const params = parsed.success ? parsed.data : {};

  const rows = await db
    .select()
    .from(usersTable)
    .where(params.userType ? eq(usersTable.userType, params.userType) : undefined);
  const selectedAreas = params.area ?? [];
  const search = params.search?.trim().toLowerCase();
  const filtered = rows.filter((user) => {
    if (params.isActive !== undefined && (!user.isBlocked) !== params.isActive) return false;
    if (search && !`${user.name} ${user.phone}`.toLowerCase().includes(search)) return false;

    return matchesUserAreaFilter(user, selectedAreas, params.includeNoArea === true);
  });
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? 100;
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);
  res.json(await Promise.all(paged.map(safeUser)));
});

// GET /users/:id
router.get("/users/:id", async (req, res): Promise<void> => {
  const params = GetUserParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const actor = await requireRequestActor(req, res);
  if (!actor) return;
  if (!isAdminActor(actor) && actor.id !== params.data.id) {
    res.status(403).json({ error: "لا يمكنك عرض بيانات مستخدم آخر" });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, params.data.id));

  if (!user) {
    res.status(404).json({ error: "المستخدم غير موجود" });
    return;
  }

  res.json(await safeUser(user));
});

// PATCH /users/:id
router.patch("/users/:id", async (req, res): Promise<void> => {
  const params = UpdateUserParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const actor = await requireRequestActor(req, res);
  if (!actor) return;
  const isAdmin = isAdminActor(actor);
  if (!isAdmin && actor.id !== params.data.id) {
    res.status(403).json({ error: "لا يمكنك تعديل بيانات مستخدم آخر" });
    return;
  }

  const parsed = UpdateUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Translate isActive → isBlocked for storage
  const { isActive, serviceAreas, ...rest } = parsed.data as {
    isActive?: boolean;
    name?: string;
    area?: string | null;
    helperInterests?: string | null;
    preferredAreas?: string | null;
    serviceAreas?: string[];
  };
  if (rest.area !== undefined && rest.area !== null && !isActiveServiceArea(rest.area)) {
    res.status(400).json({ error: "المنطقة غير متاحة للاختيار الجديد" });
    return;
  }
  if (serviceAreas !== undefined) {
    const validated = validatePreferredAreas(serviceAreas);
    if (!validated) {
      res.status(400).json({ error: "اختر منطقة خدمة واحدة على الأقل من مناطق مسقط" });
      return;
    }
    rest.preferredAreas = JSON.stringify(validated);
  } else if (rest.preferredAreas !== undefined && rest.preferredAreas !== null) {
    let decoded: unknown;
    try {
      decoded = JSON.parse(rest.preferredAreas);
    } catch {
      res.status(400).json({ error: "قائمة مناطق الخدمة غير صالحة" });
      return;
    }
    const validated = validatePreferredAreas(decoded);
    if (!validated) {
      res.status(400).json({ error: "اختر منطقة خدمة واحدة على الأقل من مناطق مسقط" });
      return;
    }
    rest.preferredAreas = JSON.stringify(validated);
  }
  const updates: Record<string, unknown> = { ...rest };
  if (isActive !== undefined) {
    if (!isAdmin) {
      res.status(403).json({ error: "لا يمكنك تغيير حالة الحساب" });
      return;
    }
    updates.isBlocked = !isActive;
  }

  const [user] = await db
    .update(usersTable)
    .set(updates)
    .where(eq(usersTable.id, params.data.id))
    .returning();

  if (!user) {
    res.status(404).json({ error: "المستخدم غير موجود" });
    return;
  }

  res.json(await safeUser(user));
});

export default router;
