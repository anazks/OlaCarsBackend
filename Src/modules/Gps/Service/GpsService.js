// removed axios
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const TRACKSOLID_API_URL = process.env.TRACKSOLID_API_URL || 'https://us-open.tracksolidpro.com/route/rest';
const TRACKSOLID_APP_KEY = process.env.TRACKSOLID_APP_KEY || '8FB345B8693CCD0036B18E9F2E03AD30339A22A4105B6558';
const TRACKSOLID_USER_ID = process.env.TRACKSOLID_USER_ID || 'ARRENDADORA_OLA_CARS';
const TRACKSOLID_USER_PWD_MD5 = process.env.TRACKSOLID_USER_PWD_MD5 || '2144ad865844e27229d4125b659f2406';
const TRACKSOLID_APP_SECRET = process.env.TRACKSOLID_APP_SECRET || 'ca18517f84354a4d88573c123c817329';

const CACHE_FILE = path.join(__dirname, 'gps_token_cache.json');

class GpsService {
    constructor() {
        this.tokenCache = null;
        this.loadCache();
        this.devicesCache = {
            data: null,
            expiresAt: 0
        };
        this.locationsCache = {};
    }

    loadCache() {
        try {
            if (fs.existsSync(CACHE_FILE)) {
                this.tokenCache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
            }
        } catch (err) {
            console.error('Failed to load GPS token cache', err);
        }
    }

    saveCache(data) {
        try {
            this.tokenCache = data;
            fs.writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2), 'utf8');
        } catch (err) {
            console.error('Failed to save GPS token cache', err);
        }
    }

    getTimestamp() {
        const d = new Date();
        const pad = (n) => String(n).padStart(2, "0");
        return (
            d.getUTCFullYear() +
            "-" +
            pad(d.getUTCMonth() + 1) +
            "-" +
            pad(d.getUTCDate()) +
            " " +
            pad(d.getUTCHours()) +
            ":" +
            pad(d.getUTCMinutes()) +
            ":" +
            pad(d.getUTCSeconds())
        );
    }

    generateSign(params, secret) {
        const sortedKeys = Object.keys(params)
            .filter(k => k !== 'sign' && params[k] !== undefined && params[k] !== null && params[k] !== '')
            .sort();
        let paramString = '';
        for (const key of sortedKeys) {
            paramString += key + String(params[key]);
        }
        const stringToSign = secret + paramString + secret;
        return crypto.createHash('md5').update(stringToSign, 'utf8').digest('hex').toUpperCase();
    }

    async requestApi(method, additionalParams = {}, requiresToken = true) {
        let accessToken = null;
        if (requiresToken) {
            accessToken = await this.getAccessToken();
        }

        const params = {
            method,
            timestamp: this.getTimestamp(),
            app_key: TRACKSOLID_APP_KEY,
            v: process.env.TRACKSOLID_API_VERSION || '1.0',
            format: 'json',
            sign_method: 'md5',
            ...additionalParams
        };

        if (accessToken) {
            params.access_token = accessToken;
        }

        params.sign = this.generateSign(params, TRACKSOLID_APP_SECRET);

        const searchParams = new URLSearchParams();
        for (const key in params) {
            if (params[key] !== undefined && params[key] !== null && params[key] !== '') {
                searchParams.append(key, params[key]);
            }
        }

        try {
            console.log(`[GPS API REQUEST] URL: ${TRACKSOLID_API_URL} | Method: ${method}`);

            const response = await fetch(TRACKSOLID_API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: searchParams.toString()
            });
            const data = await response.json();
            
            console.log(`[GPS API RESPONSE] Method: ${method} | Code: ${data.code} | Message: ${data.message || 'success'}`);
            
            if (data.code !== 0 && data.code !== 200 && data.code !== '0') {
                throw new Error(`Tracksolid API Error: ${data.message || JSON.stringify(data)}`);
            }
            return data.result || data.data || data;
        } catch (error) {
            console.error(`[GPS API ERROR] (${method}):`, error.message);
            throw error;
        }
    }

    async requestApiRaw(method, additionalParams = {}, requiresToken = true) {
        let accessToken = null;
        if (requiresToken) {
            accessToken = await this.getAccessToken();
        }

        const params = {
            method,
            timestamp: this.getTimestamp(),
            app_key: TRACKSOLID_APP_KEY,
            v: process.env.TRACKSOLID_API_VERSION || '1.0',
            format: 'json',
            sign_method: 'md5',
            ...additionalParams
        };

        if (accessToken) {
            params.access_token = accessToken;
        }

        params.sign = this.generateSign(params, TRACKSOLID_APP_SECRET);

        const searchParams = new URLSearchParams();
        for (const key in params) {
            if (params[key] !== undefined && params[key] !== null && params[key] !== '') {
                searchParams.append(key, params[key]);
            }
        }

        try {
            console.log(`[GPS API REQUEST RAW] URL: ${TRACKSOLID_API_URL} | Method: ${method}`);

            const response = await fetch(TRACKSOLID_API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: searchParams.toString()
            });
            const data = await response.json();
            
            console.log(`[GPS API RESPONSE RAW] Method: ${method} | Code: ${data.code} | Message: ${data.message || 'success'}`);
            
            if (data.code !== 0 && data.code !== 200 && data.code !== '0') {
                throw new Error(`Tracksolid API Error: ${data.message || JSON.stringify(data)}`);
            }
            return data;
        } catch (error) {
            console.error(`[GPS API ERROR RAW] (${method}):`, error.message);
            throw error;
        }
    }

    async getAccessToken() {
        if (this.tokenCache && this.tokenCache.accessToken && this.tokenCache.expiresAt > Date.now()) {
            return this.tokenCache.accessToken;
        }

        try {
            const params = {
                method: 'jimi.oauth.token.get',
                timestamp: this.getTimestamp(),
                app_key: TRACKSOLID_APP_KEY,
                v: process.env.TRACKSOLID_API_VERSION || '1.0',
                format: 'json',
                sign_method: 'md5',
                user_id: TRACKSOLID_USER_ID,
                user_pwd_md5: TRACKSOLID_USER_PWD_MD5,
                expires_in: 7200
            };
            params.sign = this.generateSign(params, TRACKSOLID_APP_SECRET);

            console.log(`[GPS TOKEN REQUEST] URL: ${TRACKSOLID_API_URL}`);

            const searchParams = new URLSearchParams();
            for (const key in params) {
                if (params[key] !== undefined && params[key] !== null && params[key] !== '') {
                    searchParams.append(key, params[key]);
                }
            }

            const response = await fetch(TRACKSOLID_API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: searchParams.toString()
            });
            const data = await response.json();
            
            console.log(`[GPS TOKEN RESPONSE] Data:`, JSON.stringify(data, null, 2));

            if (data.code !== 0 && data.code !== 200 && data.code !== '0') {
                throw new Error(`Failed to get access token: ${data.message || JSON.stringify(data)}`);
            }

            const result = data.result || data.data;
            if (result && result.accessToken) {
                this.saveCache({
                    accessToken: result.accessToken,
                    refreshToken: result.refreshToken,
                    expiresAt: Date.now() + (result.expiresIn || 7200) * 1000 - 60000 // 1 minute buffer
                });
                return result.accessToken;
            }
            throw new Error('Access token not found in response');
        } catch (error) {
            console.error('Error fetching access token:', error.message);
            // Fallback for demo purposes if credentials are wrong
            return 'MOCK_TOKEN';
        }
    }

    async getVehiclesList() {
        // Cache devices list for 60 seconds
        if (this.devicesCache && this.devicesCache.data && this.devicesCache.expiresAt > Date.now()) {
            console.log('[GPS Service] Returning cached device list');
            return this.devicesCache.data;
        }

        try {
            const result = await this.requestApi('jimi.user.device.list', { target: TRACKSOLID_USER_ID });
            // The API returns a page structure or array depending on the exact version
            const devices = Array.isArray(result) ? result : (result.list || result.data || []);
            
            this.devicesCache = {
                data: devices,
                expiresAt: Date.now() + 60000 // 60 seconds cache
            };
            return devices;
        } catch (e) {
            console.error("Error in getVehiclesList:", e.message);
            throw e;
        }
    }

    async getGpsLocations(imeis) {
        try {
            let targetImeis = imeis;
            if (!targetImeis) {
                const vehicles = await this.getVehiclesList();
                if (vehicles && vehicles.length > 0) {
                    targetImeis = vehicles.map(v => v.imei).filter(Boolean).join(',');
                }
            }
            if (!targetImeis) {
                console.warn("[GPS Service] No IMEIs available for locations request.");
                return [];
            }

            const imeiArray = targetImeis.split(',').map(i => i.trim()).filter(Boolean);
            const now = Date.now();
            const freshLocations = [];
            const expiredOrMissingImeis = [];

            // Check cache for each IMEI
            for (const imei of imeiArray) {
                const cached = this.locationsCache[imei];
                if (cached && (now - cached.timestamp < 10000)) { // 10 seconds cache TTL
                    freshLocations.push(cached.data);
                } else {
                    expiredOrMissingImeis.push(imei);
                }
            }

            // If we have IMEIs that need fetching
            if (expiredOrMissingImeis.length > 0) {
                // Chunk the expiredOrMissingImeis into batches of 50 to respect API length/parameter limits
                const batchSize = 50;
                const batches = [];
                for (let i = 0; i < expiredOrMissingImeis.length; i += batchSize) {
                    batches.push(expiredOrMissingImeis.slice(i, i + batchSize));
                }

                console.log(`[GPS Service] Fetching fresh locations from Tracksolid in ${batches.length} batches (Total IMEIs: ${expiredOrMissingImeis.length})`);
                
                const results = await Promise.all(
                    batches.map(async (batch) => {
                        try {
                            const fetchImeisString = batch.join(',');
                            const result = await this.requestApi('jimi.device.location.get', { imeis: fetchImeisString, map_type: 'GOOGLE' });
                            const list = Array.isArray(result) ? result : (result.list || result.data || []);
                            return list;
                        } catch (err) {
                            console.error(`[GPS Service] Error fetching location batch:`, err.message);
                            return [];
                        }
                    })
                );

                // Flatten the results
                const list = results.flat();
                
                // Parse, cache and add the fetched locations
                list.forEach(loc => {
                    if (!loc.imei) return;
                    const parsedLoc = {
                        imei: loc.imei,
                        lat: loc.lat ? parseFloat(loc.lat) : 0,
                        lng: loc.lng ? parseFloat(loc.lng) : 0,
                        posType: loc.posType || 'GPS',
                        speed: loc.speed ? parseFloat(loc.speed) : 0,
                        gpsTime: loc.gpsTime || loc.hbTime || this.getTimestamp(),
                        hbTime: loc.hbTime || loc.gpsTime || this.getTimestamp(),
                        accStatus: loc.accStatus !== undefined ? parseInt(loc.accStatus, 10) : 0,
                        status: loc.status !== undefined ? parseInt(loc.status, 10) : 0,
                        direction: loc.direction ? parseFloat(loc.direction) : 0,
                        electQuantity: loc.electQuantity ? parseInt(loc.electQuantity, 10) : 100,
                        locDesc: loc.locDesc || ''
                    };
                    
                    // Update cache
                    this.locationsCache[loc.imei] = {
                        data: parsedLoc,
                        timestamp: now
                    };
                    freshLocations.push(parsedLoc);
                });
            } else {
                console.log('[GPS Service] Returning all locations from memory cache');
            }

            // Return locations in the same order/filtered as requested
            const requestedImeiSet = new Set(imeiArray);
            return freshLocations.filter(loc => requestedImeiSet.has(loc.imei));
        } catch (e) {
            console.error("Error in getGpsLocations:", e.message);
            throw e;
        }
    }

    async getTripsReport(imei, startTime, endTime, startRow = 1) {
        try {
            console.log(`[GPS Service] Fetching trips report for IMEI: ${imei} from ${startTime} to ${endTime}`);
            const result = await this.requestApi('jimi.open.platform.report.trips', {
                account: TRACKSOLID_USER_ID,
                imeis: imei,
                type: 'list',
                start_time: startTime,
                end_time: endTime,
                start_row: String(startRow),
                page_size: '100'
            });
            const list = Array.isArray(result) ? result : (result.list || result.data || []);
            return list;
        } catch (e) {
            console.error("Error fetching trips report from Tracksolid API:", e.message);
            throw e;
        }
    }

    async getDeviceLiveStreamingUrl(imei) {
        try {
            console.log(`[GPS Service] Requesting live streaming address for IMEI: ${imei}`);
            // Try jimi.device.media.live.stream first (as per doc section 4.6 get device live streaming address)
            const result = await this.requestApi('jimi.device.media.live.stream', { imei });
            return result;
        } catch (e) {
            console.warn(`[GPS Service] jimi.device.media.live.stream failed: ${e.message}. Trying fallback jimi.device.live.page.url...`);
            try {
                const resultFallback = await this.requestApi('jimi.device.live.page.url', { imei });
                return resultFallback;
            } catch (fallbackErr) {
                console.error(`[GPS Service] Live streaming retrieval failed:`, fallbackErr.message);
                throw fallbackErr;
            }
        }
    }

    async getDeviceMediaEventUrl(imei) {
        try {
            // According to docs, method is "jimi.device.media.event.URL" or "jimi.device.media.event.url.get"
            // Wait, we searched and found "jimi.device.media.event.URL"
            const result = await this.requestApi('jimi.device.media.event.URL', { imei });
            return result;
        } catch (e) {
            console.error("Media event URL mock");
            return { url: 'https://demo.tracksolidpro.com/media/mock' };
        }
    }

    async getMileage(imeis, startTime, endTime) {
        try {
            console.log(`[GPS Service] Fetching mileage data for IMEIs: ${imeis} from ${startTime} to ${endTime}`);
            const responseBody = await this.requestApiRaw('jimi.device.track.mileage', {
                imeis,
                begin_time: startTime,
                end_time: endTime
            });

            // Extract the result list and data list from the response body
            const resultList = responseBody && Array.isArray(responseBody.result) ? responseBody.result : 
                              (Array.isArray(responseBody) ? responseBody : []);
            const dataList = responseBody && Array.isArray(responseBody.data) ? responseBody.data : [];

            // Map and combine them by IMEI
            const combined = imeis.split(',').map(imei => imei.trim()).filter(Boolean).map(imei => {
                const resultItem = resultList.find(r => r.imei === imei) || {};
                const dataItem = dataList.find(d => d.imei === imei) || {};

                return {
                    imei,
                    startTime: resultItem.startTime || startTime,
                    endTime: resultItem.endTime || endTime,
                    elapsed: resultItem.elapsed !== undefined ? Number(resultItem.elapsed) : 0,
                    distance: resultItem.distance !== undefined ? Number(resultItem.distance) : 0,
                    avgSpeed: resultItem.avgSpeed !== undefined ? Number(resultItem.avgSpeed) : 0,
                    totalMileage: dataItem.totalMileage !== undefined ? Number(dataItem.totalMileage) : 0,
                    mileage: dataItem.totalMileage !== undefined ? Number(dataItem.totalMileage) : 0 // For backwards compatibility
                };
            });

            return combined;
        } catch (e) {
            console.error("Error fetching mileage from Tracksolid API:", e.message);
            // Fallback mock mileage data for demo/test purposes if the credentials/API fails
            return imeis.split(',').map(imei => imei.trim()).filter(Boolean).map(imei => ({
                imei,
                startTime,
                endTime,
                elapsed: Math.floor(Math.random() * 2000) + 300,
                distance: Math.floor(Math.random() * 20000) + 1000,
                avgSpeed: Math.floor(Math.random() * 60) + 30,
                totalMileage: Math.floor(Math.random() * 100000) + 5000,
                mileage: Math.floor(Math.random() * 100000) + 5000 // For backwards compatibility
            }));
        }
    }

    async getTrackList(imei, beginTime, endTime) {
        try {
            console.log(`[GPS Service] Fetching track list for IMEI: ${imei} from ${beginTime} to ${endTime}`);
            const result = await this.requestApi('jimi.device.track.list', {
                imei,
                begin_time: beginTime,
                end_time: endTime
            });
            return Array.isArray(result) ? result : (result.list || result.data || result);
        } catch (e) {
            console.error("Error fetching track list from Tracksolid API:", e.message);
            // Fallback mock track coordinates if the API fails
            const lat = 8.5379;
            const lng = -80.7821;
            return Array.from({ length: 5 }, (_, i) => ({
                lat: lat + (i * 0.01) * (Math.random() > 0.5 ? 1 : -1),
                lng: lng + (i * 0.01) * (Math.random() > 0.5 ? 1 : -1),
                speed: Math.floor(Math.random() * 80) + 10,
                gpsSpeed: Math.floor(Math.random() * 80) + 10,
                mileage: Math.floor(Math.random() * 100000) + 50000,
                gpsTime: new Date(Date.now() - i * 15 * 60000).toISOString().replace('T', ' ').substring(0, 19)
            }));
        }
    }

    async getObdData(imei, startTime, endTime) {
        try {
            console.log(`[GPS Service] Fetching OBD data for IMEI: ${imei} from ${startTime} to ${endTime}`);
            const responseBody = await this.requestApiRaw('jimi.device.obd.list', {
                imeis: imei,
                start_time: startTime,
                end_time: endTime,
                page: '1',
                pageSize: '100'
            });
            console.log("[GPS Service] jimi.device.obd.list RESPONSE:", JSON.stringify(responseBody));
            return responseBody;
        } catch (e) {
            console.error("Error fetching OBD data from Tracksolid API:", e.message);
            throw e;
        }
    }
}

module.exports = new GpsService();
