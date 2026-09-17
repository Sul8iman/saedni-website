import type { RequestActor } from "./request-access";

type RequestSecurityRecord = {
  customerId: number;
  helperId: number | null;
  status: string;
  deletedAt?: Date | null;
};

export type RequestPermission =
  | "create"
  | "edit"
  | "archive"
  | "accept"
  | "advance_status"
  | "complete"
  | "cancel";

export type RequestPermissionDecision =
  | { allowed: true }
  | { allowed: false; status: 401 | 403 | 400; error: string };

function actorHasRole(actor: RequestActor, role: "customer" | "helper"): boolean {
  return actor.userType === role || actor.roles.includes(role);
}

function isAdmin(actor: RequestActor): boolean {
  return actor.userType === "admin" && actor.isVerified;
}

function isCustomerOwner(actor: RequestActor, request: RequestSecurityRecord): boolean {
  return request.customerId === actor.id;
}

export function decideRequestPermission(input: {
  action: RequestPermission;
  actor: RequestActor | null;
  request?: RequestSecurityRecord;
  customerId?: number;
  helperId?: number;
}): RequestPermissionDecision {
  const { action, actor, request } = input;
  if (!actor) {
    return { allowed: false, status: 401, error: "يلزم تسجيل الدخول لإجراء هذه العملية" };
  }

  if (action === "create") {
    return actorHasRole(actor, "customer") && actor.id === input.customerId
      ? { allowed: true }
      : { allowed: false, status: 403, error: "لا يمكنك إنشاء طلب باسم مستخدم آخر" };
  }

  if (!request) {
    return { allowed: false, status: 400, error: "بيانات الطلب غير مكتملة" };
  }

  if (action === "accept") {
    return actorHasRole(actor, "helper") && actor.id === input.helperId
      ? { allowed: true }
      : { allowed: false, status: 403, error: "لا يمكنك قبول الطلب باسم مساعد آخر" };
  }

  if (action === "advance_status") {
    return actorHasRole(actor, "helper") && request.helperId === actor.id
      ? { allowed: true }
      : { allowed: false, status: 403, error: "هذه العملية متاحة للمساعد المعين فقط" };
  }

  if (!isAdmin(actor) && !isCustomerOwner(actor, request)) {
    return { allowed: false, status: 403, error: "لا يمكنك إجراء عملية على طلب مستخدم آخر" };
  }

  if (action === "edit" && request.status !== "available" && !isAdmin(actor)) {
    return { allowed: false, status: 400, error: "لا يمكن تعديل الطلب بعد قبوله" };
  }

  if (
    action === "archive" &&
    !isAdmin(actor) &&
    (request.status === "accepted" || request.status === "in_progress")
  ) {
    return { allowed: false, status: 400, error: "لا يمكن أرشفة طلب نشط بعد قبوله" };
  }

  if (
    (action === "complete" || action === "cancel") &&
    (request.status === "completed" || request.status === "cancelled")
  ) {
    return { allowed: false, status: 400, error: "هذا الطلب منتهٍ بالفعل" };
  }

  return { allowed: true };
}

export function isVisibleInDefaultRequestList(
  request: Pick<RequestSecurityRecord, "deletedAt">,
): boolean {
  return request.deletedAt == null;
}