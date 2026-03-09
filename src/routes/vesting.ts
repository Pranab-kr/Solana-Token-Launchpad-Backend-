import { Router, Response } from "express";
import prisma from "../lib/prisma";
import { AuthRequest } from "../middleware/auth";
import { VestingConfig } from "../lib/helpers";

const router = Router({ mergeParams: true });

// GET /api/launches/:id/vesting?walletAddress=ADDR
router.get("/", async (req: AuthRequest, res: Response) => {
  try {
    const launchId = req.params.id;
    const walletAddress = req.query.walletAddress as string;

    if (!walletAddress) {
      return res.status(400).json({ error: "Missing walletAddress query parameter" });
    }

    const launch = await prisma.launch.findUnique({
      where: { id: launchId },
    });

    if (!launch) {
      return res.status(404).json({ error: "Launch not found" });
    }

    // Get all purchases for this wallet on this launch
    const purchases = await prisma.purchase.findMany({
      where: { launchId, walletAddress },
    });

    const totalPurchased = purchases.reduce((sum, p) => sum + p.amount, 0);

    const vestingConfig = launch.vesting as VestingConfig | null;

    if (!vestingConfig || vestingConfig.vestingDays === undefined || vestingConfig.vestingDays === null) {
      // No vesting config: all tokens claimable immediately
      return res.status(200).json({
        totalPurchased,
        tgeAmount: totalPurchased,
        cliffEndsAt: null,
        vestedAmount: totalPurchased,
        lockedAmount: 0,
        claimableAmount: totalPurchased,
      });
    }

    const { cliffDays, vestingDays, tgePercent } = vestingConfig;
    const now = new Date();
    const launchEnd = new Date(launch.endsAt);

    // TGE amount: floor(totalPurchased * tgePercent / 100)
    const tgeAmount = Math.floor(totalPurchased * tgePercent / 100);
    const remainingTokens = totalPurchased - tgeAmount;

    // Cliff ends at launchEnd + cliffDays
    const cliffEndsAt = new Date(launchEnd.getTime() + cliffDays * 24 * 60 * 60 * 1000);
    const vestingEndsAt = new Date(cliffEndsAt.getTime() + vestingDays * 24 * 60 * 60 * 1000);

    let vestedAmount: number;
    let lockedAmount: number;
    let claimableAmount: number;

    if (now < cliffEndsAt) {
      // Before cliff: only TGE amount is available
      vestedAmount = 0;
      lockedAmount = remainingTokens;
      claimableAmount = tgeAmount;
    } else if (now >= vestingEndsAt) {
      // After full vesting: everything available
      vestedAmount = remainingTokens;
      lockedAmount = 0;
      claimableAmount = totalPurchased;
    } else {
      // During vesting: linear vesting
      const elapsedMs = now.getTime() - cliffEndsAt.getTime();
      const totalVestingMs = vestingDays * 24 * 60 * 60 * 1000;
      const vestingRatio = elapsedMs / totalVestingMs;

      vestedAmount = Math.floor(remainingTokens * vestingRatio);
      lockedAmount = remainingTokens - vestedAmount;
      claimableAmount = tgeAmount + vestedAmount;
    }

    return res.status(200).json({
      totalPurchased,
      tgeAmount,
      cliffEndsAt: cliffEndsAt.toISOString(),
      vestedAmount,
      lockedAmount,
      claimableAmount,
    });
  } catch (error) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
