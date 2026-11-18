const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../../.env") });
const connectDB = require("../config/dbConfig");

const { Invoice } = require("../modules/Invoice/Model/InvoiceModel");
const Bill = require("../modules/Bill/Model/BillModel");
const DebitNote = require("../modules/DebitNote/Model/DebitNoteModel");
const CreditNote = require("../modules/CreditNote/Model/CreditNoteModel");
const BankTransaction = require("../modules/BankAccount/Model/BankTransactionModel");
const SystemUpload = require("../modules/StaffPerformance/Model/SystemUploadModel");
const StaffActivityLog = require("../modules/StaffPerformance/Model/StaffActivityLogModel");

async function cleanup() {
    await connectDB();
    console.log("Connected to MongoDB for cleanup.");

    const [delInv, delBill, delDN, delCN, delTx, delUp, delLog] = await Promise.all([
        Invoice.deleteMany({ invoiceNumber: /^INV-2026-1118-/ }),
        Bill.deleteMany({ billNumber: /^BILL-2026-1118-/ }),
        DebitNote.deleteMany({ debitNoteNumber: /^DN-2026-1118-/ }),
        CreditNote.deleteMany({ creditNoteNumber: /^CN-2026-1118-/ }),
        BankTransaction.deleteMany({ transactionId: /^TXN-1118-/ }),
        SystemUpload.deleteMany({}),
        StaffActivityLog.deleteMany({})
    ]);

    console.log("Cleanup Results:");
    console.log(`- Deleted Dummy Invoices: ${delInv.deletedCount}`);
    console.log(`- Deleted Dummy Bills: ${delBill.deletedCount}`);
    console.log(`- Deleted Dummy Debit Notes: ${delDN.deletedCount}`);
    console.log(`- Deleted Dummy Credit Notes: ${delCN.deletedCount}`);
    console.log(`- Deleted Dummy Bank Transactions: ${delTx.deletedCount}`);
    console.log(`- Cleared System Upload Records: ${delUp.deletedCount}`);
    console.log(`- Cleared Staff Activity Logs: ${delLog.deletedCount}`);
    console.log("\nDatabase is now clean and ready for real-time testing across accounts.");

    process.exit(0);
}

cleanup().catch(err => {
    console.error("Cleanup error:", err);
    process.exit(1);
});

