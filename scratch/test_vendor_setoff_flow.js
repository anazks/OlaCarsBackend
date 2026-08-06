require("dotenv").config();
const mongoose = require("mongoose");
const Supplier = require("../Src/modules/Supplier/Model/SupplierModel");
const Bill = require("../Src/modules/Bill/Model/BillModel");
const InvoiceBillSetOffHistory = require("../Src/modules/BankAccount/Model/InvoiceBillSetOffHistoryModel");
const { autoSetOffBills, reverseSetOffFromHistory } = require("../Src/modules/BankAccount/Service/BankAccountService");

const run = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected to MongoDB for Verification Test");

        // 1. Create a dummy test supplier
        const vendorName = `TEST VENDOR AUTO SETOFF ${Date.now()}`;
        const testSupplier = await Supplier.create({
            name: vendorName,
            companyName: vendorName,
            status: "ACTIVE",
            createdBy: new mongoose.Types.ObjectId(),
            creatorRole: "ADMIN"
        });
        console.log(`✓ Created test supplier: ${testSupplier._id}`);

        // 2. Find a test branch
        const Branch = require("../Src/modules/Branch/Model/BranchModel");
        const branchDoc = await Branch.findOne({});
        const branchId = branchDoc ? branchDoc._id : new mongoose.Types.ObjectId();

        // 3. Create a test bill of $150 for this supplier
        const billNumber = `TEST-BILL-${Date.now()}`;
        const testBill = await Bill.create({
            billNumber,
            supplier: testSupplier._id,
            branch: branchId,
            billDate: new Date(),
            dueDate: new Date(Date.now() + 7 * 86400000),
            items: [{
                itemName: "Test Spare Parts",
                quantity: 1,
                unitPrice: 150,
                accountId: new mongoose.Types.ObjectId()
            }],
            totalAmount: 150,
            amountPaid: 0,
            balanceDue: 150,
            status: "OPEN",
            createdBy: new mongoose.Types.ObjectId(),
            creatorRole: "ADMIN"
        });
        console.log(`✓ Created test bill: ${testBill.billNumber} | Balance: $${testBill.balanceDue} | Status: ${testBill.status}`);

        // 4. Run autoSetOffBills
        const primaryTxId = new mongoose.Types.ObjectId();
        const setOffRes = await autoSetOffBills(testSupplier._id, 150, {
            primaryLedgerEntry: primaryTxId,
            transactionId: `TX-${Date.now()}`,
            description: "Test vendor payment set-off"
        });

        console.log("\n=== AUTO SET-OFF RESULT ===");
        console.log(`Bills Set Off: ${setOffRes.billsSetOff.length}`);
        console.log(`Total Set Off: $${setOffRes.totalSetOff}`);
        console.log(`History ID: ${setOffRes.historyId}`);

        // Verify updated bill state in DB
        const updatedBill = await Bill.findById(testBill._id);
        console.log(`Updated Bill -> amountPaid: $${updatedBill.amountPaid}, balanceDue: $${updatedBill.balanceDue}, status: ${updatedBill.status}`);
        if (updatedBill.status !== "PAID" || updatedBill.balanceDue !== 0) {
            throw new Error("Bill status failed to update to PAID!");
        }

        // Verify history doc in DB
        const historyDoc = await InvoiceBillSetOffHistory.findById(setOffRes.historyId);
        console.log(`History Doc -> targetType: ${historyDoc.targetType}, billSnapshots count: ${historyDoc.billSnapshots.length}`);
        if (historyDoc.targetType !== "SUPPLIER") {
            throw new Error("History targetType is not SUPPLIER!");
        }

        // 5. Test Revoke / Reverse Set-Off
        console.log("\n=== REVERSING SET-OFF FROM HISTORY ===");
        const reversedHistory = await reverseSetOffFromHistory(primaryTxId);
        console.log(`Reversed History ID: ${reversedHistory._id}`);

        // Verify bill is restored to BEFORE state
        const restoredBill = await Bill.findById(testBill._id);
        console.log(`Restored Bill -> amountPaid: $${restoredBill.amountPaid}, balanceDue: $${restoredBill.balanceDue}, status: ${restoredBill.status}`);
        if (restoredBill.status !== "OPEN" || restoredBill.balanceDue !== 150) {
            throw new Error("Bill failed to restore to original OPEN status!");
        }

        // Verify history doc is deleted
        const deletedHistory = await InvoiceBillSetOffHistory.findById(setOffRes.historyId);
        console.log(`History Doc in DB after reversal: ${deletedHistory}`);

        // Cleanup test data
        await Bill.deleteOne({ _id: testBill._id });
        await Supplier.deleteOne({ _id: testSupplier._id });
        console.log("\n✓ EMPIRICAL TEST PASSED SUCCESSFULLY! Cleaned up test data.");

        process.exit(0);
    } catch (e) {
        console.error("❌ TEST FAILED:", e);
        process.exit(1);
    }
};

run();
