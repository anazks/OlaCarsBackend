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

exports.generateCreditNotePdf = (creditNote, res) => {
    if (!creditNote) {
        throw new Error("No credit note data provided");
    }

    const doc = new PDFDocument({ 
        size: "A4", 
        margin: 50,
        info: {
            Title: `Credit Note ${creditNote.creditNoteNumber || "N/A"}`,
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
    const creditColor = "#10B981"; // Accent green for credit addition

    const leftMargin = 50;
    const rightMargin = 545;
    const rightColX = 350;

    // Header
    doc.fillColor(primaryColor)
       .fontSize(22)
       .text("OLA CARS", leftMargin, 50, { bold: true });


    doc.fontSize(18)
       .fillColor(primaryColor)
       .text("CREDIT NOTE", rightColX - 50, 50, { align: "right", width: 245 });

    doc.moveTo(leftMargin, 95)
       .lineTo(rightMargin, 95)
       .strokeColor(borderMain)
       .stroke();

    // Metadata Column details
    const metaY = 115;

    // Left Column (Credit Note details)
    doc.fontSize(9).fillColor(secondaryColor);
    doc.text("CREDIT NOTE DETAILS:", leftMargin, metaY);

    doc.fontSize(10).fillColor(primaryColor)
       .text(`Credit Note: ${creditNote.creditNoteNumber || "N/A"}`, leftMargin, metaY + 16, { bold: true })
       .fontSize(9).fillColor(secondaryColor)
       .text(`Date Issued: ${formatDate(creditNote.creditNoteDate)}`, leftMargin, metaY + 32)
       .text(`Reason: ${creditNote.reason || "N/A"}`, leftMargin, metaY + 46, { width: 250 });

    // Right Column (Financial overview)
    doc.fillColor(secondaryColor).fontSize(9)
       .text("TOTAL CREDIT ISSUED", rightColX, metaY, { align: "right", width: 195 });
    
    doc.fillColor(creditColor).fontSize(26)
       .text(`$${formatCurrency(creditNote.amount)}`, rightColX, metaY + 14, { align: "right", width: 195, bold: true });

    doc.fillColor(secondaryColor).fontSize(8)
       .text(`Status: ${creditNote.status || "OPEN"}`, rightColX, metaY + 44, { align: "right", width: 195 });

    doc.moveTo(leftMargin, 195)
       .lineTo(rightMargin, 195)
       .strokeColor(borderMain)
       .stroke();

    // Details grid (Driver/Operator & Linked Invoice)
    let contentY = 215;

    // Driver details
    const driver = creditNote.driverId || {};
    const personalInfo = driver.personalInfo || {};
    doc.fontSize(9).fillColor(secondaryColor).text("OPERATOR / DRIVER DETAILS:", leftMargin, contentY);
    doc.fontSize(10).fillColor(primaryColor)
       .text(personalInfo.fullName || "N/A", leftMargin, contentY + 14, { bold: true })
       .fontSize(9).fillColor(secondaryColor)
       .text(`Operator ID: ${driver.driverId || "N/A"}`, leftMargin, contentY + 28)
       .text(`Email: ${personalInfo.email || "N/A"}`, leftMargin, contentY + 42)
       .text(`Phone: ${personalInfo.phone || "N/A"}`, leftMargin, contentY + 56);

    // Linked Invoice details
    if (creditNote.invoiceId) {
        const invoice = creditNote.invoiceId;
        doc.fontSize(9).fillColor(secondaryColor).text("APPLIED TO INVOICE:", rightColX, contentY);
        doc.fontSize(10).fillColor(primaryColor)
           .text(`Invoice Number: ${invoice.invoiceNumber || "N/A"}`, rightColX, contentY + 14, { bold: true })
           .fontSize(9).fillColor(secondaryColor)
           .text(`Cycle Period: ${invoice.weekLabel || "N/A"}`, rightColX, contentY + 28)
           .text(`Total Amount Billed: $${formatCurrency(invoice.totalAmountDue)}`, rightColX, contentY + 42)
           .text(`Remaining Balance: $${formatCurrency(invoice.balance)}`, rightColX, contentY + 56);
    } else {
        doc.fontSize(9).fillColor(secondaryColor).text("APPLIED TO INVOICE:", rightColX, contentY);
        doc.fontSize(10).fillColor(primaryColor)
           .text("Unapplied (General Credit Pool)", rightColX, contentY + 14, { bold: true })
           .fontSize(9).fillColor(secondaryColor)
           .text("This credit is held on driver's balance registry and will roll over to settle future cycle bills.", rightColX, contentY + 28, { width: 195 });
    }

    contentY += 90;
    doc.moveTo(leftMargin, contentY)
       .lineTo(rightMargin, contentY)
       .strokeColor(borderMain)
       .stroke();

    // Notes memo
    contentY += 20;
    if (creditNote.notes) {
        doc.fontSize(9).fillColor(secondaryColor).text("Voucher Comments / Memo Notes:", leftMargin, contentY);
        doc.fontSize(8.5).fillColor(primaryColor).text(creditNote.notes, leftMargin, contentY + 14, { width: 495 });
        contentY += 50;
    }

    // Signatures / Footers
    doc.fontSize(8).fillColor(secondaryColor)
       .text(`Issued By: ${creditNote.creatorRole || "FINANCEADMIN"}`, leftMargin, 640)
       .text("This is an official document recording driver lease liability reversal and is adjusted in system ledgers.", leftMargin, 654);

    doc.moveTo(rightColX + 40, 680)
       .lineTo(rightMargin, 680)
       .strokeColor(primaryColor)
       .stroke();
    doc.fontSize(8.5).fillColor(primaryColor).text("Authorized Signature & Stamp", rightColX + 40, 688, { align: "center", width: 155 });

    doc.end();
};
