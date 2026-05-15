const EnquiryService = require('../Service/EnquiryService');

const registerEnquiry = async (req, res) => {
    console.log('registerEnquiry controller hit', req.body);
    try {
        const payload = { ...req.body };
        // If user is authenticated, link the driverId
        if (req.user && req.user.id) {
            payload.driverId = req.user.id;
        }
        
        const enquiry = await EnquiryService.createEnquiry(payload);
        res.status(201).json({
            status: 'success',
            message: 'Enquiry submitted successfully',
            data: enquiry
        });
    } catch (error) {
        res.status(400).json({
            status: 'error',
            message: error.message
        });
    }
};

const getEnquiries = async (req, res) => {
    try {
        const enquiries = await EnquiryService.getAllEnquiries(req.query);
        res.status(200).json({
            status: 'success',
            data: enquiries
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
};

const getMyComplaints = async (req, res) => {
    try {
        const driverId = req.user.id;
        const complaints = await EnquiryService.getComplaintsByDriver(driverId);
        res.status(200).json({
            status: 'success',
            data: complaints
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
};

module.exports = {
    registerEnquiry,
    getEnquiries,
    getMyComplaints
};
