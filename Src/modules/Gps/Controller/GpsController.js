const GpsService = require('../Service/GpsService');

const getGpsVehicles = async (req, res, next) => {
    try {
        const vehicles = await GpsService.getVehiclesList();
        res.status(200).json({ success: true, data: vehicles });
    } catch (error) {
        next(error);
    }
};

const getGpsLocations = async (req, res, next) => {
    try {
        const { imeis } = req.query;
        const locations = await GpsService.getGpsLocations(imeis);
        res.status(200).json({ success: true, data: locations });
    } catch (error) {
        next(error);
    }
};

const getDeviceLiveStream = async (req, res, next) => {
    try {
        const { imei } = req.query;
        if (!imei) {
            return res.status(400).json({ success: false, message: 'IMEI parameter is required' });
        }
        const data = await GpsService.getDeviceLiveStreamingUrl(imei);
        res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
};

const getDeviceMediaEvent = async (req, res, next) => {
    try {
        const { imei } = req.query;
        if (!imei) {
            return res.status(400).json({ success: false, message: 'IMEI parameter is required' });
        }
        const data = await GpsService.getDeviceMediaEventUrl(imei);
        res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getGpsVehicles,
    getGpsLocations,
    getDeviceLiveStream,
    getDeviceMediaEvent
};
