import { createHash, createHmac, randomUUID } from "node:crypto";

// Deep module: small interface, all of AllScale's HMAC + canonical-string +
// JSON-envelope plumbing locked inside. Callers ask "create a $10 checkout
// intent for this user" and get back a checkout URL. Everything else is
// internal — including the v1=… signature format, the exact body-hash
// algorithm, and the error-envelope shape — so if AllScale changes the
// signing scheme we update one file. See `allscaleClient.test.ts` for the
// signing contract (fixtures cross-checked against the AllScale docs).

export interface SignRequestInput {
  apiKey: string;
  apiSecret: string;
  method: string;
  // Path is the URL path WITHOUT host or query string, e.g. "/v1/checkout_intents/".
  path: string;
  // Raw query string, no leading "?". Empty string for no query.
  query: string;
  // Raw body bytes — exactly what gets sent on the wire. Empty string for
  // bodyless requests; AllScale hashes the empty string in that case.
  body: string;
  // Unix seconds.
  timestamp: number;
  // Unique per request (UUID is fine).
  nonce: string;
}

export interface AllScaleSignedHeaders {
  "X-API-Key": string;
  "X-Timestamp": string;
  "X-Nonce": string;
  "X-Signature": string;
}

// Canonical string per docs/api-reference/api-doc-auth.md:
//   METHOD \n PATH \n QUERY_STRING \n TIMESTAMP \n NONCE \n BODY_SHA256
// where BODY_SHA256 is the hex-encoded SHA-256 of the raw body bytes
// (empty string hashes to e3b0c4…). Signature is base64-encoded
// HMAC-SHA256(api_secret, canonical) and travels as "X-Signature: v1=<sig>".
export function signRequest(input: SignRequestInput): AllScaleSignedHeaders {
  const bodyHash = createHash("sha256").update(input.body, "utf8").digest("hex");
  const canonical = [
    input.method.toUpperCase(),
    input.path,
    input.query,
    String(input.timestamp),
    input.nonce,
    bodyHash,
  ].join("\n");

  const signature = createHmac("sha256", input.apiSecret)
    .update(canonical, "utf8")
    .digest("base64");

  return {
    "X-API-Key": input.apiKey,
    "X-Timestamp": String(input.timestamp),
    "X-Nonce": input.nonce,
    "X-Signature": `v1=${signature}`,
  };
}

export interface CreateCheckoutIntentInput {
  // Integer "cents". For fiat (currency=1 USD), 1000 = $10.00. For native
  // stable-coin pricing, 1000 = 10.00 USDT/USDC. AllScale requires the
  // resulting coin amount to be greater than 0.1 — orders at or below the
  // floor are rejected with code 50002.
  amountCents: number;
  // Fiat IntEnum from AllScale Appendix A. 1 = USD. Set exactly one of
  // {currency, stableCoin}; sending both, or neither, is a 10001 validation
  // error per the AllScale spec, and we pre-check it client-side.
  currency?: number;
  // Native stable-coin IntEnum: 1 = USDT, 2 = USDC.
  stableCoin?: number;
  orderId?: string;
  redirectUrl?: string;
  orderDescription?: string;
  userId?: string;
  userName?: string;
  extra?: Record<string, unknown>;
  acceptedStableCoins?: number[];
}

export interface CheckoutIntent {
  checkoutUrl: string;
  intentId: string;
  amountCoins: string;
  stableCoinType: number;
  rate: string | null;
  acceptedStableCoins: number | null;
  requestId?: string;
}

export interface AllScaleClientDeps {
  apiKey: string;
  apiSecret: string;
  baseUrl: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
  newNonce?: () => string;
  // Tests use this to assert input-validation rejections without ever
  // touching the (un-stubbed) fetch.
  skipNetwork?: boolean;
}

export class AllScaleError extends Error {
  readonly name = "AllScaleError";
  readonly code: number;
  readonly details?: unknown;
  readonly requestId?: string;
  readonly httpStatus?: number;

  constructor(args: {
    code: number;
    message: string;
    details?: unknown;
    requestId?: string;
    httpStatus?: number;
  }) {
    super(args.message);
    this.code = args.code;
    this.details = args.details;
    this.requestId = args.requestId;
    this.httpStatus = args.httpStatus;
  }
}

interface AllScaleEnvelope<T> {
  code: number;
  payload: T | null;
  error: { message: string; details?: unknown } | null;
  request_id?: string;
}

interface CheckoutIntentPayload {
  checkout_url: string;
  allscale_checkout_intent_id: string;
  amount_coins: string;
  stable_coin_type: number;
  rate: string | null;
  accepted_stable_coins: number | null;
}

export async function createCheckoutIntent(
  input: CreateCheckoutIntentInput,
  deps: AllScaleClientDeps,
): Promise<CheckoutIntent> {
  // Pre-validate the mutual-exclusion rule client-side so callers don't burn
  // an API round-trip + a nonce to learn they sent malformed input. AllScale
  // returns 10001 for this case; we surface it as a plain Error before any
  // network or signing happens.
  const hasCurrency = typeof input.currency === "number";
  const hasStableCoin = typeof input.stableCoin === "number";
  if (hasCurrency === hasStableCoin) {
    throw new Error(
      "createCheckoutIntent: set exactly one of `currency` or `stableCoin` " +
        "(AllScale rejects requests with both, or neither, with code 10001).",
    );
  }

  if (deps.skipNetwork) {
    // Validation-only mode used by tests; should never be hit at runtime.
    throw new Error("skipNetwork is true but validation already passed");
  }

  const body: Record<string, unknown> = {
    amount_cents: input.amountCents,
  };
  if (hasCurrency) body.currency = input.currency;
  if (hasStableCoin) body.stable_coin = input.stableCoin;
  if (input.orderId !== undefined) body.order_id = input.orderId;
  if (input.redirectUrl !== undefined) body.redirect_url = input.redirectUrl;
  if (input.orderDescription !== undefined)
    body.order_description = input.orderDescription;
  if (input.userId !== undefined) body.user_id = input.userId;
  if (input.userName !== undefined) body.user_name = input.userName;
  if (input.extra !== undefined) body.extra = input.extra;
  if (input.acceptedStableCoins !== undefined)
    body.accepted_stable_coins = input.acceptedStableCoins;

  const rawBody = JSON.stringify(body);
  const path = "/v1/checkout_intents/";
  const timestamp = Math.floor((deps.now?.() ?? Date.now()) / 1000);
  const nonce = deps.newNonce?.() ?? randomUUID();

  const signed = signRequest({
    apiKey: deps.apiKey,
    apiSecret: deps.apiSecret,
    method: "POST",
    path,
    query: "",
    body: rawBody,
    timestamp,
    nonce,
  });

  const url = `${stripTrailingSlash(deps.baseUrl)}${path}`;
  const fetchFn = deps.fetchImpl ?? fetch;

  const response = await fetchFn(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...signed,
    },
    body: rawBody,
  });

  let envelope: AllScaleEnvelope<CheckoutIntentPayload> | null = null;
  try {
    envelope = (await response.json()) as AllScaleEnvelope<CheckoutIntentPayload>;
  } catch {
    throw new AllScaleError({
      code: -1,
      message: `AllScale returned non-JSON body (HTTP ${response.status})`,
      httpStatus: response.status,
    });
  }

  if (!envelope || envelope.code !== 0 || !envelope.payload) {
    throw new AllScaleError({
      code: envelope?.code ?? -1,
      message: envelope?.error?.message ?? "AllScale request failed",
      details: envelope?.error?.details,
      requestId: envelope?.request_id,
      httpStatus: response.status,
    });
  }

  const p = envelope.payload;
  return {
    checkoutUrl: p.checkout_url,
    intentId: p.allscale_checkout_intent_id,
    amountCoins: p.amount_coins,
    stableCoinType: p.stable_coin_type,
    rate: p.rate,
    acceptedStableCoins: p.accepted_stable_coins,
    requestId: envelope.request_id,
  };
}

function stripTrailingSlash(s: string): string {
  return s.endsWith("/") ? s.slice(0, -1) : s;
}
