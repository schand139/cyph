# Setting Up Alchemy for Improved Blockchain Data Fetching

This guide explains how to set up Alchemy to significantly improve the performance of our blockchain data fetching process.

## Benefits of Using Alchemy

1. **Performance**: Fetch all transactions in seconds instead of minutes/hours
2. **Reliability**: Higher rate limits and more stable connections
3. **Completeness**: Ensure we capture all transactions with specialized APIs
4. **Efficiency**: Reduce blockchain RPC calls and server resource usage

## Setup Instructions

### 1. Create an Alchemy Account

1. Go to [Alchemy.com](https://www.alchemy.com/) and sign up for an account
2. Verify your email address and complete the registration process

### 2. Create a New App

1. In the Alchemy dashboard, click "Create App"
2. Fill in the details:
   - Name: "Cypher Analytics"
   - Description: "Blockchain analytics for Cypher wallet transactions"
   - Chain: "Base"
   - Network: "Mainnet"
3. Click "Create App"

### 3. Get Your API Key

1. Once your app is created, click on "View Key"
2. Copy your API Key (it will look something like: "abc123xyz456...")

### 4. Install the Alchemy SDK

```bash
npm install alchemy-sdk
```

### 5. Update the Test Script

1. Open `scripts/alchemyTest.js`
2. Replace the mock implementation with the real Alchemy SDK:

```javascript
// Replace this:
const alchemy = new AlchemyMock({
  apiKey: "demo-api-key",
  network: "base-mainnet"
});

// With this:
import { Alchemy, Network } from 'alchemy-sdk';
const alchemy = new Alchemy({
  apiKey: "YOUR_API_KEY_HERE", // Replace with your actual API key
  network: Network.BASE_MAINNET
});
```

## Running the Test

1. After setting up Alchemy and updating the script, run:

```bash
node scripts/alchemyTest.js
```

2. Compare the performance with our current approach:

```bash
# Run our current approach
time node scripts/preloadCache.js

# Run the Alchemy approach
time node scripts/alchemyTest.js
```

## Interpreting Results

The Alchemy approach should be significantly faster (potentially 10-100x) and more reliable. Key metrics to compare:

1. **Execution Time**: How long each approach takes to complete
2. **Transaction Count**: How many transactions each approach finds
3. **Resource Usage**: CPU and memory usage during execution
4. **Completeness**: Whether all transactions are captured

## Next Steps

If the Alchemy approach proves superior (which it likely will), we can:

1. Update our main caching system to use Alchemy
2. Implement incremental updates for even better performance
3. Add more detailed transaction analysis using Alchemy's enhanced data

## Important Notes

- The free tier of Alchemy has generous limits that should be sufficient for our needs
- For production use, consider upgrading to a paid plan for higher rate limits
- Keep your API key secure and never commit it to version control
