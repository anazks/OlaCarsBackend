const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const Customer = require('../Src/modules/Customer/Model/CustomerModel');
const AccountingCode = require('../Src/modules/AccountingCode/Model/AccountingCodeModel');

const escapeRegExp = (string) => {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

async function migrate() {
    try {
        console.log("Connecting to MongoDB...");
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected successfully.");

        // 1. Resolve Accounts Receivable Parent Doc (1.1.03)
        const parentDoc = await AccountingCode.findOne({ code: "1.1.03", isDeleted: false });
        if (!parentDoc) {
            console.error("Error: Parent accounting code '1.1.03' (Accounts Receivable) was not found in the database.");
            process.exit(1);
        }
        console.log(`Found parent account: ${parentDoc.name} (${parentDoc.code})`);

        // 2. Fetch all customers
        const customers = await Customer.find({ isDeleted: false });
        console.log(`Found ${customers.length} total customers.`);

        let migratedCount = 0;
        let alreadyValidCount = 0;

        for (const customer of customers) {
            const hasValidObjectId = mongoose.Types.ObjectId.isValid(customer.accountsReceivable);

            if (hasValidObjectId) {
                // Already linked to a valid ObjectId
                alreadyValidCount++;
                continue;
            }

            console.log(`Processing customer: "${customer.name}" (ID: ${customer.customerId || customer._id})`);

            // 3. Find if sub-accounting code already exists under parent
            let subDoc = await AccountingCode.findOne({
                parentAccount: parentDoc._id,
                name: { $regex: new RegExp(`^${escapeRegExp(customer.name.trim())}$`, "i") },
                isDeleted: false
            });

            if (!subDoc) {
                // 4. Calculate next code code
                const subCount = await AccountingCode.countDocuments({ parentAccount: parentDoc._id });
                let suffix = subCount + 1;
                let uniqueCode = `${parentDoc.code}-${String(suffix).padStart(3, '0')}`;
                let exists = await AccountingCode.findOne({ code: uniqueCode });
                while (exists) {
                    suffix++;
                    uniqueCode = `${parentDoc.code}-${String(suffix).padStart(3, '0')}`;
                    exists = await AccountingCode.findOne({ code: uniqueCode });
                }

                console.log(`Creating new sub-account: ${uniqueCode} - ${customer.name}`);
                subDoc = await AccountingCode.create({
                    code: uniqueCode,
                    name: customer.name.trim(),
                    parentAccount: parentDoc._id,
                    category: parentDoc.category,
                    accountType: parentDoc.accountType,
                    description: `Auto-created sub-account for ${customer.name} under parent ${parentDoc.name}`,
                    currency: parentDoc.currency || "USD",
                    accountStatus: "Active",
                    createdBy: customer.createdBy || new mongoose.Types.ObjectId("6a2290019fa01283dd165204"), // System user
                    creatorRole: customer.creatorRole || "ADMIN"
                });
            } else {
                console.log(`Found existing sub-account: ${subDoc.code} - ${subDoc.name}`);
            }

            // 5. Update Customer reference
            customer.accountsReceivable = subDoc._id;
            await customer.save();
            migratedCount++;
        }

        console.log("\nMigration completed.");
        console.log(`- Already valid links: ${alreadyValidCount}`);
        console.log(`- Newly migrated/fixed: ${migratedCount}`);

    } catch (error) {
        console.error("Migration error:", error);
    } finally {
        await mongoose.disconnect();
        console.log("Disconnected from database.");
    }
}

migrate();
