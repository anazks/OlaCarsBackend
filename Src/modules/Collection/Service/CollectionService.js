const { Invoice } = require("../../Invoice/Model/InvoiceModel");
const { Driver } = require("../../Driver/Model/DriverModel");
const { Vehicle } = require("../../Vehicle/Model/VehicleModel");
const Branch = require("../../Branch/Model/BranchModel");
const CountryManager = require("../../CountryManager/Model/CountryManagerModel");
const BranchManager = require("../../BranchManager/Model/BranchManagerModel");
const FinanceStaff = require("../../FinanceStaff/Model/FinanceStaffModel");
const OperationStaff = require("../../OperationStaff/Model/OperationStaffModel");
const { ROLES } = require("../../../shared/constants/roles");
const AppError = require("../../../shared/utils/AppError");
const moment = require("moment");

/**
 * Computes implicit data access bounds based on executing User's role.
 */
const resolveImplicitFilters = async (user) => {
    const { id, role } = user;
    let branchIds = null;
    let fleetNumbers = null;

    switch (role) {
        case ROLES.ADMIN:
        case ROLES.FINANCEADMIN:
        case ROLES.OPERATIONADMIN:
            // No restrictions - global visibility
            break;

        case ROLES.COUNTRYMANAGER: {
            const manager = await CountryManager.findOne({ _id: id, isDeleted: false });
            if (!manager) throw new AppError("Country Manager record not found", 404);
            
            // Fetch all branches linked to this country
            const branches = await Branch.find({ country: manager.country, isDeleted: false }).select("_id");
            branchIds = branches.map(b => b._id);
            break;
        }

        case ROLES.BRANCHMANAGER: {
            const manager = await BranchManager.findOne({ _id: id, isDeleted: false });
            if (!manager) throw new AppError("Branch Manager record not found", 404);
            branchIds = manager.branchId ? [manager.branchId] : [];
            break;
        }

        case ROLES.FINANCESTAFF: {
            const staff = await FinanceStaff.findOne({ _id: id, isDeleted: false });
            if (!staff) throw new AppError("Finance Staff record not found", 404);
            
            if (staff.fleetNumbers && staff.fleetNumbers.length > 0) {
                fleetNumbers = staff.fleetNumbers;
            } else {
                branchIds = staff.branchId ? [staff.branchId] : [];
            }
            break;
        }

        case ROLES.OPERATIONSTAFF: {
            const staff = await OperationStaff.findOne({ _id: id, isDeleted: false });
            if (!staff) throw new AppError("Operation Staff record not found", 404);
            
            if (staff.fleetNumbers && staff.fleetNumbers.length > 0) {
                fleetNumbers = staff.fleetNumbers;
            } else {
                branchIds = staff.branchId ? [staff.branchId] : [];
            }
            break;
        }

        case ROLES.WORKSHOPMANAGER:
        case ROLES.WORKSHOPSTAFF:
            throw new AppError("Category 3 Workshop accounts are excluded from financial collections datasets.", 403);

        default:
            throw new AppError("User role unauthorized for financial access", 403);
    }

    return { branchIds, fleetNumbers };
};

/**
 * Merges user implicit bounds with UI query parameters (explicit filters).
 */
const computeEffectiveQueryOptions = async (user, queryFilters) => {
    const { branchIds: implicitBranches, fleetNumbers: implicitFleets } = await resolveImplicitFilters(user);
    const { country, branch, startDate, endDate } = queryFilters;

    let effectiveBranchIds = implicitBranches;

    // Resolve country constraints from API filters
    if (country) {
        const countryBranches = await Branch.find({ country, isDeleted: false }).select("_id");
        const matchingBranchIds = countryBranches.map(b => b._id.toString());

        if (effectiveBranchIds) {
            // Intersect constraints
            effectiveBranchIds = effectiveBranchIds
                .map(id => id.toString())
                .filter(id => matchingBranchIds.includes(id));
        } else {
            effectiveBranchIds = matchingBranchIds;
        }
    }

    // Resolve direct branch constraint from API filters
    if (branch) {
        if (effectiveBranchIds) {
            const filterBranchStr = branch.toString();
            effectiveBranchIds = effectiveBranchIds
                .map(id => id.toString())
                .includes(filterBranchStr) ? [branch] : [];
        } else {
            effectiveBranchIds = [branch];
        }
    }

    // Date ranges
    const dateFilter = {};
    if (startDate) dateFilter.$gte = new Date(startDate);
    if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        dateFilter.$lte = end;
    }

    return {
        branchIds: effectiveBranchIds,
        fleetNumbers: implicitFleets,
        dateFilter: Object.keys(dateFilter).length > 0 ? dateFilter : null
    };
};

/**
 * Fetches all matching Invoices using constraints & populating needed relationships.
 */
const fetchRawInvoices = async (effectiveOptions, { includePastDateRange = false } = {}) => {
    const { branchIds, fleetNumbers, dateFilter } = effectiveOptions;

    const invoiceMatch = { isDeleted: false };
    if (dateFilter && !includePastDateRange) {
        invoiceMatch.dueDate = dateFilter; // Target by Due Date
    }

    const customerSearchCondition = { isDeleted: false };
    if (branchIds) {
        customerSearchCondition.branch = { $in: branchIds };
    }

    const vehicleSearchCondition = { isDeleted: false };
    if (fleetNumbers) {
        vehicleSearchCondition["basicDetails.fleetNumber"] = { $in: fleetNumbers };
    }

    // Fetch invoices with match criteria
    const invoices = await Invoice.find(invoiceMatch)
        .populate({
            path: "customer",
            select: "name branch customerId",
            populate: {
                path: "branch",
                select: "name country"
            },
            match: Object.keys(customerSearchCondition).length > 1 || branchIds ? customerSearchCondition : {}
        })
        .populate({
            path: "driver",
            select: "personalInfo branch"
        })
        .populate({
            path: "vehicle",
            select: "basicDetails.fleetNumber legalDocs.registrationNumber",
            match: Object.keys(vehicleSearchCondition).length > 1 || fleetNumbers ? vehicleSearchCondition : {}
        })
        .lean();

    // Post-filter based on populated results to secure constraints
    return invoices.filter(inv => {
        if (!inv.customer) return false; // Removed if doesn't match branch bounds
        if (fleetNumbers && (!inv.vehicle || !inv.vehicle.basicDetails?.fleetNumber)) return false; // Enforce fleet limit if staff restricted
        return true;
    });
};

exports.getOverview = async (user, queryFilters) => {
    const effectiveOptions = await computeEffectiveQueryOptions(user, queryFilters);
    
    // Retrieve the core dataset
    const currentInvoices = await fetchRawInvoices(effectiveOptions, { includePastDateRange: false });

    // Also pull wider overdue & historical context if UI specifies date bounds but we need lifetime overdue aggregations
    const allInvoices = (queryFilters.startDate || queryFilters.endDate) 
        ? await fetchRawInvoices({ ...effectiveOptions, dateFilter: null }, { includePastDateRange: true })
        : currentInvoices;

    const now = moment();
    const startOfMonth = moment().startOf("month");
    const endOfMonth = moment().endOf("month");

    let totalInvoiced = 0;
    let totalCollected = 0;
    let pendingCollected = 0;
    let overdueAmount = 0;
    let forecastAmount = 0;
    let mtdCollected = 0; // Month to date

    // Trend/Forecast buckets (group by month or week)
    const monthLabels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const trendLine = monthLabels.map(m => ({ label: m, collected: 0, expected: 0 }));

    // Process dataset for lifetime/general overview
    allInvoices.forEach(inv => {
        const invoiceDue = moment(inv.dueDate);
        
        // Expected trend aggregation for current year
        if (invoiceDue.year() === now.year()) {
            const mIdx = invoiceDue.month();
            trendLine[mIdx].expected += (inv.totalAmountDue || 0);
        }

        // Count all individual payments to capture Month-To-Date Collected amounts perfectly
        if (inv.payments && inv.payments.length > 0) {
            inv.payments.forEach(payment => {
                const paidDate = moment(payment.paidAt);
                if (paidDate.isBetween(startOfMonth, endOfMonth, null, "[]")) {
                    mtdCollected += (payment.amount || 0);
                }

                if (paidDate.year() === now.year()) {
                    const mIdx = paidDate.month();
                    trendLine[mIdx].collected += (payment.amount || 0);
                }
            });
        }

        // Overdue logic
        if (inv.status === "OVERDUE" || (inv.status !== "PAID" && inv.status !== "CANCELLED" && invoiceDue.isBefore(now))) {
            overdueAmount += (inv.balance || 0);
        }

        // Forecast Collections (Next 30 days future dues)
        if (inv.status !== "PAID" && inv.status !== "CANCELLED" && invoiceDue.isAfter(now) && invoiceDue.isBefore(moment().add(30, "days"))) {
            forecastAmount += (inv.balance || 0);
        }
    });

    // Process current bounded dataset
    currentInvoices.forEach(inv => {
        totalInvoiced += (inv.totalAmountDue || 0);
        totalCollected += (inv.amountPaid || 0);
        pendingCollected += (inv.balance || 0);
    });

    // Extract Top 5 Overdue Items
    const rawOverdueList = allInvoices.filter(inv => 
        inv.status === "OVERDUE" || (inv.status !== "PAID" && inv.status !== "CANCELLED" && moment(inv.dueDate).isBefore(now))
    );
    const recentOverdue = rawOverdueList
        .sort((a,b) => moment(a.dueDate).diff(moment(b.dueDate)))
        .slice(0, 5)
        .map(inv => ({
            id: inv._id,
            invoiceNumber: inv.invoiceNumber,
            customerId: inv.customer?._id,
            customerName: inv.customer?.name || "Unknown",
            driverId: inv.driver?._id,
            driverName: inv.driver?.personalInfo?.fullName || "N/A",
            vehicleId: inv.vehicle?._id,
            fleetNumber: inv.vehicle?.basicDetails?.fleetNumber || "N/A",
            dueDate: inv.dueDate,
            balance: inv.balance,
            daysOverdue: Math.max(0, now.diff(moment(inv.dueDate), "days"))
        }));

    // Extract Top 5 Upcoming Payments
    const rawUpcomingList = allInvoices.filter(inv => 
        inv.status !== "PAID" && inv.status !== "CANCELLED" && moment(inv.dueDate).isAfter(now)
    );
    const upcomingPayments = rawUpcomingList
        .sort((a,b) => moment(a.dueDate).diff(moment(b.dueDate)))
        .slice(0, 5)
        .map(inv => ({
            id: inv._id,
            invoiceNumber: inv.invoiceNumber,
            customerId: inv.customer?._id,
            customerName: inv.customer?.name || "Unknown",
            driverId: inv.driver?._id,
            driverName: inv.driver?.personalInfo?.fullName || "N/A",
            vehicleId: inv.vehicle?._id,
            fleetNumber: inv.vehicle?.basicDetails?.fleetNumber || "N/A",
            dueDate: inv.dueDate,
            totalDue: inv.totalAmountDue,
            balance: inv.balance
        }));

    return {
        metrics: {
            totalInvoiced,
            totalCollected,
            pendingCollected,
            overdueAmount,
            forecastAmount,
            mtdCollected
        },
        trend: trendLine,
        recentOverdue,
        upcomingPayments
    };
};

exports.getList = async (user, queryFilters) => {
    const { page = 1, limit = 20, status, search, listType } = queryFilters;
    
    // For Overdue and Upcoming, we ignore specific bounded date range selection by default
    // unless specifically requested, allowing a full operational view.
    const isSpecialView = listType === "OVERDUE" || listType === "UPCOMING";
    
    const effectiveOptions = await computeEffectiveQueryOptions(user, {
        ...queryFilters,
        startDate: isSpecialView ? null : queryFilters.startDate,
        endDate: isSpecialView ? null : queryFilters.endDate
    });
    
    const baseInvoices = await fetchRawInvoices(effectiveOptions, { includePastDateRange: isSpecialView });

    const now = moment();
    let filtered = baseInvoices;

    // Functional list specialization
    if (listType === "OVERDUE") {
        filtered = filtered.filter(inv => 
            inv.status === "OVERDUE" || (inv.status !== "PAID" && inv.status !== "CANCELLED" && moment(inv.dueDate).isBefore(now))
        );
    } else if (listType === "UPCOMING") {
        filtered = filtered.filter(inv => 
            inv.status !== "PAID" && inv.status !== "CANCELLED" && moment(inv.dueDate).isSameOrAfter(now)
        );
    }

    // Standard property filters
    if (status) {
        filtered = filtered.filter(i => i.status === status);
    }
    
    if (search) {
        const lowSearch = search.toLowerCase();
        filtered = filtered.filter(i => 
            i.invoiceNumber?.toLowerCase().includes(lowSearch) ||
            i.customer?.name?.toLowerCase().includes(lowSearch) ||
            i.customer?.customerId?.toLowerCase().includes(lowSearch) ||
            i.driver?.personalInfo?.fullName?.toLowerCase().includes(lowSearch) ||
            i.vehicle?.basicDetails?.fleetNumber?.toLowerCase().includes(lowSearch) ||
            i.vehicle?.legalDocs?.registrationNumber?.toLowerCase().includes(lowSearch)
        );
    }

    // Sort (Overdue: oldest aging first; Upcoming: soonest first; Ledgers: newest first)
    if (listType === "OVERDUE") {
        filtered.sort((a, b) => moment(a.dueDate).diff(moment(b.dueDate)));
    } else if (listType === "UPCOMING") {
        filtered.sort((a, b) => moment(a.dueDate).diff(moment(b.dueDate)));
    } else {
        filtered.sort((a, b) => moment(b.dueDate).diff(moment(a.dueDate)));
    }

    const totalCount = filtered.length;
    const pageInt = parseInt(page, 10);
    const limitInt = parseInt(limit, 10);
    const skip = (pageInt - 1) * limitInt;
    const paginated = filtered.slice(skip, skip + limitInt);

    const items = paginated.map(inv => ({
        id: inv._id,
        invoiceNumber: inv.invoiceNumber,
        customerId: inv.customer?._id,
        customerName: inv.customer?.name || "N/A",
        driverId: inv.driver?._id,
        driverName: inv.driver?.personalInfo?.fullName || "N/A",
        vehicleId: inv.vehicle?._id,
        vehicleNumber: inv.vehicle?.legalDocs?.registrationNumber || "N/A",
        fleetNumber: inv.vehicle?.basicDetails?.fleetNumber || "N/A",
        branch: inv.customer?.branch?.name || "N/A",
        country: inv.customer?.branch?.country || "N/A",
        dueDate: inv.dueDate,
        totalAmountDue: inv.totalAmountDue,
        amountPaid: inv.amountPaid,
        balance: inv.balance,
        status: inv.status,
        generatedAt: inv.generatedAt,
        daysOverdue: moment(inv.dueDate).isBefore(now) ? Math.max(0, now.diff(moment(inv.dueDate), "days")) : 0
    }));

    return {
        items,
        pagination: {
            total: totalCount,
            page: pageInt,
            limit: limitInt,
            pages: Math.ceil(totalCount / limitInt)
        }
    };
};
