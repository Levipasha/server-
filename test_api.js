const jwt = require('jsonwebtoken');
const axios = require('axios');

async function testEndpoint() {
  try {
    // Use the same JWT secret as server
    const jwtSecret = process.env.JWT_SECRET || 'your_jwt_secret';
    const testToken = jwt.sign({ userId: '6a02ebecfde49e16f7c8861d' }, jwtSecret);
    
    console.log('Testing with token:', testToken);
    console.log('JWT Secret:', process.env.JWT_SECRET || 'your_jwt_secret');
    
    const response = await axios.get('http://localhost:5000/api/messages/conversation/6a02eb2cfde49e16f7c88601', {
      headers: { Authorization: 'Bearer ' + testToken }
    });
    
    console.log('API Response:', JSON.stringify(response.data, null, 2));
    console.log('Response type:', typeof response.data);
    console.log('Is array:', Array.isArray(response.data));
    console.log('Length:', response.data?.length);
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

testEndpoint();
