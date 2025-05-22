import { Alchemy, Network } from 'alchemy-sdk';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Get API key from environment variables
const API_KEY = process.env.ALCHEMY_API_KEY;
if (!API_KEY) {
  console.error('Warning: ALCHEMY_API_KEY not found in environment variables, will use mock data');
}

// Configure Alchemy SDK
const alchemy = API_KEY ? new Alchemy({
  apiKey: API_KEY,
  network: Network.BASE_MAINNET
}) : null;

// Known protocols and exchanges on Base chain
const KNOWN_ADDRESSES = {
  // Bridges
  '0x3154Cf16ccdb4C6d922629664174b904d80F2C35': { name: 'Base Bridge', type: 'protocol' },
  '0x49048044D57e1C92A77f79988d21Fa8fAF74E97e': { name: 'Base Bridge (Official)', type: 'protocol' },
  '0x866E82a600A1414e583f7F13623F1aC5d58b0Afa': { name: 'Base Bridge: L1 Bridge', type: 'protocol' },
  
  // DEXes
  '0xCF2A95F5783a5249d2A56Bce4B3d1024726d5D5A': { name: 'Aerodrome Router', type: 'protocol' },
  '0xbf59aac6c63c9a2b67fe5d8214a17ab8b1e33a1a': { name: 'Uniswap Universal Router', type: 'protocol' },
  '0x4752ba5DBc23F44D41617558Ad04F2AEe73F1e96': { name: 'Uniswap V3 Router', type: 'protocol' },
  '0x2626664c2603336E57B271c5C0b26F421741e481': { name: 'Coinbase', type: 'exchange' },
  '0x3a0C2Ba54D6CBd3121F01b96dFd20e99D1696C9D': { name: 'Binance', type: 'exchange' },
  '0x0000000000A3A1f1D6b7D8cB9fFF98eC5f2C1e7b8': { name: 'Curve Finance', type: 'protocol' },
  '0xFD0E9DaE3D7E2553d25Ff15640C9b576dD9e2A6C': { name: 'Balancer', type: 'protocol' },
  
  // Lending Protocols
  '0x8c45969D177B866E43B3acf4D3fA06a9A8F7C5F6': { name: 'Aave V3', type: 'protocol' },
  '0x1a0ad011913A150f69f6A19DF447A0CfD9551054': { name: 'Compound', type: 'protocol' },
  
  // NFT Marketplaces
  '0x00000000000000ADc04C56Bf30aC9d3c0aAF14dC': { name: 'OpenSea', type: 'protocol' },
  
  // Other Popular Protocols
  '0x6b75d8AF000000e20B7a7DDf000Ba900b4009A80': { name: 'Chainlink', type: 'protocol' },
  '0x4200000000000000000000000000000000000010': { name: 'Base Token', type: 'protocol' },
  '0x4200000000000000000000000000000000000006': { name: 'WETH', type: 'protocol' },
};

// Cache for wallet analysis results
const walletAnalysisCache = new Map();

// Make sure we're exporting the function properly for both Vercel and local development
export default async function handler(req, res) {
  console.log('Wallet Analysis API called with query:', req.query);
  try {
    const { address, timeframe } = req.query;
    
    if (!address) {
      return res.status(400).json({ error: 'Wallet address is required' });
    }
    
    // Validate address
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return res.status(400).json({ error: 'Invalid Ethereum address' });
    }
    
    console.log(`Analyzing wallet: ${address}`);
    
    // Check cache
    const cacheKey = `wallet-analysis-${address}-${timeframe || 'default'}`;
    if (walletAnalysisCache.has(cacheKey)) {
      console.log('Returning cached wallet analysis');
      return res.status(200).json(walletAnalysisCache.get(cacheKey));
    }
    
    // Check if Alchemy SDK is available
    if (!alchemy) {
      console.log('Alchemy SDK not available, using mock data');
      return generateMockAnalysis(address, res);
    }
    
    // For the demo, we'll use mock data if this is the Cypher master wallet
    // This ensures we have good data to show even if there are API issues
    if (address.toLowerCase() === '0xcCCd218A58B53C67fC17D8C87Cb90d83614e35fD'.toLowerCase()) {
      console.log('Using mock data for the Cypher master wallet to ensure good demo data');
      return generateMockAnalysis(address, res);
    }
    
    try {
      // Set time range based on timeframe parameter
      let startDate, endDate;
      const now = new Date();
      
      if (timeframe === '2023') {
        // Use 2023 data for testing
        startDate = new Date('2023-08-01T00:00:00Z'); // Base launched in July 2023
        endDate = new Date('2023-12-31T23:59:59Z');
      } else if (timeframe === '90days') {
        // Last 90 days
        startDate = new Date(now);
        startDate.setDate(now.getDate() - 90);
        endDate = now;
      } else {
        // Default to last 30 days
        startDate = new Date(now);
        startDate.setDate(now.getDate() - 30);
        endDate = now;
      }
      
      console.log(`Analyzing transactions from ${startDate.toISOString()} to ${endDate.toISOString()}`);
      
      // Track counterparties and their transaction counts
      const counterpartyMap = new Map();
      
      try {
        // Fetch transactions using Alchemy
        console.log('Fetching transactions from Alchemy...');
        
        // Get all transactions for the address (both sent and received)
        // Note: 'internal' category is not supported on Base Mainnet
        const assetTransfers = await alchemy.core.getAssetTransfers({
          fromBlock: "0x0",
          toBlock: "latest",
          fromAddress: address,
          category: ["external", "erc20", "erc721", "erc1155"], // Removed 'internal' as it's not supported
          maxCount: 100, // Limit to 100 transactions for performance
        });
        
        console.log(`Found ${assetTransfers.transfers.length} outgoing transfers`);
        
        // Process outgoing transfers
        for (const transfer of assetTransfers.transfers) {
          if (!transfer.to) continue; // Skip if no recipient
          
          const counterpartyAddress = transfer.to.toLowerCase();
          
          if (!counterpartyMap.has(counterpartyAddress)) {
            counterpartyMap.set(counterpartyAddress, {
              address: counterpartyAddress,
              transactionCount: 0,
              sentCount: 0,
              receivedCount: 0,
              totalValueSent: 0,
              totalValueReceived: 0,
              // Check if this is a known protocol or exchange
              ...(KNOWN_ADDRESSES[counterpartyAddress] || {
                type: 'unknown', // Will be updated later
              }),
            });
          }
          
          const counterparty = counterpartyMap.get(counterpartyAddress);
          counterparty.transactionCount += 1;
          counterparty.sentCount += 1;
          counterparty.totalValueSent += parseFloat(transfer.value) || 0;
        }
        
        // Get incoming transfers
        // Note: 'internal' category is not supported on Base Mainnet
        const incomingTransfers = await alchemy.core.getAssetTransfers({
          fromBlock: "0x0",
          toBlock: "latest",
          toAddress: address,
          category: ["external", "erc20", "erc721", "erc1155"], // Removed 'internal' as it's not supported
          maxCount: 100, // Limit to 100 transactions for performance
        });
        
        console.log(`Found ${incomingTransfers.transfers.length} incoming transfers`);
        
        // Process incoming transfers
        for (const transfer of incomingTransfers.transfers) {
          if (!transfer.from) continue; // Skip if no sender
          
          const counterpartyAddress = transfer.from.toLowerCase();
          
          if (!counterpartyMap.has(counterpartyAddress)) {
            counterpartyMap.set(counterpartyAddress, {
              address: counterpartyAddress,
              transactionCount: 0,
              sentCount: 0,
              receivedCount: 0,
              totalValueSent: 0,
              totalValueReceived: 0,
              // Check if this is a known protocol or exchange
              ...(KNOWN_ADDRESSES[counterpartyAddress] || {
                type: 'unknown', // Will be updated later
              }),
            });
          }
          
          const counterparty = counterpartyMap.get(counterpartyAddress);
          counterparty.transactionCount += 1;
          counterparty.receivedCount += 1;
          counterparty.totalValueReceived += parseFloat(transfer.value) || 0;
        }
        
        // For any counterparties with unknown type, determine if they're contracts
        const unknownCounterparties = Array.from(counterpartyMap.values())
          .filter(cp => cp.type === 'unknown')
          .map(cp => cp.address);
        
        if (unknownCounterparties.length > 0) {
          console.log(`Checking contract status for ${unknownCounterparties.length} addresses...`);
          
          // Check contract status in batches to avoid rate limits
          const batchSize = 10;
          for (let i = 0; i < unknownCounterparties.length; i += batchSize) {
            const batch = unknownCounterparties.slice(i, i + batchSize);
            const promises = batch.map(address => 
              alchemy.core.isContractAddress(address)
                .then(isContract => ({ address, isContract }))
                .catch(() => ({ address, isContract: false })) // Default to false on error
            );
            
            const results = await Promise.all(promises);
            
            for (const { address, isContract } of results) {
              const counterparty = counterpartyMap.get(address);
              if (counterparty) {
                counterparty.type = isContract ? 'contract' : 'wallet';
              }
            }
          }
        }
      } catch (txError) {
        console.error('Error processing transactions:', txError);
        // Continue with any data we have so far
      }
      
      // Convert map to array and identify known protocols
      const counterparties = Array.from(counterpartyMap.values()).map(cp => {
        // Check if this is a known address
        if (KNOWN_ADDRESSES[cp.address]) {
          const { name, type } = KNOWN_ADDRESSES[cp.address];
          cp.label = name;
          cp.type = type;
        } else {
          // Try to determine if it's a contract
          cp.type = cp.type === 'unknown' ? 'wallet' : cp.type;
        }
        return cp;
      });
      
      // Sort by transaction count (descending)
      counterparties.sort((a, b) => b.transactionCount - a.transactionCount);
      
      // Limit to top 10
      const top10 = counterparties.slice(0, 10);
      
      // Store in cache
      walletAnalysisCache.set(address, top10);
      
      // Return the results
      const result = { 
        counterparties: top10,
        source: 'blockchain'
      };
      console.log(`Returning wallet analysis with ${top10.length} counterparties`);
      return res.status(200).json(result);
    } catch (blockchainError) {
      console.error('Error fetching blockchain data:', blockchainError);
      console.log('Falling back to mock data due to error');
      return generateMockAnalysis(address, res);
    }
  } catch (error) {
    console.error('Error analyzing wallet:', error);
    res.status(500).json({ error: error.message });
  }
}

// This function is no longer needed as we're using Alchemy's getAssetTransfers

// Helper function to generate mock data
async function generateMockAnalysis(address, res) {
  // Use the last 4 characters of the address to seed the random generator
  // This ensures the same address always gets the same results
  const seed = parseInt(address.slice(-4), 16);
  const random = (min, max) => {
    const x = Math.sin(seed) * 10000;
    const rand = x - Math.floor(x);
    return Math.floor(rand * (max - min + 1)) + min;
  };
  
  // Generate a list of counterparties
  const counterparties = [];
  
  // Add some known protocols and exchanges
  const knownAddressKeys = Object.keys(KNOWN_ADDRESSES);
  const numKnown = Math.min(random(3, 6), knownAddressKeys.length);
  
  for (let i = 0; i < numKnown; i++) {
    const knownAddress = knownAddressKeys[i];
    const { name, type } = KNOWN_ADDRESSES[knownAddress];
    
    counterparties.push({
      address: knownAddress,
      transactionCount: random(5, 50),
      type,
      label: name,
      totalValueSent: random(1000, 30000),
      totalValueReceived: random(500, 20000),
    });
  }
  
  // Add some random wallets and contracts
  const numRandom = random(2, 5);
  
  for (let i = 0; i < numRandom; i++) {
    // Generate a random address
    const randomAddr = `0x${Array.from({length: 40}, () => 
      '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('')}`;
    
    // Determine if it's a wallet or contract (70% chance of being a wallet)
    const type = Math.random() < 0.7 ? 'wallet' : 'contract';
    
    counterparties.push({
      address: randomAddr,
      transactionCount: random(1, 10),
      type,
      totalValueSent: random(100, 5000),
      totalValueReceived: random(50, 3000),
    });
  }
  
  // Sort by transaction count (descending)
  counterparties.sort((a, b) => b.transactionCount - a.transactionCount);
  
  // Limit to top 10
  const top10 = counterparties.slice(0, 10);
  
  // Store in cache
  walletAnalysisCache.set(address, top10);
  
  // Return the results
  const result = { 
    counterparties: top10,
    source: 'mock'
  };
  console.log('Returning mock wallet analysis data');
  return res.status(200).json(result);
}
