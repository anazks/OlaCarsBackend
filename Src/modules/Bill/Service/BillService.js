const BillRepo = require("../Repo/BillRepo");
const PurchaseOrder = require("../../PurchaseOrder/Model/PurchaseOrderModel");
const LedgerService = require("../../Ledger/Service/LedgerService");
const AppError = require("../../../shared/utils/AppError");

exports.createBillFromPO = async (poId, userData, overrides = {}) => {
    console.log(`[BillService] Starting conversion for PO: ${poId}`);
    const po = await PurchaseOrder.findById(poId);
    if (!po) throw new AppError("Purchase Order not found", 404);
    if (po.status !== "APPROVED") throw new AppError("Only approved Purchase Orders can be billed", 400);
    if (po.isBilled) throw new AppError("This Purchase Order has already been billed", 400);

    console.log(`[BillService] Processing items for PO: ${po.purchaseOrderNumber}`);
    const extractId = (val) => (val && val._id ? val._id : val);
    
    // Process items and check for missing accountId
    const billItems = po.items.map(item => {
        const accountId = item.accountId || (overrides.itemAccounts && overrides.itemAccounts[item.itemName]);
        if (!accountId) {
            console.error(`[BillService] Item missing account: ${item.itemName}`);
            throw new AppError(`Item "${item.itemName}" is missing an accounting code. Please provide one or update the PO.`, 400);
        }
        return {
            itemName: item.itemName,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            accountId: extractId(accountId),
            description: item.description
        };
    });

    const billData = {
        billNumber: `BILL-${Date.now()}`,
        purchaseOrder: po._id,
        supplier: extractId(overrides.supplier || po.supplier),
        customer: (overrides.customer && overrides.customer !== "") ? extractId(overrides.customer) : null,
        branch: extractId(po.branch),
        billDate: new Date(),
        dueDate: overrides.dueDate || po.paymentDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // Default 30 days
        items: billItems,
        totalAmount: po.totalAmount,
        balanceDue: po.totalAmount,
        status: "OPEN",
        createdBy: userData.id || userData._id,
        creatorRole: userData.role
    };

    console.log(`[BillService] Creating bill record...`);
    const bill = await BillRepo.createBill(billData);

    console.log(`[BillService] Updating PO status...`);
    po.isBilled = true;
    await po.save();

    console.log(`[BillService] Posting to ledger...`);
    // Post to Ledger: Debit Expenses, Credit Accounts Payable
    await postBillToLedger(bill, userData);

    console.log(`[BillService] Conversion completed successfully: ${bill.billNumber}`);
    return bill;
};

async function postBillToLedger(bill, userData) {
    const extractId = (val) => (val && val._id ? val._id : val);
    
    // 1. Find the Accounts Payable account ID (assuming code 2100 exists)
    const AccountingCode = require("../../AccountingCode/Model/AccountingCodeModel");
    const apAccount = await AccountingCode.findOne({ code: "2100", category: "LIABILITY" });
    
    if (!apAccount) {
        console.error("[BillService] Accounts Payable account (2100) not found. Skipping ledger entry.");
        return;
    }

    // 2. Create entries for each item (Debit Expense)
    for (const item of bill.items) {
        await LedgerService.create({
            branch: extractId(bill.branch),
            accountingCode: extractId(item.accountId),
            type: "DEBIT",
            amount: item.quantity * item.unitPrice,
            description: `Bill ${bill.billNumber} - Item: ${item.itemName}`,
            entryDate: bill.billDate,
            createdBy: userData.id || userData._id,
            creatorRole: userData.role
        });
    }

    // 3. Create one entry for the total (Credit Accounts Payable)
    await LedgerService.create({
        branch: extractId(bill.branch),
        accountingCode: apAccount._id,
        type: "CREDIT",
        amount: bill.totalAmount,
        description: `Bill ${bill.billNumber} - Total Liability`,
        entryDate: bill.billDate,
        createdBy: userData.id || userData._id,
        creatorRole: userData.role
    });
}

exports.getAllBills = async (query = {}) => {
    const cleanedQuery = { ...query };
    delete cleanedQuery.limit;
    delete cleanedQuery.page;
    return await BillRepo.getAllBills(cleanedQuery);
};

exports.getBillById = async (id) => {
    return await BillRepo.getBillById(id);
};

exports.recordBillPayment = async (billId, paymentData, userData) => {
    const bill = await BillRepo.getBillById(billId);
    if (!bill) throw new AppError("Bill not found", 404);

    if (paymentData.totalAmount > bill.balanceDue) {
        throw new AppError("Payment amount exceeds balance due", 400);
    }

    const PaymentTransaction = require("../../Payment/Model/PaymentTransactionModel");
    const payment = new PaymentTransaction({
        ...paymentData,
        baseAmount: paymentData.totalAmount,
        referenceId: billId,
        referenceModel: "Bill",
        transactionCategory: "EXPENSE",
        transactionType: "DEBIT",
        branch: bill.branch,
        supplier: typeof bill.supplier === 'object' ? bill.supplier._id : bill.supplier,
        createdBy: userData.id || userData._id,
        creatorRole: userData.role
    });

    await payment.save();

    // Trigger Ledger if completed
    if (payment.status === "COMPLETED") {
        const { autoGenerateLedgerEntry } = require("../../Ledger/Service/LedgerService");
        
        // Fetch and populate accountingCode to ensure autoGenerateLedgerEntry has full details
        const AccountingCode = require("../../AccountingCode/Model/AccountingCodeModel");
        const accCode = await AccountingCode.findById(payment.accountingCode);
        const populatedTx = { ...payment.toObject(), accountingCode: accCode };
        
        await autoGenerateLedgerEntry(populatedTx);

        // Update bill balance
        bill.amountPaid += payment.totalAmount;
        if (bill.balanceDue <= 0) {
            bill.status = "PAID";
        } else {
            bill.status = "PARTIALLY_PAID";
        }
        await bill.save();

        // Trigger draft Fixed Asset creation if the bill is fully paid
        if (bill.status === "PAID") {
            try {
                const FixedAssetService = require("../../FixedAsset/Service/FixedAssetService");
                await FixedAssetService.autoCreateDraftAssetsFromBill(bill._id, userData);
            } catch (faErr) {
                console.error("[BillService] Failed to trigger auto fixed asset creation:", faErr);
            }
        }

        // AUTO-CREATE PAYMENT MADE RECORD (Zoho Accounting Integration)
        try {
            const PaymentMade = require("../../PaymentMade/Model/PaymentMadeModel");

            // Normalize paymentMethod for PaymentMade schema enum: ["Cash", "Bank Transfer", "Card", "Cheque", "Other"]
            const methodUpper = (payment.paymentMethod || "").toUpperCase();
            let normalizedPMMethod = "Other";
            if (methodUpper.includes("CASH")) normalizedPMMethod = "Cash";
            else if (methodUpper.includes("BANK") || methodUpper.includes("TRANSFER") || methodUpper.includes("WIRE")) normalizedPMMethod = "Bank Transfer";
            else if (methodUpper.includes("CARD")) normalizedPMMethod = "Card";
            else if (methodUpper.includes("CHEQUE")) normalizedPMMethod = "Cheque";

            const pmData = {
                paymentNumber: `PMT-${Date.now()}`,
                supplier: typeof bill.supplier === 'object' ? bill.supplier._id : bill.supplier,
                amount: payment.totalAmount,
                paymentDate: payment.paymentDate || new Date(),
                paymentMethod: normalizedPMMethod,
                notes: payment.notes || `Bill Payment (${bill.billNumber})`,
                bills: [{
                    billId: bill._id,
                    billNumber: bill.billNumber,
                    amountApplied: payment.totalAmount
                }],
                paidThroughAccount: payment.accountingCode,
                branch: bill.branch,
                status: "COMPLETED"
            };
            const pmDoc = await PaymentMade.create(pmData);
            console.log(`[BillService] PaymentMade record created successfully: ${pmDoc.paymentNumber}`);
        } catch (pmErr) {
            console.error("[BillService] Failed to auto-create PaymentMade record:", pmErr);
        }
    }

    return payment;
};

exports.disposePO = async (poId, userData) => {
    const po = await PurchaseOrder.findById(poId);
    if (!po) throw new AppError("Purchase Order not found", 404);
    
    const previousStatus = po.status;
    po.status = "DISPOSED";
    po.editHistory.push({
        editedBy: userData.id || userData._id,
        editorRole: userData.role,
        previousStatus: previousStatus,
        changesSummary: "Purchase Order Disposed/Closed"
    });
    
    return await po.save();
};

exports.createBill = async (billData, userData) => {
    console.log(`[BillService] Starting manual bill creation`);
    const extractId = (val) => (val && val._id ? val._id : val);
    
    // Process items and validate
    if (!billData.items || !billData.items.length) {
        throw new AppError("A bill must contain at least one item", 400);
    }
    
    const billItems = billData.items.map(item => {
        if (!item.accountId) {
            throw new AppError(`Item "${item.itemName}" is missing a debit account code.`, 400);
        }
        return {
            itemName: item.itemName,
            quantity: Number(item.quantity),
            unitPrice: Number(item.unitPrice),
            accountId: extractId(item.accountId),
            description: item.description || ""
        };
    });

    const totalAmount = billItems.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);

    const savedBillData = {
        billNumber: billData.billNumber || `BILL-${Date.now()}`,
        supplier: extractId(billData.supplier),
        customer: (billData.customer && billData.customer !== "") ? extractId(billData.customer) : null,
        branch: extractId(billData.branch),
        billDate: billData.billDate ? new Date(billData.billDate) : new Date(),
        dueDate: billData.dueDate ? new Date(billData.dueDate) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        items: billItems,
        totalAmount: totalAmount,
        balanceDue: totalAmount,
        status: "OPEN",
        createdBy: userData.id || userData._id,
        creatorRole: userData.role
    };

    console.log(`[BillService] Creating manual bill record...`);
    const bill = await BillRepo.createBill(savedBillData);

    console.log(`[BillService] Posting manual bill to ledger...`);
    await postBillToLedger(bill, userData);

    console.log(`[BillService] Manual bill creation completed successfully: ${bill.billNumber}`);
    return bill;
};
