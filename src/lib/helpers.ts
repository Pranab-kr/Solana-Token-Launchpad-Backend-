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

/**
 * Calculate total cost with tiered pricing.
 * Tiers are filled in order. Each tier has capacity = maxAmount - minAmount.
 * alreadyPurchased: total tokens previously purchased for this launch (to track which tiers are consumed).
 * Overflow beyond all tiers uses flat pricePerToken.
 */
export function computeTotalCost(
  amount: number,
  pricePerToken: number,
  tiers?: Tier[] | null,
  alreadyPurchased: number = 0
): number {
  if (!tiers || !Array.isArray(tiers) || tiers.length === 0) {
    return amount * pricePerToken;
  }

  // Sort tiers by minAmount
  const sortedTiers = [...tiers].sort((a, b) => a.minAmount - b.minAmount);

  // Calculate total tier capacity
  let totalTierCapacity = 0;
  for (const tier of sortedTiers) {
    totalTierCapacity += tier.maxAmount - tier.minAmount;
  }

  // How much of the tier capacity has been consumed by previous purchases
  let consumed = Math.min(alreadyPurchased, totalTierCapacity);
  let remaining = amount;
  let totalCost = 0;

  for (const tier of sortedTiers) {
    if (remaining <= 0) break;
    const tierCapacity = tier.maxAmount - tier.minAmount;

    if (consumed >= tierCapacity) {
      // This tier is fully consumed by previous purchases
      consumed -= tierCapacity;
      continue;
    }

    // Remaining capacity in this tier after previous purchases
    const availableInTier = tierCapacity - consumed;
    consumed = 0;

    const amountInTier = Math.min(remaining, availableInTier);
    totalCost += amountInTier * tier.pricePerToken;
    remaining -= amountInTier;
  }

  // Any overflow beyond all tiers uses the flat pricePerToken
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
