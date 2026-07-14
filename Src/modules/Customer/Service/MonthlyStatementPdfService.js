const PDFDocument = require("pdfkit");
const path = require("path");

// Safe currency formatter
const formatCurrency = (val) => {
    const num = typeof val === "number" ? val : parseFloat(val);
    return isNaN(num) ? "0.00" : num.toFixed(2);
};

// Safe date formatter DD/MM/YYYY
const formatDate = (val) => {
    if (!val) return "N/A";
    const d = new Date(val);
    if (isNaN(d.getTime())) return "N/A";
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
};

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/**
 * Generate a monthly statement PDF matching the account statement format.
 * 
 * Layout: A4 Portrait with columns: Date | Transactions | Details | Amount | Payments | Balance
 * Includes opening balance row and closing balance due footer.
 */
exports.generateMonthlyStatementPdf = (customer, invoices, payments, creditNotesOrRes, resOrOptions, options = {}) => {
    if (!customer) {
        throw new Error("No customer data provided");
    }

    let creditNotes = [];
    let res;
    let opt = {};

    if (creditNotesOrRes && typeof creditNotesOrRes.pipe === 'function') {
        res = creditNotesOrRes;
        opt = resOrOptions || {};
        creditNotes = [];
    } else {
        creditNotes = creditNotesOrRes || [];
        res = resOrOptions;
        opt = options || {};
    }

    let startDate, endDate;
    let periodLabel = "";

    const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

    if (opt.fromDate || opt.toDate) {
        startDate = opt.fromDate ? (() => { const d = new Date(opt.fromDate); d.setHours(0,0,0,0); return d; })() : new Date(0);
        endDate = opt.toDate ? (() => { const d = new Date(opt.toDate); d.setHours(23,59,59,999); return d; })() : new Date(8640000000000000);
        
        const fromStr = opt.fromDate ? formatDate(startDate) : "Beginning";
        const toStr = opt.toDate ? formatDate(endDate) : "Present";
        periodLabel = `${fromStr} - ${toStr}`;
    } else if (opt.month && opt.year) {
        const month = parseInt(opt.month);
        const year = parseInt(opt.year);
        const monthIndex = month - 1;
        startDate = new Date(year, monthIndex, 1);
        endDate = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999);
        periodLabel = `${MONTH_NAMES[monthIndex]} ${year}`;
    } else {
        startDate = new Date(0);
        endDate = new Date(8640000000000000);
        periodLabel = "Full Statement";
    }

    // A4 Portrait: 595 x 842
    const doc = new PDFDocument({
        size: "A4",
        layout: "portrait",
        margin: 40,
        info: {
            Title: `Statement of Account - ${customer.name || "Customer"} - ${periodLabel}`,
            Author: "Ola Cars Logistics"
        }
    });

    doc.pipe(res);

    // Color Palette
    const primaryColor = "#111827";
    const secondaryColor = "#4B5563";
    const borderMain = "#D1D5DB";
    const headerBg = "#F3F4F6";
    const stripeBg = "#F9FAFB";

    const leftMargin = 40;
    const rightMargin = 555;
    const printableWidth = rightMargin - leftMargin;

    // Column positions (6 columns)
    const colDate = 40;
    const colTx = 110;
    const colDetails = 195;
    const colAmount = 340;
    const colPayments = 410;
    const colBalance = 480;

    const colDateW = 65;
    const colTxW = 80;
    const colDetailsW = 140;
    const colAmountW = 65;
    const colPaymentsW = 65;
    const colBalanceW = 75;

    // Filter non-voided payments
    const validPayments = payments.filter(p => p.status !== 'VOID');

    // Calculate opening balance (everything before startDate)
    const hasOpeningBalance = startDate.getTime() > 0;
    const invoicesBefore = hasOpeningBalance ? invoices.filter(inv => {
        const d = new Date(inv.dueDate || inv.generatedAt || inv.createdAt || 0);
        return d < startDate;
    }) : [];
    const paymentsBefore = hasOpeningBalance ? validPayments.filter(pmt => {
        const d = new Date(pmt.paymentDate || pmt.createdAt || 0);
        return d < startDate;
    }) : [];
    const creditNotesBefore = hasOpeningBalance ? creditNotes.filter(cn => {
        const d = new Date(cn.creditNoteDate || cn.createdAt || 0);
        return d < startDate;
    }) : [];
    const totalInvoicedBefore = invoicesBefore.reduce((sum, inv) => sum + (inv.totalAmountDue || 0), 0);
    const totalPaidBefore = paymentsBefore.reduce((sum, pmt) => sum + (pmt.amountReceived || 0), 0);
    const totalCreditNotesBefore = creditNotesBefore.reduce((sum, cn) => sum + (cn.amount || 0), 0);
    const openingBalance = totalInvoicedBefore - totalPaidBefore - totalCreditNotesBefore;

    // Calculate period totals for the Account Summary table
    const invoicedAmountPeriod = invoices.reduce((sum, inv) => {
        const d = new Date(inv.dueDate || inv.generatedAt || inv.createdAt || 0);
        if (d >= startDate && d <= endDate) {
            return sum + (inv.totalAmountDue || 0);
        }
        return sum;
    }, 0);
    const amountPaidPeriod = validPayments.reduce((sum, pmt) => {
        const d = new Date(pmt.paymentDate || pmt.createdAt || 0);
        if (d >= startDate && d <= endDate) {
            return sum + (pmt.amountReceived || 0);
        }
        return sum;
    }, 0);
    const creditNotesAmountPeriod = creditNotes.reduce((sum, cn) => {
        const d = new Date(cn.creditNoteDate || cn.createdAt || 0);
        if (d >= startDate && d <= endDate) {
            return sum + (cn.amount || 0);
        }
        return sum;
    }, 0);

    // Build transaction rows within range
    const txRows = [];

    // Invoices within range
    invoices.forEach(inv => {
        const d = new Date(inv.dueDate || inv.generatedAt || inv.createdAt || 0);
        if (d >= startDate && d <= endDate) {
            txRows.push({
                date: d,
                type: 'Invoice',
                detailLine1: `${inv.invoiceNumber || '—'} - due on ${formatDate(d)}`,
                detailLine2: '',
                amount: inv.totalAmountDue || 0,
                payment: 0,
                sortKey: d.getTime()
            });
        }
    });

    // Payments within range — consolidated payment row
    validPayments.forEach(pmt => {
        const d = new Date(pmt.paymentDate || pmt.createdAt || 0);
        if (d >= startDate && d <= endDate) {
            if (pmt.invoices && pmt.invoices.length > 0) {
                const detailsArray = pmt.invoices.map(invApp => 
                    `$${formatCurrency(invApp.amountApplied || 0)} to ${invApp.invoiceNumber || 'INV'}`
                );
                
                const totalApplied = pmt.invoices.reduce((sum, inv) => sum + (inv.amountApplied || 0), 0);
                const excess = (pmt.amountReceived || 0) - totalApplied;
                
                if (excess > 0.01) {
                    detailsArray.push(`$${formatCurrency(excess)} prepayment credit`);
                }
                
                txRows.push({
                    date: d,
                    type: 'Payment Received',
                    detailLine1: pmt.paymentNumber || pmt.referenceNumber || '—',
                    detailLine2: `Applied: ${detailsArray.join(", ")}`,
                    amount: 0,
                    payment: pmt.amountReceived || 0,
                    sortKey: d.getTime() + 1
                });
            } else {
                txRows.push({
                    date: d,
                    type: 'Payment Received',
                    detailLine1: pmt.paymentNumber || pmt.referenceNumber || '—',
                    detailLine2: `$${formatCurrency(pmt.amountReceived)} via ${pmt.paymentMethod || 'Other'}`,
                    amount: 0,
                    payment: pmt.amountReceived || 0,
                    sortKey: d.getTime() + 1
                });
            }
        }
    });

    // Credit notes within range
    creditNotes.forEach(cn => {
        const d = new Date(cn.creditNoteDate || cn.createdAt || 0);
        if (d >= startDate && d <= endDate) {
            txRows.push({
                date: d,
                type: 'Credit Note',
                detailLine1: cn.creditNoteNumber || '—',
                detailLine2: cn.reason ? `Reason: ${cn.reason}` : 'Credit Note Issued',
                amount: 0,
                payment: cn.amount || 0,
                sortKey: d.getTime() + 1
            });
        }
    });

    // Sort chronologically
    txRows.sort((a, b) => a.sortKey - b.sortKey);

    // Calculate running balance
    let runningBalance = openingBalance;
    txRows.forEach(row => {
        runningBalance += row.amount - row.payment;
        row.balance = runningBalance;
    });

    const closingBalance = openingBalance + invoicedAmountPeriod - amountPaidPeriod - creditNotesAmountPeriod;

    // ═══════════════════════════════════════════════════
    // DRAW PDF
    // ═══════════════════════════════════════════════════

    const drawHeader = () => {
        // Logo integration
        try {
            const logoPath = path.join(__dirname, "../../../assests/olaCars02.jpeg");
            doc.image(logoPath, leftMargin, 30, { height: 35 });
        } catch (err) {
            console.error("Failed to load logo image in PDF generation:", err);
        }

        // Statement Title
        doc.fontSize(12)
           .fillColor(primaryColor)
           .font("Helvetica-Bold")
           .text("STATEMENT OF ACCOUNT", rightMargin - 200, 42, { width: 200, align: "right" });

        doc.moveTo(leftMargin, 72)
           .lineTo(rightMargin, 72)
           .strokeColor(borderMain)
           .lineWidth(1)
           .stroke();

        // Customer Details
        let metaY = 82;
        doc.fontSize(8).fillColor(secondaryColor).font("Helvetica-Bold")
           .text("CUSTOMER DETAILS:", leftMargin, metaY);
        doc.fontSize(8).fillColor(secondaryColor).font("Helvetica-Bold")
           .text("STATEMENT PERIOD:", 350, metaY);

        metaY += 13;
        doc.fontSize(8.5).fillColor(primaryColor).font("Helvetica");
        doc.text(`Name: ${customer.name || "N/A"}`, leftMargin, metaY)
           .text(`Customer ID: ${customer.customerId || "N/A"}`, leftMargin, metaY + 12)
           .text(`Email: ${customer.email || "N/A"}`, leftMargin, metaY + 24)
           .text(`Phone: ${customer.phone || "N/A"}`, leftMargin, metaY + 36);

        doc.text(periodLabel, 350, metaY)
           .text(`Statement Date: ${formatDate(new Date())}`, 350, metaY + 12)
           .text(`Account Status: ${customer.status || "N/A"}`, 350, metaY + 24);

        // Account Summary Table on the right
        const boxX = 350;
        const boxY = 125;
        const boxW = 205;

        // Light grey background for the container title
        doc.fillColor("#F3F4F6")
           .rect(boxX, boxY, boxW, 14)
           .fill();

        doc.fillColor(primaryColor)
           .font("Helvetica-Bold")
           .fontSize(8)
           .text("Account Summary", boxX + 6, boxY + 3);

        // Rows
        let rowY = boxY + 18;
        doc.font("Helvetica").fontSize(7.5).fillColor(secondaryColor);
        
        doc.text("Opening Balance", boxX + 6, rowY)
           .text(`$ ${formatCurrency(openingBalance)}`, boxX + boxW - 86, rowY, { width: 80, align: "right" });

        rowY += 11;
        doc.text("Invoiced Amount", boxX + 6, rowY)
           .text(`$ ${formatCurrency(invoicedAmountPeriod)}`, boxX + boxW - 86, rowY, { width: 80, align: "right" });

        rowY += 11;
        doc.text("Amount Paid", boxX + 6, rowY)
           .text(`$ ${formatCurrency(amountPaidPeriod)}`, boxX + boxW - 86, rowY, { width: 80, align: "right" });

        rowY += 11;
        doc.text("Credit Notes", boxX + 6, rowY)
           .text(`$ ${formatCurrency(creditNotesAmountPeriod)}`, boxX + boxW - 86, rowY, { width: 80, align: "right" });

        // Line
        rowY += 9;
        doc.moveTo(boxX, rowY)
           .lineTo(boxX + boxW, rowY)
           .strokeColor(borderMain)
           .lineWidth(0.5)
           .stroke();

        // Balance Due
        rowY += 3;
        doc.font("Helvetica-Bold").fontSize(8).fillColor(primaryColor)
           .text("Balance Due", boxX + 6, rowY)
           .text(`$ ${formatCurrency(closingBalance)}`, boxX + boxW - 86, rowY, { width: 80, align: "right" });

        // Bottom border line for the whole header area
        doc.moveTo(leftMargin, 205)
           .lineTo(rightMargin, 205)
           .strokeColor(primaryColor)
           .lineWidth(1)
           .stroke();

        return 215;
    };

    const drawTableHeaders = (y) => {
        // Header background
        doc.fillColor(headerBg)
           .rect(leftMargin, y - 2, printableWidth, 18)
           .fill();

        doc.fillColor(primaryColor)
           .fontSize(7.5)
           .font("Helvetica-Bold");

        doc.text("Date", colDate, y, { width: colDateW })
           .text("Transactions", colTx, y, { width: colTxW })
           .text("Details", colDetails, y, { width: colDetailsW })
           .text("Amount", colAmount, y, { width: colAmountW, align: "right" })
           .text("Payments", colPayments, y, { width: colPaymentsW, align: "right" })
           .text("Balance", colBalance, y, { width: colBalanceW, align: "right" });

        doc.moveTo(leftMargin, y + 16)
           .lineTo(rightMargin, y + 16)
           .strokeColor(primaryColor)
           .lineWidth(0.8)
           .stroke();

        return y + 22;
    };

    // Draw first page header
    let currentY = drawHeader();
    currentY = drawTableHeaders(currentY);

    // Helper to draw a single row (may be multi-line for details)
    const drawRow = (row, y, isStripe) => {
        let lines = 1;
        if (row.detailLine2) {
            doc.fontSize(6.5);
            const textWidth = doc.widthOfString(row.detailLine2);
            lines = Math.max(1, Math.ceil(textWidth / colDetailsW));
            doc.fontSize(7.5);
        }
        const lineHeight = row.detailLine2 ? (14 + lines * 8) : 16;

        // Stripe background
        if (isStripe) {
            doc.fillColor(stripeBg)
               .rect(leftMargin, y - 2, printableWidth, lineHeight)
               .fill();
        }

        doc.fillColor(primaryColor).fontSize(7.5).font("Helvetica");

        // Date
        doc.text(formatDate(row.date), colDate, y, { width: colDateW, ellipsis: true });

        // Transaction type
        doc.font("Helvetica-Bold")
           .text(row.type, colTx, y, { width: colTxW, ellipsis: true });

        // Details (potentially multi-line)
        doc.font("Helvetica")
           .text(row.detailLine1, colDetails, y, { width: colDetailsW, ellipsis: true });
        if (row.detailLine2) {
            doc.fontSize(6.5)
               .fillColor(secondaryColor)
               .text(row.detailLine2, colDetails, y + 10, { width: colDetailsW })
               .fillColor(primaryColor)
               .fontSize(7.5);
        }

        // Amount
        if (row.amount > 0) {
            doc.text(formatCurrency(row.amount), colAmount, y, { width: colAmountW, align: "right" });
        }

        // Payments
        if (row.payment > 0) {
            doc.text(formatCurrency(row.payment), colPayments, y, { width: colPaymentsW, align: "right" });
        }

        // Balance
        doc.text(formatCurrency(row.balance), colBalance, y, { width: colBalanceW, align: "right" });

        // Row bottom border
        doc.moveTo(leftMargin, y + lineHeight - 2)
           .lineTo(rightMargin, y + lineHeight - 2)
           .strokeColor(borderMain)
           .lineWidth(0.3)
           .stroke();

        return lineHeight;
    };

    if (hasOpeningBalance) {
        // Draw opening balance with a slight highlight
        doc.fillColor("#FFFDE7")
           .rect(leftMargin, currentY - 2, printableWidth, 16)
           .fill();

        doc.fillColor(primaryColor).fontSize(7.5).font("Helvetica-Bold");
        doc.text(formatDate(startDate), colDate, currentY, { width: colDateW });
        doc.text("***Opening", colTx, currentY, { width: colTxW });
        doc.text("Balance***", colDetails, currentY, { width: colDetailsW });
        if (openingBalance > 0) {
            doc.text(formatCurrency(openingBalance), colAmount, currentY, { width: colAmountW, align: "right" });
        }
        doc.text(formatCurrency(openingBalance), colBalance, currentY, { width: colBalanceW, align: "right" });

        doc.moveTo(leftMargin, currentY + 14)
           .lineTo(rightMargin, currentY + 14)
           .strokeColor(borderMain)
           .lineWidth(0.3)
           .stroke();

        currentY += 18;
    }

    let isStripe = false;

    // Draw transaction rows
    txRows.forEach(row => {
        let estHeight = 18;
        if (row.detailLine2) {
            doc.fontSize(6.5);
            const w = doc.widthOfString(row.detailLine2);
            const lines = Math.max(1, Math.ceil(w / colDetailsW));
            estHeight = 14 + lines * 8;
            doc.fontSize(7.5);
        }
        
        // Page break check (A4 Portrait is 842pt high)
        if (currentY + estHeight > 780) {
            doc.addPage();
            currentY = drawTableHeaders(40);
            isStripe = false;
        }

        const usedHeight = drawRow(row, currentY, isStripe);
        currentY += usedHeight + 2;
        isStripe = !isStripe;
    });

    // Closing Balance Due footer
    if (currentY > 740) {
        doc.addPage();
        currentY = 50;
    }

    currentY += 5;
    doc.moveTo(leftMargin, currentY)
       .lineTo(rightMargin, currentY)
       .strokeColor(primaryColor)
       .lineWidth(1)
       .stroke();

    currentY += 10;
    doc.fontSize(9).fillColor(primaryColor).font("Helvetica-Bold")
       .text("Balance Due", colPayments - 40, currentY, { width: colPaymentsW + 40, align: "right" });
    doc.fontSize(11).fillColor(primaryColor).font("Helvetica-Bold")
       .text(`$ ${formatCurrency(closingBalance)}`, colBalance, currentY - 1, { width: colBalanceW, align: "right" });

    // Footer text
    currentY += 25;
    doc.fontSize(7)
       .fillColor(secondaryColor)
       .font("Helvetica")
       .text(
           "This statement reflects the financial balance registry of invoices and payments recorded for the specified period. If you have any inquiries regarding balances, please contact the finance office.",
           leftMargin,
           currentY,
           { width: printableWidth }
       );

    doc.end();
};
