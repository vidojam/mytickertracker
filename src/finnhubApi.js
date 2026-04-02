// Finnhub API utility
// DO NOT commit your API keys to public repositories!

const FINNHUB_API_KEY = "d777lfhr01qp6afkhcj0d777lfhr01qp6afkhcjg";
const FINNHUB_API_SECRET = "d777lfhr01qp6afkhckg";
const BASE_URL = "https://finnhub.io/api/v1";

/**
 * Fetch data from Finnhub API
 * @param {string} endpoint - API endpoint (e.g., "/quote?symbol=AAPL")
 * @param {Object} [params] - Additional query parameters
 * @returns {Promise<any>} - API response JSON
 */
export async function fetchFinnhub(endpoint, params = {}) {
  const url = new URL(BASE_URL + endpoint);
  url.searchParams.append("token", FINNHUB_API_KEY);
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.append(key, value);
  });

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`Finnhub API error: ${response.status}`);
  }
  return response.json();
}

// Example usage:
// fetchFinnhub("/quote", { symbol: "AAPL" }).then(console.log);
