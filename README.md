# MyTickerTracker

MyTickerTracker is a React + Vite app for tracking stock prices and generating threshold-based alerts.

## Local setup

1. Install dependencies:

	npm install

2. Copy environment variables:

	copy .env.example .env

3. Set required variables in .env:

	- VITE_FINNHUB_API_KEY: your Finnhub API token
	- VITE_SMS_API_URL: optional SMS endpoint URL (for example, https://your-backend.onrender.com/send-sms)

4. Run dev server:

	npm run dev

## Render deployment

Deploy this project as a Static Site on Render.

A Render Blueprint is included at render.yaml.

- Build command: npm ci && npm run build
- Publish directory: dist

Set these environment variables in Render:

- VITE_FINNHUB_API_KEY (required)
- VITE_SMS_API_URL (optional)

## Notes

- Do not hardcode API keys in source files.
- Any variable prefixed with VITE_ is exposed to the browser at build time.
- For sensitive API operations, use a backend proxy instead of direct browser calls.
