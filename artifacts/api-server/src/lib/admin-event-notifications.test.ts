import assert from "node:assert/strict";
import test from "node:test";
import {
  ADMIN_EVENT_TYPES,
  buildNewRequestAdminEvent,
  buildNewUserAdminEvent,
  dispatchAdminEvent,
} from "./admin-event-notifications.ts";

test("builds a safe new-customer notification", () => {
  const event = buildNewUserAdminEvent({
    userId: 21,
    name: "أحمد",
    phone: "96890000000",
    userType: "customer",
  });

  assert.deepEqual(event, {
    eventKey: "new_customer:21",
    type: ADMIN_EVENT_TYPES.newCustomer,
    title: "عميل جديد",
    body: "تم تسجيل عميل جديد: أحمد في ساعدني.",
    userId: 21,
    userName: "أحمد",
    phone: "96890000000",
    userType: "customer",
    pushData: {
      notificationType: ADMIN_EVENT_TYPES.newCustomer,
      userId: 21,
    },
  });
});

test("builds exactly one helper-registration event shape", () => {
  const event = buildNewUserAdminEvent({
    userId: 22,
    name: "محمد",
    phone: "96890000001",
    userType: "helper",
  });

  assert.equal(event.eventKey, "new_helper:22");
  assert.equal(event.type, ADMIN_EVENT_TYPES.newHelper);
  assert.equal(event.title, "مساعد جديد");
  assert.equal(event.body, "تم تسجيل مساعد جديد: محمد في ساعدني.");
  assert.equal(event.userType, "helper");
});

test("builds a request notification without request details or customer phone in the body", () => {
  const event = buildNewRequestAdminEvent({
    requestId: 33,
    category: "transport",
    area: "بوشر",
    customerId: 21,
    customerName: "أحمد",
    customerPhone: "96890000000",
  });

  assert.equal(event.eventKey, "new_request:33");
  assert.equal(event.type, ADMIN_EVENT_TYPES.newRequest);
  assert.equal(event.title, "طلب جديد");
  assert.equal(event.body, "طلب جديد: شاحنة للنقل - بوشر");
  assert.equal(event.body.includes("96890000000"), false);
  assert.equal(event.body.includes("أحمد"), false);
});

test("suppresses a repeated event key after the notification record exists", async () => {
  const event = buildNewUserAdminEvent({
    userId: 44,
    name: "سالم",
    phone: "96890000002",
    userType: "helper",
  });
  const eventKeys = new Set<string>();
  let pushCalls = 0;

  const dependencies = {
    create: async (input: typeof event) => {
      if (eventKeys.has(input.eventKey)) return null;
      eventKeys.add(input.eventKey);
      return 99;
    },
    push: async () => {
      pushCalls++;
    },
  };

  assert.equal(await dispatchAdminEvent(event, dependencies), 99);
  assert.equal(await dispatchAdminEvent(event, dependencies), null);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(pushCalls, 1);
});

test("keeps notification-record and push failures non-fatal", async () => {
  const event = buildNewRequestAdminEvent({
    requestId: 55,
    category: "delivery",
    area: "السيب",
    customerId: 24,
    customerName: "خالد",
    customerPhone: "96890000003",
  });

  let recordErrors = 0;
  let pushErrors = 0;

  assert.equal(
    await dispatchAdminEvent(event, {
      create: async () => {
        throw new Error("database unavailable");
      },
      push: async () => {},
      onRecordError: () => {
        recordErrors++;
      },
    }),
    null,
  );
  assert.equal(recordErrors, 1);

  assert.equal(
    await dispatchAdminEvent(event, {
      create: async () => 100,
      push: async () => {
        throw new Error("Expo unavailable");
      },
      onPushError: () => {
        pushErrors++;
      },
    }),
    100,
  );
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(pushErrors, 1);
});