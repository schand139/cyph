import { useState } from 'react'
import VolumeAnalytics from './components/VolumeAnalytics.tsx'
import WalletAnalysis from './components/WalletAnalysis.tsx'

function App() {
  const [activeTab, setActiveTab] = useState<'volume' | 'wallet'>('volume')

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
      <header className="bg-white dark:bg-gray-800 shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Cypher Blockchain Analytics
          </h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Visualize and analyze crypto card load patterns on the Base chain
          </p>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="mb-6">
          <div className="border-b border-gray-200 dark:border-gray-700">
            <nav className="-mb-px flex space-x-8">
              <button
                className={`${
                  activeTab === 'volume'
                    ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
                onClick={() => setActiveTab('volume')}
              >
                USD Load Volume
              </button>
              <button
                className={`${
                  activeTab === 'wallet'
                    ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
                onClick={() => setActiveTab('wallet')}
              >
                Wallet Analysis
              </button>
            </nav>
          </div>
        </div>

        {activeTab === 'volume' ? <VolumeAnalytics /> : <WalletAnalysis />}
      </main>
    </div>
  )
}

export default App
