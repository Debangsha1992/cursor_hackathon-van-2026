import type { BotTradingProfile } from "@/lib/trading/types";

// A `BotRecord` is the persisted shape of a registered bot. It is a superset
// of `BotTradingProfile` (the audit-time view the rule engine sees) with the
// fields the registration flow cares about: ownership, hashed HMAC secret
// for direct-API submission, and a separate shared secret for the
// TradingView webhook path (Pine alerts can't compute HMAC).
export interface BotRecord {
  profile: BotTradingProfile;
  ownerUserId: string;
  secretHash: string; // sha256(hmacSecret), never the plaintext
  tradingviewSharedSecret: string;
  createdAtMs: number;
}

export interface BotRegistry {
  create(input: CreateBotInput): Promise<CreatedBot>;
  list(ownerUserId: string): Promise<BotRecord[]>;
  get(botId: string): Promise<BotRecord | null>;
  // Returns the shared secret only if the caller can prove ownership. Used by
  // the dashboard's "Send test alert" route, which is same-origin and
  // session-authenticated.
  getTradingviewSharedSecret(
    botId: string,
    ownerUserId: string
  ): Promise<string | null>;
}

export interface CreateBotInput {
  ownerUserId: string;
  profile: Omit<BotTradingProfile, "botId">;
}

export interface CreatedBot {
  record: BotRecord;
  // Returned to the caller exactly once; never displayed again. The DB only
  // ever stores the sha256 hash.
  hmacSecret: string;
}
