# Cypher Blockchain Analytics

A web application that visualizes and analyzes crypto card load patterns on the Base chain, focusing on transaction volume and wallet interactions.

## Features

- **USD Load Volume Visualization**: Daily, weekly, and monthly USD load volume based on tokens received by the Cypher master wallet on Base chain.
- **User Wallet Analysis**: For any given wallet address, shows their top 10 counterparties based on transaction count, with protocol identification.
- **Blockchain Data Caching**: Efficient caching system using both local file storage and Vercel Blob Storage for optimized performance.

## Tech Stack

- **Frontend**: React with TypeScript
- **Styling**: Tailwind CSS
- **Charts**: Chart.js with react-chartjs-2
- **Blockchain Interaction**: Alchemy SDK for Base Mainnet
- **Date Handling**: date-fns
- **Caching**: File-based (local) and Vercel Blob Storage (production)
- **API**: Node.js serverless functions

## Setup Instructions

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd cypher-th/cyph
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   Create a `.env` file in the root directory with the following variables:
   ```
   ALCHEMY_API_KEY=your_alchemy_api_key
   CYPHER_MASTER_WALLET=0xcCCd218A58B53C67fC17D8C87Cb90d83614e35fD
   PRELOAD_API_KEY=your_preload_api_key
   BLOB_READ_WRITE_TOKEN=your_vercel_blob_token (for production)
   ```

4. Run the development server:
   ```bash
   npm run dev
   ```
   This will start both the frontend and API server.

5. Build for production:
   ```bash
   npm run build
   ```

## Deployment on Vercel

This project is optimized for deployment on Vercel:

1. Push your code to GitHub
2. Go to [Vercel](https://vercel.com) and sign up/login
3. Click "New Project" and import your GitHub repository
4. Configure the following environment variables in the Vercel project settings:
   - `ALCHEMY_API_KEY`: Your Alchemy API key for Base Mainnet
   - `CYPHER_MASTER_WALLET`: The wallet address to analyze (0xcCCd218A58B53C67fC17D8C87Cb90d83614e35fD)
   - `PRELOAD_API_KEY`: A secret key to secure the preload cache API endpoint
   - `BLOB_READ_WRITE_TOKEN`: Vercel Blob Storage token for caching transaction data
5. Click "Deploy"

The project uses Vercel's serverless functions for the API endpoints and Vercel Blob Storage for caching transaction data.

## Assumptions and Tradeoffs

- **Data Timeframe**: The application focuses on transaction data from April and May 2025 on the Base chain.
- **Caching Strategy**: To optimize performance and minimize API calls, transaction data is cached using a hybrid approach:
  - Local development: File-based caching
  - Production: Vercel Blob Storage
- **Protocol Identification**: A hardcoded lookup table is used to identify common protocols and exchanges on Base chain.
- **Transaction Processing**: The application processes blockchain transactions in batches with pagination to handle API limitations.
- **Block Range Optimization**: Transactions are fetched using optimized block ranges divided into weekly chunks to ensure complete data coverage.
- **API Fallbacks**: When the Alchemy API has issues or rate limits are reached, the application gracefully handles errors and provides appropriate feedback.

## Future Improvements

- Add support for more token types beyond the current set (USDC, DAI, USDT, WETH)
- Implement real-time updates for transaction data
- Enhance the wallet analysis with more detailed metrics and visualizations
- Add user authentication to save favorite wallets for analysis
- Expand the protocol identification database to cover more DeFi protocols on Base
- Implement cross-chain analysis to compare activity across different L2 solutions
