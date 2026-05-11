// AllScale Checkout API credentials + base URL. Server-only — the api_secret
// signs every request and must never be shipped to the browser. The base URL
// is decoupled from the credentials so QA can point the same code at the
// AllScale sandbox host (testnet) and switch to https://openapi.allscale.io
// for production by flipping a single env var.
//
// The sandbox hostname is *not* listed in the public AllScale docs — operators
// must paste it from the merchant dashboard (app.allscale.io → Settings →
// Commerce → API Keys), where it appears alongside the api_key / api_secret
// pair. The production fallback is documented and safe for read-only use.

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing environment variable ${name}. ` +
        `Set it in .env.local. AllScale credentials live in ` +
        `app.allscale.io → Settings → Commerce.`,
    );
  }
  return value;
}

export function getAllScaleApiKey(): string {
  return required("ALLSCALE_API_KEY", process.env.ALLSCALE_API_KEY);
}

export function getAllScaleApiSecret(): string {
  return required("ALLSCALE_API_SECRET", process.env.ALLSCALE_API_SECRET);
}

// Defaults to production. For testnet/sandbox runs (which is what the user
// is asking for here — "ask for 10 USD on testnet"), set ALLSCALE_API_BASE_URL
// to the sandbox host shown in the merchant dashboard.
export function getAllScaleBaseUrl(): string {
  return process.env.ALLSCALE_API_BASE_URL ?? "https://openapi.allscale.io";
}
