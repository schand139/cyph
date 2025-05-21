// Simple Express server to serve API endpoints during development
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Get the directory name in ESM context
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = 3001;

// Enable CORS for all routes
app.use(cors());

// Parse JSON request bodies
app.use(express.json());

// Dynamically load and serve API endpoints
app.use('/api', async (req, res) => {
  try {
    // Extract the endpoint name from the URL
    const endpoint = req.path.substring(1); // Remove leading slash
    
    if (!endpoint) {
      return res.status(404).json({ error: 'API endpoint not specified' });
    }
    
    // Construct the path to the API file
    const apiFilePath = path.join(__dirname, 'api', `${endpoint}.js`);
    
    // Check if the file exists
    if (!fs.existsSync(apiFilePath)) {
      return res.status(404).json({ error: `API endpoint not found: ${endpoint}` });
    }
    
    // Import the API handler (dynamic import for ESM)
    const apiModule = await import(apiFilePath + '?t=' + Date.now());
    const handler = apiModule.default;
    
    // Create a mock request object with query parameters
    const mockReq = { query: req.query };
    
    // Create a mock response object that will forward to Express response
    const mockRes = {
      status: (code) => {
        res.status(code);
        return mockRes;
      },
      json: (data) => {
        res.json(data);
      }
    };
    
    // Call the API handler
    await handler(mockReq, mockRes);
  } catch (error) {
    console.error('API error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`API server running at http://localhost:${PORT}`);
  console.log(`Example: http://localhost:${PORT}/api/getVolumeData?period=daily&year=2025`);
});
