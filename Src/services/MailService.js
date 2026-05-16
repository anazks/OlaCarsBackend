const nodemailer = require('nodemailer');
const EmailConfigModel = require('../modules/EmailConfig/Model/EmailConfigModel');

/**
 * MailService: Handles all system-wide email communications.
 * Priority: Uses EmailConfig from DB, falls back to .env credentials.
 */
class MailService {
    async getTransporter() {
        // Try to find the dedicated OUTGOING email in the system config
        const outgoingConfig = await EmailConfigModel.findOne({ purpose: 'OUTGOING', isActive: true });
        
        const user = outgoingConfig ? outgoingConfig.email : process.env.SYSTEM_EMAIL;
        const pass = outgoingConfig ? outgoingConfig.appPassword : process.env.SYSTEM_EMAIL_PASSWORD;

        if (!user || !pass) {
            console.warn('[MailService] Missing email credentials in DB and .env');
            return null;
        }

        return nodemailer.createTransport({
            service: 'gmail',
            auth: { user, pass }
        });
    }

    async sendEmail({ to, subject, html, purpose }) {
        try {
            const transporter = await this.getTransporter();
            if (!transporter) return false;

            // If a purpose is provided (e.g. GENERAL_ENQUIRY), we can override 'to' or 'from'
            // For general enquiry, we send TO the configured desk
            if (purpose) {
                const deskConfig = await EmailConfigModel.findOne({ purpose, isActive: true });
                if (deskConfig) {
                    to = deskConfig.email;
                }
            }

            const mailOptions = {
                from: transporter.options.auth.user,
                to,
                subject,
                html
            };

            const info = await transporter.sendMail(mailOptions);
            console.log('[MailService] Email sent:', info.messageId);
            return true;
        } catch (error) {
            console.error('[MailService] Error sending email:', error.message);
            return false;
        }
    }

    /**
     * Specifically handles new general enquiries from the driver app.
     * Uses a high-fidelity HTML structure.
     */
    async sendGeneralEnquiryAlert(enquiryData) {
        const brandLime = '#D4F12E';
        const brandBlack = '#0A0A0A';
        const brandIndigo = '#6366f1';
        
        const subject = `[ENQUIRY] New Customer Mission: ${enquiryData.name || 'Anonymous User'}`;
        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    body { margin: 0; padding: 0; background-color: #f4f7fb; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #1e293b; }
                    .wrapper { padding: 40px 20px; }
                    .container { max-width: 620px; margin: 0 auto; background: #ffffff; border-radius: 24px; overflow: hidden; box-shadow: 0 10px 40px rgba(15,23,42,0.06); }
                    .header { background: ${brandBlack}; padding: 32px 40px; display: flex; align-items: center; }
                    .logo-box { width: 36px; height: 36px; background: #ffffff; border-radius: 50%; display: inline-block; vertical-align: middle; border: 2px solid ${brandLime}; }
                    .logo-inner { width: 22px; height: 22px; background: #000; border-radius: 50%; margin: 7px; }
                    .logo-dot { width: 10px; height: 10px; background: ${brandLime}; border-radius: 50%; margin: 6px; }
                    .brand-name { color: #ffffff; font-size: 20px; font-weight: 800; text-transform: uppercase; letter-spacing: 2px; margin-left: 15px; display: inline-block; vertical-align: middle; }
                    .content { padding: 40px; }
                    .tag { display: inline-block; background: #eef2ff; color: ${brandIndigo}; font-size: 11px; font-weight: 700; padding: 8px 14px; border-radius: 999px; margin-bottom: 20px; text-transform: uppercase; letter-spacing: 1px; }
                    .title { font-size: 32px; font-weight: 800; line-height: 1.2; margin-bottom: 10px; color: #0f172a; }
                    .subtitle { font-size: 15px; line-height: 1.7; color: #64748b; margin-bottom: 35px; }
                    .info-card { background: #f8fafc; border-radius: 18px; padding: 25px; margin-bottom: 25px; }
                    .info-row { margin-bottom: 22px; }
                    .info-row:last-child { margin-bottom: 0; }
                    .label { font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 6px; }
                    .value { font-size: 16px; font-weight: 600; color: #0f172a; line-height: 1.5; }
                    .message-box { background: #ffffff; border-radius: 18px; padding: 25px; margin-top: 10px; border: 1px solid #e2e8f0; }
                    .message-title { font-size: 13px; font-weight: 700; color: ${brandIndigo}; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 1px; }
                    .message-content { font-size: 15px; line-height: 1.8; color: #334155; white-space: pre-line; }
                    .footer { padding: 30px 40px; text-align: center; background: #fafafa; font-size: 12px; color: #94a3b8; line-height: 1.8; }
                    .footer strong { color: #0f172a; }
                </style>
            </head>
            <body>
                <div class="wrapper">
                    <div class="container">
                        <div class="header">
                            <div class="logo-box">
                                <div class="logo-inner">
                                    <div class="logo-dot"></div>
                                </div>
                            </div>
                            <span class="brand-name">Ola Cars</span>
                        </div>
                        <div class="content">
                            <div class="tag">General Enquiry</div>
                            <h1 class="title">New Customer <span style="color: ${brandIndigo}">Transmission</span></h1>
                            <p class="subtitle">A new enquiry has been submitted through the platform. System has captured the following details.</p>
                            
                            <div class="info-card">
                                <div class="info-row">
                                    <div class="label">Customer Name</div>
                                    <div class="value">${enquiryData.name || 'Anonymous User'}</div>
                                </div>
                                <div class="info-row">
                                    <div class="label">Email Address</div>
                                    <div class="value">${enquiryData.email || 'No Email Provided'}</div>
                                </div>
                                <div class="info-row">
                                    <div class="label">Phone Number</div>
                                    <div class="value">${enquiryData.phone || enquiryData.mobile || 'No Phone Number'}</div>
                                </div>
                                <div class="info-row">
                                    <div class="label">Category</div>
                                    <div class="value">${enquiryData.category || 'General Operations'}</div>
                                </div>
                            </div>

                            <div class="message-box">
                                <div class="message-title">Transmission Content</div>
                                <div class="message-content">${enquiryData.message || 'No message provided'}</div>
                            </div>
                        </div>
                        <div class="footer">
                            Sent via <strong>Ola Cars Notification System</strong><br>
                            ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                        </div>
                    </div>
                </div>
            </body>
            </html>
        `;

        // Send to the GENERAL_ENQUIRY desk
        return await this.sendEmail({ subject, html, purpose: 'GENERAL_ENQUIRY' });
    }
}

module.exports = new MailService();