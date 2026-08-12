require('dotenv').config();
const gpsService = require('./Src/modules/Gps/Service/GpsService');

async function testDetail(imei) {
    try {
        console.log(`Pinging jimi.track.device.detail for IMEI ${imei}...`);
        const res = await gpsService.requestApiRaw('jimi.track.device.detail', { imei });
        console.log('Result:', JSON.stringify(res, null, 2));
    } catch (e) {
        console.error('jimi.track.device.detail failed:', e.message);
    }

    try {
        console.log(`\nPinging jimi.device.detail for IMEI ${imei}...`);
        const res2 = await gpsService.requestApiRaw('jimi.device.detail', { imei });
        console.log('Result:', JSON.stringify(res2, null, 2));
    } catch (e) {
        console.error('jimi.device.detail failed:', e.message);
    }
}

testDetail('860121060489328');
