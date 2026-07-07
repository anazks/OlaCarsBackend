const FleetRepo = require('../Repo/FleetRepo');
const Fleet = require('../Model/FleetModel');

exports.createFleet = async (data) => {
    return await FleetRepo.addFleet(data);
};

exports.getAllFleets = async (queryParams, options) => {
    return await FleetRepo.getFleets(queryParams, options);
};

exports.getFleetById = async (id) => {
    return await FleetRepo.getFleetById(id);
};

exports.updateFleet = async (id, updateData) => {
    return await FleetRepo.updateFleet(id, updateData);
};

exports.deleteFleet = async (id) => {
    return await FleetRepo.deleteFleet(id);
};

/**
 * Generates the next numeric fleet number based on existing Fleet documents.
 */
exports.generateNextFleetNumber = async () => {
    try {
        const result = await Fleet.aggregate([
            { $match: { fleetNumber: { $regex: /^\d+$/ }, isDeleted: { $ne: true } } },
            { $project: { fleetNum: { $toInt: "$fleetNumber" } } },
            { $sort: { fleetNum: -1 } },
            { $limit: 1 }
        ]);

        if (result.length === 0) {
            return "101";
        }

        return (result[0].fleetNum + 1).toString();
    } catch (error) {
        console.error('Error generating next fleet number:', error);
        throw error;
    }
};
