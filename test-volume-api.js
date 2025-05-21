// Simple test script for the getVolumeData API
import handler from './api/getVolumeData.js';

// Mock request and response objects
const req = {
  query: {
    period: 'daily',
    year: '2025',  // Use 2025 as requested
    // Use the Cypher master wallet address
    walletAddress: '0xcCCd218A58B53C67fC17D8C87Cb90d83614e35fD'
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
console.log('Testing getVolumeData API...');
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
