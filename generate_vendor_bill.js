require("dotenv").config();
const mongoose = require("mongoose");
const Supplier = require("./Src/modules/Supplier/Model/SupplierModel");
const Bill = require("./Src/modules/Bill/Model/BillModel");
const Branch = require("./Src/modules/Branch/Model/BranchModel");
const AccountingCode = require("./Src/modules/AccountingCode/Model/AccountingCodeModel");

const run = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected to MongoDB...");

        const adminId = new mongoose.Types.ObjectId("6a2290019fa01283dd165204");

        // 1. Find default branch ID
        let branchDoc = await Branch.findOne({ isDeleted: false });
        const branchId = branchDoc ? branchDoc._id : new mongoose.Types.ObjectId("6a2819a0dd10033585ef87a4");

        // 2. Find Accounting Code for Expense
        let accCode = await AccountingCode.findOne({ category: "Expense", isDeleted: false });
        const accCodeId = accCode ? accCode._id : new mongoose.Types.ObjectId();

        // 3. Target Supplier: DETAILENS INTERNACIONAL (or CLI arg)
        const vendorName = process.argv[2] || "DETAILENS INTERNACIONAL";
        let supplierDoc = await Supplier.findOne({
            $or: [
                { name: { $regex: new RegExp("^" + vendorName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "$", "i") } },
                { companyName: { $regex: new RegExp("^" + vendorName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "$", "i") } },
                { name: { $regex: new RegExp(vendorName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), "i") } }
            ],
            isDeleted: { $ne: true }
        });

        if (!supplierDoc) {
            supplierDoc = await Supplier.create({
                name: vendorName,
                companyName: vendorName,
                status: "ACTIVE",
                createdBy: adminId,
                creatorRole: "ADMIN"
            });
            console.log(`✓ Created new Supplier "${vendorName}" (_id: ${supplierDoc._id})`);
        } else {
            console.log(`✓ Found existing Supplier "${supplierDoc.name}" (_id: ${supplierDoc._id})`);
        }

        // 4. Generate Bill of $600
        const billNumber = `BILL-${Date.now().toString().slice(-6)}`;
        const billDoc = await Bill.create({
            billNumber,
            supplier: supplierDoc._id,
            branch: branchId,
            billDate: new Date(),
            dueDate: new Date(Date.now() + 15 * 86400000), // 15 days due date
            items: [
                {
                    itemName: "Vehicle Detailing & Cleaning Services",
                    quantity: 1,
                    unitPrice: 600,
                    accountId: accCodeId,
                    description: `Vendor bill for $600 auto set-off testing for ${supplierDoc.name}`
                }
            ],
            totalAmount: 600,
            amountPaid: 0,
            balanceDue: 600,
            status: "OPEN",
            createdBy: adminId,
            creatorRole: "ADMIN"
        });

        console.log("\n=========================================================");
        console.log("✓ SUCCESS: Vendor Bill generated successfully!");
        console.log(`  • Bill Number: ${billDoc.billNumber}`);
        console.log(`  • Bill ID: ${billDoc._id}`);
        console.log(`  • Vendor: "${supplierDoc.name}" (${supplierDoc._id})`);
        console.log(`  • Total Amount: $${billDoc.totalAmount}`);
        console.log(`  • Balance Due: $${billDoc.balanceDue}`);
        console.log(`  • Status: ${billDoc.status}`);
        console.log("=========================================================\n");

        process.exit(0);
    } catch (e) {
        console.error("❌ Error generating bill:", e);
        process.exit(1);
    }
};

run();
