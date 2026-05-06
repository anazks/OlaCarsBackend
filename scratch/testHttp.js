const http = require('http');

const payload = JSON.stringify({
    email: 'admin@olacars.com',
    password: 'Admin@123!'
});

const loginOptions = {
    hostname: '127.0.0.1',
    port: 3000,
    path: '/api/admin/login',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
    }
};

const req = http.request(loginOptions, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
        try {
            const parsed = JSON.parse(data);
            const token = parsed.token || parsed.data?.token;
            console.log('Login status:', res.statusCode);
            if (!token) return console.log('No token in response:', parsed);
            
            console.log('Got token, sending PUT...');
            
            const putPayload = JSON.stringify({ value: 2000 });
            const putOptions = {
                hostname: '127.0.0.1',
                port: 3000,
                path: '/api/system-settings/po-threshold',
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                    'Content-Length': Buffer.byteLength(putPayload)
                }
            };
            
            const putReq = http.request(putOptions, (putRes) => {
                let putData = '';
                putRes.on('data', (chunk) => { putData += chunk; });
                putRes.on('end', () => {
                    console.log('PUT status:', putRes.statusCode);
                    console.log('PUT response:', putData);
                });
            });
            putReq.write(putPayload);
            putReq.end();
            
        } catch (e) {
            console.error('Error parsing login response:', e);
        }
    });
});

req.on('error', (e) => {
    console.error('Problem with login request:', e.message);
});

req.write(payload);
req.end();
