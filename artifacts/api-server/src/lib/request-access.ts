import type { Request, Response } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";

export type RequestActor = {
  id: number;
  userType: string;
  roles: string[];
  isVerified: boolean;
};

function parseRoles(roles: string | null, fallbackRole: string): string[] {
  if (!roles) return [fallbackRole];

  try {
    const parsed = JSON.parse(roles);
    return Array.isArray(parsed) && parsed.every((role) => typeof role === "string")
      ? parsed
      : [fallbackRole];
  } catch {
    return [fallbackRole];
  }
}

export async function requireRequestActor(
  req: Request,
  res: Response,
): Promise<RequestActor | null> {
  const userId = (req as Request & { session?: { userId?: number } }).session?.userId;
  if (!userId) {
    res.status(401).json({ error: "يلزم تسجيل الدخول لإجراء هذه العملية" });
    return null;
  }

  const [user] = await db
    .select({
      id: usersTable.id,
      userType: usersTable.userType,
      roles: usersTable.roles,
      isVerified: usersTable.isVerified,
      isBlocked: usersTable.isBlocked,
    })
    .from(usersTable)
    .where(eq(usersTable.id, userId));

  if (!user) {
    res.status(401).json({ error: "انتهت جلسة تسجيل الدخول" });
    return null;
  }

  if (user.isBlocked) {
    res.status(403).json({ error: "تم تعطيل حسابك، يرجى التواصل مع الإدارة" });
    return null;
  }

  return {
    id: user.id,
    userType: user.userType,
    roles: parseRoles(user.roles, user.userType),
    isVerified: user.isVerified,
  };
}

export function isAdminActor(actor: RequestActor): boolean {
  return actor.userType === "admin" && actor.isVerified;
}

export async function requireAdminRequestActor(
  req: Request,
  res: Response,
): Promise<RequestActor | null> {
  const actor = await requireRequestActor(req, res);
  if (!actor) return null;

  if (!isAdminActor(actor)) {
    res.status(403).json({ error: "هذه العملية متاحة للمدير فقط" });
    return null;
  }

  return actor;
}

export function actorHasRole(actor: RequestActor, role: "customer" | "helper"): boolean {
  return actor.userType === role || actor.roles.includes(role);
}