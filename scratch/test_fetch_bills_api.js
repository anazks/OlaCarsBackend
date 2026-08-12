require("dotenv").config();
const mongoose = require("mongoose");
const BillService = require("../Src/modules/Bill/Service/BillService");
const Supplier = require("../Src/modules/Supplier/Model/SupplierModel");

const run = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected to MongoDB");

        const supplierDoc = await Supplier.findOne({ name: /TEST VENDOR AUTO SETOFF/i });
        console.log("Supplier Doc in DB:", supplierDoc?._id, supplierDoc?.name);

        const result = await BillService.getAllBills({
            limit: '10000',
            status: 'OPEN,PARTIALLY_PAID,DRAFT',
            ignoreDefaultDates: 'true'
        });

        console.log(`Total Bills returned by API query: ${result.data.length}`);
        const vendorBills = result.data.filter(b => String(b.supplier?._id || b.supplier) === String(supplierDoc?._id));
        console.log("=== VENDOR BILLS FOUND IN API RESPONSE ===");
        console.log(vendorBills.map(b => ({ id: b._id, billNumber: b.billNumber, total: b.totalAmount, balance: b.balanceDue, status: b.status })));

        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
};

run();
