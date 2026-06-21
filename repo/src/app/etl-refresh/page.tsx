'use client';

import { useState, useEffect } from 'react';
import { ArrowPathIcon, CheckCircleIcon, ExclamationTriangleIcon, ClockIcon } from '@heroicons/react/24/outline';

interface ETLStatus {
  status: 'idle' | 'running' | 'completed' | 'failed';
  message: string;
  timestamp?: string;
  details?: string;
}

interface DataStatus {
  hasData: boolean;
  latestFile?: string;
  fileTimestamp?: string;
  fileSize?: number;
  lastModified?: string;
  ageDescription?: string;
  totalFiles?: number;
  dataDirectory?: string;
  message?: string;
}

interface ParkAvailability {
  park_id: string;
  park_name: string;
  total_slots: number;
  available_slots: number;
  last_updated: string;
}

export default function ETLRefreshPage() {
  const [etlStatus, setEtlStatus] = useState<ETLStatus>({
    status: 'idle',
    message: 'Ready to refresh data'
  });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [dataStatus, setDataStatus] = useState<DataStatus | null>(null);
  const [parkAvailability, setParkAvailability] = useState<ParkAvailability[]>([]);
  const [beforeRefreshData, setBeforeRefreshData] = useState<ParkAvailability[]>([]);

  // Fetch initial data status when component mounts
  useEffect(() => {
    fetchDataStatus();
    fetchParkAvailability();
  }, []);

  const fetchDataStatus = async () => {
    try {
      const response = await fetch('/api/etl-status');
      if (response.ok) {
        const status = await response.json();
        setDataStatus(status);
      }
    } catch (error) {
      console.error('Failed to fetch data status:', error);
    }
  };

  const fetchParkAvailability = async () => {
    try {
      const response = await fetch('/api/park-availability');
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setParkAvailability(data.parks);
        }
      }
    } catch (error) {
      console.error('Failed to fetch park availability:', error);
    }
  };

  const handleRefreshData = async () => {
    if (isRefreshing) return;

    // Capture current data before refresh
    setBeforeRefreshData([...parkAvailability]);

    setIsRefreshing(true);
    setEtlStatus({
      status: 'running',
      message: 'Starting ETL refresh process...',
      timestamp: new Date().toLocaleString()
    });

    try {
      const response = await fetch('/api/etl-refresh', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      
      if (result.success) {
        setEtlStatus({
          status: 'completed',
          message: 'Data refresh completed successfully!',
          timestamp: new Date().toLocaleString(),
          details: result.details || result.message
        });
        
        // Refresh the data status to show updated information
        setTimeout(() => {
          fetchDataStatus();
          fetchParkAvailability(); // Refresh park availability data
        }, 1000); // Wait a bit for the ETL to complete
      } else {
        throw new Error(result.error || 'Unknown error occurred');
      }
    } catch (error) {
      setEtlStatus({
        status: 'failed',
        message: 'Data refresh failed',
        timestamp: new Date().toLocaleString(),
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  const getStatusIcon = () => {
    switch (etlStatus.status) {
      case 'running':
        return <ClockIcon className="h-6 w-6 text-blue-500 animate-spin" />;
      case 'completed':
        return <CheckCircleIcon className="h-6 w-6 text-green-500" />;
      case 'failed':
        return <ExclamationTriangleIcon className="h-6 w-6 text-red-500" />;
      default:
        return <ArrowPathIcon className="h-6 w-6 text-gray-400" />;
    }
  };

  const getStatusColor = () => {
    switch (etlStatus.status) {
      case 'running':
        return 'border-blue-200 bg-blue-50';
      case 'completed':
        return 'border-green-200 bg-green-50';
      case 'failed':
        return 'border-red-200 bg-red-50';
      default:
        return 'border-gray-200 bg-gray-50';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex justify-between items-center mb-4">
            <a 
              href="/" 
              className="text-blue-600 hover:text-blue-800 underline flex items-center"
            >
              ← Back to Home
            </a>
            <div></div> {/* Spacer for centering */}
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Data Refresh & ETL Pipeline
          </h1>
          <p className="text-lg text-gray-600">
            Manually scrape fresh data from NYC Parks and process it through the ETL pipeline
          </p>
        </div>

        {/* Main Content */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <div className="text-center">
            <button
              onClick={handleRefreshData}
              disabled={isRefreshing}
              className={`
                inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm
                ${isRefreshing 
                  ? 'bg-gray-400 cursor-not-allowed' 
                  : 'bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500'
                }
                text-white transition-colors duration-200
              `}
            >
              <ArrowPathIcon className={`h-5 w-5 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
              {isRefreshing ? 'Refreshing Data...' : 'Refresh Data Now'}
            </button>
          </div>

                  {/* Status Display */}
        <div className={`mt-6 p-4 border rounded-lg ${getStatusColor()}`}>
          <div className="flex items-center">
            {getStatusIcon()}
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-900">
                {etlStatus.message}
              </p>
              {etlStatus.timestamp && (
                <p className="text-xs text-gray-500 mt-1">
                  Last updated: {etlStatus.timestamp}
                </p>
              )}
              {etlStatus.details && (
                <p className="text-sm text-gray-700 mt-2">
                  {etlStatus.details}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Current Data Status */}
        {dataStatus && (
          <div className="mt-6 p-4 border border-gray-200 rounded-lg bg-gray-50">
            <h3 className="text-lg font-medium text-gray-900 mb-3">
              Current Data Status
            </h3>
            {dataStatus.hasData ? (
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm font-medium text-gray-600">Latest File:</span>
                  <span className="text-sm text-gray-900">{dataStatus.latestFile}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm font-medium text-gray-600">File Age:</span>
                  <span className="text-sm text-gray-900">{dataStatus.ageDescription}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm font-medium text-gray-600">File Size:</span>
                  <span className="text-sm text-gray-900">
                    {dataStatus.fileSize ? `${(dataStatus.fileSize / 1024).toFixed(1)} KB` : 'Unknown'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm font-medium text-gray-600">Total Files:</span>
                  <span className="text-sm text-gray-900">{dataStatus.totalFiles}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm font-medium text-gray-600">Last Modified:</span>
                  <span className="text-sm text-gray-900">
                    {dataStatus.lastModified ? new Date(dataStatus.lastModified).toLocaleString() : 'Unknown'}
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-600">{dataStatus.message}</p>
            )}
            <button
              onClick={fetchDataStatus}
              className="mt-3 text-sm text-blue-600 hover:text-blue-800 underline"
            >
              Refresh Status
            </button>
          </div>
        )}
      </div>

        {/* Information Panel */}
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            What happens during data refresh?
          </h2>
          <div className="space-y-4">
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                  <span className="text-blue-600 font-semibold text-sm">1</span>
                </div>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-gray-900">Data Scraping</h3>
                <p className="text-sm text-gray-600">
                  Scrapes current tennis court availability from NYC Parks website
                </p>
              </div>
            </div>
            
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                  <span className="text-blue-600 font-semibold text-sm">2</span>
                </div>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-gray-900">CSV Generation</h3>
                <p className="text-sm text-gray-600">
                  Creates a new CSV file with timestamp in the data directory
                </p>
              </div>
            </div>
            
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                  <span className="text-blue-600 font-semibold text-sm">3</span>
                </div>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-gray-900">ETL Processing</h3>
                <p className="text-sm text-gray-600">
                  Automatically processes the new CSV file through the ETL pipeline
                </p>
              </div>
            </div>
            
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                  <span className="text-blue-600 font-semibold text-sm">4</span>
                </div>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-gray-900">Database Update</h3>
                <p className="text-sm text-gray-600">
                  New availability data is loaded into the database and ready for use
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Warning */}
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mt-6">
          <div className="flex">
            <ExclamationTriangleIcon className="h-5 w-5 text-yellow-400" />
            <div className="ml-3">
              <h3 className="text-sm font-medium text-yellow-800">
                Important Notes
              </h3>
              <div className="mt-2 text-sm text-yellow-700">
                <ul className="list-disc list-inside space-y-1">
                  <li>This process may take several minutes to complete</li>
                  <li>New data will replace existing availability information</li>
                  <li>Only run this when you need fresh data outside the hourly schedule</li>
                  <li>The automated hourly ETL process will continue to run normally</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Park Availability Comparison Table */}
        <div className="bg-white rounded-lg shadow-lg p-6 mt-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-gray-900">
              Park Availability Comparison
            </h2>
            <button
              onClick={fetchParkAvailability}
              className="text-sm text-blue-600 hover:text-blue-800 underline"
            >
              Refresh Data
            </button>
          </div>
          
          {parkAvailability.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Park Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Total Slots
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Available Slots (Before)
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Available Slots (After)
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Change
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Last Updated
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {parkAvailability.map((park) => {
                    const beforeData = beforeRefreshData.find(b => b.park_id === park.park_id);
                    const beforeCount = beforeData?.available_slots || 0;
                    const afterCount = park.available_slots;
                    const change = afterCount - beforeCount;
                    
                    return (
                      <tr key={park.park_id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {park.park_name}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {park.total_slots}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {beforeCount}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {afterCount}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                            change > 0 
                              ? 'bg-green-100 text-green-800' 
                              : change < 0 
                                ? 'bg-red-100 text-red-800' 
                                : 'bg-gray-100 text-gray-800'
                          }`}>
                            {change > 0 ? `+${change}` : change < 0 ? change : '0'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {park.last_updated ? new Date(park.last_updated).toLocaleString() : 'Never'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-gray-500">No park availability data found</p>
            </div>
          )}
          
          <div className="mt-4 text-sm text-gray-600">
            <p><strong>Note:</strong> This table shows the comparison between available slots before and after the data refresh.</p>
            <p>Green numbers indicate increased availability, red numbers indicate decreased availability.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
