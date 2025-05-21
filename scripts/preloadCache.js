// Script to preload transaction cache for known wallets
import { getData, dataExists, saveData } from '../utils/unifiedCacheManager.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Get the directory name in ESM context
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Check if we're running in Vercel environment
const isVercel = process.env.VERCEL === '1';
const environment = isVercel ? 'vercel' : 'local';

// Cypher master wallet address
const CYPHER_MASTER_WALLET = '0xcCCd218A58B53C67fC17D8C87Cb90d83614e35fD';

/**
 * Preload cache for specified wallets and years
 * This can be run during application startup or by a scheduled job
 * to ensure the cache is ready before any API calls are made
 */
export default async function preloadCache(forceUpdateTest = false) {
  console.log(`Starting cache preload (environment: ${environment})...`);
  
  // Define the wallet and year we're working with
  const walletAddress = process.env.CYPHER_MASTER_WALLET || '0xcCCd218A58B53C67fC17D8C87Cb90d83614e35fD';
  const year = '2025';
  const volumeCacheKey = `volume-${walletAddress}-${year}`;
  
  // No forced update in production
  
  try {
    // First check if we have data in the unified cache manager
    if (await dataExists(volumeCacheKey)) {
      const cachedData = await getData(volumeCacheKey);
      console.log(`Cache hit for key: ${volumeCacheKey}, last updated: ${new Date(cachedData?.lastUpdated || 0).toISOString()}`);
      
      // Check if the cache is recent (less than 24 hours old)
      const lastUpdated = new Date(cachedData?.lastUpdated || 0);
      const now = new Date();
      const cacheAge = now - lastUpdated;
      
      if (cacheAge < 24 * 60 * 60 * 1000) {
        console.log(`Cache for ${walletAddress} (${year}) is recent, skipping update`);
        console.log('Cache preload completed');
        return;
      } else {
        console.log(`Cache in unified manager is stale (${Math.floor(cacheAge / (60 * 60 * 1000))} hours old), will check for fresh data`);
      }
    }
  } catch (error) {
    console.error(`Error checking cache: ${error.message}`);
    // Continue execution to attempt to refresh the cache
  }
  
  // In local environment, we can check for Alchemy-generated cache files
  if (!isVercel) {
    const cacheDir = path.join(__dirname, '..', 'cache');
    const cacheFilePath = path.join(cacheDir, `${volumeCacheKey}.json`);
    
    // Create cache directory if it doesn't exist
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }
    
    // Check if we have an Alchemy-generated cache file
    if (fs.existsSync(cacheFilePath)) {
      try {
        const fileData = JSON.parse(fs.readFileSync(cacheFilePath, 'utf8'));
        const lastUpdated = new Date(fileData?.data?.lastUpdated || 0);
        const now = new Date();
        const cacheAge = now - lastUpdated;
        
        // Check if the cache is recent (less than 24 hours old)
        if (cacheAge < 24 * 60 * 60 * 1000) {
          console.log(`Cache file for ${walletAddress} (${year}) is recent, using it`);
          
          // Store the file data in the unified cache manager
          await saveData(volumeCacheKey, fileData, 86400); // 24 hour TTL
          console.log(`Stored file data in unified cache for key: ${volumeCacheKey}`);
          
          console.log('Cache preload completed');
          return;
        } else {
          console.log(`Cache file for ${walletAddress} (${year}) is stale (${Math.floor(cacheAge / (60 * 60 * 1000))} hours old), will update`);
        }
      } catch (error) {
        console.error(`Error reading cache file: ${error.message}`);
      }
    } else {
      console.log(`No cache file found for ${walletAddress} (${year})`);
    }
  }

  // If we reach this point and we're in Vercel, we need to handle it differently
  // The full blockchain data fetch would time out the serverless function
  if (isVercel) {
    try {
      // For Vercel, we'll use a different approach - either use existing data or
      // create a minimal dataset with the current month included
      console.log('Running in Vercel environment, creating minimal dataset');
      
      // Create a basic dataset with the current month included
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth();
      
      // Only proceed if we're dealing with the current year
      if (parseInt(year) === currentYear) {
        // Create a minimal dataset with months up to the current month
        const minimalData = {
          daily: [],
          weekly: [],
          monthly: []
        };
        
        // Add months from January to current month
        for (let month = 0; month <= currentMonth; month++) {
          const monthDate = new Date(currentYear, month, 1);
          const monthStr = monthDate.toISOString().split('T')[0]; // Format as YYYY-MM-DD
          
          minimalData.monthly.push({
            date: monthStr,
            volume: 0 // Default to zero volume
          });
        }
        
        // Save this minimal dataset to the cache
        await saveData(volumeCacheKey, { 
          data: minimalData, 
          lastUpdated: new Date().toISOString() 
        }, 86400); // 24 hour TTL
        
        console.log(`Created minimal dataset for ${year} with ${minimalData.monthly.length} months`);
      }
      
      console.log('Cache preload completed for Vercel environment');
      return;
    } catch (error) {
      console.error(`Error in Vercel environment handling: ${error.message}`);
      return;
    }
  }
  
  // If we're in local environment and reach this point, we need to run the caching job
  try {
    console.log('Running caching job to fetch blockchain data...');
    
    // Use alchemyTest.js script for better data processing
    try {
      console.log('Running alchemyTest.js for data processing...');
      
      // We need to properly import the fetchTransactionsWithAlchemy function
      const alchemyModule = await import('./alchemyTest.js');
      
      // Check if the module was imported correctly
      if (alchemyModule && typeof alchemyModule.fetchTransactionsWithAlchemy === 'function') {
        // If it's a named export (which is what we expect after our fix)
        await alchemyModule.fetchTransactionsWithAlchemy(walletAddress, year, true);
      } else if (alchemyModule && typeof alchemyModule.default === 'function') {
        // If it's the default export
        await alchemyModule.default(walletAddress, year, true);
      } else {
        // Try to call the function directly (it might be attached to the module)
        let foundFunction = false;
        
        for (const key of Object.keys(alchemyModule)) {
          if (typeof alchemyModule[key] === 'function' && key.includes('fetch')) {
            await alchemyModule[key](walletAddress, year, true);
            foundFunction = true;
            break;
          }
        }
        
        if (!foundFunction) {
          console.error('ERROR: Could not find a suitable function to call in alchemyTest.js');
        }
      }
      
      // Check if the cache file was created
      const cacheDir = path.join(__dirname, '..', 'cache');
      const cacheFilePath = path.join(cacheDir, `${volumeCacheKey}.json`);
      
      if (fs.existsSync(cacheFilePath)) {
        console.log(`Successfully created cache file: ${cacheFilePath}`);
        
        // Read the file and store it in the unified cache manager
        const fileData = JSON.parse(fs.readFileSync(cacheFilePath, 'utf8'));
        await saveData(volumeCacheKey, fileData, 86400); // 24 hour TTL
        console.log(`Stored file data in unified cache for key: ${volumeCacheKey}`);
      } else {
        throw new Error('Cache file was not created by alchemyTest.js');
      }
    } catch (alchemyError) {
      console.error(`Error using alchemyTest.js: ${alchemyError.message}`);
      console.log('Falling back to cacheTransactions.js...');
      
      // Fall back to the original caching method
      const { runCachingJob } = await import('./cacheTransactions.js');
      await runCachingJob(walletAddress, year);
    }
    
    console.log(`Caching job completed for ${walletAddress} (${year})`);
  } catch (error) {
    console.error(`Error running caching job: ${error.message}`);
    console.error('Cache preload failed, API will use existing data or return empty dataset');
  }
  
  console.log('Cache preload completed');
}

// If this script is run directly (not imported)
if (import.meta.url === import.meta.main) {
  preloadCache().catch(console.error);
}
