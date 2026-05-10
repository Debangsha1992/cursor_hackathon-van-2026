export type PlanTier = "free" | "pro";

export interface UsageGateInput {
  tier: PlanTier;
  currentMonthCount: number;
  upgradeUrl?: string;
}

export interface UsageGateResult {
  allowed: boolean;
  used: number;
  limit: number;
  remaining: number;
  upgradeUrl?: string;
}

const LIMITS: Record<PlanTier, number> = {
  free: 5,
  pro: 100,
};

const DEFAULT_UPGRADE_URL = "/billing";

export function checkUsage(input: UsageGateInput): UsageGateResult {
  const limit = LIMITS[input.tier];
  const used = Math.max(0, input.currentMonthCount);
  const remaining = Math.max(0, limit - used);
  const allowed = used < limit;

  const upgradeUrl =
    !allowed && input.tier === "free"
      ? input.upgradeUrl ?? DEFAULT_UPGRADE_URL
      : undefined;

  return {
    allowed,
    used,
    limit,
    remaining,
    upgradeUrl,
  };
}
