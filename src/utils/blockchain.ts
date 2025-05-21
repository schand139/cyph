import { createPublicClient, http, formatUnits } from 'viem';
import { base } from 'viem/chains';
import { BASE_RPC_URL, TOKENS, KNOWN_ADDRESSES } from './constants';
import type { Transaction, Counterparty } from '../types';

// Create a public client for Base chain
export const publicClient = createPublicClient({
  chain: base,
  transport: http(BASE_RPC_URL),
});

// Aerodrome/Uniswap V3 pool ABI (simplified)
// Commented out to avoid unused variable warning
/* const poolAbi = parseAbi([
  'function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
  'function token0() external view returns (address)',
  'function token1() external view returns (address)',
]); */

// ERC20 token ABI
// Commented out to avoid unused variable warning
/* const erc20Abi = parseAbi([
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function transfer(address to, uint256 value) returns (bool)',
  'event Transfer(address indexed from, address indexed to, uint256 value)',
]); */

// Get transactions for a wallet address
export async function getWalletTransactions(address: string): Promise<Transaction[]> {
  try {
    // Get native ETH transactions
    const sentTxs = await publicClient.getTransactionCount({
      address: address as `0x${string}`,
    });

    console.log(`Found ${sentTxs} sent transactions for ${address}`);

    // For simplicity, we'll use a mock implementation for now
    // In a real implementation, you would use an indexer or blockchain API
    // to get all transactions for the address
    
    // This is a placeholder - in a real app, you would fetch actual transaction data
    return [];
  } catch (error) {
    console.error('Error fetching wallet transactions:', error);
    return [];
  }
}

// Get token transfers for Cypher master wallet
export async function getTokenTransfers(): Promise<Transaction[]> {
  try {
    // In a real implementation, you would use an indexer or blockchain API
    // to get all token transfers for the Cypher master wallet
    
    // This is a placeholder - in a real app, you would fetch actual token transfer data
    return [];
  } catch (error) {
    console.error('Error fetching token transfers:', error);
    return [];
  }
}

// Get historical token price from Aerodrome/Uniswap V3 pools
export async function getTokenPrice(): Promise<number> {
  try {
    // In a real implementation, you would query the Aerodrome/Uniswap V3 pools
    // to get the historical price of the token at the given timestamp
    
    // This is a placeholder - in a real app, you would fetch actual price data
    // For now, we'll return a mock price
    return 1.0; // Default to 1 USD for simplicity
  } catch (error) {
    console.error('Error fetching token price:', error);
    return 1.0; // Default fallback price
  }
}

// Calculate USD value of a transaction
export async function calculateUsdValue(tx: Transaction): Promise<number> {
  try {
    let usdValue = 0;
    
    if (tx.tokenAddress) {
      // For token transfers
      const tokenPrice = await getTokenPrice();
      const tokenDecimals = TOKENS[tx.tokenSymbol as keyof typeof TOKENS]?.decimals || 18;
      usdValue = Number(formatUnits(tx.tokenAmount || 0n, tokenDecimals)) * tokenPrice;
    } else {
      // For native ETH transfers
      const ethPrice = await getTokenPrice();
      usdValue = Number(formatUnits(tx.value, 18)) * ethPrice;
    }
    
    return usdValue;
  } catch (error) {
    console.error('Error calculating USD value:', error);
    return 0;
  }
}

// Check if an address is a contract
export async function isContract(address: string): Promise<boolean> {
  try {
    const code = await publicClient.getBytecode({
      address: address as `0x${string}`,
    });
    return code !== undefined && code !== '0x';
  } catch (error) {
    console.error('Error checking if address is contract:', error);
    return false;
  }
}

// Identify counterparty type and label
export async function identifyCounterparty(address: string): Promise<{ type: 'wallet' | 'contract' | 'protocol' | 'exchange'; label?: string }> {
  // Check if it's a known address
  if (KNOWN_ADDRESSES[address.toLowerCase()]) {
    const { name, type } = KNOWN_ADDRESSES[address.toLowerCase()];
    return { type, label: name };
  }
  
  // Check if it's a contract
  const isContractAddress = await isContract(address);
  if (isContractAddress) {
    return { type: 'contract' };
  }
  
  // Default to wallet
  return { type: 'wallet' };
}

// Get top counterparties for a wallet
export async function getTopCounterparties(address: string, limit = 10): Promise<Counterparty[]> {
  try {
    // Get all transactions for the wallet
    const transactions = await getWalletTransactions(address);
    
    // Count transactions by counterparty
    const counterparties = new Map<string, { count: number; sent: bigint; received: bigint }>();
    
    for (const tx of transactions) {
      const counterpartyAddress = tx.from === address ? tx.to : tx.from;
      const isSent = tx.from === address;
      
      if (!counterparties.has(counterpartyAddress)) {
        counterparties.set(counterpartyAddress, { count: 0, sent: 0n, received: 0n });
      }
      
      const current = counterparties.get(counterpartyAddress)!;
      current.count += 1;
      
      if (isSent) {
        current.sent += tx.value;
      } else {
        current.received += tx.value;
      }
    }
    
    // Convert to array and sort by transaction count
    const counterpartyArray: Counterparty[] = [];
    
    for (const [address, data] of counterparties.entries()) {
      const { type, label } = await identifyCounterparty(address);
      
      counterpartyArray.push({
        address,
        transactionCount: data.count,
        type,
        label,
        totalValueSent: Number(formatUnits(data.sent, 18)),
        totalValueReceived: Number(formatUnits(data.received, 18)),
      });
    }
    
    // Sort by transaction count and limit
    return counterpartyArray
      .sort((a, b) => b.transactionCount - a.transactionCount)
      .slice(0, limit);
  } catch (error) {
    console.error('Error getting top counterparties:', error);
    return [];
  }
}
