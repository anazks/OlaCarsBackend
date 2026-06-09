const dotenv = require('dotenv');
const path = require('path');
const http = require('http');

dotenv.config({ path: path.join(__dirname, '../.env') });

function makeRequest(url, method, headers, bodyObj) {
    return new Promise((resolve, reject) => {
        const bodyStr = JSON.stringify(bodyObj);
        const urlObj = new URL(url);
        
        const options = {
            hostname: urlObj.hostname,
            port: urlObj.port || 80,
            path: urlObj.pathname + urlObj.search,
            method: method,
            headers: {
                ...headers,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(bodyStr)
            }
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                resolve({
                    statusCode: res.statusCode,
                    headers: res.headers,
                    body: data
                });
            });
        });

        req.on('error', (err) => reject(err));
        req.write(bodyStr);
        req.end();
    });
}

async function main() {
    const apiBase = 'http://localhost:3000';
    try {
        console.log('Logging in to Admin...');
        const loginRes = await makeRequest(
            `${apiBase}/api/admin/login`,
            'POST',
            {},
            { email: 'admin@olacars.com', password: '1234@qwer' }
        );

        console.log('Login Response Status:', loginRes.statusCode);
        const loginBody = JSON.parse(loginRes.body);
        if (!loginBody.accessToken) {
            console.error('Failed to login:', loginRes.body);
            return;
        }

        const token = loginBody.accessToken;
        console.log('Token obtained successfully.');

        // Let's call the bulk supplier endpoint with raw excel-mapped headers (with spaces)
        // Omit Accounts Payable to test standard fallback
        const payload = {
            suppliers: [
                {
                    'Contact Name': 'Test Supplier API 3',
                    'Display Name': 'Test Supplier API 3',
                    'EmailID': 'test_api_3@example.com',
                    'CF.ACTIVE DATE': '2026-06-09'
                }
            ]
        };

        console.log('Sending POST /api/supplier/bulk...');
        const bulkRes = await makeRequest(
            `${apiBase}/api/supplier/bulk`,
            'POST',
            { 'Authorization': `Bearer ${token}` },
            payload
        );

        console.log('Bulk Response Status:', bulkRes.statusCode);
        console.log('Bulk Response Headers:', JSON.stringify(bulkRes.headers, null, 2));
        console.log('Bulk Response Body:');
        console.log(bulkRes.body);

    } catch (err) {
        console.error('Request failed:', err);
    }
}

main();
