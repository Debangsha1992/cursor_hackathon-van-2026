import { describe, it, expect, vi } from "vitest";

import {
  AllScaleError,
  createCheckoutIntent,
  signRequest,
} from "./allscaleClient";

// Fixture values are computed independently against the spec in
// docs.allscale.io/allscale-checkout/api-reference/api-doc-auth.md, so the
// test asserts our implementation matches AllScale's canonical-string +
// HMAC-SHA256(base64) contract, not just that we recompute our own output.
const FIXTURE_API_KEY = "ak_test_demo";
const FIXTURE_API_SECRET = "test_secret_abc";
const FIXTURE_TIMESTAMP = 1716501000;
const FIXTURE_NONCE = "b4d9a2a1-9c2b-4df4-8b8e-2a13a45fd321";

describe("signRequest — POST with body (tracer)", () => {
  it("emits the four required headers and an HMAC-SHA256/base64 signature matching the spec", () => {
    const body = JSON.stringify({
      amount_cents: 1000,
      currency: 1,
      order_id: "ord_1",
      redirect_url: "https://example.com/r",
    });

    const headers = signRequest({
      apiKey: FIXTURE_API_KEY,
      apiSecret: FIXTURE_API_SECRET,
      method: "POST",
      path: "/v1/checkout_intents/",
      query: "",
      body,
      timestamp: FIXTURE_TIMESTAMP,
      nonce: FIXTURE_NONCE,
    });

    expect(headers["X-API-Key"]).toBe(FIXTURE_API_KEY);
    expect(headers["X-Timestamp"]).toBe("1716501000");
    expect(headers["X-Nonce"]).toBe(FIXTURE_NONCE);
    expect(headers["X-Signature"]).toBe(
      "v1=28HitHtE4rVV1nej7S5mIE8xZbc9afx8h+6cH/yaPiA=",
    );
  });
});

describe("signRequest — GET with empty body", () => {
  it("hashes the empty string (e3b0c4…) and signs the canonical GET request", () => {
    const headers = signRequest({
      apiKey: FIXTURE_API_KEY,
      apiSecret: FIXTURE_API_SECRET,
      method: "GET",
      path: "/v1/test/ping",
      query: "",
      body: "",
      timestamp: FIXTURE_TIMESTAMP,
      nonce: FIXTURE_NONCE,
    });

    expect(headers["X-Signature"]).toBe(
      "v1=LG9N2hObq9x9+xkPKSI8Vav6qXG6zGBqUoBn5Tnkg+I=",
    );
  });
});

describe("createCheckoutIntent — 10 USD on testnet", () => {
  it("POSTs to /v1/checkout_intents/ with currency=1 (USD) and amount_cents=1000 and parses checkout_url", async () => {
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe("https://sandbox.example.invalid/v1/checkout_intents/");
      expect(init.method).toBe("POST");

      const headers = init.headers as Record<string, string>;
      expect(headers["Content-Type"]).toBe("application/json");
      expect(headers["X-API-Key"]).toBe(FIXTURE_API_KEY);
      expect(headers["X-Timestamp"]).toBe("1716501000");
      expect(headers["X-Nonce"]).toBe(FIXTURE_NONCE);
      expect(headers["X-Signature"]?.startsWith("v1=")).toBe(true);

      const parsed = JSON.parse(init.body as string) as Record<string, unknown>;
      expect(parsed.currency).toBe(1);
      expect(parsed.amount_cents).toBe(1000);
      expect(parsed.order_id).toBe("ord_test_001");
      expect(parsed.redirect_url).toBe("https://example.com/billing/return");
      expect(parsed.user_id).toBe("user_42");
      expect("stable_coin" in parsed).toBe(false);

      return new Response(
        JSON.stringify({
          code: 0,
          payload: {
            checkout_url: "https://checkout.allscale.io/abc123",
            allscale_checkout_intent_id: "ck_int_001",
            amount_coins: "10.0000",
            stable_coin_type: 1,
            rate: "1.0000",
            accepted_stable_coins: 1,
          },
          error: null,
          request_id: "req_xyz",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    const intent = await createCheckoutIntent(
      {
        amountCents: 1000,
        currency: 1,
        orderId: "ord_test_001",
        userId: "user_42",
        redirectUrl: "https://example.com/billing/return",
      },
      {
        apiKey: FIXTURE_API_KEY,
        apiSecret: FIXTURE_API_SECRET,
        baseUrl: "https://sandbox.example.invalid",
        fetchImpl: fetchImpl as unknown as typeof fetch,
        now: () => FIXTURE_TIMESTAMP * 1000,
        newNonce: () => FIXTURE_NONCE,
      },
    );

    expect(intent.checkoutUrl).toBe("https://checkout.allscale.io/abc123");
    expect(intent.intentId).toBe("ck_int_001");
    expect(intent.amountCoins).toBe("10.0000");
    expect(intent.stableCoinType).toBe(1);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
});

describe("createCheckoutIntent — error handling", () => {
  it("throws AllScaleError carrying the non-zero AllScale error code and request_id", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            code: 10001,
            payload: null,
            error: {
              message: "Validation error",
              details: { reason: "currency and stable_coin are mutually exclusive" },
            },
            request_id: "req_err_1",
          }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          },
        ),
    );

    // Input passes client-side validation (only `currency` set), so the
    // request reaches the stubbed fetch — which returns AllScale's 10001
    // envelope. The client must surface that as an AllScaleError carrying
    // the code + request_id.
    await expect(
      createCheckoutIntent(
        { amountCents: 1000, currency: 1 },
        {
          apiKey: FIXTURE_API_KEY,
          apiSecret: FIXTURE_API_SECRET,
          baseUrl: "https://sandbox.example.invalid",
          fetchImpl: fetchImpl as unknown as typeof fetch,
          now: () => FIXTURE_TIMESTAMP * 1000,
          newNonce: () => FIXTURE_NONCE,
        },
      ),
    ).rejects.toMatchObject({
      name: "AllScaleError",
      code: 10001,
      requestId: "req_err_1",
    });

    await expect(
      createCheckoutIntent(
        { amountCents: 1000, currency: 1 },
        {
          apiKey: FIXTURE_API_KEY,
          apiSecret: FIXTURE_API_SECRET,
          baseUrl: "https://sandbox.example.invalid",
          fetchImpl: fetchImpl as unknown as typeof fetch,
          now: () => FIXTURE_TIMESTAMP * 1000,
          newNonce: () => FIXTURE_NONCE,
        },
      ),
    ).rejects.toBeInstanceOf(AllScaleError);
  });
});

describe("createCheckoutIntent — input validation", () => {
  it("rejects requests that set both currency and stable_coin (mirrors AllScale 10001 rule)", async () => {
    await expect(
      createCheckoutIntent(
        { amountCents: 1000, currency: 1, stableCoin: 1 },
        {
          apiKey: FIXTURE_API_KEY,
          apiSecret: FIXTURE_API_SECRET,
          baseUrl: "https://sandbox.example.invalid",
          fetchImpl: vi.fn() as unknown as typeof fetch,
          now: () => FIXTURE_TIMESTAMP * 1000,
          newNonce: () => FIXTURE_NONCE,
          skipNetwork: true,
        },
      ),
    ).rejects.toThrow(/exactly one of/i);
  });

  it("rejects requests that set neither currency nor stable_coin", async () => {
    await expect(
      createCheckoutIntent(
        { amountCents: 1000 },
        {
          apiKey: FIXTURE_API_KEY,
          apiSecret: FIXTURE_API_SECRET,
          baseUrl: "https://sandbox.example.invalid",
          fetchImpl: vi.fn() as unknown as typeof fetch,
          now: () => FIXTURE_TIMESTAMP * 1000,
          newNonce: () => FIXTURE_NONCE,
          skipNetwork: true,
        },
      ),
    ).rejects.toThrow(/exactly one of/i);
  });
});
