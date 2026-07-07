const PDFDocument = require("pdfkit");
const path = require("path");

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

exports.generateVoucherPdf = (voucher, res) => {
    if (!voucher) {
        throw new Error("No voucher data provided");
    }

    const doc = new PDFDocument({ 
        size: "A4", 
        margin: 50,
        info: {
            Title: `Voucher ${voucher.voucherNumber || "N/A"}`,
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

    const leftMargin = 50;
    const rightMargin = 545;
    const rightColX = 350;

    // Logo integration
    try {
        const logoPath = path.join(__dirname, "../../../assests/olaCars02.jpeg");
        doc.image(logoPath, 50, 45, { height: 40 });
    } catch (err) {
        console.error("Failed to load logo image in PDF generation:", err);
    }

    const voucherTitle = `${voucher.type || "JOURNAL"} VOUCHER`;
    doc.fontSize(18)
       .fillColor(primaryColor)
       .text(voucherTitle, rightColX - 50, 58, { align: "right", width: 245 });

    doc.moveTo(leftMargin, 95)
       .lineTo(rightMargin, 95)
       .strokeColor(borderMain)
       .stroke();

    // Metadata details
    const metaY = 115;

    // Left Column (Voucher details)
    doc.fontSize(9).fillColor(secondaryColor);
    doc.text("VOUCHER DETAILS:", leftMargin, metaY);

    doc.fontSize(10).fillColor(primaryColor)
       .text(`Voucher Number: ${voucher.voucherNumber || "N/A"}`, leftMargin, metaY + 16, { bold: true })
       .fontSize(9).fillColor(secondaryColor)
       .text(`Date Posted: ${formatDate(voucher.date)}`, leftMargin, metaY + 32)
       .text(`Node Branch: ${voucher.branch?.name || "N/A"} (${voucher.branch?.code || "N/A"})`, leftMargin, metaY + 46);

    // Right Column (Reference details)
    doc.fontSize(9).fillColor(secondaryColor);
    doc.text("REFERENCE & STATUS:", rightColX, metaY);

    doc.fontSize(10).fillColor(primaryColor)
       .text(`Ref Number: ${voucher.referenceInfo?.referenceNumber || "N/A"}`, rightColX, metaY + 16)
       .fontSize(9).fillColor(secondaryColor)
       .text(`Party: ${voucher.referenceInfo?.partyName || "N/A"} (${voucher.referenceInfo?.partyType || "N/A"})`, rightColX, metaY + 32)
       .text(`Status: ${voucher.status || "POSTED"}`, rightColX, metaY + 46);

    doc.moveTo(leftMargin, 195)
       .lineTo(rightMargin, 195)
       .strokeColor(borderMain)
       .stroke();

    // Voucher Lines breakdown
    let contentY = 215;
    doc.fontSize(10).fillColor(primaryColor).text("Journal Ledger Line Entries", leftMargin, contentY, { bold: true });

    // Table Header
    contentY += 20;
    doc.fontSize(8).fillColor(secondaryColor);
    doc.text("ACCOUNT DEBIT/CREDIT", leftMargin, contentY)
       .text("DESCRIPTION / LINE MEMO", leftMargin + 190, contentY)
       .text("DEBIT", rightColX + 50, contentY, { align: "right", width: 70 })
       .text("CREDIT", rightColX + 125, contentY, { align: "right", width: 70 });

    doc.moveTo(leftMargin, contentY + 12)
       .lineTo(rightMargin, contentY + 12)
       .strokeColor(primaryColor)
       .stroke();

    contentY += 20;

    // Row details
    let totalDebit = 0;
    let totalCredit = 0;

    (voucher.lines || []).forEach((line) => {
        const accName = line.accountingCode?.name || "Suspense Account";
        const accCode = line.accountingCode?.code || "N/A";
        const desc = line.description || "N/A";
        const amt = line.amount || 0;

        let debStr = "";
        let credStr = "";

        if (line.type === "DEBIT") {
            debStr = `$${formatCurrency(amt)}`;
            totalDebit += amt;
            doc.fontSize(8.5).fillColor(primaryColor);
        } else {
            credStr = `$${formatCurrency(amt)}`;
            totalCredit += amt;
            // Indent Credit accounts slightly
            doc.fontSize(8.5).fillColor(secondaryColor);
        }

        // Draw Account info
        doc.text(`${line.type === "CREDIT" ? "   To " : ""}${accName} (${accCode})`, leftMargin, contentY, { width: 180 });
        
        // Draw Description
        doc.fillColor(secondaryColor).text(desc, leftMargin + 190, contentY, { width: 145 });

        // Draw Debit / Credit Amounts
        doc.fillColor(primaryColor);
        if (debStr) {
            doc.text(debStr, rightColX + 50, contentY, { align: "right", width: 70 });
        }
        if (credStr) {
            doc.text(credStr, rightColX + 125, contentY, { align: "right", width: 70 });
        }

        contentY += 25;

        // Page break fallback if content flows too low
        if (contentY > 580) {
            doc.addPage();
            contentY = 50;
        }
    });

    // Draw Totals row
    contentY += 5;
    doc.moveTo(leftMargin, contentY)
       .lineTo(rightMargin, contentY)
       .strokeColor(borderMain)
       .stroke();

    contentY += 8;
    doc.fontSize(9).fillColor(primaryColor).text("Total", leftMargin, contentY, { bold: true });
    doc.text(`$${formatCurrency(totalDebit)}`, rightColX + 50, contentY, { align: "right", width: 70, bold: true });
    doc.text(`$${formatCurrency(totalCredit)}`, rightColX + 125, contentY, { align: "right", width: 70, bold: true });

    contentY += 30;

    // Narration / Memo
    if (voucher.narration) {
        doc.fontSize(9).fillColor(secondaryColor).text("Voucher Narration Memo:", leftMargin, contentY);
        doc.fontSize(8.5).fillColor(primaryColor).text(voucher.narration, leftMargin, contentY + 14, { width: 495 });
    }

    // Signatures / Footers
    doc.fontSize(8).fillColor(secondaryColor)
       .text(`Created By: ${voucher.creatorRole || "STAFF"}`, leftMargin, 640)
       .text("This document is generated by Ola Cars system and serves as an official accounting transaction record.", leftMargin, 654);

    doc.moveTo(rightColX + 40, 680)
       .lineTo(rightMargin, 680)
       .strokeColor(primaryColor)
       .stroke();
    doc.fontSize(8.5).fillColor(primaryColor).text("Authorized Signature & Stamp", rightColX + 40, 688, { align: "center", width: 155 });

    doc.end();
};
