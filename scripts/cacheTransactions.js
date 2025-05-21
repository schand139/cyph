import { createPublicClient, http, formatUnits, erc20Abi, parseAbiItem } from 'viem';
import { base } from 'viem/chains';
import { format, startOfDay, startOfWeek, startOfMonth, parseISO } from 'date-fns';
import { saveData, getData, dataExists, updateData } from '../utils/unifiedCacheManager.js';

// Cypher master wallet address
const CYPHER_MASTER_WALLET = '0xcCCd218A58B53C67fC17D8C87Cb90d83614e35fD';

// Common tokens on Base
const TOKENS = {
  ETH: {
    address: '0x0000000000000000000000000000000000000000', // Native ETH
    symbol: 'ETH',
    decimals: 18,
    isNative: true
  },
  USDC: {
    address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    symbol: 'USDC',
    decimals: 6,
    isStablecoin: true // USDC is a stablecoin with 1:1 USD value
  },
  WETH: {
    address: '0x4200000000000000000000000000000000000006',
    symbol: 'WETH',
    decimals: 18
  },
  DAI: {
    address: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb',
    symbol: 'DAI',
    decimals: 18,
    isStablecoin: true
  },
  USDT: {
    address: '0x7F5373AE26c3E8FfC4c77b7255DF7eC1A9aF52a6',
    symbol: 'USDT',
    decimals: 6,
    isStablecoin: true
  }
};

// Define the Transfer event ABI item explicitly
const transferEventAbiItem = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)');

// Helper function to get token price in USD
async function getTokenPriceInUSD(tokenSymbol) {
  // For stablecoins, return 1:1 USD value
  const token = Object.values(TOKENS).find(t => t.symbol === tokenSymbol);
  if (token && token.isStablecoin) {
    return 1;
  }
  
  // Fallback prices if API fails
  const fallbackPrices = {
    'ETH': 3500,
    'WETH': 3500,
    'USDC': 1,
    'DAI': 1,
    'USDT': 1
  };
  
  return fallbackPrices[tokenSymbol] || 0;
}

/**
 * Helper function to estimate block number from timestamp.
 * This is an approximation. For exact block numbers, use a dedicated API
 * like Etherscan's `getBlockNumberByTimestamp` or Alchemy's equivalent.
 * @param {import('viem').PublicClient} client - The viem public client.
 * @param {number} timestampInSeconds - The UNIX timestamp in seconds.
 * @returns {Promise<bigint>} Estimated block number as BigInt.
 */
async function getBlockNumberForTimestamp(client, timestampInSeconds) {
  const latestBlock = await client.getBlock({ blockTag: 'latest' });
  const latestTimestamp = Number(latestBlock.timestamp);
  const latestBlockNumber = Number(latestBlock.number);

  // Average block time on Base is around 2 seconds
  const avgBlockTime = 2; // seconds

  const blockDifference = Math.floor((latestTimestamp - timestampInSeconds) / avgBlockTime);
  const estimatedBlockNumber = latestBlockNumber - blockDifference;

  // Ensure block number is not negative and at least 1
  return BigInt(Math.max(1, estimatedBlockNumber));
}

/**
 * Fetches logs from the blockchain in smaller chunks to bypass RPC block range limits.
 * @param {import('viem').PublicClient} client - The viem public client.
 * @param {import('viem').GetLogsParameters} params - The base parameters for getLogs.
 * @param {number} chunkSize - The maximum number of blocks to query in each chunk.
 * @returns {Promise<Array<import('viem').Log>>} An array of all fetched logs.
 */
async function getLogsInChunks(client, params, chunkSize = 10000) { // Reduced chunk size to 10,000 blocks
  const allLogs = [];
  let currentFromBlock = params.fromBlock;
  const targetToBlock = params.toBlock;

  // Ensure fromBlock and toBlock are BigInts
  if (typeof currentFromBlock !== 'bigint') currentFromBlock = BigInt(currentFromBlock);
  if (typeof targetToBlock !== 'bigint') targetToBlock = BigInt(targetToBlock);

  console.log(`Starting chunked log fetching from ${currentFromBlock} to ${targetToBlock} with chunk size ${chunkSize}`);

  // Scan a much larger portion of the blockchain to capture all transactions
  // Higher value means more comprehensive data but longer processing time
  const maxChunksToProcess = 100; // Significantly increased to capture all transactions
  let chunksProcessed = 0;

  while (currentFromBlock <= targetToBlock && chunksProcessed < maxChunksToProcess) {
    let chunkToBlock = currentFromBlock + BigInt(chunkSize) - 1n; // -1n to make chunk inclusive
    if (chunkToBlock > targetToBlock) {
      chunkToBlock = targetToBlock;
    }

    let retryCount = 0;
    const maxRetries = 3;
    let success = false;

    while (retryCount < maxRetries && !success) {
      try {
        console.log(`Fetching logs for chunk: ${currentFromBlock} to ${chunkToBlock} (Attempt ${retryCount + 1})`);
        const logs = await client.getLogs({
          ...params,
          fromBlock: currentFromBlock,
          toBlock: chunkToBlock,
        });
        allLogs.push(...logs);
        console.log(`Fetched ${logs.length} logs in chunk ${currentFromBlock}-${chunkToBlock}.`);
        success = true;
      } catch (error) {
        retryCount++;
        console.error(`Error fetching logs for chunk ${currentFromBlock}-${chunkToBlock} (Attempt ${retryCount}):`, error.message);
        
        // Check for specific error types
        if (error.message.includes('block range is too wide')) {
          // If the range is too wide, reduce the chunk size and retry
          const newChunkSize = Math.floor(chunkSize / 2);
          console.log(`Reducing chunk size to ${newChunkSize} blocks and retrying...`);
          chunkSize = newChunkSize;
          chunkToBlock = currentFromBlock + BigInt(chunkSize) - 1n;
          if (chunkToBlock > targetToBlock) {
            chunkToBlock = targetToBlock;
          }
        } else if (error.message.includes('no backend is currently healthy') || 
                  error.message.includes('503') || 
                  error.message.includes('service unavailable')) {
          // RPC node is overloaded, wait longer before retrying
          const waitTime = 2000 * retryCount; // Exponential backoff
          console.log(`RPC node is overloaded. Waiting ${waitTime}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        } else if (retryCount === maxRetries) {
          // If we've reached max retries, throw the error to trigger fallback
          console.error('Max retries reached, falling back to mock data.');
          throw error;
        } else {
          // For other errors, wait a bit before retrying
          const waitTime = 1000 * retryCount;
          console.log(`Unknown error. Waiting ${waitTime}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
    }

    // If we couldn't successfully fetch this chunk after all retries, break the loop
    if (!success) {
      console.error(`Failed to fetch chunk after ${maxRetries} retries. Moving to fallback.`);
      throw new Error('Failed to fetch logs after maximum retries');
    }

    currentFromBlock = chunkToBlock + 1n; // Move to the next block after the current chunk
    chunksProcessed++;
  }

  // If we've processed the maximum chunks but there are more to go, log a message
  if (currentFromBlock <= targetToBlock) {
    console.log(`Processed ${maxChunksToProcess} chunks. In production, would continue processing remaining blocks.`);
  }

  return allLogs;
}

/**
 * Fetch and cache transactions for a specific wallet and year
 * @param {string} walletAddress - The wallet address to fetch transactions for
 * @param {string|number} year - The year to fetch transactions for
 */
async function fetchAndCacheTransactions(walletAddress = CYPHER_MASTER_WALLET, year = '2025') {
  console.log(`Fetching and caching transactions for wallet ${walletAddress} for year ${year}`);
  
  // Create client for Base chain
  const client = createPublicClient({
    chain: base,
    transport: http('https://mainnet.base.org'), // Consider using a dedicated RPC provider for higher rate limits
  });
  
  // Define date range for the specified year
  const startDate = new Date(parseInt(year), 0, 1); // January 1st of the year
  const endDate = new Date(parseInt(year), 11, 31, 23, 59, 59); // December 31st of the year, end of day
  const now = new Date();
  
  // If the end date is in the future, use current date as end date
  const effectiveEndDate = endDate > now ? now : endDate;
  
  try {
    console.log(`Connecting to chain and getting latest block info...`);
    const currentBlockNumber = await client.getBlockNumber();
    console.log(`Current block number: ${currentBlockNumber}`);
    
    const latestBlock = await client.getBlock({ blockTag: 'latest' });
    console.log(`Latest block: ${latestBlock.number}, timestamp: ${new Date(Number(latestBlock.timestamp) * 1000).toISOString()}`);
    
    // Get block numbers for the date range
    const fromBlock = await getBlockNumberForTimestamp(client, Math.floor(startDate.getTime() / 1000));
    const toBlock = await getBlockNumberForTimestamp(client, Math.floor(effectiveEndDate.getTime() / 1000));

    console.log(`Scanning blocks from ${fromBlock} to ${toBlock}`);
    
    // Array to store all transactions
    const transactions = [];
    
    // First, let's scan for ALL incoming ERC-20 transfers to this wallet
    console.log(`Scanning for ALL incoming ERC-20 transfers to ${walletAddress}...`);
    
    // This query will find ALL incoming token transfers to the wallet, regardless of token type
    const allIncomingTransfers = await getLogsInChunks(client, {
      abi: erc20Abi,
      event: transferEventAbiItem,
      args: {
        to: walletAddress
      },
      fromBlock: fromBlock,
      toBlock: toBlock
    });
    
    console.log(`Found ${allIncomingTransfers.length} total incoming ERC-20 transfers from all tokens`);
    
    // Group transfers by token address to identify all tokens received
    const transfersByToken = {};
    for (const transfer of allIncomingTransfers) {
      const tokenAddress = transfer.address.toLowerCase();
      if (!transfersByToken[tokenAddress]) {
        transfersByToken[tokenAddress] = [];
      }
      transfersByToken[tokenAddress].push(transfer);
    }
    
    console.log(`Detected ${Object.keys(transfersByToken).length} unique token contracts with incoming transfers`);
    
    // Process each known token first
    for (const [tokenKey, tokenInfo] of Object.entries(TOKENS)) {
      if (tokenInfo.isNative) {
        // Skip native ETH for now, we'll handle it separately
        continue;
      }
      
      console.log(`Querying for incoming ${tokenInfo.symbol} transfers to ${walletAddress} in chunks...`);
      const incomingTransfers = await getLogsInChunks(client, {
        address: tokenInfo.address,
        abi: erc20Abi,
        event: transferEventAbiItem,
        args: {
          to: walletAddress
        },
        fromBlock: fromBlock,
        toBlock: toBlock
      });
      
      console.log(`Found ${incomingTransfers.length} incoming ${tokenInfo.symbol} transfers.`);
      
      // Get token price in USD
      const tokenPrice = await getTokenPriceInUSD(tokenInfo.symbol);
      console.log(`Using price for ${tokenInfo.symbol}: $${tokenPrice}`);
      
      // Process incoming transfers
      for (const transfer of incomingTransfers) {
        // Fetch block details to get timestamp
        const block = await client.getBlock({
          blockHash: transfer.blockHash
        });
        
        const timestamp = Number(block.timestamp); // Timestamp in seconds
        const date = new Date(timestamp * 1000); // Convert to milliseconds for Date object
        const formattedDate = format(date, 'yyyy-MM-dd');
        
        // Convert token amount to USD value based on decimals
        const tokenAmount = Number(formatUnits(transfer.args.value, tokenInfo.decimals));
        const usdValue = tokenAmount * tokenPrice;
        
        transactions.push({
          date: formattedDate,
          value: usdValue,
          token: tokenInfo.symbol,
          tokenAmount,
          direction: 'in',
          blockNumber: Number(transfer.blockNumber),
          transactionHash: transfer.transactionHash
        });
      }
      
      // Get transfers from the wallet (outgoing)
      console.log(`Querying for outgoing ${tokenInfo.symbol} transfers from ${walletAddress} in chunks...`);
      const outgoingTransfers = await getLogsInChunks(client, {
        address: tokenInfo.address,
        abi: erc20Abi,
        event: transferEventAbiItem,
        args: {
          from: walletAddress
        },
        fromBlock: fromBlock,
        toBlock: toBlock
      });
      
      console.log(`Found ${outgoingTransfers.length} outgoing ${tokenInfo.symbol} transfers.`);
      
      // Process outgoing transfers
      for (const transfer of outgoingTransfers) {
        // Fetch block details to get timestamp
        const block = await client.getBlock({
          blockHash: transfer.blockHash
        });
        
        const timestamp = Number(block.timestamp); // Timestamp in seconds
        const date = new Date(timestamp * 1000); // Convert to milliseconds for Date object
        const formattedDate = format(date, 'yyyy-MM-dd');
        
        // Convert token amount to USD value
        const tokenAmount = Number(formatUnits(transfer.args.value, tokenInfo.decimals));
        const usdValue = tokenAmount * tokenPrice;
        
        transactions.push({
          date: formattedDate,
          value: usdValue,
          token: tokenInfo.symbol,
          tokenAmount,
          direction: 'out',
          blockNumber: Number(transfer.blockNumber),
          transactionHash: transfer.transactionHash
        });
      }
    }
    
    console.log(`Total transactions processed: ${transactions.length}`);
    
    // Sort transactions by block number
    transactions.sort((a, b) => a.blockNumber - b.blockNumber);
    
    // Now process any unknown tokens that weren't in our predefined list
    console.log('Processing unknown tokens...');
    const knownTokenAddresses = Object.values(TOKENS).map(t => t.address.toLowerCase());
    
    for (const [tokenAddress, transfers] of Object.entries(transfersByToken)) {
      // Skip tokens we've already processed
      if (knownTokenAddresses.includes(tokenAddress.toLowerCase())) {
        continue;
      }
      
      console.log(`Processing unknown token at address: ${tokenAddress} with ${transfers.length} transfers`);
      
      try {
        // Try to get token metadata
        const tokenContract = {
          address: tokenAddress,
          abi: erc20Abi
        };
        
        // Get token symbol and decimals
        let tokenSymbol = 'UNKNOWN';
        let tokenDecimals = 18; // Default to 18 decimals
        
        try {
          tokenSymbol = await client.readContract({
            ...tokenContract,
            functionName: 'symbol'
          });
          
          tokenDecimals = await client.readContract({
            ...tokenContract,
            functionName: 'decimals'
          });
          
          console.log(`Identified token: ${tokenSymbol} with ${tokenDecimals} decimals`);
        } catch (metadataError) {
          console.warn(`Could not get metadata for token at ${tokenAddress}:`, metadataError.message);
        }
        
        // Assume a default price of $1 for unknown tokens
        // This is a simplification - in a production environment, you would use a price oracle
        const tokenPrice = 1;
        
        // Process each transfer
        for (const transfer of transfers) {
          // Fetch block details to get timestamp
          const block = await client.getBlock({
            blockHash: transfer.blockHash
          });
          
          const timestamp = Number(block.timestamp); // Timestamp in seconds
          const date = new Date(timestamp * 1000); // Convert to milliseconds for Date object
          const formattedDate = format(date, 'yyyy-MM-dd');
          
          // Convert token amount to USD value based on decimals
          const tokenAmount = Number(formatUnits(transfer.args.value, tokenDecimals));
          const usdValue = tokenAmount * tokenPrice;
          
          transactions.push({
            date: formattedDate,
            value: usdValue,
            token: tokenSymbol,
            tokenAmount,
            direction: 'in',
            blockNumber: Number(transfer.blockNumber),
            transactionHash: transfer.transactionHash
          });
        }
      } catch (tokenError) {
        console.error(`Error processing token at ${tokenAddress}:`, tokenError);
      }
    }
    
    console.log(`Total transactions processed: ${transactions.length}`);
    
    // Sort transactions by block number
    transactions.sort((a, b) => a.blockNumber - b.blockNumber);
    
    // Cache the raw transaction data with all transactions (known and unknown tokens)
    const transactionsCacheKey = `transactions-${walletAddress}-${year}`;
    await saveData(transactionsCacheKey, transactions, 86400); // Cache for 24 hours
    
    // Process and cache the aggregated data
    processAndCacheAggregatedData(transactions, walletAddress, year);
    
    return transactions;
  } catch (error) {
    console.error('Error fetching blockchain data:', error);
    throw error;
  }
}

/**
 * Process raw transactions and cache aggregated data
 * @param {Array} transactions - Raw transaction data
 * @param {string} walletAddress - Wallet address
 * @param {string|number} year - Year
 */
async function processAndCacheAggregatedData(transactions, walletAddress, year) {
  console.log(`Processing and caching aggregated data for ${transactions.length} transactions`);
  
  // Aggregate transactions by day
  const dailyVolumes = new Map();
  const incomingTransactions = transactions.filter(tx => tx.direction === 'in');
  
  console.log(`Found ${incomingTransactions.length} incoming transactions for volume analysis`);
  
  // Group incoming transactions by date and token
  const transactionsByToken = {};
  for (const tx of incomingTransactions) {
    if (!transactionsByToken[tx.token]) {
      transactionsByToken[tx.token] = [];
    }
    transactionsByToken[tx.token].push(tx);
  }
  
  // Log breakdown by token
  Object.keys(transactionsByToken).forEach(token => {
    console.log(`${token}: ${transactionsByToken[token].length} incoming transactions`);
  });
  
  // Calculate daily volumes from all incoming transactions
  for (const tx of incomingTransactions) {
    if (!dailyVolumes.has(tx.date)) {
      dailyVolumes.set(tx.date, 0);
    }
    
    // Add USD value to the daily volume
    dailyVolumes.set(tx.date, dailyVolumes.get(tx.date) + tx.value);
  }
  
  // Convert to array format
  const dailyData = Array.from(dailyVolumes.entries()).map(([date, volume]) => ({
    date,
    volume: Math.round(volume)
  }));
  
  // Sort by date
  dailyData.sort((a, b) => new Date(a.date) - new Date(b.date));
  
  // Fill in missing days with zero volume
  const startDate = new Date(parseInt(year), 0, 1); // January 1st of the year
  const endDate = new Date(parseInt(year), 11, 31); // December 31st of the year
  const now = new Date();
  
  // Only fill data up to current date if the year is the current year
  const effectiveEndDate = endDate > now ? now : endDate;
  
  const filledDailyData = [];
  let currentDate = new Date(startDate);
  
  while (currentDate <= effectiveEndDate) {
    const dateStr = format(currentDate, 'yyyy-MM-dd');
    const existingEntry = dailyData.find(entry => entry.date === dateStr);
    
    if (existingEntry) {
      filledDailyData.push(existingEntry);
    } else {
      filledDailyData.push({
        date: dateStr,
        volume: 0
      });
    }
    
    // Move to next day
    currentDate.setDate(currentDate.getDate() + 1);
  }
  
  // Aggregate by week
  const weeklyData = [];
  const weekMap = new Map();
  
  for (const day of filledDailyData) {
    const date = parseISO(day.date);
    const weekStart = format(startOfWeek(date, { weekStartsOn: 1 }), 'yyyy-MM-dd');
    
    if (!weekMap.has(weekStart)) {
      weekMap.set(weekStart, 0);
    }
    weekMap.set(weekStart, weekMap.get(weekStart) + day.volume);
  }
  
  for (const [date, volume] of weekMap.entries()) {
    weeklyData.push({ date, volume });
  }
  
  // Sort weekly data by date
  weeklyData.sort((a, b) => new Date(a.date) - new Date(b.date));
  
  // Aggregate by month
  const monthlyData = [];
  const monthMap = new Map();
  
  for (const day of filledDailyData) {
    const date = parseISO(day.date);
    const monthStart = format(startOfMonth(date), 'yyyy-MM-dd');
    
    if (!monthMap.has(monthStart)) {
      monthMap.set(monthStart, 0);
    }
    monthMap.set(monthStart, monthMap.get(monthStart) + day.volume);
  }
  
  for (const [date, volume] of monthMap.entries()) {
    monthlyData.push({ date, volume });
  }
  
  // Sort monthly data by date
  monthlyData.sort((a, b) => new Date(a.date) - new Date(b.date));
  
  // Prepare aggregated data
  const aggregatedData = {
    daily: filledDailyData,
    weekly: weeklyData,
    monthly: monthlyData,
    source: 'blockchain',
    lastUpdated: new Date().toISOString(),
    highestBlockNumber: transactions.length > 0 ? Math.max(...transactions.map(tx => tx.blockNumber)) : 0
  };
  
  // Cache the aggregated data
  const volumeCacheKey = `volume-${walletAddress}-${year}`;
  await saveData(volumeCacheKey, aggregatedData, 86400); // Cache for 24 hours
  
  console.log(`Cached aggregated data with key: ${volumeCacheKey}`);
  
  return aggregatedData;
}

/**
 * Update cached transactions with new ones
 * @param {string} walletAddress - The wallet address to fetch transactions for
 * @param {string|number} year - The year to fetch transactions for
 */
async function updateCachedTransactions(walletAddress = CYPHER_MASTER_WALLET, year = '2025') {
  console.log(`Updating cached transactions for wallet ${walletAddress} for year ${year}`);
  
  // Get cached transactions
  const cacheKey = `transactions-${walletAddress}-${year}`;
  if (!await dataExists(cacheKey)) {
    console.log(`No existing cache found for ${walletAddress} for year ${year}. Creating new cache...`);
    return await fetchAndCacheTransactions(walletAddress, year);
  }
  
  const cachedData = await getData(cacheKey);
  
  // Get the highest block number from cached transactions
  const highestBlockNumber = cachedData.length > 0 
    ? Math.max(...cachedData.map(tx => tx.blockNumber)) 
    : 0;
  
  console.log(`Highest cached block number: ${highestBlockNumber}`);
  
  // Create client for Base chain
  const client = createPublicClient({
    chain: base,
    transport: http('https://mainnet.base.org'),
  });
  
  // Get current block number
  const currentBlockNumber = await client.getBlockNumber();
  console.log(`Current block number: ${currentBlockNumber}`);
  
  // If no new blocks, return cached data
  if (BigInt(highestBlockNumber) >= currentBlockNumber) {
    console.log('No new blocks since last update. Using cached data.');
    return cachedData;
  }
  
  // Fetch new transactions
  console.log(`Fetching new transactions from block ${highestBlockNumber + 1} to ${currentBlockNumber}`);
  
  const newTransactions = [];
  
  try {
    // Process each token we want to track
    for (const [tokenKey, tokenInfo] of Object.entries(TOKENS)) {
      if (tokenInfo.isNative) {
        // Skip native ETH for now
        continue;
      }
      
      console.log(`Querying for incoming ${tokenInfo.symbol} transfers to ${walletAddress} in new blocks...`);
      const incomingTransfers = await getLogsInChunks(client, {
        address: tokenInfo.address,
        abi: erc20Abi,
        event: transferEventAbiItem,
        args: {
          to: walletAddress
        },
        fromBlock: BigInt(highestBlockNumber) + 1n,
        toBlock: currentBlockNumber
      });
      
      console.log(`Found ${incomingTransfers.length} new incoming ${tokenInfo.symbol} transfers.`);
      
      // Get token price in USD
      const tokenPrice = await getTokenPriceInUSD(tokenInfo.symbol);
      
      // Process incoming transfers
      for (const transfer of incomingTransfers) {
        // Fetch block details to get timestamp
        const block = await client.getBlock({
          blockHash: transfer.blockHash
        });
        
        const timestamp = Number(block.timestamp);
        const date = new Date(timestamp * 1000);
        const formattedDate = format(date, 'yyyy-MM-dd');
        
        // Convert token amount to USD value
        const tokenAmount = Number(formatUnits(transfer.args.value, tokenInfo.decimals));
        const usdValue = tokenAmount * tokenPrice;
        
        newTransactions.push({
          date: formattedDate,
          value: usdValue,
          token: tokenInfo.symbol,
          tokenAmount,
          direction: 'in',
          blockNumber: Number(transfer.blockNumber),
          transactionHash: transfer.transactionHash
        });
      }
      
      console.log(`Querying for outgoing ${tokenInfo.symbol} transfers from ${walletAddress} in new blocks...`);
      const outgoingTransfers = await getLogsInChunks(client, {
        address: tokenInfo.address,
        abi: erc20Abi,
        event: transferEventAbiItem,
        args: {
          from: walletAddress
        },
        fromBlock: BigInt(highestBlockNumber) + 1n,
        toBlock: currentBlockNumber
      });
      
      console.log(`Found ${outgoingTransfers.length} new outgoing ${tokenInfo.symbol} transfers.`);
      
      // Process outgoing transfers
      for (const transfer of outgoingTransfers) {
        // Fetch block details to get timestamp
        const block = await client.getBlock({
          blockHash: transfer.blockHash
        });
        
        const timestamp = Number(block.timestamp);
        const date = new Date(timestamp * 1000);
        const formattedDate = format(date, 'yyyy-MM-dd');
        
        // Convert token amount to USD value
        const tokenAmount = Number(formatUnits(transfer.args.value, tokenInfo.decimals));
        const usdValue = tokenAmount * tokenPrice;
        
        newTransactions.push({
          date: formattedDate,
          value: usdValue,
          token: tokenInfo.symbol,
          tokenAmount,
          direction: 'out',
          blockNumber: Number(transfer.blockNumber),
          transactionHash: transfer.transactionHash
        });
      }
    }
    
    console.log(`Found ${newTransactions.length} new transactions.`);
    
    if (newTransactions.length === 0) {
      console.log('No new transactions found. Using cached data.');
      return cachedData;
    }
    
    // Combine cached and new transactions
    const allTransactions = [...cachedData, ...newTransactions];
    
    // Sort by block number
    allTransactions.sort((a, b) => a.blockNumber - b.blockNumber);
    
    // Update the cache
    await saveData(cacheKey, allTransactions, 86400); // Cache for 24 hours
    
    // Process and cache the aggregated data
    processAndCacheAggregatedData(allTransactions, walletAddress, year);
    
    return allTransactions;
  } catch (error) {
    console.error('Error updating cached transactions:', error);
    console.log('Using existing cached data due to error.');
    return cachedData;
  }
}

/**
 * Main function to run the caching job
 * @param {string} walletAddress - The wallet address to fetch transactions for
 * @param {string|number} year - The year to fetch transactions for
 * @returns {Promise<Object>} - The aggregated data
 */
async function runCachingJob(walletAddress = CYPHER_MASTER_WALLET, year = '2025') {
  console.log(`Running caching job for wallet ${walletAddress} for year ${year}`);
  
  try {
    // Check if we have cached transactions for this wallet and year
    const cacheKey = `transactions-${walletAddress}-${year}`;
    if (await dataExists(cacheKey)) {
      console.log(`Found existing transaction cache. Updating with new transactions...`);
      await updateExistingCache(walletAddress, year);
      const cachedData = await getData(cacheKey);
      return cachedData.data;
    }
    
    // Fetch all transactions and cache them
    console.log(`No transaction cache found. Fetching all transactions...`);
    const transactions = await fetchAndCacheTransactions(walletAddress, year);
    
    // Process and aggregate the transactions into volume data
    return processAndCacheAggregatedData(transactions, walletAddress, year);
    
    if (cacheExists(volumeCacheKey)) {
      // Return the existing volume data
      console.log(`Found existing volume data cache. Using cached data...`);
      return getFromCache(volumeCacheKey);
    } else {
      // Process and cache the volume data
      return await processAndCacheAggregatedData(transactions, walletAddress, year);
    }
  } catch (error) {
    console.error('Error running caching job:', error);
    throw error;
  }
}

// If this script is run directly (not imported)
if (import.meta.url === import.meta.main) {
  const walletAddress = process.argv[2] || CYPHER_MASTER_WALLET;
  const year = process.argv[3] || '2025';
  runCachingJob(walletAddress, year).catch(console.error);
}

// Export the main function as default
export default runCachingJob;
