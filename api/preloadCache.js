// API endpoint for preloading the cache
// This can be called by a scheduled job in Vercel
import preloadCache from '../scripts/preloadCache.js';
import { put } from '@vercel/blob';
import { getData } from '../utils/unifiedCacheManager.js';

export default async function handler(req, res) {
  try {
    // Check for API key if this is a production environment
    // This prevents unauthorized access to the preload endpoint
    if (process.env.NODE_ENV === 'production' && req.headers['x-api-key'] !== process.env.PRELOAD_API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    // Run the cache preloading
    await preloadCache();
    
    // Get the wallet address and year from query parameters or use defaults
    const walletAddress = req.query.wallet || process.env.CYPHER_MASTER_WALLET || '0xcCCd218A58B53C67fC17D8C87Cb90d83614e35fD';
    const year = req.query.year || '2025';
    const volumeCacheKey = `volume-${walletAddress}-${year}`;
    
    // Get the data from the cache that was just preloaded
    const cachedData = await getData(volumeCacheKey);
    
    if (cachedData) {
      // Check if we have the BLOB_READ_WRITE_TOKEN environment variable
      if (!process.env.BLOB_READ_WRITE_TOKEN) {
        console.log('BLOB_READ_WRITE_TOKEN environment variable not found, skipping Blob storage upload');
        console.log('To enable Blob storage, add the BLOB_READ_WRITE_TOKEN to your Vercel environment variables');
        
        // Return success response without Blob URL
        res.status(200).json({ 
          success: true, 
          message: 'Cache preloaded successfully. Blob storage upload skipped due to missing BLOB_READ_WRITE_TOKEN.',
          timestamp: new Date().toISOString()
        });
      } else {
        try {
          // Upload the data to Vercel Blob storage
          console.log(`Uploading data to Vercel Blob storage with key: ${volumeCacheKey}`);
          const jsonData = JSON.stringify(cachedData);
          
          // Upload to Vercel Blob storage
          const { url } = await put(volumeCacheKey, jsonData, {
            contentType: 'application/json',
            access: 'public', // Make it public since we're using it as a cache
            allowOverwrite: true, // Allow overwriting existing blobs
          });
          
          console.log(`Successfully uploaded data to Vercel Blob storage: ${url}`);
          
          // Return success response with Blob URL
          res.status(200).json({ 
            success: true, 
            message: 'Cache preloaded and uploaded to Blob storage successfully',
            blobUrl: url,
            timestamp: new Date().toISOString()
          });
        } catch (blobError) {
          console.error(`Error uploading to Vercel Blob storage: ${blobError.message}`);
          
          // Return partial success response
          res.status(200).json({ 
            success: true, 
            message: 'Cache preloaded successfully but failed to upload to Blob storage',
            error: blobError.message,
            timestamp: new Date().toISOString()
          });
        }
      }
    } else {
      // Return success response without Blob URL
      res.status(200).json({ 
        success: true, 
        message: 'Cache preloaded successfully but no data found to upload to Blob storage',
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error('Error preloading cache:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}
