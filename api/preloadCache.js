// API endpoint for preloading the cache
// This can be called by a scheduled job in Vercel
import preloadCache from '../scripts/preloadCache.js';

export default async function handler(req, res) {
  try {
    // Check for API key if this is a production environment
    // This prevents unauthorized access to the preload endpoint
    if (process.env.NODE_ENV === 'production' && req.headers['x-api-key'] !== process.env.PRELOAD_API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    // Run the cache preloading
    await preloadCache();
    
    // Return success response
    res.status(200).json({ 
      success: true, 
      message: 'Cache preloaded successfully',
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
