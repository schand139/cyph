import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';

// Known protocols and exchanges on Base chain
const KNOWN_ADDRESSES = {
  '0x3154Cf16ccdb4C6d922629664174b904d80F2C35': { name: 'Base Bridge', type: 'protocol' },
  '0xCF2A95F5783a5249d2A56Bce4B3d1024726d5D5A': { name: 'Aerodrome Router', type: 'protocol' },
  '0xbf59aac6c63c9a2b67fe5d8214a17ab8b1e33a1a': { name: 'Uniswap Universal Router', type: 'protocol' },
  '0x2626664c2603336E57B271c5C0b26F421741e481': { name: 'Coinbase', type: 'exchange' },
  '0x3a0C2Ba54D6CBd3121F01b96dFd20e99D1696C9D': { name: 'Binance', type: 'exchange' },
  '0x0000000000A3A1f1D6b7D8cB9fFF98eC5f2C1e7b8': { name: 'Curve Finance', type: 'protocol' },
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
    
    // Create client for Base chain
    const client = createPublicClient({
      chain: base,
      transport: http('https://mainnet.base.org'),
    });
    
    try {
      // Log chain connection details
      try {
        const chainId = await client.getChainId();
        console.log(`Connected to chain ID: ${chainId}`);
        
        const currentBlock = await client.getBlockNumber();
        console.log(`Current block number: ${currentBlock}`);
      } catch (connectionError) {
        console.error('Error checking chain connection:', connectionError);
      }
      
      // Calculate block numbers for the time range
      // This is a simplified approach - in production, you'd use a more accurate block time estimation
      const blocksPerDay = 43200;
      let fromBlock;
      
      if (timeframe === '2023') {
        // For 2023, use a fixed block range
        // Base chain launched in July 2023, so we'll use a conservative estimate
        // Starting from around block 1,000,000 (August 2023)
        fromBlock = BigInt(1000000);
      } else {
        // Default to last 90 days
        const ninetyDaysInBlocks = 90 * blocksPerDay;
        fromBlock = currentBlock - BigInt(ninetyDaysInBlocks);
      }
      
      // Set time range based on timeframe parameter
      let startDate, endDate;
      const now = new Date();
      
      if (timeframe === '2023') {
        // Use 2023 data for testing
        startDate = new Date('2023-01-01T00:00:00Z');
        endDate = new Date('2023-12-31T23:59:59Z');
      } else {
        // Default to last 90 days
        startDate = new Date(now);
        startDate.setDate(now.getDate() - 90);
        endDate = now;
      }
      
      console.log(`Fetching transactions from ${startDate.toISOString()} to ${endDate.toISOString()}`);
      
      // Fetch native ETH transactions
      console.log('Fetching native ETH transactions...');
      
      // Track counterparties and their transaction counts
      const counterpartyMap = new Map();
      
      try {
        // Get transactions where the wallet is the sender
        const sentTransactions = await fetchTransactions(client, address, 'from', startDate, endDate);
        console.log(`Found ${sentTransactions.length} outgoing transactions`);
        
        // Process sent transactions
        for (const tx of sentTransactions) {
          const counterpartyAddress = tx.to;
          
          if (!counterpartyMap.has(counterpartyAddress)) {
            counterpartyMap.set(counterpartyAddress, {
              address: counterpartyAddress,
              transactionCount: 0,
              type: 'unknown',
              totalValueSent: 0,
              totalValueReceived: 0,
            });
          }
          
          const counterparty = counterpartyMap.get(counterpartyAddress);
          counterparty.transactionCount += 1;
          counterparty.totalValueSent += Number(tx.value) / 1e18; // Convert from wei to ETH
        }
        
        // Get transactions where the wallet is the receiver
        const receivedTransactions = await fetchTransactions(client, address, 'to', startDate, endDate);
        console.log(`Found ${receivedTransactions.length} incoming transactions`);
        
        // Process received transactions
        for (const tx of receivedTransactions) {
          const counterpartyAddress = tx.from;
          
          if (!counterpartyMap.has(counterpartyAddress)) {
            counterpartyMap.set(counterpartyAddress, {
              address: counterpartyAddress,
              transactionCount: 0,
              type: 'unknown',
              totalValueSent: 0,
              totalValueReceived: 0,
            });
          }
          
          const counterparty = counterpartyMap.get(counterpartyAddress);
          counterparty.transactionCount += 1;
          counterparty.totalValueReceived += Number(tx.value) / 1e18; // Convert from wei to ETH
        }
      } catch (txError) {
        console.error('Error fetching transactions:', txError);
      }
      
      // If we found no transactions, fall back to mock data
      if (counterpartyMap.size === 0) {
        console.log('No transactions found, using mock data');
        return generateMockAnalysis(address, res);
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

// Helper function to fetch transactions
async function fetchTransactions(client, address, direction, fromTimestamp, toTimestamp) {
  try {
    // Convert timestamps to block numbers
    // This is an approximation - Base produces blocks every 2 seconds on average
    const fromBlock = BigInt(Math.max(0, Math.floor((fromTimestamp - 1672531200) / 2) + 1)); // Base launched Jan 1, 2023
    const toBlock = 'latest';
    
    console.log(`Querying transactions with ${direction}=${address} from block ${fromBlock} to ${toBlock}`);
    
    // Since viem doesn't have a direct getTransactions method, we'll use getBlock and filter
    // This is a simplified implementation - in production, you would use a more efficient approach
    // such as querying an indexer or using a service like Etherscan
    
    // For now, we'll return an empty array since this is just for testing
    // In a real implementation, you would need to fetch blocks and filter transactions
    console.log('Note: viem does not provide a direct getTransactions method. In production, use an indexer or API service.');
    
    return [];
  } catch (error) {
    console.error(`Error fetching ${direction} transactions:`, error);
    return [];
  }
}

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
