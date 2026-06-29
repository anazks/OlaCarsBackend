const mongoose = require("mongoose");
const path = require("path");
const XLSX = require("xlsx");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const Branch = require("../Src/modules/Branch/Model/BranchModel");
const AccountingCode = require("../Src/modules/AccountingCode/Model/AccountingCodeModel");
const LedgerEntry = require("../Src/modules/Ledger/Model/LedgerEntryModel");
const LedgerBulkUploadService = require("../Src/modules/Ledger/Service/LedgerBulkUploadService");
const LedgerImportService = require("../Src/modules/Ledger/Service/LedgerImportService");

async function verify() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected to MongoDB.");

        // 1. Prepare/ensure branches
        let panamaBranch = await Branch.findOne({ code: "PANAMA" });
        if (!panamaBranch) {
            panamaBranch = await Branch.create({
                name: "Panama",
                code: "PANAMA",
                type: "BRANCH",
                phone: "1234567890",
                createdBy: new mongoose.Types.ObjectId(),
                creatorRole: "ADMIN"
            });
            console.log("Created Panama Branch.");
        }
        let workshopBranch = await Branch.findOne({ code: "JUC" });
        if (!workshopBranch) {
            workshopBranch = await Branch.create({
                name: "Panama",
                code: "JUC",
                type: "WORKSHOP",
                phone: "0987654321",
                createdBy: new mongoose.Types.ObjectId(),
                creatorRole: "ADMIN"
            });
            console.log("Created Workshop Branch.");
        }

        // 2. Ensure Accounting Code
        let cashAccount = await AccountingCode.findOne({ name: "Cash", isDeleted: false });
        if (!cashAccount) {
            cashAccount = await AccountingCode.create({
                name: "Cash",
                code: "CASH_TEST",
                category: "ASSET",
                createdBy: new mongoose.Types.ObjectId(),
                creatorRole: "ADMIN"
            });
            console.log("Created Cash Accounting Code.");
        }

        // 3. Construct test rows
        const testRows = [
            {
                "Entry Date": "2026-06-29",
                "Account Name": "Cash",
                "Type (Debit/Credit)": "Debit",
                "Amount": 100.00,
                "Description": "HO Deposit",
                "Transaction Type": "Deposit",
                "location_name": "Head Office",
                "transaction_id": "TXN-HO-12345"
            },
            {
                "Entry Date": "2026-06-30",
                "Account Name": "Cash",
                "Type (Debit/Credit)": "Debit",
                "Amount": 200.00,
                "Description": "Workshop Deposit",
                "Transaction Type": "Deposit",
                "location_name": "OLA WORKSHOP",
                "transaction_id": "TXN-WS-9999"
            }
        ];

        // Let's create an XLSX buffer
        const worksheet = XLSX.utils.json_to_sheet(testRows);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Ledger Template");
        const fileBuffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

        // Clean up previous entries with test transaction IDs
        await LedgerEntry.deleteMany({ transactionId: { $in: ["TXN-HO-12345", "TXN-WS-9999"] } });
        console.log("Cleaned up old test ledger entries.");

        const creatorId = new mongoose.Types.ObjectId();

        console.log("\n--- Testing LedgerBulkUploadService (background process) ---");
        const importId = await LedgerBulkUploadService.processImport(
            fileBuffer,
            { createdBy: creatorId, creatorRole: "ADMIN", fileName: "test_upload.xlsx" },
            false
        );
        console.log("Import started, importId:", importId);

        // Wait a few seconds for background process to finish
        console.log("Waiting for background task...");
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Let's check status
        const progress = global.importProgress[importId];
        console.log("Progress status:", progress ? progress.status : "undefined", "errors:", progress ? progress.errors : []);

        // Load the entries inserted from DB
        const entries = await LedgerEntry.find({ transactionId: { $in: ["TXN-HO-12345", "TXN-WS-9999"] } }).populate("branch");
        console.log(`\nFound ${entries.length} entries in DB.`);

        for (const entry of entries) {
            console.log("\nEntry:");
            console.log("  Date:", entry.entryDate.toISOString().split("T")[0]);
            console.log("  Transaction ID:", entry.transactionId);
            console.log("  Description:", entry.description);
            console.log("  Branch Code:", entry.branch ? entry.branch.code : "null");
            console.log("  Branch Type:", entry.branch ? entry.branch.type : "null");

            // Verify logic
            if (entry.transactionId === "TXN-HO-12345") {
                const isDateOk = entry.entryDate.toISOString().split("T")[0] === "2026-06-29";
                const isBranchOk = entry.branch && entry.branch.code === "PANAMA" && entry.branch.type === "BRANCH";
                const isDescOk = entry.description.includes("Transaction ID: TXN-HO-12345");
                console.log(`  HO checks: Date Ok=${isDateOk}, Branch Ok=${isBranchOk}, Desc Ok=${isDescOk}`);
            } else if (entry.transactionId === "TXN-WS-9999") {
                const isDateOk = entry.entryDate.toISOString().split("T")[0] === "2026-06-30";
                const isBranchOk = entry.branch && entry.branch.code === "JUC" && entry.branch.type === "WORKSHOP";
                const isDescOk = entry.description.includes("Transaction ID: TXN-WS-9999");
                console.log(`  WS checks: Date Ok=${isDateOk}, Branch Ok=${isBranchOk}, Desc Ok=${isDescOk}`);
            }
        }

        // Clean up testing entries
        await LedgerEntry.deleteMany({ transactionId: { $in: ["TXN-HO-12345", "TXN-WS-9999"] } });
        console.log("\nCleaned up testing ledger entries.");

    } catch (error) {
        console.error("Verification failed:", error);
    } finally {
        await mongoose.connection.close();
    }
}

verify();
