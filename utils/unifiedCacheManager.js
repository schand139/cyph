// Unified cache manager that works with both file system and Vercel Blob storage
import { 
  saveToCache, 
  getFromCache, 
  cacheExists, 
  updateCache, 
  deleteFromCache 
} from './cacheManager.js';

import { 
  saveToBlobCache, 
  getFromBlobCache, 
  blobCacheExists, 
  updateBlobCache, 
  deleteFromBlobCache 
} from './blobCacheManager.js';

// Determine if we're running in Vercel environment
const isVercel = process.env.VERCEL === '1';
// Use Blob storage in Vercel environment
const useBlob = isVercel;

console.log(`Using ${useBlob ? 'Vercel Blob' : 'file-based'} cache storage`);

/**
 * Save data to cache (file or Blob)
 * @param {string} key - Cache key
 * @param {any} data - Data to cache
 * @param {number} [ttl=3600] - Time to live in seconds (default: 1 hour)
 */
export async function saveData(key, data, ttl = 3600) {
  if (useBlob) {
    return await saveToBlobCache(key, data, ttl);
  } else {
    return saveToCache(key, data, ttl);
  }
}

/**
 * Get data from cache (file or Blob)
 * @param {string} key - Cache key
 * @param {boolean} [ignoreExpiry=false] - Whether to ignore expiry check
 * @returns {any|null} Cached data or null if not found or expired
 */
export async function getData(key, ignoreExpiry = false) {
  if (useBlob) {
    return await getFromBlobCache(key, ignoreExpiry);
  } else {
    return getFromCache(key, ignoreExpiry);
  }
}

/**
 * Check if a key exists in cache (file or Blob)
 * @param {string} key - Cache key
 * @returns {Promise<boolean>} True if the key exists and is not expired
 */
export async function dataExists(key) {
  if (useBlob) {
    return await blobCacheExists(key);
  } else {
    return cacheExists(key);
  }
}

/**
 * Update existing cache with new data (file or Blob)
 * @param {string} key - Cache key
 * @param {function} updateFn - Function that takes the old data and returns new data
 * @param {number} [ttl=3600] - Time to live in seconds (default: 1 hour)
 * @returns {Promise<boolean>} True if the cache was updated, false if it doesn't exist
 */
export async function updateData(key, updateFn, ttl = 3600) {
  if (useBlob) {
    return await updateBlobCache(key, updateFn, ttl);
  } else {
    return updateCache(key, updateFn, ttl);
  }
}

/**
 * Delete a key from cache (file or Blob)
 * @param {string} key - Cache key
 */
export async function deleteData(key) {
  if (useBlob) {
    return await deleteFromBlobCache(key);
  } else {
    return deleteFromCache(key);
  }
}
