const PaymentMade = require('../Model/PaymentMadeModel');
const mongoose = require('mongoose');

const parsePaymentDate = (dateInput) => {
    if (!dateInput) return new Date();
    
    let dateStr = typeof dateInput === 'string' ? dateInput : '';
    if (dateStr) {
        const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (match) {
            const year = parseInt(match[1], 10);
            const month = parseInt(match[2], 10);
            const day = parseInt(match[3], 10);
            
            const hasZeroTime = !dateStr.includes('T') || /T00:00:00/.test(dateStr) || /T00:00:00.000Z/.test(dateStr);
            if (hasZeroTime) {
                const dateObj = new Date();
                dateObj.setFullYear(year, month - 1, day);
                return dateObj;
            }
        }
    }
    
    const parsed = new Date(dateInput);
    return isNaN(parsed.getTime()) ? new Date() : parsed;
};

exports.createPaymentMade = async (req, res) => {
    try {
        const { supplier, amount, paymentDate: rawPaymentDate, paymentMethod, paidThroughAccount, referenceNumber, notes, branch, bills } = req.body;
        
        if (!supplier || !amount || !paidThroughAccount) {
            return res.status(400).json({ success: false, message: "Missing required fields: supplier, amount, paidThroughAccount are required." });
        }

        const paymentDate = parsePaymentDate(rawPaymentDate);

        // 1. Generate sequential PMT number
        const count = await PaymentMade.countDocuments();
        const paymentNumber = `PMT-${String(count + 1).padStart(5, '0')}`;

        // 2. Create PaymentMade document
        const newDoc = new PaymentMade({
            paymentNumber,
            supplier,
            amount,
            paymentDate,
            paymentMethod: paymentMethod || "Cash",
            referenceNumber,
            notes,
            paidThroughAccount,
            branch,
            bills: bills || [],
            status: "COMPLETED"
        });

        const savedDoc = await newDoc.save();

        // 3. Update applied Bills
        if (bills && bills.length > 0) {
            const Bill = require('../../Bill/Model/BillModel');
            for (const b of bills) {
                const bill = await Bill.findById(b.billId);
                if (bill) {
                    bill.amountPaid = (bill.amountPaid || 0) + b.amountApplied;
                    if (bill.balanceDue <= 0) {
                        bill.status = "PAID";
                    } else {
                        bill.status = "PARTIALLY_PAID";
                    }
                    await bill.save();
                    console.log(`[PaymentMadeController] Settled $${b.amountApplied} on Bill ${bill.billNumber}. Remaining Balance: $${bill.balanceDue}`);
                }
            }
        }

        // 4. Post Double-Entry Ledger through PaymentTransaction
        let creatorId = req.user ? (req.user.id || req.user._id) : null;
        let creatorRole = req.user && req.user.role ? req.user.role.toUpperCase() : "ADMIN";
        if (!creatorId) {
            try {
                const User = mongoose.model('User');
                const anyUser = await User.findOne({});
                if (anyUser) {
                    creatorId = anyUser._id;
                    creatorRole = anyUser.role ? anyUser.role.toUpperCase() : "ADMIN";
                } else {
                    creatorId = new mongoose.Types.ObjectId();
                    creatorRole = "ADMIN";
                }
            } catch (e) {
                creatorId = new mongoose.Types.ObjectId();
                creatorRole = "ADMIN";
            }
        }

        const PaymentTransaction = require('../../Payment/Model/PaymentTransactionModel');
        const paymentTx = new PaymentTransaction({
            accountingCode: paidThroughAccount,
            referenceId: savedDoc._id,
            referenceModel: "PaymentMade",
            transactionCategory: "LIABILITY",
            transactionType: "DEBIT",
            baseAmount: amount,
            totalAmount: amount,
            paymentMethod: "CASH",
            status: "COMPLETED",
            paymentDate: paymentDate,
            notes: notes || `Payment made to Supplier (PMT: ${paymentNumber})`,
            branch,
            supplier,
            createdBy: creatorId,
            creatorRole: creatorRole
        });

        // Normalize paymentMethod for PaymentTransaction enum: ["CASH", "BANK_TRANSFER", "CREDIT_CARD", "CHEQUE", "OTHER"]
        const pmUpper = (paymentMethod || "").toUpperCase();
        if (pmUpper.includes("CASH")) paymentTx.paymentMethod = "CASH";
        else if (pmUpper.includes("BANK") || pmUpper.includes("TRANSFER")) paymentTx.paymentMethod = "BANK_TRANSFER";
        else if (pmUpper.includes("CARD")) paymentTx.paymentMethod = "CREDIT_CARD";
        else if (pmUpper.includes("CHEQUE")) paymentTx.paymentMethod = "CHEQUE";
        else paymentTx.paymentMethod = "OTHER";

        await paymentTx.save();

        // Trigger Ledger double-entry booking
        const { autoGenerateLedgerEntry } = require("../../Ledger/Service/LedgerService");
        const AccountingCode = require("../../AccountingCode/Model/AccountingCodeModel");
        const accCode = await AccountingCode.findById(paidThroughAccount);
        const populatedTx = { ...paymentTx.toObject(), accountingCode: accCode };
        await autoGenerateLedgerEntry(populatedTx);

        res.status(201).json({ success: true, data: savedDoc });
    } catch (error) {
        console.error("[PaymentMadeController] Error recording payment made:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.getAllPaymentMades = async (req, res) => {
    try {
        const { page = 1, limit = 10, search, sortBy, sortOrder, paymentMethod } = req.query;
        console.log('PaymentMade Query Params:', { page, limit, search, sortBy, sortOrder, paymentMethod });
        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        const query = {};
        if (paymentMethod && paymentMethod !== 'ALL') {
            query.paymentMethod = paymentMethod;
        }

        if (search) {
            const searchRegex = { $regex: search, $options: 'i' };
            
            // Find matching suppliers
            const Supplier = require('../../Supplier/Model/SupplierModel');
            const suppliers = await Supplier.find({
                name: searchRegex
            }).select('_id');
            const supplierIds = suppliers.map(s => s._id);

            query.$or = [
                { paymentNumber: searchRegex },
                { referenceNumber: searchRegex },
                { supplier: { $in: supplierIds } }
            ];
        }
        
        let sort = { createdAt: 1 };
        if (sortBy) {
            sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };
        }

        const total = await PaymentMade.countDocuments(query);
        const docs = await PaymentMade.find(query)
            .populate('supplier', 'name email phone')
            .sort(sort)
            .skip(skip)
            .limit(parseInt(limit));
            
        res.status(200).json({ 
            success: true, 
            data: docs,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.getPaymentMadeById = async (req, res) => {
    try {
        const doc = await PaymentMade.findById(req.params.id)
            .populate('supplier', 'name email phone')
            .populate('paidThroughAccount', 'name code')
            .populate('branch', 'name code');
        if (!doc) return res.status(404).json({ success: false, message: 'Not found' });
        res.status(200).json({ success: true, data: doc });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.updatePaymentMade = async (req, res) => {
    try {
        const updatedDoc = await PaymentMade.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!updatedDoc) return res.status(404).json({ success: false, message: 'Not found' });
        res.status(200).json({ success: true, data: updatedDoc });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.deletePaymentMade = async (req, res) => {
    try {
        const deletedDoc = await PaymentMade.findByIdAndDelete(req.params.id);
        if (!deletedDoc) return res.status(404).json({ success: false, message: 'Not found' });
        res.status(200).json({ success: true, message: 'Deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.bulkUploadPaymentsMade = async (req, res) => {
    try {
        const rows = req.body.rows || req.body;
        if (!rows || !Array.isArray(rows) || rows.length === 0) {
            return res.status(400).json({ success: false, message: 'No data rows provided.' });
        }

        // ---- Pre-load reference collections ----
        const Supplier = require('../../Supplier/Model/SupplierModel');
        const Branch = require('../../Branch/Model/BranchModel');
        const AccountingCode = require('../../AccountingCode/Model/AccountingCodeModel');
        const Bill = require('../../Bill/Model/BillModel');

        const suppliersList = await Supplier.find({ isDeleted: false });
        const suppliersByName = new Map();
        const suppliersByNumber = new Map();
        for (const s of suppliersList) {
            if (s.name) suppliersByName.set(s.name.trim().toLowerCase().replace(/\s+/g, ' '), s);
            if (s.vendorNumber) suppliersByNumber.set(s.vendorNumber.trim().toLowerCase(), s);
        }

        const branchesList = await Branch.find({ isDeleted: false });
        const branchesByName = new Map();
        const branchesByCode = new Map();
        const branchesById = new Map();
        for (const b of branchesList) {
            if (b.name) branchesByName.set(b.name.trim().toLowerCase().replace(/\s+/g, ' '), b);
            if (b.code) branchesByCode.set(b.code.trim().toLowerCase(), b);
            branchesById.set(b._id.toString(), b);
        }

        const accountsList = await AccountingCode.find({ isDeleted: false, isActive: true });
        const accountsByCode = new Map();
        const accountsByName = new Map();
        for (const acc of accountsList) {
            if (acc.code) accountsByCode.set(acc.code.trim().toLowerCase(), acc);
            if (acc.name) accountsByName.set(acc.name.trim().toLowerCase().replace(/\s+/g, ' '), acc);
        }

        const billsList = await Bill.find({});
        const billsByNumber = new Map();
        for (const bl of billsList) {
            if (bl.billNumber) billsByNumber.set(bl.billNumber.trim().toLowerCase(), bl);
        }

        // ---- Utilities ----
        const getRowVal = (r, possibleKeys) => {
            for (const key of possibleKeys) {
                const cleanKey = key.replace(/^\ufeff/, '').trim().toLowerCase();
                if (r[key] !== undefined) return r[key];
                for (const k of Object.keys(r)) {
                    const cleanK = k.replace(/^\ufeff/, '').trim().toLowerCase();
                    if (cleanK === cleanKey) return r[k];
                }
            }
            return undefined;
        };

        const parseFlexibleDate = (dateStr) => {
            if (!dateStr) return null;
            if (dateStr instanceof Date) return isNaN(dateStr.getTime()) ? null : dateStr;
            if (typeof dateStr === 'number') {
                const date = new Date((dateStr - 25569) * 86400 * 1000);
                return isNaN(date.getTime()) ? null : date;
            }
            const str = dateStr.toString().trim();
            if (!str) return null;
            const dmyRegex = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/;
            const match = str.match(dmyRegex);
            if (match) {
                const day = parseInt(match[1], 10);
                const month = parseInt(match[2], 10) - 1;
                const year = parseInt(match[3], 10);
                const date = new Date(year, month, day);
                if (date.getFullYear() === year && date.getMonth() === month && date.getDate() === day) return date;
            }
            const parsedDate = new Date(str);
            return isNaN(parsedDate.getTime()) ? null : parsedDate;
        };

        // ---- Process rows ----
        const created = [];
        const errors = [];
        let baseCount = await PaymentMade.countDocuments();

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const rowIdx = i + 1;

            try {
                // --- Map: Payment Number ---
                const excelPaymentNumber = getRowVal(row, ['Payment Number', 'paymentNumber']);

                // --- Map: Amount (required) ---
                const rawAmount = getRowVal(row, ['Amount', 'amount']);
                const amount = Number(rawAmount);
                if (!rawAmount || isNaN(amount) || amount <= 0) {
                    errors.push(`Row ${rowIdx}: Invalid or missing Amount.`);
                    continue;
                }

                // --- Map: Date -> paymentDate ---
                const rawDate = getRowVal(row, ['Date', 'date', 'Payment Date', 'paymentDate']);
                const paymentDate = parseFlexibleDate(rawDate) || new Date();

                // --- Map: Mode -> paymentMethod ---
                const rawMode = (getRowVal(row, ['Mode', 'mode', 'Payment Method', 'paymentMethod']) || '').toString().trim();
                let paymentMethod = 'Other';
                const modeUpper = rawMode.toUpperCase();
                if (modeUpper.includes('CASH')) paymentMethod = 'Cash';
                else if (modeUpper.includes('BANK') || modeUpper.includes('TRANSFER') || modeUpper.includes('WIRE')) paymentMethod = 'Bank Transfer';
                else if (modeUpper.includes('CARD') || modeUpper.includes('CREDIT')) paymentMethod = 'Card';
                else if (modeUpper.includes('CHEQUE') || modeUpper.includes('CHECK')) paymentMethod = 'Cheque';
                else if (rawMode) paymentMethod = 'Other';

                // --- Map: Reference Number -> referenceNumber ---
                const referenceNumber = getRowVal(row, ['Reference Number', 'referenceNumber', 'Bank Reference Number', 'bankReferenceNumber']) || undefined;

                // --- Map: Payment Status -> status ---
                const rawStatus = (getRowVal(row, ['Payment Status', 'paymentStatus', 'status']) || 'COMPLETED').toString().trim().toUpperCase();
                let status = 'COMPLETED';
                if (rawStatus === 'VOID' || rawStatus === 'VOIDED' || rawStatus === 'CANCELLED') status = 'VOID';

                // --- Resolve Supplier via Vendor Name / Vendor Number ---
                const vendorName = getRowVal(row, ['Vendor Name', 'vendorName', 'Supplier Name', 'supplierName']);
                const vendorNumber = getRowVal(row, ['Vendor Number', 'vendorNumber', 'Supplier Number', 'supplierNumber']);

                let supplierDoc = null;
                if (vendorName) {
                    const cleanName = vendorName.toString().trim().toLowerCase().replace(/\s+/g, ' ');
                    supplierDoc = suppliersByName.get(cleanName);
                    if (!supplierDoc) {
                        for (const [dbName, dbSup] of suppliersByName.entries()) {
                            const cleanDb = dbName.replace(/[^a-z0-9\s]/g, '').trim();
                            const cleanInput = cleanName.replace(/[^a-z0-9\s]/g, '').trim();
                            if (cleanDb === cleanInput || cleanDb.includes(cleanInput) || cleanInput.includes(cleanDb)) {
                                supplierDoc = dbSup;
                                break;
                            }
                        }
                    }
                }
                if (!supplierDoc && vendorNumber) {
                    supplierDoc = suppliersByNumber.get(vendorNumber.toString().trim().toLowerCase());
                }

                // --- Resolve Branch via Branch ID / Location Name ---
                const branchId = getRowVal(row, ['Branch ID', 'branchId']);
                const locationName = getRowVal(row, ['Location Name', 'locationName', 'Location', 'location']);

                let branchDoc = null;
                if (branchId) {
                    const cleanId = branchId.toString().trim();
                    branchDoc = branchesById.get(cleanId) || branchesByCode.get(cleanId.toLowerCase());
                }
                if (!branchDoc && locationName) {
                    branchDoc = branchesByName.get(locationName.toString().trim().toLowerCase().replace(/\s+/g, ' '));
                }

                // --- Resolve Paid Through Account ---
                const paidThrough = getRowVal(row, ['Paid Through', 'paidThrough', 'Deposit To', 'depositTo']);
                const paidThroughCode = getRowVal(row, ['Paid Through Account Code', 'paidThroughAccountCode', 'Deposit To Account Code', 'depositToAccountCode']);

                let paidThroughDoc = null;
                if (paidThroughCode) {
                    paidThroughDoc = accountsByCode.get(paidThroughCode.toString().trim().toLowerCase());
                }
                if (!paidThroughDoc && paidThrough) {
                    paidThroughDoc = accountsByName.get(paidThrough.toString().trim().toLowerCase().replace(/\s+/g, ' '));
                }

                // --- Resolve Bill reference ---
                const billNumber = getRowVal(row, ['Bill Number', 'billNumber']);
                const billAmountVal = getRowVal(row, ['Bill Amount', 'billAmount']);
                let billsArray = [];
                if (billNumber) {
                    const billDoc = billsByNumber.get(billNumber.toString().trim().toLowerCase());
                    if (billDoc) {
                        billsArray.push({
                            billId: billDoc._id,
                            billNumber: billDoc.billNumber,
                            amountApplied: Number(billAmountVal) || amount
                        });
                    }
                }

                // --- Collect ALL unmapped fields into notes ---
                const unmappedFields = {
                    'Payment Number Prefix': getRowVal(row, ['Payment Number Prefix', 'paymentNumberPrefix']),
                    'Payment Number Suffix': getRowVal(row, ['Payment Number Suffix', 'paymentNumberSuffix']),
                    'VendorPayment ID': getRowVal(row, ['VendorPayment ID', 'vendorPaymentId', 'VendorPaymentID']),
                    'Description': getRowVal(row, ['Description', 'description']),
                    'Exchange Rate': getRowVal(row, ['Exchange Rate', 'exchangeRate']),
                    'Unused Amount': getRowVal(row, ['Unused Amount', 'unusedAmount']),
                    'Currency Code': getRowVal(row, ['Currency Code', 'currencyCode']),
                    'Bank Charges': getRowVal(row, ['Bank Charges', 'bankCharges']),
                    'EmailID': getRowVal(row, ['EmailID', 'emailId', 'Email']),
                    'Tax Account': getRowVal(row, ['Tax Account', 'taxAccount']),
                    'PIPayment ID': getRowVal(row, ['PIPayment ID', 'piPaymentId', 'PIPaymentID']),
                    'Bill ID': getRowVal(row, ['Bill ID', 'billId']),
                    'Bill Payment Applied Date': getRowVal(row, ['Bill Payment Applied Date', 'billPaymentAppliedDate']),
                    'Bill Date': getRowVal(row, ['Bill Date', 'billDate']),
                    'Withholding Tax Amount': getRowVal(row, ['Withholding Tax Amount', 'withholdingTaxAmount']),
                    'Withholding Tax Amount (BCY)': getRowVal(row, ['Withholding Tax Amount (BCY)', 'withholdingTaxAmountBCY']),
                };

                // If supplier unresolved, capture vendor info in notes too
                if (!supplierDoc) {
                    if (vendorName) unmappedFields['Vendor Name (Unresolved)'] = vendorName;
                    if (vendorNumber) unmappedFields['Vendor Number (Unresolved)'] = vendorNumber;
                }

                const notesParts = [];
                for (const [k, v] of Object.entries(unmappedFields)) {
                    if (v !== undefined && v !== null && v !== '') {
                        notesParts.push(`${k}: ${v}`);
                    }
                }
                const notes = notesParts.length > 0 ? notesParts.join(' | ') : undefined;

                // --- Generate payment number ---
                baseCount++;
                const paymentNumber = excelPaymentNumber || `PMT-${String(baseCount).padStart(5, '0')}`;

                // --- Create PaymentMade record ---
                const newDoc = await PaymentMade.create({
                    paymentNumber,
                    supplier: supplierDoc ? supplierDoc._id : undefined,
                    amount,
                    paymentDate,
                    paymentMethod,
                    referenceNumber,
                    notes,
                    bills: billsArray,
                    paidThroughAccount: paidThroughDoc ? paidThroughDoc._id : undefined,
                    branch: branchDoc ? branchDoc._id : undefined,
                    status
                });

                created.push(newDoc.paymentNumber);
            } catch (err) {
                errors.push(`Row ${rowIdx}: ${err.message}`);
            }
        }

        res.status(200).json({
            success: true,
            data: {
                successCount: created.length,
                errorCount: errors.length,
                errors,
                createdPayments: created
            }
        });
    } catch (error) {
        console.error('[PaymentMadeController] Bulk upload error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};
