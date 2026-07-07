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

    // Header section
    doc.fillColor(primaryColor)
       .fontSize(22)
       .font("Helvetica-Bold")
       .text("OLA CARS", leftMargin, 50);


    doc.fontSize(14)
       .fillColor(primaryColor)
       .font("Helvetica-Bold")
       .text(reportTitle, 250, 50, { align: "right", width: 295 });

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
        // --- Balance Sheet layout (grouped by account type) ---

        const classifyAsset = (a) => {
            const cat = (a.category || "").toLowerCase().trim();
            const type = (a.accountType || "").toLowerCase().trim();
            const name = (a.name || "").toLowerCase().trim();
            if (type === 'cash' || name.includes('cash') || name.includes('caja') || name.includes('petty')) {
                return 'cash';
            }
            if (type === 'bank' || name.includes('bank') || name.includes('banco') || name.includes('bct')) {
                return 'bank';
            }
            if (type === 'accounts receivable' || type === 'accounts_receivable' || cat === 'accounts receivable' || cat === 'accounts_receivable') {
                return 'ar';
            }
            if (type === 'input tax' || type === 'input_tax' || cat === 'input tax' || cat === 'input_tax') {
                return 'input_tax';
            }
            if (type === 'other asset' || cat === 'other asset') {
                return 'other_asset';
            }
            if (type === 'fixed asset' || cat === 'fixed asset') {
                return 'fixed';
            }
            return 'other';
        };

        const renderGroupHeader = (title) => {
            ensureSpace(28);
            doc.fontSize(8).font("Helvetica-Bold").fillColor(secondaryColor)
               .text(title.toUpperCase(), leftMargin + 4, currentY);
            doc.moveTo(leftMargin + 4, currentY + 11)
               .lineTo(rightMargin, currentY + 11)
               .strokeColor(borderMain)
               .lineWidth(0.5)
               .stroke();
            currentY += 16;

            // Column headers
            doc.fontSize(7.5).font("Helvetica-Bold").fillColor(secondaryColor);
            doc.text("Account Name", leftMargin + 10, currentY);
            doc.text("Code", leftMargin + 260, currentY);
            doc.text("Amount (USD)", rightMargin - 130, currentY, { width: 130, align: "right" });
            currentY += 11;
        };

        const renderGroupRows = (items) => {
            let isStripe = false;
            items.forEach(item => {
                ensureSpace(15);
                if (isStripe) {
                    doc.fillColor(stripeBg).rect(leftMargin + 4, currentY - 1, printableWidth - 4, 14).fill();
                }
                doc.fontSize(8.5).font("Helvetica").fillColor(primaryColor)
                   .text(item.name, leftMargin + 10, currentY, { width: 240, ellipsis: true });
                doc.fillColor(secondaryColor)
                   .text(item.code || "—", leftMargin + 260, currentY);
                doc.fillColor(primaryColor)
                   .text(`$${formatCurrency(item.amount)}`, rightMargin - 130, currentY, { width: 130, align: "right" });
                currentY += 14;
                isStripe = !isStripe;
            });
        };

        const renderSubtotalRow = (label, value, color = secondaryColor, isBold = false) => {
            ensureSpace(18);
            doc.moveTo(leftMargin + 4, currentY)
               .lineTo(rightMargin, currentY)
               .strokeColor(borderMain)
               .lineWidth(0.6)
               .stroke();
            currentY += 3;
            doc.fontSize(8.5).font(isBold ? "Helvetica-Bold" : "Helvetica-Bold").fillColor(color)
               .text(label, leftMargin + 10, currentY);
            doc.fillColor(color)
               .text(`$${formatCurrency(value)}`, rightMargin - 130, currentY, { width: 130, align: "right" });
            currentY += 14;
        };

        // Helper: group an array of items by their accountType field (for Liabilities/Equity)
        const groupByAccountType = (items) => {
            const groups = {};
            (items || []).forEach(item => {
                const key = item.accountType || 'Other';
                if (!groups[key]) groups[key] = [];
                groups[key].push(item);
            });
            return groups;
        };

        // Helper: render one grouped section (for LIABILITIES / EQUITY)
        const renderGroupedSection = (sectionTitle, sectionColor, items, totalLabel, totalValue) => {
            ensureSpace(30);
            doc.rect(leftMargin, currentY - 2, printableWidth, 20).fill(sectionColor);
            doc.fontSize(10.5).font("Helvetica-Bold").fillColor("#FFFFFF")
               .text(sectionTitle, leftMargin + 8, currentY + 3);
            currentY += 24;

            if (!items || items.length === 0) {
                ensureSpace(20);
                doc.fontSize(8.5).font("Helvetica").fillColor(secondaryColor)
                   .text(`No ${sectionTitle.toLowerCase()} recorded.`, leftMargin + 10, currentY);
                currentY += 16;
            } else {
                const groups = groupByAccountType(items);
                const groupNames = Object.keys(groups);

                groupNames.forEach((groupName, gIndex) => {
                    const groupItems = groups[groupName];
                    const groupTotal = groupItems.reduce((sum, i) => sum + (i.amount || 0), 0);

                    renderGroupHeader(groupName);
                    renderGroupRows(groupItems);
                    renderSubtotalRow(`Total ${groupName}`, groupTotal, sectionColor);
                    currentY += (gIndex < groupNames.length - 1) ? 18 : 14;
                });
            }

            ensureSpace(26);
            doc.moveTo(leftMargin, currentY)
               .lineTo(rightMargin, currentY)
               .strokeColor(sectionColor)
               .lineWidth(1)
               .stroke();
            currentY += 4;

            doc.rect(leftMargin, currentY, printableWidth, 20).fill("#F9FAFB");
            doc.fontSize(9).font("Helvetica-Bold").fillColor(primaryColor)
               .text(totalLabel.toUpperCase(), leftMargin + 8, currentY + 5);
            doc.fontSize(9.5).font("Helvetica-Bold").fillColor(sectionColor)
               .text(`$${formatCurrency(totalValue)}`, rightMargin - 140, currentY + 4, { width: 140, align: "right" });
            currentY += 30;
        };

        // ── ASSETS RENDERING ──────────────────────────────────────────────────
        ensureSpace(30);
        doc.rect(leftMargin, currentY - 2, printableWidth, 20).fill(accentColor);
        doc.fontSize(10.5).font("Helvetica-Bold").fillColor("#FFFFFF")
           .text("ASSETS", leftMargin + 8, currentY + 3);
        currentY += 24;

        const assetsList = reportData.assets || [];
        const cashAccounts = assetsList.filter(a => classifyAsset(a) === 'cash');
        const bankAccounts = assetsList.filter(a => classifyAsset(a) === 'bank');
        const arAccounts = assetsList.filter(a => classifyAsset(a) === 'ar');
        const inputTaxAccounts = assetsList.filter(a => classifyAsset(a) === 'input_tax');
        const otherCurrentAccounts = assetsList.filter(a => classifyAsset(a) === 'other');
        const fixedAccounts = assetsList.filter(a => classifyAsset(a) === 'fixed');
        const otherAssetAccounts = assetsList.filter(a => classifyAsset(a) === 'other_asset');

        const cashTotal = cashAccounts.reduce((sum, a) => sum + (a.amount || 0), 0);
        const bankTotal = bankAccounts.reduce((sum, a) => sum + (a.amount || 0), 0);
        const cashAndEquivalentsTotal = cashTotal + bankTotal;
        const arTotal = arAccounts.reduce((sum, a) => sum + (a.amount || 0), 0);
        const inputTaxTotal = inputTaxAccounts.reduce((sum, a) => sum + (a.amount || 0), 0);
        const otherCurrentTotal = otherCurrentAccounts.reduce((sum, a) => sum + (a.amount || 0), 0);
        const currentAssetsTotal = cashAndEquivalentsTotal + arTotal + inputTaxTotal + otherCurrentTotal;
        const fixedTotal = fixedAccounts.reduce((sum, a) => sum + (a.amount || 0), 0);
        const otherAssetTotal = otherAssetAccounts.reduce((sum, a) => sum + (a.amount || 0), 0);
        const nonCurrentAssetsTotal = fixedTotal + otherAssetTotal;

        // Current Assets Header
        ensureSpace(20);
        doc.fontSize(9.5).font("Helvetica-Bold").fillColor(primaryColor)
           .text("Current Assets", leftMargin + 2, currentY);
        currentY += 14;

        // Cash Group
        if (cashAccounts.length > 0) {
            renderGroupHeader("Cash");
            renderGroupRows(cashAccounts);
            renderSubtotalRow("Total for Cash", cashTotal);
            currentY += 6;
        }

        // Bank Group
        if (bankAccounts.length > 0) {
            renderGroupHeader("Bank");
            renderGroupRows(bankAccounts);
            renderSubtotalRow("Total for Bank", bankTotal);
            currentY += 6;
        }

        // Cash & Cash Equivalents Summary Row
        if (cashAccounts.length > 0 || bankAccounts.length > 0) {
            renderSubtotalRow("Total for Cash and Cash Equivalents", cashAndEquivalentsTotal, primaryColor, true);
            currentY += 8;
        }

        // Accounts Receivable Group
        if (arAccounts.length > 0) {
            renderGroupHeader("Accounts Receivable");
            renderGroupRows(arAccounts);
            renderSubtotalRow("Total for Accounts Receivable", arTotal, primaryColor, true);
            currentY += 8;
        }

        // Input Tax Group (kept separate)
        if (inputTaxAccounts.length > 0) {
            renderGroupHeader("Input Tax");
            renderGroupRows(inputTaxAccounts);
            renderSubtotalRow("Total for Input Tax", inputTaxTotal, primaryColor, true);
            currentY += 8;
        }

        // Other Current Assets Group (kept separate)
        if (otherCurrentAccounts.length > 0) {
            renderGroupHeader("Other Current Assets");
            renderGroupRows(otherCurrentAccounts);
            renderSubtotalRow("Total for Other Current Assets", otherCurrentTotal, primaryColor, true);
            currentY += 8;
        }

        // Grand Total Current Assets Row
        renderSubtotalRow("Total for Current Assets", currentAssetsTotal, accentColor, true);
        currentY += 18;

        // Non Current Assets Header
        ensureSpace(20);
        doc.fontSize(9.5).font("Helvetica-Bold").fillColor(primaryColor)
           .text("Non Current Assets", leftMargin + 2, currentY);
        currentY += 14;

        // Fixed Assets Group
        if (fixedAccounts.length > 0) {
            renderGroupHeader("Fixed Assets");
            renderGroupRows(fixedAccounts);
            renderSubtotalRow("Total for Fixed Assets", fixedTotal, primaryColor, true);
            currentY += 8;
        }

        // Other Assets Group
        if (otherAssetAccounts.length > 0) {
            renderGroupHeader("Other Assets");
            renderGroupRows(otherAssetAccounts);
            renderSubtotalRow("Total for Other Assets", otherAssetTotal, primaryColor, true);
            currentY += 8;
        }

        // Total Non Current Assets Row
        renderSubtotalRow("Total for Non Current Assets", nonCurrentAssetsTotal, primaryColor, true);
        currentY += 16;


        // Grand Total ASSETS Bar
        ensureSpace(26);
        doc.moveTo(leftMargin, currentY)
           .lineTo(rightMargin, currentY)
           .strokeColor(accentColor)
           .lineWidth(1.2)
           .stroke();
        currentY += 4;

        doc.rect(leftMargin, currentY, printableWidth, 20).fill("#F9FAFB");
        doc.fontSize(9).font("Helvetica-Bold").fillColor(primaryColor)
           .text("TOTAL ASSETS", leftMargin + 8, currentY + 5);
        doc.fontSize(9.5).font("Helvetica-Bold").fillColor(accentColor)
           .text(`$${formatCurrency(reportData.assetsTotal || 0)}`, rightMargin - 140, currentY + 4, { width: 140, align: "right" });
        currentY += 30;

        // ── LIABILITIES RENDERING ─────────────────────────────────────────────
        renderGroupedSection(
            "LIABILITIES",
            "#EF4444",
            reportData.liabilities || [],
            "Total Liabilities",
            reportData.liabilitiesTotal || 0
        );

        // ── EQUITY RENDERING ──────────────────────────────────────────────────
        renderGroupedSection(
            "EQUITY",
            "#3B82F6",
            reportData.equity || [],
            "Total Equity",
            reportData.equityTotal || 0
        );


        // ── TOTAL LIABILITIES + EQUITY summary bar ────────────────────────────
        ensureSpace(40);
        const liabilitiesPlusEquityVal = (reportData.liabilitiesTotal || 0) + (reportData.equityTotal || 0);

        doc.moveTo(leftMargin, currentY)
           .lineTo(rightMargin, currentY)
           .strokeColor(borderMain)
           .lineWidth(1)
           .stroke();
        currentY += 10;

        doc.fillColor("#111827")
           .rect(leftMargin, currentY, printableWidth, 36)
           .fill();

        doc.fillColor("#FFFFFF")
           .fontSize(9)
           .font("Helvetica-Bold")
           .text("TOTAL FOR LIABILITIES + EQUITY", leftMargin + 15, currentY + 12);

        doc.fontSize(11)
           .font("Helvetica-Bold")
           .text(`$${formatCurrency(liabilitiesPlusEquityVal)}`, rightMargin - 165, currentY + 10, { width: 165, align: "right" });

        currentY += 36;
    } // end Balance Sheet else block


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
