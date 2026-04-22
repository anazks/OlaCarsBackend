const axios = require('axios');
const { jwtDecode } = require('jwt-decode');

async function testLogin() {
  try {
    const response = await axios.post('http://localhost:3000/api/admin/login', {
      email: 'admin@gmail.com',
      password: '1234@qwer'
    });

    const { accessToken, user } = response.data;
    console.log('Login Successful!');
    console.log('User Object:', JSON.stringify(user, null, 2));
    
    const decoded = jwtDecode(accessToken);
    console.log('Decoded Token Payload:', JSON.stringify(decoded, null, 2));

    if (!decoded.role) {
      console.error('❌ FAIL: Role is missing from token!');
    } else {
      console.log('✅ SUCCESS: Role is present in token:', decoded.role);
    }
  } catch (error) {
    console.error('Login Failed:', error.response?.data || error.message);
  }
}

testLogin();
