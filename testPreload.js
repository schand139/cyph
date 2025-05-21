// Simple script to test preloadCache
import preloadCache from './scripts/preloadCache.js';

console.log('Running preloadCache with forceUpdateTest=true');
preloadCache(true).then(() => {
  console.log('Preload completed successfully');
}).catch(error => {
  console.error('Preload failed:', error);
});
