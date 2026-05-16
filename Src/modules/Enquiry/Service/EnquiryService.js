const Enquiry = require('../Model/EnquiryModel');
const MailService = require('../../../services/MailService');

const createEnquiry = async (data) => {
    try {
        const enquiry = new Enquiry(data);
        const savedEnquiry = await enquiry.save();
        
        // Trigger email alert in background
        MailService.sendGeneralEnquiryAlert(savedEnquiry).catch(err => {
            console.error('[EnquiryService] Async email alert failed:', err.message);
        });

        return savedEnquiry;
    } catch (error) {
        throw error;
    }
};

const getAllEnquiries = async (queryParams = {}) => {
    try {
        const { limit, page, sort, ...filter } = queryParams;
        const queryLimit = limit ? parseInt(limit, 10) : 0;
        
        let query = Enquiry.find(filter).populate('branchId', 'name location').sort({ createdAt: -1 });
        if (queryLimit > 0) {
            query = query.limit(queryLimit);
        }
        return await query;
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
