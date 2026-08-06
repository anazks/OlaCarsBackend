/**
 * Invoice & Bill Set-off History Model (Re-export for Backward Compatibility)
 * 
 * Re-exports InvoiceBillSetOffHistoryModel so that all existing require('./InvoiceSetOffHistoryModel') calls
 * seamlessly resolve without breaking any existing references.
 */

const InvoiceBillSetOffHistory = require('./InvoiceBillSetOffHistoryModel');

module.exports = InvoiceBillSetOffHistory;
module.exports.InvoiceSetOffHistory = InvoiceBillSetOffHistory;
module.exports.InvoiceBillSetOffHistory = InvoiceBillSetOffHistory;
