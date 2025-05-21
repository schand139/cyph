// Script to update transaction cache using Alchemy API
import { format } from 'date-fns';
import { Alchemy, Network } from 'alchemy-sdk';
import { saveData, getData } from '../utils/unifiedCacheManager.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Verify API key is available
const API_KEY = process.env.ALCHEMY_API_KEY;
if (!API_KEY) {
  console.error('Error: ALCHEMY_API_KEY not found in environment variables');
  process.exit(1);
}

console.log('Alchemy API Key loaded successfully');

// Cypher master wallet address
const CYPHER_MASTER_WALLET = '0xcCCd218A58B53C67fC17D8C87Cb90d83614e35fD';

// We already verified the API key is available

/**
 * Update transaction cache using Alchemy API
 * @param {string} walletAddress - Wallet address to fetch transactions for
 * @param {string} year - Year to fetch transactions for
 */
async function updateCacheWithAlchemy(walletAddress = CYPHER_MASTER_WALLET, year = '2025') {
  console.time('Alchemy Cache Update Time');
  console.log(`Updating cache for ${walletAddress} for year ${year} using Alchemy...`);
  
  try {
    // Initialize Alchemy SDK
    const alchemy = new Alchemy({
      apiKey: API_KEY,
      network: Network.BASE_MAINNET
    });
    
    // Define date range for the specified year
    const startDate = new Date(parseInt(year), 0, 1);
    const endDate = new Date(parseInt(year), 11, 31, 23, 59, 59);
    const now = new Date();
    
    // If the end date is in the future, use current date as end date
    const effectiveEndDate = endDate > now ? now : endDate;
    
    console.log(`Fetching transactions from ${startDate.toISOString()} to ${effectiveEndDate.toISOString()}`);
    
    // Get existing cached transactions if available
    const cacheKey = `transactions-${walletAddress}-${year}`;
    const existingCache = await getData(cacheKey);
    let existingTransactions = [];
    let highestBlockNumber = 0;
    
    if (existingCache && existingCache.data && Array.isArray(existingCache.data)) {
      existingTransactions = existingCache.data;
      // Find highest block number in existing cache
      highestBlockNumber = Math.max(...existingTransactions.map(tx => tx.blockNumber || 0));
      console.log(`Found ${existingTransactions.length} existing transactions in cache`);
      console.log(`Highest block number in cache: ${highestBlockNumber}`);
    } else {
      console.log('No existing cache found or invalid format, creating new cache');
    }
    
    // Get current block number
    const currentBlock = await alchemy.core.getBlockNumber();
    console.log(`Current block number: ${currentBlock}`);
    
    // If cache is up to date, no need to fetch more data
    if (highestBlockNumber >= currentBlock) {
      console.log('Cache is already up to date with the latest blocks');
      console.timeEnd('Alchemy Cache Update Time');
      return existingTransactions;
    }
    
    // Set fromBlock to the block after the highest one we have
    // If no existing cache, start from a reasonable block number for 2025
    const fromBlock = highestBlockNumber > 0 ? highestBlockNumber + 1 : 24000000;
    
    console.log(`Fetching new transactions from block ${fromBlock} to ${currentBlock}`);
    
    // Get all incoming ERC-20 transfers
    const incomingTransfers = await alchemy.core.getAssetTransfers({
      fromBlock: fromBlock,
      toBlock: currentBlock,
      toAddress: walletAddress,
      category: ["erc20", "external"], // Get both ERC-20 and native ETH transfers
      withMetadata: true, // Include timestamps
      maxCount: 1000 // Get up to 1000 transfers
    });
    
    console.log(`Found ${incomingTransfers.transfers.length} new incoming transfers`);
    
    // Get all outgoing ERC-20 transfers
    const outgoingTransfers = await alchemy.core.getAssetTransfers({
      fromBlock: fromBlock,
      toBlock: currentBlock,
      fromAddress: walletAddress,
      category: ["erc20", "external"], // Get both ERC-20 and native ETH transfers
      withMetadata: true, // Include timestamps
      maxCount: 1000 // Get up to 1000 transfers
    });
    
    console.log(`Found ${outgoingTransfers.transfers.length} new outgoing transfers`);
    
    // Process transfers into our standard format
    const newTransactions = [];
    
    // Process incoming transfers
    for (const transfer of incomingTransfers.transfers) {
      const date = new Date(transfer.metadata.blockTimestamp);
      const formattedDate = format(date, 'yyyy-MM-dd');
      
      // Skip transactions outside our year range
      if (date.getFullYear() !== parseInt(year)) {
        continue;
      }
      
      // Get token amount and USD value
      const tokenAmount = parseFloat(transfer.value);
      const tokenSymbol = transfer.asset;
      
      // For simplicity, assume 1:1 USD value for stablecoins, $3500 for ETH/WETH
      let usdValue;
      if (tokenSymbol === 'USDC' || tokenSymbol === 'USDT' || tokenSymbol === 'DAI') {
        usdValue = tokenAmount;
      } else if (tokenSymbol === 'ETH' || tokenSymbol === 'WETH') {
        usdValue = tokenAmount * 3500;
      } else {
        usdValue = tokenAmount; // Default 1:1 for unknown tokens
      }
      
      newTransactions.push({
        date: formattedDate,
        value: usdValue,
        token: tokenSymbol,
        tokenAmount,
        direction: 'in',
        blockNumber: transfer.blockNum,
        transactionHash: transfer.hash
      });
    }
    
    // Process outgoing transfers
    for (const transfer of outgoingTransfers.transfers) {
      const date = new Date(transfer.metadata.blockTimestamp);
      const formattedDate = format(date, 'yyyy-MM-dd');
      
      // Skip transactions outside our year range
      if (date.getFullYear() !== parseInt(year)) {
        continue;
      }
      
      // Get token amount and USD value
      const tokenAmount = parseFloat(transfer.value);
      const tokenSymbol = transfer.asset;
      
      // For simplicity, assume 1:1 USD value for stablecoins, $3500 for ETH/WETH
      let usdValue;
      if (tokenSymbol === 'USDC' || tokenSymbol === 'USDT' || tokenSymbol === 'DAI') {
        usdValue = tokenAmount;
      } else if (tokenSymbol === 'ETH' || tokenSymbol === 'WETH') {
        usdValue = tokenAmount * 3500;
      } else {
        usdValue = tokenAmount; // Default 1:1 for unknown tokens
      }
      
      newTransactions.push({
        date: formattedDate,
        value: usdValue,
        token: tokenSymbol,
        tokenAmount,
        direction: 'out',
        blockNumber: transfer.blockNum,
        transactionHash: transfer.hash
      });
    }
    
    console.log(`Processed ${newTransactions.length} new transactions`);
    
    // Combine existing and new transactions
    const allTransactions = [...existingTransactions, ...newTransactions];
    
    // Sort transactions by block number
    allTransactions.sort((a, b) => a.blockNumber - b.blockNumber);
    
    // Remove duplicates based on transaction hash
    const uniqueTransactions = [];
    const seenHashes = new Set();
    
    for (const tx of allTransactions) {
      if (!seenHashes.has(tx.transactionHash)) {
        seenHashes.add(tx.transactionHash);
        uniqueTransactions.push(tx);
      }
    }
    
    console.log(`Final transaction count: ${uniqueTransactions.length}`);
    
    // Cache the transactions
    await saveData(cacheKey, uniqueTransactions, 86400); // Cache for 24 hours
    
    // Also update the volume cache
    await updateVolumeCache(walletAddress, year, uniqueTransactions);
    
    console.timeEnd('Alchemy Cache Update Time');
    return uniqueTransactions;
  } catch (error) {
    console.error('Error updating cache with Alchemy:', error);
    console.timeEnd('Alchemy Cache Update Time');
    throw error;
  }
}

/**
 * Update volume cache based on transaction data
 * @param {string} walletAddress - Wallet address
 * @param {string} year - Year
 * @param {Array} transactions - Transaction data
 */
async function updateVolumeCache(walletAddress, year, transactions) {
  console.log('Updating volume cache...');
  
  // Process transactions into daily volume data
  const volumeByDay = {};
  
  for (const tx of transactions) {
    if (!volumeByDay[tx.date]) {
      volumeByDay[tx.date] = 0;
    }
    
    // Only count incoming transactions for volume
    if (tx.direction === 'in') {
      volumeByDay[tx.date] += tx.value;
    }
  }
  
  // Convert to array format expected by frontend
  const volumeData = Object.entries(volumeByDay).map(([date, value]) => ({
    date,
    value
  }));
  
  // Sort by date
  volumeData.sort((a, b) => new Date(a.date) - new Date(b.date));
  
  // Cache the volume data
  const volumeCacheKey = `volume-${walletAddress}-${year}`;
  await saveData(volumeCacheKey, volumeData, 86400); // Cache for 24 hours
  
  console.log(`Volume cache updated with ${volumeData.length} days of data`);
}

// Run the update
updateCacheWithAlchemy().then(transactions => {
  console.log('Cache update completed successfully');
  
  // Group by token
  const tokenCounts = {};
  for (const tx of transactions) {
    if (!tokenCounts[tx.token]) {
      tokenCounts[tx.token] = 0;
    }
    tokenCounts[tx.token]++;
  }
  
  console.log('Transactions by token:');
  for (const [token, count] of Object.entries(tokenCounts)) {
    console.log(`${token}: ${count}`);
  }
  
  process.exit(0);
}).catch(error => {
  console.error('Cache update failed:', error);
  process.exit(1);
});
