// Transaction data types
export interface Transaction {
  hash: string;
  from: string;
  to: string;
  value: bigint;
  tokenAddress?: string;
  tokenSymbol?: string;
  tokenAmount?: bigint;
  timestamp: number;
  blockNumber: number;
}

// Volume data types
export interface VolumeData {
  date: string;
  volume: number;
}

export interface AggregatedVolumeData {
  daily: VolumeData[];
  weekly: VolumeData[];
  monthly: VolumeData[];
}

// Counterparty types
export interface Counterparty {
  address: string;
  transactionCount: number;
  type: 'wallet' | 'contract' | 'protocol' | 'exchange';
  label?: string;
  totalValueSent?: number;
  totalValueReceived?: number;
}

// Time period for volume analytics
export type TimePeriod = 'daily' | 'weekly' | 'monthly';

// Known protocol/exchange addresses
export interface KnownAddress {
  address: string;
  name: string;
  type: 'protocol' | 'exchange' | 'contract';
}
