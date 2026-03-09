import { Router, Response } from "express";
import prisma from "../lib/prisma";
import { AuthRequest, authRequired } from "../middleware/auth";

const router = Router({ mergeParams: true });

// POST /api/launches/:id/referrals — Create referral code (auth, creator only)
router.post("/", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const launchId = req.params.id;
    const launch = await prisma.launch.findUnique({ where: { id: launchId } });

    if (!launch) {
      return res.status(404).json({ error: "Launch not found" });
    }

    if (launch.creatorId !== req.userId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const { code, discountPercent, maxUses } = req.body;

    if (!code || discountPercent === undefined || maxUses === undefined) {
      return res.status(400).json({ error: "Missing required fields: code, discountPercent, maxUses" });
    }

    // Check for duplicate code on this launch
    const existing = await prisma.referralCode.findUnique({
      where: { launchId_code: { launchId, code } },
    });

    if (existing) {
      return res.status(409).json({ error: "Duplicate referral code for this launch" });
    }

    const referral = await prisma.referralCode.create({
      data: {
        launchId,
        code,
        discountPercent: Number(discountPercent),
        maxUses: Number(maxUses),
        usedCount: 0,
      },
    });

    return res.status(201).json({
      id: referral.id,
      code: referral.code,
      discountPercent: referral.discountPercent,
      maxUses: referral.maxUses,
      usedCount: referral.usedCount,
    });
  } catch (error) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/launches/:id/referrals — List referral codes (auth, creator only)
router.get("/", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const launchId = req.params.id;
    const launch = await prisma.launch.findUnique({ where: { id: launchId } });

    if (!launch) {
      return res.status(404).json({ error: "Launch not found" });
    }

    if (launch.creatorId !== req.userId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const referrals = await prisma.referralCode.findMany({
      where: { launchId },
    });

    return res.status(200).json(
      referrals.map((r) => ({
        id: r.id,
        code: r.code,
        discountPercent: r.discountPercent,
        maxUses: r.maxUses,
        usedCount: r.usedCount,
      }))
    );
  } catch (error) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
