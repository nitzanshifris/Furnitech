// Test the proxy endpoint locally
const handler = require('./api/aws-model-proxy.js');

// Mock request and response
const mockReq = {
  method: 'GET',
  query: {
    file: 'Groove_grey-scaled (1).glb'
  }
};

const headers = {};
const mockRes = {
  setHeader: (key, value) => {
    headers[key] = value;
    console.log(`Header set: ${key} = ${value}`);
  },
  status: (code) => {
    console.log(`Status: ${code}`);
    return {
      json: (data) => console.log('JSON Response:', data),
      send: (data) => console.log(`Binary data sent: ${data.length} bytes`),
      end: () => console.log('Response ended')
    };
  }
};

// Test the handler
console.log('Testing AWS Model Proxy locally...\n');
handler(mockReq, mockRes)
  .then(() => {
    console.log('\n✅ Test completed successfully');
  })
  .catch(error => {
    console.error('\n❌ Test failed:', error);
  });