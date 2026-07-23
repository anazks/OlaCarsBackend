const PDFDocument = require("pdfkit");
const path = require("path");

// Safe currency formatter
const formatCurrency = (val) => {
    const num = typeof val === "number" ? val : parseFloat(val);
    return isNaN(num) ? "0.00" : num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// Safe date formatter DD/MM/YYYY
const formatDateOnly = (val) => {
    if (!val) return "N/A";
    const d = new Date(val);
    if (isNaN(d.getTime())) return "N/A";
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
};

/**
 * Generate an Invoice Registry Statement PDF.
 * Layout: A4 Landscape
 */
exports.generateInvoiceRegistryPdf = (invoices = [], metrics = {}, periodParams = {}, res) => {
    const { startDate, endDate, status, search } = periodParams;
    let periodLabel = "";
    if (startDate || endDate) {
        const fromStr = startDate ? formatDateOnly(startDate) : "Beginning";
        const toStr = endDate ? formatDateOnly(endDate) : "Present";
        periodLabel = `${fromStr} - ${toStr}`;
    } else {
        periodLabel = "Full Registry History";
    }

    const doc = new PDFDocument({
        size: "A4",
        layout: "landscape",
        margin: 40,
        info: {
            Title: `Invoice Registry Report - ${periodLabel}`,
            Author: "Ola Cars Logistics"
        }
    });

    doc.pipe(res);

    // Color Palette
    const primaryColor = "#111827";   // Dark slate
    const secondaryColor = "#4B5563"; // Dim grey
    const borderMain = "#D1D5DB";     // Separator lines
    const headerBg = "#F3F4F6";       // Table header background
    const stripeBg = "#F9FAFB";       // Zebra stripe background

    const leftMargin = 40;
    const rightMargin = 801.89 - 40;  // 761.89
    const printableWidth = rightMargin - leftMargin; // ~721.89

    // Columns config (Landscape)
    const colDate = 40;
    const colInv = 120;
    const colCustomer = 220;
    const colVehicle = 380;
    const colStatus = 490;
    const colBilled = 560;
    const colPaid = 640;
    const colBal = 720;

    const colDateW = 75;
    const colInvW = 95;
    const colCustomerW = 155;
    const colVehicleW = 105;
    const colStatusW = 65;
    const colBilledW = 75;
    const colPaidW = 75;
    const colBalW = 80;

    // Header Drawing
    const drawHeader = () => {
        try {
            const logoPath = path.join(__dirname, "../../../assests/olaCars02.jpeg");
            doc.image(logoPath, leftMargin, 25, { height: 35 });
        } catch (err) {
            console.error("Failed to load logo image in PDF generation:", err);
            doc.fillColor(primaryColor)
               .font("Helvetica-Bold")
               .fontSize(18)
               .text("OLA CARS", leftMargin, 30);
        }

        // Statement Title Header
        doc.fillColor(primaryColor)
           .font("Helvetica-Bold")
           .fontSize(14)
           .text("INVOICE REGISTRY REPORT", 480, 25, { align: "right" });

        doc.fillColor(secondaryColor)
           .font("Helvetica")
           .fontSize(8)
           .text(`Period: ${periodLabel}`, 480, 43, { align: "right" })
           .text(`Generated: ${formatDateOnly(new Date())}`, 480, 53, { align: "right" });

        if (status && status !== 'ALL') {
            doc.text(`Status Filter: ${status}`, 480, 63, { align: "right" });
        }

        doc.moveTo(leftMargin, 75)
           .lineTo(rightMargin, 75)
           .strokeColor(borderMain)
           .lineWidth(1)
           .stroke();
    };

    // Financial Metrics Summary Panel
    const drawSummaryPanel = () => {
        const boxY = 82;
        const boxH = 45;
        const cardW = 230;

        // Card 1: Total Gross Billed
        doc.fillColor("#F9FAFB").rect(leftMargin, boxY, cardW, boxH).fill();
        doc.rect(leftMargin, boxY, cardW, boxH).strokeColor(borderMain).stroke();
        doc.fillColor(secondaryColor).font("Helvetica-Bold").fontSize(7).text("TOTAL GROSS BILLED", leftMargin + 10, boxY + 8);
        doc.fillColor("#059669").font("Helvetica-Bold").fontSize(12).text(`$ ${formatCurrency(metrics.totalGrossBilled || 0)}`, leftMargin + 10, boxY + 22);

        // Card 2: Total Net Settled
        doc.fillColor("#F9FAFB").rect(leftMargin + cardW + 15, boxY, cardW, boxH).fill();
        doc.rect(leftMargin + cardW + 15, boxY, cardW, boxH).strokeColor(borderMain).stroke();
        doc.fillColor(secondaryColor).font("Helvetica-Bold").fontSize(7).text("TOTAL NET SETTLED", leftMargin + cardW + 25, boxY + 8);
        doc.fillColor("#2563EB").font("Helvetica-Bold").fontSize(12).text(`$ ${formatCurrency(metrics.totalNetSettled || 0)}`, leftMargin + cardW + 25, boxY + 22);

        // Card 3: Total Current Balance
        doc.fillColor("#F9FAFB").rect(leftMargin + (cardW + 15) * 2, boxY, cardW, boxH).fill();
        doc.rect(leftMargin + (cardW + 15) * 2, boxY, cardW, boxH).strokeColor(borderMain).stroke();
        doc.fillColor(secondaryColor).font("Helvetica-Bold").fontSize(7).text("TOTAL CURRENT BALANCE", leftMargin + (cardW + 15) * 2 + 10, boxY + 8);
        doc.fillColor("#DC2626").font("Helvetica-Bold").fontSize(12).text(`$ ${formatCurrency(metrics.totalCurrentBalance || 0)}`, leftMargin + (cardW + 15) * 2 + 10, boxY + 22);
    };

    // Table Header Drawing
    const drawTableHeader = (y) => {
        doc.fillColor(headerBg)
           .rect(leftMargin, y, printableWidth, 18)
           .fill();

        doc.fillColor(primaryColor)
           .font("Helvetica-Bold")
           .fontSize(8);

        doc.text("Date", colDate + 4, y + 5, { width: colDateW });
        doc.text("Invoice #", colInv, y + 5, { width: colInvW });
        doc.text("Customer", colCustomer, y + 5, { width: colCustomerW });
        doc.text("Vehicle / Notes", colVehicle, y + 5, { width: colVehicleW });
        doc.text("Status", colStatus, y + 5, { width: colStatusW });
        doc.text("Billed ($)", colBilled, y + 5, { width: colBilledW, align: "right" });
        doc.text("Paid ($)", colPaid, y + 5, { width: colPaidW, align: "right" });
        doc.text("Balance ($)", colBal, y + 5, { width: colBalW, align: "right" });

        doc.moveTo(leftMargin, y + 18)
           .lineTo(rightMargin, y + 18)
           .strokeColor(borderMain)
           .lineWidth(1)
           .stroke();
    };

    drawHeader();
    drawSummaryPanel();

    let currentY = 140;
    drawTableHeader(currentY);
    currentY += 22;

    const pageHeight = doc.page.height;
    const marginBottom = 40;

    invoices.forEach((inv, index) => {
        if (currentY + 20 > pageHeight - marginBottom) {
            doc.addPage();
            drawHeader();
            currentY = 85;
            drawTableHeader(currentY);
            currentY += 22;
        }

        // Alternating row background
        if (index % 2 === 1) {
            doc.fillColor(stripeBg)
               .rect(leftMargin, currentY - 2, printableWidth, 18)
               .fill();
        }

        const dateStr = formatDateOnly(inv.generatedAt || inv.entryDate || inv.date);
        const invNum = inv.invoiceNumber || inv.invoice || "N/A";
        
        let customerName = "N/A";
        if (inv.customer) {
            customerName = typeof inv.customer === "object" ? (inv.customer.name || inv.customer.customerId) : inv.customer;
        } else if (inv.customerName) {
            customerName = inv.customerName;
        }

        let vehicleStr = "-";
        if (inv.vehicle) {
            vehicleStr = typeof inv.vehicle === "object" ? (inv.vehicle.plateNumber || inv.vehicle.make || "Vehicle") : inv.vehicle;
        } else if (inv.notes) {
            vehicleStr = inv.notes.substring(0, 18);
        }

        const statusText = (inv.status || "PENDING").toUpperCase();
        const billedVal = Number(inv.totalAmountDue || inv.totalAmount || inv.amount || 0);
        const paidVal = Number(inv.amountPaid || 0);
        const balanceVal = inv.balance !== undefined ? Number(inv.balance) : (billedVal - paidVal);

        doc.fillColor(primaryColor).font("Helvetica").fontSize(7.5);

        doc.text(dateStr, colDate + 4, currentY, { width: colDateW });
        doc.font("Helvetica-Bold").text(invNum, colInv, currentY, { width: colInvW, lineBreak: false });
        doc.font("Helvetica").text(customerName.substring(0, 26), colCustomer, currentY, { width: colCustomerW, lineBreak: false });
        doc.text(vehicleStr.substring(0, 18), colVehicle, currentY, { width: colVehicleW, lineBreak: false });

        // Status badge styling
        let statusColor = "#374151";
        if (statusText === 'PAID') statusColor = "#059669";
        else if (statusText === 'PARTIAL') statusColor = "#D97706";
        else if (statusText === 'OVERDUE') statusColor = "#DC2626";
        else if (statusText === 'PENDING') statusColor = "#2563EB";

        doc.fillColor(statusColor).font("Helvetica-Bold").text(statusText, colStatus, currentY, { width: colStatusW });

        // Financial Amounts
        doc.fillColor(primaryColor).font("Helvetica");
        doc.text(formatCurrency(billedVal), colBilled, currentY, { width: colBilledW, align: "right" });
        doc.text(formatCurrency(paidVal), colPaid, currentY, { width: colPaidW, align: "right" });

        const balColor = balanceVal > 0 ? "#DC2626" : "#059669";
        doc.fillColor(balColor).font("Helvetica-Bold");
        doc.text(formatCurrency(balanceVal), colBal, currentY, { width: colBalW, align: "right" });

        currentY += 16;
    });

    // Footer on all pages
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        doc.moveTo(leftMargin, pageHeight - 30)
           .lineTo(rightMargin, pageHeight - 30)
           .strokeColor(borderMain)
           .lineWidth(0.5)
           .stroke();

        doc.fillColor(secondaryColor)
           .font("Helvetica")
           .fontSize(7)
           .text("Ola Cars Logistics Management System - Confidential Report", leftMargin, pageHeight - 22)
           .text(`Page ${i + 1} of ${range.count}`, leftMargin, pageHeight - 22, { align: "right" });
    }

    doc.end();
};
