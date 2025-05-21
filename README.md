# Cypher Blockchain Analytics

A web application that visualizes and analyzes crypto card load patterns on the Base chain.

## Features

- **USD Load Volume Visualization**: Daily, weekly, and monthly USD load volume based on tokens received by the Cypher master wallet.
- **User Wallet Analysis**: For any given wallet address, shows their top 10 counterparties based on transaction count, with protocol identification.

## Tech Stack

- **Frontend**: React with TypeScript
- **Styling**: Tailwind CSS
- **Charts**: Chart.js with react-chartjs-2
- **Blockchain Interaction**: viem
- **Date Handling**: date-fns

## Setup Instructions

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd cypher-th
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Run the development server:
   ```bash
   npm run dev
   ```

4. Build for production:
   ```bash
   npm run build
   ```

## Deployment on Vercel

This project is optimized for deployment on Vercel:

1. Push your code to GitHub
2. Go to [Vercel](https://vercel.com) and sign up/login
3. Click "New Project" and import your GitHub repository
4. Vercel will automatically detect it's a Vite React project
5. Configure project settings (or use defaults)
6. Click "Deploy"

### Adding Backend Functionality

To add backend functionality to this project on Vercel:

1. Create an `/api` directory at the root of your project
2. Add serverless function files (e.g., `api/getVolumeData.js`)
3. Vercel will automatically deploy these as API endpoints

Example API endpoint:
```javascript
// api/getVolumeData.js
export default async function handler(req, res) {
  try {
    // Real implementation to fetch blockchain data
    // Use viem to interact with Base chain
    // Query Aerodrome Finance for historical prices
    
    // Return data
    res.status(200).json({ data: [...] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
```

## Assumptions and Tradeoffs

- **Mock Data**: For development purposes, the application uses mock data to simulate blockchain transactions and price data.
- **Historical Prices**: In a production environment, the application would fetch historical token prices from Aerodrome Finance Smart Contracts on Base Chain.
- **Caching**: The application is designed to cache historical price data to minimize blockchain queries.
- **Protocol Identification**: A hardcoded lookup table is used to identify common protocols and exchanges.

## Future Improvements

- Implement real blockchain data fetching using viem
- Add more detailed transaction analysis
- Implement real-time updates
- Add user authentication
