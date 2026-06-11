const GpsService = require("../Service/GpsService");

/**
 * GET list of all vehicles connected to GPS tracking
 */
async function getGpsVehicles(req, res) {
    try {
        const vehicles = await GpsService.getVehiclesList();
        return res.status(200).json({
            success: true,
            data: vehicles
        });
    } catch (error) {
        console.error("[GPS Controller Vehicles Error]", error);
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to retrieve GPS devices from server."
        });
    }
}

/**
 * GET real-time location metrics for specified IMEIs or the entire fleet
 */
async function getGpsLocations(req, res) {
    try {
        let imeis = req.query.imeis;
        if (!imeis) {
            console.log("[GPS Controller] No query IMEIs. Collecting all registered device IMEIs...");
            const vehicles = await GpsService.getVehiclesList();
            if (vehicles && vehicles.length > 0) {
                imeis = vehicles.map(v => v.imei).join(",");
            }
        }

        if (!imeis) {
            return res.status(200).json({
                success: true,
                data: []
            });
        }

        const locations = await GpsService.getDevicesLocations(imeis);
        return res.status(200).json({
            success: true,
            data: locations
        });
    } catch (error) {
        console.error("[GPS Controller Location Error]", error);
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to retrieve GPS location data from Jimi server."
        });
    }
}

/**
 * GET live streaming page URL for a specific device by IMEI
 */
async function getDeviceLiveStreamingUrl(req, res) {
    try {
        const { imei } = req.query;
        if (!imei) {
            return res.status(400).json({
                success: false,
                message: "IMEI is required to fetch live streaming URL."
            });
        }

        const streamUrl = await GpsService.getDeviceLiveStreamingUrl(imei);
        if (!streamUrl) {
            return res.status(404).json({
                success: false,
                message: "No live streaming URL returned for this device."
            });
        }

        return res.status(200).json({
            success: true,
            data: streamUrl
        });
    } catch (error) {
        console.error("[GPS Controller Live Stream Error]", error);
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to retrieve live streaming URL."
        });
    }
}

/**
 * GET media event page URL for a specific device by IMEI
 */
async function getDeviceMediaEventUrl(req, res) {
    try {
        const { imei } = req.query;
        if (!imei) {
            return res.status(400).json({
                success: false,
                message: "IMEI is required to fetch media event URL."
            });
        }

        const streamUrl = await GpsService.getDeviceMediaEventUrl(imei);
        if (!streamUrl) {
            return res.status(404).json({
                success: false,
                message: "No media event URL returned for this device."
            });
        }

        return res.status(200).json({
            success: true,
            data: streamUrl
        });
    } catch (error) {
        console.error("[GPS Controller Media Event Error]", error);
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to retrieve media event URL."
        });
    }
}

module.exports = {
    getGpsVehicles,
    getGpsLocations,
    getDeviceLiveStreamingUrl,
    getDeviceMediaEventUrl
};
