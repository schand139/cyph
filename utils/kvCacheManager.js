// KV-based cache manager for Vercel deployment
import { kv } from '@vercel/kv';

/**
 * Save data to KV cache
 * @param {string} key - Cache key
 * @param {any} data - Data to cache
 * @param {number} [ttl=3600] - Time to live in seconds (default: 1 hour)
 */
export async function saveToKVCache(key, data, ttl = 3600) {
  const cacheData = {
    data,
    expires: Date.now() + (ttl * 1000),
    lastUpdated: Date.now()
  };
  
  await kv.set(key, JSON.stringify(cacheData), { ex: ttl });
  console.log(`KV Cache saved for key: ${key}`);
}

/**
 * Get data from KV cache
 * @param {string} key - Cache key
 * @param {boolean} [ignoreExpiry=false] - Whether to ignore expiry check
 * @returns {any|null} Cached data or null if not found or expired
 */
export async function getFromKVCache(key, ignoreExpiry = false) {
  const cachedData = await kv.get(key);
  
  if (!cachedData) {
    console.log(`KV Cache miss for key: ${key}`);
    return null;
  }
  
  const parsedData = JSON.parse(cachedData);
  
  // Check if the cached data has expired
  if (!ignoreExpiry && parsedData.expires && parsedData.expires < Date.now()) {
    console.log(`KV Cache expired for key: ${key}`);
    await kv.del(key);
    return null;
  }
  
  console.log(`KV Cache hit for key: ${key}, last updated: ${new Date(parsedData.lastUpdated).toISOString()}`);
  return parsedData;
}

/**
 * Check if a key exists in KV cache
 * @param {string} key - Cache key
 * @returns {Promise<boolean>} True if the key exists and is not expired
 */
export async function kvCacheExists(key) {
  const cachedData = await getFromKVCache(key, true);
  return cachedData !== null;
}

/**
 * Update existing KV cache with new data
 * @param {string} key - Cache key
 * @param {function} updateFn - Function that takes the old data and returns new data
 * @param {number} [ttl=3600] - Time to live in seconds (default: 1 hour)
 * @returns {Promise<boolean>} True if the cache was updated, false if it doesn't exist
 */
export async function updateKVCache(key, updateFn, ttl = 3600) {
  const cachedData = await getFromKVCache(key, true);
  
  if (!cachedData) {
    return false;
  }
  
  const updatedData = updateFn(cachedData.data);
  await saveToKVCache(key, updatedData, ttl);
  return true;
}

/**
 * Delete a key from KV cache
 * @param {string} key - Cache key
 */
export async function deleteFromKVCache(key) {
  await kv.del(key);
  console.log(`KV Cache deleted for key: ${key}`);
}
