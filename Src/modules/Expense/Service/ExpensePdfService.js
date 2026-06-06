const PDFDocument = require("pdfkit");

// Safe currency formatter
const formatCurrency = (val) => {
    const num = typeof val === "number" ? val : parseFloat(val);
    return isNaN(num) ? "0.00" : num.toFixed(2);
};

// Safe date formatter
const formatDate = (val) => {
    if (!val) return "N/A";
    const d = new Date(val);
    if (isNaN(d.getTime())) return "N/A";
    return d.toLocaleDateString("en-US", { dateStyle: "medium" });
};

exports.generateExpensePdf = (expense, res) => {
    if (!expense) {
        throw new Error("No expense data provided");
    }

    const doc = new PDFDocument({ 
        size: "A4", 
        margin: 50,
        info: {
            Title: `Expense Voucher ${expense.expenseNumber || "N/A"}`,
            Author: "Ola Cars Logistics"
        }
    });

    // Pipe the PDF to the response
    doc.pipe(res);

    // Color Palette
    const primaryColor = "#111827"; // Dark slate
    const secondaryColor = "#4B5563"; // Dim grey
    const borderMain = "#E5E7EB"; // Separator lines
    const accentColor = "#4F46E5"; // Accent blue
    const successColor = "#10B981"; // Accent green for payment out

    const leftMargin = 50;
    const rightMargin = 545;
    const rightColX = 350;

    // Header
    doc.fillColor(primaryColor)
       .fontSize(22)
       .text("OLA CARS", leftMargin, 50, { bold: true })
       .fontSize(9)
       .fillColor(secondaryColor)
       .text("Logistics Finance & Procurement", leftMargin, 75);

    doc.fontSize(18)
       .fillColor(primaryColor)
       .text("EXPENSE VOUCHER", rightColX - 50, 50, { align: "right", width: 245 });

    doc.moveTo(leftMargin, 95)
       .lineTo(rightMargin, 95)
       .strokeColor(borderMain)
       .stroke();

    // Metadata Column details
    const metaY = 115;

    // Left Column (Voucher details)
    doc.fontSize(9).fillColor(secondaryColor);
    doc.text("VOUCHER DETAILS:", leftMargin, metaY);

    doc.fontSize(10).fillColor(primaryColor)
       .text(`Voucher Number: ${expense.expenseNumber || "N/A"}`, leftMargin, metaY + 16, { bold: true })
       .fontSize(9).fillColor(secondaryColor)
       .text(`Date of Expense: ${formatDate(expense.expenseDate)}`, leftMargin, metaY + 32)
       .text(`Node Location: ${expense.branch?.name || "N/A"} (${expense.branch?.city || "N/A"})`, leftMargin, metaY + 46);

    // Right Column (Financial overview)
    doc.fillColor(secondaryColor).fontSize(9)
       .text("TOTAL AMOUNT DISBURSED", rightColX, metaY, { align: "right", width: 195 });
    
    doc.fillColor(successColor).fontSize(26)
       .text(`$${formatCurrency(expense.amount)}`, rightColX, metaY + 14, { align: "right", width: 195, bold: true });

    doc.fillColor(secondaryColor).fontSize(8)
       .text("Status: Cleared & Posted", rightColX, metaY + 44, { align: "right", width: 195 });

    doc.moveTo(leftMargin, 190)
       .lineTo(rightMargin, 190)
       .strokeColor(borderMain)
       .stroke();

    // Voucher Accounts breakdown
    let contentY = 210;
    doc.fontSize(10).fillColor(primaryColor).text("Accounting & Disbursement Allocation", leftMargin, contentY, { bold: true });

    // Table Header
    contentY += 24;
    doc.fontSize(8).fillColor(secondaryColor);
    doc.text("ACCOUNT DEBIT (CHARGE CATEGORY)", leftMargin, contentY)
       .text("ACCOUNT CREDIT (PAID THROUGH)", rightColX - 30, contentY)
       .text("NET AMOUNT", rightColX + 110, contentY, { align: "right", width: 85 });

    doc.moveTo(leftMargin, contentY + 12)
       .lineTo(rightMargin, contentY + 12)
       .strokeColor(primaryColor)
       .stroke();

    contentY += 20;

    // Row details
    doc.fontSize(9).fillColor(primaryColor);
    const expAccName = expense.expenseAccount?.name || "Disbursed Expense Account";
    const expAccCode = expense.expenseAccount?.code || "N/A";
    const paidAccName = expense.paidThroughAccount?.name || "Cash/Bank Disbursal";
    const paidAccCode = expense.paidThroughAccount?.code || "N/A";

    doc.text(`${expAccName} (${expAccCode})`, leftMargin, contentY, { width: 230 });
    doc.text(`${paidAccName} (${paidAccCode})`, rightColX - 30, contentY, { width: 230 });
    doc.text(`$${formatCurrency(expense.amount)}`, rightColX + 110, contentY, { align: "right", width: 85, bold: true });

    contentY += 35;
    doc.moveTo(leftMargin, contentY)
       .lineTo(rightMargin, contentY)
       .strokeColor(borderMain)
       .stroke();

    // Context details (Supplier/Customer/Notes)
    contentY += 20;
    if (expense.supplier) {
        doc.fontSize(9).fillColor(secondaryColor).text("Payee Supplier Details:", leftMargin, contentY);
        doc.fillColor(primaryColor)
           .text(expense.supplier.name || "N/A", leftMargin, contentY + 14, { bold: true })
           .fontSize(8.5).fillColor(secondaryColor)
           .text(`Contact: ${expense.supplier.contactPerson || "N/A"} (${expense.supplier.email || "N/A"})`, leftMargin, contentY + 28);
        contentY += 50;
    } else if (expense.customer) {
        doc.fontSize(9).fillColor(secondaryColor).text("Linked Customer details:", leftMargin, contentY);
        doc.fillColor(primaryColor)
           .text(expense.customer.fullName || expense.customer.name || "N/A", leftMargin, contentY + 14, { bold: true });
        contentY += 36;
    }

    if (expense.notes) {
        doc.fontSize(9).fillColor(secondaryColor).text("Transaction memo notes / justification:", leftMargin, contentY);
        doc.fontSize(8.5).fillColor(primaryColor).text(expense.notes, leftMargin, contentY + 14, { width: 495 });
        contentY += 50;
    }

    // Signatures
    doc.fontSize(8).fillColor(secondaryColor)
       .text(`Created By: ${expense.creatorRole || "FINANCESTAFF"} (${expense.createdBy?.fullName || "Operator"})`, leftMargin, 640)
       .text("This document is generated by Ola Cars system and serves as an official accounting cash/bank disbursement proof.", leftMargin, 654);

    // Signature Line
    doc.moveTo(rightColX + 40, 680)
       .lineTo(rightMargin, 680)
       .strokeColor(primaryColor)
       .stroke();
    doc.fontSize(8.5).fillColor(primaryColor).text("Authorized Signature & Stamp", rightColX + 40, 688, { align: "center", width: 155 });

    doc.end();
};
