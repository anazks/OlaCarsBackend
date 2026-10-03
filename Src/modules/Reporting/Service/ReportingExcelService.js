const XLSX = require("xlsx");
const Expense = require("../../Expense/Model/ExpenseModel");
const PurchaseOrder = require("../../PurchaseOrder/Model/PurchaseOrderModel");
const Bill = require("../../Bill/Model/BillModel");
const PaymentMade = require("../../PaymentMade/Model/PaymentMadeModel");
const Branch = require("../../Branch/Model/BranchModel");
const AccountingCode = require("../../AccountingCode/Model/AccountingCodeModel");

exports.generateExcelReport = async (reportType, filters) => {
    const { startDate, endDate, branch, country } = filters;
    const query = {};

    // Apply branch / country filters
    if (branch) {
        query.branch = branch;
    } else if (country) {
        const branches = await Branch.find({ country, isDeleted: false });
        const branchIds = branches.map(b => b._id);
        query.branch = { $in: branchIds };
    }

    let data = [];
    let sheetName = "Report";

    if (reportType === "expenses") {
        sheetName = "Operational Expenses";
        if (startDate || endDate) {
            query.expenseDate = {};
            if (startDate) query.expenseDate.$gte = new Date(startDate);
            if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                query.expenseDate.$lte = end;
            }
        }

        const expenses = await Expense.find(query)
            .populate("expenseAccount", "name code")
            .populate("paidThroughAccount", "name code")
            .populate("supplier", "name")
            .populate("customer", "name")
            .populate("branch", "name")
            .sort({ expenseDate: -1 });

        data = expenses.map(exp => ({
            "Expense Number": exp.expenseNumber || "",
            "Date": exp.expenseDate ? exp.expenseDate.toISOString().split('T')[0] : "",
            "Expense Account Code": exp.expenseAccount?.code || "",
            "Expense Account Name": exp.expenseAccount?.name || "",
            "Paid Through Account Code": exp.paidThroughAccount?.code || "",
            "Paid Through Account Name": exp.paidThroughAccount?.name || "",
            "Amount": exp.amount || 0,
            "Supplier": exp.supplier?.name || "",
            "Customer": exp.customer?.name || "",
            "Branch": exp.branch?.name || "",
            "Notes": exp.notes || "",
            "Created By Role": exp.creatorRole || ""
        }));

    } else if (reportType === "purchase-orders") {
        sheetName = "Purchase Orders";
        if (startDate || endDate) {
            query.purchaseOrderDate = {};
            if (startDate) query.purchaseOrderDate.$gte = new Date(startDate);
            if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                query.purchaseOrderDate.$lte = end;
            }
        }

        const orders = await PurchaseOrder.find(query)
            .populate("supplier", "name")
            .populate("branch", "name")
            .sort({ purchaseOrderDate: -1 });

        data = orders.map(ord => ({
            "PO Number": ord.purchaseOrderNumber || "",
            "Date": ord.purchaseOrderDate ? ord.purchaseOrderDate.toISOString().split('T')[0] : "",
            "Supplier": ord.supplier?.name || "",
            "Branch": ord.branch?.name || "",
            "Purpose": ord.purpose || "",
            "Status": ord.status || "",
            "Total Amount": ord.totalAmount || 0,
            "Description": ord.description || "",
            "Created By Role": ord.creatorRole || ""
        }));

    } else if (reportType === "purchase-bills") {
        sheetName = "Purchase Bills";
        if (startDate || endDate) {
            query.billDate = {};
            if (startDate) query.billDate.$gte = new Date(startDate);
            if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                query.billDate.$lte = end;
            }
        }

        const bills = await Bill.find(query)
            .populate("supplier", "name")
            .populate("customer", "name")
            .populate("branch", "name")
            .populate("purchaseOrder", "purchaseOrderNumber")
            .populate("items.accountId", "code name category")
            .sort({ billDate: -1 });

        data = [];
        for (const bill of bills) {
            const billBase = {
                "Bill Number": bill.billNumber || "",
                "Date": bill.billDate ? bill.billDate.toISOString().split('T')[0] : "",
                "Due Date": bill.dueDate ? bill.dueDate.toISOString().split('T')[0] : "",
                "PO Number": bill.purchaseOrder?.purchaseOrderNumber || "",
                "Supplier": bill.supplier?.name || "",
                "Customer": bill.customer?.name || "",
                "Branch": bill.branch?.name || "",
                "Status": bill.status || "",
                "Total Amount": bill.totalAmount || 0,
                "Amount Paid": bill.amountPaid || 0,
                "Balance Due": bill.balanceDue || 0,
                "Inclusive Tax": bill.isInclusiveTax ? "Yes" : "No",
                "Tax Percentage": bill.taxPercentage || 0,
                "Tax Amount": bill.taxAmount || 0,
                "Notes": bill.notes || ""
            };

            if (bill.items && bill.items.length > 0) {
                bill.items.forEach((item, itemIdx) => {
                    const lineTotal = (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0);
                    let accountStr = "";
                    if (item.accountId) {
                        if (typeof item.accountId === "object") {
                            accountStr = item.accountId.code
                                ? `${item.accountId.code} - ${item.accountId.name || ""}`.trim()
                                : (item.accountId.name || "");
                        } else {
                            accountStr = String(item.accountId);
                        }
                    }

                    data.push({
                        "Bill Number": billBase["Bill Number"],
                        "Date": billBase["Date"],
                        "Due Date": billBase["Due Date"],
                        "PO Number": billBase["PO Number"],
                        "Supplier": billBase["Supplier"],
                        "Customer": billBase["Customer"],
                        "Branch": billBase["Branch"],
                        "Status": billBase["Status"],
                        "Item #": itemIdx + 1,
                        "Item Name": item.itemName || "",
                        "Item Description": item.description || "",
                        "Item Account": accountStr,
                        "Item Quantity": item.quantity != null ? item.quantity : 0,
                        "Item Unit Price": item.unitPrice != null ? item.unitPrice : 0,
                        "Item Line Total": lineTotal,
                        "Total Amount": billBase["Total Amount"],
                        "Amount Paid": billBase["Amount Paid"],
                        "Balance Due": billBase["Balance Due"],
                        "Inclusive Tax": billBase["Inclusive Tax"],
                        "Tax Percentage": billBase["Tax Percentage"],
                        "Tax Amount": billBase["Tax Amount"],
                        "Notes": billBase["Notes"]
                    });
                });
            } else {
                data.push({
                    "Bill Number": billBase["Bill Number"],
                    "Date": billBase["Date"],
                    "Due Date": billBase["Due Date"],
                    "PO Number": billBase["PO Number"],
                    "Supplier": billBase["Supplier"],
                    "Customer": billBase["Customer"],
                    "Branch": billBase["Branch"],
                    "Status": billBase["Status"],
                    "Item #": "",
                    "Item Name": "",
                    "Item Description": "",
                    "Item Account": "",
                    "Item Quantity": 0,
                    "Item Unit Price": 0,
                    "Item Line Total": 0,
                    "Total Amount": billBase["Total Amount"],
                    "Amount Paid": billBase["Amount Paid"],
                    "Balance Due": billBase["Balance Due"],
                    "Inclusive Tax": billBase["Inclusive Tax"],
                    "Tax Percentage": billBase["Tax Percentage"],
                    "Tax Amount": billBase["Tax Amount"],
                    "Notes": billBase["Notes"]
                });
            }
        }

    } else if (reportType === "vendor-payments") {
        sheetName = "Vendor Payments";
        if (startDate || endDate) {
            query.paymentDate = {};
            if (startDate) query.paymentDate.$gte = new Date(startDate);
            if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                query.paymentDate.$lte = end;
            }
        }

        const payments = await PaymentMade.find(query)
            .populate("supplier", "name")
            .populate("branch", "name")
            .populate("paidThroughAccount", "name code")
            .sort({ paymentDate: -1 });

        data = payments.map(pay => ({
            "Payment Number": pay.paymentNumber || "",
            "Date": pay.paymentDate ? pay.paymentDate.toISOString().split('T')[0] : "",
            "Supplier": pay.supplier?.name || "Unresolved Supplier",
            "Branch": pay.branch?.name || "",
            "Amount": pay.amount || 0,
            "Payment Method": pay.paymentMethod || "",
            "Reference Number": pay.referenceNumber || "",
            "Paid Through Account Code": pay.paidThroughAccount?.code || "",
            "Paid Through Account Name": pay.paidThroughAccount?.name || "",
            "Status": pay.status || "",
            "Notes": pay.notes || ""
        }));
    } else {
        throw new Error("Invalid report type specified.");
    }

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);

    // Auto-fit column widths
    if (data.length > 0) {
        const keys = Object.keys(data[0]);
        ws["!cols"] = keys.map(key => {
            const maxLen = Math.max(
                key.length,
                ...data.map(row => String(row[key] || "").length)
            );
            return { wch: maxLen + 2 };
        });
    }

    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    return { buffer, sheetName };
};
