import { format, startOfDay, startOfWeek, startOfMonth, addDays, addWeeks, addMonths } from 'date-fns';
import type { Transaction, VolumeData, AggregatedVolumeData, TimePeriod } from '../types';
import { calculateUsdValue } from './blockchain';

// Aggregate transactions by time period
export async function aggregateVolumeByPeriod(
  transactions: Transaction[],
  period: TimePeriod
): Promise<VolumeData[]> {
  // Group transactions by time period
  const volumeByPeriod = new Map<string, number>();

  // Process each transaction
  for (const tx of transactions) {
    const date = new Date(tx.timestamp * 1000);
    let periodStart: Date;

    // Determine period start based on the selected time period
    switch (period) {
      case 'daily':
        periodStart = startOfDay(date);
        break;
      case 'weekly':
        periodStart = startOfWeek(date, { weekStartsOn: 1 }); // Start on Monday
        break;
      case 'monthly':
        periodStart = startOfMonth(date);
        break;
      default:
        periodStart = startOfDay(date);
    }

    // Format the period key
    const periodKey = format(periodStart, 'yyyy-MM-dd');

    // Calculate USD value
    const usdValue = await calculateUsdValue(tx);

    // Add to the period total
    if (!volumeByPeriod.has(periodKey)) {
      volumeByPeriod.set(periodKey, 0);
    }
    volumeByPeriod.set(periodKey, volumeByPeriod.get(periodKey)! + usdValue);
  }

  // Convert to array format
  return Array.from(volumeByPeriod.entries()).map(([date, volume]) => ({
    date,
    volume,
  }));
}

// Aggregate volume data for all time periods
export async function aggregateAllVolumeData(
  transactions: Transaction[]
): Promise<AggregatedVolumeData> {
  // Filter transactions for 2025 only
  const transactions2025 = transactions.filter(tx => {
    const date = new Date(tx.timestamp * 1000);
    return date.getFullYear() === 2025;
  });

  // Aggregate by each time period
  const daily = await aggregateVolumeByPeriod(transactions2025, 'daily');
  const weekly = await aggregateVolumeByPeriod(transactions2025, 'weekly');
  const monthly = await aggregateVolumeByPeriod(transactions2025, 'monthly');

  return {
    daily,
    weekly,
    monthly,
  };
}

// Fill in missing dates in volume data
export function fillMissingDates(
  data: VolumeData[],
  period: TimePeriod,
  startDate: Date,
  endDate: Date
): VolumeData[] {
  const filledData: VolumeData[] = [];
  const dataMap = new Map(data.map(item => [item.date, item.volume]));

  let currentDate = startDate;
  let addPeriod: (date: Date) => Date;
  let formatString: string;

  // Set up period-specific functions
  switch (period) {
    case 'daily':
      addPeriod = date => addDays(date, 1);
      formatString = 'yyyy-MM-dd';
      break;
    case 'weekly':
      addPeriod = date => addWeeks(date, 1);
      formatString = 'yyyy-MM-dd';
      break;
    case 'monthly':
      addPeriod = date => addMonths(date, 1);
      formatString = 'yyyy-MM-dd';
      break;
    default:
      addPeriod = date => addDays(date, 1);
      formatString = 'yyyy-MM-dd';
  }

  // Fill in all dates in the range
  while (currentDate <= endDate) {
    const dateKey = format(currentDate, formatString);
    filledData.push({
      date: dateKey,
      volume: dataMap.get(dateKey) || 0,
    });
    currentDate = addPeriod(currentDate);
  }

  return filledData;
}

// Generate mock data for development
export function generateMockVolumeData(): AggregatedVolumeData {
  const now = new Date();
  const startOfYear = new Date(2025, 0, 1);
  const endOfYear = new Date(2025, 11, 31);
  
  // Generate random daily data
  const daily: VolumeData[] = [];
  let currentDate = new Date(startOfYear);
  
  while (currentDate <= endOfYear) {
    // Only generate data up to current date
    if (currentDate <= now) {
      daily.push({
        date: format(currentDate, 'yyyy-MM-dd'),
        volume: Math.random() * 100000 + 10000, // Random volume between 10k and 110k
      });
    }
    currentDate = addDays(currentDate, 1);
  }
  
  // Generate weekly data (aggregate daily data by week)
  const weekly: VolumeData[] = [];
  const weekMap = new Map<string, number>();
  
  for (const day of daily) {
    const date = new Date(day.date);
    const weekStart = format(startOfWeek(date, { weekStartsOn: 1 }), 'yyyy-MM-dd');
    
    if (!weekMap.has(weekStart)) {
      weekMap.set(weekStart, 0);
    }
    weekMap.set(weekStart, weekMap.get(weekStart)! + day.volume);
  }
  
  for (const [date, volume] of weekMap.entries()) {
    weekly.push({ date, volume });
  }
  
  // Generate monthly data (aggregate daily data by month)
  const monthly: VolumeData[] = [];
  const monthMap = new Map<string, number>();
  
  for (const day of daily) {
    const date = new Date(day.date);
    const monthStart = format(startOfMonth(date), 'yyyy-MM-dd');
    
    if (!monthMap.has(monthStart)) {
      monthMap.set(monthStart, 0);
    }
    monthMap.set(monthStart, monthMap.get(monthStart)! + day.volume);
  }
  
  for (const [date, volume] of monthMap.entries()) {
    monthly.push({ date, volume });
  }
  
  return {
    daily,
    weekly,
    monthly,
  };
}

// Generate mock counterparty data for development
export function generateMockCounterparties() {
  return [
    {
      address: '0x3154Cf16ccdb4C6d922629664174b904d80F2C35',
      transactionCount: 42,
      type: 'protocol',
      label: 'Base Bridge',
      totalValueSent: 15000,
      totalValueReceived: 12000,
    },
    {
      address: '0xCF2A95F5783a5249d2A56Bce4B3d1024726d5D5A',
      transactionCount: 36,
      type: 'protocol',
      label: 'Aerodrome Router',
      totalValueSent: 8000,
      totalValueReceived: 7500,
    },
    {
      address: '0x2626664c2603336E57B271c5C0b26F421741e481',
      transactionCount: 28,
      type: 'exchange',
      label: 'Coinbase',
      totalValueSent: 25000,
      totalValueReceived: 1000,
    },
    {
      address: '0x3a0C2Ba54D6CBd3121F01b96dFd20e99D1696C9D',
      transactionCount: 15,
      type: 'exchange',
      label: 'Binance',
      totalValueSent: 12000,
      totalValueReceived: 500,
    },
    {
      address: '0x0000000000A3A1f1D6b7D8cB9fFF98eC5f2C1e7b8',
      transactionCount: 12,
      type: 'protocol',
      label: 'Curve Finance',
      totalValueSent: 5000,
      totalValueReceived: 4800,
    },
    {
      address: '0x1111111111111111111111111111111111111111',
      transactionCount: 8,
      type: 'wallet',
      totalValueSent: 2000,
      totalValueReceived: 1800,
    },
    {
      address: '0x2222222222222222222222222222222222222222',
      transactionCount: 6,
      type: 'contract',
      totalValueSent: 1500,
      totalValueReceived: 1200,
    },
    {
      address: '0x3333333333333333333333333333333333333333',
      transactionCount: 5,
      type: 'wallet',
      totalValueSent: 1000,
      totalValueReceived: 800,
    },
    {
      address: '0x4444444444444444444444444444444444444444',
      transactionCount: 3,
      type: 'wallet',
      totalValueSent: 500,
      totalValueReceived: 300,
    },
    {
      address: '0x5555555555555555555555555555555555555555',
      transactionCount: 2,
      type: 'contract',
      totalValueSent: 200,
      totalValueReceived: 100,
    },
  ];
}
