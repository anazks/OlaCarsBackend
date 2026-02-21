require("dotenv").config(); // 1️⃣ Always load first
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");

const connectDB = require("./Src/config/dbConfig");
const { createDefaultAdmin } = require("./Src/bootstrap/createDefaultAdmin");
const AdminRouter = require("./Src/modules/Admin/Routes/AdminRoutes");
const BranchRouter = require("./Src/modules/Branch/Routes/BranchRouter");
const app = express();
const PORT = process.env.PORT || 5000;

app.use(helmet()); // Security headers
app.use(cors({ origin: "*" })); // Adjust in production
app.use(express.json());
app.use(express.urlencoded({ extended: true }));


app.use("/api/admin", AdminRouter);
app.use("/api/branches",BranchRouter);


app.get("/health", (req, res) => {
  res.status(200).json({ status: "OK" });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: "Internal Server Error",
  });
});

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

process.on("SIGINT", () => {
  console.log("Server shutting down...");
  process.exit(0);
});