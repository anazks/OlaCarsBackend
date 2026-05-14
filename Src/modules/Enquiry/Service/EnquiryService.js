const Enquiry = require('../Model/EnquiryModel');

const createEnquiry = async (data) => {
    try {
        const enquiry = new Enquiry(data);
        return await enquiry.save();
    } catch (error) {
        throw error;
    }
};

const getAllEnquiries = async (filter = {}) => {
    try {
        return await Enquiry.find(filter).sort({ createdAt: -1 });
    } catch (error) {
        throw error;
    }
};

const getComplaintsByDriver = async (driverId) => {
    try {
        return await Enquiry.find({ driverId, type: 'COMPLAINT' })
            .populate('branchId', 'name location')
            .sort({ createdAt: -1 });
    } catch (error) {
        throw error;
    }
};

module.exports = {
    createEnquiry,
    getAllEnquiries,
    getComplaintsByDriver
};
