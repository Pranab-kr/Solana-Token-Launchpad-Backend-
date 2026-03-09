import { Router, Response } from "express";
import prisma from "../lib/prisma";
import { AuthRequest, authRequired } from "../middleware/auth";

const router = Router({ mergeParams: true });

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

    const { addresses } = req.body;
    if (!addresses || !Array.isArray(addresses)) {
      return res.status(400).json({ error: "addresses must be an array" });
    }

    let addedCount = 0;

    for (const address of addresses) {
      try {
        await prisma.whitelistEntry.create({
          data: { launchId, address },
        });
        addedCount++;
      } catch {}
    }

    const total = await prisma.whitelistEntry.count({ where: { launchId } });

    return res.status(200).json({ added: addedCount, total });
  } catch (error: any) {
    if (error?.code === "P2023") {
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

    if (launch.creatorId !== req.userId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const entries = await prisma.whitelistEntry.findMany({
      where: { launchId },
    });

    const addresses = entries.map((e) => e.address);

    return res.status(200).json({ addresses, total: addresses.length });
  } catch (error: any) {
    if (error?.code === "P2023") {
      return res.status(404).json({ error: "Launch not found" });
    }
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/:address", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const launchId = req.params.id;
    const address = req.params.address;

    const launch = await prisma.launch.findUnique({ where: { id: launchId } });

    if (!launch) {
      return res.status(404).json({ error: "Launch not found" });
    }

    if (launch.creatorId !== req.userId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const entry = await prisma.whitelistEntry.findUnique({
      where: { launchId_address: { launchId, address } },
    });

    if (!entry) {
      return res.status(404).json({ error: "Address not found in whitelist" });
    }

    await prisma.whitelistEntry.delete({
      where: { id: entry.id },
    });

    return res.status(200).json({ removed: true });
  } catch (error: any) {
    if (error?.code === "P2023") {
      return res.status(404).json({ error: "Launch not found" });
    }
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
