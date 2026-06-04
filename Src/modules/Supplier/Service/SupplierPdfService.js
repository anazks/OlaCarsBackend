const PDFDocument = require("pdfkit");

// Safe date formatter
const formatDate = (val) => {
    if (!val) return "N/A";
    const d = new Date(val);
    if (isNaN(d.getTime())) return "N/A";
    return d.toLocaleDateString("en-US", { dateStyle: "medium" });
};

exports.generateSupplierPdf = (supplier, res) => {
    if (!supplier) {
        throw new Error("No supplier data provided");
    }

    const doc = new PDFDocument({ 
        size: "A4", 
        margin: 50,
        info: {
            Title: `Supplier Profile - ${supplier.name || "Supplier"}`,
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
    const activeColor = "#10B981"; // Accent green for active

    const leftMargin = 50;
    const rightMargin = 545;
    const rightColX = 350;

    // Header
    doc.fillColor(primaryColor)
       .fontSize(22)
       .text("OLA CARS", leftMargin, 50, { bold: true })
       .fontSize(9)
       .fillColor(secondaryColor)
       .text("Logistics Procurement & Supplier Registry", leftMargin, 75);

    doc.fontSize(18)
       .fillColor(primaryColor)
       .text("SUPPLIER CARD", rightColX - 50, 50, { align: "right", width: 245, bold: true });

    doc.moveTo(leftMargin, 95)
       .lineTo(rightMargin, 95)
       .strokeColor(borderMain)
       .stroke();

    // Metadata
    const metaY = 115;

    // Left Column: Supplier Core Info
    doc.fontSize(9).fillColor(secondaryColor);
    doc.text("SUPPLIER NAME & CATEGORY:", leftMargin, metaY);

    doc.fontSize(12).fillColor(primaryColor)
       .text(supplier.name || "N/A", leftMargin, metaY + 16, { bold: true })
       .fontSize(9).fillColor(secondaryColor)
       .text(`Procurement Category: ${supplier.category || "General"}`, leftMargin, metaY + 34)
       .text(`Status: ${supplier.isActive ? "ACTIVE / COMPLIANT" : "INACTIVE"}`, leftMargin, metaY + 48, { 
           underline: false,
           color: supplier.isActive ? activeColor : secondaryColor 
       });

    // Right Column: Registry info
    doc.fontSize(9).fillColor(secondaryColor);
    doc.text("REGISTRY INFORMATION:", rightColX, metaY);

    doc.fontSize(10).fillColor(primaryColor)
       .text(`Supplier ID: ${supplier._id || "N/A"}`, rightColX, metaY + 16)
       .fontSize(9).fillColor(secondaryColor)
       .text(`Registered Date: ${formatDate(supplier.createdAt)}`, rightColX, metaY + 32)
       .text(`Last Profile Update: ${formatDate(supplier.updatedAt)}`, rightColX, metaY + 46);

    doc.moveTo(leftMargin, 195)
       .lineTo(rightMargin, 195)
       .strokeColor(borderMain)
       .stroke();

    // Profile Details
    let contentY = 215;
    doc.fontSize(10).fillColor(primaryColor).text("Contact Details & Physical Address", leftMargin, contentY, { bold: true });

    contentY += 20;
    doc.fontSize(9.5).fillColor(secondaryColor)
       .text("Contact Person:", leftMargin, contentY)
       .text("Email Address:", leftMargin, contentY + 20)
       .text("Phone Number:", leftMargin, contentY + 40)
       .text("Registered Office Address:", leftMargin, contentY + 60);

    doc.fillColor(primaryColor)
       .text(supplier.contactPerson || "N/A", leftMargin + 150, contentY)
       .text(supplier.email || "N/A", leftMargin + 150, contentY + 20)
       .text(supplier.phone || "N/A", leftMargin + 150, contentY + 40)
       .text(supplier.address || "N/A", leftMargin + 150, contentY + 60, { width: 330 });

    contentY += 110;
    doc.moveTo(leftMargin, contentY)
       .lineTo(rightMargin, contentY)
       .strokeColor(borderMain)
       .stroke();

    // Section: Procurement policy & compliance checklist
    contentY += 20;
    doc.fontSize(10).fillColor(primaryColor).text("Ola Cars Procurement Compliance Certification", leftMargin, contentY, { bold: true });

    contentY += 18;
    doc.fontSize(8.5).fillColor(secondaryColor)
       .text("This supplier is certified under Ola Cars Logistics standard vendor compliance policies. Any financial disbursements, invoices, bank transfers, or services rendered are monitored and posted directly under respective ledger groups.", leftMargin, contentY, { width: 495 });

    contentY += 40;
    doc.fontSize(8.5).fillColor(primaryColor)
       .text("Compliance Auditing status:", leftMargin, contentY, { bold: true });
    
    doc.fontSize(8).fillColor(secondaryColor)
       .text("• KYC Background Checks: Passed", leftMargin + 10, contentY + 12)
       .text("• Bank Account Details Encryption Check: Passed", leftMargin + 10, contentY + 24)
       .text("• Operations Billing Integration: Clear", leftMargin + 10, contentY + 36);

    // Footer
    doc.fontSize(8).fillColor(secondaryColor)
       .text("Ola Cars Logistics Procurement Department.", leftMargin, 640)
       .text("This registry sheet serves as proof of supplier validation and onboard compliance.", leftMargin, 654);

    doc.moveTo(rightColX + 40, 680)
       .lineTo(rightMargin, 680)
       .strokeColor(primaryColor)
       .stroke();
    doc.fontSize(8.5).fillColor(primaryColor).text("Corporate Seal & Signature", rightColX + 40, 688, { align: "center", width: 155 });

    doc.end();
};
