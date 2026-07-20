import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchFinnhub } from './finnhubApi';
// ...existing code...
function App() {
  const LOCAL_KEY = 'mytickertracker-settings-v4';
  const HISTORY_KEY = 'mytickertracker-history-v4';
  const SMS_API_URL = import.meta.env.VITE_SMS_API_URL;
  const HAS_FINNHUB_KEY = Boolean(import.meta.env.VITE_FINNHUB_API_KEY);
  const savedSettings = JSON.parse(localStorage.getItem(LOCAL_KEY) || 'null');


  const [symbol, setSymbol] = useState('');
  const [input, setInput] = useState(() => {
    return savedSettings?.symbol || '';
  });
  const [numStocksInput, setNumStocksInput] = useState(() => savedSettings?.numStocksInput || '');
  const [prices, setPrices] = useState({}); // { SYMBOL: price }
  const [priceErrors, setPriceErrors] = useState({}); // { SYMBOL: error message }
  const [refreshing, setRefreshing] = useState({}); // { SYMBOL: boolean }
  const [lastRefreshAt, setLastRefreshAt] = useState({}); // { SYMBOL: locale time string }
  const [histories, setHistories] = useState(() => {
    const stored = JSON.parse(localStorage.getItem(HISTORY_KEY));
    return stored && typeof stored === 'object' ? stored : {};
  }); // { SYMBOL: [{date, price}] }
  const [threshold, setThreshold] = useState(() => {
    return savedSettings?.threshold || 5;
  });
  const [stockCounts, setStockCounts] = useState(() => (
    savedSettings?.stockCounts && typeof savedSettings.stockCounts === 'object'
      ? savedSettings.stockCounts
      : {}
  ));
  const requestQueueRef = useRef(Promise.resolve());
  const lastRequestAtRef = useRef(0);

  const sendSmsAlert = useCallback(async (message) => {
    if (!SMS_API_URL) return;
    try {
      await fetch(SMS_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message })
      });
    } catch (err) {
      console.error('SMS send failed:', err);
    }
  }, [SMS_API_URL]);

  const enqueueFinnhubRequest = useCallback((task) => {
    const run = async () => {
      const minGapMs = 1200;
      const elapsed = Date.now() - lastRequestAtRef.current;
      const waitMs = Math.max(0, minGapMs - elapsed);
      if (waitMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }

      const result = await task();
      lastRequestAtRef.current = Date.now();
      return result;
    };

    requestQueueRef.current = requestQueueRef.current.then(run, run);
    return requestQueueRef.current;
  }, []);

  // Manual and scheduled price fetch for a symbol
  const handleRefreshPrice = useCallback(async (sym) => {
    setRefreshing(prev => ({ ...prev, [sym]: true }));

    if (!HAS_FINNHUB_KEY) {
      setPrices(prev => ({ ...prev, [sym]: null }));
      setPriceErrors(prev => ({
        ...prev,
        [sym]: 'Missing VITE_FINNHUB_API_KEY in .env'
      }));
      setRefreshing(prev => ({ ...prev, [sym]: false }));
      return;
    }

    try {
      const data = await enqueueFinnhubRequest(() => fetchFinnhub('/quote', { symbol: sym }));
      const realPrice = data.c;
      const hasNoQuoteData = [data.c, data.h, data.l, data.o, data.pc].every((value) => value === 0);
      if (hasNoQuoteData) {
        throw new Error(`No quote data returned for ${sym}. Check ticker symbol.`);
      }
      if (typeof realPrice !== 'number') {
        throw new Error('Unexpected quote response from Finnhub');
      }

      setPrices(prev => ({ ...prev, [sym]: realPrice }));
      setPriceErrors(prev => ({ ...prev, [sym]: null }));
      setLastRefreshAt(prev => ({ ...prev, [sym]: new Date().toLocaleTimeString() }));
      setHistories(prev => {
        const today = new Date().toISOString().slice(0, 10);
        const prevHist = prev[sym] || [];
        const filtered = prevHist.filter(h => h.date !== today);
        const updated = [...filtered, { date: today, price: realPrice }];
        // Keep only the last 5 rows
        const limited = updated.slice(-5);
        return {
          ...prev,
          [sym]: limited
        };
      });
    } catch (err) {
      setPrices(prev => ({ ...prev, [sym]: null }));
      setPriceErrors(prev => ({
        ...prev,
        [sym]: err instanceof Error ? err.message : 'Failed to refresh price'
      }));
    } finally {
      setRefreshing(prev => ({ ...prev, [sym]: false }));
    }
  }, [HAS_FINNHUB_KEY, enqueueFinnhubRequest, setPrices, setHistories, setPriceErrors, setRefreshing, setLastRefreshAt]);

  // Save settings and history to localStorage
  useEffect(() => {
    localStorage.setItem(
      LOCAL_KEY,
      JSON.stringify({ symbol, threshold, numStocksInput, stockCounts })
    );
  }, [symbol, threshold, numStocksInput, stockCounts]);
  useEffect(() => {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(histories));
  }, [histories]);



  // Auto-detect day range for alert
  useEffect(() => {
    const hist = histories[symbol] || [];
    if (!symbol || hist.length < 2) {
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
    }
  }, [histories, threshold, symbol, sendSmsAlert]);

  // Auto-generate new price on new day for tracked symbols
  useEffect(() => {
    if (!symbol) return;
    
    const checkAndGenerateDaily = () => {
      const today = new Date().toISOString().slice(0, 10);
      setHistories(prev => {
        const hist = prev[symbol] || [];
        const lastEntry = hist.length > 0 ? hist[hist.length - 1] : null;
        
        // If today already has a price, skip
        if (lastEntry && lastEntry.date === today) {
          return prev;
        }
        
        // Generate new price: ±5% variation from last price or default to 100
        let newPrice = 100;
        if (lastEntry && lastEntry.price) {
          const variation = (Math.random() - 0.5) * 0.1; // ±5%
          newPrice = +(lastEntry.price * (1 + variation)).toFixed(2);
        }
        
        const updated = [...hist, { date: today, price: newPrice }];
        // Keep only last 5 rows
        const limited = updated.slice(-5);
        return {
          ...prev,
          [symbol]: limited
        };
      });
    };
    
    // Check on app load/symbol change
    checkAndGenerateDaily();
    
    // Check daily at midnight
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    const msUntilMidnight = tomorrow - now;
    
    const timeoutId = setTimeout(() => {
      checkAndGenerateDaily();
      // Then check every 24 hours
      const intervalId = setInterval(checkAndGenerateDaily, 24 * 60 * 60 * 1000);
      return () => clearInterval(intervalId);
    }, msUntilMidnight);
    
    return () => clearTimeout(timeoutId);
  }, [symbol]);

  function handleSubmit(e) {
    e.preventDefault();
    const newSymbol = input.trim().toUpperCase();
    const trimmedNumStocks = numStocksInput.trim();
    const parsedNumStocks = Number.parseInt(trimmedNumStocks, 10);
    if (!newSymbol) return;
    if (!trimmedNumStocks || Number.isNaN(parsedNumStocks) || parsedNumStocks < 0) return;
    setSymbol(newSymbol);
    setInput('');
    setStockCounts(prev => ({
      ...prev,
      [newSymbol]: parsedNumStocks
    }));
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
    setStockCounts(prev => {
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
      <h1 className="text-6xl font-bold mb-0" style={{ fontSize: '4em' }}>MyTickerTracker</h1>
      <form onSubmit={handleSubmit} className="flex flex-col items-center justify-center mb-0" style={{ fontSize: '2em' }}>
        <div className="mb-1">
          <input
            className="border rounded px-2 py-1 w-40"
            style={{ fontSize: '0.75em' }}
            type="number"
            min="0"
            step="1"
            value={numStocksInput}
            onChange={e => setNumStocksInput(e.target.value)}
            placeholder="Num of Stocks"
          />
        </div>
        <div className="flex flex-row items-center gap-3">
          <input
            className="border rounded px-2 py-1 w-40"
            style={{ fontSize: '0.75em' }}
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Enter STOCK SYMBOL"
          />
        </div>
        <button
          className="bg-blue-600 text-white px-4 py-1 shadow-md border-2 border-blue-700 transition duration-150 ease-in-out hover:bg-blue-700 hover:scale-105 focus:outline-none focus:ring-4 focus:ring-blue-300 mt-2"
          style={{ fontSize: '0.75em', fontWeight: 'bold', letterSpacing: '0.1em', textTransform: 'uppercase' }}
          type="submit"
        >
          Submit
        </button>
      </form>

      {!HAS_FINNHUB_KEY && (
        <div className="mb-4 text-red-600" style={{ fontSize: '1.1em', fontWeight: 'bold' }}>
          Set VITE_FINNHUB_API_KEY in .env and restart npm run dev to enable Refresh Price.
        </div>
      )}

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
                        <span style={{ fontWeight: 'bold' }}>{`${stockCounts[sym] ?? 0} ${sym}`}</span>
                        <span style={{ fontWeight: 'bold', marginRight: '0.25em' }}>:</span>
                        {prices[sym] !== undefined && prices[sym] !== null ? <span style={{ fontWeight: 'bold', marginLeft: '0.25em' }}>${prices[sym]}</span> : 'No price'}
                        <button
                          className="ml-2 px-2 py-1 bg-blue-400 text-white rounded text-base"
                          style={{ fontWeight: 'bold' }}
                          onClick={() => handleRefreshPrice(sym)}
                          disabled={Boolean(refreshing[sym])}
                          title={!HAS_FINNHUB_KEY ? 'Missing VITE_FINNHUB_API_KEY in .env' : 'Refresh current market price'}
                        >
                          {refreshing[sym] ? 'Refreshing...' : 'Refresh Price'}
                        </button>
                        <button
                          onClick={() => handleDelete(sym)}
                          className="ml-4 px-3 py-1 bg-red-600 text-white rounded text-base"
                          style={{ fontWeight: 'bold' }}
                        >
                          Delete
                        </button>
                      </div>
                    {priceErrors[sym] && (
                      <div className="text-red-600 text-base mb-3">Refresh failed: {priceErrors[sym]}</div>
                    )}
                    {lastRefreshAt[sym] && (
                      <div className="text-gray-600 text-sm mb-3">Last refresh: {lastRefreshAt[sym]}</div>
                    )}
                    {hist.length > 0 ? (
                      <table className="table-auto border-collapse w-auto text-xl" style={{ fontSize: '1em', minWidth: 400 }}>
                        <thead>
                          <tr>
                            <th className="border px-4 py-2">Date</th>
                            <th className="border px-4 py-2">Price</th>
                              <th className="border px-4 py-2">% Previous Day Change</th>
                            <th className="border px-4 py-2">% Chg From Oldest Visible Row Price</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[...hist.slice(-7)].reverse().map((h, idx, arr) => {
                            const oldestVisibleEntry = arr[arr.length - 1];
                              const previousDayEntry = arr[idx + 1];
                              const change = previousDayEntry?.price && h.price
                                ? (((h.price - previousDayEntry.price) / previousDayEntry.price) * 100).toFixed(2)
                                : '-';
                            const oldestVisibleChange = oldestVisibleEntry?.price && h.price
                              ? (((h.price - oldestVisibleEntry.price) / oldestVisibleEntry.price) * 100).toFixed(2)
                              : '-';
                            return (
                              <tr key={h.date}>
                                <td className="border px-4 py-2">{h.date}</td>
                                <td className="border px-4 py-2">${h.price}</td>
                                <td className="border px-4 py-2">{change !== '-' ? `${change}%` : '-'}</td>
                                <td className="border px-4 py-2">{oldestVisibleChange !== '-' ? `${oldestVisibleChange}%` : '-'}</td>
                              </tr>
                            );
                          })}
                          <tr>
                            <td className="border px-4 py-2 font-bold">Total Purchased</td>
                            <td className="border px-4 py-2">
                              {prices[sym] !== undefined && prices[sym] !== null
                                ? `$${((stockCounts[sym] ?? 0) * prices[sym]).toFixed(2)}`
                                : '-'}
                            </td>
                            <td className="border px-4 py-2">-</td>
                            <td className="border px-4 py-2">-</td>
                          </tr>
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
      {Object.keys(stockCounts).length > 0 && (
        <div className="mb-8 w-full flex justify-center">
          <table className="table-auto border-collapse w-auto text-xl" style={{ fontSize: '1em', minWidth: 400 }}>
            <tbody>
              <tr>
                <td className="border px-4 py-2 font-bold" style={{ fontSize: '2em' }}>All Stocks Total</td>
                <td className="border px-4 py-2 font-bold text-green-700" style={{ fontSize: '2em' }}>
                  ${Object.entries(stockCounts)
                    .reduce((total, [sym, shares]) => {
                      const currentPrice = prices[sym];
                      if (typeof currentPrice !== 'number') return total;
                      return total + (Number(shares) * currentPrice);
                    }, 0)
                    .toFixed(2)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
      <div className="flex gap-4 mb-4" style={{ fontSize: '2em' }}>
        <div>
          <label className="block" style={{ fontSize: '0.5em' }}>Threshold (%)</label>
          <select
            className="border rounded px-2 py-1 w-24"
            style={{ fontSize: '1em' }}
            value={threshold}
            onChange={e => setThreshold(Number(e.target.value))}
          >
            {[5,10].map(t => (
              <option key={t} value={t} style={{ fontSize: '0.5em' }}>{t}%</option>
            ))}
          </select>
        </div>
      </div>
      <p className="mt-8 text-gray-500" style={{ fontSize: '2em' }}>Stock data updates when you press Refresh Price. Alerts and settings are saved.</p>
    </div>
  );
}


export default App;
