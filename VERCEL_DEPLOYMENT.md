# Deploying to Vercel

This document provides instructions for deploying the Cypher Blockchain Analytics application to Vercel.

## Prerequisites

1. A Vercel account
2. The Vercel CLI installed (`npm i -g vercel`)
3. Git repository with your code

## Setup Steps

### 1. Set up Environment Variables

In the Vercel dashboard, add the following environment variables:

- `PRELOAD_API_KEY`: A secure random string to protect the preload cache endpoint

You can generate a secure key with:
```bash
openssl rand -base64 32
```

### 2. Deploy to Vercel

#### Option 1: Using the Vercel Dashboard

1. Import your GitHub repository in the Vercel dashboard
2. Configure the project settings:
   - Build Command: `npm run build`
   - Output Directory: `dist`
   - Install Command: `npm install`
3. Deploy the project

#### Option 2: Using the Vercel CLI

1. Log in to Vercel:
   ```bash
   vercel login
   ```

2. Deploy from your project directory:
   ```bash
   cd /path/to/cypher-th/cyph
   vercel
   ```

3. Follow the prompts to configure your project

### 3. Set up Cron Jobs

The `vercel.json` file already includes configuration for a cron job that runs hourly to preload the cache. This ensures that the cache is always fresh and ready for user requests.

To verify that the cron job is set up correctly:

1. Go to your project in the Vercel dashboard
2. Navigate to the "Settings" tab
3. Select "Cron Jobs" from the sidebar
4. Confirm that the `/api/preloadCache` job is scheduled to run hourly

## Testing the Deployment

After deployment, you can test the application:

1. Visit your Vercel deployment URL
2. The application should load and display blockchain data
3. You can manually trigger a cache preload by visiting:
   ```
   https://your-vercel-url.vercel.app/api/preloadCache
   ```
   Note: In production, this endpoint is protected by the `PRELOAD_API_KEY` you set up

## Troubleshooting

If you encounter issues with the deployment:

1. Check the Vercel deployment logs for errors
2. Verify that all environment variables are set correctly
3. Test the cache preloading endpoint with the correct API key:
   ```bash
   curl -H "x-api-key: YOUR_PRELOAD_API_KEY" https://your-vercel-url.vercel.app/api/preloadCache
   ```

## Architecture Notes

The application uses a hybrid approach for caching:

- In development: Cache files are stored in the local `cache` directory
- In Vercel: Cache files are stored in the `/tmp` directory, which persists between function invocations for a limited time

The cron job ensures that the cache is regularly refreshed, even in the serverless environment of Vercel.
