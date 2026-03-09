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

// Launch routes
app.use("/api/launches", launchRoutes);

// Whitelist routes (nested under launches)
app.use("/api/launches/:id/whitelist", whitelistRoutes);

// Referral routes (nested under launches)
app.use("/api/launches/:id/referrals", referralRoutes);

// Purchase routes (nested under launches)
app.use("/api/launches/:id/purchase", purchaseRoutes);
app.use("/api/launches/:id/purchases", purchaseRoutes);

// Vesting routes (nested under launches)
app.use("/api/launches/:id/vesting", vestingRoutes);

app.listen(3000, () => {
  console.log("Server running on port 3000");
});
