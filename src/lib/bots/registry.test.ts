import { describe, it, expect } from "vitest";
import { createInMemoryBotRegistry } from "./registry";

let n = 0;
function deps() {
  return {
    now: () => 1_000_000,
    nextBotId: () => `bot_${++n}`,
    nextSecret: () => `secret_${++n}`,
  };
}

const baseProfile = {
  botName: "Alpha",
  strategyType: "trend_following" as const,
  maxRiskPerTradePercent: 2,
  maxTradesPerDay: 5,
  maxAllowedDrawdownPercent: 20,
  botType: "rule_based" as const,
};

describe("botRegistry - create", () => {
  it("returns the HMAC secret in plaintext exactly once", async () => {
    const reg = createInMemoryBotRegistry(deps());
    const result = await reg.create({
      ownerUserId: "user_a",
      profile: baseProfile,
    });
    expect(result.hmacSecret.length).toBeGreaterThanOrEqual(8);
    expect(result.record.secretHash).not.toBe(result.hmacSecret);
    expect(result.record.secretHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("stamps the botId into the profile", async () => {
    const reg = createInMemoryBotRegistry(deps());
    const result = await reg.create({
      ownerUserId: "user_a",
      profile: baseProfile,
    });
    expect(result.record.profile.botId).toMatch(/^bot_/);
  });

  it("generates a distinct TradingView shared secret", async () => {
    const reg = createInMemoryBotRegistry(deps());
    const result = await reg.create({
      ownerUserId: "user_a",
      profile: baseProfile,
    });
    expect(result.record.tradingviewSharedSecret).not.toBe(result.hmacSecret);
    expect(result.record.tradingviewSharedSecret).toMatch(/^tv_/);
  });
});

describe("botRegistry - list", () => {
  it("returns bots in newest-first order, scoped by owner", async () => {
    let t = 1_000;
    const reg = createInMemoryBotRegistry({
      now: () => ++t,
      nextBotId: () => `bot_${++n}`,
      nextSecret: () => `secret_${++n}`,
    });
    const a = await reg.create({ ownerUserId: "u", profile: baseProfile });
    const b = await reg.create({ ownerUserId: "u", profile: baseProfile });
    await reg.create({ ownerUserId: "other", profile: baseProfile });

    const list = await reg.list("u");
    expect(list.map((r) => r.profile.botId)).toEqual([
      b.record.profile.botId,
      a.record.profile.botId,
    ]);
  });
});

describe("botRegistry - getTradingviewSharedSecret", () => {
  it("returns the secret when ownership matches", async () => {
    const reg = createInMemoryBotRegistry(deps());
    const result = await reg.create({
      ownerUserId: "u",
      profile: baseProfile,
    });
    const got = await reg.getTradingviewSharedSecret(
      result.record.profile.botId,
      "u"
    );
    expect(got).toBe(result.record.tradingviewSharedSecret);
  });

  it("returns null on owner mismatch (does not leak)", async () => {
    const reg = createInMemoryBotRegistry(deps());
    const result = await reg.create({
      ownerUserId: "u",
      profile: baseProfile,
    });
    const got = await reg.getTradingviewSharedSecret(
      result.record.profile.botId,
      "other_user"
    );
    expect(got).toBeNull();
  });

  it("returns null for unknown bot", async () => {
    const reg = createInMemoryBotRegistry(deps());
    const got = await reg.getTradingviewSharedSecret("bot_missing", "u");
    expect(got).toBeNull();
  });
});
