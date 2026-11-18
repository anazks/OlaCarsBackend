const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../../.env") });
const connectDB = require("../config/dbConfig");

// Import Models
const FinanceStaff = require("../modules/FinanceStaff/Model/FinanceStaffModel");
const OperationStaff = require("../modules/OperationStaff/Model/OperationStaffModel");
const BranchManager = require("../modules/BranchManager/Model/BranchManagerModel");
const CountryManager = require("../modules/CountryManager/Model/CountryManagerModel");
const FinanceAdmin = require("../modules/FinanceAdmin/model/FinanceAdminModel");
const Branch = require("../modules/Branch/Model/BranchModel");
const Customer = require("../modules/Customer/Model/CustomerModel");
const Supplier = require("../modules/Supplier/Model/SupplierModel");
const BankAccount = require("../modules/BankAccount/Model/BankAccountModel");
const { Driver } = require("../modules/Driver/Model/DriverModel");
const { Vehicle } = require("../modules/Vehicle/Model/VehicleModel");

const { Invoice } = require("../modules/Invoice/Model/InvoiceModel");
const Bill = require("../modules/Bill/Model/BillModel");
const DebitNote = require("../modules/DebitNote/Model/DebitNoteModel");
const CreditNote = require("../modules/CreditNote/Model/CreditNoteModel");
const BankTransaction = require("../modules/BankAccount/Model/BankTransactionModel");
const SystemUpload = require("../modules/StaffPerformance/Model/SystemUploadModel");
const StaffActivityLog = require("../modules/StaffPerformance/Model/StaffActivityLogModel");

async function seed() {
    await connectDB();
    console.log("Connected to MongoDB successfully.");

    // Reference data
    const [branches, customers, suppliers, bankAccounts, drivers, vehicles] = await Promise.all([
        Branch.find({ isDeleted: false }).lean(),
        Customer.find({ isDeleted: false }).lean(),
        Supplier.find({ isDeleted: false }).lean(),
        BankAccount.find({ isDeleted: false }).lean(),
        Driver.find({ isDeleted: false }).lean(),
        Vehicle.find({ isDeleted: false }).lean()
    ]);

    const defaultBranch = branches[0] || { _id: new mongoose.Types.ObjectId(), name: "Main Hub" };
    const defaultCust = customers[0] || { _id: new mongoose.Types.ObjectId() };
    const defaultSupp = suppliers[0] || { _id: new mongoose.Types.ObjectId() };
    const defaultBank = bankAccounts[0] || { _id: new mongoose.Types.ObjectId() };
    const defaultDriver = drivers[0] || null;
    const defaultVehicle = vehicles[0] || null;

    const Admin = require("../modules/Admin/model/adminModel");
    const adminUser = await Admin.findOne({ isDeleted: false });
    const adminId = adminUser ? adminUser._id : new mongoose.Types.ObjectId();

    // Ensure we have active staff across roles
    let finStaff = await FinanceStaff.findOne({ isDeleted: false });
    if (!finStaff) {
        finStaff = await FinanceStaff.create({
            fullName: "Efron Finance",
            email: "financestaff@olacars.com",
            phone: "+507 6000-1111",
            branchId: defaultBranch._id,
            status: "ACTIVE",
            passwordHash: "$2b$10$xyzFakeHash1234567890",
            createdBy: adminId,
            creatorRole: "ADMIN"
        });
    }

    let opStaff = await OperationStaff.findOne({ isDeleted: false });
    if (!opStaff) {
        opStaff = await OperationStaff.create({
            fullName: "Carlos Mendez",
            email: "carlos.ops@olacars.com",
            phone: "+507 6222-3333",
            branchId: defaultBranch._id,
            status: "ACTIVE",
            passwordHash: "$2b$10$xyzFakeHash1234567890",
            createdBy: adminId,
            creatorRole: "ADMIN"
        });
    }

    let branchMgr = await BranchManager.findOne({ isDeleted: false });
    if (!branchMgr) {
        branchMgr = await BranchManager.create({
            fullName: "Anas Branch Manager",
            email: "branchmanager2026@olacars.com",
            phone: "+507 6333-4444",
            branchId: defaultBranch._id,
            status: "ACTIVE",
            passwordHash: "$2b$10$xyzFakeHash1234567890",
            createdBy: adminId,
            creatorRole: "ADMIN"
        });
    }

    let finAdmin = await FinanceAdmin.findOne({ isDeleted: false });
    if (!finAdmin) {
        finAdmin = await FinanceAdmin.create({
            fullName: "Sofia HQ Finance",
            email: "financialadmin@olacars.com",
            phone: "+507 6444-5555",
            status: "ACTIVE",
            passwordHash: "$2b$10$xyzFakeHash1234567890",
            createdBy: adminId,
            creatorRole: "ADMIN"
        });
    }

    const staffPool = [
        { staff: finStaff, role: "FINANCESTAFF", name: finStaff.fullName, branchId: finStaff.branchId },
        { staff: opStaff, role: "OPERATIONSTAFF", name: opStaff.fullName, branchId: opStaff.branchId },
        { staff: branchMgr, role: "BRANCHMANAGER", name: branchMgr.fullName, branchId: branchMgr.branchId },
        { staff: finAdmin, role: "FINANCEADMIN", name: finAdmin.fullName, branchId: defaultBranch._id }
    ];

    console.log(`Populating daily work dummy data across ${staffPool.length} staff accounts...`);

    // Today's timeline starting from 5:00 AM IST
    const today = new Date();
    // Set to today 5:00 AM IST (which is UTC + 5:30)
    const baseStartTime = new Date(today);
    baseStartTime.setHours(5, 0, 0, 0);

    const timeOffsetsMinutes = [
        15,  // 05:15 AM
        35,  // 05:35 AM
        60,  // 06:00 AM
        95,  // 06:35 AM
        130, // 07:10 AM
        165, // 07:45 AM
        210, // 08:30 AM
        255, // 09:15 AM
        290, // 09:50 AM
        320, // 10:20 AM
        350, // 10:50 AM
        380, // 11:20 AM
    ];

    const getTime = (idx) => {
        const offset = timeOffsetsMinutes[idx % timeOffsetsMinutes.length] || (idx * 25);
        return new Date(baseStartTime.getTime() + offset * 60 * 1000);
    };

    // 1. Seed Invoices
    const invoiceSeeds = [
        { num: "INV-2026-1118-001", total: 450, subtotal: 420, type: "MANUAL", note: "Fleet Rental Charge Nov 18", userIdx: 0, timeIdx: 0 },
        { num: "INV-2026-1118-002", total: 1250, subtotal: 1200, type: "WORKSHOP", note: "Engine Maintenance & Overhaul", userIdx: 0, timeIdx: 1 },
        { num: "INV-2026-1118-003", total: 850, subtotal: 800, type: "MANUAL", note: "Corporate Fleet Lease Deposit", userIdx: 1, timeIdx: 2 },
        { num: "INV-2026-1118-004", total: 320, subtotal: 300, type: "MANUAL", note: "Weekly Rental Settlement", userIdx: 2, timeIdx: 3 },
        { num: "INV-2026-1118-005", total: 2100, subtotal: 2000, type: "MANUAL", note: "Fleet Insurance Prepayment", userIdx: 3, timeIdx: 4 },
        { num: "INV-2026-1118-006", total: 600, subtotal: 560, type: "MANUAL", note: "Driver Lease Regular Billing", userIdx: 0, timeIdx: 5 },
        { num: "INV-2026-1118-007", total: 1450, subtotal: 1350, type: "WORKSHOP", note: "Body Repair & Paint Job", userIdx: 1, timeIdx: 6 },
        { num: "INV-2026-1118-008", total: 950, subtotal: 900, type: "MANUAL", note: "Logistics Service Fee", userIdx: 2, timeIdx: 7 },
        { num: "INV-2026-1118-009", total: 380, subtotal: 350, type: "MANUAL", note: "Weekly Driver Lease", userIdx: 3, timeIdx: 8 },
        { num: "INV-2026-1118-010", total: 1750, subtotal: 1650, type: "WORKSHOP", note: "Brake System & Rotor Replacement", userIdx: 0, timeIdx: 9 },
    ];

    for (const inv of invoiceSeeds) {
        const actor = staffPool[inv.userIdx];
        const createdAt = getTime(inv.timeIdx);

        // Delete if already exists with same number
        await Invoice.deleteOne({ invoiceNumber: inv.num });

        const docUrl = `/uploads/invoices/${createdAt.getTime()}_${inv.num}.pdf`;

        const newInv = await Invoice.create({
            invoiceNumber: inv.num,
            invoiceType: inv.type,
            customer: defaultCust._id,
            driver: defaultDriver ? defaultDriver._id : undefined,
            vehicle: defaultVehicle ? defaultVehicle._id : undefined,
            weekNumber: 46,
            total: inv.total,
            subtotal: inv.subtotal,
            baseAmount: inv.subtotal,
            dueDate: new Date(createdAt.getTime() + 7 * 24 * 3600 * 1000),
            status: "PENDING",
            notes: inv.note,
            supportingDocument: {
                name: `${inv.num}_signed.pdf`,
                url: docUrl,
                uploadedAt: createdAt
            },
            createdBy: actor.staff._id,
            creatorRole: actor.role,
            createdAt,
            updatedAt: createdAt
        });

        // Activity log
        await StaffActivityLog.create({
            userId: actor.staff._id,
            userRole: actor.role,
            userName: actor.name,
            branchId: actor.branchId,
            action: "CREATE",
            entityType: "INVOICE",
            entityId: newInv._id,
            entityIdentifier: inv.num,
            amount: inv.total,
            description: `Generated ${inv.type} Invoice ${inv.num} for $${inv.total}`,
            fileUrl: docUrl,
            fileName: `${inv.num}_signed.pdf`,
            timestamp: createdAt,
            createdAt
        });

        // Upload log
        await SystemUpload.create({
            originalName: `${inv.num}_signed.pdf`,
            fileUrl: docUrl,
            storageType: "LOCAL",
            mimeType: "application/pdf",
            fileSize: 148520,
            module: "INVOICE",
            entityId: newInv._id,
            entityReference: inv.num,
            uploadedBy: actor.staff._id,
            uploaderRole: actor.role,
            uploaderName: actor.name,
            branchId: actor.branchId,
            status: "SUCCESS",
            createdAt,
            updatedAt: createdAt
        });
    }
    console.log(`✓ Seeded ${invoiceSeeds.length} Invoices with uploads & activity logs.`);

    // 2. Seed Bills
    const billSeeds = [
        { num: "BILL-2026-1118-001", total: 850, userIdx: 0, timeIdx: 1, note: "Spare Parts - Suspension & Struts" },
        { num: "BILL-2026-1118-002", total: 1600, userIdx: 1, timeIdx: 3, note: "GPS Device Renewal - 20 Units" },
        { num: "BILL-2026-1118-003", total: 420, userIdx: 2, timeIdx: 5, note: "Workshop Lubricants & Oil Drums" },
        { num: "BILL-2026-1118-004", total: 2400, userIdx: 3, timeIdx: 7, note: "Vendor Fuel Card Settlement" },
        { num: "BILL-2026-1118-005", total: 980, userIdx: 0, timeIdx: 9, note: "Tire Replacement Batch (12 Tires)" },
        { num: "BILL-2026-1118-006", total: 1350, userIdx: 1, timeIdx: 11, note: "Facility Maintenance & Diagnostics" },
    ];

    for (const b of billSeeds) {
        const actor = staffPool[b.userIdx];
        const createdAt = getTime(b.timeIdx);

        await Bill.deleteOne({ billNumber: b.num });

        const newBill = await Bill.create({
            billNumber: b.num,
            supplier: defaultSupp._id,
            branch: actor.branchId || defaultBranch._id,
            totalAmount: b.total,
            balanceDue: b.total,
            status: "OPEN",
            notes: b.note,
            createdBy: actor.staff._id,
            creatorRole: actor.role,
            billDate: createdAt,
            createdAt,
            updatedAt: createdAt
        });

        await StaffActivityLog.create({
            userId: actor.staff._id,
            userRole: actor.role,
            userName: actor.name,
            branchId: actor.branchId,
            action: "CREATE",
            entityType: "BILL",
            entityId: newBill._id,
            entityIdentifier: b.num,
            amount: b.total,
            description: `Recorded Vendor Bill ${b.num}: ${b.note}`,
            timestamp: createdAt,
            createdAt
        });
    }
    console.log(`✓ Seeded ${billSeeds.length} Bills with activity logs.`);

    // 3. Seed Debit Notes
    const debitSeeds = [
        { num: "DN-2026-1118-001", amount: 150, userIdx: 0, timeIdx: 2, reason: "Excess Fuel Surcharge Deduction" },
        { num: "DN-2026-1118-002", amount: 320, userIdx: 1, timeIdx: 6, reason: "Parts Damage Reimbursement" },
        { num: "DN-2026-1118-003", amount: 210, userIdx: 2, timeIdx: 10, reason: "Traffic Fine Adjustment" },
    ];

    for (const dn of debitSeeds) {
        const actor = staffPool[dn.userIdx];
        const createdAt = getTime(dn.timeIdx);

        await DebitNote.deleteOne({ debitNoteNumber: dn.num });

        const docUrl = `/uploads/debit-notes/${createdAt.getTime()}_${dn.num}.pdf`;

        const newDN = await DebitNote.create({
            debitNoteNumber: dn.num,
            customerId: defaultCust._id,
            supplierId: defaultSupp._id,
            amount: dn.amount,
            reason: dn.reason,
            status: "OPEN",
            supportingDocument: {
                name: `${dn.num}_doc.pdf`,
                url: docUrl,
                uploadedAt: createdAt
            },
            createdBy: actor.staff._id,
            creatorRole: actor.role,
            debitNoteDate: createdAt,
            createdAt,
            updatedAt: createdAt
        });

        await StaffActivityLog.create({
            userId: actor.staff._id,
            userRole: actor.role,
            userName: actor.name,
            branchId: actor.branchId,
            action: "CREATE",
            entityType: "DEBIT_NOTE",
            entityId: newDN._id,
            entityIdentifier: dn.num,
            amount: dn.amount,
            description: `Issued Debit Note ${dn.num} ($${dn.amount}): ${dn.reason}`,
            fileUrl: docUrl,
            fileName: `${dn.num}_doc.pdf`,
            timestamp: createdAt,
            createdAt
        });

        await SystemUpload.create({
            originalName: `${dn.num}_doc.pdf`,
            fileUrl: docUrl,
            storageType: "LOCAL",
            mimeType: "application/pdf",
            fileSize: 89400,
            module: "DEBIT_NOTE",
            entityId: newDN._id,
            entityReference: dn.num,
            uploadedBy: actor.staff._id,
            uploaderRole: actor.role,
            uploaderName: actor.name,
            branchId: actor.branchId,
            status: "SUCCESS",
            createdAt,
            updatedAt: createdAt
        });
    }
    console.log(`✓ Seeded ${debitSeeds.length} Debit Notes with uploads & activity logs.`);

    // 4. Seed Credit Notes
    const creditSeeds = [
        { num: "CN-2026-1118-001", amount: 180, userIdx: 0, timeIdx: 3, reason: "Rental Down-time Waiver" },
        { num: "CN-2026-1118-002", amount: 260, userIdx: 3, timeIdx: 8, reason: "Goodwill Maintenance Credit" },
    ];

    for (const cn of creditSeeds) {
        const actor = staffPool[cn.userIdx];
        const createdAt = getTime(cn.timeIdx);

        await CreditNote.deleteOne({ creditNoteNumber: cn.num });

        const docUrl = `/uploads/credit-notes/${createdAt.getTime()}_${cn.num}.pdf`;

        const newCN = await CreditNote.create({
            creditNoteNumber: cn.num,
            customerId: defaultCust._id,
            amount: cn.amount,
            reason: cn.reason,
            status: "OPEN",
            supportingDocument: {
                name: `${cn.num}_auth.pdf`,
                url: docUrl,
                uploadedAt: createdAt
            },
            createdBy: actor.staff._id,
            creatorRole: actor.role,
            creditNoteDate: createdAt,
            createdAt,
            updatedAt: createdAt
        });

        await StaffActivityLog.create({
            userId: actor.staff._id,
            userRole: actor.role,
            userName: actor.name,
            branchId: actor.branchId,
            action: "CREATE",
            entityType: "CREDIT_NOTE",
            entityId: newCN._id,
            entityIdentifier: cn.num,
            amount: cn.amount,
            description: `Issued Credit Note ${cn.num} ($${cn.amount}): ${cn.reason}`,
            fileUrl: docUrl,
            fileName: `${cn.num}_auth.pdf`,
            timestamp: createdAt,
            createdAt
        });

        await SystemUpload.create({
            originalName: `${cn.num}_auth.pdf`,
            fileUrl: docUrl,
            storageType: "LOCAL",
            mimeType: "application/pdf",
            fileSize: 67200,
            module: "CREDIT_NOTE",
            entityId: newCN._id,
            entityReference: cn.num,
            uploadedBy: actor.staff._id,
            uploaderRole: actor.role,
            uploaderName: actor.name,
            branchId: actor.branchId,
            status: "SUCCESS",
            createdAt,
            updatedAt: createdAt
        });
    }
    console.log(`✓ Seeded ${creditSeeds.length} Credit Notes with uploads & activity logs.`);

    // 5. Seed Bank Transactions
    const bankSeeds = [
        { txId: "TXN-1118-001", amount: 2500, type: "CREDIT", desc: "Corporate Wire Transfer - Fleet Client", userIdx: 0, timeIdx: 0 },
        { txId: "TXN-1118-002", amount: 850, type: "DEBIT", desc: "Parts Vendor Settlement BG#992", userIdx: 0, timeIdx: 2 },
        { txId: "TXN-1118-003", amount: 1400, type: "CREDIT", desc: "Weekly Driver Mobile Money Batch", userIdx: 1, timeIdx: 4 },
        { txId: "TXN-1118-004", amount: 3200, type: "CREDIT", desc: "Customer Advance Deposit Wire", userIdx: 2, timeIdx: 6 },
        { txId: "TXN-1118-005", amount: 1200, type: "DEBIT", desc: "Fuel Card Automated Clearing", userIdx: 3, timeIdx: 7 },
        { txId: "TXN-1118-006", amount: 750, type: "CREDIT", desc: "Cash Inflow Reconciliation Branch Hub", userIdx: 0, timeIdx: 9 },
        { txId: "TXN-1118-007", amount: 1950, type: "CREDIT", desc: "Bank Statement Auto Set-Off Batch", userIdx: 1, timeIdx: 11 },
    ];

    for (const btx of bankSeeds) {
        const actor = staffPool[btx.userIdx];
        const createdAt = getTime(btx.timeIdx);

        await BankTransaction.deleteOne({ transactionId: btx.txId });

        const newBT = await BankTransaction.create({
            bankAccount: defaultBank._id,
            branch: actor.branchId,
            transactionId: btx.txId,
            amount: btx.amount,
            type: btx.type,
            description: btx.desc,
            entryDate: createdAt,
            createdBy: actor.staff._id,
            creatorRole: actor.role,
            createdAt,
            updatedAt: createdAt
        });

        await StaffActivityLog.create({
            userId: actor.staff._id,
            userRole: actor.role,
            userName: actor.name,
            branchId: actor.branchId,
            action: "CREATE",
            entityType: "BANK_TRANSACTION",
            entityId: newBT._id,
            entityIdentifier: btx.txId,
            amount: btx.amount,
            description: `Processed ${btx.type} Bank Transaction ${btx.txId} for $${btx.amount}: ${btx.desc}`,
            timestamp: createdAt,
            createdAt
        });
    }
    console.log(`✓ Seeded ${bankSeeds.length} Bank Transactions with activity logs.`);

    // 6. Additional Document Uploads across the system (Bank statements, receipts, KYC)
    const extraUploads = [
        { name: "Banco_General_Nov18_Morning_Statement.xlsx", module: "BANK_STATEMENT", size: 452000, mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", userIdx: 0, timeIdx: 0 },
        { name: "Fuel_Card_Consolidated_Receipt_18Nov.pdf", module: "EXPENSE", size: 312000, mime: "application/pdf", userIdx: 1, timeIdx: 3 },
        { name: "Driver_ID_License_Verification_Anas.jpg", module: "DRIVER_KYC", size: 854000, mime: "image/jpeg", userIdx: 2, timeIdx: 5 },
        { name: "Vehicle_Brake_Inspection_Photo_Hub.jpg", module: "VEHICLE_DOC", size: 1240000, mime: "image/jpeg", userIdx: 1, timeIdx: 8 },
        { name: "BG_Wire_Transfer_Proof_99214.pdf", module: "BANK_PAYMENT_PROOF", size: 184000, mime: "application/pdf", userIdx: 3, timeIdx: 10 },
    ];

    for (const up of extraUploads) {
        const actor = staffPool[up.userIdx];
        const createdAt = getTime(up.timeIdx);
        const fileUrl = `/uploads/${up.module.toLowerCase()}/${createdAt.getTime()}_${up.name}`;

        const uploadDoc = await SystemUpload.create({
            originalName: up.name,
            fileUrl,
            storageType: "LOCAL",
            mimeType: up.mime,
            fileSize: up.size,
            module: up.module,
            entityReference: up.name,
            uploadedBy: actor.staff._id,
            uploaderRole: actor.role,
            uploaderName: actor.name,
            branchId: actor.branchId,
            status: "SUCCESS",
            createdAt,
            updatedAt: createdAt
        });

        await StaffActivityLog.create({
            userId: actor.staff._id,
            userRole: actor.role,
            userName: actor.name,
            branchId: actor.branchId,
            action: "UPLOAD",
            entityType: "UPLOAD",
            entityId: uploadDoc._id,
            entityIdentifier: up.name,
            amount: 0,
            description: `Uploaded file ${up.name} under ${up.module}`,
            fileUrl,
            fileName: up.name,
            timestamp: createdAt,
            createdAt
        });
    }
    console.log(`✓ Seeded ${extraUploads.length} Central System Uploads with audit entries.`);

    console.log("\n========================================================");
    console.log("✓ SUCCESS: Dummy data from today 5:00 AM IST successfully seeded!");
    console.log("  - Invoices: 10");
    console.log("  - Bills: 6");
    console.log("  - Debit Notes: 3");
    console.log("  - Credit Notes: 2");
    console.log("  - Bank Transactions: 7");
    console.log("  - System Uploads: 15 (supporting docs + statements + KYC)");
    console.log("  - Staff Activity Logs: 33 events with full audit metadata");
    console.log("========================================================\n");

    process.exit(0);
}

seed().catch(err => {
    console.error("Seeding error:", err);
    process.exit(1);
});
