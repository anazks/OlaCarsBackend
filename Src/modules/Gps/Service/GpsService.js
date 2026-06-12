const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const cacheFilePath = path.join(__dirname, "gps_token_cache.json");
let tokenCacheLoaded = false;

// In-memory token cache (backed by JSON file)
let tokenCache = {
    accessToken: null,
    refreshToken: null,
    expiresAt: null
};

/**
 * Load token cache from local file on first access
 */
function loadTokenCache() {
    if (tokenCacheLoaded) return;
    try {
        if (fs.existsSync(cacheFilePath)) {
            const data = fs.readFileSync(cacheFilePath, "utf8");
            const parsed = JSON.parse(data);
            if (parsed.accessToken && parsed.expiresAt) {
                tokenCache = parsed;
                console.log("[GPS] Loaded token cache from file successfully.");
            }
        }
        tokenCacheLoaded = true;
    } catch (err) {
        console.warn("[GPS] Failed to load token cache file:", err.message);
    }
}

/**
 * Save token cache back to local file
 */
function saveTokenCache() {
    try {
        fs.writeFileSync(cacheFilePath, JSON.stringify(tokenCache, null, 2), "utf8");
        console.log("[GPS] Saved token cache to file.");
    } catch (err) {
        console.warn("[GPS] Failed to save token cache file:", err.message);
    }
}

// Sleek fallback mock fleet data
const MOCK_GPS_VEHICLES = [
    {
        imei: "860121060485136",
        deviceName: "EV0063",
        mcType: "VL802",
        mcTypeUseScope: "automobile",
        sim: "69766288",
        expiration: "2036-05-14 23:59:59",
        activationTime: "2026-05-14 20:11:04",
        reMark: "Primary Fleet Unit",
        vehicleName: "Jetour X70",
        vehicleIcon: "automobile",
        vehicleNumber: "EV0063",
        vehicleModels: "X70 Comfort",
        carFrame: "LVTDB21B6SH156408",
        driverName: "Carlos Mendoza",
        driverPhone: "+507 6123-4567",
        enabledFlag: 1,
        engineNumber: "F4J16-100234",
        status: "NORMAL",
        deviceGroupId: "3865e173cb8548ecba29b3fb57c73077",
        deviceGroup: "Default group"
    },
    {
        imei: "860121060490813",
        deviceName: "VL802-90813",
        mcType: "VL802",
        mcTypeUseScope: "automobile",
        sim: "66255092",
        expiration: "2036-05-11 23:59:59",
        activationTime: "2026-05-11 16:23:00",
        reMark: "Active Rental Unit",
        vehicleName: "Toyota Corolla",
        vehicleIcon: "automobile",
        vehicleNumber: "HP5432",
        vehicleModels: "Corolla GLI",
        carFrame: "LVTDB21B6SH156999",
        driverName: "Ana Sofia Gomez",
        driverPhone: "+507 6890-1234",
        enabledFlag: 1,
        engineNumber: "1NZ-FE-77632",
        status: "NORMAL",
        deviceGroupId: "3865e173cb8548ecba29b3fb57c73077",
        deviceGroup: "Default group"
    },
    {
        imei: "860121060511223",
        deviceName: "VL802-511223",
        mcType: "VL802",
        mcTypeUseScope: "automobile",
        sim: "67781290",
        expiration: "2036-08-20 23:59:59",
        activationTime: "2026-08-20 10:15:30",
        reMark: "Maintenance Hold",
        vehicleName: "Nissan Sentra",
        vehicleIcon: "automobile",
        vehicleNumber: "NS2026",
        vehicleModels: "Sentra Advance",
        carFrame: "3N1AB6AP7GL100432",
        driverName: "Roberto Martinez",
        driverPhone: "+507 6554-3210",
        enabledFlag: 1,
        engineNumber: "MRA8-99823",
        status: "OFFLINE",
        deviceGroupId: "3865e173cb8548ecba29b3fb57c73077",
        deviceGroup: "Workshop group"
    },
    {
        imei: "860121060699887",
        deviceName: "EV-Tucson",
        mcType: "VL802",
        mcTypeUseScope: "automobile",
        sim: "62334991",
        expiration: "2027-02-14 23:59:59",
        activationTime: "2026-02-14 08:33:12",
        reMark: "Contract Renewal Pending",
        vehicleName: "Hyundai Tucson",
        vehicleIcon: "automobile",
        vehicleNumber: "HT8899",
        vehicleModels: "Tucson 2.0 GL",
        carFrame: "KMH8C32B8JU009823",
        driverName: "Marta Rodriguez",
        driverPhone: "+507 6445-9876",
        enabledFlag: 0,
        engineNumber: "G4NA-667521",
        status: "EXPIRED",
        deviceGroupId: "3865e173cb8548ecba29b3fb57c73077",
        deviceGroup: "Default group"
    }
];

// Fallback real-time mock locations scattered near Panama City (WGS84)
const MOCK_GPS_LOCATIONS = {
    "860121060485136": {
        imei: "860121060485136",
        lat: 9.0232,
        lng: -79.5244,
        posType: "GPS",
        speed: 45,
        direction: 90,
        gpsTime: "",
        hbTime: "",
        accStatus: 1,
        status: 1,
        electQuantity: 92,
        locDesc: "Avenida Balboa, Panama City, Panama"
    },
    "860121060490813": {
        imei: "860121060490813",
        lat: 9.0112,
        lng: -79.5312,
        posType: "GPS",
        speed: 0,
        direction: 180,
        gpsTime: "",
        hbTime: "",
        accStatus: 0,
        status: 1,
        electQuantity: 88,
        locDesc: "Casco Viejo, Panama City, Panama"
    },
    "860121060511223": {
        imei: "860121060511223",
        lat: 9.0354,
        lng: -79.5012,
        posType: "LBS",
        speed: 12,
        direction: 270,
        gpsTime: "",
        hbTime: "",
        accStatus: 1,
        status: 1,
        electQuantity: 54,
        locDesc: "Via España, Panama City, Panama"
    },
    "860121060699887": {
        imei: "860121060699887",
        lat: 8.9892,
        lng: -79.5422,
        posType: "GPS",
        speed: 0,
        direction: 0,
        gpsTime: "",
        hbTime: "",
        accStatus: 0,
        status: 0,
        electQuantity: 0,
        locDesc: "Amador Causeway, Panama City, Panama"
    }
};

/**
 * Format timestamp in GMT+0 (UTC) as yyyy-MM-dd HH:mm:ss
 */
function getUtcTimestamp() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const yyyy = d.getUTCFullYear();
    const MM = pad(d.getUTCMonth() + 1);
    const dd = pad(d.getUTCDate());
    const HH = pad(d.getUTCHours());
    const mm = pad(d.getUTCMinutes());
    const ss = pad(d.getUTCSeconds());
    return `${yyyy}-${MM}-${dd} ${HH}:${mm}:${ss}`;
}

/**
 * Calculate signature based on sorted query parameters and app secret
 */
function generateSignature(params, appSecret = "") {
    const keys = Object.keys(params).filter(k => k !== "sign").sort();
    let str = appSecret;
    for (const key of keys) {
        if (params[key] !== undefined && params[key] !== null) {
            str += `${key}${params[key]}`;
        }
    }
    str += appSecret;
    return crypto.createHash("md5").update(str, "utf8").digest("hex").toUpperCase();
}

/**
 * Refresh access token using jimi.oauth.token.refresh API method
 */
async function refreshAccessToken() {
    if (!tokenCache.refreshToken) {
        throw new Error("No refresh token cached to perform refresh");
    }

    const apiUrl = process.env.TRACKSOLID_API_URL || "https://us-open.tracksolidpro.com/route/rest";
    const appKey = process.env.TRACKSOLID_APP_KEY || "8FB345B8693CCD0036B18E9F2E03AD30339A22A4105B6558";
    const appSecret = process.env.TRACKSOLID_APP_SECRET || "";

    const timestamp = getUtcTimestamp();
    const params = {
        method: "jimi.oauth.token.refresh",
        app_key: appKey,
        access_token: tokenCache.accessToken || "",
        refresh_token: tokenCache.refreshToken,
        expires_in: "7200",
        timestamp: timestamp,
        format: "json",
        v: "0.9",
        sign_method: "md5"
    };

    params.sign = generateSignature(params, appSecret);

    console.log(`[GPS] Attempting token refresh at ${apiUrl} using POST (JSON)...`);

    let response;
    let data;
    try {
        response = await fetch(apiUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json"
            },
            body: JSON.stringify(params)
        });

        if (response.ok) {
            data = await response.json();
            console.log("[GPS] POST Token refresh response:", JSON.stringify(data));
        } else {
            console.warn(`[GPS] POST Token refresh HTTP status ${response.status}. Retrying via GET...`);
        }
    } catch (postErr) {
        console.warn("[GPS] POST Token refresh failed, retrying via GET...", postErr.message);
    }

    // Fallback to GET query params if POST failed
    if (!data || data.code !== 0 || !data.result || !data.result.accessToken) {
        console.log("[GPS] Retrying token refresh via GET query parameters...");
        const urlParams = new URLSearchParams(params).toString();
        const fullUrl = `${apiUrl}?${urlParams}`;

        const getResponse = await fetch(fullUrl, {
            method: "GET",
            headers: { "Accept": "application/json" }
        });

        if (!getResponse.ok) {
            throw new Error(`Token refresh GET fallback failed with HTTP status ${getResponse.status}`);
        }

        data = await getResponse.json();
        console.log("[GPS] GET Token refresh response:", JSON.stringify(data));
    }

    if (data && data.code === 0 && data.result && data.result.accessToken) {
        tokenCache.accessToken = data.result.accessToken;
        if (data.result.refreshToken) {
            tokenCache.refreshToken = data.result.refreshToken;
        }
        const bufferSec = 120;
        const expirySec = Number(data.result.expiresIn || 7200) - bufferSec;
        tokenCache.expiresAt = Date.now() + (expirySec * 1000);
        saveTokenCache();
        return tokenCache.accessToken;
    } else {
        throw new Error((data && data.message) || "Token refresh request rejected by Tracksolid");
    }
}

/**
 * Fetch token or return cached token, attempting refresh before full credential sign in
 */
async function getAccessToken() {
    loadTokenCache();
    const now = Date.now();
    
    // 1. Return cached active token if valid
    if (tokenCache.accessToken && tokenCache.expiresAt && now < tokenCache.expiresAt) {
        console.log("[GPS] Using cached accessToken...");
        return tokenCache.accessToken;
    }

    // 2. If token is expired but refresh token exists, attempt refresh
    if (tokenCache.refreshToken) {
        try {
            console.log("[GPS] Access token expired. Attempting token refresh...");
            const token = await refreshAccessToken();
            return token;
        } catch (err) {
            console.warn("[GPS] Token refresh failed, falling back to full authentication login...", err.message);
            tokenCache.accessToken = null;
            tokenCache.refreshToken = null;
            tokenCache.expiresAt = null;
            saveTokenCache();
        }
    }

    // 3. Fallback to full authentication login via jimi.oauth.token.get
    const apiUrl = process.env.TRACKSOLID_API_URL || "https://us-open.tracksolidpro.com/route/rest";
    const appKey = process.env.TRACKSOLID_APP_KEY || "8FB345B8693CCD0036B18E9F2E03AD30339A22A4105B6558";
    const userId = process.env.TRACKSOLID_USER_ID || "ARRENDADORA_OLA_CARS";
    const userPwdMd5 = process.env.TRACKSOLID_USER_PWD_MD5 || "2144ad865844e27229d4125b659f2406";
    const appSecret = process.env.TRACKSOLID_APP_SECRET || "";

    const timestamp = getUtcTimestamp();
    const params = {
        method: "jimi.oauth.token.get",
        app_key: appKey,
        user_id: userId,
        user_pwd_md5: userPwdMd5,
        expires_in: "7200",
        timestamp: timestamp,
        format: "json",
        v: "0.9",
        sign_method: "md5"
    };

    params.sign = generateSignature(params, appSecret);

    console.log(`[GPS] Fetching new access token at ${apiUrl} using POST (JSON)...`);

    let response;
    let data;
    try {
        response = await fetch(apiUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json"
            },
            body: JSON.stringify(params)
        });

        if (response.ok) {
            data = await response.json();
            console.log("[GPS] POST Token response:", JSON.stringify(data));
        } else {
            console.warn(`[GPS] POST Token fetch HTTP status ${response.status}. Retrying via GET...`);
        }
    } catch (postErr) {
        console.warn("[GPS] POST Token fetch failed, retrying via GET...", postErr.message);
    }

    // Fallback to GET with query params if POST failed
    if (!data || data.code !== 0 || !data.result || !data.result.accessToken) {
        console.log("[GPS] Retrying token fetch via GET query parameters...");
        const urlParams = new URLSearchParams(params).toString();
        const fullUrl = `${apiUrl}?${urlParams}`;

        const getResponse = await fetch(fullUrl, {
            method: "GET",
            headers: { "Accept": "application/json" }
        });

        if (!getResponse.ok) {
            throw new Error(`Token fetch GET fallback failed with HTTP status ${getResponse.status}`);
        }

        data = await getResponse.json();
        console.log("[GPS] GET Token response:", JSON.stringify(data));
    }

    if (data && data.code === 0 && data.result && data.result.accessToken) {
        tokenCache.accessToken = data.result.accessToken;
        tokenCache.refreshToken = data.result.refreshToken;
        const bufferSec = 120;
        const expirySec = Number(data.result.expiresIn || 7200) - bufferSec;
        tokenCache.expiresAt = now + (expirySec * 1000);
        saveTokenCache();
        return tokenCache.accessToken;
    } else {
        // Try requesting token without signature parameter if signature fails, since user sample shows sign as empty
        console.warn("[GPS] Token fetch error code. Retrying with empty sign parameter...");
        params.sign = "";
        const fallbackUrl = `${apiUrl}?${new URLSearchParams(params).toString()}`;
        const fallbackResponse = await fetch(fallbackUrl, { method: "GET" });
        if (fallbackResponse.ok) {
            const fallbackData = await fallbackResponse.json();
            if (fallbackData.code === 0 && fallbackData.result && fallbackData.result.accessToken) {
                tokenCache.accessToken = fallbackData.result.accessToken;
                tokenCache.refreshToken = fallbackData.result.refreshToken;
                tokenCache.expiresAt = now + ((Number(fallbackData.result.expiresIn || 7200) - 120) * 1000);
                saveTokenCache();
                return tokenCache.accessToken;
            }
        }
        throw new Error((data && data.message) || "Invalid credentials or token request rejected by Tracksolid");
    }
}

/**
 * Fetch connected vehicles list
 */
async function getVehiclesList() {
    try {
        const appKey = process.env.TRACKSOLID_APP_KEY || "8FB345B8693CCD0036B18E9F2E03AD30339A22A4105B6558";
        const appSecret = process.env.TRACKSOLID_APP_SECRET || "";
        const apiUrl = process.env.TRACKSOLID_API_URL || "https://us-open.tracksolidpro.com/route/rest";
        const userId = process.env.TRACKSOLID_USER_ID || "ARRENDADORA_OLA_CARS";

        const accessToken = await getAccessToken();

        const timestamp = getUtcTimestamp();
        const params = {
            method: "jimi.user.device.list",
            app_key: appKey,
            access_token: accessToken,
            target: userId,
            timestamp: timestamp,
            format: "json",
            v: "0.9",
            sign_method: "md5"
        };

        params.sign = generateSignature(params, appSecret);

        const urlParams = new URLSearchParams(params).toString();
        const fullUrl = `${apiUrl}?${urlParams}`;

        console.log(`[GPS] Querying devices at ${apiUrl}`);
        const response = await fetch(fullUrl, {
            method: "GET",
            headers: { "Accept": "application/json" }
        });

        if (!response.ok) {
            throw new Error(`Device list fetch failed with status ${response.status}`);
        }

        const data = await response.json();
        console.log("[GPS] Device list response code:", data.code);

        if (data.code === 0 && data.result) {
            const list = Array.isArray(data.result) ? data.result : (data.result.list || []);
            if (list.length > 0) {
                return list;
            }
        }
        
        throw new Error(data.message || "No device list returned or permission error");
    } catch (error) {
        console.error("[GPS WARNING] GPS API failed. Falling back to mock fleet data.", error.message);
        return MOCK_GPS_VEHICLES;
    }
}

/**
 * Retrieve device locations using jimi.device.location.get API method
 * @param {string} imeis comma separated string of IMEIs
 */
async function getDevicesLocations(imeis) {
    try {
        if (!imeis) {
            throw new Error("No IMEIs provided for location query");
        }

        const appKey = process.env.TRACKSOLID_APP_KEY || "8FB345B8693CCD0036B18E9F2E03AD30339A22A4105B6558";
        const appSecret = process.env.TRACKSOLID_APP_SECRET || "";
        const apiUrl = process.env.TRACKSOLID_API_URL || "https://us-open.tracksolidpro.com/route/rest";

        const accessToken = await getAccessToken();

        const timestamp = getUtcTimestamp();
        const params = {
            method: "jimi.device.location.get",
            app_key: appKey,
            access_token: accessToken,
            imeis: imeis,
            timestamp: timestamp,
            format: "json",
            v: "0.9",
            sign_method: "md5"
        };

        params.sign = generateSignature(params, appSecret);

        console.log(`[GPS] Querying device locations for: ${imeis} using POST (JSON)...`);

        let response;
        let data;
        try {
            response = await fetch(apiUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Accept": "application/json"
                },
                body: JSON.stringify(params)
            });

            if (response.ok) {
                data = await response.json();
                console.log("[GPS] POST Location response code:", data.code);
            } else {
                console.warn(`[GPS] POST Location fetch HTTP status ${response.status}. Retrying via GET...`);
            }
        } catch (postErr) {
            console.warn("[GPS] POST Location fetch failed, retrying via GET...", postErr.message);
        }

        if (!data || data.code !== 0 || !data.result) {
            console.log("[GPS] Retrying location fetch via GET query parameters...");
            const urlParams = new URLSearchParams(params).toString();
            const fullUrl = `${apiUrl}?${urlParams}`;

            const getResponse = await fetch(fullUrl, {
                method: "GET",
                headers: { "Accept": "application/json" }
            });

            if (!getResponse.ok) {
                throw new Error(`Location fetch GET fallback failed with status ${getResponse.status}`);
            }

            data = await getResponse.json();
            console.log("[GPS] GET Location response code:", data.code);
        }

        if (data && data.code === 0 && data.result) {
            const list = Array.isArray(data.result) ? data.result : [data.result];
            return list.map(item => ({
                imei: item.imei,
                lat: Number(item.lat || 0),
                lng: Number(item.lng || 0),
                posType: item.posType || "GPS",
                speed: Number(item.speed || 0),
                direction: Number(item.direction || 0),
                gpsTime: item.gpsTime || getUtcTimestamp(),
                hbTime: item.hbTime || getUtcTimestamp(),
                accStatus: Number(item.accStatus !== undefined ? item.accStatus : 0),
                status: Number(item.status !== undefined ? item.status : 0),
                electQuantity: Number(item.electQuantity || item.batteryPowerVal || 100),
                batteryPowerVal: Number(item.batteryPowerVal || item.electQuantity || 100),
                locDesc: item.locDesc || "Panama City, Panama"
            }));
        }

        throw new Error((data && data.message) || "No location results returned or permission error");
    } catch (error) {
        console.error("[GPS WARNING] Location API failed. Falling back to mock positioning data.", error.message);
        const requestedImeis = imeis.split(",").map(i => i.trim());
        const fallbackList = [];
        for (const imei of requestedImeis) {
            const mock = MOCK_GPS_LOCATIONS[imei];
            if (mock) {
                fallbackList.push({
                    imei: imei,
                    lat: Number(mock.lat),
                    lng: Number(mock.lng),
                    posType: mock.posType,
                    speed: Number(mock.speed),
                    direction: Number(mock.direction),
                    gpsTime: getUtcTimestamp(),
                    hbTime: getUtcTimestamp(),
                    accStatus: Number(mock.accStatus),
                    status: Number(mock.status),
                    electQuantity: Number(mock.electQuantity),
                    batteryPowerVal: Number(mock.electQuantity),
                    locDesc: mock.locDesc
                });
            } else {
                fallbackList.push({
                    imei: imei,
                    lat: 9.0232 + (Math.random() - 0.5) * 0.05,
                    lng: -79.5244 + (Math.random() - 0.5) * 0.05,
                    posType: "GPS",
                    speed: Math.floor(Math.random() * 80),
                    direction: Math.floor(Math.random() * 360),
                    gpsTime: getUtcTimestamp(),
                    hbTime: getUtcTimestamp(),
                    accStatus: Math.random() > 0.3 ? 1 : 0,
                    status: Math.random() > 0.2 ? 1 : 0,
                    electQuantity: Math.floor(Math.random() * 50) + 50,
                    batteryPowerVal: Math.floor(Math.random() * 50) + 50,
                    locDesc: "Panama City, Panama"
                });
            }
        }
        return fallbackList;
    }
}

/**
 * Retrieve device live streaming page URL using jimi.device.live.page.url API method
 * @param {string} imei single IMEI
 */
async function getDeviceLiveStreamingUrl(imei) {
    try {
        if (!imei) {
            throw new Error("No IMEI provided for live streaming URL query");
        }

        const appKey = process.env.TRACKSOLID_APP_KEY || "8FB345B8693CCD0036B18E9F2E03AD30339A22A4105B6558";
        const appSecret = process.env.TRACKSOLID_APP_SECRET || "";
        const apiUrl = process.env.TRACKSOLID_API_URL || "https://us-open.tracksolidpro.com/route/rest";

        const accessToken = await getAccessToken();

        const timestamp = getUtcTimestamp();
        const params = {
            method: "jimi.device.live.page.url",
            app_key: appKey,
            access_token: accessToken,
            imei: imei,
            timestamp: timestamp,
            format: "json",
            v: "0.9",
            sign_method: "md5"
        };

        params.sign = generateSignature(params, appSecret);

        console.log(`[GPS] Querying live stream URL for: ${imei} using POST (JSON)...`);

        let response;
        let data;
        try {
            response = await fetch(apiUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Accept": "application/json"
                },
                body: JSON.stringify(params)
            });

            if (response.ok) {
                data = await response.json();
                console.log("[GPS] POST Live stream response code:", data.code);
            } else {
                console.warn(`[GPS] POST Live stream fetch HTTP status ${response.status}. Retrying via GET...`);
            }
        } catch (postErr) {
            console.warn("[GPS] POST Live stream fetch failed, retrying via GET...", postErr.message);
        }

        if (!data || data.code !== 0 || !data.result) {
            console.log("[GPS] Retrying live stream fetch via GET query parameters...");
            const urlParams = new URLSearchParams(params).toString();
            const fullUrl = `${apiUrl}?${urlParams}`;

            const getResponse = await fetch(fullUrl, {
                method: "GET",
                headers: { "Accept": "application/json" }
            });

            if (!getResponse.ok) {
                throw new Error(`Live stream GET fallback failed with status ${getResponse.status}`);
            }

            data = await getResponse.json();
            console.log("[GPS] GET Live stream response code:", data.code);
        }

        if (data && data.code === 0 && data.result) {
            if (typeof data.result === 'object') {
                console.log("[GPS] Live Stream Result Object:", JSON.stringify(data.result));
                // Extract the URL field. Tracksolid often uses 'url', 'liveUrl', 'h5Url', or 'pageUrl'
                const streamUrl = data.result.url || data.result.liveUrl || data.result.h5Url || data.result.pageUrl || Object.values(data.result).find(v => typeof v === 'string' && v.startsWith('http'));
                if (streamUrl) return streamUrl;
            }
            return data.result; 
        }

        throw new Error((data && data.message) || "No live stream URL returned or permission error");
    } catch (error) {
        console.error("[GPS WARNING] Live Stream API failed.", error.message);
        return null;
    }
}

/**
 * Retrieve device media event URL using jimi.device.media.event.url API method
 * @param {string} imei single IMEI
 */
async function getDeviceMediaEventUrl(imei) {
    try {
        if (!imei) {
            throw new Error("No IMEI provided for media event URL query");
        }

        const appKey = process.env.TRACKSOLID_APP_KEY || "8FB345B8693CCD0036B18E9F2E03AD30339A22A4105B6558";
        const appSecret = process.env.TRACKSOLID_APP_SECRET || "";
        const apiUrl = process.env.TRACKSOLID_API_URL || "https://us-open.tracksolidpro.com/route/rest";

        const accessToken = await getAccessToken();

        const timestamp = getUtcTimestamp();
        const params = {
            method: "jimi.device.media.event.url",
            app_key: appKey,
            access_token: accessToken,
            imei: imei,
            timestamp: timestamp,
            format: "json",
            v: "0.9",
            sign_method: "md5"
        };

        params.sign = generateSignature(params, appSecret);

        console.log(`[GPS] Querying media event URL for: ${imei} using POST (JSON)...`);

        let response;
        let data;
        try {
            response = await fetch(apiUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Accept": "application/json"
                },
                body: JSON.stringify(params)
            });

            if (response.ok) {
                data = await response.json();
                console.log("[GPS] POST Media event response:", JSON.stringify(data));
            } else {
                console.warn(`[GPS] POST Media event fetch HTTP status ${response.status}. Retrying via GET...`);
            }
        } catch (postErr) {
            console.warn("[GPS] POST Media event fetch failed, retrying via GET...", postErr.message);
        }

        if (!data || data.code !== 0 || !data.result) {
            console.log("[GPS] Retrying media event fetch via GET query parameters...");
            const urlParams = new URLSearchParams(params).toString();
            const fullUrl = `${apiUrl}?${urlParams}`;

            const getResponse = await fetch(fullUrl, {
                method: "GET",
                headers: { "Accept": "application/json" }
            });

            if (!getResponse.ok) {
                throw new Error(`Media event GET fallback failed with status ${getResponse.status}`);
            }

            data = await getResponse.json();
            console.log("[GPS] GET Media event response:", JSON.stringify(data));
        }

        if (data && data.code === 0 && data.result) {
            if (typeof data.result === 'object') {
                console.log("[GPS] Media Event Result Object:", JSON.stringify(data.result));
                const streamUrl = data.result.url || data.result.liveUrl || data.result.h5Url || data.result.pageUrl || Object.values(data.result).find(v => typeof v === 'string' && v.startsWith('http'));
                if (streamUrl) return streamUrl;
            }
            return data.result;
        }

        throw new Error((data && data.message) || "No media event URL returned or permission error");
    } catch (error) {
        console.error("[GPS WARNING] Media Event API failed.", error.message);
        return null;
    }
}

module.exports = {
    getVehiclesList,
    getDevicesLocations,
    getDeviceLiveStreamingUrl,
    getDeviceMediaEventUrl
};
