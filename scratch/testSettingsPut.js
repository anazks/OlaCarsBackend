require('dotenv').config();

async function testPut() {
    try {
        const loginRes = await fetch('http://127.0.0.1:3000/api/admin/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: process.env.DEFAULT_ADMIN_EMAIL || 'admin@olacars.com',
                password: process.env.DEFAULT_ADMIN_PASSWORD || 'Admin@123!'
            })
        });
        
        const loginData = await loginRes.json();
        const token = loginData.token || loginData.data.token;
        console.log("Logged in. Token:", token.substring(0, 20) + "...");
        
        const res = await fetch('http://127.0.0.1:3000/api/system-settings/poApprovalThreshold', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ value: 2000 })
        });
        
        const resData = await res.json();
        console.log("Success:", res.status, resData);
    } catch (e) {
        console.error("Error:", e.message);
    }
}

testPut();
