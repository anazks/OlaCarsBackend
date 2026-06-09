const Supplier = require('../Model/SupplierModel.js');
const filterBody = require('../../../shared/utils/filterBody.js');
const AppError = require('../../../shared/utils/AppError.js');

const ALLOWED_CREATE_FIELDS = [
    'name', 'contactPerson', 'email', 'phone', 'address', 'category', 'isActive',
    'vendorNumber', 'companyName', 'displayName', 'salutation', 'firstName', 'lastName',
    'mobilePhone', 'currencyCode', 'notes', 'website', 'openingBalance', 'locationId',
    'locationName', 'accountsPayable', 'paymentTermsLabel', 'paymentTerms', 'taxable',
    'taxName', 'taxPercentage', 'taxType', 'contactAddressId', 'billingAttention',
    'billingAddress', 'billingStreet2', 'billingCity', 'billingState', 'billingCountry',
    'billingCode', 'billingPhone', 'billingFax', 'shippingAttention', 'shippingAddress',
    'shippingStreet2', 'shippingCity', 'shippingState', 'shippingCountry', 'shippingCode',
    'shippingPhone', 'shippingFax', 'source', 'primaryContactId', 'companyId',
    'cfFleetNo', 'cfActiveDate', 'cfRuc', 'cfDv'
];
const ALLOWED_UPDATE_FIELDS = [...ALLOWED_CREATE_FIELDS];

exports.create = async (data) => {
    const filtered = filterBody(data, ...ALLOWED_CREATE_FIELDS);
    filtered.createdBy = data.createdBy;
    filtered.creatorRole = data.creatorRole;

    const newSupplier = await Supplier.create(filtered);
    return newSupplier.toObject();
};

const { getSuppliersService } = require('../Repo/SupplierRepo.js');

exports.getAll = async (queryParams = {}) => {
    return await getSuppliersService(queryParams, {
        baseQuery: { isDeleted: false },
        defaultSort: { createdAt: -1 }
    });
};

exports.getById = async (id) => {
    return await Supplier.findOne({ _id: id, isDeleted: false }).populate('accountsPayable');
};


exports.update = async (id, body) => {
    const filtered = filterBody(body, ...ALLOWED_UPDATE_FIELDS);
    if (Object.keys(filtered).length === 0) {
        throw new AppError('No valid fields to update', 400);
    }

    const updated = await Supplier.findByIdAndUpdate(id, filtered, {
        new: true,
        runValidators: true,
    });

    if (!updated) throw new AppError('Supplier not found', 404);
    return updated;
};

exports.remove = async (id) => {
    const result = await Supplier.findByIdAndUpdate(
        id,
        { isDeleted: true, isActive: false },
        { new: true }
    );
    if (!result) throw new AppError('Supplier not found', 404);
    return result;
};

exports.bulkCreate = async (suppliersData, userId, userRole) => {
    const AccountingCode = require('../../AccountingCode/Model/AccountingCodeModel');
    const Supplier = require('../Model/SupplierModel.js');

    // Fetch all active accounting codes to do lookup
    const accounts = await AccountingCode.find({ isDeleted: false, isActive: true });

    const results = { created: [], errors: [] };

    for (let i = 0; i < suppliersData.length; i++) {
        const row = suppliersData[i];
        const rowNum = i + 1;

        const dName = row.displayName || row['Display Name'] || row['display name'] || row.DisplayName || '';
        const cName = row.contactName || row['Contact Name'] || row['contact name'] || row.ContactName || '';
        const compName = row.companyName || row['Company Name'] || row['company name'] || row.CompanyName || '';
        const fName = row.firstName || row['First Name'] || row['first name'] || row.FirstName || '';
        const lName = row.lastName || row['Last Name'] || row['last name'] || row.LastName || '';
        const simpleName = row.name || row.Name || row['Name'] || '';

        // Resolve name (Contact Name / Display Name / Company Name / First Name + Last Name)
        const nameVal = dName || cName || compName || 
                        (fName && lName ? `${fName} ${lName}`.trim() : '') || 
                        fName || lName || simpleName;
        
        if (!nameVal || !nameVal.trim()) {
            results.errors.push({ row: rowNum, message: "Name (Display Name / Contact Name / Company Name / First/Last Name) is mandatory." });
            continue;
        }

        const name = nameVal.trim();

        // Check if name is unique
        const existing = await Supplier.findOne({ name, isDeleted: false });
        if (existing) {
            results.errors.push({ row: rowNum, message: `Supplier with name "${name}" already exists.` });
            continue;
        }

        // Email validation
        let email = row.email || row.emailID || row.emailId || row.EmailID || row.EmailId || row.Email || row['Email ID'] || row['Email id'] || row['EmailID'];
        if (email) {
            email = String(email).trim().toLowerCase();
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                results.errors.push({ row: rowNum, message: `Invalid email address: ${email}` });
                continue;
            }
        }

        // Accounts Payable validation & resolution
        let accountsPayable = null;
        const apVal = row.accountsPayable || row['accounts payable'] || row['Accounts Payable'] || row.AccountsPayable || row['AccountsPayable'];
        if (apVal) {
            const apStr = String(apVal).trim().toLowerCase();
            const matchedAccount = accounts.find(acc => 
                acc.code.toLowerCase() === apStr || 
                acc.name.toLowerCase() === apStr
            );
            if (matchedAccount) {
                accountsPayable = matchedAccount._id;
            } else {
                results.errors.push({ row: rowNum, message: `Accounts Payable account "${apVal}" not found in Chart of Accounts.` });
                continue;
            }
        } else {
            // Default to standard Accounts Payable account if exists
            const defaultAP = accounts.find(acc => 
                acc.category === 'Accounts Payable' || 
                acc.name.toLowerCase() === 'accounts payable' || 
                acc.code === '2100' ||
                acc.code === '2.1.01'
            );
            if (defaultAP) {
                accountsPayable = defaultAP._id;
            }
        }

        // Parse date for active date
        let cfActiveDate = undefined;
        const activeDateVal = row.cfActiveDate || row['cf.active date'] || row['CF.ACTIVE DATE'] || row['CF.Active Date'] || row['cf active date'] || row['CF Active Date'];
        if (activeDateVal) {
            let parsedDate;
            if (typeof activeDateVal === 'number') {
                // Serial Excel date conversion
                parsedDate = new Date((activeDateVal - 25569) * 86400 * 1000);
            } else {
                parsedDate = new Date(activeDateVal);
            }

            if (!isNaN(parsedDate.getTime())) {
                cfActiveDate = parsedDate;
            } else {
                results.errors.push({ row: rowNum, message: `Invalid Active Date format: ${activeDateVal}` });
                continue;
            }
        }

        try {
            // Map the other fields
            const dataToSave = {
                name,
                contactPerson: row.contactPerson || row.contactName || row['Contact Name'] || row.ContactName || (fName && lName ? `${fName} ${lName}`.trim() : '') || undefined,
                email: email || undefined,
                phone: row.phone || row.Phone || row['Phone'] ? String(row.phone || row.Phone || row['Phone']).trim() : undefined,
                address: row.address || row.Address || row.billingAddress || row['Billing Address'] || undefined,
                category: row.category || row.Category || 'General',
                isActive: row.isActive !== undefined ? row.isActive : (row.status === 'Active' || row.status === 'active' || row.Status === 'Active' || row.Status === 'active' || row.status === true || row.status === undefined),
                createdBy: userId,
                creatorRole: userRole,

                vendorNumber: row.vendorNumber || row['vendor number'] || row['Vendor Number'] || row.VendorNumber ? String(row.vendorNumber || row['vendor number'] || row['Vendor Number'] || row.VendorNumber).trim() : undefined,
                companyName: compName ? String(compName).trim() : undefined,
                displayName: dName ? String(dName).trim() : undefined,
                salutation: row.salutation || row.Salutation ? String(row.salutation || row.Salutation).trim() : undefined,
                firstName: fName ? String(fName).trim() : undefined,
                lastName: lName ? String(lName).trim() : undefined,
                mobilePhone: row.mobilePhone || row['mobilephone'] || row['MobilePhone'] || row.MobilePhone ? String(row.mobilePhone || row['mobilephone'] || row['MobilePhone'] || row.MobilePhone).trim() : undefined,
                currencyCode: row.currencyCode || row['currency code'] || row['Currency Code'] || row.CurrencyCode ? String(row.currencyCode || row['currency code'] || row['Currency Code'] || row.CurrencyCode).trim() : 'USD',
                notes: row.notes || row.Notes ? String(row.notes || row.Notes).trim() : undefined,
                website: row.website || row.Website ? String(row.website || row.Website).trim() : undefined,
                openingBalance: (row.openingBalance !== undefined || row['Opening Balance'] !== undefined || row.OpeningBalance !== undefined) ? Number(row.openingBalance || row['Opening Balance'] || row.OpeningBalance || 0) : 0,
                locationId: row.locationId || row['location id'] || row['Location ID'] || row.LocationId ? String(row.locationId || row['location id'] || row['Location ID'] || row.LocationId).trim() : undefined,
                locationName: row.locationName || row['location name'] || row['Location Name'] || row.LocationName ? String(row.locationName || row['location name'] || row['Location Name'] || row.LocationName).trim() : undefined,
                accountsPayable,
                paymentTermsLabel: row.paymentTermsLabel || row['payment terms label'] || row['Payment Terms Label'] || row.PaymentTermsLabel ? String(row.paymentTermsLabel || row['payment terms label'] || row['Payment Terms Label'] || row.PaymentTermsLabel).trim() : undefined,
                paymentTerms: row.paymentTerms || row['payment terms'] || row['Payment Terms'] || row.PaymentTerms ? String(row.paymentTerms || row['payment terms'] || row['Payment Terms'] || row.PaymentTerms).trim() : undefined,
                taxable: row.taxable === true || String(row.taxable).toLowerCase() === 'true' || String(row.taxable).toLowerCase() === 'yes' || String(row.taxable) === '1' || row.Taxable === true || String(row.Taxable).toLowerCase() === 'true' || String(row.Taxable).toLowerCase() === 'yes' || String(row.Taxable) === '1',
                taxName: row.taxName || row['tax name'] || row['Tax Name'] || row.TaxName ? String(row.taxName || row['tax name'] || row['Tax Name'] || row.TaxName).trim() : undefined,
                taxPercentage: (row.taxPercentage !== undefined || row['Tax Percentage'] !== undefined || row.TaxPercentage !== undefined) ? Number(row.taxPercentage || row['Tax Percentage'] || row.TaxPercentage || 0) : 0,
                taxType: row.taxType || row['tax type'] || row['Tax Type'] || row.TaxType ? String(row.taxType || row['tax type'] || row['Tax Type'] || row.TaxType).trim() : undefined,
                contactAddressId: row.contactAddressId || row['contact address id'] || row['Contact Address ID'] || row.ContactAddressId ? String(row.contactAddressId || row['contact address id'] || row['Contact Address ID'] || row.ContactAddressId).trim() : undefined,
                billingAttention: row.billingAttention || row['billing attention'] || row['Billing Attention'] || row.BillingAttention ? String(row.billingAttention || row['billing attention'] || row['Billing Attention'] || row.BillingAttention).trim() : undefined,
                billingAddress: row.billingAddress || row['billing address'] || row['Billing Address'] || row.BillingAddress ? String(row.billingAddress || row['billing address'] || row['Billing Address'] || row.BillingAddress).trim() : undefined,
                billingStreet2: row.billingStreet2 || row['billing street2'] || row['Billing Street2'] || row.BillingStreet2 ? String(row.billingStreet2 || row['billing street2'] || row['Billing Street2'] || row.BillingStreet2).trim() : undefined,
                billingCity: row.billingCity || row['billing city'] || row['Billing City'] || row.BillingCity ? String(row.billingCity || row['billing city'] || row['Billing City'] || row.BillingCity).trim() : undefined,
                billingState: row.billingState || row['billing state'] || row['Billing State'] || row.BillingState ? String(row.billingState || row['billing state'] || row['Billing State'] || row.BillingState).trim() : undefined,
                billingCountry: row.billingCountry || row['billing country'] || row['Billing Country'] || row.BillingCountry ? String(row.billingCountry || row['billing country'] || row['Billing Country'] || row.BillingCountry).trim() : undefined,
                billingCode: row.billingCode || row['billing code'] || row['Billing Code'] || row.BillingCode ? String(row.billingCode || row['billing code'] || row['Billing Code'] || row.BillingCode).trim() : undefined,
                billingPhone: row.billingPhone || row['billing phone'] || row['Billing Phone'] || row.BillingPhone ? String(row.billingPhone || row['billing phone'] || row['Billing Phone'] || row.BillingPhone).trim() : undefined,
                billingFax: row.billingFax || row['billing fax'] || row['Billing Fax'] || row.BillingFax ? String(row.billingFax || row['billing fax'] || row['Billing Fax'] || row.BillingFax).trim() : undefined,
                shippingAttention: row.shippingAttention || row['shipping attention'] || row['Shipping Attention'] || row.ShippingAttention ? String(row.shippingAttention || row['shipping attention'] || row['Shipping Attention'] || row.ShippingAttention).trim() : undefined,
                shippingAddress: row.shippingAddress || row['shipping address'] || row['Shipping Address'] || row.ShippingAddress ? String(row.shippingAddress || row['shipping address'] || row['Shipping Address'] || row.ShippingAddress).trim() : undefined,
                shippingStreet2: row.shippingStreet2 || row['shipping street2'] || row['Shipping Street2'] || row.ShippingStreet2 ? String(row.shippingStreet2 || row['shipping street2'] || row['Shipping Street2'] || row.ShippingStreet2).trim() : undefined,
                shippingCity: row.shippingCity || row['shipping city'] || row['Shipping City'] || row.ShippingCity ? String(row.shippingCity || row['shipping city'] || row['Shipping City'] || row.ShippingCity).trim() : undefined,
                shippingState: row.shippingState || row['shipping state'] || row['Shipping State'] || row.ShippingState ? String(row.shippingState || row['shipping state'] || row['Shipping State'] || row.ShippingState).trim() : undefined,
                shippingCountry: row.shippingCountry || row['shipping country'] || row['Shipping Country'] || row.ShippingCountry ? String(row.shippingCountry || row['shipping country'] || row['Shipping Country'] || row.ShippingCountry).trim() : undefined,
                shippingCode: row.shippingCode || row['shipping code'] || row['Shipping Code'] || row.ShippingCode ? String(row.shippingCode || row['shipping code'] || row['Shipping Code'] || row.ShippingCode).trim() : undefined,
                shippingPhone: row.shippingPhone || row['shipping phone'] || row['Shipping Phone'] || row.ShippingPhone ? String(row.shippingPhone || row['shipping phone'] || row['Shipping Phone'] || row.ShippingPhone).trim() : undefined,
                shippingFax: row.shippingFax || row['shipping fax'] || row['Shipping Fax'] || row.ShippingFax ? String(row.shippingFax || row['shipping fax'] || row['Shipping Fax'] || row.ShippingFax).trim() : undefined,
                source: row.source || row.Source ? String(row.source || row.Source).trim() : undefined,
                primaryContactId: row.primaryContactId || row['primary contact id'] || row['Primary Contact ID'] || row.PrimaryContactId ? String(row.primaryContactId || row['primary contact id'] || row['Primary Contact ID'] || row.PrimaryContactId).trim() : undefined,
                companyId: row.companyId || row['company id'] || row['Company ID'] || row.CompanyId ? String(row.companyId || row['company id'] || row['Company ID'] || row.CompanyId).trim() : undefined,
                cfFleetNo: row.cfFleetNo || row['cf.fleet no'] || row['CF.FLEET NO'] || row.cfFleetNo ? String(row.cfFleetNo || row['cf.fleet no'] || row['CF.FLEET NO'] || row.cfFleetNo).trim() : undefined,
                cfActiveDate,
                cfRuc: row.cfRuc || row['cf.ruc'] || row['CF.RUC'] || row.cfRuc ? String(row.cfRuc || row['cf.ruc'] || row['CF.RUC'] || row.cfRuc).trim() : undefined,
                cfDv: row.cfDv || row['cf.dv'] || row['CF.DV'] || row.cfDv ? String(row.cfDv || row['cf.dv'] || row['CF.DV'] || row.cfDv).trim() : undefined
            };

            const filtered = filterBody(dataToSave, ...ALLOWED_CREATE_FIELDS);
            filtered.createdBy = dataToSave.createdBy;
            filtered.creatorRole = dataToSave.creatorRole;
            filtered.accountsPayable = dataToSave.accountsPayable;

            const newSupplier = await Supplier.create(filtered);
            results.created.push({ row: rowNum, id: newSupplier._id, name: newSupplier.name });
        } catch (err) {
            results.errors.push({ row: rowNum, message: err.message });
        }
    }

    return results;
};
