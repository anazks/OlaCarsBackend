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

/**
 * Generate a professional invoice PDF and stream it to the response.
 * @param {Object} invoice - The invoice mongoose document populated with driver and vehicle
 * @param {Object} res - The Express response object
 */
exports.generateInvoicePdf = (invoice, res) => {
    if (!invoice) {
        throw new Error("No invoice data provided");
    }

    const doc = new PDFDocument({ 
        size: "A4", 
        margin: 50,
        info: {
            Title: `Invoice ${invoice.invoiceNumber || "N/A"}`,
            Author: "Ola Cars Logistics"
        }
    });

    // Pipe the PDF to the response
    doc.pipe(res);

    // Color Palette
    const primaryColor = "#111827"; // Dark slate
    const secondaryColor = "#4B5563"; // Dim grey
    const lightGrey = "#F3F4F6"; // Background highlights
    const borderMain = "#E5E7EB"; // Separator lines
    const accentColor = "#4F46E5"; // Accent blue (Indigo-600)

    // Layout Constants
    const leftMargin = 50;
    const rightMargin = 545; // A4 width (595) - margin (50)
    const rightColX = 350;

    // ─── Header Section ───────────────────────────────────────────
    doc.fillColor(primaryColor)
       .fontSize(22)
       .text("OLA CARS", leftMargin, 50, { bold: true })
       .fontSize(9)
       .fillColor(secondaryColor)
       .text("Logistics Finance Division", leftMargin, 75);

    // "INVOICE" Title
    doc.fontSize(20)
       .fillColor(primaryColor)
       .text("INVOICE", rightColX, 50, { align: "right", width: 195 });

    // Separator line
    doc.moveTo(leftMargin, 95)
       .lineTo(rightMargin, 95)
       .strokeColor(borderMain)
       .stroke();

    // ─── Metadata Column Details ──────────────────────────────────
    const metaY = 115;
    
    // Invoice Metadata (Right)
    doc.fontSize(9).fillColor(secondaryColor);
    doc.text("Invoice Number:", rightColX, metaY)
       .fillColor(primaryColor)
       .text(invoice.invoiceNumber || "N/A", rightColX + 90, metaY, { align: "right", width: 105 });

    doc.fillColor(secondaryColor)
       .text("Invoice Date:", rightColX, metaY + 16)
       .fillColor(primaryColor)
       .text(formatDate(invoice.generatedAt || invoice.createdAt), rightColX + 90, metaY + 16, { align: "right", width: 105 });

    doc.fillColor(secondaryColor)
       .text("Due Date:", rightColX, metaY + 32)
       .fillColor(primaryColor)
       .text(formatDate(invoice.dueDate), rightColX + 90, metaY + 32, { align: "right", width: 105 });

    doc.fillColor(secondaryColor)
       .text("Cycle Period:", rightColX, metaY + 48)
       .fillColor(primaryColor)
       .text(invoice.weekLabel || "N/A", rightColX + 90, metaY + 48, { align: "right", width: 105 });

    // Bill To Details (Left)
    const driver = invoice.driver || {};
    const personalInfo = driver.personalInfo || {};
    doc.fillColor(secondaryColor)
       .text("BILL TO:", leftMargin, metaY)
       .fillColor(primaryColor)
       .fontSize(11)
       .text(personalInfo.fullName || "Unresolved Operator", leftMargin, metaY + 14, { bold: true })
       .fontSize(9)
       .fillColor(secondaryColor)
       .text(`Email: ${personalInfo.email || "N/A"}`, leftMargin, metaY + 28)
       .text(`Phone: ${personalInfo.phone || "N/A"}`, leftMargin, metaY + 40)
       .text(`Operator ID: ${driver.driverId || "N/A"}`, leftMargin, metaY + 52);

    // Vehicle Context (If linked)
    if (invoice.vehicle) {
        const vehicle = invoice.vehicle;
        const vehicleDetails = typeof vehicle === "object"
            ? `${vehicle.basicDetails?.make || vehicle.make || ""} ${vehicle.basicDetails?.model || vehicle.model || ""} (${vehicle.legalDocs?.registrationNumber || vehicle.plateNumber || "N/A"})`
            : `ID: ${vehicle}`;
        doc.fillColor(secondaryColor)
           .text("VEHICLE CONTEXT:", leftMargin, metaY + 72)
           .fillColor(primaryColor)
           .text(vehicleDetails, leftMargin, metaY + 84);
    }

    // ─── Table Headers ─────────────────────────────────────────────
    let tableY = 240;
    doc.fontSize(8).fillColor(secondaryColor);
    doc.text("ITEM SPECIFICATION", leftMargin, tableY)
       .text("PRICE", rightColX - 30, tableY, { align: "right", width: 80 })
       .text("QTY", rightColX + 60, tableY, { align: "right", width: 40 })
       .text("SUBTOTAL", rightColX + 110, tableY, { align: "right", width: 85 });

    doc.moveTo(leftMargin, tableY + 12)
       .lineTo(rightMargin, tableY + 12)
       .strokeColor(primaryColor)
       .stroke();

    tableY += 22;

    // Line Items Rows
    const items = (invoice.invoiceType === "MANUAL" && invoice.lineItems && invoice.lineItems.length > 0)
        ? invoice.lineItems
        : [{ name: "Weekly Vehicle Rent Lease Rate", description: "Base lease rate evaluation for cycle period.", qty: 1, unitPrice: invoice.baseAmount }];

    items.forEach((item) => {
        doc.fontSize(9).fillColor(primaryColor);
        doc.text(item.name || "Lease Item", leftMargin, tableY, { width: 230 });
        if (item.description) {
            doc.fontSize(7.5).fillColor(secondaryColor).text(item.description, leftMargin, tableY + 11, { width: 230 });
        }

        const unitPrice = typeof item.unitPrice === "number" ? item.unitPrice : 0;
        const qty = typeof item.qty === "number" ? item.qty : 1;
        const total = typeof item.total === "number" ? item.total : (unitPrice * qty);

        doc.fontSize(9).fillColor(primaryColor);
        doc.text(`$${formatCurrency(unitPrice)}`, rightColX - 30, tableY, { align: "right", width: 80 })
           .text(qty.toString(), rightColX + 60, tableY, { align: "right", width: 40 })
           .text(`$${formatCurrency(total)}`, rightColX + 110, tableY, { align: "right", width: 85 });

        const rowHeight = item.description ? 28 : 18;
        tableY += rowHeight;
    });

    doc.moveTo(leftMargin, tableY)
       .lineTo(rightMargin, tableY)
       .strokeColor(borderMain)
       .stroke();

    tableY += 12;

    // ─── Financial Calculations / Summary Box ──────────────────────
    const totalsLabelX = rightColX + 10;
    const totalsValX = rightColX + 110;
    const sub = typeof invoice.subtotal === "number" ? invoice.subtotal : invoice.totalAmountDue;

    doc.fontSize(9).fillColor(secondaryColor);
    doc.text("Subtotal:", totalsLabelX, tableY)
       .fillColor(primaryColor)
       .text(`$${formatCurrency(sub)}`, totalsValX, tableY, { align: "right", width: 85 });

    tableY += 14;

    if (typeof invoice.discountAmount === "number" && invoice.discountAmount > 0) {
        doc.fillColor(secondaryColor)
           .text("Discount:", totalsLabelX, tableY)
           .fillColor(primaryColor)
           .text(`-$${formatCurrency(invoice.discountAmount)}`, totalsValX, tableY, { align: "right", width: 85 });
        tableY += 14;
    }

    if (typeof invoice.taxAmount === "number" && invoice.taxAmount > 0) {
        doc.fillColor(secondaryColor)
           .text("Tax:", totalsLabelX, tableY)
           .fillColor(primaryColor)
           .text(`+$${formatCurrency(invoice.taxAmount)}`, totalsValX, tableY, { align: "right", width: 85 });
        tableY += 14;
    }

    doc.moveTo(totalsLabelX, tableY)
       .lineTo(rightMargin, tableY)
       .strokeColor(borderMain)
       .stroke();

    tableY += 6;

    doc.fontSize(10).fillColor(primaryColor).text("Total Amount Due:", totalsLabelX, tableY, { bold: true })
       .text(`$${formatCurrency(invoice.totalAmountDue)}`, totalsValX, tableY, { align: "right", width: 85, bold: true });

    tableY += 16;

    doc.fontSize(9).fillColor(secondaryColor).text("Payments Received:", totalsLabelX, tableY)
       .fillColor(primaryColor)
       .text(`-$${formatCurrency(invoice.amountPaid)}`, totalsValX, tableY, { align: "right", width: 85 });

    tableY += 14;

    doc.moveTo(totalsLabelX, tableY)
       .lineTo(rightMargin, tableY)
       .strokeColor(primaryColor)
       .stroke();

    tableY += 6;

    doc.fontSize(10).fillColor(accentColor).text("Remaining Balance:", totalsLabelX, tableY, { bold: true })
       .text(`$${formatCurrency(invoice.balance)}`, totalsValX, tableY, { align: "right", width: 85, bold: true });

    // Notes at the bottom
    if (invoice.notes) {
        doc.fontSize(9).fillColor(secondaryColor).text("Memo Notes:", leftMargin, 600)
           .fillColor(primaryColor).text(invoice.notes, leftMargin, 612, { width: 250 });
    }

    // Signatures / Footer
    doc.fontSize(8).fillColor(secondaryColor)
       .text("Prepared By: Ola Cars Auto-Billing System", leftMargin, 700)
       .text("If you have queries, please contact Suraj or the branch manager.", leftMargin, 712);

    // End the document
    doc.end();
};
