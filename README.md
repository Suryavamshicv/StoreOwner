<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/bc38f7e6-44c1-45b1-85c9-fb6dd65ae3a1

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Deploy to Vercel

Import this repository into Vercel. The included `vercel.json` builds the Vite client and routes `/api/*` to the Express API function.

Add these Vercel Environment Variables for the Production, Preview, and Development environments:

- `DATABASE_URL`
- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`
- `GEMINI_API_KEY` (if AI features are used)

Use Razorpay Test keys for Preview deployments and Live keys only for Production. Basic is ₹100/month and Professional is ₹200/month.
