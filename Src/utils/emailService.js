const nodemailer = require("nodemailer");

// ─── Nodemailer Transporter ─────────────────────────────────────────
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: parseInt(process.env.SMTP_PORT || "587"),
    secure: false, // true for 465, false for other ports
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});

/**
 * Send OTP email to driver for login verification.
 * @param {string} email - Recipient email
 * @param {string} otp - 6-digit OTP code
 * @param {string} fullName - Driver's full name (for personalization)
 */
const sendOTP = async (email, otp, fullName = "Driver") => {
    const mailOptions = {
        from: `"Ola Cars" <${process.env.SMTP_USER || "noreply@olacars.com"}>`,
        to: email,
        subject: "🔐 Your Ola Cars Login Verification Code",
        html: `
            <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 480px; margin: 0 auto; background: #0A0A0A; border-radius: 16px; overflow: hidden; border: 1px solid #222;">
                <!-- Header -->
                <div style="background: linear-gradient(135deg, #D2EE00 0%, #b8cc00 100%); padding: 32px 24px; text-align: center;">
                    <h1 style="margin: 0; font-size: 24px; font-weight: 900; color: #0A0A0A; letter-spacing: -0.5px;">OLA CARS</h1>
                    <p style="margin: 4px 0 0; font-size: 12px; color: #0A0A0A; opacity: 0.7; text-transform: uppercase; letter-spacing: 2px;">Driver Portal</p>
                </div>
                
                <!-- Body -->
                <div style="padding: 32px 24px;">
                    <p style="color: #ffffff; font-size: 16px; margin: 0 0 8px;">Hi <strong>${fullName}</strong>,</p>
                    <p style="color: #8E8E93; font-size: 14px; margin: 0 0 24px; line-height: 1.5;">Use the verification code below to complete your login. This code expires in <strong style="color: #D2EE00;">5 minutes</strong>.</p>
                    
                    <!-- OTP Box -->
                    <div style="background: #151515; border: 2px solid #D2EE00; border-radius: 12px; padding: 24px; text-align: center; margin: 0 0 24px;">
                        <p style="margin: 0 0 8px; font-size: 11px; text-transform: uppercase; letter-spacing: 3px; color: #8E8E93; font-weight: 700;">Verification Code</p>
                        <p style="margin: 0; font-size: 36px; font-weight: 900; color: #D2EE00; letter-spacing: 12px; font-family: 'Courier New', monospace;">${otp}</p>
                    </div>
                    
                    <p style="color: #8E8E93; font-size: 12px; margin: 0; line-height: 1.5;">If you didn't request this code, please ignore this email. Do not share this code with anyone.</p>
                </div>
                
                <!-- Footer -->
                <div style="padding: 16px 24px; border-top: 1px solid #222; text-align: center;">
                    <p style="color: #555; font-size: 11px; margin: 0;">© ${new Date().getFullYear()} Ola Cars. All rights reserved.</p>
                </div>
            </div>
        `,
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log(`✅ OTP email sent to ${email}: ${info.messageId}`);
        return true;
    } catch (error) {
        console.error(`❌ Failed to send OTP email to ${email}:`, error.message);
        throw new Error("Failed to send verification email. Please try again.");
    }
};

// ─── Reusable HTML Wrapper for Premium Aesthetics ──────────────────────
const getHtmlWrapper = (title, bodyContent, branchAddress = "", branchManagerName = "") => {
    const formattedAddress = branchAddress || "Ola Cars Panama Headquarters";
    const formattedManager = branchManagerName || "Ola Cars Management Team";
    return `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 580px; margin: 0 auto; background: #0A0A0A; border-radius: 16px; overflow: hidden; border: 1px solid #222; color: #ffffff;">
            <!-- Header -->
            <div style="background: linear-gradient(135deg, #D2EE00 0%, #b8cc00 100%); padding: 32px 24px; text-align: center;">
                <h1 style="margin: 0; font-size: 26px; font-weight: 900; color: #0A0A0A; letter-spacing: -0.5px;">OLA CARS</h1>
                <p style="margin: 4px 0 0; font-size: 11px; color: #0A0A0A; opacity: 0.8; text-transform: uppercase; letter-spacing: 3px; font-weight: 700;">Driver Billing Services</p>
            </div>
            
            <!-- Body -->
            <div style="padding: 32px 24px;">
                ${bodyContent}
            </div>
            
            <!-- Footer -->
            <div style="padding: 24px; border-top: 1px solid #222; background: #070707; font-size: 11px; color: #8E8E93; line-height: 1.6;">
                <div style="text-align: center; margin-bottom: 20px;">
                    <img src="https://olacarspanama.com/assets/fevicon.png" alt="Ola Cars Logo" style="width: 32px; height: 32px; filter: drop-shadow(0 0 4px rgba(210,238,0,0.5));" onerror="this.onerror=null; this.src='https://i.imgur.com/KUp2nqy.png';" />
                    <p style="margin: 8px 0 0; font-size: 12px; font-weight: 700; color: #D2EE00; letter-spacing: 1px;">OLA CARS PANAMA</p>
                </div>
                
                <table style="width: 100%; border-collapse: collapse; font-size: 11px; color: #8E8E93;">
                    <tr>
                        <td style="padding: 4px 0; vertical-align: top; width: 35%;"><strong>Branch Manager:</strong></td>
                        <td style="padding: 4px 0; color: #ffffff;">${formattedManager}</td>
                    </tr>
                    <tr>
                        <td style="padding: 4px 0; vertical-align: top;"><strong>Branch Address:</strong></td>
                        <td style="padding: 4px 0; color: #ffffff;">${formattedAddress}</td>
                    </tr>
                    <tr>
                        <td style="padding: 4px 0; vertical-align: top;"><strong>Support Channels:</strong></td>
                        <td style="padding: 4px 0; color: #ffffff;">
                            📞 +507 6499-8950<br/>
                            📞 +507 6863-1294<br/>
                            📞 +507 6449-9002<br/>
                            📞 +507 6822-8393
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 4px 0; vertical-align: top;"><strong>Finance Contacts:</strong></td>
                        <td style="padding: 4px 0; color: #ffffff;">
                            ✉️ administracion@olacarspanama.com<br/>
                            ✉️ contabilidad@olacarspanama.com<br/>
                            ✉️ suraj@wgroup.co
                        </td>
                    </tr>
                </table>
                
                <div style="border-top: 1px solid #1c1c1c; margin-top: 20px; padding-top: 16px; text-align: center; color: #444;">
                    <p style="margin: 0 0 4px;">This is an automated operational notification regarding your rental contract. Please do not reply directly to this mail.</p>
                    <p style="margin: 0;">© ${new Date().getFullYear()} Ola Cars. All rights reserved.</p>
                </div>
            </div>
        </div>
    `;
};

/**
 * Send rent invoice created email to driver.
 */
const sendInvoiceCreatedEmail = async (email, invoice, fullName, branchAddress, branchManagerName) => {
    const htmlContent = getHtmlWrapper(
        "New Rent Invoice Issued",
        `
        <p style="color: #ffffff; font-size: 16px; margin: 0 0 8px;">Hi <strong>${fullName}</strong>,</p>
        <p style="color: #8E8E93; font-size: 14px; margin: 0 0 24px; line-height: 1.5;">A new weekly rent invoice has been generated for your contract. Please find the details summarized below:</p>
        
        <div style="background: #151515; border-radius: 12px; padding: 20px; margin: 0 0 24px; border: 1px solid #222;">
            <table style="width: 100%; border-collapse: collapse; font-size: 13px; color: #ffffff;">
                <tr style="border-bottom: 1px solid #222;">
                    <td style="padding: 8px 0; color: #8E8E93;">Invoice Number:</td>
                    <td style="padding: 8px 0; font-weight: bold; text-align: right;">${invoice.invoiceNumber}</td>
                </tr>
                <tr style="border-bottom: 1px solid #222;">
                    <td style="padding: 8px 0; color: #8E8E93;">Billing Period:</td>
                    <td style="padding: 8px 0; font-weight: bold; text-align: right;">${invoice.weekLabel || 'Weekly Rent'}</td>
                </tr>
                <tr style="border-bottom: 1px solid #222;">
                    <td style="padding: 8px 0; color: #8E8E93;">Base Rent Amount:</td>
                    <td style="padding: 8px 0; font-weight: bold; text-align: right; color: #D2EE00;">$${invoice.baseAmount.toFixed(2)}</td>
                </tr>
                ${invoice.carryOverAmount > 0 ? `
                <tr style="border-bottom: 1px solid #222;">
                    <td style="padding: 8px 0; color: #8E8E93;">Carry-over Balance:</td>
                    <td style="padding: 8px 0; font-weight: bold; text-align: right; color: #ff5252;">$${invoice.carryOverAmount.toFixed(2)}</td>
                </tr>` : ''}
                <tr style="border-bottom: 1px solid #222;">
                    <td style="padding: 8px 0; color: #8E8E93;">Total Amount Due:</td>
                    <td style="padding: 8px 0; font-weight: 900; text-align: right; color: #D2EE00; font-size: 16px;">$${invoice.totalAmountDue.toFixed(2)}</td>
                </tr>
                <tr>
                    <td style="padding: 8px 0; color: #8E8E93;">Due Date:</td>
                    <td style="padding: 8px 0; font-weight: bold; text-align: right; color: #D2EE00;">${new Date(invoice.dueDate).toLocaleDateString('en-US', { dateStyle: 'long' })}</td>
                </tr>
            </table>
        </div>
        
        <p style="color: #8E8E93; font-size: 13px; margin: 0 0 16px; line-height: 1.5;">Please ensure the payment is completed on or before the due date to avoid late fees or account restrictions. If you have active prepayment credit on your profile, it will be automatically applied.</p>
        `,
        branchAddress,
        branchManagerName
    );

    const mailOptions = {
        from: `"Ola Cars" <${process.env.SMTP_USER || "noreply@olacars.com"}>`,
        to: email,
        subject: `📄 New Rent Invoice Issued - ${invoice.invoiceNumber}`,
        html: htmlContent,
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`[EmailService] Rent invoice creation email sent to ${email} for invoice ${invoice.invoiceNumber}`);
        return true;
    } catch (error) {
        console.error(`[EmailService] Failed to send rent invoice creation email to ${email}:`, error.message);
        return false;
    }
};

/**
 * Send rent due reminder email to driver (3 days before due date).
 */
const sendInvoiceReminderEmail = async (email, invoice, fullName, branchAddress, branchManagerName) => {
    const htmlContent = getHtmlWrapper(
        "Rent Due Reminder",
        `
        <p style="color: #ffffff; font-size: 16px; margin: 0 0 8px;">Hi <strong>${fullName}</strong>,</p>
        <p style="color: #8E8E93; font-size: 14px; margin: 0 0 24px; line-height: 1.5;">This is a friendly reminder that your weekly rent invoice is due in <strong style="color: #D2EE00;">3 days</strong>. Please verify the payment details below:</p>
        
        <div style="background: #151515; border-radius: 12px; padding: 20px; margin: 0 0 24px; border: 1px solid #222;">
            <table style="width: 100%; border-collapse: collapse; font-size: 13px; color: #ffffff;">
                <tr style="border-bottom: 1px solid #222;">
                    <td style="padding: 8px 0; color: #8E8E93;">Invoice Number:</td>
                    <td style="padding: 8px 0; font-weight: bold; text-align: right;">${invoice.invoiceNumber}</td>
                </tr>
                <tr style="border-bottom: 1px solid #222;">
                    <td style="padding: 8px 0; color: #8E8E93;">Billing Period:</td>
                    <td style="padding: 8px 0; font-weight: bold; text-align: right;">${invoice.weekLabel || 'Weekly Rent'}</td>
                </tr>
                <tr style="border-bottom: 1px solid #222;">
                    <td style="padding: 8px 0; color: #8E8E93;">Total Amount Due:</td>
                    <td style="padding: 8px 0; font-weight: bold; text-align: right;">$${invoice.totalAmountDue.toFixed(2)}</td>
                </tr>
                <tr style="border-bottom: 1px solid #222;">
                    <td style="padding: 8px 0; color: #8E8E93;">Remaining Balance:</td>
                    <td style="padding: 8px 0; font-weight: 900; text-align: right; color: #D2EE00; font-size: 16px;">$${invoice.balance.toFixed(2)}</td>
                </tr>
                <tr>
                    <td style="padding: 8px 0; color: #8E8E93;">Due Date:</td>
                    <td style="padding: 8px 0; font-weight: bold; text-align: right; color: #D2EE00;">${new Date(invoice.dueDate).toLocaleDateString('en-US', { dateStyle: 'long' })}</td>
                </tr>
            </table>
        </div>
        
        <p style="color: #8E8E93; font-size: 13px; margin: 0 0 16px; line-height: 1.5;">To prevent any disruption to your vehicle's status, please make sure your account is funded or transfer the due amount. If you have already made this payment, please disregard this reminder.</p>
        `,
        branchAddress,
        branchManagerName
    );

    const mailOptions = {
        from: `"Ola Cars" <${process.env.SMTP_USER || "noreply@olacars.com"}>`,
        to: email,
        subject: `⏰ Reminder: Rent Invoice Due in 3 Days - ${invoice.invoiceNumber}`,
        html: htmlContent,
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`[EmailService] Rent invoice 3d reminder email sent to ${email} for invoice ${invoice.invoiceNumber}`);
        return true;
    } catch (error) {
        console.error(`[EmailService] Failed to send rent invoice 3d reminder email to ${email}:`, error.message);
        return false;
    }
};

/**
 * Send rent due today email to driver.
 */
const sendInvoiceDueTodayEmail = async (email, invoice, fullName, branchAddress, branchManagerName) => {
    const htmlContent = getHtmlWrapper(
        "Rent Due Today",
        `
        <p style="color: #ffffff; font-size: 16px; margin: 0 0 8px;">Hi <strong>${fullName}</strong>,</p>
        <p style="color: #8E8E93; font-size: 14px; margin: 0 0 24px; line-height: 1.5;">Please be informed that your weekly rent payment is <strong style="color: #D2EE00;">DUE TODAY</strong>. To keep your vehicle active and in good standing, please settle the outstanding balance:</p>
        
        <div style="background: #151515; border-radius: 12px; padding: 20px; margin: 0 0 24px; border: 1px solid #222;">
            <table style="width: 100%; border-collapse: collapse; font-size: 13px; color: #ffffff;">
                <tr style="border-bottom: 1px solid #222;">
                    <td style="padding: 8px 0; color: #8E8E93;">Invoice Number:</td>
                    <td style="padding: 8px 0; font-weight: bold; text-align: right;">${invoice.invoiceNumber}</td>
                </tr>
                <tr style="border-bottom: 1px solid #222;">
                    <td style="padding: 8px 0; color: #8E8E93;">Outstanding Balance:</td>
                    <td style="padding: 8px 0; font-weight: 900; text-align: right; color: #D2EE00; font-size: 18px;">$${invoice.balance.toFixed(2)}</td>
                </tr>
                <tr>
                    <td style="padding: 8px 0; color: #8E8E93;">Due Date:</td>
                    <td style="padding: 8px 0; font-weight: bold; text-align: right; color: #D2EE00;">Today, ${new Date(invoice.dueDate).toLocaleDateString('en-US', { dateStyle: 'long' })}</td>
                </tr>
            </table>
        </div>
        
        <p style="color: #8E8E93; font-size: 13px; margin: 0 0 16px; line-height: 1.5;">Please contact support or make a bank transfer immediately. Delayed payments will trigger automatic system deactivation warnings and potential late charges.</p>
        `,
        branchAddress,
        branchManagerName
    );

    const mailOptions = {
        from: `"Ola Cars" <${process.env.SMTP_USER || "noreply@olacars.com"}>`,
        to: email,
        subject: `⚡ Action Required: Rent Invoice Due Today - ${invoice.invoiceNumber}`,
        html: htmlContent,
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`[EmailService] Rent invoice due today email sent to ${email} for invoice ${invoice.invoiceNumber}`);
        return true;
    } catch (error) {
        console.error(`[EmailService] Failed to send rent invoice due today email to ${email}:`, error.message);
        return false;
    }
};

/**
 * Send vehicle recovery email to driver (when invoice becomes overdue).
 */
const sendVehicleRecoveryEmail = async (email, invoice, fullName, branchAddress, branchManagerName) => {
    const htmlContent = getHtmlWrapper(
        "Late Rent Payment & Vehicle Recovery Notice",
        `
        <p style="color: #ff5252; font-size: 18px; font-weight: 900; margin: 0 0 8px; text-transform: uppercase; letter-spacing: 0.5px;">⚠️ FINAL RECOVERY NOTICE</p>
        <p style="color: #ffffff; font-size: 15px; margin: 0 0 16px;">Dear <strong>${fullName}</strong>,</p>
        <p style="color: #e0e0e0; font-size: 14px; margin: 0 0 24px; line-height: 1.6;">Your weekly rent account is currently **OVERDUE** and your contract is in default. This is a formal notification that your vehicle has been flagged for repossession/recovery.</p>
        
        <div style="background: rgba(239, 68, 68, 0.1); border-radius: 12px; padding: 20px; margin: 0 0 24px; border: 1px solid rgba(239, 68, 68, 0.3);">
            <table style="width: 100%; border-collapse: collapse; font-size: 13px; color: #ffffff;">
                <tr style="border-bottom: 1px solid rgba(239, 68, 68, 0.2);">
                    <td style="padding: 8px 0; color: #ff8a80;">Invoice Number:</td>
                    <td style="padding: 8px 0; font-weight: bold; text-align: right;">${invoice.invoiceNumber}</td>
                </tr>
                <tr style="border-bottom: 1px solid rgba(239, 68, 68, 0.2);">
                    <td style="padding: 8px 0; color: #ff8a80;">Arrears Amount:</td>
                    <td style="padding: 8px 0; font-weight: 900; text-align: right; color: #ff5252; font-size: 18px;">$${invoice.balance.toFixed(2)}</td>
                </tr>
                <tr>
                    <td style="padding: 8px 0; color: #ff8a80;">Overdue Date:</td>
                    <td style="padding: 8px 0; font-weight: bold; text-align: right;">${new Date(invoice.dueDate).toLocaleDateString('en-US', { dateStyle: 'long' })}</td>
                </tr>
            </table>
        </div>
        
        <h3 style="color: #ff5252; font-size: 14px; font-weight: 800; margin: 0 0 10px; text-transform: uppercase;">Required Action:</h3>
        <p style="color: #e0e0e0; font-size: 13px; margin: 0 0 24px; line-height: 1.6;">
            1. **Settle your dues immediately** via bank transfer and send proof to the finance team.<br/>
            2. **Contact Branch Management immediately** at the numbers listed below to coordinate status normalization.<br/>
            3. **Failure to respond within 24 hours** will result in remote vehicle starter deactivation, GPS tracking coordinate sharing with recovery staff, and final legal enforcement procedures.
        </p>
        `,
        branchAddress,
        branchManagerName
    );

    const mailOptions = {
        from: `"Ola Cars" <${process.env.SMTP_USER || "noreply@olacars.com"}>`,
        to: email,
        subject: `⚠️ CRITICAL WARNING: Late Rent Payment & Vehicle Recovery Notice`,
        html: htmlContent,
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`[EmailService] Vehicle recovery email sent to ${email} for invoice ${invoice.invoiceNumber}`);
        return true;
    } catch (error) {
        console.error(`[EmailService] Failed to send vehicle recovery email to ${email}:`, error.message);
        return false;
    }
};

module.exports = {
    sendOTP,
    sendInvoiceCreatedEmail,
    sendInvoiceReminderEmail,
    sendInvoiceDueTodayEmail,
    sendVehicleRecoveryEmail
};
