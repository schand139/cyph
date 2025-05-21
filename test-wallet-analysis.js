// Simple test script for the getWalletAnalysis API
import handler from './api/getWalletAnalysis.js';

// Mock request and response objects
const req = {
  query: {
    address: '0x3154Cf16ccdb4C6d922629664174b904d80F2C35', // Base Bridge address
    timeframe: '2023' // Look for historical data from 2023
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
console.log('Testing getWalletAnalysis API...');
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
