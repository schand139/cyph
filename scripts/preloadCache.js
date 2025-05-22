// Script to preload transaction cache for known wallets
import { getData, dataExists, saveData } from '../utils/unifiedCacheManager.js';
import { put } from '@vercel/blob';
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
const CYPHER_MASTER_WALLET = process.env.CYPHER_MASTER_WALLET || '0xcCCd218A58B53C67fC17D8C87Cb90d83614e35fD';

/**
 * Preload cache for specified wallets and years
 * This can be run during application startup or by a scheduled job
 * to ensure the cache is ready before any API calls are made
 * 
 * @param {boolean} forceRefresh - Whether to force a complete refresh of the cache
 * @param {string} walletAddress - Wallet address to preload cache for
 * @param {string} year - Year to preload cache for
 * @returns {Object} Result object with success status, message, and blobUrl if uploaded
 */
export default async function preloadCache(forceRefresh = false, walletAddress, year) {
  console.log(`Starting cache preload (environment: ${environment})...`);
  
  // Use the provided wallet address and year or fallback to defaults
  walletAddress = walletAddress || CYPHER_MASTER_WALLET;
  year = year || '2025';
  const volumeCacheKey = `volume-${walletAddress}-${year}`;
  
  try {
    // First check if we have data in the unified cache manager
    let cachedData = null;
    let lastProcessedBlock = null;
    
    if (await dataExists(volumeCacheKey)) {
      cachedData = await getData(volumeCacheKey);
      console.log(`Cache hit for key: ${volumeCacheKey}, last updated: ${new Date(cachedData?.lastUpdated || 0).toISOString()}`);
      
      // Check if the cache is recent (less than 1 minute old)
      const lastUpdated = new Date(cachedData?.lastUpdated || 0);
      const now = new Date();
      const cacheAge = now - lastUpdated;
      
      if (cacheAge < 900000 && !forceRefresh) { // 15 minutes = 900000 ms
        console.log(`Cache is recent (${Math.round(cacheAge / 60000)}m old), skipping refresh`);
        
        // Return the existing cache info
        return {
          success: true,
          message: 'Using recent cache, skipped refresh',
          blobUrl: isVercel ? `https://blob.vercel-storage.com/${volumeCacheKey}` : null,
          cacheInfo: {
            lastUpdated: cachedData.lastUpdated,
            lastProcessedBlock: cachedData.blockInfo?.lastProcessedBlock,
            processingDate: cachedData.blockInfo?.processingDate,
            dailyEntries: cachedData.daily?.length || 0,
            weeklyEntries: cachedData.weekly?.length || 0,
            monthlyEntries: cachedData.monthly?.length || 0
          }
        };
      }
      
      // Extract lastProcessedBlock from cache if available
      if (cachedData.blockInfo && cachedData.blockInfo.lastProcessedBlock) {
        lastProcessedBlock = cachedData.blockInfo.lastProcessedBlock;
        console.log(`Found lastProcessedBlock in cache: ${lastProcessedBlock}`);
      }
    } else {
      console.log(`No cache found for key: ${volumeCacheKey}, will create new cache`);
    }
    
    // If we're in local environment or need to refresh, run the caching job
    try {
      console.log('Running caching job to fetch blockchain data...');
      
      // Track the result of our fetch operation
      let fetchResult = null;
      
      if (lastProcessedBlock && !forceRefresh) {
        // If we have a lastProcessedBlock and don't need to force refresh, use incrementalFetch
        console.log(`Using incremental fetch from block ${lastProcessedBlock}`);
        
        try {
          // Import the incrementalFetch module for incremental updates
          console.log('Running incrementalFetch.js for incremental data processing...');
          const incrementalModule = await import('./incrementalFetch.js');
          
          if (incrementalModule && typeof incrementalModule.default === 'function') {
            fetchResult = await incrementalModule.default(walletAddress, year, lastProcessedBlock);
            console.log('Incremental fetch completed successfully');
          } else {
            console.error('ERROR: Could not find the default export in incrementalFetch.js');
            throw new Error('Could not find the default export in incrementalFetch.js');
          }
        } catch (error) {
          console.error(`Error importing or running incrementalFetch.js: ${error.message}`);
          throw error;
        }
      } else {
        // If we don't have a lastProcessedBlock or need to force refresh, use initialCacheFetch
        console.log(`${forceRefresh ? 'Force refresh requested' : 'No lastProcessedBlock found'}, using initial cache fetch`);
        
        try {
          // Import the initialCacheFetch module for full data load
          console.log('Running initialCacheFetch.js for full data processing...');
          const initialModule = await import('./initialCacheFetch.js');
          
          if (initialModule && typeof initialModule.default === 'function') {
            fetchResult = await initialModule.default(forceRefresh, walletAddress, year);
            console.log('Initial cache fetch completed successfully');
          } else {
            console.error('ERROR: Could not find the default export in initialCacheFetch.js');
            throw new Error('Could not find the default export in initialCacheFetch.js');
          }
        } catch (error) {
          console.error(`Error importing or running initialCacheFetch.js: ${error.message}`);
          throw error;
        }
      }
      
      // Check if the cache file was created
      const cacheFile = path.join(__dirname, '..', 'cache', `volume-${walletAddress}-${year}.json`);
      let blobUrl = null;
      let cacheInfo = null;
      
      if (fs.existsSync(cacheFile)) {
        console.log(`Cache file created: ${cacheFile}`);
        
        // Read the cache file to get information about it
        try {
          const cacheData = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
          cacheInfo = {
            lastUpdated: cacheData.lastUpdated,
            lastProcessedBlock: cacheData.blockInfo?.lastProcessedBlock,
            processingDate: cacheData.blockInfo?.processingDate,
            dailyEntries: cacheData.daily?.length || 0,
            weeklyEntries: cacheData.weekly?.length || 0,
            monthlyEntries: cacheData.monthly?.length || 0
          };
        } catch (readError) {
          console.error(`Error reading cache file: ${readError.message}`);
        }
        
        // If we're in Vercel environment, upload to Blob storage
        if (isVercel && process.env.BLOB_READ_WRITE_TOKEN) {
          try {
            // Check if there's already a recent version in Blob storage
            // This is an additional check specifically for Blob storage
            try {
              const blobUrl = `https://blob.vercel-storage.com/${volumeCacheKey}`;
              const response = await fetch(blobUrl, { method: 'HEAD' });
              
              if (response.ok) {
                // Get the last-modified header
                const lastModified = response.headers.get('last-modified');
                if (lastModified) {
                  const blobLastModified = new Date(lastModified);
                  const now = new Date();
                  const blobAge = now - blobLastModified;
                  
                  if (blobAge < 900000 && !forceRefresh) { // Less than 15 minutes old
                    console.log(`Blob storage cache is recent (${Math.round(blobAge / 1000)}s old), skipping upload`);
                    return {
                      success: true,
                      message: 'Using recent Blob storage cache, skipped upload',
                      blobUrl,
                      cacheInfo: {
                        lastUpdated: blobLastModified.toISOString(),
                        source: 'blob-storage'
                      }
                    };
                  }
                }
              }
            } catch (blobCheckError) {
              console.log('Error checking Blob storage freshness:', blobCheckError.message);
              // Continue with upload if check fails
            }
            
            console.log('Uploading cache to Vercel Blob storage...');
            const fileData = fs.readFileSync(cacheFile, 'utf8');
            
            // Check if this is a pre-existing cache file from the repository
            const cacheData = JSON.parse(fileData);
            const isPreExistingCache = !cacheData.blobOrigin;
            
            if (isPreExistingCache) {
              console.log('Found pre-existing cache file from repository, marking as repository origin');
              // Add a marker to indicate this was originally from the repository
              cacheData.blobOrigin = 'repository';
              cacheData.firstVercelUpload = new Date().toISOString();
            }
            
            // Always update the lastUpdated timestamp when uploading to Blob
            cacheData.lastUpdated = new Date().toISOString();
            
            // Upload to Vercel Blob storage (with origin marker if applicable)
            const dataToUpload = JSON.stringify(cacheData, null, 2);
            const { url } = await put(volumeCacheKey, dataToUpload, {
              contentType: 'application/json',
              access: 'public' // Make it public for easy access
            });
            
            console.log(`Uploaded volume data to Blob storage: ${url}`);
            console.log(`Cache origin: ${isPreExistingCache ? 'repository' : 'runtime generated'}`);
            blobUrl = url;
          } catch (blobError) {
            console.error(`Error uploading to Blob storage: ${blobError.message}`);
          }
        }
        
        // Return success with cache info and blob URL if available
        return {
          success: true,
          message: 'Cache preloaded successfully',
          blobUrl,
          cacheInfo
        };
      } else {
        console.log(`Cache file not created: ${cacheFile}`);
        return {
          success: false,
          error: 'Cache file was not created',
          cacheInfo: null
        };
      }
    } catch (fetchError) {
      console.error(`Error using blockchain data fetch scripts: ${fetchError.message}`);
      console.log('Falling back to cacheTransactions.js...');
      
      try {
        // Fall back to the original caching method
        const { runCachingJob } = await import('./cacheTransactions.js');
        await runCachingJob(walletAddress, year);
        
        // Check if the fallback created a cache file
        const cacheFile = path.join(__dirname, '..', 'cache', `volume-${walletAddress}-${year}.json`);
        if (fs.existsSync(cacheFile)) {
          return {
            success: true,
            message: 'Cache preloaded using fallback method',
            cacheInfo: {
              source: 'fallback'
            }
          };
        } else {
          return {
            success: false,
            error: 'Fallback caching method failed to create cache file'
          };
        }
      } catch (fallbackError) {
        console.error(`Error using fallback caching method: ${fallbackError.message}`);
        return {
          success: false,
          error: `Both primary and fallback caching methods failed: ${fetchError.message}, ${fallbackError.message}`
        };
      }
    }
  } catch (error) {
    console.error(`Error running caching job: ${error.message}`);
    console.error('Cache preload failed, API will use existing data or return empty dataset');
    return {
      success: false,
      error: `Error running caching job: ${error.message}`
    };
  } finally {
    console.log(`Cache preload completed for ${walletAddress} (${year})`);
  }
}
