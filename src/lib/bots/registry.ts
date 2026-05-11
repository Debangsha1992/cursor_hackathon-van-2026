import { createHash, randomBytes, randomUUID } from "node:crypto";
import type {
  BotRecord,
  BotRegistry,
  CreateBotInput,
  CreatedBot,
} from "./types";

export interface RegistryDeps {
  now: () => number;
  nextBotId: () => string;
  nextSecret: () => string;
}

export const defaultRegistryDeps: RegistryDeps = {
  now: () => Date.now(),
  nextBotId: () => `bot_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
  // A 32-byte URL-safe random secret (~256 bits of entropy). Bots paste this
  // into TradingView's alert message body and into their own API client; the
  // HMAC secret follows the same generator but is never persisted in plain.
  nextSecret: () =>
    randomBytes(32).toString("base64url").replace(/=+$/, ""),
};

function sha256Hex(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

export function createInMemoryBotRegistry(
  deps: RegistryDeps = defaultRegistryDeps
): BotRegistry {
  const byId = new Map<string, BotRecord>();
  const byOwner = new Map<string, Set<string>>();

  return {
    async create(input: CreateBotInput): Promise<CreatedBot> {
      const botId = deps.nextBotId();
      const hmacSecret = deps.nextSecret();
      const tradingviewSharedSecret = `tv_${deps.nextSecret()}`;
      const record: BotRecord = {
        profile: { botId, ...input.profile },
        ownerUserId: input.ownerUserId,
        secretHash: sha256Hex(hmacSecret),
        tradingviewSharedSecret,
        createdAtMs: deps.now(),
      };
      byId.set(botId, record);
      const owned = byOwner.get(input.ownerUserId) ?? new Set();
      owned.add(botId);
      byOwner.set(input.ownerUserId, owned);
      return { record, hmacSecret };
    },

    async list(ownerUserId: string): Promise<BotRecord[]> {
      const ids = byOwner.get(ownerUserId);
      if (!ids) return [];
      const out: BotRecord[] = [];
      for (const id of ids) {
        const r = byId.get(id);
        if (r) out.push(r);
      }
      return out.sort((a, b) => b.createdAtMs - a.createdAtMs);
    },

    async get(botId: string): Promise<BotRecord | null> {
      return byId.get(botId) ?? null;
    },

    async getTradingviewSharedSecret(
      botId: string,
      ownerUserId: string
    ): Promise<string | null> {
      const r = byId.get(botId);
      if (!r) return null;
      if (r.ownerUserId !== ownerUserId) return null;
      return r.tradingviewSharedSecret;
    },
  };
}

// Module-level singleton for the hackathon. Replaced by Supabase-backed
// implementation when wiring lands.
let globalRegistry: BotRegistry | null = null;

export function getGlobalRegistry(): BotRegistry {
  if (!globalRegistry) {
    globalRegistry = createInMemoryBotRegistry();
  }
  return globalRegistry;
}

export function __resetGlobalRegistry() {
  globalRegistry = null;
}
