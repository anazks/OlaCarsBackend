require("dotenv").config(); // 1️⃣ Always load first
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const swaggerUi = require("swagger-ui-express");
const swaggerSpec = require("./Src/config/swagger.config");
const connectDB = require("./Src/config/dbConfig");
const { createDefaultAdmin } = require("./Src/bootstrap/createDefaultAdmin");
const AdminRouter = require("./Src/modules/Admin/Routes/AdminRoutes");
const BranchRouter = require("./Src/modules/Branch/Routes/BranchRouter");
const CountryManagerRouter = require("./Src/modules/CountryManager/Routes/CountryManagerRouter");
const FinanceAdminRouter = require("./Src/modules/FinanceAdmin/Routes/FinanceAdminRoutes");
const OperationAdminRouter = require("./Src/modules/OperationAdmin/Routes/OperationAdminRoutes");
const BranchManagerRouter = require("./Src/modules/BranchManager/Routes/BranchManagerRouter");
const UserRouter = require("./Src/modules/User/Routes/UserRoutes");
const OperationStaffRouter = require("./Src/modules/OperationStaff/Routes/OperationStaffRoutes");
const FinanceStaffRouter = require("./Src/modules/FinanceStaff/Routes/FinanceStaffRoutes");
const WorkshopStaffRouter = require("./Src/modules/WorkshopStaff/Routes/WorkshopStaffRoutes");
const PurchaseOrderRouter = require("./Src/modules/PurchaseOrder/Routes/PurchaseOrderRouter");
const VehicleRouter = require("./Src/modules/Vehicle/Routes/VehicleRouter");
const SupplierRouter = require("./Src/modules/Supplier/Routes/SupplierRouter");
const AccountingCodeRouter = require("./Src/modules/AccountingCode/Routes/AccountingCodeRouter");
const TaxRouter = require("./Src/modules/Tax/Routes/TaxRouter");
const PaymentRouter = require("./Src/modules/Payment/Routes/PaymentRouter");
const LedgerRouter = require("./Src/modules/Ledger/Routes/LedgerRouter");
const app = express();
const PORT = process.env.PORT || 5000;

app.use(helmet()); // Security headers
app.use(cors({ origin: "*" })); // Adjust in production
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.use("/api/admin", AdminRouter);
app.use("/api/branch", BranchRouter);
app.use("/api/country-manager", CountryManagerRouter);
app.use("/api/finance-admin", FinanceAdminRouter);
app.use("/api/operational-admin", OperationAdminRouter);
app.use("/api/branch-manager", BranchManagerRouter);
app.use("/api/user", UserRouter);
app.use("/api/operation-staff", OperationStaffRouter);
app.use("/api/finance-staff", FinanceStaffRouter);
app.use("/api/workshop-staff", WorkshopStaffRouter);
app.use("/api/purchase-order", PurchaseOrderRouter);
app.use("/api/vehicle", VehicleRouter);
app.use("/api/supplier", SupplierRouter);
app.use("/api/accounting-code", AccountingCodeRouter);
app.use("/api/tax", TaxRouter);
app.use("/api/payment", PaymentRouter);
app.use("/api/ledger", LedgerRouter);


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