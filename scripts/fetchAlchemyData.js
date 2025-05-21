// Simple script to fetch transaction data using Alchemy API
import { Alchemy, Network } from 'alchemy-sdk';
import { format } from 'date-fns';
import { saveData } from '../utils/unifiedCacheManager.js';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Cypher master wallet address
const CYPHER_MASTER_WALLET = '0xcCCd218A58B53C67fC17D8C87Cb90d83614e35fD';

// Get API key from environment variables
const API_KEY = process.env.ALCHEMY_API_KEY;

console.log(`Using Alchemy API Key: ${API_KEY ? '✓ Found' : '✗ Not found'}`);

async function fetchTransactions() {
  try {
    // Initialize Alchemy SDK
    const alchemy = new Alchemy({
      apiKey: API_KEY,
      network: Network.BASE_MAINNET
    });
    
    console.log('Initialized Alchemy SDK');
    console.log('Fetching current block number...');
    
    // Test connection by getting block number
    const blockNumber = await alchemy.core.getBlockNumber();
    console.log(`Current block number: ${blockNumber}`);
    
    // Define block range
    const fromBlock = 24000000; // Approximate block for start of 2025
    const toBlock = blockNumber;
    
    console.log(`Fetching transactions from block ${fromBlock} to ${toBlock}`);
    
    // Get incoming transfers
    console.log('Fetching incoming transfers...');
    const incomingTransfers = await alchemy.core.getAssetTransfers({
      fromBlock: fromBlock,
      toBlock: toBlock,
      toAddress: CYPHER_MASTER_WALLET,
      category: ["erc20"],
      withMetadata: true,
      maxCount: 100 // Start with a smaller number for testing
    });
    
    console.log(`Found ${incomingTransfers.transfers.length} incoming transfers`);
    
    // Process and display some sample data
    if (incomingTransfers.transfers.length > 0) {
      console.log('\nSample incoming transfers:');
      incomingTransfers.transfers.slice(0, 3).forEach((transfer, i) => {
        console.log(`${i+1}. Block: ${transfer.blockNum}, Token: ${transfer.asset}, Amount: ${transfer.value}`);
        console.log(`   Date: ${transfer.metadata.blockTimestamp}`);
        console.log(`   From: ${transfer.from} -> To: ${transfer.to}`);
        console.log('---');
      });
      
      // Save to cache
      const transactions = incomingTransfers.transfers.map(transfer => {
        const date = new Date(transfer.metadata.blockTimestamp);
        return {
          date: format(date, 'yyyy-MM-dd'),
          value: parseFloat(transfer.value),
          token: transfer.asset,
          tokenAmount: parseFloat(transfer.value),
          direction: 'in',
          blockNumber: transfer.blockNum,
          transactionHash: transfer.hash
        };
      });
      
      // Save to cache
      await saveData('alchemy-test-transactions', transactions, 3600);
      console.log('Saved transactions to cache');
    }
    
    return incomingTransfers.transfers;
  } catch (error) {
    console.error('Error fetching data from Alchemy:', error);
    throw error;
  }
}

// Run the function
fetchTransactions()
  .then(() => console.log('Completed successfully'))
  .catch(error => console.error('Failed:', error));
