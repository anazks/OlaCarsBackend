const {
    createPart,
    getParts,
    getPartById,
    updatePart,
    deletePart,
    restockPart,
    getLowStockParts,
} = require("../Repo/InventoryPartRepo");
const { checkAndReserve, releaseReservation, confirmInstallation } = require("../Service/InventoryService");

/**
 * Create a new inventory part.
 * @route POST /api/inventory
 */
const createPartHandler = async (req, res) => {
    try {
        const data = req.body;
        data.createdBy = req.user.id;
        data.creatorRole = req.user.role;

        const part = await createPart(data);
        return res.status(201).json({ success: true, data: part });
    } catch (error) {
        const statusCode = error.cause || 500;
        return res.status(statusCode).json({ success: false, message: error.message });
    }
};

/**
 * Get all inventory parts with filters.
 * @route GET /api/inventory
 */
const getPartsHandler = async (req, res) => {
    try {
        const parts = await getParts(req.query);
        return res.status(200).json({ success: true, data: parts });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Get a single part by ID.
 * @route GET /api/inventory/:id
 */
const getPartByIdHandler = async (req, res) => {
    try {
        const part = await getPartById(req.params.id);
        if (!part) return res.status(404).json({ success: false, message: "Part not found" });
        return res.status(200).json({ success: true, data: part });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Update a part.
 * @route PUT /api/inventory/:id
 */
const updatePartHandler = async (req, res) => {
    try {
        const part = await updatePart(req.params.id, req.body);
        if (!part) return res.status(404).json({ success: false, message: "Part not found" });
        return res.status(200).json({ success: true, data: part });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Soft-delete a part.
 * @route DELETE /api/inventory/:id
 */
const deletePartHandler = async (req, res) => {
    try {
        const part = await deletePart(req.params.id);
        if (!part) return res.status(404).json({ success: false, message: "Part not found" });
        return res.status(200).json({ success: true, message: "Part deactivated", data: part });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Restock a part (add quantity).
 * @route PUT /api/inventory/:id/restock
 */
const restockPartHandler = async (req, res) => {
    try {
        const { quantity } = req.body;
        if (!quantity || quantity <= 0) {
            return res.status(400).json({ success: false, message: "Quantity must be greater than 0" });
        }
        const part = await restockPart(req.params.id, quantity);
        if (!part) return res.status(404).json({ success: false, message: "Part not found" });
        return res.status(200).json({ success: true, data: part });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Reserve stock for a work order.
 * @route PUT /api/inventory/:id/reserve
 */
const reserveStockHandler = async (req, res) => {
    try {
        const { quantity } = req.body;
        if (!quantity || quantity <= 0) {
            return res.status(400).json({ success: false, message: "Quantity must be greater than 0" });
        }
        const result = await checkAndReserve(req.params.id, quantity);
        if (!result.success) {
            return res.status(400).json({ success: false, message: result.message, shortfall: result.shortfall });
        }
        return res.status(200).json({ success: true, data: result.part });
    } catch (error) {
        const statusCode = error.cause || 500;
        return res.status(statusCode).json({ success: false, message: error.message });
    }
};

/**
 * Release reserved stock.
 * @route PUT /api/inventory/:id/release
 */
const releaseStockHandler = async (req, res) => {
    try {
        const { quantity } = req.body;
        const part = await releaseReservation(req.params.id, quantity);
        return res.status(200).json({ success: true, data: part });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Confirm part installation (deducts stock).
 * @route PUT /api/inventory/:id/install
 */
const installPartHandler = async (req, res) => {
    try {
        const { quantity } = req.body;
        const part = await confirmInstallation(req.params.id, quantity);
        return res.status(200).json({ success: true, data: part });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Get low-stock parts for a branch.
 * @route GET /api/inventory/low-stock/:branchId
 */
const getLowStockHandler = async (req, res) => {
    try {
        const parts = await getLowStockParts(req.params.branchId);
        return res.status(200).json({ success: true, data: parts });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = {
    createPartHandler,
    getPartsHandler,
    getPartByIdHandler,
    updatePartHandler,
    deletePartHandler,
    restockPartHandler,
    reserveStockHandler,
    releaseStockHandler,
    installPartHandler,
    getLowStockHandler,
};
