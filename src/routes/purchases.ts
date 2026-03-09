import { Router, Response } from "express";
import prisma from "../lib/prisma";
import { AuthRequest, authRequired } from "../middleware/auth";
import { computeStatus, computeTotalCost, Tier } from "../lib/helpers";

const router = Router({ mergeParams: true });

// POST /api/launches/:id/purchase — Record purchase (auth required)
router.post("/", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const launchId = req.params.id;
    const { walletAddress, amount, txSignature, referralCode } = req.body;

    if (!walletAddress || amount === undefined || amount === null || !txSignature) {
      return res.status(400).json({ error: "Missing required fields: walletAddress, amount, txSignature" });
    }

    const numAmount = Number(amount);

    // Find launch with purchases and whitelist
    const launch = await prisma.launch.findUnique({
      where: { id: launchId },
      include: { purchases: true, whitelistEntries: true },
    });

    if (!launch) {
      return res.status(404).json({ error: "Launch not found" });
    }

    // Compute status
    const status = computeStatus(launch);
    if (status !== "ACTIVE") {
      return res.status(400).json({ error: `Launch is ${status}, not ACTIVE` });
    }

    // Check whitelist (if whitelist exists)
    if (launch.whitelistEntries.length > 0) {
      const isWhitelisted = launch.whitelistEntries.some((w) => w.address === walletAddress);
      if (!isWhitelisted) {
        return res.status(400).json({ error: "Wallet not whitelisted" });
      }
    }

    // Sybil protection: maxPerWallet per USER (across all wallets)
    const userPurchases = launch.purchases.filter((p) => p.userId === req.userId);
    const userTotalPurchased = userPurchases.reduce((sum, p) => sum + p.amount, 0);

    if (userTotalPurchased + numAmount > launch.maxPerWallet) {
      return res.status(400).json({ error: "Exceeds maxPerWallet per user" });
    }

    // Check totalSupply
    const totalPurchased = launch.purchases.reduce((sum, p) => sum + p.amount, 0);
    if (totalPurchased + numAmount > launch.totalSupply) {
      return res.status(400).json({ error: "Exceeds totalSupply" });
    }

    // Check duplicate txSignature
    const existingTx = await prisma.purchase.findUnique({ where: { txSignature } });
    if (existingTx) {
      return res.status(400).json({ error: "Duplicate txSignature" });
    }

    // Calculate totalCost with tiered pricing, accounting for previous purchases
    const tiers = launch.tiers as Tier[] | null;
    let totalCost = computeTotalCost(numAmount, launch.pricePerToken, tiers, totalPurchased);

    // Apply referral discount if provided
    if (referralCode) {
      const referral = await prisma.referralCode.findUnique({
        where: { launchId_code: { launchId, code: referralCode } },
      });

      if (!referral) {
        return res.status(400).json({ error: "Invalid referral code" });
      }

      if (referral.usedCount >= referral.maxUses) {
        return res.status(400).json({ error: "Referral code exhausted" });
      }

      // Apply discount
      totalCost = totalCost * (1 - referral.discountPercent / 100);

      // Increment usedCount
      await prisma.referralCode.update({
        where: { id: referral.id },
        data: { usedCount: { increment: 1 } },
      });
    }

    const purchase = await prisma.purchase.create({
      data: {
        launchId,
        userId: req.userId!,
        walletAddress,
        amount: numAmount,
        totalCost,
        txSignature,
        referralCode: referralCode || null,
      },
    });

    return res.status(201).json(purchase);
  } catch (error: any) {
    // Handle Prisma invalid ID errors
    if (error?.code === "P2023" || error?.code === "P2025") {
      return res.status(404).json({ error: "Launch not found" });
    }
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/launches/:id/purchases — View purchases (auth required)
router.get("/", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const launchId = req.params.id;

    const launch = await prisma.launch.findUnique({ where: { id: launchId } });
    if (!launch) {
      return res.status(404).json({ error: "Launch not found" });
    }

    let purchases;
    if (launch.creatorId === req.userId) {
      // Creator sees all purchases
      purchases = await prisma.purchase.findMany({ where: { launchId } });
    } else {
      // Others see only their own
      purchases = await prisma.purchase.findMany({
        where: { launchId, userId: req.userId },
      });
    }

    return res.status(200).json({ purchases, total: purchases.length });
  } catch (error: any) {
    if (error?.code === "P2023") {
      return res.status(404).json({ error: "Launch not found" });
    }
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
