// Simple Express server to serve API endpoints during development
import express from 'express';
import cors from 'cors';
import getVolumeDataHandler from './api/getVolumeData.js';
import getWalletAnalysisHandler from './api/getWalletAnalysis.js';
import preloadCache from './scripts/preloadCache.js';

const app = express();
const PORT = 3002; // Using port 3002 to avoid conflicts

// Enable CORS for all routes
app.use(cors());

// Parse JSON request bodies
app.use(express.json());

// Add a minimal request logger
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

// Set up individual API routes
app.get('/api/getVolumeData', getVolumeDataHandler);
app.get('/api/getWalletAnalysis', getWalletAnalysisHandler);

// Preload the cache before starting the server
preloadCache()
  .then(() => {
    // Start the server after cache is preloaded
    app.listen(PORT, () => {
      console.log(`API server running at http://localhost:${PORT}`);
    });
  })
  .catch(error => {
    console.error('Error during cache preloading:', error);
    // Start the server anyway, even if preloading fails
    app.listen(PORT, () => {
      console.log(`API server running at http://localhost:${PORT}`);
    });
  });
