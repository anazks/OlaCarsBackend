const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function run() {
    try {
        console.log("Connecting to MongoDB...");
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected successfully.");

        const Customer = require('../Src/modules/Customer/Model/CustomerModel');
        const { Invoice } = require('../Src/modules/Invoice/Model/InvoiceModel');
        const BankAccount = require('../Src/modules/BankAccount/Model/BankAccountModel');
        const BankTransaction = require('../Src/modules/BankAccount/Model/BankTransactionModel');
        const LedgerEntry = require('../Src/modules/Ledger/Model/LedgerEntryModel');
        const Branch = require('../Src/modules/Branch/Model/BranchModel');
        const BankAccountService = require('../Src/modules/BankAccount/Service/BankAccountService');

        let bankAccount = await BankAccount.findOne({ isDeleted: false });
        if (!bankAccount) {
            console.error("No bank account found");
            return;
        }

        const defaultBranch = await Branch.findOne({ isDeleted: { $ne: true } });
        const branchId = defaultBranch ? defaultBranch._id : undefined;
        const adminUserId = bankAccount.createdBy || new mongoose.Types.ObjectId("6a2290019fa01283dd165204");

        // Create Customers
        const jessica = await Customer.create({
            customerId: `JESSICA-${Date.now()}`,
            name: `JESSICA SOTO ${Date.now()}`,
            companyName: "Jessica Soto",
            status: "ACTIVE",
            branch: branchId
        });

        const juan = await Customer.create({
            customerId: `JUAN-${Date.now()}`,
            name: `JUAN MORAN ${Date.now()}`,
            companyName: "Juan Moran",
            status: "ACTIVE",
            branch: branchId
        });

        console.log(`Created Customer Jessica: ${jessica.name} (${jessica._id})`);
        console.log(`Created Customer Juan: ${juan.name} (${juan._id})`);

        // Create 2 Invoices for Jessica ($100 each)
        const jessicaInv1 = await Invoice.create({
            invoiceNumber: `INV-JESSICA-1-${Date.now()}`,
            customer: jessica._id,
            invoiceDate: new Date(),
            dueDate: new Date(),
            totalAmount: 100,
            totalAmountDue: 100,
            baseAmount: 100,
            weekNumber: 501,
            amountPaid: 0,
            balance: 100,
            status: "PENDING",
            branch: branchId
        });

        const jessicaInv2 = await Invoice.create({
            invoiceNumber: `INV-JESSICA-2-${Date.now()}`,
            customer: jessica._id,
            invoiceDate: new Date(),
            dueDate: new Date(Date.now() + 86400000),
            totalAmount: 100,
            totalAmountDue: 100,
            baseAmount: 100,
            weekNumber: 502,
            amountPaid: 0,
            balance: 100,
            status: "PENDING",
            branch: branchId
        });

        // Create 2 Invoices for Juan ($100 each)
        const juanInv1 = await Invoice.create({
            invoiceNumber: `INV-JUAN-1-${Date.now()}`,
            customer: juan._id,
            invoiceDate: new Date(),
            dueDate: new Date(),
            totalAmount: 100,
            totalAmountDue: 100,
            baseAmount: 100,
            weekNumber: 503,
            amountPaid: 0,
            balance: 100,
            status: "PENDING",
            branch: branchId
        });

        const juanInv2 = await Invoice.create({
            invoiceNumber: `INV-JUAN-2-${Date.now()}`,
            customer: juan._id,
            invoiceDate: new Date(),
            dueDate: new Date(Date.now() + 86400000),
            totalAmount: 100,
            totalAmountDue: 100,
            baseAmount: 100,
            weekNumber: 504,
            amountPaid: 0,
            balance: 100,
            status: "PENDING",
            branch: branchId
        });

        console.log(`Created Jessica Invoices: #${jessicaInv1.invoiceNumber}, #${jessicaInv2.invoiceNumber}`);
        console.log(`Created Juan Invoices: #${juanInv1.invoiceNumber}, #${juanInv2.invoiceNumber}`);

        // STEP 1: Jessica pays $100 legitimately (Transaction 1)
        console.log("\n=======================================================");
        console.log("STEP 1: Legitimate payment of $100 by Jessica (Tx 1)");
        console.log("=======================================================");
        const txRef1 = `TX-JESSICA-LEGIT-${Date.now()}`;
        const bankTx1 = await BankTransaction.create({
            bankAccount: bankAccount._id,
            accountingCode: bankAccount.accountingCode,
            transactionDate: new Date(),
            type: "DEBIT",
            amount: 100,
            description: `Legitimate deposit by ${jessica.name}`,
            transactionId: txRef1,
            customer: jessica._id,
            status: "COMPLETED",
            createdBy: adminUserId,
            creatorRole: "ADMIN"
        });

        const ledger1 = await LedgerEntry.create({
            accountingCode: bankAccount.accountingCode,
            entryDate: new Date(),
            type: "DEBIT",
            amount: 100,
            description: `Legitimate deposit by ${jessica.name}`,
            transactionId: txRef1,
            transaction: bankTx1._id,
            contact: jessica._id,
            contactModel: "Customer",
            createdBy: adminUserId,
            creatorRole: "ADMIN"
        });

        const setOffRes1 = await BankAccountService.autoSetOffInvoices(jessica._id, 100, {
            bankAccountingCodeId: bankAccount.accountingCode,
            entryDate: new Date(),
            description: bankTx1.description,
            transactionId: txRef1,
            existingBankLedgerEntryId: ledger1._id,
            createdBy: adminUserId,
            creatorRole: "ADMIN"
        });

        bankTx1.invoices = setOffRes1.invoicesSetOff.map(i => ({ invoiceId: i.invoiceId, invoiceNumber: i.invoiceNumber, amountApplied: i.amountApplied }));
        bankTx1.setOffSummary = { totalSetOff: setOffRes1.totalSetOff, invoiceCount: setOffRes1.invoicesSetOff.length, excessAmount: setOffRes1.excessAmount };
        await bankTx1.save();

        const j1_after_tx1 = await Invoice.findById(jessicaInv1._id);
        const j2_after_tx1 = await Invoice.findById(jessicaInv2._id);
        console.log(`[After Tx 1] Jessica Inv 1 status: ${j1_after_tx1.status}, paid: $${j1_after_tx1.amountPaid}, balance: $${j1_after_tx1.balance}`);
        console.log(`[After Tx 1] Jessica Inv 2 status: ${j2_after_tx1.status}, paid: $${j2_after_tx1.amountPaid}, balance: $${j2_after_tx1.balance}`);

        // STEP 2: Juan pays $150, but wrongly assigned to Jessica (Transaction 2)
        console.log("\n=======================================================");
        console.log("STEP 2: Payment of $150 by Juan wrongly assigned to Jessica (Tx 2)");
        console.log("=======================================================");
        const txRef2 = `TX-JUAN-WRONG-${Date.now()}`;
        const bankTx2 = await BankTransaction.create({
            bankAccount: bankAccount._id,
            accountingCode: bankAccount.accountingCode,
            transactionDate: new Date(),
            type: "DEBIT",
            amount: 150,
            description: `Payment wrongly assigned to ${jessica.name}`,
            transactionId: txRef2,
            customer: jessica._id,
            status: "COMPLETED",
            createdBy: adminUserId,
            creatorRole: "ADMIN"
        });

        const ledger2 = await LedgerEntry.create({
            accountingCode: bankAccount.accountingCode,
            entryDate: new Date(),
            type: "DEBIT",
            amount: 150,
            description: `Payment wrongly assigned to ${jessica.name}`,
            transactionId: txRef2,
            transaction: bankTx2._id,
            contact: jessica._id,
            contactModel: "Customer",
            createdBy: adminUserId,
            creatorRole: "ADMIN"
        });

        const setOffRes2 = await BankAccountService.autoSetOffInvoices(jessica._id, 150, {
            bankAccountingCodeId: bankAccount.accountingCode,
            entryDate: new Date(),
            description: bankTx2.description,
            transactionId: txRef2,
            existingBankLedgerEntryId: ledger2._id,
            createdBy: adminUserId,
            creatorRole: "ADMIN"
        });

        bankTx2.invoices = setOffRes2.invoicesSetOff.map(i => ({ invoiceId: i.invoiceId, invoiceNumber: i.invoiceNumber, amountApplied: i.amountApplied }));
        bankTx2.setOffSummary = { totalSetOff: setOffRes2.totalSetOff, invoiceCount: setOffRes2.invoicesSetOff.length, excessAmount: setOffRes2.excessAmount };
        await bankTx2.save();

        const j1_after_tx2 = await Invoice.findById(jessicaInv1._id);
        const j2_after_tx2 = await Invoice.findById(jessicaInv2._id);
        console.log(`[After Tx 2] Jessica Inv 1 status: ${j1_after_tx2.status}, paid: $${j1_after_tx2.amountPaid}, balance: $${j1_after_tx2.balance}`);
        console.log(`[After Tx 2] Jessica Inv 2 status: ${j2_after_tx2.status}, paid: $${j2_after_tx2.amountPaid}, balance: $${j2_after_tx2.balance}`);

        // STEP 3: User re-assigns Tx 2 ($150) from Jessica Soto to Juan Moran!
        console.log("\n=======================================================");
        console.log("STEP 3: Re-assigning Tx 2 ($150) from Jessica Soto -> Juan Moran");
        console.log("=======================================================");

        await BankAccountService.bulkEditTransactions(bankAccount._id, [{
            id: ledger2._id,
            customer: juan._id.toString()
        }]);

        console.log("\n=======================================================");
        console.log("VERIFYING FINAL STATES FOR BOTH CUSTOMERS");
        console.log("=======================================================");
        const j1_final = await Invoice.findById(jessicaInv1._id);
        const j2_final = await Invoice.findById(jessicaInv2._id);
        const juan1_final = await Invoice.findById(juanInv1._id);
        const juan2_final = await Invoice.findById(juanInv2._id);

        console.log(`[FINAL] Jessica Inv 1 status: ${j1_final.status}, paid: $${j1_final.amountPaid}, balance: $${j1_final.balance} (MUST BE: PAID, paid: 100, bal: 0)`);
        console.log(`[FINAL] Jessica Inv 2 status: ${j2_final.status}, paid: $${j2_final.amountPaid}, balance: $${j2_final.balance} (MUST BE: PENDING, paid: 0, bal: 100)`);
        console.log(`[FINAL] Juan Inv 1 status: ${juan1_final.status}, paid: $${juan1_final.amountPaid}, balance: $${juan1_final.balance} (MUST BE: PAID, paid: 100, bal: 0)`);
        console.log(`[FINAL] Juan Inv 2 status: ${juan2_final.status}, paid: $${juan2_final.amountPaid}, balance: $${juan2_final.balance} (MUST BE: PARTIAL, paid: 50, bal: 50)`);

        if (j1_final.amountPaid !== 100 || j1_final.status !== "PAID") {
            console.error("\n❌ BUG CONFIRMED: Jessica's legitimate payment from Tx 1 WAS ERASED!");
        } else {
            console.log("\n✅ SUCCESS: Jessica's legitimate payment from Tx 1 was preserved!");
        }

        // Cleanup
        await Customer.deleteMany({ _id: { $in: [jessica._id, juan._id] } });
        await Invoice.deleteMany({ _id: { $in: [jessicaInv1._id, jessicaInv2._id, juanInv1._id, juanInv2._id] } });
        await BankTransaction.deleteMany({ _id: { $in: [bankTx1._id, bankTx2._id] } });
        await LedgerEntry.deleteMany({ transactionId: { $in: [txRef1, txRef2] } });

    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
    }
}

run();
