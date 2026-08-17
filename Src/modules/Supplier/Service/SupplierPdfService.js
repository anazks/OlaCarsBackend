const PDFDocument = require("pdfkit");
const path = require("path");

// Safe date formatter
const formatDate = (val) => {
    if (!val) return "N/A";
    const d = new Date(val);
    if (isNaN(d.getTime())) return "N/A";
    return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "2-digit" });
};

const formatCurrency = (val) => {
    const num = Number(val) || 0;
    return `$${num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

exports.generateSupplierPdf = (supplier, entries = [], res) => {
    if (!supplier) {
        throw new Error("No supplier data provided");
    }

    const doc = new PDFDocument({ 
        size: "A4", 
        margin: 40,
        info: {
            Title: `General Ledger Statement - ${supplier.name || "Supplier"}`,
            Author: "Ola Cars Logistics"
        }
    });

    doc.pipe(res);

    const primaryColor = "#111827"; 
    const secondaryColor = "#4B5563"; 
    const borderMain = "#E5E7EB"; 

    const leftMargin = 40;
    const rightMargin = 555;
    const contentWidth = rightMargin - leftMargin;

    try {
        const logoPath = path.join(__dirname, "../../../assests/olaCars02.jpeg");
        doc.image(logoPath, leftMargin, 35, { height: 35 });
    } catch (err) {
        console.error("Failed to load logo image in PDF generation:", err);
    }

    doc.fontSize(15)
       .fillColor(primaryColor)
       .text("VENDOR GENERAL LEDGER STATEMENT", leftMargin + 150, 42, { align: "right", width: contentWidth - 150, bold: true });

    doc.moveTo(leftMargin, 80)
       .lineTo(rightMargin, 80)
       .strokeColor(borderMain)
       .stroke();

    let y = 92;

    doc.fontSize(9).fillColor(secondaryColor).text("SUPPLIER NAME:", leftMargin, y);
    doc.fontSize(11).fillColor(primaryColor).text(supplier.name || "N/A", leftMargin + 95, y - 1, { bold: true });

    doc.fontSize(9).fillColor(secondaryColor).text("CATEGORY:", leftMargin + 330, y);
    doc.fontSize(10).fillColor(primaryColor).text(supplier.category || "General", leftMargin + 390, y - 1);

    y += 18;
    doc.fontSize(9).fillColor(secondaryColor).text("VENDOR NO / ID:", leftMargin, y);
    doc.fontSize(10).fillColor(primaryColor).text(supplier.vendorNumber || String(supplier._id || "N/A"), leftMargin + 95, y - 1);

    doc.fontSize(9).fillColor(secondaryColor).text("STATEMENT DATE:", leftMargin + 330, y);
    doc.fontSize(10).fillColor(primaryColor).text(formatDate(new Date()), leftMargin + 420, y - 1);

    y += 25;
    doc.moveTo(leftMargin, y)
       .lineTo(rightMargin, y)
       .strokeColor(borderMain)
       .stroke();

    y += 15;

    doc.fontSize(11).fillColor(primaryColor).text("Vendor General Ledger Statement (Latest at Top)", leftMargin, y, { bold: true });
    doc.fontSize(8).fillColor(secondaryColor).text("Chronological History of Bills & Vendor Payments", leftMargin + 240, y + 2, { align: "right", width: 275 });

    y += 20;

    const drawTableHeader = (currentY) => {
        doc.rect(leftMargin, currentY, contentWidth, 20).fill("#F3F4F6");
        doc.fontSize(8.5).fillColor("#374151");
        doc.text("Date", leftMargin + 5, currentY + 5, { width: 65, bold: true });
        doc.text("Transaction", leftMargin + 75, currentY + 5, { width: 85, bold: true });
        doc.text("Ref / Details", leftMargin + 165, currentY + 5, { width: 165, bold: true });
        doc.text("Billed ($)", leftMargin + 335, currentY + 5, { width: 55, align: "right", bold: true });
        doc.text("Paid ($)", leftMargin + 395, currentY + 5, { width: 55, align: "right", bold: true });
        doc.text("Balance ($)", leftMargin + 455, currentY + 5, { width: 55, align: "right", bold: true });

        return currentY + 22;
    };

    y = drawTableHeader(y);

    if (!entries || entries.length === 0) {
        doc.fontSize(9).fillColor(secondaryColor).text("No ledger transactions recorded for this vendor.", leftMargin + 10, y + 10);
    } else {
        entries.forEach((ent, idx) => {
            if (y > 740) {
                doc.addPage();
                y = 40;
                y = drawTableHeader(y);
            }

            const isAlt = idx % 2 === 1;
            if (isAlt) {
                doc.rect(leftMargin, y, contentWidth, 18).fill("#F9FAFB");
            }

            doc.fontSize(8).fillColor(primaryColor);
            doc.text(formatDate(ent.date), leftMargin + 5, y + 4, { width: 65, lineBreak: false });
            doc.text(ent.transactionLabel || ent.type || "N/A", leftMargin + 75, y + 4, { width: 85, lineBreak: false });
            
            const detailStr = `${ent.ref || ''} ${ent.details ? `- ${ent.details}` : ''}`.trim();
            doc.text(detailStr || "N/A", leftMargin + 165, y + 4, { width: 165, lineBreak: false });
            
            doc.fillColor("#4F46E5").text(ent.billed > 0 ? formatCurrency(ent.billed) : "—", leftMargin + 335, y + 4, { width: 55, align: "right", lineBreak: false });
            doc.fillColor("#059669").text(ent.paid > 0 ? formatCurrency(ent.paid) : "—", leftMargin + 395, y + 4, { width: 55, align: "right", lineBreak: false });
            doc.fillColor("#D97706").text(formatCurrency(ent.balance || 0), leftMargin + 455, y + 4, { width: 55, align: "right", lineBreak: false });

            y += 20;

            doc.moveTo(leftMargin, y - 2)
               .lineTo(rightMargin, y - 2)
               .strokeColor("#F3F4F6")
               .stroke();
        });
    }

    const finalFooterY = doc.y > 700 ? 730 : Math.max(doc.y + 25, 740);

    doc.fontSize(8).fillColor(secondaryColor)
       .text("Ola Cars Logistics - Vendor General Ledger Statement.", leftMargin, finalFooterY)
       .text("Generated automatically from posted bills, payments, and ledger entries.", leftMargin, finalFooterY + 12);

    doc.end();
};
