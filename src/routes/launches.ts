import { Router, Response } from "express";
import prisma from "../lib/prisma";
import { AuthRequest, authRequired } from "../middleware/auth";
import { computeStatus, addStatusToLaunch } from "../lib/helpers";

const router = Router();

// POST /api/launches — Create launch (auth required)
router.post("/", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const { name, symbol, totalSupply, pricePerToken, startsAt, endsAt, maxPerWallet, description, tiers, vesting } = req.body;

    if (!name || !symbol || totalSupply === undefined || totalSupply === null || pricePerToken === undefined || pricePerToken === null || !startsAt || !endsAt || maxPerWallet === undefined || maxPerWallet === null) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const launch = await prisma.launch.create({
      data: {
        name,
        symbol,
        totalSupply: Number(totalSupply),
        pricePerToken: Number(pricePerToken),
        startsAt: new Date(startsAt),
        endsAt: new Date(endsAt),
        maxPerWallet: Number(maxPerWallet),
        description: description || "",
        creatorId: req.userId!,
        tiers: tiers || undefined,
        vesting: vesting || undefined,
      },
      include: { purchases: true },
    });

    return res.status(201).json(addStatusToLaunch(launch));
  } catch (error) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/launches — List launches (public)
router.get("/", async (req: AuthRequest, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.max(1, parseInt(req.query.limit as string) || 10);
    const statusFilter = req.query.status as string | undefined;
    const skip = (page - 1) * limit;

    // Get all launches with purchases to compute status
    const allLaunches = await prisma.launch.findMany({
      include: { purchases: true },
      orderBy: { createdAt: "desc" },
    });

    // Compute status for each launch
    let launchesWithStatus = allLaunches.map((l) => ({
      ...addStatusToLaunch(l),
    }));

    // Filter by status if specified
    if (statusFilter) {
      launchesWithStatus = launchesWithStatus.filter((l) => l.status === statusFilter);
    }

    const total = launchesWithStatus.length;
    const paginatedLaunches = launchesWithStatus.slice(skip, skip + limit);

    return res.status(200).json({
      launches: paginatedLaunches,
      total,
      page,
      limit,
    });
  } catch (error) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/launches/:id — Get launch (public)
router.get("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const launch = await prisma.launch.findUnique({
      where: { id: req.params.id },
      include: { purchases: true },
    });

    if (!launch) {
      return res.status(404).json({ error: "Launch not found" });
    }

    return res.status(200).json(addStatusToLaunch(launch));
  } catch (error) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /api/launches/:id — Update launch (auth, creator only)
router.put("/:id", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const launch = await prisma.launch.findUnique({
      where: { id: req.params.id },
      include: { purchases: true },
    });

    if (!launch) {
      return res.status(404).json({ error: "Launch not found" });
    }

    if (launch.creatorId !== req.userId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const { name, symbol, totalSupply, pricePerToken, startsAt, endsAt, maxPerWallet, description, tiers, vesting } = req.body;

    const updated = await prisma.launch.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined && { name }),
        ...(symbol !== undefined && { symbol }),
        ...(totalSupply !== undefined && { totalSupply: Number(totalSupply) }),
        ...(pricePerToken !== undefined && { pricePerToken: Number(pricePerToken) }),
        ...(startsAt !== undefined && { startsAt: new Date(startsAt) }),
        ...(endsAt !== undefined && { endsAt: new Date(endsAt) }),
        ...(maxPerWallet !== undefined && { maxPerWallet: Number(maxPerWallet) }),
        ...(description !== undefined && { description }),
        ...(tiers !== undefined && { tiers }),
        ...(vesting !== undefined && { vesting }),
      },
      include: { purchases: true },
    });

    return res.status(200).json(addStatusToLaunch(updated));
  } catch (error) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
