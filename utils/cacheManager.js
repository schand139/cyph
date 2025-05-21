import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Get the directory name in ESM context
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Determine if running in Vercel environment
const isVercel = process.env.VERCEL === '1';

// Cache directory - use /tmp for Vercel, local directory for development
const CACHE_DIR = isVercel ? '/tmp/cache' : path.join(__dirname, '..', 'cache');

// Ensure cache directory exists
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

/**
 * Save data to cache
 * @param {string} key - Cache key
 * @param {any} data - Data to cache
 * @param {number} [ttl=3600] - Time to live in seconds (default: 1 hour)
 */
export function saveToCache(key, data, ttl = 3600) {
  const cacheFile = path.join(CACHE_DIR, `${key}.json`);
  const cacheData = {
    data,
    expires: Date.now() + (ttl * 1000),
    lastUpdated: Date.now()
  };
  
  fs.writeFileSync(cacheFile, JSON.stringify(cacheData, null, 2));
  console.log(`Cache saved for key: ${key}`);
}

/**
 * Get data from cache
 * @param {string} key - Cache key
 * @param {boolean} [ignoreExpiry=false] - Whether to ignore expiry check
 * @returns {any|null} Cached data or null if not found or expired
 */
export function getFromCache(key, ignoreExpiry = false) {
  const cacheFile = path.join(CACHE_DIR, `${key}.json`);
  
  if (!fs.existsSync(cacheFile)) {
    console.log(`No cache found for key: ${key}`);
    return null;
  }
  
  try {
    const cacheData = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    
    // Check if cache has expired
    if (!ignoreExpiry && cacheData.expires < Date.now()) {
      console.log(`Cache expired for key: ${key}`);
      return null;
    }
    
    console.log(`Cache hit for key: ${key}, last updated: ${new Date(cacheData.lastUpdated).toISOString()}`);
    return cacheData.data;
  } catch (error) {
    console.error(`Error reading cache for key: ${key}`, error);
    return null;
  }
}

/**
 * Check if cache exists and is not expired
 * @param {string} key - Cache key
 * @returns {boolean} Whether valid cache exists
 */
export function cacheExists(key) {
  const cacheFile = path.join(CACHE_DIR, `${key}.json`);
  
  if (!fs.existsSync(cacheFile)) {
    return false;
  }
  
  try {
    const cacheData = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    return cacheData.expires > Date.now();
  } catch (error) {
    return false;
  }
}

/**
 * Get cache metadata
 * @param {string} key - Cache key
 * @returns {object|null} Cache metadata or null if not found
 */
export function getCacheMetadata(key) {
  const cacheFile = path.join(CACHE_DIR, `${key}.json`);
  
  if (!fs.existsSync(cacheFile)) {
    return null;
  }
  
  try {
    const cacheData = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    return {
      lastUpdated: new Date(cacheData.lastUpdated),
      expires: new Date(cacheData.expires),
      isExpired: cacheData.expires < Date.now()
    };
  } catch (error) {
    return null;
  }
}

/**
 * Update existing cache with new data
 * @param {string} key - Cache key
 * @param {function} updateFn - Function that takes existing data and returns updated data
 * @param {number} [ttl=3600] - New TTL in seconds
 * @returns {boolean} Whether update was successful
 */
export function updateCache(key, updateFn, ttl = 3600) {
  const cacheFile = path.join(CACHE_DIR, `${key}.json`);
  
  if (!fs.existsSync(cacheFile)) {
    console.log(`No cache found for key: ${key}`);
    return false;
  }
  
  try {
    const cacheData = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    const updatedData = updateFn(cacheData.data);
    
    const newCacheData = {
      data: updatedData,
      expires: Date.now() + (ttl * 1000),
      lastUpdated: Date.now()
    };
    
    fs.writeFileSync(cacheFile, JSON.stringify(newCacheData, null, 2));
    console.log(`Cache updated for key: ${key}`);
    return true;
  } catch (error) {
    console.error(`Error updating cache for key: ${key}`, error);
    return false;
  }
}

/**
 * Delete a key from cache
 * @param {string} key - Cache key
 */
export function deleteFromCache(key) {
  const cacheFile = path.join(CACHE_DIR, `${key}.json`);
  
  if (fs.existsSync(cacheFile)) {
    fs.unlinkSync(cacheFile);
    console.log(`Cache deleted for key: ${key}`);
  } else {
    console.log(`No cache found to delete for key: ${key}`);
  }
}
