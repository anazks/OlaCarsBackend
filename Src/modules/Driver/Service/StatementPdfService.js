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

exports.generateStatementPdf = (driver, invoices, payments, creditNotes, res) => {
    if (!driver) {
        throw new Error("No driver data provided");
    }

    // A4 Landscape: 842 x 595
    const doc = new PDFDocument({ 
        size: "A4", 
        layout: "landscape",
        margin: 40,
        info: {
            Title: `Statement of Account - ${driver.personalInfo?.fullName || "Driver"}`,
            Author: "Ola Cars Logistics"
        }
    });

    // Pipe the PDF to the response
    doc.pipe(res);

    // Color Palette
    const primaryColor = "#111827"; // Dark slate
    const secondaryColor = "#4B5563"; // Dim grey
    const borderMain = "#E5E7EB"; // Separator lines
    const stripeBg = "#F9FAFB"; // Zebra stripe background
    const accentColor = "#4F46E5"; // Indigo accent

    const leftMargin = 40;
    const rightMargin = 802;
    const printableWidth = rightMargin - leftMargin;

    // Helper to draw Header & Metadata on the first page
    const drawHeader = () => {
        // Logo and Title
        doc.fillColor(primaryColor)
           .fontSize(18)
           .font("Helvetica-Bold")
           .text("OLA CARS LOGISTICS", leftMargin, 40)
           .fontSize(8.5)
           .fillColor(secondaryColor)
           .font("Helvetica")
           .text("Finance & Accounts Department", leftMargin, 60);

        doc.fontSize(14)
           .fillColor(primaryColor)
           .font("Helvetica-Bold")
           .text("STATEMENT OF ACCOUNT", 500, 40, { align: "right", width: 302 });

        doc.moveTo(leftMargin, 75)
           .lineTo(rightMargin, 75)
           .strokeColor(borderMain)
           .stroke();

        // Customer & Summary Information Grid
        let metaY = 90;
        doc.fontSize(8.5).fillColor(secondaryColor).font("Helvetica-Bold").text("CUSTOMER DETAILS:", leftMargin, metaY);
        doc.text("STATEMENT SUMMARY:", 450, metaY);

        metaY += 12;
        doc.fontSize(9).fillColor(primaryColor).font("Helvetica");
        doc.text(`Name: ${driver.personalInfo?.fullName || "N/A"}`, leftMargin, metaY)
           .text(`Driver ID: ${driver.driverId || "N/A"}`, leftMargin, metaY + 13)
           .text(`Email: ${driver.personalInfo?.email || "N/A"}`, leftMargin, metaY + 26)
           .text(`Phone: ${driver.personalInfo?.phone || "N/A"}`, leftMargin, metaY + 39);

        // Compute Financial Totals
        const totalPaymentsReceived = payments.reduce((sum, p) => p.status === 'VOID' ? sum : sum + (p.amountReceived || 0), 0);
        const totalApplied = payments.reduce((sum, p) => {
            if (p.status === 'VOID') return sum;
            const applied = p.invoices?.reduce((invSum, inv) => invSum + (inv.amountApplied || 0), 0) || 0;
            return sum + applied;
        }, 0);
        const prepaymentBalance = Math.max(0, totalPaymentsReceived - totalApplied);
        const outstandingBalance = invoices.reduce((sum, inv) => sum + (inv.balance || 0), 0);

        doc.text(`Statement Date: ${formatDate(new Date())}`, 450, metaY)
           .text(`Account Status: ${driver.status || "N/A"}`, 450, metaY + 13)
           .text(`Outstanding Balance: $${formatCurrency(outstandingBalance)}`, 450, metaY + 26, { bold: true })
           .text(`Prepayment Credit: $${formatCurrency(prepaymentBalance)}`, 450, metaY + 39);

        let finalY = metaY + 55;
        doc.moveTo(leftMargin, finalY)
           .lineTo(rightMargin, finalY)
           .strokeColor(borderMain)
           .stroke();

        return finalY + 15;
    };

    // Helper to draw Table Headers (With 10pt safety gaps between columns)
    const drawTableHeaders = (y) => {
        doc.fillColor(primaryColor)
           .fontSize(8.5)
           .font("Helvetica-Bold");

        doc.text("Date", 40, y, { width: 55 })
           .text("Type", 105, y, { width: 65 })
           .text("Ref Number", 180, y, { width: 75 })
           .text("Details / Description", 265, y, { width: 230 })
           .text("Debit ($)", 505, y, { width: 60, align: "right" })
           .text("Credit ($)", 575, y, { width: 60, align: "right" })
           .text("Balance ($)", 645, y, { width: 60, align: "right" })
           .text("Status", 715, y, { width: 87, align: "center" });

        doc.moveTo(leftMargin, y + 15)
           .lineTo(rightMargin, y + 15)
           .strokeColor(primaryColor)
           .lineWidth(1)
           .stroke();

        return y + 20;
    };

    // Consolidate all transactions: Invoices, Payments, Credit Notes
    const txList = [];

    // Add Invoices
    invoices.forEach(inv => {
        txList.push({
            date: new Date(inv.dueDate || inv.generatedAt || new Date()),
            type: 'Invoice',
            refNumber: inv.invoiceNumber || '—',
            description: inv.weekLabel ? `Rental Charge: ${inv.weekLabel}` : 'Rental Charge',
            debit: inv.totalAmountDue || 0,
            credit: 0,
            status: inv.status || '—'
        });
    });

    // Add Payments
    payments.forEach(pmt => {
        if (pmt.status === 'VOID') return; // Ignore voided payments
        txList.push({
            date: new Date(pmt.paymentDate || new Date()),
            type: 'Payment',
            refNumber: pmt.paymentNumber || '—',
            description: `Payment via ${pmt.paymentMethod || 'Other'}`,
            debit: 0,
            credit: pmt.amountReceived || 0,
            status: pmt.status || '—'
        });
    });

    // Add Credit Notes
    creditNotes.forEach(cn => {
        txList.push({
            date: new Date(cn.creditNoteDate || new Date()),
            type: 'Credit Note',
            refNumber: cn.creditNoteNumber || '—',
            description: cn.reason ? `Credit Note: ${cn.reason}` : 'Credit Note Issued',
            debit: 0,
            credit: cn.amount || 0,
            status: cn.status || '—'
        });
    });

    // Sort transactions chronologically
    txList.sort((a, b) => a.date.getTime() - b.date.getTime());

    // Draw First Page Header and Table Headers
    let currentY = drawHeader();
    currentY = drawTableHeaders(currentY);

    let runningBalance = 0;
    let isStripe = false;

    // Draw Rows
    txList.forEach((tx) => {
        runningBalance += tx.debit - tx.credit;

        // Page break check (A4 Landscape is 595pt high, we break at 515pt)
        if (currentY > 515) {
            doc.addPage();
            currentY = drawTableHeaders(50);
        }

        // Zebra striping background
        if (isStripe) {
            doc.fillColor(stripeBg)
               .rect(leftMargin, currentY - 2, printableWidth, 16)
               .fill();
        }

        doc.fillColor(primaryColor)
           .fontSize(8)
           .font("Helvetica");

        // Format dates, details and amounts safely
        const dateStr = formatDate(tx.date);
        const debitStr = tx.debit > 0 ? formatCurrency(tx.debit) : "—";
        const creditStr = tx.credit > 0 ? formatCurrency(tx.credit) : "—";
        const balanceStr = formatCurrency(runningBalance);

        doc.text(dateStr, 40, currentY, { width: 55, ellipsis: true })
           .text(tx.type, 105, currentY, { width: 65, ellipsis: true })
           .text(tx.refNumber, 180, currentY, { width: 75, ellipsis: true })
           .text(tx.description, 265, currentY, { width: 230, ellipsis: true })
           .text(debitStr, 505, currentY, { width: 60, align: "right" })
           .text(creditStr, 575, currentY, { width: 60, align: "right" })
           .text(balanceStr, 645, currentY, { width: 60, align: "right" })
           .fillColor(tx.status === "PAID" || tx.status === "COMPLETED" ? "#10B981" : tx.status === "OVERDUE" ? "#EF4444" : primaryColor)
           .text(tx.status, 715, currentY, { width: 87, align: "center", ellipsis: true });

        // Add subtle bottom border for each row
        doc.moveTo(leftMargin, currentY + 13)
           .lineTo(rightMargin, currentY + 13)
           .strokeColor(borderMain)
           .lineWidth(0.5)
           .stroke();

        currentY += 16;
        isStripe = !isStripe;
    });

    // End of Document footer (break if height is tight)
    if (currentY > 490) {
        doc.addPage();
        currentY = 50;
    }

    doc.moveTo(leftMargin, currentY + 10)
       .lineTo(rightMargin, currentY + 10)
       .strokeColor(primaryColor)
       .lineWidth(1.5)
       .stroke();

    doc.fontSize(8.5)
       .fillColor(secondaryColor)
       .font("Helvetica-Bold")
       .text("STATEMENT SUMMARY LEDGER FOOTER", leftMargin, currentY + 20)
       .font("Helvetica")
       .fontSize(8)
       .text("This statement reflects the financial balance registry of invoices, payments, and credits recorded as of today. If you have any inquiries regarding unpaid lease balances, please contact the finance office.", leftMargin, currentY + 32, { width: printableWidth });

    doc.end();
};
