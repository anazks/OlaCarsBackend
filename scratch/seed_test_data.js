const mongoose = require('mongoose');
require('dotenv').config();

// Register Models
const { ServiceBill } = require('../Src/modules/ServiceBill/Model/ServiceBillModel');
const { Invoice } = require('../Src/modules/Invoice/Model/InvoiceModel');
const { WorkOrder } = require('../Src/modules/WorkOrder/Model/WorkOrderModel');
require('../Src/modules/Driver/Model/DriverModel');
require('../Src/modules/Vehicle/Model/VehicleModel');
require('../Src/modules/Branch/Model/BranchModel');

async function seedData() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        const driverId = '69fadd5ba0ae972a082b6217';
        const vehicleId = '69fad1399038735e94311914';
        const branchId = '69f8550b9807cf101fda47bd';
        const userId = '6a0429abfbcf609e61d8406d';

        // Create a dummy Work Order for these bills
        const wo = await WorkOrder.create({
            workOrderNumber: `WO-SEED-${Date.now().toString().slice(-4)}`,
            vehicleId,
            branchId,
            status: 'CLOSED',
            issueDescription: 'Seeding test data',
            faultDescription: 'Test seeding',
            workOrderType: 'CORRECTIVE',
            createdBy: userId,
            creatorRole: 'ADMIN'
        });

        const seedBills = [
            {
                billNumber: 'SB-SEED-001',
                status: 'PAID',
                paymentStatus: 'PAID',
                totalAmount: 100,
                amountPaid: 100,
                isDriverBilled: true
            },
            {
                billNumber: 'SB-SEED-002',
                status: 'APPROVED',
                paymentStatus: 'PARTIAL',
                totalAmount: 250,
                amountPaid: 100,
                isDriverBilled: true
            },
            {
                billNumber: 'SB-SEED-003',
                status: 'APPROVED',
                paymentStatus: 'UNPAID',
                totalAmount: 500,
                amountPaid: 0,
                isDriverBilled: true
            }
        ];

        for (const billData of seedBills) {
            // Delete existing if any
            await ServiceBill.deleteOne({ billNumber: billData.billNumber });
            await Invoice.deleteOne({ invoiceNumber: billData.billNumber.replace('SB', 'WRK') });

            const bill = await ServiceBill.create({
                ...billData,
                workOrderId: wo._id,
                vehicleId,
                branchId,
                createdBy: userId,
                creatorRole: 'ADMIN',
                lineItems: [{ type: 'LABOUR', description: 'Test Seeding', quantity: 1, unitPrice: billData.totalAmount, lineTotal: billData.totalAmount }],
                subtotal: billData.totalAmount,
                payments: billData.amountPaid > 0 ? [{
                    amount: billData.amountPaid,
                    paidAt: new Date(),
                    paymentMethod: 'Cash',
                    recordedBy: userId,
                    notes: 'Seed payment'
                }] : []
            });

            const invoice = await Invoice.create({
                invoiceNumber: bill.billNumber.replace('SB', 'WRK'),
                invoiceType: 'WORKSHOP',
                driver: driverId,
                vehicle: vehicleId,
                serviceBill: bill._id,
                dueDate: new Date(Date.now() + 86400000), // 1 day due
                baseAmount: bill.totalAmount,
                totalAmountDue: bill.totalAmount,
                amountPaid: bill.amountPaid,
                balance: bill.totalAmount - bill.amountPaid,
                status: bill.paymentStatus === 'PAID' ? 'PAID' : (bill.paymentStatus === 'PARTIAL' ? 'PARTIAL' : 'PENDING'),
                createdBy: userId,
                creatorRole: 'ADMIN',
                payments: bill.amountPaid > 0 ? [{
                    amount: bill.amountPaid,
                    paidAt: new Date(),
                    paymentMethod: 'Cash',
                    note: 'Seed payment'
                }] : []
            });

            console.log(`Created Bill ${bill.billNumber} and Invoice ${invoice.invoiceNumber}`);
        }

        console.log('Seeding complete.');
        process.exit(0);
    } catch (err) {
        console.error('Seeding failed:', err);
        process.exit(1);
    }
}

seedData();
