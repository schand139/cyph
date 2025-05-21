import { useState, useEffect } from 'react';
import { 
  Chart as ChartJS, 
  CategoryScale, 
  LinearScale, 
  PointElement, 
  LineElement, 
  Title, 
  Tooltip, 
  Legend,
  BarElement
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { format, parseISO } from 'date-fns';
import { generateMockVolumeData } from '../utils/dataProcessing';
import type { VolumeData, TimePeriod } from '../types';

// Register ChartJS components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend
);

const VolumeAnalytics = () => {
  const [selectedPeriod, setSelectedPeriod] = useState<TimePeriod>('daily');
  const [volumeData, setVolumeData] = useState<VolumeData[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        // In a real app, we would fetch real data from the blockchain
        // For now, we'll use mock data
        const mockData = generateMockVolumeData();
        setVolumeData(mockData[selectedPeriod]);
      } catch (error) {
        console.error('Error fetching volume data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [selectedPeriod]);

  // Format data for the chart
  const chartData = {
    labels: volumeData.map(item => {
      const date = parseISO(item.date);
      return selectedPeriod === 'daily' 
        ? format(date, 'MMM d') 
        : selectedPeriod === 'weekly'
          ? `Week of ${format(date, 'MMM d')}`
          : format(date, 'MMMM yyyy');
    }),
    datasets: [
      {
        label: 'USD Volume',
        data: volumeData.map(item => item.volume),
        backgroundColor: 'rgba(75, 192, 192, 0.2)',
        borderColor: 'rgba(75, 192, 192, 1)',
        borderWidth: 1,
        tension: 0.4,
      },
    ],
  };

  // Chart options
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
      },
      title: {
        display: true,
        text: `${selectedPeriod.charAt(0).toUpperCase() + selectedPeriod.slice(1)} USD Load Volume (2025)`,
      },
      tooltip: {
        callbacks: {
          label: function(context: any) {
            let label = context.dataset.label || '';
            if (label) {
              label += ': ';
            }
            if (context.parsed.y !== null) {
              label += new Intl.NumberFormat('en-US', { 
                style: 'currency', 
                currency: 'USD',
                minimumFractionDigits: 0,
                maximumFractionDigits: 0
              }).format(context.parsed.y);
            }
            return label;
          }
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          callback: function(value: any) {
            return new Intl.NumberFormat('en-US', { 
              style: 'currency', 
              currency: 'USD',
              minimumFractionDigits: 0,
              maximumFractionDigits: 0
            }).format(value);
          }
        }
      }
    }
  };

  // Calculate total volume
  const totalVolume = volumeData.reduce((sum, item) => sum + item.volume, 0);
  const averageVolume = volumeData.length > 0 ? totalVolume / volumeData.length : 0;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
      <div className="flex flex-col md:flex-row justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            USD Load Volume Analytics (2025)
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Visualize the total USD load volume for Cypher's master wallet
          </p>
        </div>
        
        {/* Time Period Tabs */}
        <div className="mt-4 md:mt-0">
          <div className="border-b border-gray-200 dark:border-gray-700">
            <nav className="-mb-px flex space-x-6">
              <button
                className={`${
                  selectedPeriod === 'daily'
                    ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                } whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm`}
                onClick={() => setSelectedPeriod('daily')}
              >
                Daily
              </button>
              <button
                className={`${
                  selectedPeriod === 'weekly'
                    ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                } whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm`}
                onClick={() => setSelectedPeriod('weekly')}
              >
                Weekly
              </button>
              <button
                className={`${
                  selectedPeriod === 'monthly'
                    ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                } whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm`}
                onClick={() => setSelectedPeriod('monthly')}
              >
                Monthly
              </button>
            </nav>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Total Volume</h3>
          <p className="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">
            {new Intl.NumberFormat('en-US', { 
              style: 'currency', 
              currency: 'USD',
              minimumFractionDigits: 0,
              maximumFractionDigits: 0
            }).format(totalVolume)}
          </p>
        </div>
        <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Average {selectedPeriod} Volume</h3>
          <p className="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">
            {new Intl.NumberFormat('en-US', { 
              style: 'currency', 
              currency: 'USD',
              minimumFractionDigits: 0,
              maximumFractionDigits: 0
            }).format(averageVolume)}
          </p>
        </div>
      </div>

      <div className="h-96">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500"></div>
          </div>
        ) : (
          <Line data={chartData} options={chartOptions} />
        )}
      </div>

      <div className="mt-6">
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-3">Volume Data</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Date
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Volume (USD)
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {volumeData.slice(0).reverse().map((item, index) => (
                <tr key={index} className={index % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50 dark:bg-gray-700'}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                    {item.date}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                    {new Intl.NumberFormat('en-US', { 
                      style: 'currency', 
                      currency: 'USD',
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 0
                    }).format(item.volume)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default VolumeAnalytics;
