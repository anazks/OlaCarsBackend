const Scrap = require("../Model/ScrapModel");
const { ROLES } = require("../../../shared/constants/roles");

exports.createScrap = async (req, res) => {
    try {
        const { partName, partNumber, quantity, description, status, type, currentAmount, buyerName } = req.body;

        if (!partName) {
            return res.status(400).json({ success: false, message: "Part Name is required" });
        }
        if (!quantity || quantity < 1) {
            return res.status(400).json({ success: false, message: "Quantity must be at least 1" });
        }
        if (!status || !["DISPOSED", "PENDING_DISPOSAL", "RECYCLED", "PENDING_SALE_APPROVAL"].includes(status)) {
            return res.status(400).json({ success: false, message: "Invalid or missing status" });
        }
        if (!type || !["Valuable", "Non Valuable"].includes(type)) {
            return res.status(400).json({ success: false, message: "Invalid or missing type" });
        }

        const scrappedBy = req.user.fullName || req.user.name || "Workshop Staff";
        const branch = req.user.branchId;

        const scrap = await Scrap.create({
            partName,
            partNumber,
            quantity,
            description,
            status: type === 'Valuable' ? 'PENDING_SALE_APPROVAL' : status,
            type,
            scrappedBy,
            branch,
            currentAmount: type === 'Valuable' ? currentAmount : undefined,
            buyerName: type === 'Valuable' ? buyerName : undefined,
            scrappedDate: new Date()
        });

        res.status(201).json({
            success: true,
            message: "Scrap item logged successfully",
            data: scrap
        });
    } catch (error) {
        console.error("[ERROR] createScrap:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.getScrapList = async (req, res) => {
    try {
        const baseQuery = {};

        // Scope by branch if user is branch-bound
        if (req.user.branchId) {
            baseQuery.branch = req.user.branchId;
        }

        // Apply filters
        if (req.query.status) {
            baseQuery.status = req.query.status;
        }

        if (req.query.type) {
            baseQuery.type = req.query.type;
        }

        // Apply search regex
        if (req.query.search) {
            const searchRegex = new RegExp(req.query.search, 'i');
            baseQuery.$or = [
                { partName: searchRegex },
                { partNumber: searchRegex },
                { scrappedBy: searchRegex }
            ];
        }

        const scrapItems = await Scrap.find(baseQuery).sort({ scrappedDate: -1 });

        res.status(200).json({
            success: true,
            data: scrapItems
        });
    } catch (error) {
        console.error("[ERROR] getScrapList:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.updateScrap = async (req, res) => {
    try {
        const { id } = req.params;
        const { currentAmount, buyerName, status, saleApproved, rejectionNote } = req.body;

        const scrap = await Scrap.findById(id);
        if (!scrap) {
            return res.status(404).json({ success: false, message: "Scrap item not found" });
        }

        if (currentAmount !== undefined) {
            if (currentAmount < 0) {
                return res.status(400).json({ success: false, message: "Current amount cannot be negative" });
            }
            scrap.currentAmount = currentAmount;
        }

        if (buyerName !== undefined) {
            scrap.buyerName = buyerName;
        }

        if (status !== undefined) {
            if (!["DISPOSED", "PENDING_DISPOSAL", "RECYCLED", "PENDING_SALE_APPROVAL", "REJECTED"].includes(status)) {
                return res.status(400).json({ success: false, message: "Invalid status value" });
            }
            scrap.status = status;
        }

        if (saleApproved !== undefined) {
            scrap.saleApproved = saleApproved;
        }

        if (rejectionNote !== undefined) {
            scrap.rejectionNote = rejectionNote;
        }

        await scrap.save();

        res.status(200).json({
            success: true,
            message: "Scrap item updated successfully",
            data: scrap
        });
    } catch (error) {
        console.error("[ERROR] updateScrap:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.deleteScrap = async (req, res) => {
    try {
        const { id } = req.params;
        const scrap = await Scrap.findByIdAndDelete(id);
        if (!scrap) {
            return res.status(404).json({ success: false, message: "Scrap item not found" });
        }
        res.status(200).json({
            success: true,
            message: "Scrap item deleted successfully"
        });
    } catch (error) {
        console.error("[ERROR] deleteScrap:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

