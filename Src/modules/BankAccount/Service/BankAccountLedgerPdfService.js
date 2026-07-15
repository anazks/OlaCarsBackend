const PDFDocument = require("pdfkit");
const path = require("path");

// Safe currency formatter
const formatCurrency = (val) => {
    const num = typeof val === "number" ? val : parseFloat(val);
    return isNaN(num) ? "0.00" : num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// Safe date formatter DD/MM/YYYY
const formatDate = (val) => {
    if (!val) return "N/A";
    const d = new Date(val);
    if (isNaN(d.getTime())) return "N/A";
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `${day}/${month}/${year} ${timeStr}`;
};

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
 * Generate a Bank Account Ledger Statement PDF.
 * 
 * Layout: A4 Portrait
 * Columns: Date | Description | Ref ID | Creator | Deposits | Withdrawals | Running Balance
 */
exports.generateLedgerPdf = (account, transactions, openingBalance, periodParams, res) => {
    if (!account) {
        throw new Error("No bank account data provided");
    }

    const { startDate, endDate } = periodParams;
    let periodLabel = "";
    if (startDate || endDate) {
        const fromStr = startDate ? formatDateOnly(startDate) : "Beginning";
        const toStr = endDate ? formatDateOnly(endDate) : "Present";
        periodLabel = `${fromStr} - ${toStr}`;
    } else {
        periodLabel = "Full Statement History";
    }

    const doc = new PDFDocument({
        size: "A4",
        layout: "portrait",
        margin: 40,
        info: {
            Title: `Ledger Statement - ${account.accountName || account.bankName} - ${periodLabel}`,
            Author: "Ola Cars Logistics"
        }
    });

    doc.pipe(res);

    // Styling Palette
    const primaryColor = "#111827";   // Dark slate
    const secondaryColor = "#4B5563"; // Dim grey
    const borderMain = "#D1D5DB";     // Separator lines
    const headerBg = "#F3F4F6";       // Table header background
    const stripeBg = "#F9FAFB";       // Zebra stripe background
    const highlightBg = "#FFFDE7";    // Opening balance highlight

    const leftMargin = 40;
    const rightMargin = 555;          // 595 - 40
    const printableWidth = rightMargin - leftMargin;

    // Columns config
    const colDate = 40;
    const colDesc = 115;
    const colRef = 245;
    const colAudit = 300;
    const colDeposits = 350;
    const colWithdrawals = 415;
    const colBalance = 480;

    const colDateW = 70;
    const colDescW = 125;
    const colRefW = 50;
    const colAuditW = 45;
    const colDepositsW = 60;
    const colWithdrawalsW = 60;
    const colBalanceW = 75;

    // Header Drawing
    const drawHeader = () => {
        try {
            const logoPath = path.join(__dirname, "../../../assests/olaCars02.jpeg");
            doc.image(logoPath, leftMargin, 30, { height: 35 });
        } catch (err) {
            console.error("Failed to load logo image in PDF generation:", err);
        }

        // Title
        doc.fontSize(12)
           .fillColor(primaryColor)
           .font("Helvetica-Bold")
           .text("BANK LEDGER STATEMENT", rightMargin - 220, 42, { width: 220, align: "right" });

        doc.moveTo(leftMargin, 72)
           .lineTo(rightMargin, 72)
           .strokeColor(borderMain)
           .lineWidth(1)
           .stroke();

        // Left Detail Panel
        let metaY = 82;
        doc.fontSize(8).fillColor(secondaryColor).font("Helvetica-Bold")
           .text("ACCOUNT DETAILS:", leftMargin, metaY);
        doc.text("STATEMENT PERIOD:", 350, metaY);

        metaY += 13;
        doc.fontSize(8.5).fillColor(primaryColor).font("Helvetica");
        doc.text(`Account Name: ${account.accountName || "N/A"}`, leftMargin, metaY)
           .text(`Bank Name: ${account.bankName || "N/A"}`, leftMargin, metaY + 12)
           .text(`Account Number: ${account.accountNumber || "N/A"}`, leftMargin, metaY + 24)
           .text(`Account Type: ${account.accountType || "N/A"} (${account.currency || "USD"})`, leftMargin, metaY + 36);

        doc.text(periodLabel, 350, metaY)
           .text(`Statement Date: ${formatDateOnly(new Date())}`, 350, metaY + 12)
           .text(`Accounting Code: ${account.accountCode || "N/A"}`, 350, metaY + 24)
           .text(`Status: ${account.status || "N/A"}`, 350, metaY + 36);

        // Account Financial Summary Panel on the Right
        const boxX = 350;
        const boxY = 138;
        const boxW = 205;

        // Container title
        doc.fillColor("#F3F4F6")
           .rect(boxX, boxY, boxW, 14)
           .fill();

        doc.fillColor(primaryColor)
           .font("Helvetica-Bold")
           .fontSize(8)
           .text("Ledger Summary", boxX + 6, boxY + 3);

        // Period calculations
        let totalDepositsVal = 0;
        let totalWithdrawalsVal = 0;
        transactions.forEach(t => {
            if (t.type === "DEBIT") {
                totalDepositsVal += t.amount || 0;
            } else if (t.type === "CREDIT") {
                totalWithdrawalsVal += t.amount || 0;
            }
        });

        const isCreditCard = account.accountType === "Credit Card";
        const closingBalanceVal = isCreditCard
            ? openingBalance + (totalWithdrawalsVal - totalDepositsVal)
            : openingBalance + (totalDepositsVal - totalWithdrawalsVal);

        // Rows
        let rowY = boxY + 18;
        doc.font("Helvetica").fontSize(7.5).fillColor(secondaryColor);
        doc.text("Opening Balance", boxX + 6, rowY)
           .text(`$ ${formatCurrency(openingBalance)}`, boxX + boxW - 86, rowY, { width: 80, align: "right" });

        rowY += 11;
        doc.text("Total Deposits", boxX + 6, rowY)
           .text(`$ ${formatCurrency(totalDepositsVal)}`, boxX + boxW - 86, rowY, { width: 80, align: "right" });

        rowY += 11;
        doc.text("Total Withdrawals", boxX + 6, rowY)
           .text(`$ ${formatCurrency(totalWithdrawalsVal)}`, boxX + boxW - 86, rowY, { width: 80, align: "right" });

        // Line
        rowY += 9;
        doc.moveTo(boxX, rowY)
           .lineTo(boxX + boxW, rowY)
           .strokeColor(borderMain)
           .lineWidth(0.5)
           .stroke();

        // Closing Balance
        rowY += 3;
        doc.font("Helvetica-Bold").fontSize(8).fillColor(primaryColor)
           .text("Closing Balance", boxX + 6, rowY)
           .text(`$ ${formatCurrency(closingBalanceVal)}`, boxX + boxW - 86, rowY, { width: 80, align: "right" });

        // Divider Line
        doc.moveTo(leftMargin, 212)
           .lineTo(rightMargin, 212)
           .strokeColor(primaryColor)
           .lineWidth(1)
           .stroke();

        return 222;
    };

    const drawTableHeaders = (y) => {
        // Background
        doc.fillColor(headerBg)
           .rect(leftMargin, y - 2, printableWidth, 18)
           .fill();

        doc.fillColor(primaryColor)
           .fontSize(7.5)
           .font("Helvetica-Bold");

        doc.text("Date & Time", colDate, y, { width: colDateW })
           .text("Description", colDesc, y, { width: colDescW })
           .text("Ref ID", colRef, y, { width: colRefW })
           .text("Creator", colAudit, y, { width: colAuditW })
           .text("Deposits", colDeposits, y, { width: colDepositsW, align: "right" })
           .text("Withdrawals", colWithdrawals, y, { width: colWithdrawalsW, align: "right" })
           .text("Running Balance", colBalance, y, { width: colBalanceW, align: "right" });

        doc.moveTo(leftMargin, y + 16)
           .lineTo(rightMargin, y + 16)
           .strokeColor(primaryColor)
           .lineWidth(0.8)
           .stroke();

        return y + 22;
    };

    // First page header and table headers
    let currentY = drawHeader();
    currentY = drawTableHeaders(currentY);

    let isStripe = false;

    // Draw Rows
    const drawRow = (row, y, isStripeBg) => {
        const dateVal = row.entryDate || row.date;
        const formattedEntryDate = formatDate(dateVal);
        const refIdStr = row.transactionId || "—";
        const auditStr = row.creatorRole || "SYSTEM";

        const debitVal = row.amount !== undefined
            ? (row.type === 'DEBIT' ? row.amount : 0)
            : (row.debit || 0);

        const creditVal = row.amount !== undefined
            ? (row.type === 'CREDIT' ? row.amount : 0)
            : (row.credit || 0);

        const depStr = debitVal > 0 ? formatCurrency(debitVal) : "—";
        const withStr = creditVal > 0 ? formatCurrency(creditVal) : "—";
        const balStr = formatCurrency(row.runningBalance || 0);

        // Estimate description height
        doc.fontSize(7.5);
        const descText = row.description || "Bank Ledger Entry";
        const descTextHeight = doc.heightOfString(descText, { width: colDescW });
        const rowHeight = Math.max(16, descTextHeight + 4);

        if (isStripeBg) {
            doc.fillColor(stripeBg)
               .rect(leftMargin, y - 2, printableWidth, rowHeight)
               .fill();
        }

        doc.fillColor(primaryColor).font("Helvetica").fontSize(7.5);
        doc.text(formattedEntryDate, colDate, y, { width: colDateW });
        doc.text(descText, colDesc, y, { width: colDescW });
        doc.text(refIdStr, colRef, y, { width: colRefW, ellipsis: true });
        doc.text(auditStr, colAudit, y, { width: colAuditW, ellipsis: true });

        // Deposits
        if (debitVal > 0) {
            doc.fillColor("#10B981").font("Helvetica-Bold");
            doc.text(depStr, colDeposits, y, { width: colDepositsW, align: "right" });
        } else {
            doc.text(depStr, colDeposits, y, { width: colDepositsW, align: "right" });
        }

        // Withdrawals
        doc.fillColor(primaryColor).font("Helvetica");
        if (creditVal > 0) {
            doc.fillColor("#EF4444").font("Helvetica-Bold");
            doc.text(withStr, colWithdrawals, y, { width: colWithdrawalsW, align: "right" });
        } else {
            doc.text(withStr, colWithdrawals, y, { width: colWithdrawalsW, align: "right" });
        }

        // Balance
        doc.fillColor(primaryColor).font("Helvetica-Bold");
        doc.text(balStr, colBalance, y, { width: colBalanceW, align: "right" });

        // Bottom divider
        doc.moveTo(leftMargin, y + rowHeight - 2)
           .lineTo(rightMargin, y + rowHeight - 2)
           .strokeColor(borderMain)
           .lineWidth(0.3)
           .stroke();

        return rowHeight;
    };

    transactions.forEach(row => {
        const estHeight = 24;
        if (currentY + estHeight > 780) {
            doc.addPage();
            currentY = drawTableHeaders(40);
            isStripe = false;
        }

        const usedHeight = drawRow(row, currentY, isStripe);
        currentY += usedHeight + 2;
        isStripe = !isStripe;
    });

    // Closing footer page break check
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

    // Summary at the bottom
    currentY += 10;
    const isCreditCard = account.accountType === "Credit Card";
    let totalDepositsVal = 0;
    let totalWithdrawalsVal = 0;
    transactions.forEach(t => {
        if (t.type === "DEBIT") {
            totalDepositsVal += t.amount || 0;
        } else if (t.type === "CREDIT") {
            totalWithdrawalsVal += t.amount || 0;
        }
    });
    const closingBalanceVal = isCreditCard
        ? openingBalance + (totalWithdrawalsVal - totalDepositsVal)
        : openingBalance + (totalDepositsVal - totalWithdrawalsVal);

    doc.fontSize(8).fillColor(secondaryColor).font("Helvetica")
       .text(`Total Deposits: $ ${formatCurrency(totalDepositsVal)}`, leftMargin, currentY)
       .text(`Total Withdrawals: $ ${formatCurrency(totalWithdrawalsVal)}`, leftMargin + 160, currentY);

    doc.fontSize(9).fillColor(primaryColor).font("Helvetica-Bold")
       .text("Closing Ledger Balance", colWithdrawals - 70, currentY, { width: colWithdrawalsW + 70, align: "right" });
    doc.fontSize(11).fillColor(primaryColor).font("Helvetica-Bold")
       .text(`$ ${formatCurrency(closingBalanceVal)}`, colBalance, currentY - 1, { width: colBalanceW, align: "right" });

    currentY += 25;
    doc.fontSize(7)
       .fillColor(secondaryColor)
       .font("Helvetica")
       .text(
           "This bank ledger statement is an official accounting register reflecting transactions posted to the Chart of Accounts repository. For queries about this report, please contact your financial controller.",
           leftMargin,
           currentY,
           { width: printableWidth }
       );

    doc.end();
};
