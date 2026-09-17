import { logger } from "./logger";
import {
  assertSafeTestOutboundEnvironment,
  isTestEnvironment,
} from "@workspace/db/test-safety";

const GRAPH_API_VERSION = "v20.0";
const GRAPH_API_BASE = "https://graph.facebook.com";

function maskPhone(phone: string): string {
  if (phone.length <= 6) return "***";
  return phone.slice(0, 3) + "****" + phone.slice(-3);
}

export interface WhatsAppOtpResult {
  success: boolean;
  error?: string;
}

export interface WhatsAppTemplateResult {
  success: boolean;
  error?: string;
}

const SAEDNI_HELPER_WELCOME_TEMPLATE = "saedni_helper_welcome";
const SAEDNI_ARABIC_LANGUAGE_CODE = "ar";

/**
 * Send a 6-digit OTP via the Meta Cloud API using the saedni_otp authentication template.
 * Never logs the OTP value itself.
 */
export async function sendWhatsAppOtp(
  phone: string,
  otp: string,
  userType: string,
): Promise<WhatsAppOtpResult> {
  if (isTestEnvironment()) {
    assertSafeTestOutboundEnvironment();
    logger.info({ maskedPhone: maskPhone(phone), userType }, "whatsapp: OTP mocked in test environment");
    return { success: true };
  }

  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!accessToken || !phoneNumberId) {
    logger.warn(
      { maskedPhone: maskPhone(phone), userType },
      "whatsapp: env vars missing — WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID not set",
    );
    return { success: false, error: "WhatsApp configuration missing" };
  }

  const url = `${GRAPH_API_BASE}/${GRAPH_API_VERSION}/${phoneNumberId}/messages`;

  const payload = {
    messaging_product: "whatsapp",
    to: phone,
    type: "template",
    template: {
      name: "saedni_otp",
      language: { code: "ar" },
      components: [
        {
          type: "body",
          parameters: [{ type: "text", text: otp }],
        },
        {
          type: "button",
          sub_type: "url",
          index: "0",
          parameters: [{ type: "text", text: otp }],
        },
      ],
    },
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      logger.info(
        { maskedPhone: maskPhone(phone), userType, httpStatus: res.status },
        "whatsapp: OTP sent successfully",
      );
      return { success: true };
    }

    // Parse error without logging sensitive data
    const body: unknown = await res.json().catch(() => null);
    const errMsg =
      typeof body === "object" && body !== null && "error" in body
        ? String((body as Record<string, unknown>).error)
        : `HTTP ${res.status}`;

    logger.warn(
      { maskedPhone: maskPhone(phone), userType, httpStatus: res.status, apiError: errMsg },
      "whatsapp: OTP delivery failed",
    );
    return { success: false, error: errMsg };
  } catch (err) {
    logger.warn(
      { maskedPhone: maskPhone(phone), userType, err },
      "whatsapp: network error sending OTP",
    );
    return { success: false, error: "Network error" };
  }
}

/**
 * Send the approved first-activation welcome template.
 *
 * The approved template contains the channel URL in its body, so this request
 * intentionally has no components and no CTA button. The caller owns
 * idempotency and must only call this after the helper is activated.
 */
export async function sendHelperWelcomeTemplate(
  phone: string,
): Promise<WhatsAppTemplateResult> {
  if (isTestEnvironment()) {
    assertSafeTestOutboundEnvironment();
    logger.info({ maskedPhone: maskPhone(phone) }, "whatsapp: welcome template mocked in test environment");
    return { success: true };
  }

  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!accessToken || !phoneNumberId) {
    logger.warn(
      { maskedPhone: maskPhone(phone) },
      "whatsapp: welcome template not sent — configuration missing",
    );
    return { success: false, error: "WhatsApp configuration missing" };
  }

  const url = `${GRAPH_API_BASE}/${GRAPH_API_VERSION}/${phoneNumberId}/messages`;
  const payload = {
    messaging_product: "whatsapp",
    to: phone,
    type: "template",
    template: {
      name: SAEDNI_HELPER_WELCOME_TEMPLATE,
      language: { code: SAEDNI_ARABIC_LANGUAGE_CODE },
    },
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      logger.info(
        { maskedPhone: maskPhone(phone), httpStatus: res.status },
        "whatsapp: helper welcome template accepted",
      );
      return { success: true };
    }

    // Keep provider details out of logs. The phone is already masked and the
    // bearer token is never included in structured log fields.
    logger.warn(
      { maskedPhone: maskPhone(phone), httpStatus: res.status },
      "whatsapp: helper welcome template rejected",
    );
    return { success: false, error: `HTTP ${res.status}` };
  } catch {
    logger.warn(
      { maskedPhone: maskPhone(phone) },
      "whatsapp: network error sending helper welcome template",
    );
    return { success: false, error: "Network error" };
  }
}
