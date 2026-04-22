import { useState, useEffect } from 'react';
import { fetchFinnhub } from './finnhubApi';
// ...existing code...
function App() {
  function handleTestAlert() {
    // Use the most recently added symbol if available
    const symbolList = Object.keys(histories);
    const testSymbol = symbolList.length > 0 ? symbolList[symbolList.length - 1] : symbol;
    if (!testSymbol) return;
    setHistories(prev => {
      const today = new Date().toISOString().slice(0, 10);
      const prevHist = prev[testSymbol] || [];
      let basePrice = 100;
      if (prevHist.length > 0) {
        basePrice = prevHist[prevHist.length - 1].price;
      }
      const fakePrice = +(basePrice * 1.05).toFixed(2);
      const filtered = prevHist.filter(h => h.date !== today);
      return {
        ...prev,
        [testSymbol]: [...filtered, { date: today, price: fakePrice }]
      };
    });
    setPrices(prev => ({ ...prev, [testSymbol]: +(prev[testSymbol] ? prev[testSymbol] * 1.05 : 105).toFixed(2) }));
  }
  const [symbol, setSymbol] = useState('');
  const [input, setInput] = useState('');
  const [prices, setPrices] = useState({}); // { SYMBOL: price }
  const [histories, setHistories] = useState({}); // { SYMBOL: [{date, price}] }
  const [alert, setAlert] = useState(null);
  const [threshold, setThreshold] = useState(5);
  const [phone, setPhone] = useState('');

  async function sendSmsAlert(message) {
    if (!phone) return;
    try {
      await fetch('http://localhost:5001/send-sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: phone, message })
      });
    } catch (err) {
      console.error('SMS send failed:', err);
    }
  }
  const LOCAL_KEY = 'mytickertracker-settings-v4';
  const HISTORY_KEY = 'mytickertracker-history-v4';

  // Manual price fetch for a symbol
  async function handleRefreshPrice(sym) {
    try {
      const data = await fetchFinnhub('/quote', { symbol: sym });
      const realPrice = data.c;
      setPrices(prev => ({ ...prev, [sym]: realPrice }));
      setHistories(prev => {
        const today = new Date().toISOString().slice(0, 10);
        const prevHist = prev[sym] || [];
        const filtered = prevHist.filter(h => h.date !== today);
        return {
          ...prev,
          [sym]: [...filtered, { date: today, price: realPrice }]
        };
      });
    } catch {
      setPrices(prev => ({ ...prev, [sym]: null }));
    }
  }



  // Load settings and history from localStorage, and fill all missing days in history (indefinite save)
  useEffect(() => {
    const saved = JSON.parse(localStorage.getItem(LOCAL_KEY));
    if (saved) {
      // setSymbol(saved.symbol || ''); // Removed as requested
      setInput(saved.symbol || '');
      setThreshold(saved.threshold || 5);
    }
    const hists = JSON.parse(localStorage.getItem(HISTORY_KEY));
    console.log('Loaded from localStorage on refresh:', hists);
    const historiesObj = hists && typeof hists === 'object' ? hists : {};
    if (Object.keys(historiesObj).length > 0) {
      setHistories(historiesObj);
    }
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
    if (found) {
      // setAlert(found); // Removed as requested
      sendSmsAlert(
        `${symbol} ${found.days} day alert - Increase ${found.threshold}% or more. Price now $${found.price}`
      );
    } else {
      // setAlert(null); // Removed as requested
    }
  }, [histories, threshold, symbol, sendSmsAlert]);

  function handleSubmit(e) {
    e.preventDefault();
    const newSymbol = input.trim().toUpperCase();
    if (!newSymbol) return;
    setSymbol(newSymbol);
    setInput('');
    setHistories(prev => {
      if (prev[newSymbol]) return prev;
      const updated = { ...prev, [newSymbol]: [] };
      // Immediately persist to localStorage for reliability
      localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
      console.log('Saved to localStorage after adding symbol:', updated);
      // Also update the histories state to trigger the useEffect
      return updated;
    });
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
      <form onSubmit={handleSubmit} className="flex mb-4" style={{ fontSize: '2em' }}>
        <input
          className="border rounded px-2 py-1"
          style={{ fontSize: '1.5em', marginRight: '2.5em' }}
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Enter STOCK SYMBOL"
        />
        <input
          className="border rounded px-2 py-1 ml-4"
          style={{ fontSize: '1.5em' }}
          value={phone}
          onChange={e => setPhone(e.target.value)}
          placeholder="Enter phone number"
        />
        <button
          className="bg-blue-600 text-white px-8 py-2 shadow-md border-2 border-blue-700 transition duration-150 ease-in-out hover:bg-blue-700 hover:scale-105 focus:outline-none focus:ring-4 focus:ring-blue-300"
          style={{ fontSize: '1.5em', fontWeight: 'bold', letterSpacing: '0.1em', textTransform: 'uppercase' }}
          type="submit"
        >
          TRACK
        </button>
      </form>
      <button
        className="bg-green-600 text-white px-6 py-2 rounded shadow-md mt-2 mb-6"
        style={{ fontSize: '1.2em', fontWeight: 'bold' }}
        onClick={handleTestAlert}
        disabled={Object.keys(histories).length === 0}
      >
        Test 5% Alert
      </button>

      {Object.keys(histories).length > 0 && (
        <div className="mb-8 w-full flex flex-row items-start justify-center">
          {(() => {
            const entries = Object.entries(histories);
            const chunkSize = 5;
            const columns = [];
            for (let i = 0; i < entries.length; i += chunkSize) {
              columns.push(entries.slice(i, i + chunkSize));
            }
            return columns.map((col, colIdx) => (
              <div key={colIdx} className="flex flex-col items-center mx-4">
                {col.map(([sym, hist]) => (
                    <div key={sym} className="mb-8 w-full flex flex-col items-center">
                      <div className="mb-4 flex items-center gap-4" style={{ fontSize: '2.6em', fontWeight: 'bold' }}>
                        <span style={{ fontWeight: 'bold' }}>{sym}</span>:
                        {prices[sym] !== undefined && prices[sym] !== null ? <span style={{ fontWeight: 'bold' }}>${prices[sym]}</span> : 'No price'}
                        <button
                          className="ml-2 px-2 py-1 bg-blue-400 text-white rounded text-base"
                          style={{ fontWeight: 'bold' }}
                          onClick={() => handleRefreshPrice(sym)}
                        >
                          Refresh Price
                        </button>
                        <button
                          onClick={() => handleDelete(sym)}
                          className="ml-4 px-3 py-1 bg-red-600 text-white rounded text-base"
                          style={{ fontWeight: 'bold' }}
                        >
                          Delete
                        </button>
                      </div>
                    {hist.length > 0 ? (
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
                          {hist.slice(-7).map((h, idx, arr) => {
                            const prev = idx > 0 ? arr[idx - 1] : null;
                            const change = prev && prev.price ? (((h.price - prev.price) / prev.price) * 100).toFixed(2) : '-';
                            // Calculate days difference from last refresh date
                            const lastDate = new Date(arr[arr.length - 1].date);
                            const currDate = new Date(h.date);
                            const diffTime = lastDate - currDate;
                            const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
                            return (
                              <tr key={h.date}>
                                <td className="border px-4 py-2">{h.date}</td>
                                <td className="border px-4 py-2">${h.price}</td>
                                <td className="border px-4 py-2">{change !== '-' ? `${change}%` : '-'}</td>
                                <td className="border px-4 py-2">{diffDays}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    ) : (
                      <div className="text-gray-400 text-lg italic mb-4">No price history yet.</div>
                    )}
                  </div>
                ))}
              </div>
            ));
          })()}
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


export default App;
