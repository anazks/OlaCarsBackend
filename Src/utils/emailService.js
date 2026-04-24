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

module.exports = { sendOTP };
