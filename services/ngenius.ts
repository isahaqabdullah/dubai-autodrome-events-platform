import "server-only";
import { createDecipheriv } from "node:crypto";
import { env, getNgeniusConfig } from "@/lib/env";
import { buildAbsoluteUrl } from "@/lib/utils";

interface TokenCache {
  token: string;
  expiresAt: number;
}

let tokenCache: TokenCache | null = null;
let tokenRequestPromise: Promise<string> | null = null;
const NGENIUS_REQUEST_TIMEOUT_MS = 20_000;

export class NgeniusApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly responseText: string
  ) {
    super(message);
    this.name = "NgeniusApiError";
  }
}

export interface NgeniusOrderItem {
  name: string;
  quantity: number;
  amountMinor: number;
}

export interface NgeniusCreateOrderInput {
  bookingIntentId: string;
  paymentAttemptId: string;
  eventId: string;
  merchantOrderReference: string;
  amountMinor: number;
  currencyCode: string;
  emailAddress: string;
  firstName: string;
  lastName: string;
  items: NgeniusOrderItem[];
  checkoutToken: string;
}

export interface NgeniusCreateOrderResult {
  orderReference: string;
  paymentHref: string;
  raw: Record<string, unknown>;
}

export interface NgeniusPaymentState {
  kind: "paid" | "failed" | "cancelled" | "pending" | "manual_review";
  state: string | null;
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function ngeniusTimingEnabled() {
  return process.env.CHECKOUT_TIMING_LOGS === "1" || process.env.CHECKOUT_TIMING_LOGS === "true";
}

async function fetchWithTimeout(url: string, init: RequestInit, label: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, NGENIUS_REQUEST_TIMEOUT_MS);
  const startedAt = Date.now();

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal
    });
    if (ngeniusTimingEnabled()) {
      console.info("[checkout-timing] ngenius.fetch", {
        label,
        status: response.status,
        durationMs: Date.now() - startedAt
      });
    }
    return response;
  } catch (error) {
    if (ngeniusTimingEnabled()) {
      console.info("[checkout-timing] ngenius.fetch.error", {
        label,
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`N-Genius ${label} timed out after ${NGENIUS_REQUEST_TIMEOUT_MS / 1000} seconds.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function requestAccessToken(options: { forceRefresh?: boolean } = {}) {
  const config = getNgeniusConfig();
  const now = Date.now();

  if (options.forceRefresh) {
    tokenCache = null;
  }

  if (!options.forceRefresh && tokenCache && tokenCache.expiresAt - 30_000 > now) {
    if (ngeniusTimingEnabled()) {
      console.info("[checkout-timing] ngenius.token_cache_hit", {
        expiresInMs: tokenCache.expiresAt - now
      });
    }
    return tokenCache.token;
  }

  if (tokenRequestPromise) {
    return tokenRequestPromise;
  }

  tokenRequestPromise = (async () => {
    const response = await fetchWithTimeout(`${trimTrailingSlash(config.apiBaseUrl)}/identity/auth/access-token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${config.apiKey}`,
        "Content-Type": "application/vnd.ni-identity.v1+json"
      }
    }, "token request");

    if (!response.ok) {
      throw new Error(`N-Genius token request failed with ${response.status}`);
    }

    const payload = (await response.json()) as { access_token?: string; expires_in?: number };
    if (!payload.access_token) {
      throw new Error("N-Genius token response did not include access_token.");
    }

    tokenCache = {
      token: payload.access_token,
      expiresAt: Date.now() + (payload.expires_in ?? 300) * 1000
    };

    return payload.access_token;
  })();

  try {
    return await tokenRequestPromise;
  } finally {
    tokenRequestPromise = null;
  }
}

export async function prefetchNgeniusAccessToken() {
  await requestAccessToken();
}

async function ngeniusFetch(path: string, init: RequestInit = {}) {
  const config = getNgeniusConfig();
  const makeRequest = async (forceRefresh = false) => {
    const token = await requestAccessToken({ forceRefresh });
    return fetchWithTimeout(`${trimTrailingSlash(config.apiBaseUrl)}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.ni-payment.v2+json",
        "Content-Type": "application/vnd.ni-payment.v2+json",
        ...(init.headers ?? {})
      }
    }, "API request");
  };

  let response = await makeRequest();
  if (response.status === 401) {
    response = await makeRequest(true);
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new NgeniusApiError(
      `N-Genius request failed with ${response.status}: ${text.slice(0, 500)}`,
      response.status,
      text
    );
  }

  return response.json() as Promise<Record<string, unknown>>;
}

function getPaymentHref(order: Record<string, unknown>) {
  const links = order._links as Record<string, unknown> | undefined;
  const payment = links?.payment as { href?: string } | undefined;
  return payment?.href ?? null;
}

function getOrderReference(order: Record<string, unknown>) {
  const reference = order.reference;
  return typeof reference === "string" ? reference : null;
}

export function buildNgeniusOrderSummary(input: {
  currencyCode: string;
  amountMinor: number;
  items: NgeniusOrderItem[];
}) {
  return {
    total: {
      currencyCode: input.currencyCode,
      value: input.amountMinor
    },
    items: input.items.map((item) => ({
      category: "Tickets",
      description: item.name,
      quantity: item.quantity,
      totalPrice: {
        currencyCode: input.currencyCode,
        value: item.amountMinor
      }
    }))
  };
}

export async function createNgeniusOrder(input: NgeniusCreateOrderInput): Promise<NgeniusCreateOrderResult> {
  const config = getNgeniusConfig();
  const redirectUrl = buildAbsoluteUrl(
    env.APP_URL,
    `/checkout/return?token=${encodeURIComponent(input.checkoutToken)}`
  );
  const cancelUrl = buildAbsoluteUrl(
    env.APP_URL,
    `/checkout/return?cancelled=1&token=${encodeURIComponent(input.checkoutToken)}`
  );

  const payload = {
    action: "PURCHASE",
    amount: {
      currencyCode: input.currencyCode,
      value: input.amountMinor
    },
    emailAddress: input.emailAddress,
    billingAddress: {
      firstName: input.firstName,
      lastName: input.lastName
    },
    merchantAttributes: {
      redirectUrl,
      cancelUrl,
      skipConfirmationPage: true
    },
    merchantOrderReference: input.merchantOrderReference,
    merchantDefinedData: {
      bookingIntentId: input.bookingIntentId,
      paymentAttemptId: input.paymentAttemptId,
      eventId: input.eventId,
      environment: config.environment,
      schemaVersion: "20260424120000"
    },
    paymentAttempts: 1,
    categorizedOrderSummary: true,
    orderSummary: buildNgeniusOrderSummary({
      currencyCode: input.currencyCode,
      amountMinor: input.amountMinor,
      items: input.items
    })
  };

  const order = await ngeniusFetch(`/transactions/outlets/${config.outletRef}/orders`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
  const orderReference = getOrderReference(order);
  const paymentHref = getPaymentHref(order);

  if (!orderReference || !paymentHref) {
    throw new Error("N-Genius create-order response is missing reference or payment link.");
  }

  return { orderReference, paymentHref, raw: order };
}

export async function getNgeniusOrder(orderReference: string) {
  const config = getNgeniusConfig();
  return ngeniusFetch(`/transactions/outlets/${config.outletRef}/orders/${encodeURIComponent(orderReference)}`, {
    method: "GET"
  });
}

function getEmbeddedPayments(order: Record<string, unknown>) {
  const embedded = order._embedded as Record<string, unknown> | undefined;
  const payments = embedded?.payment ?? embedded?.payments;
  if (Array.isArray(payments)) {
    return payments as Array<Record<string, unknown>>;
  }
  return payments && typeof payments === "object" ? [payments as Record<string, unknown>] : [];
}

function getNgeniusStates(order: Record<string, unknown>) {
  const states = getEmbeddedPayments(order)
    .map((payment) => payment.state)
    .filter((state): state is string => typeof state === "string");
  const orderState = typeof order.state === "string" ? order.state : null;
  return orderState ? [...states, orderState] : states;
}

export function interpretNgeniusOrder(order: Record<string, unknown>): NgeniusPaymentState {
  const states = getNgeniusStates(order);
  const hasState = (candidates: string[]) => states.find((state) => candidates.includes(state));
  const paymentState =
    hasState(["PURCHASED"]) ??
    hasState(["CAPTURED"]) ??
    hasState(["PURCHASE_REVERSED", "REFUNDED", "PARTIALLY_REFUNDED"]) ??
    hasState(["PURCHASE_DECLINED", "PURCHASE_FAILED", "DECLINED", "AUTHORISATION_FAILED", "FAILED"]) ??
    hasState(["CANCELLED"]) ??
    states[0] ??
    null;

  switch (paymentState) {
    case "PURCHASED":
      return { kind: "paid", state: paymentState };
    case "CAPTURED":
      return { kind: "manual_review", state: paymentState };
    case "PURCHASE_DECLINED":
    case "PURCHASE_FAILED":
    case "DECLINED":
    case "AUTHORISATION_FAILED":
    case "FAILED":
      return { kind: "failed", state: paymentState };
    case "CANCELLED":
      return { kind: "cancelled", state: paymentState };
    case "PURCHASE_REVERSED":
    case "REFUNDED":
    case "PARTIALLY_REFUNDED":
      return { kind: "manual_review", state: paymentState };
    default:
      return { kind: "pending", state: paymentState ?? null };
  }
}

export function getNgeniusOrderAmount(order: Record<string, unknown>) {
  const amount = order.amount as { value?: unknown; currencyCode?: unknown } | undefined;
  return {
    value: typeof amount?.value === "number" ? amount.value : null,
    currencyCode: typeof amount?.currencyCode === "string" ? amount.currencyCode : null
  };
}

export function decryptNgeniusWebhookBody(rawBody: string, key: string) {
  const buffer = Buffer.from(rawBody, "base64");
  if (buffer.length <= 16) {
    throw new Error("Encrypted webhook payload is too short.");
  }

  const iv = buffer.subarray(0, 16);
  const encrypted = buffer.subarray(16);
  const decipher = createDecipheriv("aes-256-cbc", Buffer.from(key, "utf8"), iv);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

export function getWebhookEventName(payload: Record<string, unknown>) {
  return typeof payload.eventName === "string" ? payload.eventName : null;
}

export function getWebhookOrderReference(payload: Record<string, unknown>) {
  const order = payload.order as Record<string, unknown> | undefined;
  const reference = order?.reference;
  return typeof reference === "string" ? reference : null;
}
