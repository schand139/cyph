import { Alchemy, Network } from 'alchemy-sdk';
import { format } from 'date-fns';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Environment variables
const API_KEY = process.env.ALCHEMY_API_KEY;
const CYPHER_MASTER_WALLET = process.env.CYPHER_MASTER_WALLET || '0xcCCd218A58B53C67fC17D8C87Cb90d83614e35fD';

// Helper function to get token price (mock implementation)
async function getTokenPrice(symbol) {
  // Simple mock implementation for token prices
  const prices = {
    'USDC': 1.0,
    'ETH': 3500.0,
    'WETH': 3500.0,
    'USDT': 1.0,
    'DAI': 1.0,
    'USDbC': 1.0,
    // Add more tokens as needed
  };
  
  return prices[symbol] || 1.0; // Default to 1.0 if token not found
}

// Helper function to save data to cache
async function saveData(key, data, ttlSeconds = 86400) {
  try {
    // Create cache directory if it doesn't exist
    const cacheDir = path.join(__dirname, '..', 'cache');
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }
    
    // Save to file - use the data directly without nesting
    const cachePath = path.join(cacheDir, `${key}.json`);
    fs.writeFileSync(cachePath, JSON.stringify(data, null, 2));
    console.log(`Cache saved for key: ${key}`);
    
    return true;
  } catch (error) {
    console.error(`Error saving data to cache: ${error.message}`);
    return false;
  }
}

// Helper function to get data from cache
async function getData(key) {
  try {
    const cachePath = path.join(__dirname, '..', 'cache', `${key}.json`);
    
    if (fs.existsSync(cachePath)) {
      const cacheData = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
      
      // With simplified schema, return the data directly
      return cacheData;
    }
    
    return null;
  } catch (error) {
    console.error(`Error getting data from cache: ${error.message}`);
    return null;
  }
}

/**
 * Main function to fetch transactions incrementally from the last processed block
 * 
 * @param {string} walletAddress - The wallet address to fetch transactions for
 * @param {string} year - The year to fetch transactions for
 * @param {number} providedLastProcessedBlock - Optional last processed block from caller
 * @returns {Object} The updated volume data with new transactions
 */
async function fetchIncrementalTransactions(walletAddress = CYPHER_MASTER_WALLET, year = '2025', providedLastProcessedBlock = null) {
  console.time('Incremental Fetch Time');
  console.log(`Fetching incremental transactions for ${walletAddress} for year ${year}...`);
  
  try {
    // Initialize Alchemy SDK
    const alchemy = new Alchemy({
      apiKey: API_KEY,
      network: Network.BASE_MAINNET,
      maxRetries: 5,
      timeout: 30000 // 30 second timeout
    });
    console.log('Using Alchemy SDK with optimized configuration');
    
    // Get current block number with a buffer to avoid querying blocks that are too recent
    const latestBlock = await alchemy.core.getBlockNumber();
    const currentBlock = latestBlock - 5; // Add a buffer of 5 blocks
    console.log(`Latest block number: ${latestBlock}`);
    console.log(`Using current block number with buffer: ${currentBlock}`);
    
    // Get the last processed block from parameter or cache
    const volumeCacheKey = `volume-${walletAddress}-${year}`;
    let lastProcessedBlock = providedLastProcessedBlock || 0;
    let existingVolumeData = null;
    
    // If no lastProcessedBlock was provided, try to get it from cache
    if (!lastProcessedBlock) {
      try {
        // Check if volume cache exists
        const volumeCache = await getData(volumeCacheKey);
        if (volumeCache && volumeCache.blockInfo && volumeCache.blockInfo.lastProcessedBlock) {
          lastProcessedBlock = volumeCache.blockInfo.lastProcessedBlock;
          existingVolumeData = volumeCache;
          console.log(`Found last processed block in volume cache: ${lastProcessedBlock}`);
        } else {
          console.log('No last processed block found in cache');
        }
      } catch (error) {
        console.error(`Error checking volume cache for last block: ${error.message}`);
      }
    } else {
      console.log(`Using provided last processed block: ${lastProcessedBlock}`);
      
      // Still need to get the existing volume data
      try {
        const volumeCache = await getData(volumeCacheKey);
        if (volumeCache) {
          existingVolumeData = volumeCache;
          console.log('Found existing volume data in cache');
        }
      } catch (error) {
        console.error(`Error getting existing volume data: ${error.message}`);
      }
    }
    
    // If no last processed block found, use a default value
    if (!lastProcessedBlock) {
      lastProcessedBlock = 24500000; // Default start block for 2025
      console.log(`Using default start block: ${lastProcessedBlock}`);
    }
    
    // Calculate the start block for incremental fetching
    const startBlock = lastProcessedBlock + 1;
    console.log(`Incremental update: Fetching blocks from ${startBlock} to ${currentBlock}`);
    
    // Skip if there are no new blocks to fetch
    if (startBlock >= currentBlock) {
      console.log('No new blocks to fetch, cache is up to date');
      console.timeEnd('Incremental Fetch Time');
      return existingVolumeData || { 
        daily: [], 
        weekly: [], 
        monthly: [],
        lastUpdated: new Date().toISOString(),
        blockInfo: {
          lastProcessedBlock,
          processingDate: new Date().toISOString()
        }
      };
    }
    
    // Fetch transactions for the incremental block range
    console.log(`Fetching transactions for block range: ${startBlock}-${currentBlock}`);
    
    // Fetch incoming transfers
    const incomingTransfers = await alchemy.core.getAssetTransfers({
      fromBlock: startBlock,
      toBlock: currentBlock,
      toAddress: walletAddress,
      category: ["external", "erc20", "erc721", "erc1155"],
      maxCount: 1000,
      excludeZeroValue: true
    });
    
    console.log(`Found ${incomingTransfers.transfers.length} incoming transfers in the incremental range`);
    
    // Process transfers into our standard format
    const newTransactions = [];
    
    // Process incoming transfers
    for (const transfer of incomingTransfers.transfers) {
      // Skip transfers without metadata or timestamp
      if (!transfer.metadata || !transfer.metadata.blockTimestamp) {
        continue;
      }
      
      // Get the date from the block timestamp
      const timestamp = new Date(transfer.metadata.blockTimestamp);
      const transferYear = timestamp.getFullYear().toString();
      
      // Skip transfers that are not from the requested year
      if (transferYear !== year) {
        continue;
      }
      
      // Get token symbol and price
      const symbol = transfer.asset || 'ETH';
      const price = await getTokenPrice(symbol);
      
      // Calculate USD value
      const valueUSD = transfer.value * price;
      
      // Create transaction object
      const transaction = {
        hash: transfer.hash,
        from: transfer.from,
        to: transfer.to,
        timestamp: timestamp.toISOString(),
        blockNum: transfer.blockNum,
        value: transfer.value,
        asset: symbol,
        valueUSD,
        category: transfer.category
      };
      
      newTransactions.push(transaction);
    }
    
    console.log(`Processed ${newTransactions.length} new transactions for year ${year}`);
    
    // Update the volume data with new transactions
    const updatedVolumeData = await updateVolumeCache(existingVolumeData, newTransactions, currentBlock);
    
    // Save the updated volume data to cache
    await saveData(volumeCacheKey, updatedVolumeData);
    
    console.log(`Updated volume cache for ${walletAddress} (${year}) with ${newTransactions.length} new transactions`);
    console.timeEnd('Incremental Fetch Time');
    
    return updatedVolumeData;
  } catch (error) {
    console.error(`Error fetching incremental transactions: ${error.message}`);
    console.timeEnd('Incremental Fetch Time');
    throw error;
  }
}

/**
 * Update the volume cache with new transactions
 */
async function updateVolumeCache(existingData, newTransactions, currentBlock) {
  // If no existing data, create a new structure
  if (!existingData) {
    existingData = {
      daily: [],
      weekly: [],
      monthly: [],
      lastUpdated: new Date().toISOString(),
      blockInfo: {
        lastProcessedBlock: currentBlock,
        processingDate: new Date().toISOString()
      }
    };
  }
  
  // Process new transactions into daily volume data
  const dailyVolumeMap = new Map();
  
  // First, load existing daily data into the map
  if (existingData.daily && Array.isArray(existingData.daily)) {
    for (const day of existingData.daily) {
      dailyVolumeMap.set(day.date, day.volume);
    }
  }
  
  // Add new transactions to the daily volume map
  for (const tx of newTransactions) {
    const date = tx.timestamp.split('T')[0]; // Format as YYYY-MM-DD
    const volume = tx.valueUSD || 0;
    
    if (!dailyVolumeMap.has(date)) {
      dailyVolumeMap.set(date, 0);
    }
    dailyVolumeMap.set(date, dailyVolumeMap.get(date) + volume);
  }
  
  // Convert the map to an array of objects
  const dailyData = Array.from(dailyVolumeMap.entries()).map(([date, volume]) => ({
    date,
    volume
  }));
  
  // Sort by date
  dailyData.sort((a, b) => new Date(a.date) - new Date(b.date));
  
  // Calculate weekly data
  const weeklyData = calculateWeeklyData(dailyData);
  
  // Calculate monthly data
  const monthlyData = calculateMonthlyData(dailyData);
  
  // Update the volume data
  const updatedVolumeData = {
    daily: dailyData,
    weekly: weeklyData,
    monthly: monthlyData,
    lastUpdated: new Date().toISOString(),
    blockInfo: {
      lastProcessedBlock: currentBlock,
      processingDate: new Date().toISOString()
    }
  };
  
  return updatedVolumeData;
}

/**
 * Calculate weekly volume data from daily data
 */
function calculateWeeklyData(dailyData) {
  const weekMap = new Map();
  
  for (const day of dailyData) {
    const date = new Date(day.date);
    const dayOfWeek = date.getDay();
    const weekStart = new Date(date);
    weekStart.setDate(date.getDate() - dayOfWeek); // Set to Sunday
    const weekStartStr = weekStart.toISOString().split('T')[0]; // Format as YYYY-MM-DD
    
    if (!weekMap.has(weekStartStr)) {
      weekMap.set(weekStartStr, 0);
    }
    weekMap.set(weekStartStr, weekMap.get(weekStartStr) + day.volume);
  }
  
  // Convert to array format
  const weeklyData = Array.from(weekMap.entries()).map(([date, volume]) => ({
    date,
    volume
  }));
  
  // Sort by date
  weeklyData.sort((a, b) => new Date(a.date) - new Date(b.date));
  
  return weeklyData;
}

/**
 * Calculate monthly volume data from daily data
 */
function calculateMonthlyData(dailyData) {
  const monthMap = new Map();
  
  for (const day of dailyData) {
    const date = new Date(day.date);
    const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
    const monthStartStr = monthStart.toISOString().split('T')[0]; // Format as YYYY-MM-DD
    
    if (!monthMap.has(monthStartStr)) {
      monthMap.set(monthStartStr, 0);
    }
    monthMap.set(monthStartStr, monthMap.get(monthStartStr) + day.volume);
  }
  
  // Convert to array format
  const monthlyData = Array.from(monthMap.entries()).map(([date, volume]) => ({
    date,
    volume
  }));
  
  // Sort by date
  monthlyData.sort((a, b) => new Date(a.date) - new Date(b.date));
  
  return monthlyData;
}

/**
 * Default export function to fetch transactions incrementally
 * 
 * @param {string} walletAddress - The wallet address to fetch transactions for
 * @param {string} year - The year to fetch transactions for
 * @param {number} lastProcessedBlock - Optional last processed block from caller
 * @returns {Object} The updated volume data with new transactions
 */
export default async function(walletAddress = CYPHER_MASTER_WALLET, year = '2025', lastProcessedBlock = null) {
  try {
    console.log(`Incremental fetch called with wallet: ${walletAddress}, year: ${year}, lastProcessedBlock: ${lastProcessedBlock}`);
    
    // Load the Alchemy API key
    if (!API_KEY) {
      throw new Error('ALCHEMY_API_KEY is not defined in the environment variables');
    }
    console.log('Alchemy API Key loaded successfully');
    
    // Fetch incremental transactions
    const result = await fetchIncrementalTransactions(walletAddress, year, lastProcessedBlock);
    
    console.log('Incremental update completed successfully');
    return result;
  } catch (error) {
    console.error('Error in incremental update:', error);
    throw error;
  }
}

// Run the main function if this script is executed directly
if (import.meta.url === import.meta.url.match(/[^/]*$/)[0]) {
  const main = async () => {
    const walletAddress = process.env.CYPHER_MASTER_WALLET || '0xcCCd218A58B53C67fC17D8C87Cb90d83614e35fD';
    const year = '2025';
    await fetchIncrementalTransactions(walletAddress, year);
  };
  
  main().catch(console.error);
}
