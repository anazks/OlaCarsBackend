const gpsService = require('../Src/modules/Gps/Service/GpsService');

async function test() {
    try {
        console.log('--- FETCHING VEHICLES LIST ---');
        const token = await gpsService.getAccessToken();
        console.log('Access Token:', token);
        
        // Let's directly call requestApi for jimi.user.device.list
        const rawResult = await gpsService.requestApi('jimi.user.device.list', { 
            target: process.env.TRACKSOLID_USER_ID || 'ARRENDADORA_OLA_CARS' 
        });
        console.log('Raw API Result for jimi.user.device.list:', JSON.stringify(rawResult, null, 2));

        const list = await gpsService.getVehiclesList();
        console.log('Processed Vehicles List:', JSON.stringify(list, null, 2));
        
        if (list && list.length > 0) {
            const imeis = list.map(v => v.imei).filter(Boolean).join(',');
            console.log('\n--- FETCHING LOCATIONS FOR IMEIs:', imeis, '---');
            const locResult = await gpsService.requestApi('jimi.device.location.get', { 
                imeis, 
                map_type: 'GOOGLE' 
            });
            console.log('Raw API Result for jimi.device.location.get:', JSON.stringify(locResult, null, 2));
            
            const locations = await gpsService.getGpsLocations(imeis);
            console.log('Processed Locations:', JSON.stringify(locations, null, 2));
        }
    } catch (err) {
        console.error('Test failed with error:', err);
    }
}

test();
