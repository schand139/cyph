import { format, startOfDay, startOfWeek, startOfMonth, parseISO } from 'date-fns';
import { getData, dataExists, saveData } from '../utils/unifiedCacheManager.js';
import preloadCache from '../scripts/preloadCache.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { head, getDownloadUrl } from '@vercel/blob';

// Cypher master wallet address
const CYPHER_MASTER_WALLET = '0xcCCd218A58B53C67fC17D8C87Cb90d83614e35fD';

// Get the directory name in ESM context
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Check if we're running in Vercel environment
const isVercel = process.env.VERCEL === '1';

// Blob cache key for the Vercel Blob storage
// This should match the path you used when uploading to the Blob storage
const BLOB_CACHE_KEY = 'volume-0xcCCd218A58B53C67fC17D8C87Cb90d83614e35fD-2025';

// In-memory cache for API responses (short-lived)
const apiResponseCache = new Map();

/**
 * API handler for volume data
 * This endpoint returns volume data for the specified wallet, period, and year
 * It first checks the in-memory cache, then the persistent cache (file or KV)
 * If no cache is found, it returns mock data as a fallback
 */
export default async function handler(req, res) {
  try {
    console.log('Handling volume data request:', req.query);
    
    // Extract query parameters
    const { period = 'daily', wallet = CYPHER_MASTER_WALLET, year = '2025' } = req.query;
    
    // Validate period
    if (!['daily', 'weekly', 'monthly'].includes(period)) {
      return res.status(400).json({ error: 'Invalid period. Must be daily, weekly, or monthly.' });
    }
    
    // Create cache keys
    const apiCacheKey = `volume-${wallet}-${year}-${period}`;
    const volumeCacheKey = `volume-${wallet}-${year}`;
    
    // 1. Check persistent cache first (Blob storage for Vercel, KV or file for local)
    // Special case for Vercel production - use Blob storage directly if available
    if (isVercel) {
      try {
        console.log(`Running in Vercel environment, attempting to fetch from Blob storage: ${BLOB_CACHE_KEY}`);
        
        // DEMO: This is a hardcoded URL for the manually uploaded blob file
        // For the take-home assessment demo, we've manually uploaded the cache file to Blob storage
        // This specific URL was provided from a previous successful deployment
        const url = 'https://k9stbjpeo6edojyd.public.blob.vercel-storage.com/volume-0xcCCd218A58B53C67fC17D8C87Cb90d83614e35fD-2025-coFQM3As9ohm7gbUwE8tLiSxL6GsZT.json';
        console.log(`Using hardcoded Blob URL for demo: ${url}`);
        
        try {
          // Fetch the data from the hardcoded URL
          const response = await fetch(url);
          if (!response.ok) {
            throw new Error(`Failed to fetch blob data: ${response.status} ${response.statusText}`);
          }
          
          const blobData = await response.json();
          console.log(`Successfully retrieved data from Blob storage`);
          console.log('Blob data structure:', JSON.stringify(blobData).substring(0, 500) + '...');
          
          // The data structure should be simplified now that we've updated the preloadCache.js
          // But we'll still handle different possible structures for robustness
          let dataToProcess;
          
          // Check if the response has the expected structure with daily/weekly/monthly arrays
          if (blobData && Array.isArray(blobData.daily) && Array.isArray(blobData.weekly) && Array.isArray(blobData.monthly)) {
            // This is the ideal structure - direct access to the data
            dataToProcess = blobData;
            console.log('Using direct data structure from Blob');
          } else if (blobData && blobData.data && Array.isArray(blobData.data.daily)) {
            // One level of nesting
            dataToProcess = blobData.data;
            console.log('Using nested data structure');
          } else {
            // Unknown structure, log it and try to find daily/weekly/monthly arrays
            console.log('Unknown data structure, searching for volume data in any format');
            
            // Try to recursively find the data structure that contains daily/weekly/monthly arrays
            const findVolumeData = (obj, path = '') => {
              // If we found an object with daily, weekly, or monthly arrays, return it
              if (obj && typeof obj === 'object') {
                if (Array.isArray(obj.daily) || Array.isArray(obj.weekly) || Array.isArray(obj.monthly)) {
                  console.log(`Found volume data at path: ${path}`);
                  return obj;
                }
                
                // Recursively search through all properties
                for (const key in obj) {
                  const result = findVolumeData(obj[key], path ? `${path}.${key}` : key);
                  if (result) return result;
                }
              }
              return null;
            };
            
            // Try to find the data in the blob response
            const foundData = findVolumeData(blobData);
            
            if (foundData) {
              dataToProcess = foundData;
              console.log('Found volume data through recursive search');
            } else {
              console.log('Could not find volume data in any format, using empty structure');
              dataToProcess = {
                daily: [],
                weekly: [],
                monthly: []
              };
            }
          }
          
          // Process the data to fill in missing weeks
          const processedData = processVolumeData(dataToProcess, year);
          
          const result = {
            daily: processedData.daily || [],
            weekly: processedData.weekly || [],
            monthly: processedData.monthly || [],
            source: 'blob-storage',
            period
          };
          
          // Cache the API response in memory
          apiResponseCache.set(apiCacheKey, result);
          
          return res.status(200).json(result);
        } catch (urlError) {
          console.error(`Error with hardcoded Blob URL: ${urlError.message}`);
          // Continue to standard cache checking
        }
      } catch (error) {
        console.warn(`Error fetching from Blob storage: ${error.message}. Falling back to standard cache.`);
        // Continue to standard cache checking
      }
    }
    
    // Check standard persistent cache (KV)
    const cacheExists = await dataExists(volumeCacheKey);
    
    if (cacheExists) {
      console.log(`Using persistent cache for ${volumeCacheKey}`);
      const cachedData = await getData(volumeCacheKey);
      
      if (cachedData && cachedData.data) {
        // The cache structure has data nested inside a 'data' property
        console.log('Raw cached data structure:', JSON.stringify(cachedData).substring(0, 200) + '...');
        console.log(`Returning blockchain data with ${cachedData.data.monthly?.length || 0} monthly entries`);
        
        // Process the data to fill in missing weeks
        const processedData = processVolumeData(cachedData.data, year);
        
        const result = {
          daily: processedData.daily || [],
          weekly: processedData.weekly || [],
          monthly: processedData.monthly || [],
          source: 'blockchain',
          lastUpdated: cachedData.data.lastUpdated || new Date().toISOString()
        };
        
        // Store in in-memory cache and return
        apiResponseCache.set(apiCacheKey, result);
        return res.status(200).json(result);
      }
    }
    
    // 2. Check in-memory cache (for fast responses during the same server session)
    if (apiResponseCache.has(apiCacheKey)) {
      console.log(`Using in-memory cache for ${apiCacheKey}`);
      return res.status(200).json(apiResponseCache.get(apiCacheKey));
    }
    
    // If we reach this point, we don't have cached data in the unified cache manager
    // Check if we have an Alchemy-generated cache file (only in local environment)
    if (!isVercel) {
      const cachePath = path.join(__dirname, '..', 'cache', `volume-${wallet}-${year}.json`);
      
      if (fs.existsSync(cachePath)) {
        console.log(`Found Alchemy-generated cache file for ${wallet} (${year}), using it directly`);
        try {
          const fileData = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
          
          if (fileData && fileData.data) {
            console.log(`Returning blockchain data from Alchemy-generated cache file with ${fileData.data.monthly?.length || 0} monthly entries`);
            
            // Process the data to fill in missing weeks
            const processedData = processVolumeData(fileData.data, year);
            
            const result = {
              daily: processedData.daily || [],
              weekly: processedData.weekly || [],
              monthly: processedData.monthly || [],
              source: 'blockchain',
              lastUpdated: fileData.lastUpdated || new Date().toISOString(),
              blockInfo: fileData.data.blockInfo || null
            };
            
            // Store in unified cache for future use (especially important for Vercel deployment)
            // Note: lastUpdated is now at the root level, maintained by the caching system
            await saveData(volumeCacheKey, { data: fileData.data }, 86400); // 24 hour TTL
            
            // Store in in-memory cache and return
            apiResponseCache.set(apiCacheKey, result);
            return res.status(200).json(result);
          }
        } catch (error) {
          console.error(`Error reading Alchemy-generated cache file: ${error.message}`);
        }
      }
    }
    
    // If we still don't have data, try to generate it on-demand
    console.log('No volume cache found, attempting to generate it on-demand');
    
    try {
      // Try to preload the cache
      console.log('Triggering preloadCache to generate volume data...');
      const preloadResult = await preloadCache(false, wallet, year);
      
      if (preloadResult && preloadResult.success) {
        console.log('Successfully preloaded cache, fetching the new data');
        
        // Now try to get the newly created cache data
        if (await dataExists(volumeCacheKey)) {
          const freshData = await getData(volumeCacheKey);
          
          if (freshData) {
            console.log(`Using freshly generated cache for ${volumeCacheKey}`);
            
            // Process the data to fill in missing weeks
            const processedData = processVolumeData(freshData, year);
            
            const result = {
              daily: processedData.daily || [],
              weekly: processedData.weekly || [],
              monthly: processedData.monthly || [],
              source: 'blockchain-fresh',
              lastUpdated: freshData.lastUpdated || new Date().toISOString(),
              blockInfo: freshData.blockInfo || null
            };
            
            // Store in in-memory cache
            apiResponseCache.set(apiCacheKey, result);
            return res.status(200).json(result);
          }
        }
      } else {
        console.log('Failed to preload cache:', preloadResult?.error || 'Unknown error');
      }
    } catch (preloadError) {
      console.error('Error while trying to preload cache:', preloadError);
    }
    
    // If we still couldn't generate data, return an empty dataset with a warning
    console.log('Could not generate volume data, returning empty dataset');
    
    // Return empty dataset with a warning
    const emptyResult = {
      daily: [],
      weekly: [],
      monthly: [],
      source: 'empty',
      warning: 'No data available. The system attempted to generate data but failed.',
      lastUpdated: new Date().toISOString()
    };
    
    // Store in in-memory cache
    apiResponseCache.set(apiCacheKey, emptyResult);
    return res.status(200).json(emptyResult);
  } catch (error) {
    console.error('Error in getVolumeData handler:', error);
    return res.status(500).json({ error: 'Internal server error', message: error.message });
  }
}

/**
 * Process volume data to fill in missing weeks and months
 * @param {Object} data - The raw data from the cache
 * @param {string} year - The year to process data for
 * @returns {Object} Processed data with filled in weeks and months
 */
function processVolumeData(data, year) {
  console.log('Processing volume data with input:', JSON.stringify(data).substring(0, 300) + '...');
  
  const yearNum = parseInt(year);
  const startDate = new Date(yearNum, 0, 1); // January 1st
  const endDate = new Date(yearNum, 11, 31); // December 31st
  const currentDate = new Date();
  
  // If the end date is in the future, use current date
  const effectiveEndDate = endDate > currentDate ? currentDate : endDate;
  
  // Process daily data (keep as is)
  const dailyData = data.daily || [];
  console.log('Raw daily data:', JSON.stringify(dailyData).substring(0, 300) + '...');
  
  // Process weekly data (fill in missing weeks)
  const weeklyData = data.weekly || [];
  const processedWeeklyData = fillMissingWeeks(weeklyData, startDate, effectiveEndDate);
  
  // Process monthly data (fill in missing months)
  const monthlyData = data.monthly || [];
  const processedMonthlyData = fillMissingMonths(monthlyData, startDate, effectiveEndDate);
  
  return {
    daily: dailyData,
    weekly: processedWeeklyData,
    monthly: processedMonthlyData
  };
}

/**
 * Fill in missing weeks with zero volume
 * @param {Array} weeklyData - The weekly data array
 * @param {Date} startDate - The start date
 * @param {Date} endDate - The end date
 * @returns {Array} Weekly data with filled in weeks
 */
function fillMissingWeeks(weeklyData, startDate, endDate) {
  console.log('Filling missing weeks with raw weekly data:', JSON.stringify(weeklyData));
  
  // Create a map of existing weeks by date string
  const weekMap = new Map();
  
  // Add all existing weekly data to the map
  weeklyData.forEach(week => {
    if (week.date && week.volume !== null) {
      weekMap.set(week.date, week.volume);
    }
  });
  
  // Create an array of all weeks in the range
  const allWeeks = [];
  const currentDate = new Date(startDate);
  
  // Find the first Tuesday on or after the start date
  while (currentDate.getDay() !== 2) { // 2 = Tuesday
    currentDate.setDate(currentDate.getDate() + 1);
  }
  
  // Iterate through all weeks until end date
  while (currentDate <= endDate) {
    const dateStr = format(currentDate, 'yyyy-MM-dd');
    
    // Check if we have data for this week
    const volume = weekMap.has(dateStr) ? weekMap.get(dateStr) : null;
    
    // Add the week to the result array
    allWeeks.push({
      date: dateStr,
      volume
    });
    
    // Move to next week
    currentDate.setDate(currentDate.getDate() + 7);
  }
  
  // Sort by date
  allWeeks.sort((a, b) => new Date(a.date) - new Date(b.date));
  
  console.log('Processed weekly data:', JSON.stringify(allWeeks));
  return allWeeks;
}

/**
 * Fill in missing months with zero volume
 * @param {Array} monthlyData - The monthly data array
 * @param {Date} startDate - The start date
 * @param {Date} endDate - The end date
 * @returns {Array} Monthly data with filled in months
 */
function fillMissingMonths(monthlyData, startDate, endDate) {
  console.log('Filling missing months with raw monthly data:', JSON.stringify(monthlyData));
  
  // Create a map of existing months
  const monthMap = new Map();
  monthlyData.forEach(month => {
    monthMap.set(month.date, month.volume);
  });
  
  // Create an array of all months in the range
  const allMonths = [];
  const currentDate = new Date(startDate);
  
  // Set to the first day of the month
  currentDate.setDate(1);
  
  // Iterate through all months until end date
  while (currentDate <= endDate) {
    const dateStr = format(currentDate, 'yyyy-MM-dd');
    
    // Check if this month exists in the original data
    let volume = 0;
    let matched = false;
    
    // First, direct match
    if (monthMap.has(dateStr)) {
      volume = monthMap.get(dateStr);
      matched = true;
    }
    
    // If no direct match, look for entries with the same month and year
    if (!matched) {
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth();
      
      for (const [date, vol] of monthMap.entries()) {
        const entryDate = new Date(date);
        
        if (entryDate.getFullYear() === year && entryDate.getMonth() === month && vol > 0) {
          console.log(`Found month match: ${date} for ${dateStr}, volume: ${vol}`);
          volume = vol;
          matched = true;
          break;
        }
      }
    }
    
    // For May 2025 specifically, check our cache data which we know has May data
    const isMay2025 = currentDate.getFullYear() === 2025 && currentDate.getMonth() === 4; // May is month 4 (0-indexed)
    if (isMay2025 && volume === 0) {
      // We've seen in the cache file that May 2025 has volume of ~7.7M
      // This is a backup to ensure May data shows up
      console.log('Special handling for May 2025');
      for (const month of monthlyData) {
        const monthDate = new Date(month.date);
        if (monthDate.getFullYear() === 2025 && monthDate.getMonth() === 4 && month.volume > 0) {
          volume = month.volume;
          console.log(`Using May 2025 volume from cache: ${volume}`);
          break;
        }
      }
    }
    
    allMonths.push({
      date: dateStr,
      volume
    });
    
    // Move to next month
    currentDate.setMonth(currentDate.getMonth() + 1);
  }
  
  // Sort by date
  allMonths.sort((a, b) => new Date(a.date) - new Date(b.date));
  
  console.log('Processed monthly data:', JSON.stringify(allMonths));
  return allMonths;
}
