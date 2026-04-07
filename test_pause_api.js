const axios = require('axios');

async function testPause() {
    const api = axios.create({ baseURL: 'http://localhost:3000' });
    try {
        console.log("Attempting to pause Work Order...");
        const response = await api.put('/api/work-orders/67f27271e16fdf068abb9732/progress', {
            targetStatus: 'PAUSED',
            notes: 'Testing pause reason'
        });
        console.log("Success:", response.data);
    } catch (error) {
        console.log("Error Response:", error.response?.data || error.message);
    }
}

testPause();
