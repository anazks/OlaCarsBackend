const GpsService = require('../Service/GpsService');
const { GpsNotification } = require("../Model/GpsNotificationModel");

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

const getGpsTripsReport = async (req, res, next) => {
    try {
        const { imei, startTime, endTime, startRow } = req.query;
        if (!imei || !startTime || !endTime) {
            return res.status(400).json({ success: false, message: 'IMEI, startTime, and endTime query parameters are required' });
        }
        const data = await GpsService.getTripsReport(imei, startTime, endTime, startRow);
        res.status(200).json({ success: true, data });
    } catch (error) {
        error.isOperational = true;
        next(error);
    }
};

const getGpsMileage = async (req, res, next) => {
    try {
        const { imeis, startTime, endTime } = req.query;
        if (!imeis) {
            return res.status(400).json({ success: false, message: 'IMEIs parameter is required' });
        }

        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const formatDate = (date) => {
            const pad = (n) => String(n).padStart(2, "0");
            return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
        };

        const defaultStart = formatDate(startOfToday);
        const defaultEnd = formatDate(now);

        const data = await GpsService.getMileage(imeis, startTime || defaultStart, endTime || defaultEnd);
        res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
};

const getGpsTrackList = async (req, res, next) => {
    try {
        const { imei, beginTime, endTime } = req.query;
        if (!imei) {
            return res.status(400).json({ success: false, message: 'IMEI parameter is required' });
        }

        const now = new Date();
        const past24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const formatDate = (date) => {
            const pad = (n) => String(n).padStart(2, "0");
            return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
        };

        const defaultBegin = formatDate(past24Hours);
        const defaultEnd = formatDate(now);

        const data = await GpsService.getTrackList(imei, beginTime || defaultBegin, endTime || defaultEnd);
        res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
};

const receiveGpsNotification = async (req, res) => {
    try {
        console.log("[GPS WEBHOOK RECEIVED] Headers:", req.headers);
        console.log("[GPS WEBHOOK RECEIVED] Body:", req.body);

        const msgType = req.body.msgType || req.query.msgType || "";
        const rawData = req.body.data || req.body;

        let parsedData = {};
        if (typeof rawData === 'string') {
            try {
                parsedData = JSON.parse(rawData);
            } catch (e) {
                console.warn("[GPS WEBHOOK] Failed to parse JSON string data:", e.message);
            }
        } else if (typeof rawData === 'object' && rawData !== null) {
            parsedData = rawData;
        }

        const imei = parsedData.imei || parsedData.deviceImei || "";
        if (!imei) {
            console.warn("[GPS WEBHOOK] Received push notification without IMEI:", parsedData);
        }

        const notification = new GpsNotification({
            imei: String(imei),
            deviceName: parsedData.deviceName || "",
            msgType: String(msgType || parsedData.msgType || "jimi.push.device.alarm"),
            alarmType: parsedData.alarmType || "",
            alarmName: parsedData.alarmName || "",
            lat: parsedData.lat ? parseFloat(parsedData.lat) : undefined,
            lng: parsedData.lng ? parseFloat(parsedData.lng) : undefined,
            speed: parsedData.speed ? parseFloat(parsedData.speed) : undefined,
            avgSpeed: parsedData.avgSpeed ? parseFloat(parsedData.avgSpeed) : undefined,
            totalMileage: parsedData.totalMileage ? parseFloat(parsedData.totalMileage) : undefined,
            alarmTime: parsedData.alarmTime ? new Date(parsedData.alarmTime) : new Date()
        });

        await notification.save();
        console.log(`[GPS WEBHOOK SUCCESS] Saved GPS notification for IMEI ${imei}: ${notification.alarmName || msgType}`);

        return res.status(200).json({ code: 0, message: "success" });
    } catch (error) {
        console.error("[GPS WEBHOOK ERROR]:", error.message);
        return res.status(200).json({ code: 0, message: "processed with internal error" });
    }
};

const getGpsNotifications = async (req, res, next) => {
    try {
        const { imei, limit = 50 } = req.query;
        const query = {};
        if (imei) {
            query.imei = imei;
        }
        
        const list = await GpsNotification.find(query)
            .sort({ receivedAt: -1 })
            .limit(Number(limit));
            
        return res.status(200).json({ success: true, data: list });
    } catch (error) {
        next(error);
    }
};

const getGpsObdData = async (req, res, next) => {
    try {
        const { imei, startTime, endTime } = req.query;
        if (!imei) {
            return res.status(400).json({ success: false, message: 'IMEI parameter is required' });
        }

        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const formatDate = (date) => {
            const pad = (n) => String(n).padStart(2, "0");
            return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
        };

        const defaultStart = formatDate(startOfToday);
        const defaultEnd = formatDate(now);

        try {
            const data = await GpsService.getObdData(imei, startTime || defaultStart, endTime || defaultEnd);
            res.status(200).json({ success: true, data });
        } catch (apiError) {
            console.warn(`[GpsController] OBD API warning (graceful fallback): ${apiError.message}`);
            // Return success with empty results to prevent front-end crash
            res.status(200).json({ 
                success: true, 
                data: { 
                    code: 0, 
                    message: apiError.message || "No OBD data for this device", 
                    data: { result: [] } 
                } 
            });
        }
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getGpsVehicles,
    getGpsLocations,
    getDeviceLiveStream,
    getDeviceMediaEvent,
    getGpsTripsReport,
    getGpsMileage,
    getGpsTrackList,
    receiveGpsNotification,
    getGpsNotifications,
    getGpsObdData
};
