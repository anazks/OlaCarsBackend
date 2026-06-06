const WriteOff = require("../Model/WriteOffModel");
const { InventoryPart } = require("../Model/InventoryPartModel");
const { PartTransaction } = require("../Model/PartTransactionModel");
const AppError = require("../../../shared/utils/AppError");

exports.createWriteOff = async (req, res) => {
    try {
        const { partId, quantity, reason, documents } = req.body;

        if (!partId) {
            return res.status(400).json({ success: false, message: "Part ID is required" });
        }
        if (!quantity || quantity < 1) {
            return res.status(400).json({ success: false, message: "Quantity must be at least 1" });
        }
        if (!reason) {
            return res.status(400).json({ success: false, message: "Reason is required" });
        }

        const part = await InventoryPart.findById(partId);
        if (!part) {
            return res.status(404).json({ success: false, message: "Inventory part not found" });
        }

        if (part.quantityOnHand < quantity) {
            return res.status(400).json({
                success: false,
                message: `Insufficient stock available. Only ${part.quantityOnHand} available, but requested to write off ${quantity}.`
            });
        }

        const requestNumber = `WOFF-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;
        const unitCost = part.unitCost;
        const amountLoss = quantity * unitCost;
        const branch = part.branchId;
        const requestedBy = req.user.id;
        const requestedByRole = req.user.role;

        const writeOff = await WriteOff.create({
            requestNumber,
            part: partId,
            quantity,
            unitCost,
            amountLoss,
            reason,
            documents: documents || [],
            status: "PENDING",
            branch,
            requestedBy,
            requestedByRole
        });

        res.status(201).json({
            success: true,
            message: "Write-off request logged successfully and is pending approval",
            data: writeOff
        });
    } catch (error) {
        console.error("[ERROR] createWriteOff:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.getWriteOffList = async (req, res) => {
    try {
        const query = {};

        // Scope by branch if user is branch-bound
        if (req.user.branchId) {
            query.branch = req.user.branchId;
        }

        // Apply filters
        if (req.query.status) {
            query.status = req.query.status;
        }

        // Apply search regex on part name
        if (req.query.search) {
            const parts = await InventoryPart.find({
                partName: { $regex: req.query.search, $options: "i" }
            }).select("_id");
            const partIds = parts.map(p => p._id);
            query.part = { $in: partIds };
        }

        const writeOffs = await WriteOff.find(query)
            .populate("part")
            .sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            data: writeOffs
        });
    } catch (error) {
        console.error("[ERROR] getWriteOffList:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.approveWriteOff = async (req, res) => {
    try {
        const { id } = req.params;
        const { approvalNote } = req.body;

        const writeOff = await WriteOff.findById(id);
        if (!writeOff) {
            return res.status(404).json({ success: false, message: "Write-off request not found" });
        }

        if (writeOff.status !== "PENDING") {
            return res.status(400).json({ success: false, message: `Cannot approve. Current status is ${writeOff.status}` });
        }

        const part = await InventoryPart.findById(writeOff.part);
        if (!part) {
            return res.status(404).json({ success: false, message: "Inventory part not found" });
        }

        if (part.quantityOnHand < writeOff.quantity) {
            return res.status(400).json({
                success: false,
                message: `Insufficient stock remaining in inventory. Part has only ${part.quantityOnHand} on hand, but write-off requires ${writeOff.quantity}.`
            });
        }

        // Deduct from inventory
        part.quantityOnHand -= writeOff.quantity;
        await part.save();

        // Create transaction log
        await PartTransaction.create({
            partId: writeOff.part,
            branchId: writeOff.branch,
            transactionType: "ADJUSTMENT",
            quantity: -writeOff.quantity,
            performedBy: req.user.id,
            role: req.user.role,
            notes: `Write-off approved: ${writeOff.requestNumber}. Reason: ${writeOff.reason}. Note: ${approvalNote || 'None'}`
        });

        // Update write-off status
        writeOff.status = "APPROVED";
        writeOff.approvedBy = req.user.id;
        writeOff.approvedByRole = req.user.role;
        writeOff.approvalNote = approvalNote || "";
        await writeOff.save();

        res.status(200).json({
            success: true,
            message: "Write-off request approved and stock deducted successfully",
            data: writeOff
        });
    } catch (error) {
        console.error("[ERROR] approveWriteOff:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.rejectWriteOff = async (req, res) => {
    try {
        const { id } = req.params;
        const { rejectionNote } = req.body;

        if (!rejectionNote) {
            return res.status(400).json({ success: false, message: "Rejection note is required" });
        }

        const writeOff = await WriteOff.findById(id);
        if (!writeOff) {
            return res.status(404).json({ success: false, message: "Write-off request not found" });
        }

        if (writeOff.status !== "PENDING") {
            return res.status(400).json({ success: false, message: `Cannot reject. Current status is ${writeOff.status}` });
        }

        writeOff.status = "REJECTED";
        writeOff.approvedBy = req.user.id;
        writeOff.approvedByRole = req.user.role;
        writeOff.rejectionNote = rejectionNote;
        await writeOff.save();

        res.status(200).json({
            success: true,
            message: "Write-off request rejected successfully",
            data: writeOff
        });
    } catch (error) {
        console.error("[ERROR] rejectWriteOff:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};
