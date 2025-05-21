// Simple test script for the getTokenPrice API
import handler from './api/getTokenPrice.js';

// Mock request and response objects
const req = {
  query: {
    tokenAddress: '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA' // USDbC on Base (USD Base Coin)
  }
};

const res = {
  status: (code) => {
    console.log(`Response status: ${code}`);
    return res;
  },
  json: (data) => {
    console.log('API Response:');
    console.log(JSON.stringify(data, null, 2));
  }
};

// Call the API handler
console.log('Testing getTokenPrice API...');
console.log(`Query parameters: ${JSON.stringify(req.query)}`);

// Execute the handler asynchronously
try {
  console.log('Calling API handler...');
  handler(req, res).catch(error => {
    console.error('Error in API handler:', error);
  });
} catch (error) {
  console.error('Error executing API test:', error);
}
