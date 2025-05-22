import { useState, useEffect } from 'react';
import { CYPHER_MASTER_WALLET } from '../utils/constants';
import type { Counterparty } from '../types';

const WalletAnalysis = () => {
  const [walletAddress, setWalletAddress] = useState<string>(CYPHER_MASTER_WALLET);
  const [counterparties, setCounterparties] = useState<Counterparty[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Function to validate Ethereum address
  const isValidEthereumAddress = (address: string): boolean => {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  };

  // Function to fetch counterparty data
  const fetchCounterpartyData = async (address: string) => {
    if (!isValidEthereumAddress(address)) {
      setError('Please enter a valid Ethereum address');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      console.log('Fetching wallet analysis for address:', address);
      
      // Try to fetch from API first
      try {
        console.log('Attempting to fetch from API');
        const response = await fetch(`/api/getWalletAnalysis?address=${address}`);
        
        if (response.ok) {
          const data = await response.json();
          console.log('API data received:', data);
          
          if (data && data.counterparties) {
            console.log('Setting counterparties from API:', data.counterparties);
            setCounterparties(data.counterparties);
            setIsLoading(false);
            return;
          } else if (data.error) {
            // Show API error in the UI
            console.error('API returned an error:', data.error);
            setError(data.error);
            setCounterparties([]);
            setIsLoading(false);
            return;
          } else {
            // API returned empty results
            console.log('API returned empty results');
            setCounterparties([]);
            setIsLoading(false);
            return;
          }
        } else {
          console.error('API request failed with status:', response.status);
          setError(`API request failed with status: ${response.status}`);
          setCounterparties([]);
          setIsLoading(false);
          return;
        }
      } catch (apiError) {
        console.error('API request error:', apiError);
        setError(`API request error: ${apiError instanceof Error ? apiError.message : String(apiError)}`);
        setCounterparties([]);
        setIsLoading(false);
        return;
      }
    } catch (error) {
      console.error('Error fetching counterparty data:', error);
      setError('Failed to fetch counterparty data. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch data on initial load
  useEffect(() => {
    fetchCounterpartyData(walletAddress);
  }, []);

  // Handle form submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchCounterpartyData(walletAddress);
  };

  // Get badge color based on counterparty type
  const getBadgeColor = (type: string): string => {
    switch (type) {
      case 'protocol':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
      case 'exchange':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300';
      case 'contract':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
      case 'wallet':
      default:
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
          Wallet Analysis
        </h2>
      </div>
      <div className="mb-6">
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
          View the top 10 counterparties for any wallet address
        </p>
      </div>

      <form onSubmit={handleSubmit} className="mb-6">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-grow">
            <label htmlFor="wallet-address" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Wallet Address
            </label>
            <input
              type="text"
              id="wallet-address"
              value={walletAddress}
              onChange={(e) => setWalletAddress(e.target.value)}
              placeholder="Enter Ethereum address (0x...)"
              className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-gray-900 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
            />
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-600"
            >
              Analyze
            </button>
          </div>
        </div>
        {error && (
          <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>
        )}
      </form>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500"></div>
        </div>
      ) : (
        <>
          <div className="mb-4">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white">
              Top 10 Counterparties
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Wallets or contracts that have interacted with {walletAddress.substring(0, 6)}...{walletAddress.substring(walletAddress.length - 4)}
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Address
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Type
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Transactions
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Sent (USD)
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Received (USD)
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {counterparties.map((counterparty, index) => (
                  <tr key={index} className={index % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50 dark:bg-gray-700'}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900 dark:text-white">
                            {counterparty.label || `${counterparty.address.substring(0, 6)}...${counterparty.address.substring(counterparty.address.length - 4)}`}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            {counterparty.address}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getBadgeColor(counterparty.type)}`}>
                        {counterparty.type.charAt(0).toUpperCase() + counterparty.type.slice(1)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                      {counterparty.transactionCount}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                      {counterparty.totalValueSent !== undefined ? new Intl.NumberFormat('en-US', { 
                        style: 'currency', 
                        currency: 'USD',
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 0
                      }).format(counterparty.totalValueSent) : 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                      {counterparty.totalValueReceived !== undefined ? new Intl.NumberFormat('en-US', { 
                        style: 'currency', 
                        currency: 'USD',
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 0
                      }).format(counterparty.totalValueReceived) : 'N/A'}
                    </td>
                  </tr>
                ))}
                {counterparties.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-4 text-center text-sm text-gray-500 dark:text-gray-400">
                      No counterparty data found for this wallet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-6">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-3">
              Counterparty Type Distribution
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {['wallet', 'contract', 'protocol', 'exchange'].map((type) => {
                const count = counterparties.filter(c => c.type === type).length;
                const percentage = counterparties.length > 0 
                  ? Math.round((count / counterparties.length) * 100) 
                  : 0;
                
                return (
                  <div key={type} className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
                    <div className="flex items-center">
                      <span className={`w-3 h-3 rounded-full mr-2 ${getBadgeColor(type)}`}></span>
                      <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400">
                        {type.charAt(0).toUpperCase() + type.slice(1)}s
                      </h4>
                    </div>
                    <p className="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">
                      {count} <span className="text-sm font-normal">({percentage}%)</span>
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default WalletAnalysis;
