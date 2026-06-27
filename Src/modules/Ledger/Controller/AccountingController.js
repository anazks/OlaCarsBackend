const XLSX = require("xlsx");
const ImportHistory = require("../Model/ImportHistoryModel");
const { processImport } = require("../Service/LedgerBulkUploadService");

// 1. Starts bulk ledger import in the background
exports.importLedger = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: "No Excel or CSV file provided." });
        }

        const createdBy = req.user._id || req.user.id;
        const creatorRole = req.user.role ? req.user.role.toUpperCase() : "ADMIN";
        const fileName = req.file.originalname;
        const skipDuplicates = req.body.skipDuplicates === "true" || req.body.skipDuplicates === true;

        const importId = await processImport(
            req.file.buffer,
            { createdBy, creatorRole, fileName },
            skipDuplicates
        );

        return res.status(200).json({
            success: true,
            message: "Import process started in background.",
            importId,
        });
    } catch (error) {
        console.error("[AccountingController] importLedger failed:", error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

// 2. Polls upload progress from memory or DB document fallback
exports.getImportProgress = async (req, res) => {
    try {
        const { importId } = req.params;

        // Try memory first
        if (global.importProgress && global.importProgress[importId]) {
            const progress = global.importProgress[importId];
            return res.status(200).json({ success: true, data: progress });
        }

        // Fallback to Database document
        const history = await ImportHistory.findById(importId).lean();
        if (!history) {
            return res.status(404).json({ success: false, message: "Import session not found." });
        }

        // Reconstruct progress structure from DB entry
        const progress = {
            status: history.status,
            percent: 100,
            message: history.status === "COMPLETED" ? "Import Completed Successfully" : "Process failed",
            totalRows: history.totalRows,
            completedRows: history.completedRows,
            failedRows: history.failedRows,
            duration: history.duration,
            errors: history.errors || [],
        };

        return res.status(200).json({ success: true, data: progress });
    } catch (error) {
        console.error("[AccountingController] getImportProgress failed:", error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

// 3. Generates and downloads a pre-populated Excel sample template
exports.getSampleExcel = async (req, res) => {
    try {
        const headers = [
            "Entry Date",
            "Account Name",
            "Type (Debit/Credit)",
            "Amount",
            "Description",
            "Transaction Type",
            "Contact",
            "Branch",
            "Voucher",
            "Tax",
        ];

        const sampleRows = [
            {
                "Entry Date": "2026-06-26",
                "Account Name": "Cash",
                "Type (Debit/Credit)": "Debit",
                "Amount": 1500.00,
                "Description": "Opening Balance Transfer",
                "Transaction Type": "Opening Balance",
                "Contact": "John Doe",
                "Branch": "Main Branch",
                "Voucher": "V-001",
                "Tax": "7%",
            },
            {
                "Entry Date": "2026-06-27",
                "Account Name": "Cost Of Goods Sold",
                "Type (Debit/Credit)": "Debit",
                "Amount": 350.00,
                "Description": "Purchased workshop components",
                "Transaction Type": "Purchase",
                "Contact": "Supplier Corp",
                "Branch": "Panama Workshop",
                "Voucher": "V-002",
                "Tax": "15%",
            },
            {
                "Entry Date": "2026-06-27",
                "Account Name": "Accounts Payable",
                "Type (Debit/Credit)": "Credit",
                "Amount": 350.00,
                "Description": "Liability for workshop components",
                "Transaction Type": "Journal",
                "Contact": "Supplier Corp",
                "Branch": "Panama Workshop",
                "Voucher": "V-002",
                "Tax": "0%",
            }
        ];

        const worksheet = XLSX.utils.json_to_sheet(sampleRows, { header: headers });
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Ledger Template");

        // Set column widths for readability
        const wscols = [
            { wch: 15 }, // Date
            { wch: 22 }, // Account Name
            { wch: 22 }, // Debit/Credit Type
            { wch: 12 }, // Amount
            { wch: 30 }, // Description
            { wch: 18 }, // Transaction Type
            { wch: 18 }, // Contact
            { wch: 18 }, // Branch
            { wch: 12 }, // Voucher
            { wch: 10 }, // Tax
        ];
        worksheet["!cols"] = wscols;

        const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

        res.setHeader("Content-Disposition", 'attachment; filename="ledger_bulk_upload_sample.xlsx"');
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        return res.send(buffer);
    } catch (error) {
        console.error("[AccountingController] getSampleExcel failed:", error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

// 4. Returns previous bulk import sessions
exports.getImportHistory = async (req, res) => {
    try {
        const historyList = await ImportHistory.find()
            .populate("startedBy", "name email")
            .sort({ startTime: -1 })
            .limit(50)
            .lean();

        return res.status(200).json({ success: true, data: historyList });
    } catch (error) {
        console.error("[AccountingController] getImportHistory failed:", error);
        return res.status(500).json({ success: false, message: error.message });
    }
};
