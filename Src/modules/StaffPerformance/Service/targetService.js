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

    // 1. Base filters from query
    if (filters.targetType) query.targetType = filters.targetType;
    if (filters.targetId) query.targetId = filters.targetId;
    if (filters.category) query.category = filters.category;
    
    if (filters.startDate || filters.endDate) {
        query.startDate = {};
        if (filters.startDate) query.startDate.$gte = new Date(filters.startDate);
        if (filters.endDate) query.startDate.$lte = new Date(filters.endDate);
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
                { assignedBy: user.id }
            ];
        } else {
            // Individual staff see targets assigned to them
            query.targetType = "STAFF";
            query.targetId = user.id;
        }
    }

    return await Target.find(query).populate("assignedBy", "fullName").sort({ startDate: -1 });
};
