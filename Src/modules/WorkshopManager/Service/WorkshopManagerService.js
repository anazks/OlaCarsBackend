const WorkshopManagerRepo = require("../Repo/WorkshopManagerRepo");

exports.addWorkshopManagerService = async (data) => {
    return await WorkshopManagerRepo.addWorkshopManagerRepo(data);
};

exports.editWorkshopManagerService = async (data) => {
    return await WorkshopManagerRepo.editWorkshopManagerRepo(data);
};

exports.deleteWorkshopManagerService = async (id) => {
    return await WorkshopManagerRepo.deleteWorkshopManagerRepo(id);
};

exports.getWorkshopManagersService = async (queryParams, options) => {
    return await WorkshopManagerRepo.getWorkshopManagersRepo(queryParams, options);
};

exports.getWorkshopManagerByIdService = async (id) => {
    return await WorkshopManagerRepo.getWorkshopManagerByIdRepo(id);
};

exports.loginWorkshopManagerService = async (email, password) => {
    return await WorkshopManagerRepo.loginWorkshopManagerRepo(email, password);
};
