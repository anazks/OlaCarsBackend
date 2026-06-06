const WorkshopService = require("../Service/WorkshopService.js");

exports.addWorkshop = async (req, res) => {
  try {
    const data = { ...req.body };
    data.createdBy = req.user.id;
    data.creatorRole = req.user.role;
    const workshop = await WorkshopService.create(data);
    return res.status(201).json({ success: true, data: workshop });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return res
      .status(statusCode)
      .json({ success: false, message: error.message });
  }
};

exports.getWorkshops = async (req, res) => {
  try {
    const queryParams = { ...req.query };
    const result = await WorkshopService.getAll(queryParams);
    return res.status(200).json({
      success: true,
      data: result.data,
      pagination: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.getWorkshopById = async (req, res) => {
  try {
    const workshop = await WorkshopService.getById(req.params.id);
    if (!workshop) {
      return res
        .status(404)
        .json({ success: false, message: "Workshop not found" });
    }
    return res.status(200).json({ success: true, data: workshop });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.editWorkshop = async (req, res) => {
  try {
    const updated = await WorkshopService.update(req.params.id, req.body);
    return res.status(200).json({ success: true, data: updated });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return res
      .status(statusCode)
      .json({ success: false, message: error.message });
  }
};

exports.deleteWorkshop = async (req, res) => {
  try {
    await WorkshopService.remove(req.params.id);
    return res
      .status(200)
      .json({ success: true, message: "Workshop deleted successfully" });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return res
      .status(statusCode)
      .json({ success: false, message: error.message });
  }
};
