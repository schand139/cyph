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
    const { address } = req.query;
    
    // Validate address
    if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return res.status(400).json({ error: 'Invalid Ethereum address' });
    }
    
    // Check cache
    if (walletAnalysisCache.has(address)) {
      return res.status(200).json({ counterparties: walletAnalysisCache.get(address) });
    }
    
    // Create client for Base chain
    const client = createPublicClient({
      chain: base,
      transport: http('https://mainnet.base.org'),
    });
    
    // In a real implementation, we would:
    // 1. Fetch all transactions for the wallet
    // 2. Identify counterparties
    // 3. Calculate transaction counts and values
    
    // For now, we'll generate realistic mock data based on the address
    // This would be replaced with actual blockchain queries
    
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
    const result = { counterparties: top10 };
    console.log('Returning wallet analysis data:', result);
    res.status(200).json(result);
  } catch (error) {
    console.error('Error analyzing wallet:', error);
    res.status(500).json({ error: error.message });
  }
}
