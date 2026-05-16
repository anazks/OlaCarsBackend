const getPresignedUrl = require("../../../utils/getPresignedUrl");

/**
 * Handle file downloads by generating a presigned URL with attachment disposition.
 * @route GET /api/files/download
 */
const downloadFile = async (req, res) => {
    try {
        const { url, filename } = req.query;
        console.log("[FILE DOWNLOAD DEBUG] Raw URL received:", url);
        if (!url) return res.status(400).json({ success: false, message: "URL is required" });

        // Extract a default filename from the URL if not provided
        const defaultName = url.split('/').pop().split('?')[0] || "download";
        const finalName = filename || defaultName;

        // Generate the "Force Download" URL
        const downloadUrl = await getPresignedUrl(url, 300, finalName); // Valid for 5 mins

        // Redirect the browser to the download link
        return res.redirect(downloadUrl);
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = { downloadFile };
