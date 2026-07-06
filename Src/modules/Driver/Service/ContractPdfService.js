const PDFDocument = require("pdfkit");
const path = require("path");

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
    return d.toLocaleDateString("en-US", { dateStyle: "long" });
};

exports.generateContractPdf = (driver, vehicle, res) => {
    if (!driver) {
        throw new Error("No driver data provided");
    }

    const doc = new PDFDocument({ 
        size: "A4", 
        margin: 50,
        info: {
            Title: `Lease Agreement - ${driver.personalInfo?.fullName || "Driver"}`,
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

    const leftMargin = 50;
    const rightMargin = 545;
    const rightColX = 350;

    // Logo integration
    try {
        const logoPath = path.join(__dirname, "../../../assests/olaCars02.jpeg");
        doc.image(logoPath, 50, 45, { height: 40 });
    } catch (err) {
        console.error("Failed to load logo image in PDF generation:", err);
    }

    doc.fontSize(16)
       .fillColor(primaryColor)
       .text("VEHICLE LEASE AGREEMENT", rightColX - 100, 58, { align: "right", width: 295, bold: true });

    doc.moveTo(leftMargin, 95)
       .lineTo(rightMargin, 95)
       .strokeColor(borderMain)
       .stroke();

    // Section 1: Parties to the Agreement
    let contentY = 115;
    doc.fontSize(11).fillColor(primaryColor).text("1. PARTIES TO THE AGREEMENT", leftMargin, contentY, { bold: true });
    
    contentY += 18;
    doc.fontSize(9.5).fillColor(primaryColor)
       .text("LESSOR:", leftMargin, contentY, { bold: true })
       .font("Helvetica")
       .text("Ola Cars Logistics Limited, operating branch: " + (driver.branch?.name || "Corporate Registry") + " (" + (driver.branch?.city || "N/A") + ")", leftMargin + 60, contentY)
       .font("Helvetica-Bold")
       .text("LESSEE:", leftMargin, contentY + 16, { bold: true })
       .font("Helvetica")
       .text(`${driver.personalInfo?.fullName || "N/A"} (Driver ID: ${driver.driverId || "N/A"})`, leftMargin + 60, contentY + 16);

    // Personal & License Details
    contentY += 40;
    doc.fontSize(8.5).fillColor(secondaryColor).text("LESSEE PERSONAL DETAILS:", leftMargin, contentY, { bold: true });
    doc.text("DRIVING LICENSE DETAILS:", rightColX, contentY, { bold: true });

    contentY += 12;
    doc.fontSize(9).fillColor(primaryColor)
       .text(`Email: ${driver.personalInfo?.email || "N/A"}`, leftMargin, contentY)
       .text(`Phone: ${driver.personalInfo?.phone || "N/A"}`, leftMargin, contentY + 14)
       .text(`DOB: ${formatDate(driver.personalInfo?.dateOfBirth)}`, leftMargin, contentY + 28)
       .text(`ID No: ${driver.identityDocs?.idNumber || "N/A"} (${driver.identityDocs?.idType || "N/A"})`, leftMargin, contentY + 42);

    doc.text(`License No: ${driver.drivingLicense?.licenseNumber || "N/A"}`, rightColX, contentY)
       .text(`Expiry Date: ${formatDate(driver.drivingLicense?.expiryDate)}`, rightColX, contentY + 14)
       .text(`Categories: ${driver.drivingLicense?.categories?.join(", ") || "N/A"}`, rightColX, contentY + 28);

    contentY += 65;
    doc.moveTo(leftMargin, contentY)
       .lineTo(rightMargin, contentY)
       .strokeColor(borderMain)
       .stroke();

    // Section 2: Leased Asset (Vehicle) details
    contentY += 15;
    doc.fontSize(11).fillColor(primaryColor).text("2. DESCRIPTION OF LEASED VEHICLE", leftMargin, contentY, { bold: true });

    contentY += 18;
    if (vehicle) {
        doc.fontSize(9).fillColor(primaryColor);
        doc.text(`Vehicle Make & Model: ${vehicle.basicDetails?.make || "N/A"} ${vehicle.basicDetails?.model || "N/A"} (${vehicle.basicDetails?.year || "N/A"})`, leftMargin, contentY)
           .text(`Color: ${vehicle.basicDetails?.colour || "N/A"}`, leftMargin, contentY + 14)
           .text(`Registration No (Plate): ${vehicle.legalDocs?.registrationNumber || vehicle.basicDetails?.registrationNumber || "N/A"}`, leftMargin, contentY + 28);

        doc.text(`VIN/Chassis Number: ${vehicle.basicDetails?.vin || "N/A"}`, rightColX, contentY)
           .text(`Engine Number: ${vehicle.basicDetails?.engineNumber || "N/A"}`, rightColX, contentY + 14)
           .text(`Odometer (Start): ${vehicle.maintenanceDetails?.currentOdometer || "0"} KM`, rightColX, contentY + 28);
    } else {
        doc.fontSize(9.5).fillColor(secondaryColor).italic().text("No physical vehicle currently bound to this contract. Asset assignment is pending delivery confirmation.", leftMargin, contentY);
    }

    contentY += 50;
    doc.moveTo(leftMargin, contentY)
       .lineTo(rightMargin, contentY)
       .strokeColor(borderMain)
       .stroke();

    // Section 3: Financial Rent Plan Terms
    contentY += 15;
    doc.fontSize(11).fillColor(primaryColor).text("3. LEASE PAYMENT PLAN & FINANCIAL TERMS", leftMargin, contentY, { bold: true });

    contentY += 18;
    const isWeekly = driver.rentTracking && driver.rentTracking.length > 0;
    const rentVal = isWeekly ? driver.rentTracking[0].amount : 0;
    const duration = isWeekly ? driver.rentTracking.length : 0;
    const totalContractValue = rentVal * duration;
    
    // Deposit amount calculation
    const depositPayment = driver.additionalPayments?.find(p => p.type === "DEPOSIT");
    const depositAmount = depositPayment ? depositPayment.amount : 0;

    doc.fontSize(9).fillColor(primaryColor)
       .text(`Billing Mode: ${isWeekly ? "Weekly Lease Model" : "Standard Cycle Billing"}`, leftMargin, contentY)
       .text(`Billing Term Duration: ${duration} Cycles`, leftMargin, contentY + 14)
       .text(`Security Deposit / Down Payment: $${formatCurrency(depositAmount)}`, leftMargin, contentY + 28);

    doc.text(`Recurring Rate: $${formatCurrency(rentVal)} per cycle`, rightColX, contentY)
       .text(`Total Estimated Lease Value: $${formatCurrency(totalContractValue)}`, rightColX, contentY + 14);

    contentY += 50;
    doc.moveTo(leftMargin, contentY)
       .lineTo(rightMargin, contentY)
       .strokeColor(borderMain)
       .stroke();

    // Section 4: Terms & Boilerplate (Fits on same page if formatted tightly)
    contentY += 15;
    doc.fontSize(11).fillColor(primaryColor).text("4. GENERAL TERMS & CONDITIONS", leftMargin, contentY, { bold: true });

    contentY += 18;
    doc.fontSize(7.5).fillColor(secondaryColor);
    
    const terms = [
        "1. PAYMENT SCHEDULE: The Lessee agrees to pay the Lessor the agreed recurring rate on or before the due date of each cycle. Failure to pay will result in automatic vehicle lock and repossession procedures.",
        "2. VEHICLE USAGE RESTRICTIONS: The Leased Vehicle is for personal or commercial driver-partner operations. It must not be operated by unauthorized drivers. Speed tracking and GPS monitoring are active at all times.",
        "3. DAMAGE & INSURANCE: In case of accidents, the Lessee must inform Lessor within 24 hours. The Lessee is responsible for insurance deductibles and any liability arising from negligent usage.",
        "4. MAINTENANCE & SERVICE: The vehicle must be brought to an authorized Ola Cars workshop for routine maintenance at the specified odometer intervals. Unauthorized repair work will void contract terms."
    ];

    terms.forEach((term, idx) => {
        doc.text(term, leftMargin, contentY, { width: 495 });
        contentY += 20;
    });

    contentY += 10;

    // Signatures
    doc.fontSize(8.5).fillColor(primaryColor)
       .text("IN WITNESS WHEREOF, the parties hereto execute this Vehicle Lease Agreement.", leftMargin, 630);

    // Lessor Signature
    doc.moveTo(leftMargin, 680)
       .lineTo(leftMargin + 180, 680)
       .strokeColor(primaryColor)
       .stroke();
    doc.fontSize(8).fillColor(secondaryColor)
       .text("For OLA CARS LOGISTICS (Lessor)", leftMargin, 688)
       .text("Authorized Registry Officer", leftMargin, 700);

    // Lessee Signature
    doc.moveTo(rightColX, 680)
       .lineTo(rightColX + 185, 680)
       .strokeColor(primaryColor)
       .stroke();
    doc.fontSize(8).fillColor(secondaryColor)
       .text(`LESSEE SIGNATURE: ${driver.personalInfo?.fullName || "Driver"}`, rightColX, 688)
       .text("Accepted & Signed Electronically", rightColX, 700);

    doc.end();
};
