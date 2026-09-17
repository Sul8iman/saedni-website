export const ADMIN_EVENT_TYPES = {
  newCustomer: "new_customer",
  newHelper: "new_helper",
  newRequest: "new_request",
} as const;

export type AdminEventType = (typeof ADMIN_EVENT_TYPES)[keyof typeof ADMIN_EVENT_TYPES];

export interface AdminEventNotification {
  eventKey: string;
  type: AdminEventType;
  title: string;
  body: string;
  userId: number | null;
  userName: string | null;
  phone: string;
  userType: string;
  pushData: Record<string, unknown>;
}

export interface AdminEventDispatchDependencies {
  create: (event: AdminEventNotification) => Promise<number | null>;
  push: (notificationId: number, event: AdminEventNotification) => Promise<void>;
  onRecordError?: (error: unknown, event: AdminEventNotification) => void;
  onPushError?: (error: unknown, notificationId: number, event: AdminEventNotification) => void;
}

const CATEGORY_AR: Record<string, string> = {
  transport: "شاحنة للنقل",
  delivery: "مندوب توصيل",
  government: "معاملات ومراجعات",
  shopping: "شراء أغراض",
  home_services: "خدمات منزلية",
  labor: "أخرى",
};

export function getCategoryLabel(category: string): string {
  return CATEGORY_AR[category] ?? category;
}

export function buildNewUserAdminEvent(input: {
  userId: number;
  name: string;
  phone: string;
  userType: "customer" | "helper";
}): AdminEventNotification {
  const isHelper = input.userType === "helper";
  const type = isHelper ? ADMIN_EVENT_TYPES.newHelper : ADMIN_EVENT_TYPES.newCustomer;
  const label = isHelper ? "مساعد" : "عميل";

  return {
    eventKey: `${type}:${input.userId}`,
    type,
    title: `${label} جديد`,
    body: `تم تسجيل ${label} جديد${input.name ? `: ${input.name}` : ""} في ساعدني.`,
    userId: input.userId,
    userName: input.name || null,
    phone: input.phone,
    userType: input.userType,
    pushData: {
      notificationType: type,
      userId: input.userId,
    },
  };
}

export function buildNewRequestAdminEvent(input: {
  requestId: number;
  category: string;
  area: string;
  customerId: number;
  customerName: string;
  customerPhone: string;
}): AdminEventNotification {
  const categoryLabel = getCategoryLabel(input.category);

  return {
    eventKey: `${ADMIN_EVENT_TYPES.newRequest}:${input.requestId}`,
    type: ADMIN_EVENT_TYPES.newRequest,
    title: "طلب جديد",
    body: `طلب جديد: ${categoryLabel} - ${input.area}`,
    userId: input.customerId,
    userName: input.customerName || null,
    phone: input.customerPhone,
    userType: "customer",
    pushData: {
      notificationType: ADMIN_EVENT_TYPES.newRequest,
      requestId: input.requestId,
      category: input.category,
      area: input.area,
    },
  };
}

export async function dispatchAdminEvent(
  event: AdminEventNotification,
  dependencies: AdminEventDispatchDependencies,
): Promise<number | null> {
  let notificationId: number | null;

  try {
    notificationId = await dependencies.create(event);
  } catch (error) {
    dependencies.onRecordError?.(error, event);
    return null;
  }

  if (notificationId == null) {
    return null;
  }

  void dependencies.push(notificationId, event).catch((error) => {
    dependencies.onPushError?.(error, notificationId, event);
  });

  return notificationId;
}