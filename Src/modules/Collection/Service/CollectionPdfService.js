const PDFDocument = require("pdfkit");

// Safe currency formatter
const formatCurrency = (val) => {
    const num = typeof val === "number" ? val : parseFloat(val);
    return isNaN(num) ? "0.00" : num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// Safe date formatter
const formatDate = (val) => {
    if (!val) return "N/A";
    const d = new Date(val);
    if (isNaN(d.getTime())) return "N/A";
    return d.toLocaleDateString("en-US", { dateStyle: "medium" });
};

exports.generateLedgerPdf = (listType, items, meta, res) => {
    let reportTitle = "COLLECTIONS INVOICES LEDGER";
    if (listType === "OVERDUE") {
        reportTitle = "OVERDUE PAYMENTS AGING REPORT";
    } else if (listType === "UPCOMING") {
        reportTitle = "UPCOMING PAYMENTS FORECAST REPORT";
    }

    // A4 landscape dimensions: 842 x 595
    const doc = new PDFDocument({
        size: "A4",
        layout: "landscape",
        margin: 40,
        info: {
            Title: reportTitle,
            Author: "Ola Cars Logistics"
        }
    });

    // Pipe the PDF to the response stream
    doc.pipe(res);

    // Color Palette
    const primaryColor = "#111827"; // Dark slate
    const secondaryColor = "#4B5563"; // Dim grey
    const borderMain = "#E5E7EB"; // Separator lines
    const accentColor = "#84CC16"; // Brand Lime green
    const stripeBg = "#F9FAFB"; // Zebra stripe background
    const alertRed = "#EF4444";
    const alertYellow = "#F59E0B";
    const alertGreen = "#10B981";

    const leftMargin = 40;
    const rightMargin = 802;
    const printableWidth = rightMargin - leftMargin;

    // Helper to draw the header on a page
    const drawPageHeader = (pageNum) => {
        doc.fillColor(primaryColor)
           .fontSize(18)
           .font("Helvetica-Bold")
           .text("OLA CARS", leftMargin, 30)
           .fontSize(8)
           .fillColor(secondaryColor)
           .font("Helvetica")
           .text("Logistics Finance Division", leftMargin, 50);

        doc.fontSize(12)
           .fillColor(primaryColor)
           .font("Helvetica-Bold")
           .text(reportTitle, 500, 30, { align: "right", width: 302 });

        doc.moveTo(leftMargin, 65)
           .lineTo(rightMargin, 65)
           .strokeColor(borderMain)
           .lineWidth(1)
           .stroke();

        // Print metadata only on first page
        if (pageNum === 1) {
            const metaY = 75;
            doc.fontSize(8).fillColor(secondaryColor).font("Helvetica-Bold").text("REPORT DETAILS:", leftMargin, metaY);
            doc.text("FILTER CRITERIA:", 320, metaY);

            doc.fontSize(8.5).fillColor(primaryColor).font("Helvetica");
            const generatedDateStr = formatDate(new Date());
            doc.text(`Generated Date: ${generatedDateStr}`, leftMargin, metaY + 12)
               .text(`Total Records: ${items.length}`, leftMargin, metaY + 24);

            const branchLabel = meta.branchName || "Consolidated (All Branches)";
            const countryLabel = meta.country || "All Countries";
            const dateRangeStr = (meta.startDate || meta.endDate) 
                ? `${meta.startDate ? formatDate(meta.startDate) : "Beginning"} to ${meta.endDate ? formatDate(meta.endDate) : "Present"}`
                : "All-Time Dataset";

            doc.text(`Region: ${countryLabel} / ${branchLabel}`, 320, metaY + 12)
               .text(`Date Bounds: ${dateRangeStr}`, 320, metaY + 24);

            doc.moveTo(leftMargin, 115)
               .lineTo(rightMargin, 115)
               .strokeColor(borderMain)
               .lineWidth(1)
               .stroke();

            return 125;
        }

        return 75;
    };

    // Helper to draw table headers (Including 10pt gaps between columns)
    const drawTableHeaders = (y) => {
        doc.fillColor(primaryColor)
           .fontSize(8.5)
           .font("Helvetica-Bold");

        doc.text("Sl", 40, y, { width: 20 })
           .text("Invoice No.", 65, y, { width: 70 })
           .text("Driver Details", 145, y, { width: 110 })
           .text("Vehicle / Fleet", 265, y, { width: 80 })
           .text("Node Location", 355, y, { width: 85 })
           .text("Due Date", 450, y, { width: 55 })
           .text("Gross Billed", 515, y, { width: 55, align: "right" })
           .text("Net Paid", 580, y, { width: 55, align: "right" })
           .text("Current Bal", 645, y, { width: 55, align: "right" });

        if (listType === "OVERDUE") {
            doc.text("Aging", 710, y, { width: 92, align: "center" });
        } else {
            doc.text("Status", 710, y, { width: 92, align: "center" });
        }

        doc.moveTo(leftMargin, y + 14)
           .lineTo(rightMargin, y + 14)
           .strokeColor(primaryColor)
           .lineWidth(1)
           .stroke();

        return y + 20;
    };

    let pageNum = 1;
    let currentY = drawPageHeader(pageNum);
    currentY = drawTableHeaders(currentY);

    let isStripe = false;
    let totalGross = 0;
    let totalPaid = 0;
    let totalBalance = 0;

    items.forEach((item, index) => {
        totalGross += item.totalAmountDue || 0;
        totalPaid += item.amountPaid || 0;
        totalBalance += item.balance || 0;

        // Check page boundaries (Landscape height is 595, break at 510 to allow 26pt row height)
        if (currentY > 510) {
            pageNum++;
            doc.addPage();
            currentY = drawPageHeader(pageNum);
            currentY = drawTableHeaders(currentY);
        }

        // Draw Row Zebra Stripe
        if (isStripe) {
            doc.fillColor(stripeBg)
               .rect(leftMargin, currentY, printableWidth, 26)
               .fill();
        }

        doc.fillColor(primaryColor)
           .fontSize(8.5)
           .font("Helvetica");

        const displaySl = (index + 1).toString().padStart(2, "0");
        const displayDueDate = formatDate(item.dueDate);
        const driverIdStr = item.driverId ? item.driverId.toString() : "";
        const displayDriverId = driverIdStr ? `ID: ...${driverIdStr.substring(18)}` : "";
        const displayFleet = item.fleetNumber ? `Fleet #${item.fleetNumber}` : "";

        // Text cells with 10pt gaps to prevent collisions
        doc.text(displaySl, 40, currentY + 9, { width: 20 })
           .text(item.invoiceNumber || "—", 65, currentY + 9, { width: 70, ellipsis: true })
           
           // Driver details column (Spaced on two lines)
           .font("Helvetica-Bold")
           .text(item.driverName || "N/A", 145, currentY + 4, { width: 110, ellipsis: true })
           .font("Helvetica")
           .fontSize(7)
           .fillColor(secondaryColor)
           .text(displayDriverId, 145, currentY + 14, { width: 110 })
           
           // Vehicle/Fleet details (Spaced on two lines)
           .fontSize(8.5)
           .fillColor(primaryColor)
           .font("Helvetica-Bold")
           .text(item.vehicleNumber || "—", 265, currentY + 4, { width: 80, ellipsis: true })
           .font("Helvetica")
           .fontSize(7)
           .fillColor(secondaryColor)
           .text(displayFleet, 265, currentY + 14, { width: 80 })

           // Branch / Location Details (Spaced on two lines)
           .fontSize(8.5)
           .fillColor(primaryColor)
           .font("Helvetica-Bold")
           .text(item.branch || "—", 355, currentY + 4, { width: 85, ellipsis: true })
           .font("Helvetica")
           .fontSize(7)
           .fillColor(secondaryColor)
           .text(item.country ? item.country.toString().toUpperCase() : "", 355, currentY + 14, { width: 85 })

           // Dynamic reset for following columns
           .fontSize(8.5)
           .fillColor(primaryColor)
           .font("Helvetica")
           .text(displayDueDate, 450, currentY + 9, { width: 55 })
           .text(`$${formatCurrency(item.totalAmountDue)}`, 515, currentY + 9, { width: 55, align: "right" })
           .text(`$${formatCurrency(item.amountPaid)}`, 580, currentY + 9, { width: 55, align: "right" })
           .text(`$${formatCurrency(item.balance)}`, 645, currentY + 9, { width: 55, align: "right" });

        // Status or Aging column
        if (listType === "OVERDUE") {
            const daysOverdueStr = `${item.daysOverdue || 0} Days`;
            doc.fillColor(alertRed)
               .font("Helvetica-Bold")
               .text(daysOverdueStr, 710, currentY + 9, { width: 92, align: "center" });
        } else {
            const statusStr = item.status || "—";
            let statusColor = primaryColor;
            if (statusStr === "PAID") statusColor = alertGreen;
            else if (statusStr === "OVERDUE") statusColor = alertRed;
            else if (statusStr === "PARTIAL") statusColor = alertYellow;

            doc.fillColor(statusColor)
               .font("Helvetica-Bold")
               .text(statusStr, 710, currentY + 9, { width: 92, align: "center" });
        }

        // Draw thin border under row
        doc.moveTo(leftMargin, currentY + 26)
           .lineTo(rightMargin, currentY + 26)
           .strokeColor(borderMain)
           .lineWidth(0.5)
           .stroke();

        currentY += 26;
        isStripe = !isStripe;
    });

    // Check spacing for Totals Row
    if (currentY > 520) {
        doc.addPage();
        pageNum++;
        currentY = drawPageHeader(pageNum);
        currentY = drawTableHeaders(currentY);
    }

    // Draw Totals row
    currentY += 5;
    doc.moveTo(leftMargin, currentY)
       .lineTo(rightMargin, currentY)
       .strokeColor(primaryColor)
       .lineWidth(1.5)
       .stroke();
    currentY += 6;

    doc.fillColor(primaryColor)
       .fontSize(8.5)
       .font("Helvetica-Bold")
       .text("Total Aggregated Ledger Balances", leftMargin, currentY)
       .text(`$${formatCurrency(totalGross)}`, 515, currentY, { width: 55, align: "right" })
       .text(`$${formatCurrency(totalPaid)}`, 580, currentY, { width: 55, align: "right" })
       .text(`$${formatCurrency(totalBalance)}`, 645, currentY, { width: 55, align: "right" });

    // Footer lines
    const footerY = 560;
    doc.moveTo(leftMargin, footerY - 5)
       .lineTo(rightMargin, footerY - 5)
       .strokeColor(borderMain)
       .lineWidth(0.5)
       .stroke();

    doc.fontSize(7)
       .fillColor(secondaryColor)
       .font("Helvetica")
       .text(`This report is generated dynamically from the collections accounting database. Page ${pageNum}`, leftMargin, footerY);

    doc.fontSize(7)
       .text("Ola Cars Group Logistics. All rights reserved.", rightMargin - 200, footerY, { width: 200, align: "right" });

    doc.end();
};
