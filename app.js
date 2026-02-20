require("dotenv").config(); // 1️⃣ Always load first
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");

const connectDB = require("./Src/config/dbConfig");
const { createDefaultAdmin } = require("./Src/bootstrap/createDefaultAdmin");
const AdminRouter = require("./Src/modules/Admin/Routes/AdminRoutes");

const app = express();
const PORT = process.env.PORT || 5000;

/* =========================
   Middlewares
========================= */
app.use(helmet()); // Security headers
app.use(cors({ origin: "*" })); // Adjust in production
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* =========================
   Routes
========================= */
app.use("/admin", AdminRouter);

/* =========================
   Health Check
========================= */
app.get("/health", (req, res) => {
  res.status(200).json({ status: "OK" });
});

/* =========================
   Global Error Handler
========================= */
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: "Internal Server Error",
  });
});

/* =========================
   Start Server Only After DB
========================= */
const startServer = async () => {
  try {
    await connectDB();
    console.log("Database connected successfully");

    await createDefaultAdmin();
    console.log("Default admin verified");

    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });

  } catch (error) {
    console.error("Startup failed:", error.message);
    process.exit(1); // stop app if DB fails
  }
};

startServer();

/* =========================
   Graceful Shutdown
========================= */
process.on("SIGINT", () => {
  console.log("Server shutting down...");
  process.exit(0);
});