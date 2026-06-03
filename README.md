# Product Comparison Dashboard

A secure, interactive dashboard for sharing product comparisons with clients. Shows your products vs competitor products with real-time cost calculations.

## Files

- `backend.js` - Node.js server (keeps your API token safe)
- `dashboard.html` - Interactive client dashboard
- `package.json` - Dependencies
- `.env.example` - Environment template

## Setup

### Step 1: Create Backend Token File

1. Rename `.env.example` to `.env`
2. Open `.env` and paste your Airtable API token:
   ```
   AIRTABLE_API_TOKEN=your_token_here
   PORT=3000
   ```

### Step 2: Install Dependencies

```bash
npm install
```

### Step 3: Run Locally

```bash
npm start
```

The server will run on `http://localhost:3000`

## Deploy to Production

### Option A: Deploy on Render (Recommended - Free)

1. Create a free account at https://render.com
2. Click "New +" → "Web Service"
3. Connect your GitHub repo (or upload files)
4. Set up:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
5. Add Environment Variables:
   - `AIRTABLE_API_TOKEN` = your token
   - `PORT` = 3000
6. Deploy!

### Option B: Deploy on Replit

1. Create account at https://replit.com
2. Create new Replit project
3. Upload `backend.js`, `package.json`, and `.env`
4. Click "Run" - it will install dependencies and start
5. Share the generated URL with clients

### Option C: Deploy on Railway

1. Create account at https://railway.app
2. Connect your GitHub
3. Add environment variables (AIRTABLE_API_TOKEN)
4. Deploy and get your public URL

## How It Works

1. **Backend** (backend.js):
   - Runs on your server
   - Keeps your API token secret
   - Fetches data from Airtable
   - Sends data to dashboard

2. **Dashboard** (dashboard.html):
   - Clients open this in their browser
   - Shows all products with images
   - Clients click "Select" to choose products
   - Real-time cost calculations update
   - Shows total project savings at bottom

## Sharing with Clients

Once deployed, share this URL with clients:
```
https://your-deployed-url.com/dashboard.html
```

(Replace with your actual URL from Render/Replit/Railway)

## Features

✅ Secure - API token never exposed to clients
✅ Real-time - Costs update instantly when selections change
✅ Mobile-friendly - Works on phones and tablets
✅ Beautiful - Professional gradient design
✅ Shows:
  - Product images (yours vs competitor)
  - Pricing comparison
  - Cost differences
  - Savings percentage
  - Project total savings

## Troubleshooting

**Products not loading?**
- Check your API token is correct in `.env`
- Make sure backend is running (`npm start`)
- Check browser console for errors (F12)

**CORS errors?**
- Backend is set up with CORS - should work
- If still issues, check backend.js is running

**Images not showing?**
- Make sure Airtable attachment fields have images
- Check field names match: "My Product Photos", "Competitor Product Images"

## Field Mapping

The dashboard expects these Airtable fields:
- `My Product Suggestion` - Product name
- `My Retail Price + GST` - Your price
- `Competitor Quoted Price + GST` - Competitor price
- `Cost Difference` - Price difference (calculated)
- `Savings Percentage` - Savings % (calculated)
- `My Product Photos` - Your product images
- `Competitor Product Images` - Competitor images
- `My Supplier` - Your supplier name
- `Competitor Product Request` - Original product name
- `Competitor Supplier Name` - Competitor supplier
- `Size` - Product size/dimensions

All fields are optional - missing fields show "N/A" or no image.

## Support

If you run into issues:
1. Check backend is running and accessible
2. Verify API token is correct
3. Check Airtable field names match exactly
4. Open browser console (F12) for error messages
