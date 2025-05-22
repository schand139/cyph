// Vercel Blob cache manager
import { put } from '@vercel/blob';

/**
 * Save data to Vercel Blob cache
 * @param {string} key - Cache key
 * @param {any} data - Data to cache
 * @param {number} ttl - Time to live in seconds
 */
export async function saveToBlobCache(key, data, ttl = 3600) {
  try {
    const cacheData = {
      data,
      expires: Date.now() + (ttl * 1000),
      lastUpdated: Date.now()
    };
    
    // Convert to JSON string
    const jsonData = JSON.stringify(cacheData);
    
    // Save to Vercel Blob store
    // The key will be used as the pathname
    const { url } = await put(`${key}.json`, jsonData, {
      contentType: 'application/json',
      access: 'public', // Make it public since we're using it as a cache
    });
    
    console.log(`Cache saved to Blob for key: ${key}, URL: ${url}`);
    return true;
  } catch (error) {
    console.error(`Error saving to Blob cache: ${error.message}`);
    return false;
  }
}

/**
 * Get data from Vercel Blob cache
 * @param {string} key - Cache key
 * @param {boolean} ignoreExpiry - Whether to ignore expiry check
 * @returns {any|null} Cached data or null if not found or expired
 */
export async function getFromBlobCache(key, ignoreExpiry = false) {
  try {
    // Construct the URL for the blob
    const blobUrl = `https://blob.vercel-storage.com/${key}.json`;
    
    // Fetch the blob content
    const response = await fetch(blobUrl);
    
    if (!response.ok) {
      console.log(`No cache found in Blob for key: ${key}`);
      return null;
    }
    
    // Parse the JSON data
    const cacheData = await response.json();
    
    // Check if cache has expired
    if (!ignoreExpiry && cacheData.expires < Date.now()) {
      console.log(`Cache expired for key: ${key}`);
      return null;
    }
    
    console.log(`Cache hit in Blob for key: ${key}, last updated: ${new Date(cacheData.lastUpdated).toISOString()}`);
    return cacheData.data;
  } catch (error) {
    console.error(`Error reading from Blob cache: ${error.message}`);
    return null;
  }
}

/**
 * Check if a key exists in Vercel Blob cache
 * @param {string} key - Cache key
 * @returns {Promise<boolean>} Whether valid cache exists
 */
export async function blobCacheExists(key) {
  try {
    // Construct the URL for the blob
    const blobUrl = `https://blob.vercel-storage.com/${key}.json`;
    
    // Check if the blob exists by making a HEAD request
    const response = await fetch(blobUrl, { method: 'HEAD' });
    
    return response.ok;
  } catch (error) {
    console.error(`Error checking Blob cache existence: ${error.message}`);
    return false;
  }
}

/**
 * Update existing Vercel Blob cache with new data
 * @param {string} key - Cache key
 * @param {function} updateFn - Function that takes existing data and returns updated data
 * @param {number} ttl - New TTL in seconds
 * @returns {Promise<boolean>} Whether update was successful
 */
export async function updateBlobCache(key, updateFn, ttl = 3600) {
  try {
    // First get the existing data
    const existingData = await getFromBlobCache(key, true);
    
    if (!existingData) {
      console.log(`No existing data found in Blob for key: ${key}`);
      return false;
    }
    
    // Apply the update function
    const updatedData = updateFn(existingData);
    
    // Save the updated data
    return await saveToBlobCache(key, updatedData, ttl);
  } catch (error) {
    console.error(`Error updating Blob cache: ${error.message}`);
    return false;
  }
}

/**
 * Delete a key from Vercel Blob cache
 * @param {string} key - Cache key
 */
export async function deleteFromBlobCache(key) {
  try {
    await del(`${key}.json`);
    console.log(`Cache deleted from Blob for key: ${key}`);
    return true;
  } catch (error) {
    console.error(`Error deleting from Blob cache: ${error.message}`);
    return false;
  }
}
