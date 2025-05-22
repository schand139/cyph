// Unified cache manager that works with both file system and Vercel Blob storage
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Get the directory name in ESM context
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// File system cache functions
const saveToCache = (key, data) => {
  try {
    const cachePath = path.join(__dirname, '..', 'cache', `${key}.json`);
    const cacheDir = path.dirname(cachePath);
    
    // Create cache directory if it doesn't exist
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }
    
    fs.writeFileSync(cachePath, JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    console.error(`Error saving to cache: ${error.message}`);
    return false;
  }
};

const getFromCache = (key) => {
  try {
    const cachePath = path.join(__dirname, '..', 'cache', `${key}.json`);
    if (!fs.existsSync(cachePath)) {
      return null;
    }
    
    const data = fs.readFileSync(cachePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`Error reading from cache: ${error.message}`);
    return null;
  }
};

const cacheExists = (key) => {
  const cachePath = path.join(__dirname, '..', 'cache', `${key}.json`);
  return fs.existsSync(cachePath);
};

const updateCache = (key, updateFn) => {
  try {
    const cachePath = path.join(__dirname, '..', 'cache', `${key}.json`);
    if (!fs.existsSync(cachePath)) {
      return false;
    }
    
    const data = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    const updatedData = updateFn(data);
    
    fs.writeFileSync(cachePath, JSON.stringify(updatedData, null, 2));
    return true;
  } catch (error) {
    console.error(`Error updating cache: ${error.message}`);
    return false;
  }
};

const deleteFromCache = (key) => {
  try {
    const cachePath = path.join(__dirname, '..', 'cache', `${key}.json`);
    if (!fs.existsSync(cachePath)) {
      return false;
    }
    
    fs.unlinkSync(cachePath);
    return true;
  } catch (error) {
    console.error(`Error deleting from cache: ${error.message}`);
    return false;
  }
};

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
