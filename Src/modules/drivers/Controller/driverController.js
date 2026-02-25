
const { addDriverService, editDriverService, deleteDriverService, getAllDriver } = require("../Repo/DriverRepo");
const addDriver = async (req, res) => {
    try {
        const driverData = req.body;
        console.log("addDriver called with body:", req.body); // Debug log
        const newDriver = await addDriverService(driverData);
        return res.status(201).json({
            success: true,
            data: newDriver
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        })
    }
}
const editDriver = async (req, res) => {
    try {
        const driverData = req.body;
        console.log("editDriver called with body:", req.body); // Debug log
        const updatedDriver = await editDriverService(driverData);
        return res.status(200).json({
            success: true,
            data: updatedDriver
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        })
    }
}
const deleteDriver = async (req, res) => {
    try {
        const driverId = req.body._id;
        console.log("deleteDriver called with body:", req.body); // Debug log
        console.log("deleteDriver called with id:", driverId); // Debug log
        await deleteDriverService(driverId);
        return res.status(200).json({
            success: true,
            message: "Driver deleted successfully"
        });
    } catch (error) {
        return res.status(500).json({   
            success: false,
            message: error.message
        })
    }
}
const getAllDrivers = async (req, res) => {
    try {
        // Placeholder for fetching drivers from the database
        const drivers = await getAllDriver() // Replace with actual data fetching logic
        return res.status(200).json({
            success: true,
            data: drivers
        });
    }
    catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        })
    }
}
module.exports = {
    addDriver,
    editDriver,
    deleteDriver,
    getAllDrivers
}
