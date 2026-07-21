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
        const PaymentReceived = require('../Src/modules/PaymentReceived/Model/PaymentReceivedModel');
        const AccountingCode = require('../Src/modules/AccountingCode/Model/AccountingCodeModel');
        const Branch = require('../Src/modules/Branch/Model/BranchModel');
        const BankAccountService = require('../Src/modules/BankAccount/Service/BankAccountService');

        console.log("\n=======================================================");
        console.log("SETTING UP TEST DATA FOR SCENARIO 1 & SCENARIO 2");
        console.log("=======================================================");

        let bankAccount = await BankAccount.findOne({ isDeleted: false });
        if (!bankAccount) {
            console.error("No bank account found");
            return;
        }

        const defaultBranch = await Branch.findOne({ isDeleted: { $ne: true } });
        const branchId = defaultBranch ? defaultBranch._id : undefined;
        const adminUserId = bankAccount.createdBy || new mongoose.Types.ObjectId("6a2290019fa01283dd165204");

        // Create Test Customers
        const testCustA = await Customer.create({
            customerId: `TEST-CUST-A-${Date.now()}`,
            name: `Test Customer A ${Date.now()}`,
            companyName: "Test Cust A",
            status: "ACTIVE",
            branch: branchId
        });

        const testCustB = await Customer.create({
            customerId: `TEST-CUST-B-${Date.now()}`,
            name: `Test Customer B ${Date.now()}`,
            companyName: "Test Cust B",
            status: "ACTIVE",
            branch: branchId
        });

        console.log(`Created Customer A: ${testCustA.name} (${testCustA._id})`);
        console.log(`Created Customer B: ${testCustB.name} (${testCustB._id})`);

        // =======================================================
        // SCENARIO 1 TEST:
        // Cust A has 1 invoice $100. Cust B has 2 invoices $100 each.
        // Payment $150 created for Cust B (wrongly).
        // Then re-assigned to Cust A.
        // Expected: Cust B invoices restored to $100 due each.
        //           Cust A invoice #1 = $100 PAID, $50 Advance Received.
        // =======================================================
        console.log("\n-------------------------------------------------------");
        console.log("RUNNING SCENARIO 1 TEST...");
        console.log("-------------------------------------------------------");

        const invA1 = await Invoice.create({
            invoiceNumber: `INV-TEST-A1-${Date.now()}`,
            customer: testCustA._id,
            invoiceDate: new Date(),
            dueDate: new Date(),
            totalAmount: 100,
            totalAmountDue: 100,
            baseAmount: 100,
            weekNumber: 201,
            amountPaid: 0,
            balance: 100,
            status: "PENDING",
            branch: branchId
        });

        const invB1 = await Invoice.create({
            invoiceNumber: `INV-TEST-B1-${Date.now()}`,
            customer: testCustB._id,
            invoiceDate: new Date(),
            dueDate: new Date(Date.now() + 86400000),
            totalAmount: 100,
            totalAmountDue: 100,
            baseAmount: 100,
            weekNumber: 202,
            amountPaid: 0,
            balance: 100,
            status: "PENDING",
            branch: branchId
        });

        const invB2 = await Invoice.create({
            invoiceNumber: `INV-TEST-B2-${Date.now()}`,
            customer: testCustB._id,
            invoiceDate: new Date(),
            dueDate: new Date(Date.now() + 172800000),
            totalAmount: 100,
            totalAmountDue: 100,
            baseAmount: 100,
            weekNumber: 203,
            amountPaid: 0,
            balance: 100,
            status: "PENDING",
            branch: branchId
        });

        const txRef1 = `TX-TEST-SC1-${Date.now()}`;
        const initialBankTx1 = await BankTransaction.create({
            bankAccount: bankAccount._id,
            accountingCode: bankAccount.accountingCode,
            transactionDate: new Date(),
            type: "DEBIT",
            amount: 150,
            description: `Deposit wrongly assigned to ${testCustB.name}`,
            transactionId: txRef1,
            customer: testCustB._id,
            status: "COMPLETED",
            createdBy: adminUserId,
            creatorRole: "ADMIN"
        });

        const initialLedger1 = await LedgerEntry.create({
            accountingCode: bankAccount.accountingCode,
            entryDate: new Date(),
            type: "DEBIT",
            amount: 150,
            description: `Deposit wrongly assigned to ${testCustB.name}`,
            transactionId: txRef1,
            transaction: initialBankTx1._id,
            contact: testCustB._id,
            contactModel: "Customer",
            createdBy: adminUserId,
            creatorRole: "ADMIN"
        });

        // Trigger initial set-off for Customer B ($150)
        const setOffResB1 = await BankAccountService.autoSetOffInvoices(testCustB._id, 150, {
            bankAccountingCodeId: bankAccount.accountingCode,
            entryDate: new Date(),
            description: initialBankTx1.description,
            transactionId: txRef1,
            existingBankLedgerEntryId: initialLedger1._id,
            createdBy: adminUserId,
            creatorRole: "ADMIN"
        });

        initialBankTx1.invoices = setOffResB1.invoicesSetOff.map(i => ({ invoiceId: i.invoiceId, invoiceNumber: i.invoiceNumber, amountApplied: i.amountApplied }));
        initialBankTx1.setOffSummary = { totalSetOff: setOffResB1.totalSetOff, invoiceCount: setOffResB1.invoicesSetOff.length, excessAmount: setOffResB1.excessAmount };
        await initialBankTx1.save();

        console.log("\n[SC1 Initial State for Cust B]");
        console.log(`  Set-off summary: totalSetOff=${setOffResB1.totalSetOff}, excessAmount=${setOffResB1.excessAmount}`);
        const invB1_after = await Invoice.findById(invB1._id);
        const invB2_after = await Invoice.findById(invB2._id);
        console.log(`  B1 status: ${invB1_after.status}, paid: $${invB1_after.amountPaid}, balance: $${invB1_after.balance}`);
        console.log(`  B2 status: ${invB2_after.status}, paid: $${invB2_after.amountPaid}, balance: $${invB2_after.balance}`);

        // Perform Bulk Edit - Change Customer from Customer B to Customer A!
        console.log("\n[SC1 Executing Bulk Edit: Re-assigning Customer B -> Customer A]");
        await BankAccountService.bulkEditTransactions(bankAccount._id, [{
            id: initialLedger1._id,
            customer: testCustA._id.toString()
        }]);

        console.log("\n[SC1 Verifying State after Re-assignment]");
        const invB1_final = await Invoice.findById(invB1._id);
        const invB2_final = await Invoice.findById(invB2._id);
        const invA1_final = await Invoice.findById(invA1._id);
        const bankTx1_final = await BankTransaction.findById(initialBankTx1._id);

        console.log(`  B1 status: ${invB1_final.status}, paid: $${invB1_final.amountPaid}, balance: $${invB1_final.balance} (EXPECTED: PENDING, paid: 0, bal: 100)`);
        console.log(`  B2 status: ${invB2_final.status}, paid: $${invB2_final.amountPaid}, balance: $${invB2_final.balance} (EXPECTED: PENDING, paid: 0, bal: 100)`);
        console.log(`  A1 status: ${invA1_final.status}, paid: $${invA1_final.amountPaid}, balance: $${invA1_final.balance} (EXPECTED: PAID, paid: 100, bal: 0)`);
        console.log(`  Final BankTx setOffSummary:`, bankTx1_final.setOffSummary, `(EXPECTED: totalSetOff: 100, excessAmount: 50)`);

        const sc1Ledgers = await LedgerEntry.find({
            $or: [
                { transactionId: txRef1 },
                { transaction: initialBankTx1._id }
            ]
        }).populate('accountingCode');
        console.log(`  SC1 Total Ledger Entries count: ${sc1Ledgers.length}`);
        sc1Ledgers.forEach(l => console.log(`    - ${l.type} $${l.amount} | ${l.accountingCode?.code} - ${l.accountingCode?.name} | ${l.description}`));

        // Cleanup SC1
        await Invoice.deleteMany({ _id: { $in: [invA1._id, invB1._id, invB2._id] } });
        await BankTransaction.deleteOne({ _id: initialBankTx1._id });
        await LedgerEntry.deleteMany({ transactionId: txRef1 });

        // =======================================================
        // SCENARIO 2 TEST:
        // Cust A has 2 invoices $100 each ($200 total due).
        // Cust B has 1 invoice $100.
        // Deposit of $150 wrongly assigned to Cust B (Invoice B1 = $100 PAID + $50 Advance Received for B).
        // Then re-assigned to Cust A.
        // Expected: Cust B invoice B1 restored to $100 due, Cust B Advance $50 CLEARED.
        //           Cust A invoice A1 = $100 PAID, invoice A2 = $50 PARTIAL (bal $50), 0 Advance.
        // =======================================================
        console.log("\n-------------------------------------------------------");
        console.log("RUNNING SCENARIO 2 TEST...");
        console.log("-------------------------------------------------------");

        const sc2_invA1 = await Invoice.create({
            invoiceNumber: `INV-SC2-A1-${Date.now()}`,
            customer: testCustA._id,
            invoiceDate: new Date(),
            dueDate: new Date(),
            totalAmount: 100,
            totalAmountDue: 100,
            baseAmount: 100,
            weekNumber: 301,
            amountPaid: 0,
            balance: 100,
            status: "PENDING",
            branch: branchId
        });

        const sc2_invA2 = await Invoice.create({
            invoiceNumber: `INV-SC2-A2-${Date.now()}`,
            customer: testCustA._id,
            invoiceDate: new Date(),
            dueDate: new Date(Date.now() + 86400000),
            totalAmount: 100,
            totalAmountDue: 100,
            baseAmount: 100,
            weekNumber: 302,
            amountPaid: 0,
            balance: 100,
            status: "PENDING",
            branch: branchId
        });

        const sc2_invB1 = await Invoice.create({
            invoiceNumber: `INV-SC2-B1-${Date.now()}`,
            customer: testCustB._id,
            invoiceDate: new Date(),
            dueDate: new Date(),
            totalAmount: 100,
            totalAmountDue: 100,
            baseAmount: 100,
            weekNumber: 303,
            amountPaid: 0,
            balance: 100,
            status: "PENDING",
            branch: branchId
        });

        const txRef2 = `TX-TEST-SC2-${Date.now()}`;
        const initialBankTx2 = await BankTransaction.create({
            bankAccount: bankAccount._id,
            accountingCode: bankAccount.accountingCode,
            transactionDate: new Date(),
            type: "DEBIT",
            amount: 150,
            description: `Deposit wrongly assigned to ${testCustB.name}`,
            transactionId: txRef2,
            customer: testCustB._id,
            status: "COMPLETED",
            createdBy: adminUserId,
            creatorRole: "ADMIN"
        });

        const initialLedger2 = await LedgerEntry.create({
            accountingCode: bankAccount.accountingCode,
            entryDate: new Date(),
            type: "DEBIT",
            amount: 150,
            description: `Deposit wrongly assigned to ${testCustB.name}`,
            transactionId: txRef2,
            transaction: initialBankTx2._id,
            contact: testCustB._id,
            contactModel: "Customer",
            createdBy: adminUserId,
            creatorRole: "ADMIN"
        });

        // Initial set-off for Customer B ($150 -> $100 B1 + $50 Advance for B)
        const setOffResB2 = await BankAccountService.autoSetOffInvoices(testCustB._id, 150, {
            bankAccountingCodeId: bankAccount.accountingCode,
            entryDate: new Date(),
            description: initialBankTx2.description,
            transactionId: txRef2,
            existingBankLedgerEntryId: initialLedger2._id,
            createdBy: adminUserId,
            creatorRole: "ADMIN"
        });

        initialBankTx2.invoices = setOffResB2.invoicesSetOff.map(i => ({ invoiceId: i.invoiceId, invoiceNumber: i.invoiceNumber, amountApplied: i.amountApplied }));
        initialBankTx2.setOffSummary = { totalSetOff: setOffResB2.totalSetOff, invoiceCount: setOffResB2.invoicesSetOff.length, excessAmount: setOffResB2.excessAmount };
        await initialBankTx2.save();

        console.log("\n[SC2 Initial State for Cust B]");
        console.log(`  Set-off summary: totalSetOff=${setOffResB2.totalSetOff}, excessAmount=${setOffResB2.excessAmount} (EXPECTED: 100 set off, 50 advance)`);

        // Perform Bulk Edit - Change Customer from Customer B to Customer A!
        console.log("\n[SC2 Executing Bulk Edit: Re-assigning Customer B -> Customer A]");
        await BankAccountService.bulkEditTransactions(bankAccount._id, [{
            id: initialLedger2._id,
            customer: testCustA._id.toString()
        }]);

        console.log("\n[SC2 Verifying State after Re-assignment]");
        const sc2_invB1_final = await Invoice.findById(sc2_invB1._id);
        const sc2_invA1_final = await Invoice.findById(sc2_invA1._id);
        const sc2_invA2_final = await Invoice.findById(sc2_invA2._id);
        const bankTx2_final = await BankTransaction.findById(initialBankTx2._id);

        console.log(`  B1 status: ${sc2_invB1_final.status}, paid: $${sc2_invB1_final.amountPaid}, balance: $${sc2_invB1_final.balance} (EXPECTED: PENDING, paid: 0, bal: 100)`);
        console.log(`  A1 status: ${sc2_invA1_final.status}, paid: $${sc2_invA1_final.amountPaid}, balance: $${sc2_invA1_final.balance} (EXPECTED: PAID, paid: 100, bal: 0)`);
        console.log(`  A2 status: ${sc2_invA2_final.status}, paid: $${sc2_invA2_final.amountPaid}, balance: $${sc2_invA2_final.balance} (EXPECTED: PARTIAL, paid: 50, bal: 50)`);
        console.log(`  Final BankTx setOffSummary:`, bankTx2_final.setOffSummary, `(EXPECTED: totalSetOff: 150, excessAmount: 0)`);

        const sc2Ledgers = await LedgerEntry.find({
            $or: [
                { transactionId: txRef2 },
                { transaction: initialBankTx2._id }
            ]
        }).populate('accountingCode');
        console.log(`  SC2 Total Ledger Entries count: ${sc2Ledgers.length}`);
        sc2Ledgers.forEach(l => console.log(`    - ${l.type} $${l.amount} | ${l.accountingCode?.code} - ${l.accountingCode?.name} | ${l.description}`));

        // Cleanup SC2 & test customers
        await Customer.deleteMany({ _id: { $in: [testCustA._id, testCustB._id] } });
        await Invoice.deleteMany({ _id: { $in: [sc2_invA1._id, sc2_invA2._id, sc2_invB1._id] } });
        await BankTransaction.deleteOne({ _id: initialBankTx2._id });
        await LedgerEntry.deleteMany({ transactionId: txRef2 });

    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
    }
}

run();
