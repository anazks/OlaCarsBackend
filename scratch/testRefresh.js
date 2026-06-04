const http = require('http');

function post(path, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const options = {
      hostname: '127.0.0.1',
      port: 3000,
      path: path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ statusCode: res.statusCode, body: parsed });
        } catch (e) {
          resolve({ statusCode: res.statusCode, body: data });
        }
      });
    });

    req.on('error', (e) => { reject(e); });
    req.write(payload);
    req.end();
  });
}

async function run() {
  try {
    console.log('1. Attempting login...');
    const loginRes = await post('/api/admin/login', {
      email: 'admin@olacars.com',
      password: '1234@qwer'
    });
    console.log('Login Response Status:', loginRes.statusCode);
    console.log('Login Response Body:', loginRes.body);

    const refreshToken = loginRes.body.refreshToken;
    if (!refreshToken) {
      console.error('No refresh token received. Exiting.');
      return;
    }

    console.log('\n2. Attempting refresh #1 (should succeed and return rotated tokens)...');
    const refreshRes1 = await post('/api/admin/refresh', { refreshToken });
    console.log('Refresh #1 Response Status:', refreshRes1.statusCode);
    console.log('Refresh #1 Response Body:', refreshRes1.body);

    const newRefreshToken = refreshRes1.body.refreshToken;

    console.log('\n3. Attempting refresh #2 with the SAME old refresh token (should fail / be blacklisted)...');
    const refreshRes2 = await post('/api/admin/refresh', { refreshToken });
    console.log('Refresh #2 Response Status:', refreshRes2.statusCode);
    console.log('Refresh #2 Response Body:', refreshRes2.body);

    if (newRefreshToken) {
      console.log('\n4. Attempting refresh #3 with the NEW refresh token (should succeed)...');
      const refreshRes3 = await post('/api/admin/refresh', { refreshToken: newRefreshToken });
      console.log('Refresh #3 Response Status:', refreshRes3.statusCode);
      console.log('Refresh #3 Response Body:', refreshRes3.body);
    }
  } catch (error) {
    console.error('Test failed with error:', error);
  }
}

run();
