const PDFDocument = require("pdfkit");
const path = require("path");

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

exports.generateReportPdf = (reportType, reportData, meta, res) => {
    const isPL = reportType === "PL";
    const reportTitle = isPL ? "INCOME STATEMENT (P&L)" : "STATEMENT OF FINANCIAL POSITION";

    const doc = new PDFDocument({
        size: "A4",
        margin: 50,
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
    const accentColor = "#84CC16"; // Brand Lime green / Accent green
    const bgHeader = "#F9FAFB"; // Light gray bg for table headers
    const stripeBg = "#F9FAFB"; // Zebra stripe background

    const leftMargin = 50;
    const rightMargin = 545;
    const printableWidth = rightMargin - leftMargin;

    // Logo image integration
    try {
        const logoPath = path.join(__dirname, "../../../assests/olaCars02.jpeg");
        doc.image(logoPath, 50, 45, { height: 40 });
    } catch (err) {
        console.error("Failed to load logo image in PDF generation:", err);
    }

    doc.fontSize(14)
       .fillColor(primaryColor)
       .font("Helvetica-Bold")
       .text(reportTitle, 250, 58, { align: "right", width: 295 });

    doc.moveTo(leftMargin, 95)
       .lineTo(rightMargin, 95)
       .strokeColor(borderMain)
       .stroke();

    // Metadata details
    const metaY = 110;
    doc.fontSize(8.5).fillColor(secondaryColor).font("Helvetica-Bold").text("REPORT DETAILS:", leftMargin, metaY);
    doc.text("FILTER CRITERIA:", 300, metaY);

    doc.fontSize(9).fillColor(primaryColor).font("Helvetica");
    const generatedDateStr = formatDate(new Date());
    doc.text(`Generated Date: ${generatedDateStr}`, leftMargin, metaY + 16)
       .text(`Currency: USD`, leftMargin, metaY + 30);

    const branchName = meta.branchName || "Consolidated (All Branches)";
    const dateRangeStr = (meta.startDate || meta.endDate) 
        ? `${meta.startDate ? formatDate(meta.startDate) : "Beginning"} to ${meta.endDate ? formatDate(meta.endDate) : "Present"}`
        : "All Time";
    
    doc.text(`Branch: ${branchName}`, 300, metaY + 16)
       .text(`Period: ${dateRangeStr}`, 300, metaY + 30);

    doc.moveTo(leftMargin, 160)
       .lineTo(rightMargin, 160)
       .strokeColor(borderMain)
       .stroke();

    let currentY = 180;

    const ensureSpace = (neededHeight, sectionHeaderFn) => {
        if (currentY + neededHeight > 730) {
            doc.addPage();
            currentY = 50;
            
            // Draw running header on new pages
            doc.fontSize(8)
               .fillColor(secondaryColor)
               .font("Helvetica-Bold")
               .text(`OLA CARS  |  ${reportTitle.toUpperCase()} (CONTINUED)`, leftMargin, currentY)
               .fontSize(8)
               .text(`Period: ${dateRangeStr}`, rightMargin - 200, currentY, { align: "right", width: 200 });
            
            doc.moveTo(leftMargin, currentY + 12)
               .lineTo(rightMargin, currentY + 12)
               .strokeColor(borderMain)
               .lineWidth(0.5)
               .stroke();
            
            currentY += 25;
            
            if (sectionHeaderFn) {
                sectionHeaderFn();
            }
        }
    };

    if (isPL) {
        // --- profit & loss layout ---
        // Income section
        ensureSpace(40);
        doc.fontSize(12).font("Helvetica-Bold").fillColor(accentColor).text("INCOME", leftMargin, currentY);
        currentY += 20;

        // Table Header for Income
        const printIncomeHeader = () => {
            doc.fillColor(primaryColor).fontSize(9).font("Helvetica-Bold");
            doc.text("Category", leftMargin, currentY);
            doc.text("Amount ($)", rightMargin - 150, currentY, { width: 150, align: "right" });
            currentY += 14;
            
            doc.moveTo(leftMargin, currentY)
               .lineTo(rightMargin, currentY)
               .strokeColor(primaryColor)
               .lineWidth(1)
               .stroke();
            currentY += 8;
        };
        printIncomeHeader();

        // Income Rows
        doc.font("Helvetica").fontSize(9);
        const incomeList = reportData.income || [];
        let totalIncome = 0;
        let isStripe = false;

        if (incomeList.length === 0) {
            ensureSpace(20);
            doc.fillColor(secondaryColor).text("No income transactions recorded in this period.", leftMargin + 10, currentY);
            currentY += 20;
        } else {
            incomeList.forEach(item => {
                totalIncome += item.amount;
                ensureSpace(18, printIncomeHeader);
                if (isStripe) {
                    doc.fillColor(stripeBg).rect(leftMargin, currentY - 2, printableWidth, 16).fill();
                }
                doc.fillColor(primaryColor).text(item.name, leftMargin + 5, currentY);
                doc.text(`$${formatCurrency(item.amount)}`, rightMargin - 150, currentY, { width: 150, align: "right" });
                currentY += 18;
                isStripe = !isStripe;
            });
        }

        // Income Total
        ensureSpace(20);
        doc.moveTo(leftMargin, currentY - 4)
           .lineTo(rightMargin, currentY - 4)
           .strokeColor(borderMain)
           .lineWidth(1)
           .stroke();

        doc.fillColor(primaryColor).font("Helvetica-Bold").text("Total Income", leftMargin, currentY);
        doc.text(`$${formatCurrency(totalIncome)}`, rightMargin - 150, currentY, { width: 150, align: "right" });
        currentY += 35;

        // Expenses section
        ensureSpace(40);
        doc.fontSize(12).font("Helvetica-Bold").fillColor("#EF4444").text("EXPENSES", leftMargin, currentY);
        currentY += 20;

        // Table Header for Expenses
        const printExpensesHeader = () => {
            doc.fillColor(primaryColor).fontSize(9).font("Helvetica-Bold");
            doc.text("Category", leftMargin, currentY);
            doc.text("Amount ($)", rightMargin - 150, currentY, { width: 150, align: "right" });
            currentY += 14;

            doc.moveTo(leftMargin, currentY)
               .lineTo(rightMargin, currentY)
               .strokeColor(primaryColor)
               .lineWidth(1)
               .stroke();
            currentY += 8;
        };
        printExpensesHeader();

        // Expense Rows
        doc.font("Helvetica").fontSize(9);
        const expenseList = reportData.expenses || [];
        let totalExpenses = 0;
        isStripe = false;

        if (expenseList.length === 0) {
            ensureSpace(20);
            doc.fillColor(secondaryColor).text("No expense transactions recorded in this period.", leftMargin + 10, currentY);
            currentY += 20;
        } else {
            expenseList.forEach(item => {
                totalExpenses += item.amount;
                ensureSpace(18, printExpensesHeader);
                if (isStripe) {
                    doc.fillColor(stripeBg).rect(leftMargin, currentY - 2, printableWidth, 16).fill();
                }
                doc.fillColor(primaryColor).text(item.name, leftMargin + 5, currentY);
                doc.text(`$${formatCurrency(item.amount)}`, rightMargin - 150, currentY, { width: 150, align: "right" });
                currentY += 18;
                isStripe = !isStripe;
            });
        }

        // Expense Total
        ensureSpace(20);
        doc.moveTo(leftMargin, currentY - 4)
           .lineTo(rightMargin, currentY - 4)
           .strokeColor(borderMain)
           .lineWidth(1)
           .stroke();

        doc.fillColor(primaryColor).font("Helvetica-Bold").text("Total Expenses", leftMargin, currentY);
        doc.text(`$${formatCurrency(totalExpenses)}`, rightMargin - 150, currentY, { width: 150, align: "right" });
        currentY += 40;

        // Net Profit Summary Card
        ensureSpace(60);
        const netProfit = reportData.netProfit ?? (totalIncome - totalExpenses);
        const isNetLoss = netProfit < 0;

        doc.moveTo(leftMargin, currentY)
           .lineTo(rightMargin, currentY)
           .strokeColor(borderMain)
           .lineWidth(1)
           .stroke();
        currentY += 12;

        doc.fillColor(isNetLoss ? "#EF4444" : accentColor)
           .rect(leftMargin, currentY, printableWidth, 45)
           .fill();

        doc.fillColor("#FFFFFF")
           .fontSize(11)
           .font("Helvetica-Bold")
           .text(isNetLoss ? "NET LOSS" : "NET PROFIT", leftMargin + 15, currentY + 16)
           .fontSize(16)
           .text(`$${formatCurrency(netProfit)}`, rightMargin - 200, currentY + 14, { width: 185, align: "right" });

    } else {
        // --- Balance Sheet layout ---
        // We will split the A4 page layout into sections with dynamic page breaking.
        
        // Assets section
        ensureSpace(40);
        doc.fontSize(11).font("Helvetica-Bold").fillColor(accentColor).text("ASSETS", leftMargin, currentY);
        currentY += 16;

        const printAssetsHeader = () => {
            doc.fillColor(primaryColor).fontSize(8.5).font("Helvetica-Bold");
            doc.text("Account / Class", leftMargin, currentY);
            doc.text("Amount ($)", rightMargin - 150, currentY, { width: 150, align: "right" });
            currentY += 12;
            doc.moveTo(leftMargin, currentY)
               .lineTo(rightMargin, currentY)
               .strokeColor(primaryColor)
               .lineWidth(0.8)
               .stroke();
            currentY += 6;
        };
        printAssetsHeader();

        doc.font("Helvetica").fontSize(8.5);
        const assetsList = reportData.assets || [];
        let isStripe = false;
        if (assetsList.length === 0) {
            ensureSpace(20);
            doc.fillColor(secondaryColor).text("No assets recorded.", leftMargin + 10, currentY);
            currentY += 16;
        } else {
            assetsList.forEach(item => {
                ensureSpace(15, printAssetsHeader);
                if (isStripe) {
                    doc.fillColor(stripeBg).rect(leftMargin, currentY - 2, printableWidth, 14).fill();
                }
                doc.fillColor(primaryColor).text(item.name, leftMargin + 5, currentY);
                doc.text(`$${formatCurrency(item.amount)}`, rightMargin - 150, currentY, { width: 150, align: "right" });
                currentY += 15;
                isStripe = !isStripe;
            });
        }

        ensureSpace(20);
        doc.moveTo(leftMargin, currentY - 2)
           .lineTo(rightMargin, currentY - 2)
           .strokeColor(borderMain)
           .lineWidth(0.8)
           .stroke();

        doc.fillColor(primaryColor).font("Helvetica-Bold").text("Total Assets", leftMargin, currentY);
        doc.text(`$${formatCurrency(reportData.assetsTotal || 0)}`, rightMargin - 150, currentY, { width: 150, align: "right" });
        currentY += 30;

        // Liabilities section
        ensureSpace(40);
        doc.fontSize(11).font("Helvetica-Bold").fillColor("#EF4444").text("LIABILITIES", leftMargin, currentY);
        currentY += 16;

        const printLiabilitiesHeader = () => {
            doc.fillColor(primaryColor).fontSize(8.5).font("Helvetica-Bold");
            doc.text("Account / Class", leftMargin, currentY);
            doc.text("Amount ($)", rightMargin - 150, currentY, { width: 150, align: "right" });
            currentY += 12;
            doc.moveTo(leftMargin, currentY)
               .lineTo(rightMargin, currentY)
               .strokeColor(primaryColor)
               .lineWidth(0.8)
               .stroke();
            currentY += 6;
        };
        printLiabilitiesHeader();

        doc.font("Helvetica").fontSize(8.5);
        const liabilitiesList = reportData.liabilities || [];
        isStripe = false;
        if (liabilitiesList.length === 0) {
            ensureSpace(20);
            doc.fillColor(secondaryColor).text("No liabilities recorded.", leftMargin + 10, currentY);
            currentY += 16;
        } else {
            liabilitiesList.forEach(item => {
                ensureSpace(15, printLiabilitiesHeader);
                if (isStripe) {
                    doc.fillColor(stripeBg).rect(leftMargin, currentY - 2, printableWidth, 14).fill();
                }
                doc.fillColor(primaryColor).text(item.name, leftMargin + 5, currentY);
                doc.text(`$${formatCurrency(item.amount)}`, rightMargin - 150, currentY, { width: 150, align: "right" });
                currentY += 15;
                isStripe = !isStripe;
            });
        }

        ensureSpace(20);
        doc.moveTo(leftMargin, currentY - 2)
           .lineTo(rightMargin, currentY - 2)
           .strokeColor(borderMain)
           .lineWidth(0.8)
           .stroke();

        doc.fillColor(primaryColor).font("Helvetica-Bold").text("Total Liabilities", leftMargin, currentY);
        doc.text(`$${formatCurrency(reportData.liabilitiesTotal || 0)}`, rightMargin - 150, currentY, { width: 150, align: "right" });
        currentY += 30;

        // Equity section
        ensureSpace(40);
        doc.fontSize(11).font("Helvetica-Bold").fillColor("#3B82F6").text("EQUITY", leftMargin, currentY);
        currentY += 16;

        const printEquityHeader = () => {
            doc.fillColor(primaryColor).fontSize(8.5).font("Helvetica-Bold");
            doc.text("Account / Class", leftMargin, currentY);
            doc.text("Amount ($)", rightMargin - 150, currentY, { width: 150, align: "right" });
            currentY += 12;
            doc.moveTo(leftMargin, currentY)
               .lineTo(rightMargin, currentY)
               .strokeColor(primaryColor)
               .lineWidth(0.8)
               .stroke();
            currentY += 6;
        };
        printEquityHeader();

        doc.font("Helvetica").fontSize(8.5);
        const equityList = reportData.equity || [];
        isStripe = false;
        if (equityList.length === 0) {
            ensureSpace(20);
            doc.fillColor(secondaryColor).text("No equity accounts recorded.", leftMargin + 10, currentY);
            currentY += 16;
        } else {
            equityList.forEach(item => {
                ensureSpace(15, printEquityHeader);
                if (isStripe) {
                    doc.fillColor(stripeBg).rect(leftMargin, currentY - 2, printableWidth, 14).fill();
                }
                doc.fillColor(primaryColor).text(item.name, leftMargin + 5, currentY);
                doc.text(`$${formatCurrency(item.amount)}`, rightMargin - 150, currentY, { width: 150, align: "right" });
                currentY += 15;
                isStripe = !isStripe;
            });
        }

        ensureSpace(20);
        doc.moveTo(leftMargin, currentY - 2)
           .lineTo(rightMargin, currentY - 2)
           .strokeColor(borderMain)
           .lineWidth(0.8)
           .stroke();

        doc.fillColor(primaryColor).font("Helvetica-Bold").text("Total Equity", leftMargin, currentY);
        doc.text(`$${formatCurrency(reportData.equityTotal || 0)}`, rightMargin - 150, currentY, { width: 150, align: "right" });
        currentY += 40;
    }

    // Footnotes / Stamp
    const footerY = 740;
    doc.moveTo(leftMargin, footerY - 10)
       .lineTo(rightMargin, footerY - 10)
       .strokeColor(borderMain)
       .lineWidth(0.5)
       .stroke();

    doc.fontSize(7.5)
       .fillColor(secondaryColor)
       .font("Helvetica")
       .text("This report is system-generated and reflects the verified financial ledgers recorded in the central ERP system.", leftMargin, footerY, { width: 300 });

    doc.fontSize(7.5)
       .text("Ola Cars Logistics Group. All rights reserved.", rightMargin - 200, footerY, { width: 200, align: "right" });

    doc.end();
};
