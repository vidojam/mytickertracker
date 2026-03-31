import { useState, useEffect } from 'react';

const LOCAL_KEY = 'mytickertracker-settings-v3';
const HISTORY_KEY = 'mytickertracker-history-v3';

function App() {
  const [symbol, setSymbol] = useState('');
  const [input, setInput] = useState('');
  const [price, setPrice] = useState(null);
  const [history, setHistory] = useState([]); // [{date, price}]
  const [alert, setAlert] = useState(null);
  const [threshold, setThreshold] = useState(5);

  // Load settings and history from localStorage
  useEffect(() => {
    const saved = JSON.parse(localStorage.getItem(LOCAL_KEY));
    if (saved) {
      setSymbol(saved.symbol || '');
      setInput(saved.symbol || '');
      setThreshold(saved.threshold || 5);
    }
    const hist = JSON.parse(localStorage.getItem(HISTORY_KEY));
    if (hist) setHistory(hist);
  }, []);

  // Save settings and history to localStorage
  useEffect(() => {
    localStorage.setItem(
      LOCAL_KEY,
      JSON.stringify({ symbol, threshold })
    );
  }, [symbol, threshold]);
  useEffect(() => {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  }, [history]);

  // Fetch price when symbol changes or every 10s
  useEffect(() => {
    if (!symbol) return;
    async function fetchPrice() {
      // Simulate API call
      const fakePrice = Math.round(100 + Math.random() * 1000) / 10;
      setPrice(fakePrice);
      // Save to history (simulate one entry per day, but here every 10s for demo)
      setHistory(prev => {
        const today = new Date().toISOString().slice(0, 10);
        const filtered = prev.filter(h => h.date !== today);
        return [...filtered, { date: today, price: fakePrice }].slice(-7);
      });
    }
    fetchPrice();
    const interval = setInterval(fetchPrice, 10000);
    return () => clearInterval(interval);
  }, [symbol]);

  // Auto-detect day range for alert
  useEffect(() => {
    if (!symbol || history.length < 2) {
      setAlert(null);
      return;
    }
    let found = null;
    for (let days = 1; days <= 7; days++) {
      if (history.length < days + 1) break;
      const now = history[history.length - 1];
      const past = history[history.length - 1 - days];
      if (!now || !past) continue;
      const change = ((now.price - past.price) / past.price) * 100;
      if (change >= threshold) {
        found = { days, change: change.toFixed(2), threshold, price: now.price };
        break;
      }
    }
    setAlert(found);
  }, [history, threshold, symbol]);

  function handleSubmit(e) {
    e.preventDefault();
    setSymbol(input.trim().toUpperCase());
    setHistory([]); // reset history for new symbol
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <h1 className="text-3xl font-bold mb-4">MyTickerTracker</h1>
      <form onSubmit={handleSubmit} className="flex gap-2 mb-4">
        <input
          className="border rounded px-2 py-1 text-lg"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Enter stock symbol (e.g. AAPL)"
        />
        <button className="bg-blue-600 text-white px-4 py-1 rounded" type="submit">
          Track
        </button>
      </form>
      {symbol && (
        <div className="mb-4 text-xl">
          <span className="font-semibold">{symbol}</span>: {price !== null ? <span>${price}</span> : 'Loading...'}
        </div>
      )}
      <div className="flex gap-4 mb-4">
        <div>
          <label className="block text-sm">Threshold (%)</label>
          <select
            className="border rounded px-2 py-1 w-24"
            value={threshold}
            onChange={e => setThreshold(Number(e.target.value))}
          >
            {[5,10].map(t => (
              <option key={t} value={t}>{t}%</option>
            ))}
          </select>
        </div>
      </div>
      {alert && (
        <div
          className="fixed top-0 left-0 w-full text-center py-3 text-lg font-bold z-50 bg-red-500 text-white"
        >
          {symbol} {alert.days} day alert - Increase {alert.threshold}% or more. Price now ${alert.price}
        </div>
      )}
      <p className="mt-8 text-gray-500 text-sm">Stock data updates every 10 seconds. Alerts and settings are saved. (Demo: 1 day = 10s)</p>
    </div>
  );
}

export default App
