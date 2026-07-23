require("dotenv").config(); // 1️⃣ Always load first
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const swaggerUi = require("swagger-ui-express");
const swaggerSpec = require("./Src/config/swagger.config");
const connectDB = require("./Src/config/dbConfig");
const { createDefaultAdmin } = require("./Src/bootstrap/createDefaultAdmin");
const {
  createDefaultMerchendise,
} = require("./Src/bootstrap/createDefaultMerchendise");
const { seedSystemSettings } = require("./Src/bootstrap/seedSystemSettings");
const {
  seedFinancePermissions,
} = require("./Src/bootstrap/seedFinancePermissions");
const {
  seedBranchPermissions,
} = require("./Src/bootstrap/seedBranchPermissions");
const { seedAccountingCodes } = require("./Src/bootstrap/seedAccountingCodes");
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
const WorkshopManagerRouter = require("./Src/modules/WorkshopManager/Routes/WorkshopManagerRoutes");
const WorkshopRouter = require("./Src/modules/Workshop/Routes/WorkshopRoutes");
const MerchendiseRouter = require("./Src/modules/Merchendise/Routes/MerchendiseRoutes");

const PurchaseOrderRouter = require("./Src/modules/PurchaseOrder/Routes/PurchaseOrderRouter");
const VehicleRouter = require("./Src/modules/Vehicle/Routes/VehicleRouter");
const FleetRouter = require("./Src/modules/Fleet/Routes/FleetRouter");
const SupplierRouter = require("./Src/modules/Supplier/Routes/SupplierRouter");
const AccountingCodeRouter = require("./Src/modules/AccountingCode/Routes/AccountingCodeRouter");
const TaxRouter = require("./Src/modules/Tax/Routes/TaxRouter");
const PaymentRouter = require("./Src/modules/Payment/Routes/PaymentRouter");
const LedgerRouter = require("./Src/modules/Ledger/Routes/LedgerRouter");
const VoucherRouter = require("./Src/modules/Ledger/Routes/VoucherRoutes");
const AccountingRouter = require("./Src/modules/Ledger/Routes/AccountingRouter");
const DriverRouter = require("./Src/modules/Driver/Routes/DriverRouter");
const WorkOrderRouter = require("./Src/modules/WorkOrder/Routes/WorkOrderRouter");
const TaskTemplateRouter = require("./Src/modules/TaskTemplate/Routes/TaskTemplateRouter");
const InventoryRouter = require("./Src/modules/Inventory/Routes/InventoryRouter");
const WriteOffRouter = require("./Src/modules/Inventory/Routes/WriteOffRouter");
const ServiceBillRouter = require("./Src/modules/ServiceBill/Routes/ServiceBillRouter");
const InsuranceClaimRouter = require("./Src/modules/InsuranceClaim/Routes/InsuranceClaimRouter");
const InsuranceRouter = require("./Src/modules/Insurance/Routes/InsuranceRoutes");
const VehiclePolicyRouter = require("./Src/modules/Insurance/Routes/VehiclePolicyRoutes");
const SystemSettingsRouter = require("./Src/modules/SystemSettings/Routes/SystemSettingsRoutes");
const AgreementRouter = require("./Src/modules/Agreement/Routes/AgreementRouter");
const AIRouter = require("./Src/modules/AI/Routes/AiRoutes");
const StaffPerformanceRouter = require("./Src/modules/StaffPerformance/Routes/staffPerformanceRoutes");
const PagoFacilRouter = require("./Src/modules/Payment/Routes/PagoFacilRouter");
const InvoiceRouter = require("./Src/modules/Invoice/Routes/InvoiceRoutes");
const AlertRouter = require("./Src/modules/Alert/Routes/AlertRoutes");
const DriverAuthRouter = require("./Src/modules/DriverAuth/Routes/DriverAuthRouter");
const ReportingRouter = require("./Src/modules/Reporting/Routes/ReportingRouter");
const SalaryRouter = require("./Src/modules/Salary/Routes/SalaryRoutes");
const BankAccountRouter = require("./Src/modules/BankAccount/Routes/BankAccountRoutes");
const VoiceRoutes = require("./Src/modules/Voice/Routes/VoiceRoutes");
const WorkshopProcurementRouter = require("./Src/modules/WorkshopProcurement/Routes/WorkshopProcurementRouter");
const ScrapRouter = require("./Src/modules/Scrap/Routes/ScrapRoutes");
const {
  initAlertScheduler,
} = require("./Src/modules/Alert/Service/AlertScheduler");
const {
  startInvoiceCronJob,
} = require("./Src/modules/Invoice/Service/InvoiceCronService");
const {
  initOutboundCallScheduler,
} = require("./Src/modules/Voice/Scheduler/OutboundCallScheduler");
const {
  startFixedAssetCronJob,
} = require("./Src/modules/FixedAsset/Service/FixedAssetCronService");
const {
  startDashboardCronJob,
} = require("./Src/modules/Dashboard/Service/DashboardCronService");
const DashboardRouter = require("./Src/modules/Dashboard/Routes/DashboardRouter");
const CollectionRouter = require("./Src/modules/Collection/Routes/CollectionRoutes");
const EnquiryRouter = require("./Src/modules/Enquiry/Routes/EnquiryRoutes");
const AccidentReportRouter = require("./Src/modules/AccidentReport/Routes/AccidentReportRoutes");
const PaymentRequestRouter = require("./Src/modules/PaymentRequest/Routes/PaymentRequestRouter");
const CustomerRouter = require("./Src/modules/Customer/Routes/CustomerRoutes");
const QuoteRouter = require("./Src/modules/Quote/Routes/QuoteRoutes");
const SalesOrderRouter = require("./Src/modules/SalesOrder/Routes/SalesOrderRoutes");
const CreditNoteRouter = require("./Src/modules/CreditNote/Routes/CreditNoteRoutes");
const PaymentReceivedRouter = require("./Src/modules/PaymentReceived/Routes/PaymentReceivedRoutes");
const ExpenseRouter = require("./Src/modules/Expense/Routes/ExpenseRoutes");
const RecurringTransactionRouter = require("./Src/modules/RecurringTransaction/Routes/RecurringTransactionRoutes");
const PaymentMadeRouter = require("./Src/modules/PaymentMade/Routes/PaymentMadeRoutes");
const VendorCreditRouter = require("./Src/modules/VendorCredit/Routes/VendorCreditRoutes");
const BillRouter = require("./Src/modules/Bill/Routes/BillRoutes");
const FixedAssetRouter = require("./Src/modules/FixedAsset/Routes/FixedAssetRoutes");
const FixedAssetTypeRouter = require("./Src/modules/FixedAsset/Routes/FixedAssetTypeRoutes");
const GpsRouter = require("./Src/modules/Gps/Routes/GpsRouter");
const mongoose = require("mongoose");
const app = express();
const PORT = process.env.PORT || 5000;

setTimeout(() => {
  const http = require('http');
  console.log("[DIAGNOSTICS] Requesting /api/reporting/diag-bg-public to trigger debug dump...");
  http.get('http://localhost:3000/api/reporting/diag-bg-public', (res) => {
    console.log("[DIAGNOSTICS] Public endpoint hit status:", res.statusCode);
  }).on('error', (e) => {
    console.error("[DIAGNOSTICS] Self-request failed:", e.message);
  });
}, 10000);

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          "https://cdnjs.cloudflare.com",
        ],
        styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
        imgSrc: ["'self'", "data:", "https://cdnjs.cloudflare.com"],
        connectSrc: ["'self'"],
      },
    },
  }),
); // Security headers with Swagger support
app.use(cors({ origin: "*" })); // Adjust in production
app.use(
  "/uploads",
  (req, res, next) => {
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    next();
  },
  express.static(require("path").join(__dirname, "uploads")),
);
app.use(express.json({ limit: "100mb" }));
app.use((req, res, next) => {
  console.log(`[REQUEST] ${req.method} ${req.url}`);
  next();
});
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    return res.status(400).json({
      success: false,
      message:
        "Invalid JSON format. Please check your request body for syntax errors (e.g., trailing commas).",
    });
  }
  next(err);
});
app.use(express.urlencoded({ extended: true }));

app.get("/api/proxy-download", async (req, res) => {
  const fileUrl = req.query.url;
  if (!fileUrl) {
    return res.status(400).json({ error: "Missing url parameter" });
  }

  try {
    const parsedUrl = new URL(fileUrl);
    const allowedHost = "ola-cars-uploads-2026.s3.ap-south-1.amazonaws.com";
    if (parsedUrl.host !== allowedHost) {
      return res.status(403).json({ error: "Host not allowed" });
    }

    const response = await fetch(fileUrl);
    if (!response.ok) {
      return res
        .status(response.status)
        .json({
          error: `Failed to fetch file from source: ${response.statusText}`,
        });
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    res.setHeader(
      "Content-Type",
      response.headers.get("content-type") || "application/octet-stream",
    );
    const filename = fileUrl.split("/").pop() || "download";
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (error) {
    console.error("Proxy download failed:", error.message);
    res.status(500).json({ error: "Failed to download file" });
  }
});

app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

console.log("[DEBUG] Mounting ReportingRouter at /api/reporting");
app.use("/api/reporting", ReportingRouter);
app.use("/api/workshop-procurement", WorkshopProcurementRouter);
app.use("/api/scrap", ScrapRouter);

app.use("/api/admin", AdminRouter);
app.use("/api/branch", BranchRouter);
app.use("/api/country-manager", CountryManagerRouter);
app.use("/api/finance-admin", FinanceAdminRouter);
app.use("/api/operational-admin", OperationAdminRouter);
app.use("/api/branch-manager", BranchManagerRouter);
app.use("/api/user", UserRouter);
app.use("/api/merchendise", MerchendiseRouter);
app.use("/api/operation-staff", OperationStaffRouter);
app.use("/api/finance-staff", FinanceStaffRouter);
app.use("/api/workshop-staff", WorkshopStaffRouter);
app.use("/api/workshop-manager", WorkshopManagerRouter);
app.use("/api/workshop", WorkshopRouter);
app.use("/api/purchase-order", PurchaseOrderRouter);
app.use("/api/vehicle", VehicleRouter);
app.use("/api/fleet", FleetRouter);
app.use("/api/supplier", SupplierRouter);
app.use("/api/accounting-code", AccountingCodeRouter);
app.use("/api/tax", TaxRouter);
app.use("/api/payment", PaymentRouter);
app.use("/api/ledger", LedgerRouter);
app.use("/api/vouchers", VoucherRouter);
app.use("/api/accounting", AccountingRouter);
app.use("/api/driver", DriverRouter);
app.use("/api/work-orders", WorkOrderRouter);
app.use("/api/task-templates", TaskTemplateRouter);
app.use("/api/inventory", InventoryRouter);
app.use("/api/write-offs", WriteOffRouter);
app.use("/api/service-bills", ServiceBillRouter);
app.use("/api/insurance-claims", InsuranceClaimRouter);
app.use("/api/insurance", InsuranceRouter);
app.use("/api/vehicle-policy", VehiclePolicyRouter);
app.use("/api/system-settings", SystemSettingsRouter);
app.use("/api/agreements", AgreementRouter);
app.use("/api/ai-service", AIRouter);
app.use("/api/staff-performance", StaffPerformanceRouter);
app.use("/pagofacil/api", PagoFacilRouter);
app.use("/api/invoices", InvoiceRouter);
app.use("/api/alerts", AlertRouter);
app.use("/api/dashboard", DashboardRouter);
app.use("/api/gps", GpsRouter);
app.use("/api/enquiries", EnquiryRouter);
app.use("/api/accident-reports", AccidentReportRouter);
app.use("/api/payment-requests", PaymentRequestRouter);
app.use("/api/collections", CollectionRouter);
app.use("/api/driver-auth", DriverAuthRouter);
app.use("/api/salaries", SalaryRouter);
app.use("/api/bank-accounts", BankAccountRouter);
app.use("/api/voice", VoiceRoutes);
app.use("/api/customers", CustomerRouter);
app.use("/api/quotes", QuoteRouter);
app.use("/api/sales-orders", SalesOrderRouter);
app.use("/api/credit-notes", CreditNoteRouter);
app.use("/api/payments-received", PaymentReceivedRouter);
app.use("/api/expenses", ExpenseRouter);
app.use("/api/recurring-transactions", RecurringTransactionRouter);
app.use("/api/payments-made", PaymentMadeRouter);
app.use("/api/vendor-credits", VendorCreditRouter);
app.use("/api/bills", BillRouter);
app.use("/api/fixed-assets", FixedAssetRouter);
app.use("/api/fixed-asset-types", FixedAssetTypeRouter);
app.use("/api/gps", GpsRouter);

app.get("/diag-test", async (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');
    const AccountingCode = mongoose.model('AccountingCode');
    const LedgerEntry = mongoose.model('LedgerEntry');

    const allCodes = await AccountingCode.find({
      $or: [
        { accountType: { $in: ['Cash', 'Bank'] } },
        { name: /cash|bank|banco/i },
        { category: 'ASSET' }
      ]
    });

    const bgAccount = await AccountingCode.findOne({
      $or: [
        { name: /2654/ },
        { code: /2654/ }
      ]
    });

    let details = {};
    if (bgAccount) {
      const bgEntries = await LedgerEntry.find({ accountingCode: bgAccount._id }).sort({ entryDate: 1, createdAt: 1 });
      
      let systemBal = 0;
      const seen = new Set();
      const uniqueEntries = [];
      const duplicateEntries = [];

      const bgMapped = bgEntries.map(e => {
        const amt = e.amount || 0;
        const sign = e.type === 'DEBIT' ? 1 : -1;
        systemBal += (amt * sign);
        
        // Define a unique key for duplicate detection
        const dateStr = new Date(e.entryDate).toISOString().split('T')[0];
        const uniqueKey = `${dateStr}_${e.type}_${amt}_${(e.description || '').toLowerCase().trim()}`;
        
        const isDup = seen.has(uniqueKey);
        const mappedEntry = {
          id: e._id,
          entryDate: e.entryDate,
          type: e.type,
          amount: e.amount,
          description: e.description,
          createdAt: e.createdAt,
          isDuplicate: isDup
        };

        if (isDup) {
          duplicateEntries.push(mappedEntry);
        } else {
          seen.add(uniqueKey);
          uniqueEntries.push(mappedEntry);
        }

        return mappedEntry;
      });

      // Calculate running balance on unique entries only
      let uniqueBal = 0;
      const uniqueMapped = uniqueEntries.map(e => {
        const amt = e.amount || 0;
        const sign = e.type === 'DEBIT' ? 1 : -1;
        uniqueBal += (amt * sign);
        return {
          ...e,
          runningBalance: uniqueBal
        };
      });

      details = {
        account: bgAccount,
        systemBalance: systemBal,
        uniqueBalance: uniqueBal,
        totalEntriesCount: bgEntries.length,
        uniqueEntriesCount: uniqueEntries.length,
        duplicatesCount: duplicateEntries.length,
        duplicateEntriesSample: duplicateEntries.slice(0, 10),
        uniqueEntriesWithRunningBalance: uniqueMapped
      };
      
      fs.writeFileSync(path.join(__dirname, 'tmp/banco_general_debug.json'), JSON.stringify(details, null, 2));
    } else {
      details = {
        error: "Account containing 2654 not found",
        allCodesFound: allCodes.map(c => c.name)
      };
      fs.writeFileSync(path.join(__dirname, 'tmp/banco_general_debug.json'), JSON.stringify(details, null, 2));
    }

    res.status(200).json({
      status: bgAccount ? "success" : "error",
      account: bgAccount,
      balance: bgAccount ? uniqueBal : 0,
      entries: bgAccount ? uniqueMapped : [],
      allBankCodes: allCodes.map(c => ({ id: c._id, name: c.name, code: c.code })),
      message: bgAccount ? undefined : "Account containing 2654 not found",
      success: true,
      bgAccountDetails: details
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/health", (req, res) => {
  res.status(200).json({ status: "OK" });
});

app.use((err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  const message = err.isOperational ? err.message : "Internal Server Error";

  if (statusCode === 500) {
    console.error(err.stack);
  }

  res.status(statusCode).json({
    success: false,
    message: message,
  });
});

const startServer = async () => {
  try {
    await connectDB();
    console.log("Database connected successfully");

    // Drop deprecated policyNumber index if it exists
    try {
      const collections = await mongoose.connection.db
        .listCollections({ name: "insurances" })
        .toArray();
      if (collections.length > 0) {
        await mongoose.connection.db
          .collection("insurances")
          .dropIndex("policyNumber_1")
          .catch(() => {});
        console.log("Verified/Dropped deprecated policyNumber index");
      }
    } catch (e) {
      // Ignore if index doesn't exist
    }

    await createDefaultAdmin();
    console.log("Default admin verified");

    await createDefaultMerchendise();
    console.log("Default merchandiser verified/seeded");

    await seedSystemSettings();
    console.log("System settings verified/seeded");

    await seedFinancePermissions();
    console.log("Finance permissions verified/seeded");

    await seedBranchPermissions();
    console.log("Branch permissions verified/seeded");

    await seedAccountingCodes();
    console.log("Essential accounting codes verified/seeded");

    const FixedAssetTypeService = require("./Src/modules/FixedAsset/Service/FixedAssetTypeService");
    await FixedAssetTypeService.seedDefaultFixedAssetTypes();
    console.log("Default Fixed Asset Types verified/seeded");

    if (process.env.ENABLE_INTERNAL_CRON !== "false") {
      initAlertScheduler();
      startInvoiceCronJob();
      initOutboundCallScheduler();
      startFixedAssetCronJob();
      startDashboardCronJob();
      console.log(
        "Internal cron schedulers (Alerts, Invoices, Outbound Calls, Fixed Assets, Dashboard Cache) started",
      );
    } else {
      console.log("Internal cron scheduler disabled (using external service)");
    }

    // Start historical precomputation backfill since 2025-01-01 in the background
    const startHistoricalBackfill = async () => {
      try {
        const { precomputeForDateRange } = require("./Src/modules/Dashboard/Service/DashboardPrecomputeService");
        const moment = require("moment");
        const startDate = moment("2025-01-01").startOf("day").toDate();
        const endDate = moment().subtract(1, "day").startOf("day").toDate();
        console.log("[Dashboard Cache] Starting background historical precomputation backfill since 2025-01-01...");
        precomputeForDateRange(startDate, endDate).catch(err => {
          console.error("[Dashboard Cache] Background backfill failed:", err);
        });
      } catch (err) {
        console.error("[Dashboard Cache] Error initiating backfill:", err);
      }
    };
    startHistoricalBackfill();

    // Run Startup Diagnostics
    app.listen(PORT, "0.0.0.0", () => {
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
// Trigger nodemon reload after adding Invoice Registry PDF route

