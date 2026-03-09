import { Router, Response } from "express";
import prisma from "../lib/prisma";
import { AuthRequest, authRequired } from "../middleware/auth";
import { computeStatus, computeTotalCost, Tier } from "../lib/helpers";

const router = Router({ mergeParams: true });

router.post("/", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const launchId = req.params.id;
    const { walletAddress, amount, txSignature, referralCode } = req.body;

    if (!walletAddress || amount === undefined || amount === null || !txSignature) {
      return res.status(400).json({ error: "Missing required fields: walletAddress, amount, txSignature" });
    }

    const numAmount = Number(amount);

    if (isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({ error: "Invalid amount" });
    }

    const launch = await prisma.launch.findUnique({
      where: { id: launchId },
      include: { purchases: true, whitelistEntries: true },
    });

    if (!launch) {
      return res.status(404).json({ error: "Launch not found" });
    }

    const status = computeStatus(launch);
    if (status !== "ACTIVE") {
      return res.status(400).json({ error: `Launch is ${status}, not ACTIVE` });
    }

    if (launch.whitelistEntries.length > 0) {
      const isWhitelisted = launch.whitelistEntries.some((w) => w.address === walletAddress);
      if (!isWhitelisted) {
        return res.status(400).json({ error: "Wallet not whitelisted" });
      }
    }

    const userPurchases = launch.purchases.filter((p) => p.userId === req.userId);
    const userTotalPurchased = userPurchases.reduce((sum, p) => sum + p.amount, 0);

    if (userTotalPurchased + numAmount > launch.maxPerWallet) {
      return res.status(400).json({ error: "Exceeds maxPerWallet per user" });
    }

    const totalPurchased = launch.purchases.reduce((sum, p) => sum + p.amount, 0);
    if (totalPurchased + numAmount > launch.totalSupply) {
      return res.status(400).json({ error: "Exceeds totalSupply" });
    }

    const existingTx = await prisma.purchase.findUnique({ where: { txSignature } });
    if (existingTx) {
      return res.status(400).json({ error: "Duplicate txSignature" });
    }

    const tiers = launch.tiers as Tier[] | null;
    let totalCost = computeTotalCost(numAmount, launch.pricePerToken, tiers, totalPurchased);

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

      totalCost = totalCost * (1 - referral.discountPercent / 100);

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
    if (error?.code === "P2023" || error?.code === "P2025") {
      return res.status(404).json({ error: "Launch not found" });
    }
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const launchId = req.params.id;

    const launch = await prisma.launch.findUnique({ where: { id: launchId } });
    if (!launch) {
      return res.status(404).json({ error: "Launch not found" });
    }

    let purchases;
    if (launch.creatorId === req.userId) {
      purchases = await prisma.purchase.findMany({ where: { launchId } });
    } else {
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
