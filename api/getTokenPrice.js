import { createPublicClient, http, formatUnits } from 'viem';
import { base } from 'viem/chains';
import { aerodromePairABI } from './abis';

// Aerodrome Finance factory address on Base chain
const AERODROME_FACTORY_ADDRESS = '0x420DD381b31aEf6683db6B902084cB0FFECe40Da';

// USDC address on Base chain (for price reference)
const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

// Common tokens on Base
const TOKENS = {
  ETH: {
    address: '0x0000000000000000000000000000000000000000', // Native ETH
    symbol: 'ETH',
    decimals: 18
  },
  USDC: {
    address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    symbol: 'USDC',
    decimals: 6
  },
  WETH: {
    address: '0x4200000000000000000000000000000000000006',
    symbol: 'WETH',
    decimals: 18
  }
};

// Cache for token prices to reduce blockchain queries
const priceCache = new Map();

// Make sure we're exporting the function properly for both Vercel and local development
export default async function handler(req, res) {
  console.log('Token Price API called with query:', req.query);
  try {
    const { tokenAddress, timestamp } = req.query;
    
    // Validate inputs
    if (!tokenAddress || !/^0x[a-fA-F0-9]{40}$/.test(tokenAddress)) {
      return res.status(400).json({ error: 'Invalid token address' });
    }
    
    // Check cache first
    const cacheKey = `${tokenAddress}-${timestamp || 'latest'}`;
    if (priceCache.has(cacheKey)) {
      // Return the results
      const result = {
        prices: priceCache.get(cacheKey),
        currentPrice: priceCache.get(cacheKey)[priceCache.get(cacheKey).length - 1].price,
      };
      console.log('Returning token price data:', result);
      return res.status(200).json(result);
    }
    
    // Create client for Base chain
    const client = createPublicClient({
      chain: base,
      transport: http('https://mainnet.base.org'),
    });
    
    // For native ETH, use WETH price
    const actualTokenAddress = tokenAddress === TOKENS.ETH.address 
      ? TOKENS.WETH.address 
      : tokenAddress;
    
    // Get token price from Aerodrome
    let price = 1.0; // Default to 1 USD for testing
    
    try {
      // In a real implementation, we would:
      // 1. Find the token/USDC pair from Aerodrome
      // 2. Query the reserves
      // 3. Calculate the price based on the reserves
      
      // For now, we'll use a simplified implementation
      // This would be replaced with actual blockchain queries
      
      if (actualTokenAddress === TOKENS.USDC.address) {
        // USDC is our reference, so its price is 1
        price = 1.0;
      } else if (actualTokenAddress === TOKENS.WETH.address) {
        // For demo purposes, use a realistic ETH price
        price = 3500.0;
      } else {
        // For other tokens, generate a random price between 0.1 and 10 USD
        price = Math.random() * 9.9 + 0.1;
      }
      
      // In a production environment, we would query historical blocks
      // to get the price at the specific timestamp
      
      // Store in cache and return
      priceCache.set(cacheKey, price);
      return res.status(200).json({ price });
    } catch (error) {
      console.error('Error querying Aerodrome:', error);
      // Fallback to a default price if Aerodrome query fails
      return res.status(200).json({ price: 1.0, source: 'fallback' });
    }
  } catch (error) {
    console.error('Error fetching token price:', error);
    res.status(500).json({ error: error.message });
  }
}
