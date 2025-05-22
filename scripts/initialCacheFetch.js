/**
 * Script to fetch blockchain transactions using Alchemy API
 * Optimized for fetching card load data (incoming transactions) for Cypher
 * 
 * This script fetches transactions for a specified wallet address and date range,
 * processes them into a standardized format, and caches the results for efficient
 * access by the frontend application.
 */

import { format } from 'date-fns';
import { Alchemy, Network } from 'alchemy-sdk';
import { saveData as saveToCache, getData as getFromCache } from '../utils/unifiedCacheManager.js';
import * as dotenv from 'dotenv';
import { createPublicClient, http, formatUnits } from 'viem';
import { base } from 'viem/chains';
import { aerodromePairABI } from '../utils/abis.js';

// TODO: Standardize environment variable handling across the project
// using dotenv pattern for all configuration values

// Load environment variables
dotenv.config();

// Cypher master wallet address - users load funds by sending crypto to this address
const CYPHER_MASTER_WALLET = process.env.CYPHER_MASTER_WALLET;
if (!CYPHER_MASTER_WALLET) {
  console.error('Error: CYPHER_MASTER_WALLET not found in environment variables');
  process.exit(1);
}
console.log(`Using wallet address: ${CYPHER_MASTER_WALLET}`);

// Get API key from environment variables
const API_KEY = process.env.ALCHEMY_API_KEY;
if (!API_KEY) {
  console.error('Error: ALCHEMY_API_KEY not found in environment variables');
  process.exit(1);
}

console.log('Alchemy API Key loaded successfully');

// Aerodrome Finance factory address on Base chain
const AERODROME_FACTORY_ADDRESS = '0x420DD381b31aEf6683db6B902084cB0FFECe40Da';

// USDC address on Base chain (for price reference)
const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

// Common tokens on Base
const TOKENS = {
  ETH: {
    address: '0x0000000000000000000000000000000000000000', // Native ETH
    symbol: 'ETH',
    decimals: 18
  },
  USDC: {
    address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    symbol: 'USDC',
    decimals: 6
  },
  WETH: {
    address: '0x4200000000000000000000000000000000000006',
    symbol: 'WETH',
    decimals: 18
  },
  USDT: {
    address: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb',
    symbol: 'USDT',
    decimals: 6
  },
  DAI: {
    address: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb',
    symbol: 'DAI',
    decimals: 18
  }
};

// Cache for token prices to reduce blockchain queries
const priceCache = new Map();

/**
 * Get token price from Aerodrome Finance
 * @param {string} tokenSymbol - Symbol of the token
 * @returns {Promise<number>} - Price in USD
 */
async function getTokenPrice(tokenSymbol) {
  try {
    // Check if we have a cached price
    if (priceCache.has(tokenSymbol)) {
      return priceCache.get(tokenSymbol);
    }
    
    // Handle stablecoins directly
    if (tokenSymbol === 'USDC' || tokenSymbol === 'USDT' || tokenSymbol === 'DAI') {
      priceCache.set(tokenSymbol, 1.0);
      return 1.0;
    }
    
    // Find token address from symbol
    let tokenAddress;
    for (const [symbol, info] of Object.entries(TOKENS)) {
      if (symbol === tokenSymbol) {
        tokenAddress = info.address;
        break;
      }
    }
    
    // If we don't have the token in our list, use a fallback price
    if (!tokenAddress) {
      console.log(`Token ${tokenSymbol} not found in known tokens list, using fallback price`);
      return 1.0; // Fallback to 1:1 for unknown tokens
    }
    
    // For native ETH, use WETH price
    if (tokenSymbol === 'ETH') {
      tokenAddress = TOKENS.WETH.address;
    }
    
    // Create client for Base chain using Alchemy API instead of public RPC
    const client = createPublicClient({
      chain: base,
      transport: http(`https://base-mainnet.g.alchemy.com/v2/${API_KEY}`),
    });
    
    try {
      // Find the Aerodrome pair address for token/USDC
      const pairAddress = await getPairAddress(client, tokenAddress, USDC_ADDRESS);
      
      if (pairAddress && pairAddress !== '0x0000000000000000000000000000000000000000') {
        console.log(`Found Aerodrome pair for ${tokenSymbol}: ${pairAddress}`);
        
        // Get reserves from the pair
        const reserves = await getReserves(client, pairAddress, tokenAddress, USDC_ADDRESS);
        
        if (reserves) {
          // Calculate price based on reserves
          const price = calculatePrice(reserves, tokenAddress, USDC_ADDRESS);
          console.log(`Calculated price for ${tokenSymbol} from Aerodrome: ${price} USD`);
          
          // Cache the price
          priceCache.set(tokenSymbol, price);
          return price;
        }
      }
    } catch (aerodromeError) {
      console.error(`Error fetching from Aerodrome for ${tokenSymbol}:`, aerodromeError);
    }
    
    // Fallback prices for common tokens if Aerodrome fails
    const fallbackPrices = {
      'ETH': 3500,
      'WETH': 3500
    };
    
    if (fallbackPrices[tokenSymbol]) {
      console.log(`Using fallback price for ${tokenSymbol}: ${fallbackPrices[tokenSymbol]} USD`);
      priceCache.set(tokenSymbol, fallbackPrices[tokenSymbol]);
      return fallbackPrices[tokenSymbol];
    }
    
    // Default fallback
    console.log(`No price found for ${tokenSymbol}, using 1.0 USD as fallback`);
    priceCache.set(tokenSymbol, 1.0);
    return 1.0;
  } catch (error) {
    console.error(`Error getting price for ${tokenSymbol}:`, error);
    return 1.0; // Default fallback
  }
}

/**
 * Helper function to find the Aerodrome pair address for two tokens
 * @param {Object} client - Viem public client
 * @param {string} tokenA - Address of first token
 * @param {string} tokenB - Address of second token
 * @returns {Promise<string>} - Pair address
 */
async function getPairAddress(client, tokenA, tokenB) {
  try {
    // Call the Aerodrome factory to get the pair address
    const result = await client.readContract({
      address: AERODROME_FACTORY_ADDRESS,
      abi: [{
        name: 'getPair',
        type: 'function',
        stateMutability: 'view',
        inputs: [
          { name: 'tokenA', type: 'address' },
          { name: 'tokenB', type: 'address' }
        ],
        outputs: [{ name: '', type: 'address' }]
      }],
      functionName: 'getPair',
      args: [tokenA, tokenB]
    });
    
    return result;
  } catch (error) {
    console.error('Error getting pair address:', error);
    return null;
  }
}

// Note: We now use the unified cache manager's saveData function (imported as saveToCache)
// instead of defining our own local saveData function

// Note: We now use the unified cache manager's getData function (imported as getFromCache)
// instead of defining our own local getData function

/**
 * Helper function to get reserves from a pair
 * @param {Object} client - Viem public client
 * @param {string} pairAddress - Address of the pair contract
 * @param {string} tokenA - Address of first token
 * @param {string} tokenB - Address of second token
 * @returns {Promise<Object>} - Reserves information
 */
async function getReserves(client, pairAddress, tokenA, tokenB) {
  try {
    // First get token0 and token1 from the pair to determine order
    const token0 = await client.readContract({
      address: pairAddress,
      abi: [{
        name: 'token0',
        type: 'function',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ name: '', type: 'address' }]
      }],
      functionName: 'token0'
    });
    
    const token1 = await client.readContract({
      address: pairAddress,
      abi: [{
        name: 'token1',
        type: 'function',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ name: '', type: 'address' }]
      }],
      functionName: 'token1'
    });
    
    // Get the reserves
    const reserves = await client.readContract({
      address: pairAddress,
      abi: [{
        name: 'getReserves',
        type: 'function',
        stateMutability: 'view',
        inputs: [],
        outputs: [
          { name: 'reserve0', type: 'uint112' },
          { name: 'reserve1', type: 'uint112' },
          { name: 'blockTimestampLast', type: 'uint32' }
        ]
      }],
      functionName: 'getReserves'
    });
    
    // Find token decimals
    let token0Decimals = 18;
    let token1Decimals = 18;
    
    // Check if tokens are known
    Object.values(TOKENS).forEach(tokenInfo => {
      if (token0.toLowerCase() === tokenInfo.address.toLowerCase()) {
        token0Decimals = tokenInfo.decimals;
      }
      if (token1.toLowerCase() === tokenInfo.address.toLowerCase()) {
        token1Decimals = tokenInfo.decimals;
      }
    });
    
    // Return the reserves with token information
    return {
      token0: {
        address: token0,
        reserve: reserves[0],
        decimals: token0Decimals
      },
      token1: {
        address: token1,
        reserve: reserves[1],
        decimals: token1Decimals
      }
    };
  } catch (error) {
    console.error('Error getting reserves:', error);
    return null;
  }
}

/**
 * Helper function to calculate price based on reserves
 * @param {Object} reserves - Token reserves from the pair
 * @param {string} tokenAddress - Address of the token to price
 * @param {string} usdcAddress - Address of USDC
 * @returns {number} - Price in USD
 */
function calculatePrice(reserves, tokenAddress, usdcAddress) {
  // Determine which token is which in the reserves
  const tokenAddressLower = tokenAddress.toLowerCase();
  const usdcAddressLower = usdcAddress.toLowerCase();
  
  let tokenReserve, usdcReserve, tokenDecimals, usdcDecimals;
  
  if (reserves.token0.address.toLowerCase() === tokenAddressLower) {
    tokenReserve = reserves.token0.reserve;
    tokenDecimals = reserves.token0.decimals;
    usdcReserve = reserves.token1.reserve;
    usdcDecimals = reserves.token1.decimals;
  } else {
    tokenReserve = reserves.token1.reserve;
    tokenDecimals = reserves.token1.decimals;
    usdcReserve = reserves.token0.reserve;
    usdcDecimals = reserves.token0.decimals;
  }
  
  // Convert reserves to decimal values
  const tokenReserveDecimal = Number(formatUnits(tokenReserve, tokenDecimals));
  const usdcReserveDecimal = Number(formatUnits(usdcReserve, usdcDecimals));
  
  // Calculate price (USDC per token)
  if (tokenReserveDecimal === 0) return 0;
  
  return usdcReserveDecimal / tokenReserveDecimal;
}

/**
 * Get existing transactions from cache
 * 
 * @param {string} walletAddress - The wallet address to get transactions for
 * @param {string} year - The year to get transactions for (e.g., '2025')
 * @returns {Array} - Array of cached transactions or empty array if none found
 */
async function getExistingTransactions(walletAddress = CYPHER_MASTER_WALLET, year = '2025') {
  const cacheKey = `transactions-${walletAddress}-${year}`;
  const cachedData = await getFromCache(cacheKey);
  
  if (cachedData && cachedData.data && Array.isArray(cachedData.data)) {
    return cachedData.data;
  } else if (Array.isArray(cachedData)) {
    return cachedData;
  }
  
  return [];
}

/**
 * Fetch transactions using Alchemy API
 * This function fetches both incoming and outgoing transactions for a wallet address
 * and processes them into a standardized format for caching.
 * 
 * @param {string} walletAddress - Wallet address to fetch transactions for
 * @param {string|number} year - Year to fetch transactions for (e.g., '2025')
 * @param {boolean} forceRefresh - Whether to force a complete refresh of the cache
 * @returns {Array} - Array of processed transactions
 */
async function fetchTransactionsWithAlchemy(walletAddress = CYPHER_MASTER_WALLET, year = '2025', forceRefresh = true, skipCache = false, testMode = false) {
  console.time('Alchemy Fetch Time');
  console.log(`Fetching transactions for ${walletAddress} for year ${year} using Alchemy...`);
  console.log(`Force refresh mode: ${forceRefresh ? 'ON' : 'OFF'}`);
  
  try {
    // Initialize Alchemy SDK with optimized configuration
    const alchemy = new Alchemy({
      apiKey: API_KEY,
      network: Network.BASE_MAINNET,
      maxRetries: 5,  // Add retry logic at the SDK level
      retryDelay: 1000, // Start with 1s delay and increase exponentially
      timeout: 30000 // 30 second timeout for requests
    });
    console.log('Using Alchemy SDK with optimized configuration');
    
    // Get current block number with a buffer to avoid querying blocks that are too recent
    const latestBlock = await alchemy.core.getBlockNumber();
    // Add a buffer of 5 blocks to avoid querying blocks that are too recent
    const currentBlock = latestBlock - 5;
    console.log(`Latest block number: ${latestBlock}`);
    console.log(`Using current block number with buffer: ${currentBlock}`);
    
    // For 2025 data, we need to use the correct block range
    // We'll use a hardcoded start block that we know works for January 2025
    const currentYear = new Date().getFullYear();
    const requestedYear = parseInt(year);
    const currentMonth = new Date().getMonth(); // 0-based (0 = January, 11 = December)
    
    // Use a known good start block for 2025 that captures January data
    let startBlock = 24500000;
    
    // Only log a warning if we're requesting a year other than 2025
    if (requestedYear !== 2025) {
      console.log(`Warning: This script is optimized for 2025 data. Requested year: ${requestedYear}`);
    }
    
    // Special handling for the current month - ensure we capture it correctly
    const isCurrentYearRequested = requestedYear === currentYear;
    if (isCurrentYearRequested) {
      console.log(`Special focus on current month (${currentMonth + 1}) transactions enabled`);
    }
    
    console.log(`Using start block: ${startBlock} for year ${year}`);
    
    // For Base chain specifically, ensure we don't go before the chain's launch
    startBlock = Math.max(startBlock, 1);
    
    // Define date range for the specified year
    const startDate = new Date(parseInt(year), 0, 1); // January 1st of the specified year
    const endDate = new Date(parseInt(year), 11, 31, 23, 59, 59); // December 31st of the specified year
    const now = new Date();
    
    // If the end date is in the future, use current date as end date
    const effectiveEndDate = endDate > now ? now : endDate;
    
    console.log(`Fetching transactions from ${startDate.toISOString()} to ${effectiveEndDate.toISOString()}`);
    console.log(`Scanning blocks from ${startBlock} to ${currentBlock}`);
    
    // Calculate the number of months between start date and effective end date
    const startMonth = startDate.getMonth();
    const endMonth = effectiveEndDate.getMonth();
    
    // Calculate total months to process including the current month
    const monthCount = (effectiveEndDate.getFullYear() - startDate.getFullYear()) * 12 + endMonth - startMonth + 1;
    
    console.log(`Date range: ${startDate.toISOString()} to ${effectiveEndDate.toISOString()}`);
    console.log(`Months to process: ${monthCount} (from month ${startMonth + 1} to ${endMonth + 1})`);
    
    // Dynamically create monthly chunks based on the date range
    const monthlyChunks = [];
    
    // We need to adjust how we calculate block ranges to ensure May transactions are properly captured
    // Instead of evenly distributing blocks, we'll use a more dynamic approach
    
    // Use the currentMonth and currentYear that were already declared above
    const isCurrentYear = parseInt(year) === currentYear;
    
    // Calculate blocks per month with a bias toward more recent months
    // This ensures that May gets a proper allocation of blocks
    const totalBlocks = currentBlock - startBlock;
    
    // Create chunks for all months in the date range
    for (let i = 0; i < monthCount; i++) {
      const chunkStartDate = new Date(startDate);
      chunkStartDate.setMonth(startDate.getMonth() + i);
      
      const monthName = chunkStartDate.toLocaleString('en-US', { month: 'long' });
      const month = chunkStartDate.getMonth() + 1; // 1-based month
      
      // For the current month, we want to ensure we get all transactions by using a wider range
      let chunkStartBlock, chunkEndBlock;
      
      // Special handling for April and May 2025
      if ((month === 4 || month === 5) && parseInt(year) === 2025) {
        // For April and May 2025, calculate a more targeted block range
        // Estimate blocks per day (average on Base chain is around 43200 blocks per day)
        const blocksPerDay = 43200;
        
        // For April (month 4), start from April 1st
        if (month === 4) {
          // April 1st is approximately 90 days into the year
          const daysIntoYear = 90;
          chunkStartBlock = startBlock + (daysIntoYear * blocksPerDay);
          // End at April 30th - but use smaller chunks to avoid RPC timeouts
          // Instead of fetching the whole month, we'll create weekly chunks
          // This will be handled by creating multiple chunks for April
          chunkEndBlock = chunkStartBlock + (7 * blocksPerDay); // Just first week of April
          
          // Create additional chunks for April (will be added separately)
          for (let week = 1; week < 4; week++) {
            const weekStartBlock = chunkStartBlock + (week * 7 * blocksPerDay);
            const weekEndBlock = Math.min(weekStartBlock + (7 * blocksPerDay), chunkStartBlock + (30 * blocksPerDay));
            const weekName = `April-Week${week+1}`;
            
            console.log(`Creating additional chunk for ${weekName} 2025: ${weekStartBlock}-${weekEndBlock}`);
            
            monthlyChunks.push({
              month,
              name: weekName,
              startBlock: weekStartBlock,
              endBlock: weekEndBlock,
              date: new Date(chunkStartDate)
            });
          }
        } 
        // For May (month 5), start from May 1st
        else if (month === 5) {
          // May 1st is approximately 120 days into the year
          const daysIntoYear = 120;
          chunkStartBlock = startBlock + (daysIntoYear * blocksPerDay);
          // End at current block or May 31st, whichever is earlier - but use smaller chunks
          // Just fetch the first week of May in the main chunk
          chunkEndBlock = chunkStartBlock + (7 * blocksPerDay);
          
          // Create additional chunks for May (will be added separately)
          const currentDay = new Date().getDate(); // Current day of the month
          const weeksInMay = Math.ceil(currentDay / 7); // How many weeks we need to cover
          
          for (let week = 1; week < weeksInMay; week++) {
            const weekStartBlock = chunkStartBlock + (week * 7 * blocksPerDay);
            const weekEndBlock = Math.min(weekStartBlock + (7 * blocksPerDay), currentBlock);
            const weekName = `May-Week${week+1}`;
            
            console.log(`Creating additional chunk for ${weekName} 2025: ${weekStartBlock}-${weekEndBlock}`);
            
            monthlyChunks.push({
              month,
              name: weekName,
              startBlock: weekStartBlock,
              endBlock: weekEndBlock,
              date: new Date(chunkStartDate)
            });
          }
        }
        
        console.log(`TARGETED block range for ${monthName} 2025 (first week): ${chunkStartBlock}-${chunkEndBlock}`);
      } 
      // Special handling for the current month if not April or May 2025
      else if (isCurrentYearRequested && month === currentMonth + 1) {
        // For current month, use a very wide block range to ensure we capture all transactions
        // Calculate previous month's block range (handle January as a special case)
        const prevMonthIndex = Math.max(0, currentMonth - 1); // Ensure we don't go below 0 for January
        const prevMonthStartBlock = startBlock + Math.floor((totalBlocks * prevMonthIndex) / monthCount);
        const prevMonthEndBlock = startBlock + Math.floor((totalBlocks * currentMonth) / monthCount) - 1;
        
        // Use a much wider range for current month - start from 50% through previous month's blocks
        chunkStartBlock = prevMonthEndBlock - Math.floor((prevMonthEndBlock - prevMonthStartBlock) * 0.5);
        chunkEndBlock = currentBlock;
        console.log(`EXTRA wide block range for current month (${monthName}): ${chunkStartBlock}-${chunkEndBlock}`);
      
      // Skip the rest of the special handling
      monthlyChunks.push({
          month,
          name: monthName,
          startBlock: chunkStartBlock,
          endBlock: chunkEndBlock,
          date: chunkStartDate
        });
        continue;
      } else {
        // For other months, use the standard calculation
        const prevMonthIndex = Math.max(0, i - 1);
        const prevMonthStartBlock = prevMonthIndex === 0 ? startBlock : startBlock + Math.floor((totalBlocks * prevMonthIndex) / monthCount);
        const prevMonthEndBlock = startBlock + Math.floor((totalBlocks * i) / monthCount) - 1;
        chunkStartBlock = prevMonthEndBlock - Math.floor((prevMonthEndBlock - prevMonthStartBlock) * 0.25); // Start from 75% through previous month
        chunkEndBlock = currentBlock;
        console.log(`Special handling for current month (${monthName}): Using wider block range ${chunkStartBlock}-${chunkEndBlock}`);
      }
      
      monthlyChunks.push({
        month,
        name: monthName,
        startBlock: chunkStartBlock,
        endBlock: chunkEndBlock,
        date: chunkStartDate
      });
    }
    
    console.log(`Created ${monthlyChunks.length} monthly chunks for data fetching`);
    monthlyChunks.forEach(chunk => {
      console.log(`${chunk.name} ${chunk.date.getFullYear()}: blocks ${chunk.startBlock}-${chunk.endBlock}`);
    });
    
    let existingTransactions = [];
    
    if (!forceRefresh) {
      // Get existing transactions if not forcing refresh
      existingTransactions = await getExistingTransactions(walletAddress, year);
      console.log(`Found ${existingTransactions.length} existing transactions in cache`);
    } else {
      console.log('Performing complete refresh of transaction cache');
    }
    
    // Fetch transfers for each month to ensure we have data for all months
    console.log('Fetching transfers for each month...');
    let allIncomingTransfers = [];
    
    for (const chunk of monthlyChunks) {
      console.log(`Fetching incoming transfers for ${chunk.name} 2025 (blocks ${chunk.startBlock}-${chunk.endBlock})...`);
      
      // Use a consistent approach for all months
      const maxCount = 200; // Increase maxCount for all months to get more transactions
      const adjustedStartBlock = chunk.startBlock;
      
      console.log(`Using ${maxCount} maxCount for ${chunk.name}, blocks ${adjustedStartBlock}-${chunk.endBlock}`);
      
      // For May, we need to be more thorough in our search
      // Base Mainnet only supports certain categories
      const categories = ["erc20", "external"];
      // If this is May, also include other transfer types that are supported
      if (chunk.month === 5) {
        // Base Mainnet supports erc721 and erc1155, but not internal or specialnft
        categories.push("erc721", "erc1155");
      }
      
      const monthTransfers = await alchemy.core.getAssetTransfers({
        fromBlock: adjustedStartBlock,
        toBlock: chunk.endBlock,
        toAddress: walletAddress,
        category: categories, // Get transfers of appropriate types
        withMetadata: true, // Include timestamps
        maxCount: chunk.month === 5 ? 500 : maxCount // Increase maxCount for May
      });
      
      console.log(`Found ${monthTransfers.transfers.length} transfers for ${chunk.name} (block range: ${adjustedStartBlock}-${chunk.endBlock})`);
      
      // For May, also check for incoming transfers specifically
      if (chunk.month === 5) {
        // Log details about each transfer to help diagnose the issue
        console.log(`Detailed transfer info for ${chunk.name}:`);
        for (const transfer of monthTransfers.transfers.slice(0, 10)) { // Show first 10 for brevity
          const date = new Date(transfer.metadata.blockTimestamp);
          console.log(`Block: ${transfer.blockNum}, Date: ${date.toISOString()}, From: ${transfer.from}, To: ${transfer.to}, Category: ${transfer.category}`);
        }
      }
      
      console.log(`Found ${monthTransfers.transfers.length} incoming transfers for ${chunk.name}`);
      allIncomingTransfers = allIncomingTransfers.concat(monthTransfers.transfers);
    }
    
    const incomingTransfers = { transfers: allIncomingTransfers };
    console.log(`Found ${incomingTransfers.transfers.length} total incoming transfers across all months`);
    
    // Log all transfer dates to help diagnose the issue
    console.log('Transfer dates found:');
    const transferDates = incomingTransfers.transfers.map(transfer => {
      const date = new Date(transfer.metadata.blockTimestamp);
      return {
        blockNumber: parseInt(transfer.blockNum, 16),
        date: date.toISOString(),
        year: date.getFullYear(),
        month: date.getMonth() + 1
      };
    });
    
    // Group by year and month
    const datesByYearMonth = {};
    for (const dateInfo of transferDates) {
      const key = `${dateInfo.year}-${dateInfo.month.toString().padStart(2, '0')}`;
      if (!datesByYearMonth[key]) {
        datesByYearMonth[key] = 0;
      }
      datesByYearMonth[key]++;
    }
    
    console.log('Transfers by year-month:');
    for (const [yearMonth, count] of Object.entries(datesByYearMonth)) {
      console.log(`${yearMonth}: ${count} transfers`);
    }
    
    // Debug: Log the first transfer to understand structure
    if (incomingTransfers.transfers.length > 0) {
      console.log('Sample incoming transfer:');
      console.log(JSON.stringify(incomingTransfers.transfers[0], null, 2));
    }
    
    // Fetch incoming transfers for each month
    console.log('Fetching transfers for each month...');
    for (const chunk of monthlyChunks) {
      console.log(`Fetching incoming transfers for ${chunk.name} ${year} (blocks ${chunk.startBlock}-${chunk.endBlock})...`);
      
      // For each month, fetch transfers in smaller chunks to avoid timeouts
      // Use a smaller maxCount for more recent months to avoid timeouts
      const maxCount = 200;
      console.log(`Using ${maxCount} maxCount for ${chunk.name}, blocks ${chunk.startBlock}-${chunk.endBlock}`);
      
      // Add pagination and retry logic to fetch all transfers for this month
      let allMonthTransfers = [];
      let pageKey = null;
      const maxPages = 5; // Limit to 5 pages per month to avoid rate limiting
      let currentPage = 0;
      
      do {
        // Add retry logic with exponential backoff for RPC failures
        let retries = 0;
        const maxRetries = 5;
        let transfersResult = null;
        
        while (retries < maxRetries) {
          try {
            // Ensure block range is valid (end block must be >= start block and <= current block)
            let safeEndBlock = Math.min(chunk.endBlock, currentBlock);
            let safeStartBlock = Math.min(chunk.startBlock, safeEndBlock);
            
            console.log(`Using safe block range for ${chunk.name}: ${safeStartBlock}-${safeEndBlock}`);
            
            // Fetch transfers for this chunk with pagination
            const params = {
              fromBlock: '0x' + safeStartBlock.toString(16),
              toBlock: '0x' + safeEndBlock.toString(16),
              toAddress: walletAddress,
              category: ["external", "erc20", "erc721", "erc1155"],
              maxCount: maxCount,
              excludeZeroValue: true,
              order: 'desc' // Most recent first
            };
            
            // Add pageKey if we have one (for pagination)
            if (pageKey) {
              params.pageKey = pageKey;
            }
            
            transfersResult = await alchemy.core.getAssetTransfers(params);
            
            // If we get here, the request succeeded
            break;
          } catch (error) {
            retries++;
            console.log(`RPC error fetching transfers for ${chunk.name} (page ${currentPage + 1}): ${error.message}`);
            console.log(`Block range: ${chunk.startBlock}-${chunk.endBlock} (0x${chunk.startBlock.toString(16)}-0x${chunk.endBlock.toString(16)})`);
            console.log(`Error details:`, error);
            
            if (retries >= maxRetries) {
              console.log(`Maximum retries (${maxRetries}) reached for ${chunk.name} (page ${currentPage + 1}). Using empty result.`);
              // Create an empty result to avoid breaking the flow
              transfersResult = { transfers: [] };
              break;
            }
            
            // Exponential backoff: wait longer between each retry
            const backoffMs = Math.min(1000 * Math.pow(2, retries), 30000); // Cap at 30 seconds
            console.log(`Retrying in ${backoffMs/1000} seconds (attempt ${retries}/${maxRetries})...`);
            await new Promise(resolve => setTimeout(resolve, backoffMs));
          }
        }
        
        // Add the transfers from this page to our collection
        if (transfersResult.transfers && transfersResult.transfers.length > 0) {
          allMonthTransfers = allMonthTransfers.concat(transfersResult.transfers);
          console.log(`Found ${transfersResult.transfers.length} transfers for ${chunk.name} (page ${currentPage + 1})`);
        }
        
        // Get the pageKey for the next page if there is one
        pageKey = transfersResult.pageKey;
        currentPage++;
        
        // If we have a pageKey and haven't reached the max pages, continue to the next page
        if (pageKey && currentPage < maxPages) {
          console.log(`Fetching next page (${currentPage + 1}) for ${chunk.name}...`);
        }
      } while (pageKey && currentPage < maxPages);
      
      // Create a result object with all the transfers we found
      const transfersResult = { transfers: allMonthTransfers };
      
      console.log(`Found ${transfersResult.transfers.length} transfers for ${chunk.name} (block range: ${chunk.startBlock}-${chunk.endBlock})`);
      
      // Store incoming transfers
      incomingTransfers.transfers.push(...transfersResult.transfers);
      console.log(`Found ${transfersResult.transfers.length} incoming transfers for ${chunk.name}`);
      
      // If this is May 2025, log detailed information about the transfers
      if (chunk.name === 'May' && parseInt(year) === 2025) {
        console.log('Detailed transfer info for May:');
        for (const transfer of transfersResult.transfers.slice(0, 10)) { // Show first 10 for brevity
          const timestamp = transfer.metadata && transfer.metadata.blockTimestamp ? transfer.metadata.blockTimestamp : 'unknown';
          console.log(`Block: ${transfer.blockNum}, Date: ${timestamp}, From: ${transfer.from}, To: ${transfer.to}, Category: ${transfer.category}`);
        }
      }
    }
    
    // Fetch outgoing transfers for each month
    console.log('Fetching outgoing transfers for each month...');
    let allOutgoingTransfers = [];
    
    for (const chunk of monthlyChunks) {
      console.log(`Fetching outgoing transfers for ${chunk.name} ${year} (blocks ${chunk.startBlock}-${chunk.endBlock})...`);
      
      // For each month, fetch transfers in smaller chunks to avoid timeouts
      const maxCount = 200;
      console.log(`Using ${maxCount} maxCount for ${chunk.name}, blocks ${chunk.startBlock}-${chunk.endBlock}`);
      
      // Add pagination and retry logic to fetch all outgoing transfers for this month
      let allMonthTransfers = [];
      let pageKey = null;
      const maxPages = 5; // Limit to 5 pages per month to avoid rate limiting
      let currentPage = 0;
      
      do {
        // Add retry logic with exponential backoff for RPC failures
        let retries = 0;
        const maxRetries = 5;
        let transfersResult = null;
        
        while (retries < maxRetries) {
          try {
            // Ensure block range is valid (end block must be >= start block and <= current block)
            let safeEndBlock = Math.min(chunk.endBlock, currentBlock);
            let safeStartBlock = Math.min(chunk.startBlock, safeEndBlock);
            
            console.log(`Using safe block range for ${chunk.name} outgoing: ${safeStartBlock}-${safeEndBlock}`);
            
            // Fetch transfers for this chunk with pagination
            const params = {
              fromBlock: '0x' + safeStartBlock.toString(16),
              toBlock: '0x' + safeEndBlock.toString(16),
              fromAddress: walletAddress,
              category: ["external", "erc20"],
              maxCount: maxCount,
              excludeZeroValue: true,
              order: 'desc' // Most recent first
            };
            
            // Add pageKey if we have one (for pagination)
            if (pageKey) {
              params.pageKey = pageKey;
            }
            
            transfersResult = await alchemy.core.getAssetTransfers(params);
            
            // If we get here, the request succeeded
            break;
          } catch (error) {
            retries++;
            console.log(`RPC error fetching outgoing transfers for ${chunk.name} (page ${currentPage + 1}): ${error.message}`);
            
            if (retries >= maxRetries) {
              console.log(`Maximum retries (${maxRetries}) reached for ${chunk.name} (page ${currentPage + 1}). Using empty result.`);
              // Create an empty result to avoid breaking the flow
              transfersResult = { transfers: [] };
              break;
            }
            
            // Exponential backoff: wait longer between each retry
            const backoffMs = Math.min(1000 * Math.pow(2, retries), 30000); // Cap at 30 seconds
            console.log(`Retrying in ${backoffMs/1000} seconds (attempt ${retries}/${maxRetries})...`);
            await new Promise(resolve => setTimeout(resolve, backoffMs));
          }
        }
        
        // Add the transfers from this page to our collection
        if (transfersResult.transfers && transfersResult.transfers.length > 0) {
          allMonthTransfers = allMonthTransfers.concat(transfersResult.transfers);
          console.log(`Found ${transfersResult.transfers.length} outgoing transfers for ${chunk.name} (page ${currentPage + 1})`);
        }
        
        // Get the pageKey for the next page if there is one
        pageKey = transfersResult.pageKey;
        currentPage++;
        
        // If we have a pageKey and haven't reached the max pages, continue to the next page
        if (pageKey && currentPage < maxPages) {
          console.log(`Fetching next page (${currentPage + 1}) for ${chunk.name} outgoing transfers...`);
        }
      } while (pageKey && currentPage < maxPages);
      
      // Create a result object with all the transfers we found
      const transfersResult = { transfers: allMonthTransfers };
      
      console.log(`Found ${transfersResult.transfers.length} outgoing transfers for ${chunk.name}`);
      allOutgoingTransfers = allOutgoingTransfers.concat(transfersResult.transfers);
    }
    
    const outgoingTransfers = { transfers: allOutgoingTransfers };
    console.log(`Found ${outgoingTransfers.transfers.length} total outgoing transfers across all months`);
    
    // Process transfers into our standard format
    const newTransactions = [];
    
    // Process incoming transfers
    console.log(`Processing ${incomingTransfers.transfers.length} incoming transfers...`);
    for (const transfer of incomingTransfers.transfers) {
      // Skip transfers without metadata or timestamp
      if (!transfer.metadata || !transfer.metadata.blockTimestamp) {
        console.log(`Skipping transfer without timestamp: ${transfer.hash}`);
        continue;
      }
      
      const date = new Date(transfer.metadata.blockTimestamp);
      const formattedDate = format(date, 'yyyy-MM-dd');
      
      // Only include transactions from the specified year (2025)
      const txYear = date.getFullYear();
      const txMonth = date.getMonth() + 1; // 1-indexed month
      
      // Special logging for May 2025 transactions
      if (parseInt(year) === 2025 && (txMonth === 5 || (date.getTime() >= new Date(2025, 4, 1).getTime() && date.getTime() <= new Date(2025, 4, 31, 23, 59, 59).getTime()))) {
        console.log(`Found May transaction: ${formattedDate}, Block: ${transfer.blockNum}, Hash: ${transfer.hash}`);
      }
      
      // Skip if not from the specified year (2025)
      if (txYear !== parseInt(year)) {
        continue;
      }
      
      // Get token amount and USD value
      const tokenAmount = parseFloat(transfer.value);
      const tokenSymbol = transfer.asset;
      
      // Get token price from Aerodrome Finance
      const tokenPrice = await getTokenPrice(tokenSymbol);
      console.log(`Using price for ${tokenSymbol}: $${tokenPrice}`);
      
      // Calculate USD value
      const usdValue = tokenAmount * tokenPrice;
      
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
    console.log(`Processing ${outgoingTransfers.transfers.length} outgoing transfers...`);
    for (const transfer of outgoingTransfers.transfers) {
      // Skip transfers without metadata or timestamp
      if (!transfer.metadata || !transfer.metadata.blockTimestamp) {
        console.log(`Skipping outgoing transfer without timestamp: ${transfer.hash}`);
        continue;
      }
      
      const date = new Date(transfer.metadata.blockTimestamp);
      const formattedDate = format(date, 'yyyy-MM-dd');
      
      // Only include transactions from the specified year (2025)
      const txYear = date.getFullYear();
      const txMonth = date.getMonth() + 1; // 1-indexed month
      
      // Special logging for May 2025 transactions
      if (parseInt(year) === 2025 && (txMonth === 5 || (date.getTime() >= new Date(2025, 4, 1).getTime() && date.getTime() <= new Date(2025, 4, 31, 23, 59, 59).getTime()))) {
        console.log(`Found May outgoing transaction: ${formattedDate}, Block: ${transfer.blockNum}, Hash: ${transfer.hash}`);
      }
      
      // Skip if not from the specified year (2025)
      if (txYear !== parseInt(year)) {
        continue;
      }
      
      // Get token amount and USD value
      const tokenAmount = parseFloat(transfer.value);
      const tokenSymbol = transfer.asset;
      
      // Get token price from Aerodrome Finance
      const tokenPrice = await getTokenPrice(tokenSymbol);
      console.log(`Using price for ${tokenSymbol}: $${tokenPrice}`);
      
      // Calculate USD value
      const usdValue = tokenAmount * tokenPrice;
      
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
    
    // Combine with existing transactions if not forcing refresh
    const allTransactions = forceRefresh ? newTransactions : [...existingTransactions, ...newTransactions];
    
    // Remove duplicates based on transaction hash
    const uniqueTransactions = [];
    const seenHashes = new Set();
    
    for (const tx of allTransactions) {
      if (!tx.transactionHash || seenHashes.has(tx.transactionHash)) {
        continue;
      }
      seenHashes.add(tx.transactionHash);
      uniqueTransactions.push(tx);
    }
    
    // Sort transactions by block number
    uniqueTransactions.sort((a, b) => a.blockNumber - b.blockNumber);
    
    console.log(`Final transaction count: ${uniqueTransactions.length}`);
    
    // Cache the transactions
    const cacheKey = `transactions-${walletAddress}-${year}`;
    await saveToCache(cacheKey, uniqueTransactions, 604800); // Cache for one week
    
    // Update volume cache
    await updateVolumeCache(walletAddress, year, uniqueTransactions, startDate, effectiveEndDate, currentBlock);
    
    console.timeEnd('Alchemy Fetch Time');
    return uniqueTransactions;
  } catch (error) {
    console.error('Error fetching transactions with Alchemy:', error);
    console.timeEnd('Alchemy Fetch Time');
    throw error;
  }
}

/**
 * Update volume cache based on transaction data
 * This function processes incoming transactions (card loads) into daily, weekly, and monthly
 * volume data for visualization in the frontend. Only incoming transactions are used for
 * volume calculations as they represent users loading funds into their USD cards.
 * 
 * @param {string} walletAddress - Wallet address to update volume data for
 * @param {string} year - Year to update volume data for (e.g., '2025')
 * @param {Array} transactions - Array of processed transactions from fetchTransactionsWithAlchemy
 * @param {Date} startDate - Start date for the data range
 * @param {Date} endDate - End date for the data range
 * @returns {void} - No return value, but saves data to cache
 */
async function updateVolumeCache(walletAddress, year, transactions, startDate, endDate, currentBlock) {
  console.log('Updating volume cache with card load data (incoming transactions only)...');
  
  // Process transactions into daily volume data
  const volumeByDay = {};
  const volumeByToken = {};
  
  // Filter to only include incoming transactions (card loads)
  // We need to be careful about how we identify incoming transactions
  const incomingTransactions = transactions.filter(tx => {
    // Standard check for incoming transactions
    if (tx.direction === 'in') {
      return true;
    }
    
    // Additional check for potentially miscategorized incoming transactions
    // If the value is positive and it's a token transfer to our wallet, it's likely an incoming transaction
    if (tx.value > 0 && tx.to === walletAddress) {
      console.log(`Reclassifying transaction as incoming: ${tx.date} - ${tx.hash}`);
      return true;
    }
    
    return false;
  });
  
  console.log(`Processing ${incomingTransactions.length} incoming transactions (card loads) for volume data`);
  
  // Analyze transactions by month for debugging purposes
  const transactionsByMonth = {};
  const incomingTransactionsByMonth = {};
  
  // Group transactions by month
  for (const tx of transactions) {
    const monthYear = tx.date.substring(0, 7); // Format: YYYY-MM
    transactionsByMonth[monthYear] = (transactionsByMonth[monthYear] || 0) + 1;
  }
  
  // Group incoming transactions by month
  for (const tx of incomingTransactions) {
    const monthYear = tx.date.substring(0, 7); // Format: YYYY-MM
    incomingTransactionsByMonth[monthYear] = (incomingTransactionsByMonth[monthYear] || 0) + 1;
  }
  
  // Log transaction counts by month
  console.log('Transactions by month:');
  Object.keys(transactionsByMonth).sort().forEach(month => {
    console.log(`${month}: ${transactionsByMonth[month]} total, ${incomingTransactionsByMonth[month] || 0} incoming`);
  });
  
  // Check for months with transactions but no incoming transactions
  const monthsWithIssues = Object.keys(transactionsByMonth).filter(month => 
    transactionsByMonth[month] > 0 && (!incomingTransactionsByMonth[month] || incomingTransactionsByMonth[month] === 0)
  );
  
  if (monthsWithIssues.length > 0) {
    console.log('\nMonths with transactions but no incoming transactions:');
    monthsWithIssues.forEach(month => {
      console.log(`${month}: ${transactionsByMonth[month]} total transactions, 0 incoming`);
    });
  }
  
  // Additional analysis of incoming transactions by month number only
  const incomingTransactionsByMonthNumber = {};
  for (const tx of incomingTransactions) {
    const month = tx.date.substring(5, 7); // Extract month from YYYY-MM-DD
    if (!incomingTransactionsByMonthNumber[month]) {
      incomingTransactionsByMonthNumber[month] = 0;
    }
    incomingTransactionsByMonthNumber[month]++;
  }
  
  console.log('\nIncoming transactions by month number:');
  for (const [month, count] of Object.entries(incomingTransactionsByMonthNumber)) {
    console.log(`Month ${month}: ${count} incoming transactions`);
  }
  
  for (const tx of incomingTransactions) {
    // Aggregate by day
    if (!volumeByDay[tx.date]) {
      volumeByDay[tx.date] = 0;
    }
    volumeByDay[tx.date] += tx.value;
    
    // Also track volume by token
    if (!volumeByToken[tx.token]) {
      volumeByToken[tx.token] = 0;
    }
    volumeByToken[tx.token] += tx.value;
  }
  
  // Convert to array format for daily data
  const dailyData = Object.entries(volumeByDay).map(([date, value]) => ({
    date,
    volume: value // Using 'volume' instead of 'value' to match frontend expectations
  }));
  
  // Sort by date
  dailyData.sort((a, b) => new Date(a.date) - new Date(b.date));
  
  // Aggregate by week and fill in missing weeks
  const weeklyData = [];
  const weekMap = new Map();
  
  // First, aggregate the actual data by week
  for (const day of dailyData) {
    // Get the start of the week (Tuesday) for this date to match existing data format
    // Find the Tuesday of the week
    const date = new Date(day.date);
    // Find the first Tuesday in or after the start date
    while (date.getDay() !== 2) { // 2 = Tuesday
      date.setDate(date.getDate() + 1);
    }
    const weekStart = new Date(date);
    weekStart.setDate(date.getDate() - date.getDay() + (date.getDay() === 0 ? -6 : 1)); // Start on Monday
    const weekStartStr = weekStart.toISOString().split('T')[0]; // Format as YYYY-MM-DD
    
    if (!weekMap.has(weekStartStr)) {
      weekMap.set(weekStartStr, 0);
    }
    weekMap.set(weekStartStr, weekMap.get(weekStartStr) + day.volume);
  }
  
  // Now fill in all weeks in the date range
  const allWeeks = fillMissingWeeks(weekMap, startDate, endDate);
  
  // Convert to array format
  for (const [date, volume] of allWeeks) {
    weeklyData.push({ date, volume });
  }
  
  // Sort weekly data by date
  weeklyData.sort((a, b) => new Date(a.date) - new Date(b.date));
  
  // Aggregate by month and fill in missing months
  const monthlyData = [];
  const monthMap = new Map();
  
  // First, aggregate the actual data by month
  for (const day of dailyData) {
    const date = new Date(day.date);
    const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
    const monthStartStr = monthStart.toISOString().split('T')[0]; // Format as YYYY-MM-DD
    
    if (!monthMap.has(monthStartStr)) {
      monthMap.set(monthStartStr, 0);
    }
    monthMap.set(monthStartStr, monthMap.get(monthStartStr) + day.volume);
  }
  
  // Now fill in all months in the date range
  const allMonths = fillMissingMonths(monthMap, startDate, endDate);
  
  // Convert to array format
  for (const [date, volume] of allMonths) {
    monthlyData.push({ date, volume });
  }
  
  // Sort monthly data by date
  monthlyData.sort((a, b) => new Date(a.date) - new Date(b.date));
  
  // We're only using real transaction data, no placeholders

  // Format data as expected by the frontend API
  let volumeData = {
    daily: dailyData,
    weekly: weeklyData,
    monthly: monthlyData,
    source: 'blockchain',
    lastUpdated: new Date().toISOString()
  };
  
  // Regenerate weekly and monthly data after ensuring all months have data
  // Aggregate by week
  const updatedWeeklyData = [];
  const updatedWeekMap = new Map();
  
  for (const day of volumeData.daily) {
    // Get the start of the week (Monday) for this date
    const date = new Date(day.date);
    const weekStart = new Date(date);
    weekStart.setDate(date.getDate() - date.getDay() + (date.getDay() === 0 ? -6 : 1)); // Start on Monday
    const weekStartStr = weekStart.toISOString().split('T')[0]; // Format as YYYY-MM-DD
    
    if (!updatedWeekMap.has(weekStartStr)) {
      updatedWeekMap.set(weekStartStr, 0);
    }
    updatedWeekMap.set(weekStartStr, updatedWeekMap.get(weekStartStr) + day.volume);
  }
  
  for (const [date, volume] of updatedWeekMap.entries()) {
    updatedWeeklyData.push({ date, volume });
  }
  
  // Sort weekly data by date
  updatedWeeklyData.sort((a, b) => new Date(a.date) - new Date(b.date));
  
  // Aggregate by month
  const updatedMonthlyData = [];
  const updatedMonthMap = new Map();
  
  for (const day of volumeData.daily) {
    const date = new Date(day.date);
    const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
    const monthStartStr = monthStart.toISOString().split('T')[0]; // Format as YYYY-MM-DD
    
    if (!updatedMonthMap.has(monthStartStr)) {
      updatedMonthMap.set(monthStartStr, 0);
    }
    updatedMonthMap.set(monthStartStr, updatedMonthMap.get(monthStartStr) + day.volume);
  }
  
  for (const [date, volume] of updatedMonthMap.entries()) {
    updatedMonthlyData.push({ date, volume });
  }
  
  // Sort monthly data by date
  updatedMonthlyData.sort((a, b) => new Date(a.date) - new Date(b.date));
  
  // Update the volume data with the regenerated weekly and monthly data
  volumeData.weekly = updatedWeeklyData;
  volumeData.monthly = updatedMonthlyData;
  
  // Create the final data structure with simplified schema (no nesting) and block info
  const finalVolumeData = {
    daily: dailyData,
    weekly: weeklyData,
    monthly: monthlyData,
    lastUpdated: new Date().toISOString(),
    blockInfo: {
      lastProcessedBlock: currentBlock,
      processingDate: new Date().toISOString()
    }
  };
  
  // Check if we have existing data in the cache
  const volumeCacheKey = `volume-${walletAddress}-${year}`;
  let existingVolumeData = await getFromCache(volumeCacheKey);
  
  // Save the processed data to cache
  await saveToCache(volumeCacheKey, finalVolumeData);
  
  console.log(`Updated volume cache for ${walletAddress} (${year}) with ${dailyData.length} daily entries, ${weeklyData.length} weekly entries, and ${monthlyData.length} monthly entries`);
  
  // Log token volume breakdown
  console.log('Volume by token:');
  
  // Log volume by token
  console.log('Card load volume by token:');
  let totalVolume = 0;
  for (const [token, volume] of Object.entries(volumeByToken)) {
    console.log(`${token}: $${volume.toFixed(2)}`);
    totalVolume += volume;
  }
  console.log(`Total card load volume: $${totalVolume.toFixed(2)}`);
}

/**
 * Fill in missing weeks with zero volume
 * @param {Map} weekMap - Map of existing weeks and their volumes
 * @param {Date} startDate - Start date for the data range
 * @param {Date} endDate - End date for the data range
 * @returns {Map} Map with all weeks in the range
 */
function fillMissingWeeks(weekMap, startDate, endDate) {
  const allWeeks = new Map(weekMap);
  const currentDate = new Date(startDate);
  
  // Set to Tuesday (to match the format in the cache file)
  // Find the first Tuesday in or after the start date
  while (currentDate.getDay() !== 2) { // 2 = Tuesday
    currentDate.setDate(currentDate.getDate() + 1);
  }
  
  // Iterate through all weeks until end date
  while (currentDate <= endDate) {
    const dateStr = currentDate.toISOString().split('T')[0];
    
    // If this week doesn't exist in the map, add it with zero volume
    if (!allWeeks.has(dateStr)) {
      allWeeks.set(dateStr, 0);
    }
    
    // Move to next week
    currentDate.setDate(currentDate.getDate() + 7);
  }
  
  return allWeeks;
}

/**
 * Fill in missing months with zero volume
 * @param {Map} monthMap - Map of existing months and their volumes
 * @param {Date} startDate - Start date for the data range
 * @param {Date} endDate - End date for the data range
 * @returns {Map} Map with all months in the range
 */
function fillMissingMonths(monthMap, startDate, endDate) {
  const allMonths = new Map(monthMap);
  const currentDate = new Date(startDate);
  
  // Set to the first day of the month
  currentDate.setDate(1);
  
  // Iterate through all months until end date
  while (currentDate <= endDate) {
    const dateStr = currentDate.toISOString().split('T')[0];
    
    // If this month doesn't exist in the map, add it with zero volume
    if (!allMonths.has(dateStr)) {
      allMonths.set(dateStr, 0);
    }
    
    // Move to next month
    currentDate.setMonth(currentDate.getMonth() + 1);
  }

  return allMonths;
}

// Export the fetchTransactionsWithAlchemy function for use by other modules
export { fetchTransactionsWithAlchemy };

// Default export for use by preloadCache.js
export default async function initialCacheFetch(forceRefresh = true) {
  try {
    const walletAddress = process.env.CYPHER_MASTER_WALLET || '0xcCCd218A58B53C67fC17D8C87Cb90d83614e35fD';
    const year = '2025';
    
    console.log(`Using wallet address: ${walletAddress}`);
    
    // Load the Alchemy API key
    if (!process.env.ALCHEMY_API_KEY) {
      throw new Error('ALCHEMY_API_KEY is not defined in the environment variables');
    }
    console.log('Alchemy API Key loaded successfully');
    
    // Fetch transactions for the specified wallet and year
    const transactions = await fetchTransactionsWithAlchemy(walletAddress, year, forceRefresh);
    
    console.log('Blockchain data fetching completed successfully');
    return transactions;
  } catch (error) {
    console.error('Error in initialCacheFetch:', error);
    throw error;
  }
}

// Only run the function directly if this script is executed directly (not imported)
if (import.meta.url === import.meta.url.match(/[^/]*$/)[0]) {
  fetchTransactionsWithAlchemy(CYPHER_MASTER_WALLET, '2025', true).then(transactions => {
    console.log('Alchemy cache update completed successfully');
    console.log(`Total transactions: ${transactions.length}`);

    // Group by month
    const transactionsByMonth = {};
    for (const tx of transactions) {
      const month = tx.date.substring(5, 7); // Extract month from YYYY-MM-DD
      if (!transactionsByMonth[month]) {
        transactionsByMonth[month] = 0;
      }
      transactionsByMonth[month]++;
    }

    // Log information about transactions by month
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth(); // 0-based (0 = January, 11 = December)

    // If we're in May 2025, check if we have May transactions
    if (currentYear === 2025 && currentMonth === 4) {
      if (!transactionsByMonth['05'] || transactionsByMonth['05'] === 0) {
        console.log('WARNING: No May 2025 transactions found in the data.');
        console.log('This could be due to:');
        console.log('1. No actual transactions occurred in May 2025');
        console.log('2. The block range used for May is not capturing the correct transactions');
        console.log('3. The date filtering is not correctly identifying May transactions');
      } else {
        console.log(`Found ${transactionsByMonth['05']} transactions for May 2025.`);
      }

      // Check April 2025 as well
      if (!transactionsByMonth['04'] || transactionsByMonth['04'] === 0) {
        console.log('WARNING: No April 2025 transactions found in the data.');
      } else {
        console.log(`Found ${transactionsByMonth['04']} transactions for April 2025.`);
      }

      // Check March 2025 as well
      if (!transactionsByMonth['03'] || transactionsByMonth['03'] === 0) {
        console.log('WARNING: No March 2025 transactions found in the data.');
      } else {
        console.log(`Found ${transactionsByMonth['03']} transactions for March 2025.`);
      }
    }

    console.log('Transaction processing complete.');
  }).catch(error => {
    console.error('Error in Alchemy transaction processing:', error);
  });
}

// Only run the function directly if this script is the main entry point
if (import.meta.url.includes('/alchemyTest.js')) {
  fetchTransactionsWithAlchemy(CYPHER_MASTER_WALLET, '2025', true).then(transactions => {
    console.log('Alchemy cache update completed successfully');
    console.log(`Total transactions: ${transactions.length}`);
    
    // Group by month
    const transactionsByMonth = {};
    for (const tx of transactions) {
      const month = tx.date.substring(5, 7); // Extract month from YYYY-MM-DD
      if (!transactionsByMonth[month]) {
        transactionsByMonth[month] = 0;
      }
      transactionsByMonth[month]++;
    }
    
    // Log information about transactions by month
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth(); // 0-based (0 = January, 11 = December)
    
    // If we're in May 2025, check if we have May transactions
    if (currentYear === 2025 && currentMonth === 4) {
      if (!transactionsByMonth['05'] || transactionsByMonth['05'] === 0) {
        console.log('WARNING: No May 2025 transactions found in the data.');
        console.log('This could be due to:');
        console.log('1. No actual transactions occurred in May 2025');
        console.log('2. The block range used for May is not capturing the correct transactions');
        console.log('3. The date filtering is not correctly identifying May transactions');
      } else {
        console.log(`Found ${transactionsByMonth['05']} transactions for May 2025.`);
      }
      
      // Check April 2025 as well
      if (!transactionsByMonth['04'] || transactionsByMonth['04'] === 0) {
        console.log('WARNING: No April 2025 transactions found in the data.');
      } else {
        console.log(`Found ${transactionsByMonth['04']} transactions for April 2025.`);
      }
      
      // Check March 2025 as well
      if (!transactionsByMonth['03'] || transactionsByMonth['03'] === 0) {
        console.log('WARNING: No March 2025 transactions found in the data.');
      } else {
        console.log(`Found ${transactionsByMonth['03']} transactions for March 2025.`);
      }
    }
    
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
  }).catch(error => {
    console.error('Alchemy cache update failed:', error);
  });
}