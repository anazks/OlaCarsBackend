const crypto = require("crypto");

function getUtcTimestamp() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

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

async function run() {
    const apiUrl = "https://us-open.tracksolidpro.com/route/rest";
    const appKey = "8FB345B8693CCD0036B18E9F2E03AD30339A22A4105B6558";
    const userId = "ARRENDADORA_OLA_CARS";
    const userPwdMd5 = "2144ad865844e27229d4125b659f2406";
    const appSecret = "";

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

    // Try signature computation
    params.sign = generateSignature(params, appSecret);
    console.log("Request params:", params);

    // Try GET request first
    try {
        const urlParams = new URLSearchParams(params).toString();
        const fullUrl = `${apiUrl}?${urlParams}`;
        console.log("GET Request URL:", fullUrl);
        const res = await fetch(fullUrl);
        const data = await res.json();
        console.log("GET Request Response:", JSON.stringify(data, null, 2));

        if (data.code === 0 && data.result && data.result.accessToken) {
            const token = data.result.accessToken;
            const refresh = data.result.refreshToken;
            console.log("\n--- TRY REFRESH TOKEN via GET ---");
            const refreshParams = {
                method: "jimi.oauth.token.refresh",
                app_key: appKey,
                access_token: token,
                refresh_token: refresh,
                expires_in: "7200",
                timestamp: getUtcTimestamp(),
                format: "json",
                v: "0.9",
                sign_method: "md5"
            };
            refreshParams.sign = generateSignature(refreshParams, appSecret);
            const refreshUrl = `${apiUrl}?${new URLSearchParams(refreshParams).toString()}`;
            console.log("GET Refresh URL:", refreshUrl);
            const refreshRes = await fetch(refreshUrl);
            const refreshData = await refreshRes.json();
            console.log("GET Refresh Response:", JSON.stringify(refreshData, null, 2));
        }
    } catch (e) {
        console.error("GET request failed:", e);
    }

    // Try POST request (application/json)
    try {
        console.log("\n--- TRY OAUTH GET via POST JSON ---");
        const res = await fetch(apiUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json"
            },
            body: JSON.stringify(params)
        });
        const data = await res.json();
        console.log("POST Response:", JSON.stringify(data, null, 2));

        if (data.code === 0 && data.result && data.result.accessToken) {
            const token = data.result.accessToken;
            const refresh = data.result.refreshToken;
            console.log("\n--- TRY REFRESH TOKEN via POST JSON ---");
            const refreshParams = {
                method: "jimi.oauth.token.refresh",
                app_key: appKey,
                access_token: token,
                refresh_token: refresh,
                expires_in: "7200",
                timestamp: getUtcTimestamp(),
                format: "json",
                v: "0.9",
                sign_method: "md5"
            };
            refreshParams.sign = generateSignature(refreshParams, appSecret);
            
            const refreshRes = await fetch(apiUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(refreshParams)
            });
            const refreshData = await refreshRes.json();
            console.log("POST Refresh Response:", JSON.stringify(refreshData, null, 2));
        }
    } catch (e) {
        console.error("POST request failed:", e);
    }
}

run();
