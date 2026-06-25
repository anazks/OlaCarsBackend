const mongoose = require('mongoose');

const GpsNotificationSchema = new mongoose.Schema({
    imei: { type: String, required: true, index: true },
    deviceName: { type: String },
    msgType: { type: String, required: true },
    alarmType: { type: String },
    alarmName: { type: String },
    lat: { type: Number },
    lng: { type: Number },
    speed: { type: Number },
    avgSpeed: { type: Number },
    totalMileage: { type: Number },
    alarmTime: { type: Date },
    receivedAt: { type: Date, default: Date.now }
}, {
    timestamps: true
});

const GpsNotification = mongoose.model('GpsNotification', GpsNotificationSchema);

module.exports = { GpsNotification };
