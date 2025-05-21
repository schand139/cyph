import { createPublicClient, http, formatUnits } from 'viem';
import { base } from 'viem/chains';
import { erc20ABI } from './abis';
import { format, startOfDay, startOfWeek, startOfMonth, parseISO } from 'date-fns';

// Cypher master wallet address
const CYPHER_MASTER_WALLET = '0xcCCd218A58B53C67fC17D8C87Cb90d83614e35fD';

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

// Cache for volume data
const volumeDataCache = new Map();

// Make sure we're exporting the function properly for both Vercel and local development
export default async function handler(req, res) {
  console.log('Volume API called with query:', req.query);
  try {
    const { period = 'daily', year = '2025' } = req.query;
    
    // Validate period
    if (!['daily', 'weekly', 'monthly'].includes(period)) {
      return res.status(400).json({ error: 'Invalid period. Must be daily, weekly, or monthly.' });
    }
    
    // Check cache
    const cacheKey = `${period}-${year}`;
    if (volumeDataCache.has(cacheKey)) {
      return res.status(200).json(volumeDataCache.get(cacheKey));
    }
    
    // Create client for Base chain
    const client = createPublicClient({
      chain: base,
      transport: http('https://mainnet.base.org'),
    });
    
    // In a real implementation, we would:
    // 1. Fetch all transactions to the master wallet
    // 2. Calculate USD values using token prices
    // 3. Aggregate by time period
    
    // For now, we'll generate realistic mock data
    // This would be replaced with actual blockchain queries
    
    // Generate data for the specified year
    const startDate = new Date(parseInt(year), 0, 1);
    const endDate = new Date(parseInt(year), 11, 31);
    const now = new Date();
    
    // Only generate data up to current date
    const effectiveEndDate = endDate > now ? now : endDate;
    
    // Generate daily data
    const dailyData = [];
    let currentDate = new Date(startDate);
    
    while (currentDate <= effectiveEndDate) {
      // Generate realistic volume with some randomness
      // Higher volumes on weekdays, lower on weekends
      const dayOfWeek = currentDate.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      
      const baseVolume = isWeekend ? 25000 : 75000;
      const randomFactor = 0.5 + Math.random();
      const volume = baseVolume * randomFactor;
      
      dailyData.push({
        date: format(currentDate, 'yyyy-MM-dd'),
        volume: Math.round(volume),
      });
      
      // Move to next day
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    // Aggregate by week
    const weeklyData = [];
    const weekMap = new Map();
    
    for (const day of dailyData) {
      const date = parseISO(day.date);
      const weekStart = format(startOfWeek(date, { weekStartsOn: 1 }), 'yyyy-MM-dd');
      
      if (!weekMap.has(weekStart)) {
        weekMap.set(weekStart, 0);
      }
      weekMap.set(weekStart, weekMap.get(weekStart) + day.volume);
    }
    
    for (const [date, volume] of weekMap.entries()) {
      weeklyData.push({ date, volume });
    }
    
    // Aggregate by month
    const monthlyData = [];
    const monthMap = new Map();
    
    for (const day of dailyData) {
      const date = parseISO(day.date);
      const monthStart = format(startOfMonth(date), 'yyyy-MM-dd');
      
      if (!monthMap.has(monthStart)) {
        monthMap.set(monthStart, 0);
      }
      monthMap.set(monthStart, monthMap.get(monthStart) + day.volume);
    }
    
    for (const [date, volume] of monthMap.entries()) {
      monthlyData.push({ date, volume });
    }
    
    // Prepare response data
    const result = {
      daily: dailyData,
      weekly: weeklyData,
      monthly: monthlyData,
    };
    
    console.log('Returning volume data:', result);
    res.status(200).json(result);
    
    // Store in cache
    volumeDataCache.set(cacheKey, result);
  } catch (error) {
    console.error('Error fetching volume data:', error);
    res.status(500).json({ error: error.message });
  }
}
