const Target = require("../Model/TargetModel");

/**
 * Assign or update a target
 */
exports.assignTarget = async (targetData, user) => {
    const { targetType, targetId, category, targetValue, period, startDate, endDate, notes } = targetData;

    // Determine the assignedByRoleModel based on the user's role
    // This assumes roles are mapped to specific models
    let assignedByRoleModel = "";
    const role = user.role.toUpperCase().replace(" ", "");
    
    switch (role) {
        case "ADMIN":
        case "SUPERADMIN":
            assignedByRoleModel = "Admin";
            break;
        case "COUNTRYMANAGER":
            assignedByRoleModel = "CountryManager";
            break;
        case "BRANCHMANAGER":
            assignedByRoleModel = "BranchManager";
            break;
        case "FINANCEADMIN":
            assignedByRoleModel = "FinanceAdmin";
            break;
        case "OPERATIONADMIN":
            assignedByRoleModel = "OperationAdmin";
            break;
        default:
            throw new Error("Unauthorized to assign targets");
    }

    // Check if target already exists for this period/category
    let target = await Target.findOne({
        targetType,
        targetId,
        category,
        startDate: new Date(startDate),
        endDate: new Date(endDate)
    });

    if (target) {
        target.targetValue = targetValue;
        target.notes = notes;
        target.assignedBy = user.id;
        target.assignedByRole = user.role;
        target.assignedByRoleModel = assignedByRoleModel;
        await target.save();
    } else {
        target = new Target({
            targetType,
            targetId,
            category,
            targetValue,
            period: period || "MONTHLY",
            startDate: new Date(startDate),
            endDate: new Date(endDate),
            assignedBy: user.id,
            assignedByRole: user.role,
            assignedByRoleModel,
            notes
        });
        await target.save();
    }

    return target;
};

/**
 * Get targets based on filters and user role
 */
exports.getTargets = async (filters, user) => {
    const query = {};
    const role = user.role.toUpperCase().replace(" ", "");

    const page = parseInt(filters.page);
    const limit = parseInt(filters.limit) || 10;

    // 1. Base filters from query
    if (filters.targetType) query.targetType = filters.targetType;
    if (filters.targetId) query.targetId = filters.targetId;
    if (filters.category) query.category = filters.category;
    
    if (filters.startDate || filters.endDate) {
        query.startDate = {};
        if (filters.startDate) query.startDate.$gte = new Date(filters.startDate);
        if (filters.endDate) query.startDate.$lte = new Date(filters.endDate);
    }

    if (filters.dateFrom || filters.dateTo) {
        query.endDate = {};
        if (filters.dateFrom) query.endDate.$gte = new Date(filters.dateFrom);
        if (filters.dateTo) {
            let toDate = new Date(filters.dateTo);
            toDate.setHours(23, 59, 59, 999);
            query.endDate.$lte = toDate;
        }
    }

    // 2. Role-based jurisdiction filtering
    // Admins see everything. Others are restricted.
    if (!["ADMIN", "SUPERADMIN", "FINANCEADMIN", "OPERATIONADMIN"].includes(role)) {
        if (role === "COUNTRYMANAGER") {
            // Country Manager sees targets for their country OR targets they assigned
            query.$or = [
                { targetType: "COUNTRY", targetId: user.country },
                { assignedBy: user.id }
            ];
        } else if (role === "BRANCHMANAGER") {
            // Branch Manager sees targets for their branch OR targets they assigned
            query.$or = [
                { targetType: "BRANCH", targetId: user.branchId },
                { targetType: "STAFF", targetId: user.id },
                { assignedBy: user.id }
            ];
        } else {
            // OPERATIONSTAFF, FINANCESTAFF, etc.
            const orConditions = [
                { targetType: "STAFF", targetId: user.id },
                { assignedBy: user.id }
            ];
            if (user.branchId) {
                orConditions.push({ targetType: "BRANCH", targetId: user.branchId.toString() });
            }
            query.$or = orConditions;
        }
    }

    if (filters.status) {
        if (filters.status === 'PENDING') {
            query.$and = query.$and || [];
            query.$and.push({
                $or: [{ status: 'PENDING' }, { status: { $exists: false } }, { status: null }]
            });
        } else {
            query.status = filters.status;
        }
    }

    console.log(`[TargetService] Query:`, JSON.stringify(query));
    
    if (page) {
        const skip = (page - 1) * limit;
        const totalItems = await Target.countDocuments(query);
        const results = await Target.find(query).populate("assignedBy", "fullName").sort({ startDate: -1 }).skip(skip).limit(limit);
        console.log(`[TargetService] Found ${results.length} targets (Paginated)`);
        
        return {
            data: results,
            pagination: {
                totalItems,
                totalPages: Math.ceil(totalItems / limit),
                currentPage: page,
                limit
            }
        };
    } else {
        const results = await Target.find(query).populate("assignedBy", "fullName").sort({ startDate: -1 });
        console.log(`[TargetService] Found ${results.length} targets (All)`);
        return { data: results };
    }
};

/**
 * Update target status
 */
exports.updateTargetStatus = async (targetId, status, user) => {
    const target = await Target.findById(targetId);
    if (!target) {
        throw new Error("Target not found");
    }

    // Authorization check: Only assignedTo or assignedBy can update?
    // For now, let's allow anyone who can see it to update it if they are the target
    // In a real scenario, we'd verify user.id matches targetId or assignedBy
    
    target.status = status;
    if (status === "COMPLETED") {
        target.completedAt = new Date();
    } else {
        target.completedAt = null;
    }

    await target.save();
    return target;
};

/**
 * Get task stats for dashboard
 */
exports.getDashboardTaskStats = async (user) => {
    const role = user.role.toUpperCase().replace(" ", "");
    const now = new Date();
    
    // Use the same jurisdiction logic as getTargets
    const query = {};
    if (!["ADMIN", "SUPERADMIN", "FINANCEADMIN", "OPERATIONADMIN"].includes(role)) {
        if (role === "COUNTRYMANAGER") {
            query.$or = [
                { targetType: "COUNTRY", targetId: user.country },
                { assignedBy: user.id }
            ];
        } else if (role === "BRANCHMANAGER") {
            query.$or = [
                { targetType: "BRANCH", targetId: user.branchId },
                { targetType: "STAFF", targetId: user.id },
                { assignedBy: user.id }
            ];
        } else {
            const orConditions = [
                { targetType: "STAFF", targetId: user.id },
                { assignedBy: user.id }
            ];
            if (user.branchId) {
                orConditions.push({ targetType: "BRANCH", targetId: user.branchId.toString() });
            }
            query.$or = orConditions;
        }
    }

    const targets = await Target.find(query);

    const stats = {
        assigned: targets.length,
        overdue: targets.filter(t => t.status !== 'COMPLETED' && new Date(t.endDate) < now).length,
        upcoming: targets.filter(t => t.status !== 'COMPLETED' && new Date(t.endDate) >= now).length
    };

    return stats;
};
