const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const Customer = require('../Src/modules/Customer/Model/CustomerModel');
const AccountingCode = require('../Src/modules/AccountingCode/Model/AccountingCodeModel');

async function cleanUp() {
    try {
        console.log("Connecting to MongoDB...");
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected successfully.");

        // 1. Find Accounts Receivable Parent Account (1.1.03)
        const parentDoc = await AccountingCode.findOne({ code: "1.1.03", isDeleted: false });
        if (!parentDoc) {
            console.error("Error: Parent account '1.1.03' not found.");
            process.exit(1);
        }
        console.log(`Found parent account: ${parentDoc.name} (${parentDoc.code}) with ID: ${parentDoc._id}`);

        // 2. Find all child accounting codes under 1.1.03
        const subAccounts = await AccountingCode.find({ parentAccount: parentDoc._id });
        console.log(`Found ${subAccounts.length} sub-accounts under Accounts Receivable (1.1.03).`);

        if (subAccounts.length > 0) {
            // Delete these accounting codes
            const deleteResult = await AccountingCode.deleteMany({ parentAccount: parentDoc._id });
            console.log(`Successfully deleted ${deleteResult.deletedCount} sub-accounts from 'accountingcodes' collection.`);
        } else {
            console.log("No sub-accounts found to delete.");
        }

        // 3. Reset accountsReceivable field on all customers
        const updateResult = await Customer.updateMany(
            {},
            { $set: { accountsReceivable: null } }
        );
        console.log(`Reset 'accountsReceivable' field to null for ${updateResult.modifiedCount} customers.`);

        console.log("\nCleanup successfully completed.");
    } catch (error) {
        console.error("Error during cleanup:", error);
    } finally {
        await mongoose.disconnect();
        console.log("Disconnected from database.");
    }
}

cleanUp();
