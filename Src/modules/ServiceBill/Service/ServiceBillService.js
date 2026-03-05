const { createBill, getBillById, updateBill } = require("../Repo/ServiceBillRepo");
const { getWorkOrderById } = require("../../WorkOrder/Repo/WorkOrderRepo");

/**
 * Generate a ServiceBill from a completed Work Order.
 * Pulls parts, labour data and creates line items + totals.
 * @param {string} woId - Work Order ID
 * @param {Object} options - { taxRate, hourlyRate, discount, notes }
 * @param {Object} user - { id, role }
 * @returns {Promise<Object>}
 */
const generateFromWorkOrder = async (woId, options = {}, user) => {
    const wo = await getWorkOrderById(woId);
    if (!wo) throw new Error("Work order not found.", { cause: 404 });

    // Check WO is in a billable state
    const billableStatuses = ["VEHICLE_RELEASED", "INVOICED", "CLOSED"];
    if (!billableStatuses.includes(wo.status)) {
        throw new Error(
            `Work order must be in VEHICLE_RELEASED, INVOICED, or CLOSED state to generate a bill. Current: ${wo.status}`,
            { cause: 400 }
        );
    }

    const hourlyRate = options.hourlyRate || 50;
    const taxRate = options.taxRate || 0;
    const discount = options.discount || 0;

    // Build line items from parts
    const lineItems = [];

    for (const part of wo.parts || []) {
        if (part.status === "INSTALLED" || part.status === "RECEIVED") {
            lineItems.push({
                type: "PART",
                description: `${part.partName}${part.partNumber ? ` (${part.partNumber})` : ""}`,
                quantity: part.quantity,
                unitPrice: part.unitCost,
                lineTotal: part.totalCost,
                partId: part.inventoryPartId || undefined,
            });
        }
    }

    // Build labour line item
    const actualHours = wo.actualLabourHours || 0;
    if (actualHours > 0) {
        lineItems.push({
            type: "LABOUR",
            description: `Workshop labour — ${actualHours} hours @ $${hourlyRate}/hr`,
            quantity: actualHours,
            unitPrice: hourlyRate,
            lineTotal: actualHours * hourlyRate,
        });
    }

    // Calculate totals
    const subtotal = lineItems.reduce((sum, item) => sum + item.lineTotal, 0);
    const taxAmount = Math.round(subtotal * (taxRate / 100) * 100) / 100;
    const totalAmount = subtotal + taxAmount - discount;

    // Build accounting entries
    const accountingEntries = [
        {
            entryType: "DEBIT",
            accountCode: "5100",
            accountName: "Vehicle Maintenance Expense",
            amount: subtotal,
            description: `Maintenance expense for WO ${wo.workOrderNumber}`,
        },
        {
            entryType: "CREDIT",
            accountCode: "2100",
            accountName: "Accounts Payable — Workshop",
            amount: totalAmount,
            description: `Payable for WO ${wo.workOrderNumber}`,
        },
    ];

    if (taxAmount > 0) {
        accountingEntries.push({
            entryType: "DEBIT",
            accountCode: "1500",
            accountName: "Input Tax (VAT)",
            amount: taxAmount,
            description: `Tax on WO ${wo.workOrderNumber}`,
        });
    }

    const billData = {
        workOrderId: wo._id,
        vehicleId: wo.vehicleId,
        branchId: wo.branchId,
        lineItems,
        subtotal,
        taxRate,
        taxAmount,
        discount,
        totalAmount,
        labourSummary: {
            totalHours: actualHours,
            hourlyRate,
            labourTotal: actualHours * hourlyRate,
        },
        accountingEntries,
        notes: options.notes || `Auto-generated bill for Work Order ${wo.workOrderNumber}`,
        createdBy: user.id,
        creatorRole: user.role,
    };

    return await createBill(billData);
};

/**
 * Approve a service bill.
 */
const approveBill = async (billId, user) => {
    const bill = await getBillById(billId);
    if (!bill) throw new Error("Service bill not found.", { cause: 404 });

    if (bill.status !== "PENDING_APPROVAL" && bill.status !== "DRAFT") {
        throw new Error(`Bill must be in DRAFT or PENDING_APPROVAL state. Current: ${bill.status}`, { cause: 400 });
    }

    return await updateBill(billId, {
        status: "APPROVED",
        approvedBy: user.id,
        approvedByRole: user.role,
        approvedAt: new Date(),
    });
};

/**
 * Mark a bill as paid.
 */
const markPaid = async (billId, paymentData) => {
    const bill = await getBillById(billId);
    if (!bill) throw new Error("Service bill not found.", { cause: 404 });

    if (bill.status !== "APPROVED") {
        throw new Error("Bill must be APPROVED before marking as paid.", { cause: 400 });
    }

    return await updateBill(billId, {
        status: "PAID",
        paymentStatus: "PAID",
        paymentMethod: paymentData.paymentMethod,
        paymentReference: paymentData.paymentReference,
        paidAt: new Date(),
    });
};

/**
 * Void a bill.
 */
const voidBill = async (billId, reason) => {
    if (!reason) throw new Error("Void reason is required.", { cause: 400 });
    return await updateBill(billId, { status: "VOID", voidReason: reason });
};

module.exports = {
    generateFromWorkOrder,
    approveBill,
    markPaid,
    voidBill,
};
