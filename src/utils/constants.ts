// Cypher master wallet address
export const CYPHER_MASTER_WALLET = '0xcCCd218A58B53C67fC17D8C87Cb90d83614e35fD';

// Base chain RPC URL - using public endpoints
export const BASE_RPC_URL = 'https://mainnet.base.org';

// Aerodrome Finance (Uniswap v3-based) contracts
export const AERODROME_FACTORY_ADDRESS = '0x420DD381b31aEf6683db6B902084cB0FFECe40Da';

// Common tokens on Base
export const TOKENS = {
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
  DAI: {
    address: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb',
    symbol: 'DAI',
    decimals: 18
  },
  WETH: {
    address: '0x4200000000000000000000000000000000000006',
    symbol: 'WETH',
    decimals: 18
  }
};

// Known protocols and exchanges
export const KNOWN_ADDRESSES: Record<string, { name: string; type: 'protocol' | 'exchange' | 'contract' }> = {
  '0x3154Cf16ccdb4C6d922629664174b904d80F2C35': { name: 'Base Bridge', type: 'protocol' },
  '0xCF2A95F5783a5249d2A56Bce4B3d1024726d5D5A': { name: 'Aerodrome Router', type: 'protocol' },
  '0xbf59aac6c63c9a2b67fe5d8214a17ab8b1e33a1a': { name: 'Uniswap Universal Router', type: 'protocol' },
  '0x2626664c2603336E57B271c5C0b26F421741e481': { name: 'Coinbase', type: 'exchange' },
  '0x3a0C2Ba54D6CBd3121F01b96dFd20e99D1696C9D': { name: 'Binance', type: 'exchange' },
  '0x0000000000A3A1f1D6b7D8cB9fFF98eC5f2C1e7b8': { name: 'Curve Finance', type: 'protocol' },
};

// Timeframes for data aggregation
export const TIMEFRAMES = {
  DAILY: 'daily',
  WEEKLY: 'weekly',
  MONTHLY: 'monthly',
} as const;
