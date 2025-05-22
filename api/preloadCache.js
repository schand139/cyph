// API endpoint for preloading the cache
// This can be called by a scheduled job in Vercel
import preloadCache from '../scripts/preloadCache.js';

/**
 * API handler for preloading the cache
 * This endpoint runs the preloadCache script which handles:
 * 1. Fetching blockchain data using initialCacheFetch or incrementalFetch
 * 2. Saving data to local cache files
 * 3. Uploading data to Vercel Blob storage when in production
 */
export default async function handler(req, res) {
  try {
    // Check for API key if this is a production environment
    // This prevents unauthorized access to the preload endpoint
    if (process.env.NODE_ENV === 'production' && req.headers['x-api-key'] !== process.env.PRELOAD_API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    // Get parameters from query or use defaults
    const options = {
      walletAddress: req.query.wallet || process.env.CYPHER_MASTER_WALLET || '0xcCCd218A58B53C67fC17D8C87Cb90d83614e35fD',
      year: req.query.year || '2025',
      forceRefresh: req.query.forceRefresh === 'true'
    };
    
    console.log(`Preloading cache with options:`, options);
    
    // Run the preloadCache script with options
    // The script handles both local caching and Blob uploads
    const result = await preloadCache(options.forceRefresh, options.walletAddress, options.year);
    
    // Return success response with any Blob URL if available
    res.status(200).json({
      success: true,
      message: 'Cache preloaded successfully',
      blobUrl: result?.blobUrl, // Will be undefined if not uploaded to Blob
      cacheInfo: result?.cacheInfo || {},
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error preloading cache:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}
