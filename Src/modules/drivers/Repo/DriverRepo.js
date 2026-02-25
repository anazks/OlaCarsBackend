import driverModel from "../Model/DriverModel.js";

export const addDriverService = async (driverData) => {
    try {
        // Simulate adding driver to the database
        const newDriver = await driverModel.create(driverData);
        return newDriver;
    } catch (error) {
        throw error;
    }
}

export const editDriverService = async (driverData) => {
    try {
        const { id, ...updateData } = driverData;
        const updatedDriver = await driverModel.findByIdAndUpdate(id, updateData, { new: true });
        return updatedDriver;
    } catch (error) { 
               throw error;
    }
}

export const deleteDriverService = async (driverId) => {
    try {
        console.log("Deleting driver with ID:", driverId); // Debug log
        await driverModel.findByIdAndUpdate(driverId, { isDeleted: true }, { new: true });
    } catch (error) {
        throw error;
    }
}

export const getAllDriver = async () => {
    try {
        const drivers = await driverModel.find();
        return drivers;
    } catch (error) {
        throw error;
    }
}