const PDFDocument = require("pdfkit");
const path = require("path");

// Safe date formatter
const formatDate = (val) => {
    if (!val) return "N/A";
    const d = new Date(val);
    if (isNaN(d.getTime())) return "N/A";
    return d.toLocaleDateString("en-US", { dateStyle: "medium" });
};

exports.generateBranchPdf = (branchDetails, filters, res) => {
    const { branch, analytics, staff } = branchDetails;

    // A4 Portrait dimensions: 595 x 842
    const doc = new PDFDocument({
        size: "A4",
        margin: 40,
        info: {
            Title: `Branch Report - ${branch.name || "N/A"}`,
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
    const rightMargin = 555;
    const printableWidth = rightMargin - leftMargin;

    // Logo integration
    try {
        const logoPath = path.join(__dirname, "../../../assests/olaCars02.jpeg");
        doc.image(logoPath, leftMargin, 30, { height: 35 });
    } catch (err) {
        console.error("Failed to load logo image in PDF generation:", err);
    }

    doc.fontSize(12)
       .fillColor(primaryColor)
       .font("Helvetica-Bold")
       .text("BRANCH PERFORMANCE REPORT", 250, 42, { align: "right", width: 305 });

    doc.moveTo(leftMargin, 80)
       .lineTo(rightMargin, 80)
       .strokeColor(borderMain)
       .lineWidth(1)
       .stroke();

    // Meta / Filter criteria
    const metaY = 95;
    doc.fontSize(8).fillColor(secondaryColor).font("Helvetica-Bold").text("REPORT DETAILS:", leftMargin, metaY);
    doc.text("FILTER CRITERIA:", 300, metaY);

    const dateRangeStr = (filters.startDate || filters.endDate) 
        ? `${filters.startDate ? formatDate(filters.startDate) : "Beginning"} to ${filters.endDate ? formatDate(filters.endDate) : "Present"}`
        : "All-Time Dataset";

    doc.fontSize(8.5).fillColor(primaryColor).font("Helvetica");
    doc.text(`Generated Date: ${formatDate(new Date())}`, leftMargin, metaY + 12)
       .text(`Branch Code: ${branch.code || "N/A"}`, leftMargin, metaY + 24)
       .text(`Branch Status: ${branch.status || "ACTIVE"}`, leftMargin, metaY + 36);

    doc.text(`Period Bounds: ${dateRangeStr}`, 300, metaY + 12)
       .text(`Country / City: ${branch.country || "N/A"} / ${branch.city || "N/A"}`, 300, metaY + 24);

    doc.moveTo(leftMargin, 150)
       .lineTo(rightMargin, 150)
       .strokeColor(borderMain)
       .lineWidth(1)
       .stroke();

    // Two-Column Section: Branch Info & Branch Manager details
    let currentY = 165;
    doc.fontSize(10).font("Helvetica-Bold").fillColor(primaryColor).text("BRANCH INFORMATION", leftMargin, currentY);
    doc.text("BRANCH MANAGER", 300, currentY);
    currentY += 16;

    // Left Column Info
    doc.fontSize(8.5).font("Helvetica").fillColor(secondaryColor);
    doc.text("Address:", leftMargin, currentY, { bold: true });
    doc.text(`${branch.address || "N/A"},\n${branch.city || ""}, ${branch.state || ""}, ${branch.country || ""}`, leftMargin, currentY + 12, { width: 230 });
    doc.text(`Phone: ${branch.phone || "N/A"}`, leftMargin, currentY + 50);
    doc.text(`Email: ${branch.email || "N/A"}`, leftMargin, currentY + 62);

    // Right Column Info
    const manager = branch.branchManager;
    if (manager) {
        const managerName = typeof manager === "object" ? manager.fullName : "N/A";
        const managerEmail = typeof manager === "object" ? manager.email : "N/A";
        doc.text("Manager Name:", 300, currentY);
        doc.fontSize(9).font("Helvetica-Bold").fillColor(primaryColor).text(managerName, 300, currentY + 12);
        doc.fontSize(8.5).font("Helvetica").fillColor(secondaryColor).text(`Email: ${managerEmail}`, 300, currentY + 26);
        doc.text(`Phone: ${branch.phone || "N/A"}`, 300, currentY + 38);
    } else {
        doc.font("Helvetica-Oblique").text("No Manager assigned to this branch.", 300, currentY + 12);
    }

    currentY += 85;
    doc.moveTo(leftMargin, currentY)
       .lineTo(rightMargin, currentY)
       .strokeColor(borderMain)
       .lineWidth(1)
       .stroke();

    // Operational KPI blocks
    currentY += 15;
    doc.fontSize(10).font("Helvetica-Bold").fillColor(primaryColor).text("OPERATIONAL KEY PERFORMANCE INDICATORS", leftMargin, currentY);
    currentY += 20;

    const blockWidth = 95;
    const blockGap = 10;
    const blockHeight = 45;
    const kpis = [
        { label: "Drivers Onboarded", value: analytics.driverStats.onboarded, color: accentColor },
        { label: "Active Drivers", value: analytics.driverStats.active, color: alertGreen },
        { label: "Active Vehicles", value: analytics.vehicleStats.active, color: "#3B82F6" },
        { label: "Tasks Completed", value: analytics.taskSummary.completed, color: "#8B5CF6" },
        { label: "Tasks Pending", value: analytics.taskSummary.pending, color: alertYellow }
    ];

    kpis.forEach((kpi, idx) => {
        const xPos = leftMargin + idx * (blockWidth + blockGap);
        // Draw block border
        doc.rect(xPos, currentY, blockWidth, blockHeight)
           .strokeColor(borderMain)
           .lineWidth(1)
           .stroke();

        // Color Accent strip
        doc.rect(xPos, currentY, blockWidth, 4)
           .fillColor(kpi.color)
           .fill();

        // Label
        doc.fillColor(secondaryColor)
           .fontSize(7.5)
           .font("Helvetica-Bold")
           .text(kpi.label.toUpperCase(), xPos + 5, currentY + 8, { width: blockWidth - 10, align: "center" });

        // Value
        doc.fillColor(primaryColor)
           .fontSize(14)
           .font("Helvetica-Bold")
           .text(kpi.value.toString(), xPos + 5, currentY + 22, { width: blockWidth - 10, align: "center" });
    });

    currentY += blockHeight + 20;
    doc.moveTo(leftMargin, currentY)
       .lineTo(rightMargin, currentY)
       .strokeColor(borderMain)
       .lineWidth(1)
       .stroke();

    // Staff Roster section
    currentY += 15;
    doc.fontSize(10).font("Helvetica-Bold").fillColor(primaryColor).text("STAFF PERFORMANCE PROFILE & ROSTER", leftMargin, currentY);
    currentY += 16;

    // Helper to draw staff table headers
    const drawStaffTableHeaders = (y) => {
        doc.fillColor(primaryColor)
           .fontSize(8)
           .font("Helvetica-Bold");

        doc.text("Personnel / Contact", 40, y, { width: 180 })
           .text("Role", 230, y, { width: 100 })
           .text("Tasks", 340, y, { width: 60, align: "center" })
           .text("Success Rate", 410, y, { width: 60, align: "center" })
           .text("Status", 480, y, { width: 75, align: "center" });

        doc.moveTo(leftMargin, y + 14)
           .lineTo(rightMargin, y + 14)
           .strokeColor(primaryColor)
           .lineWidth(1)
           .stroke();

        return y + 20;
    };

    currentY = drawStaffTableHeaders(currentY);

    let isStripe = false;
    staff.forEach((person) => {
        // Page break check (Portrait height is 842 pt, break at 760 pt)
        if (currentY > 750) {
            doc.addPage();
            currentY = drawStaffTableHeaders(50);
        }

        // Zebra stripe
        if (isStripe) {
            doc.fillColor(stripeBg)
               .rect(leftMargin, currentY, printableWidth, 24)
               .fill();
        }

        doc.fillColor(primaryColor)
           .fontSize(8)
           .font("Helvetica");

        const successRate = person.analytics.totalTasks > 0
            ? Math.round((person.analytics.completedTasks / person.analytics.totalTasks) * 100)
            : 0;

        // Render Personnel Details (Spaced on two lines: Name & Email)
        doc.font("Helvetica-Bold")
           .text(person.fullName || "N/A", 40, currentY + 3, { width: 180, ellipsis: true })
           .font("Helvetica")
           .fontSize(7)
           .fillColor(secondaryColor)
           .text(person.email || "—", 40, currentY + 12, { width: 180 })
           .fontSize(8)
           .fillColor(primaryColor)
           // Role
           .text(person.role ? person.role.replace("STAFF", "") : "—", 230, currentY + 7, { width: 100 })
           // Tasks count
           .text(person.analytics.totalTasks.toString(), 340, currentY + 7, { width: 60, align: "center" });

        // Success Rate (%)
        let rateColor = alertRed;
        if (successRate > 70) rateColor = alertGreen;
        else if (successRate > 40) rateColor = alertYellow;

        doc.fillColor(rateColor)
           .font("Helvetica-Bold")
           .text(`${successRate}%`, 410, currentY + 7, { width: 60, align: "center" })
           .fillColor(primaryColor)
           .font("Helvetica");

        // Status
        const statusStr = person.status || "ACTIVE";
        doc.fillColor(statusStr === "ACTIVE" ? alertGreen : alertRed)
           .font("Helvetica-Bold")
           .text(statusStr, 480, currentY + 7, { width: 75, align: "center" });

        // Draw divider line below
        doc.moveTo(leftMargin, currentY + 24)
           .lineTo(rightMargin, currentY + 24)
           .strokeColor(borderMain)
           .lineWidth(0.5)
           .stroke();

        currentY += 24;
        isStripe = !isStripe;
    });

    if (staff.length === 0) {
        doc.font("Helvetica-Oblique")
           .fontSize(9)
           .fillColor(secondaryColor)
           .text("No personnel records currently mapped to this branch.", leftMargin + 10, currentY + 15, { align: "center" });
    }

    // Footnotes / Footer
    const footerY = 800;
    doc.moveTo(leftMargin, footerY - 10)
       .lineTo(rightMargin, footerY - 10)
       .strokeColor(borderMain)
       .lineWidth(0.5)
       .stroke();

    doc.fontSize(7)
       .fillColor(secondaryColor)
       .font("Helvetica")
       .text("This report is system-generated and summarizes verified personnel performance and fleet assets records.", leftMargin, footerY);

    doc.fontSize(7)
       .text("Ola Cars Group. All rights reserved.", rightMargin - 200, footerY, { width: 200, align: "right" });

    doc.end();
};
