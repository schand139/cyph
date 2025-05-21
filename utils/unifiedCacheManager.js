// Unified cache manager that works with both file system and Vercel KV
import { 
  saveToCache, 
  getFromCache, 
  cacheExists, 
  updateCache, 
  deleteFromCache 
} from './cacheManager.js';

import { 
  saveToKVCache, 
  getFromKVCache, 
  kvCacheExists, 
  updateKVCache, 
  deleteFromKVCache 
} from './kvCacheManager.js';

// Determine if we're running in Vercel KV environment
const useKV = process.env.VERCEL_KV_URL !== undefined;

console.log(`Using ${useKV ? 'Vercel KV' : 'file-based'} cache storage`);

/**
 * Save data to cache (file or KV)
 * @param {string} key - Cache key
 * @param {any} data - Data to cache
 * @param {number} [ttl=3600] - Time to live in seconds (default: 1 hour)
 */
export async function saveData(key, data, ttl = 3600) {
  if (useKV) {
    return await saveToKVCache(key, data, ttl);
  } else {
    return saveToCache(key, data, ttl);
  }
}

/**
 * Get data from cache (file or KV)
 * @param {string} key - Cache key
 * @param {boolean} [ignoreExpiry=false] - Whether to ignore expiry check
 * @returns {any|null} Cached data or null if not found or expired
 */
export async function getData(key, ignoreExpiry = false) {
  if (useKV) {
    return await getFromKVCache(key, ignoreExpiry);
  } else {
    return getFromCache(key, ignoreExpiry);
  }
}

/**
 * Check if a key exists in cache (file or KV)
 * @param {string} key - Cache key
 * @returns {Promise<boolean>} True if the key exists and is not expired
 */
export async function dataExists(key) {
  if (useKV) {
    return await kvCacheExists(key);
  } else {
    return cacheExists(key);
  }
}

/**
 * Update existing cache with new data (file or KV)
 * @param {string} key - Cache key
 * @param {function} updateFn - Function that takes the old data and returns new data
 * @param {number} [ttl=3600] - Time to live in seconds (default: 1 hour)
 * @returns {Promise<boolean>} True if the cache was updated, false if it doesn't exist
 */
export async function updateData(key, updateFn, ttl = 3600) {
  if (useKV) {
    return await updateKVCache(key, updateFn, ttl);
  } else {
    return updateCache(key, updateFn, ttl);
  }
}

/**
 * Delete a key from cache (file or KV)
 * @param {string} key - Cache key
 */
export async function deleteData(key) {
  if (useKV) {
    return await deleteFromKVCache(key);
  } else {
    return deleteFromCache(key);
  }
}
