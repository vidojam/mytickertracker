import { useState, useEffect } from 'react';
import { fetchFinnhub } from './finnhubApi';

const LOCAL_KEY = 'mytickertracker-settings-v4';
const HISTORY_KEY = 'mytickertracker-history-v4';

function App() {
  const [symbol, setSymbol] = useState('');
  const [input, setInput] = useState('');
  const [prices, setPrices] = useState({}); // { SYMBOL: price }
  const [histories, setHistories] = useState({}); // { SYMBOL: [{date, price}] }
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
    const hists = JSON.parse(localStorage.getItem(HISTORY_KEY));
    if (hists) setHistories(hists);
  }, []);

  // Save settings and history to localStorage
  useEffect(() => {
    localStorage.setItem(
      LOCAL_KEY,
      JSON.stringify({ symbol, threshold })
    );
  }, [symbol, threshold]);
  useEffect(() => {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(histories));
  }, [histories]);

  // Fetch price when symbol changes or every 10s
  useEffect(() => {
    if (!symbol) return;
    async function fetchPrice() {
      try {
        const data = await fetchFinnhub('/quote', { symbol });
        const realPrice = data.c;
        setPrices(prev => ({ ...prev, [symbol]: realPrice }));
        setHistories(prev => {
          const today = new Date().toISOString().slice(0, 10);
          const prevHist = prev[symbol] || [];
          const filtered = prevHist.filter(h => h.date !== today);
          return {
            ...prev,
            [symbol]: [...filtered, { date: today, price: realPrice }].slice(-7)
          };
        });
      } catch (err) {
        setPrices(prev => ({ ...prev, [symbol]: null }));
      }
    }
    fetchPrice();
    const interval = setInterval(fetchPrice, 10000);
    return () => clearInterval(interval);
  }, [symbol]);

  // Auto-detect day range for alert
  useEffect(() => {
    const hist = histories[symbol] || [];
    if (!symbol || hist.length < 2) {
      setAlert(null);
      return;
    }
    let found = null;
    for (let days = 1; days <= 7; days++) {
      if (hist.length < days + 1) break;
      const now = hist[hist.length - 1];
      const past = hist[hist.length - 1 - days];
      if (!now || !past) continue;
      const change = ((now.price - past.price) / past.price) * 100;
      if (change >= threshold) {
        found = { days, change: change.toFixed(2), threshold, price: now.price };
        break;
      }
    }
    setAlert(found);
  }, [histories, threshold, symbol]);

  function handleSubmit(e) {
    e.preventDefault();
    const newSymbol = input.trim().toUpperCase();
    if (!newSymbol) return;
    setSymbol(newSymbol);
    setInput('');
    // Don't clear histories, just add new symbol
  }

  function handleDelete(sym) {
    setHistories(prev => {
      const copy = { ...prev };
      delete copy[sym];
      return copy;
    });
    setPrices(prev => {
      const copy = { ...prev };
      delete copy[sym];
      return copy;
    });
    // If deleting the current symbol, clear it
    if (symbol === sym) setSymbol('');
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <h1 className="text-6xl font-bold mb-4" style={{ fontSize: '4em' }}>MyTickerTracker</h1>
      <form onSubmit={handleSubmit} className="flex gap-2 mb-4" style={{ fontSize: '2em' }}>
        <input
          className="border rounded px-2 py-1"
          style={{ fontSize: '2em' }}
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Enter stock symbol (e.g. AAPL)"
        />
        <button className="bg-blue-600 text-white px-4 py-1 rounded" style={{ fontSize: '2em' }} type="submit">
          Track
        </button>
      </form>
      {Object.keys(histories).length > 0 && (
        <div className="mb-8 w-full flex flex-col items-center">
          {Object.entries(histories).map(([sym, hist]) => (
            <div key={sym} className="mb-8 w-full flex flex-col items-center">
              <div className="mb-4 text-3xl flex items-center gap-4">
                <span className="font-semibold">{sym}</span>: {prices[sym] !== undefined && prices[sym] !== null ? <span>${prices[sym]}</span> : 'Loading...'}
                <button onClick={() => handleDelete(sym)} className="ml-4 px-3 py-1 bg-red-600 text-white rounded text-lg" style={{ fontSize: '0.7em' }}>Delete</button>
              </div>
              {hist.length > 0 && (
                <table className="table-auto border-collapse w-auto text-xl" style={{ fontSize: '1em', minWidth: 400 }}>
                  <thead>
                    <tr>
                      <th className="border px-4 py-2">Date</th>
                      <th className="border px-4 py-2">Price</th>
                      <th className="border px-4 py-2">Change</th>
                      <th className="border px-4 py-2"># Days</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hist.map((h, idx) => {
                      const prev = idx > 0 ? hist[idx - 1] : null;
                      const change = prev && prev.price ? (((h.price - prev.price) / prev.price) * 100).toFixed(2) : '-';
                      return (
                        <tr key={h.date}>
                          <td className="border px-4 py-2">{h.date}</td>
                          <td className="border px-4 py-2">${h.price}</td>
                          <td className="border px-4 py-2">{change !== '-' ? `${change}%` : '-'}</td>
                          <td className="border px-4 py-2">{idx}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-4 mb-4" style={{ fontSize: '2em' }}>
        <div>
          <label className="block" style={{ fontSize: '1em' }}>Threshold (%)</label>
          <select
            className="border rounded px-2 py-1 w-24"
            style={{ fontSize: '2em' }}
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
          className="fixed top-0 left-0 w-full text-center py-3 text-2xl font-bold z-50 bg-red-500 text-white"
        >
          {symbol} {alert.days} day alert - Increase {alert.threshold}% or more. Price now ${alert.price}
        </div>
      )}
      <p className="mt-8 text-gray-500" style={{ fontSize: '2em' }}>Stock data updates every 10 seconds. Alerts and settings are saved. (Demo: 1 day = 10s)</p>
    </div>
  );
}

export default App
