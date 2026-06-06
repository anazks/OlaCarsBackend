require('dotenv').config();
const mongoose = require('mongoose');
const { Driver } = require('../Src/modules/Driver/Model/DriverModel');
const Customer = require('../Src/modules/Customer/Model/CustomerModel');
const { Invoice } = require('../Src/modules/Invoice/Model/InvoiceModel');
const CreditNote = require('../Src/modules/CreditNote/Model/CreditNoteModel');
const PaymentReceived = require('../Src/modules/PaymentReceived/Model/PaymentReceivedModel');
const { getNextCustomerId } = require('../Src/modules/SystemSettings/Model/CounterModel');

async function migrate() {
    try {
        console.log("Connecting to database...");
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected to database successfully.");

        // 1. Fetch all drivers
        const drivers = await Driver.find({ isDeleted: false });
        console.log(`Found ${drivers.length} drivers to migrate.`);

        let customerCount = 0;
        let invoiceCount = 0;
        let creditNoteCount = 0;
        let paymentReceivedCount = 0;

        for (const driver of drivers) {
            // Check if Customer already exists for this driver
            let customerDoc = await Customer.findOne({ driver: driver._id });
            if (!customerDoc) {
                const customerId = await getNextCustomerId();
                customerDoc = new Customer({
                    customerId,
                    driver: driver._id,
                    name: driver.personalInfo?.fullName || `${driver.personalInfo?.firstName || ''} ${driver.personalInfo?.lastName || ''}`.trim() || 'Unnamed Driver',
                    email: driver.personalInfo?.email || undefined,
                    phone: driver.personalInfo?.phone || undefined,
                    whatsappNumber: driver.personalInfo?.whatsappNumber || undefined,
                    branch: driver.branch,
                    status: driver.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
                    isDeleted: false,
                    createdBy: new mongoose.Types.ObjectId(), // System generated
                    creatorRole: 'ADMIN'
                });
                await customerDoc.save();
                customerCount++;
                console.log(`Created customer ${customerId} for driver ${driver.personalInfo?.fullName || driver._id}`);
            }

            // 2. Update all invoices for this driver
            const invoicesResult = await Invoice.updateMany(
                { driver: driver._id, customer: { $exists: false } },
                { $set: { customer: customerDoc._id } }
            );
            if (invoicesResult.modifiedCount > 0) {
                invoiceCount += invoicesResult.modifiedCount;
                console.log(`Updated ${invoicesResult.modifiedCount} invoices for driver ${driver._id} to point to customer ${customerDoc.customerId}`);
            }

            // 3. Update all credit notes for this driver
            const cnResult = await CreditNote.updateMany(
                { driverId: driver._id, customerId: { $exists: false } },
                { $set: { customerId: customerDoc._id } }
            );
            if (cnResult.modifiedCount > 0) {
                creditNoteCount += cnResult.modifiedCount;
                console.log(`Updated ${cnResult.modifiedCount} credit notes for driver ${driver._id} to point to customer ${customerDoc.customerId}`);
            }

            // 4. Update all payment received records for this driver
            const prResult = await PaymentReceived.updateMany(
                { driverId: driver._id, customerId: { $exists: false } },
                { $set: { customerId: customerDoc._id } }
            );
            if (prResult.modifiedCount > 0) {
                paymentReceivedCount += prResult.modifiedCount;
                console.log(`Updated ${prResult.modifiedCount} payments received for driver ${driver._id} to point to customer ${customerDoc.customerId}`);
            }
        }

        console.log("\n--- Migration completed successfully ---");
        console.log(`Customers created: ${customerCount}`);
        console.log(`Invoices updated: ${invoiceCount}`);
        console.log(`Credit notes updated: ${creditNoteCount}`);
        console.log(`Payments received updated: ${paymentReceivedCount}`);
        
        await mongoose.connection.close();
        console.log("Database connection closed.");
    } catch (err) {
        console.error("Migration failed:", err);
        process.exit(1);
    }
}

migrate();
