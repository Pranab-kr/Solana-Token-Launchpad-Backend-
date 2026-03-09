import "dotenv/config";
import express from "express";
import authRoutes from "./routes/auth";
import launchRoutes from "./routes/launches";
import whitelistRoutes from "./routes/whitelist";
import referralRoutes from "./routes/referrals";
import purchaseRoutes from "./routes/purchases";
import vestingRoutes from "./routes/vesting";

const app = express();
app.use(express.json());

// Health check
app.get("/api/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

// Auth routes
app.use("/api/auth", authRoutes);

// IMPORTANT: Mount sub-routes BEFORE the launches router
// so that /api/launches/:id/whitelist doesn't get caught by launches /:id
app.use("/api/launches/:id/whitelist", whitelistRoutes);
app.use("/api/launches/:id/referrals", referralRoutes);
app.use("/api/launches/:id/purchase", purchaseRoutes);
app.use("/api/launches/:id/purchases", purchaseRoutes);
app.use("/api/launches/:id/vesting", vestingRoutes);

// Launch routes (must be AFTER sub-routes to avoid /:id catching sub-paths)
app.use("/api/launches", launchRoutes);

app.listen(3000, () => {
  console.log("Server running on port 3000");
});
