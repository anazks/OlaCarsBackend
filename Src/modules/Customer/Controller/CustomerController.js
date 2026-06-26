const Customer = require('../Model/CustomerModel');
const { getNextCustomerId, getNextDriverId } = require('../../SystemSettings/Model/CounterModel');
const { addDriverService } = require('../../Driver/Repo/DriverRepo');
const { Vehicle } = require('../../Vehicle/Model/VehicleModel');

exports.createCustomer = async (req, res) => {
    try {
        const customerData = { ...req.body };
        if (!customerData.customerId) {
            customerData.customerId = await getNextCustomerId();
        }
        if (req.user) {
            customerData.createdBy = req.user.id || req.user._id;
            customerData.creatorRole = req.user.role;
        }

        const newDoc = new Customer(customerData);
        const savedDoc = await newDoc.save();
        res.status(201).json({ success: true, data: savedDoc });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.getAllCustomers = async (req, res) => {
    try {
        const { page = 1, limit = 25, search, status, branch, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
        const query = { isDeleted: false };

        if (status && status !== 'ALL') {
            query.status = status;
        }

        if (branch && branch !== 'ALL') {
            query.branch = branch;
        }

        if (search && search.trim() !== '') {
            const searchRegex = new RegExp(search.trim(), 'i');
            query.$or = [
                { name: searchRegex },
                { email: searchRegex },
                { phone: searchRegex },
                { customerId: searchRegex }
            ];
        }

        const pageInt = parseInt(page, 10);
        const limitInt = parseInt(limit, 10);
        const skip = (pageInt - 1) * limitInt;

        const sort = {};
        sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

        const docs = await Customer.find(query)
            .populate('branch')
            .populate('driver', 'driverId status')
            .sort(sort)
            .skip(skip)
            .limit(limitInt);

        const total = await Customer.countDocuments(query);

        res.status(200).json({
            success: true,
            data: docs,
            pagination: {
                total,
                page: pageInt,
                limit: limitInt,
                totalPages: Math.ceil(total / limitInt)
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.getCustomerById = async (req, res) => {
    try {
        const mongoose = require('mongoose');
        const isValidObjectId = mongoose.Types.ObjectId.isValid(req.params.id);
        const queryOr = [{ customerId: req.params.id }];
        if (isValidObjectId) {
            queryOr.push({ _id: req.params.id });
            queryOr.push({ driver: req.params.id });
        }

        const doc = await Customer.findOne({ $or: queryOr, isDeleted: false })
            .populate('branch')
            .populate({
                path: 'driver',
                populate: { path: 'currentVehicle' }
            });
            
        if (!doc) return res.status(404).json({ success: false, message: 'Customer not found' });
        res.status(200).json({ success: true, data: doc });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.updateCustomer = async (req, res) => {
    try {
        const mongoose = require('mongoose');
        const isValidObjectId = mongoose.Types.ObjectId.isValid(req.params.id);
        const queryOr = [{ customerId: req.params.id }];
        if (isValidObjectId) {
            queryOr.push({ _id: req.params.id });
            queryOr.push({ driver: req.params.id });
        }

        const updatedDoc = await Customer.findOneAndUpdate(
            { $or: queryOr, isDeleted: false },
            req.body,
            { new: true }
        ).populate('branch');

        if (!updatedDoc) return res.status(404).json({ success: false, message: 'Customer not found' });
        res.status(200).json({ success: true, data: updatedDoc });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.downloadStatementPdf = async (req, res) => {
    try {
        const mongoose = require('mongoose');
        const isValidObjectId = mongoose.Types.ObjectId.isValid(req.params.id);
        const queryOr = [{ customerId: req.params.id }];
        if (isValidObjectId) {
            queryOr.push({ _id: req.params.id });
            queryOr.push({ driver: req.params.id });
        }

        const customer = await Customer.findOne({ $or: queryOr, isDeleted: false }).populate('branch');
        if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' });

        const { Invoice } = require('../../Invoice/Model/InvoiceModel');
        const PaymentReceived = require('../../PaymentReceived/Model/PaymentReceivedModel');
        const CreditNote = require('../../CreditNote/Model/CreditNoteModel');
        const StatementPdfService = require('../../Driver/Service/StatementPdfService');

        const [invoices, payments, creditNotes] = await Promise.all([
            Invoice.find({ customer: customer._id, isDeleted: false }),
            PaymentReceived.find({ customerId: customer._id, status: { $ne: 'VOID' } }),
            CreditNote.find({ customerId: customer._id })
        ]);

        // Build a driver-like object from customer for the shared PDF service
        const customerAsDriver = {
            personalInfo: {
                fullName: customer.name,
                email: customer.email,
                phone: customer.phone
            },
            driverId: customer.customerId,
            status: customer.status
        };

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader(
            'Content-Disposition',
            `inline; filename="Customer_Statement_${customer.name.replace(/\s+/g, '_')}.pdf"`
        );

        StatementPdfService.generateStatementPdf(customerAsDriver, invoices, payments, creditNotes, res, {
            sortBy: req.query.sortBy,
            sortOrder: req.query.sortOrder
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

exports.downloadMonthlyStatementPdf = async (req, res) => {
    try {
        const mongoose = require('mongoose');
        const isValidObjectId = mongoose.Types.ObjectId.isValid(req.params.id);
        const queryOr = [{ customerId: req.params.id }];
        if (isValidObjectId) {
            queryOr.push({ _id: req.params.id });
            queryOr.push({ driver: req.params.id });
        }

        const customer = await Customer.findOne({ $or: queryOr, isDeleted: false }).populate('branch');
        if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' });

        const { Invoice } = require('../../Invoice/Model/InvoiceModel');
        const PaymentReceived = require('../../PaymentReceived/Model/PaymentReceivedModel');
        const MonthlyStatementPdfService = require('../Service/MonthlyStatementPdfService');

        const [invoices, payments] = await Promise.all([
            Invoice.find({ customer: customer._id, isDeleted: false }),
            PaymentReceived.find({ customerId: customer._id })
        ]);

        const { month, year, fromDate, toDate } = req.query;
        let periodName = 'Full';
        if (fromDate || toDate) {
            periodName = `${fromDate || 'Start'}_to_${toDate || 'End'}`;
        } else if (month && year) {
            const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
            const monthIdx = (parseInt(month) || 1) - 1;
            periodName = `${MONTH_NAMES[monthIdx] || 'Month'}_${year}`;
        }

        const safeName = (customer.name || 'Customer').replace(/\s+/g, '_');

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader(
            'Content-Disposition',
            `inline; filename="Statement_${safeName}_${periodName}.pdf"`
        );

        MonthlyStatementPdfService.generateMonthlyStatementPdf(customer, invoices, payments, res, {
            month,
            year,
            fromDate,
            toDate
        });
    } catch (error) {
        console.error('[CustomerController] Monthly statement PDF error:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

exports.deleteCustomer = async (req, res) => {
    try {
        const mongoose = require('mongoose');
        const isValidObjectId = mongoose.Types.ObjectId.isValid(req.params.id);
        const queryOr = [{ customerId: req.params.id }];
        if (isValidObjectId) {
            queryOr.push({ _id: req.params.id });
            queryOr.push({ driver: req.params.id });
        }

        const deletedDoc = await Customer.findOneAndUpdate(
            { $or: queryOr },
            { isDeleted: true },
            { new: true }
        );
        if (!deletedDoc) return res.status(404).json({ success: false, message: 'Customer not found' });
        res.status(200).json({ success: true, message: 'Deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ─── Helper: resolve a value from many possible column-name variants ───
function pick(row, ...keys) {
    for (const k of keys) {
        if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== '') {
            return String(row[k]).trim();
        }
    }
    return undefined;
}

function pickNum(row, ...keys) {
    const val = pick(row, ...keys);
    if (val === undefined) return undefined;
    const n = Number(val);
    return isNaN(n) ? undefined : n;
}

function pickBool(row, ...keys) {
    const val = pick(row, ...keys);
    if (val === undefined) return false;
    const lower = val.toLowerCase();
    return lower === 'true' || lower === 'yes' || lower === '1';
}

function pickDate(row, ...keys) {
    const val = pick(row, ...keys);
    if (!val) return undefined;
    // Handle Excel serial date numbers
    const numVal = Number(val);
    if (!isNaN(numVal) && numVal > 25000 && numVal < 60000) {
        return new Date((numVal - 25569) * 86400 * 1000);
    }
    const d = new Date(val);
    return isNaN(d.getTime()) ? undefined : d;
}

/**
 * Bulk-create customers from a Zoho-style Excel/CSV payload.
 * If CF.VEHICLE NO is present, auto-creates a Driver and links the Vehicle.
 * @route POST /api/customers/bulk
 */
exports.bulkCreateCustomers = async (req, res) => {
    try {
        const { customers, branch: selectedBranch } = req.body;

        if (!Array.isArray(customers) || customers.length === 0) {
            return res.status(400).json({ success: false, message: "Request body must contain a non-empty 'customers' array." });
        }

        if (customers.length > 5000) {
            return res.status(400).json({ success: false, message: "Maximum 5000 customers per bulk upload." });
        }

        const userRole = req.user.role;
        const userId = req.user.id || req.user._id;
        const userBranchId = req.user.branchId;

        // Determine the branch for ALL customers in this batch
        const autoAssignRoles = ["OPERATIONSTAFF", "FINANCESTAFF", "BRANCHMANAGER"];
        const isAutoAssign = autoAssignRoles.includes(userRole);

        let branch;
        if (isAutoAssign) {
            branch = userBranchId;
            if (!branch) {
                return res.status(400).json({ success: false, message: "Your account has no branch assigned. Contact your administrator." });
            }
        } else {
            branch = selectedBranch;
            if (!branch || (typeof branch === "string" && !branch.trim())) {
                return res.status(400).json({ success: false, message: "Please select a branch before uploading." });
            }
        }

        const results = { created: [], errors: [], warnings: [] };

        for (let i = 0; i < customers.length; i++) {
            const row = customers[i];
            const rowNum = i + 1;

            try {
                // ── 1. Resolve customer name ──
                const displayName = pick(row, 'Display Name', 'DisplayName', 'display name');
                const fName = pick(row, 'First Name', 'FirstName', 'first name', 'firstName');
                const lName = pick(row, 'Last Name', 'LastName', 'last name', 'lastName');
                const cName = pick(row, 'Contact Name', 'ContactName', 'contact name', 'contactName');
                const compName = pick(row, 'Company Name', 'CompanyName', 'company name', 'companyName');

                const resolvedName = displayName ||
                    (fName && lName ? `${fName} ${lName}` : '') ||
                    cName || compName || fName || lName;

                if (!resolvedName || !resolvedName.trim()) {
                    results.errors.push({ row: rowNum, message: "Name required: at least Display Name, First/Last Name, Contact Name, or Company Name." });
                    continue;
                }

                const name = resolvedName.trim();

                // ── 2. Map all Zoho fields ──
                const email = pick(row, 'EmailID', 'Email', 'emailID', 'emailId', 'email');
                const phone = pick(row, 'Phone', 'phone');
                const mobilePhone = pick(row, 'MobilePhone', 'Mobile Phone', 'mobilePhone', 'mobile phone');
                const vehicleNo = pick(row, 'CF.VEHICLE NO :', 'CF.VEHICLE NO:', 'CF.VEHICLE NO', 'cf.vehicle no :', 'cf.vehicle no:', 'cf.vehicle no', 'CF.Vehicle No :', 'CF.Vehicle No:', 'CF.Vehicle No', 'cfVehicleNo');
                const status = pick(row, 'Status', 'status');
                const statusVal = (status && (status.toLowerCase() === 'active' || status.toLowerCase() === 'inactive'))
                    ? status.toUpperCase() : 'ACTIVE';

                const customerData = {
                    customerId: await getNextCustomerId(),
                    name,
                    email: email ? email.toLowerCase() : undefined,
                    phone,
                    mobilePhone,
                    branch,
                    status: statusVal,
                    createdBy: userId,
                    creatorRole: userRole,

                    // Zoho identity fields
                    customerNumber: pick(row, 'Customer Number', 'CustomerNumber', 'customer number'),
                    companyName: compName,
                    salutation: pick(row, 'Salutation', 'salutation'),
                    firstName: fName,
                    lastName: lName,
                    currencyCode: pick(row, 'Currency Code', 'CurrencyCode', 'currency code') || 'USD',
                    notes: pick(row, 'Notes', 'notes'),
                    website: pick(row, 'Website', 'website'),
                    openingBalance: pickNum(row, 'Opening Balance', 'OpeningBalance', 'opening balance') || 0,
                    openingBalanceExchangeRate: pickNum(row, 'Opening Balance Exchange Rate', 'OpeningBalanceExchangeRate'),
                    portalEnabled: pickBool(row, 'Portal Enabled', 'PortalEnabled', 'portal enabled'),
                    creditLimit: pickNum(row, 'Credit Limit', 'CreditLimit', 'credit limit'),
                    customerSubType: pick(row, 'Customer Sub Type', 'CustomerSubType', 'customer sub type'),
                    paymentTerms: pick(row, 'Payment Terms', 'PaymentTerms', 'payment terms'),
                    paymentTermsLabel: pick(row, 'Payment Terms Label', 'PaymentTermsLabel', 'payment terms label'),
                    taxable: pickBool(row, 'Taxable', 'taxable'),
                    taxName: pick(row, 'Tax Name', 'TaxName', 'tax name'),
                    taxPercentage: pickNum(row, 'Tax Percentage', 'TaxPercentage', 'tax percentage') || 0,
                    taxType: pick(row, 'Tax Type', 'TaxType', 'tax type'),
                    department: pick(row, 'Department', 'department'),
                    designation: pick(row, 'Designation', 'designation'),
                    priceList: pick(row, 'Price List', 'PriceList', 'price list'),
                    accountsReceivable: pick(row, 'Accounts Receivable', 'AccountsReceivable', 'accounts receivable'),
                    locationId: pick(row, 'Location ID', 'LocationID', 'location id'),
                    locationName: pick(row, 'Location Name', 'LocationName', 'location name'),
                    bankAccountPayment: pick(row, 'Bank Account Payment', 'BankAccountPayment', 'bank account payment'),
                    contactAddressId: pick(row, 'Contact Address ID', 'ContactAddressID', 'contact address id'),
                    companyId: pick(row, 'Company ID', 'CompanyID', 'company id'),
                    primaryContactId: pick(row, 'Primary Contact ID', 'PrimaryContactID', 'primary contact id'),
                    contactId: pick(row, 'Contact ID', 'ContactID', 'contact id'),
                    contactName: cName,
                    contactType: pick(row, 'Contact Type', 'ContactType', 'contact type'),

                    // Billing Address
                    billingAttention: pick(row, 'Billing Attention', 'BillingAttention', 'billing attention'),
                    billingAddress: pick(row, 'Billing Address', 'BillingAddress', 'billing address'),
                    billingStreet2: pick(row, 'Billing Street2', 'BillingStreet2', 'billing street2'),
                    billingCity: pick(row, 'Billing City', 'BillingCity', 'billing city'),
                    billingState: pick(row, 'Billing State', 'BillingState', 'billing state'),
                    billingCountry: pick(row, 'Billing Country', 'BillingCountry', 'billing country'),
                    billingCounty: pick(row, 'Billing County', 'BillingCounty', 'billing county'),
                    billingCode: pick(row, 'Billing Code', 'BillingCode', 'billing code'),
                    billingPhone: pick(row, 'Billing Phone', 'BillingPhone', 'billing phone'),
                    billingFax: pick(row, 'Billing Fax', 'BillingFax', 'billing fax'),
                    billingLatitude: pick(row, 'Billing Latitude', 'BillingLatitude', 'billing latitude'),
                    billingLongitude: pick(row, 'Billing Longitude', 'BillingLongitude', 'billing longitude'),

                    // Shipping Address
                    shippingAttention: pick(row, 'Shipping Attention', 'ShippingAttention', 'shipping attention'),
                    shippingAddress: pick(row, 'Shipping Address', 'ShippingAddress', 'shipping address'),
                    shippingStreet2: pick(row, 'Shipping Street2', 'ShippingStreet2', 'shipping street2'),
                    shippingCity: pick(row, 'Shipping City', 'ShippingCity', 'shipping city'),
                    shippingState: pick(row, 'Shipping State', 'ShippingState', 'shipping state'),
                    shippingCountry: pick(row, 'Shipping Country', 'ShippingCountry', 'shipping country'),
                    shippingCounty: pick(row, 'Shipping County', 'ShippingCounty', 'shipping county'),
                    shippingCode: pick(row, 'Shipping Code', 'ShippingCode', 'shipping code'),
                    shippingPhone: pick(row, 'Shipping Phone', 'ShippingPhone', 'shipping phone'),
                    shippingFax: pick(row, 'Shipping Fax', 'ShippingFax', 'shipping fax'),
                    shippingLatitude: pick(row, 'Shipping Latitude', 'ShippingLatitude', 'shipping latitude'),
                    shippingLongitude: pick(row, 'Shipping Longitude', 'ShippingLongitude', 'shipping longitude'),

                    // Social
                    skypeIdentity: pick(row, 'Skype Identity', 'SkypeIdentity', 'skype identity'),
                    facebookUrl: pick(row, 'Facebook', 'facebook'),
                    twitterHandle: pick(row, 'Twitter', 'twitter'),

                    // Custom Fields
                    cfFleetNo: pick(row, 'CF.FLEET NO', 'cf.fleet no', 'CF.Fleet No', 'cfFleetNo'),
                    cfActiveDate: pickDate(row, 'CF.ACTIVE DATE', 'cf.active date', 'CF.Active Date', 'cfActiveDate'),
                    cfVehicleNo: vehicleNo,
                    cfEndDate: pickDate(row, 'CF.END DATE', 'cf.end date', 'CF.End Date', 'cfEndDate'),
                    cfSection: pick(row, 'CF.SECTION', 'cf.section', 'CF.Section', 'cfSection'),
                };

                // Also populate address/city/state/country from billing if not directly set
                if (!customerData.address && customerData.billingAddress) {
                    customerData.address = customerData.billingAddress;
                }
                if (!customerData.city && customerData.billingCity) {
                    customerData.city = customerData.billingCity;
                }
                if (!customerData.state && customerData.billingState) {
                    customerData.state = customerData.billingState;
                }
                if (!customerData.country && customerData.billingCountry) {
                    customerData.country = customerData.billingCountry;
                }

                // ── 3. Create Customer ──
                const newCustomer = new Customer(customerData);
                const savedCustomer = await newCustomer.save();

                let driverInfo = null;
                let vehicleInfo = null;

                // ── 4. If CF.VEHICLE NO exists, create Driver & link Vehicle ──
                if (vehicleNo) {
                    try {
                        // 4a. Find Vehicle by plate number
                        const plateRegex = new RegExp("^" + vehicleNo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "$", "i");
                        const vehicle = await Vehicle.findOne({
                            "legalDocs.registrationNumber": plateRegex,
                            isDeleted: false
                        });

                        // 4b. Create Driver directly via repo (not DriverService.create)
                        // to avoid its auto-customer-creation which would duplicate our customer
                        const driverData = {
                            driverId: await getNextDriverId(),
                            status: "ACTIVE",
                            personalInfo: {
                                fullName: name,
                                email: email ? email.toLowerCase() : undefined,
                                phone: phone || mobilePhone || undefined,
                            },
                            branch: branch,
                            currentVehicle: vehicle ? vehicle._id : undefined,
                            createdBy: userId,
                            creatorRole: userRole,
                            statusHistory: [{
                                status: "ACTIVE",
                                changedBy: userId,
                                changedByRole: userRole,
                                timestamp: new Date(),
                                notes: "Driver auto-created from customer bulk upload.",
                            }],
                        };

                        const newDriver = await addDriverService(driverData);
                        driverInfo = { id: newDriver._id, driverId: newDriver.driverId };

                        // 4c. Link Customer → Driver
                        savedCustomer.driver = newDriver._id;
                        await savedCustomer.save();

                        // 4d. Link Vehicle → Driver (if vehicle found)
                        if (vehicle) {
                            await Vehicle.findByIdAndUpdate(vehicle._id, { currentDriver: newDriver._id });
                            vehicleInfo = {
                                id: vehicle._id,
                                registrationNumber: vehicle.legalDocs?.registrationNumber
                            };
                        } else {
                            results.warnings.push({
                                row: rowNum,
                                message: `Vehicle with plate "${vehicleNo}" not found in the system. Driver created but not linked to a vehicle.`
                            });
                        }
                    } catch (driverErr) {
                        // Customer was created successfully, but driver/vehicle linking failed
                        results.warnings.push({
                            row: rowNum,
                            message: `Customer created but Driver creation failed: ${driverErr.message}`
                        });
                    }
                }

                results.created.push({
                    row: rowNum,
                    id: savedCustomer._id,
                    customerId: savedCustomer.customerId,
                    name: name,
                    driver: driverInfo,
                    vehicle: vehicleInfo,
                });

            } catch (err) {
                let errorMsg = err.message || "Unknown error occurred";
                if (err.message && err.message.includes("E11000")) {
                    if (err.message.includes("email")) {
                        errorMsg = `Email '${pick(row, 'EmailID', 'Email')}' is already in use.`;
                    } else if (err.message.includes("customerId")) {
                        errorMsg = `Customer ID collision — please retry.`;
                    }
                }
                results.errors.push({ row: rowNum, message: errorMsg });
            }
        }

        let statusCode = 201;
        if (results.errors.length > 0) {
            statusCode = results.created.length > 0 ? 207 : 400;
        }

        return res.status(statusCode).json({
            success: results.created.length > 0,
            message: `${results.created.length} customer(s) created, ${results.errors.length} error(s), ${results.warnings.length} warning(s).`,
            data: results,
        });

    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
