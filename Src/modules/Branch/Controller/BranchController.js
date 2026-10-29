const BranchService = require('../Service/BranchService.js');
const BranchPdfService = require('../Service/BranchPdfService.js');
const uploadToS3 = require('../../../utils/uploadToS3');
const uploadLocal = require('../../../utils/uploadLocal');

const uploadBranchFiles = async (req) => {
    const filesToUpload = [];
    if (req.files && Array.isArray(req.files)) {
        filesToUpload.push(...req.files);
    } else if (req.files && typeof req.files === "object") {
        Object.values(req.files).forEach((arr) => {
            if (Array.isArray(arr)) filesToUpload.push(...arr);
        });
    } else if (req.file) {
        filesToUpload.push(req.file);
    }

    const uploadedDocs = [];
    for (const file of filesToUpload) {
        let fileUrl;
        try {
            fileUrl = await uploadToS3(file, "branches/documents");
        } catch (s3Error) {
            console.log("[Branch Upload] S3 upload failed, falling back to local storage:", s3Error.message);
            fileUrl = uploadLocal(file, "branches/documents");
        }
        uploadedDocs.push({
            name: file.originalname,
            url: fileUrl,
            mimeType: file.mimetype,
            size: file.size,
            uploadedAt: new Date()
        });
    }
    return uploadedDocs;
};

const addBranch = async (req, res) => {
    try {
        const branchData = { ...req.body };
        branchData.createdBy = req.user.id;
        branchData.creatorRole = req.user.role;

        let initialDocs = [];
        if (branchData.documents) {
            if (typeof branchData.documents === 'string') {
                try {
                    initialDocs = JSON.parse(branchData.documents);
                } catch (e) {
                    initialDocs = [];
                }
            } else if (Array.isArray(branchData.documents)) {
                initialDocs = branchData.documents;
            }
        }

        const newUploadedDocs = await uploadBranchFiles(req);
        branchData.documents = [...initialDocs, ...newUploadedDocs];

        const newBranch = await BranchService.create(branchData);
        return res.status(201).json({ success: true, data: newBranch });
    } catch (error) {
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({ success: false, message: error.message });
    }
};

const getBranches = async (req, res) => {
    try {
        const queryParams = { ...req.query };
        const options = {};
        
        // If user is FINANCESTAFF, restrict branches to their country
        if (req.user.role === 'FINANCESTAFF' && req.user.branchId) {
            const staffBranch = await BranchService.getById(req.user.branchId);
            if (staffBranch && staffBranch.country) {
                options.baseQuery = { country: staffBranch.country };
            }
        }

        const result = await BranchService.getAll(queryParams, options);
        return res.status(200).json({ 
            success: true, 
            data: result.data,
            pagination: {
                total: result.total,
                page: result.page,
                limit: result.limit,
                totalPages: result.totalPages
            }
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

const getBranchById = async (req, res) => {
    try {
        const branch = await BranchService.getById(req.params.id);
        if (!branch) return res.status(404).json({ success: false, message: 'Branch not found' });
        return res.status(200).json({ success: true, data: branch });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

const editBranch = async (req, res) => {
    try {
        const { id, ...data } = req.body;

        let existingDocs = [];
        if (data.existingDocuments) {
            if (typeof data.existingDocuments === 'string') {
                try {
                    existingDocs = JSON.parse(data.existingDocuments);
                } catch (e) {
                    existingDocs = [];
                }
            } else if (Array.isArray(data.existingDocuments)) {
                existingDocs = data.existingDocuments;
            }
        } else if (data.documents) {
            if (typeof data.documents === 'string') {
                try {
                    existingDocs = JSON.parse(data.documents);
                } catch (e) {
                    existingDocs = [];
                }
            } else if (Array.isArray(data.documents)) {
                existingDocs = data.documents;
            }
        }

        const newUploadedDocs = await uploadBranchFiles(req);
        if (newUploadedDocs.length > 0 || req.body.existingDocuments !== undefined || req.body.documents !== undefined) {
            data.documents = [...existingDocs, ...newUploadedDocs];
        }

        const updatedBranch = await BranchService.update(id, data);
        return res.status(200).json({ success: true, data: updatedBranch });
    } catch (error) {
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({ success: false, message: error.message });
    }
};

const deleteBranch = async (req, res) => {
    try {
        await BranchService.remove(req.params.id);
        return res.status(200).json({ success: true, message: 'Branch deleted successfully' });
    } catch (error) {
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({ success: false, message: error.message });
    }
};

const getBranchExtendedDetails = async (req, res) => {
    try {
        const filters = {
            startDate: req.query.startDate,
            endDate: req.query.endDate
        };
        const branchDetails = await BranchService.getExtendedDetails(req.params.id, filters);
        if (!branchDetails) return res.status(404).json({ success: false, message: 'Branch not found' });
        return res.status(200).json({ success: true, data: branchDetails });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

const getPublicBranchList = async (req, res) => {
    try {
        const result = await BranchService.getAll({ status: 'ACTIVE', limit: 100 }, {});
        const branches = result.data.map(b => ({ _id: b._id, name: b.name }));
        return res.status(200).json({ success: true, data: branches });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

const exportBranchPdf = async (req, res) => {
    try {
        const filters = {
            startDate: req.query.startDate,
            endDate: req.query.endDate
        };
        const branchDetails = await BranchService.getExtendedDetails(req.params.id, filters);
        if (!branchDetails) return res.status(404).json({ success: false, message: 'Branch not found' });

        res.setHeader("Content-Type", "application/pdf");
        const dateStr = new Date().toISOString().split('T')[0];
        const branchCode = branchDetails.branch?.code ? branchDetails.branch.code.toLowerCase() : "branch";
        res.setHeader("Content-Disposition", `inline; filename="branch_${branchCode}_report_${dateStr}.pdf"`);

        BranchPdfService.generateBranchPdf(branchDetails, filters, res);
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = {
    addBranch,
    editBranch,
    deleteBranch,
    getBranches,
    getBranchById,
    getBranchExtendedDetails,
    getPublicBranchList,
    exportBranchPdf
};