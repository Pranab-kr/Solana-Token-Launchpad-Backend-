import { Launch, Purchase } from "@prisma/client";

export interface Tier {
  minAmount: number;
  maxAmount: number;
  pricePerToken: number;
}

export interface VestingConfig {
  cliffDays: number;
  vestingDays: number;
  tgePercent: number;
}

export function computeStatus(launch: Launch & { purchases?: Purchase[] }): string {
  const now = new Date();
  const totalPurchased = (launch.purchases || []).reduce((sum, p) => sum + p.amount, 0);

  if (totalPurchased >= launch.totalSupply) return "SOLD_OUT";
  if (now < new Date(launch.startsAt)) return "UPCOMING";
  if (now > new Date(launch.endsAt)) return "ENDED";
  return "ACTIVE";
}

export function computeTotalCost(
  amount: number,
  pricePerToken: number,
  tiers?: Tier[] | null,
  alreadyPurchased: number = 0
): number {
  if (!tiers || !Array.isArray(tiers) || tiers.length === 0) {
    return amount * pricePerToken;
  }

  const sortedTiers = [...tiers].sort((a, b) => a.minAmount - b.minAmount);

  let totalTierCapacity = 0;
  for (const tier of sortedTiers) {
    totalTierCapacity += tier.maxAmount - tier.minAmount;
  }

  let consumed = Math.min(alreadyPurchased, totalTierCapacity);
  let remaining = amount;
  let totalCost = 0;

  for (const tier of sortedTiers) {
    if (remaining <= 0) break;
    const tierCapacity = tier.maxAmount - tier.minAmount;

    if (consumed >= tierCapacity) {
      consumed -= tierCapacity;
      continue;
    }

    const availableInTier = tierCapacity - consumed;
    consumed = 0;

    const amountInTier = Math.min(remaining, availableInTier);
    totalCost += amountInTier * tier.pricePerToken;
    remaining -= amountInTier;
  }

  if (remaining > 0) {
    totalCost += remaining * pricePerToken;
  }

  return totalCost;
}

export function addStatusToLaunch(launch: any): any {
  const status = computeStatus(launch);
  const { purchases, whitelistEntries, referralCodes, ...rest } = launch;
  return { ...rest, status };
}
