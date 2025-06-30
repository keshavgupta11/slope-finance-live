import React, { useState } from 'react';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer } from 'recharts';
import './App.css';

export default function App() {
  const initialMarketSettings = {
    "JitoSol": { apy: 8.45, k: 0.00001, symbol: "JitoSOL" },
    "Lido stETH": { apy: 5.0, k: 0.00001, symbol: "stETH" },
    "Ethena sUSDe": { apy: 4.0, k: 0.00001, symbol: "sUSDe" },
  };

  const [marketSettings, setMarketSettings] = useState(initialMarketSettings);
  const [market, setMarket] = useState("JitoSol");
  const [dv01, setDv01] = useState(10000);
  const [margin, setMargin] = useState(200000);
  const [tradesByMarket, setTradesByMarket] = useState({});
  const [oiByMarket, setOiByMarket] = useState({});
  const [lastPriceByMarket, setLastPriceByMarket] = useState({});
  const [pendingTrade, setPendingTrade] = useState(null);
  const [tradeType, setTradeType] = useState('pay');
  const [activeTab, setActiveTab] = useState("Swap");

  const generateChartData = () => {
    const data = [];
    const marketTargets = {
      'JitoSol': 7.5,
      'Lido stETH': 4.5,
      'Ethena sUSDe': 3.0
    };
    
    const targetAPY = marketTargets[market] || 5.0;
    
    for (let year = 2023; year <= 2025; year++) {
      for (let quarter = 1; quarter <= (year === 2025 ? 2 : 4); quarter++) {
        const timeIndex = (year - 2023) * 4 + quarter - 1;
        const smoothVariation = Math.sin(timeIndex / 12) * 0.8;
        const gradualTrend = (timeIndex / 20) * 0.5;
        const apy = Math.max(1, Math.min(9, targetAPY + smoothVariation + gradualTrend));
        
        data.push({
          date: `${year}-Q${quarter}`,
          apy: parseFloat(apy.toFixed(3)),
          year: year + (quarter - 1) * 0.25
        });
      }
    }
    return data;
  };

  const chartData = generateChartData();
  const marketTrades = tradesByMarket[market] || [];
  const netOI = oiByMarket[market] || 0;
  const lastPrice = lastPriceByMarket[market] ?? marketSettings[market].apy;
  const { apy: baseAPY, k } = marketSettings[market];

  const handleMarketChange = (newMarket) => {
    setMarket(newMarket);
  };

  const requestTrade = (type) => {
    const preOI = netOI;
    const postOI = type === 'pay' ? netOI + dv01 : netOI - dv01;
    const midpointOI = (preOI + postOI) / 2;
    const directionFactor = type === 'pay' ? 1 : -1;

    const rawPrice = baseAPY + k * midpointOI;
    const protocolRiskIncreases = Math.abs(postOI) > Math.abs(preOI);
    const feeRate = protocolRiskIncreases ? 0.05 : 0.02;
    const fee = feeRate * directionFactor;
    const finalPrice = rawPrice + fee;

    setPendingTrade({
      type,
      finalPrice: finalPrice.toFixed(4),
      feeRate,
      rawPrice: rawPrice.toFixed(4),
      directionFactor,
      preOI,
      postOI,
    });
  };

  const updateMarketSetting = (mkt, field, value) => {
    const updated = { ...marketSettings };
    updated[mkt][field] = parseFloat(value);
    setMarketSettings(updated);
    if (mkt === market) {
      setLastPriceByMarket(prev => ({ ...prev, [mkt]: updated[mkt].apy }));
    }
  };

  const confirmTrade = () => {
    const { type, finalPrice, rawPrice, directionFactor, preOI, postOI } = pendingTrade;

    const minMargin = dv01 * 20;
    if (margin < minMargin) {
      alert('Margin too low!');
      setPendingTrade(null);
      return;
    }

    const marginBuffer = (margin / dv01) / 100;
    const liq = type === 'pay' 
      ? parseFloat(finalPrice) - marginBuffer
      : parseFloat(finalPrice) + marginBuffer;
    
    const plUSD = ((rawPrice - finalPrice) * directionFactor * dv01 * 100).toFixed(2);

    const trade = {
      market,
      type,
      dv01,
      margin,
      entry: finalPrice,
      liq: liq.toFixed(2),
      timestamp: new Date().toLocaleTimeString(),
      pl: plUSD,
      pnl: parseFloat(plUSD),
      entryPrice: parseFloat(finalPrice),
      currentPrice: parseFloat(rawPrice),
      liquidationPrice: liq.toFixed(2),
      collateral: margin,
      currentDV01: dv01
    };

    setTradesByMarket(prev => ({
      ...prev,
      [market]: [...(prev[market] || []), trade]
    }));

    setOiByMarket(prev => ({
      ...prev,
      [market]: postOI
    }));

    setLastPriceByMarket(prev => ({
      ...prev,
      [market]: parseFloat(rawPrice)
    }));

    setPendingTrade(null);
  };

  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <h1 className="logo">Slope</h1>
          <nav className="nav">
            <span className={`nav-item ${activeTab === "Swap" ? "active" : ""}`} onClick={() => setActiveTab("Swap")}>Swap</span>
            <span className={`nav-item ${activeTab === "Learn" ? "active" : ""}`} onClick={() => setActiveTab("Learn")}>Learn</span>
            <span className={`nav-item ${activeTab === "Docs" ? "active" : ""}`} onClick={() => setActiveTab("Docs")}>Docs</span>
            <span className={`nav-item ${activeTab === "Leaderboard" ? "active" : ""}`} onClick={() => setActiveTab("Leaderboard")}>Leaderboard</span>
            <span className={`nav-item ${activeTab === "Stats" ? "active" : ""}`} onClick={() => setActiveTab("Stats")}>Stats</span>
            <span className={`nav-item ${activeTab === "Settings" ? "active" : ""}`} onClick={() => setActiveTab("Settings")}>Settings</span>
          </nav>
        </div>
        <button className="wallet-btn">Connect Wallet</button>
      </header>

      {activeTab === "Swap" && (
        <div className="main-container">
          <div className="left-panel">
            <div className="swap-header">
              <h2>Swap</h2>
              <div className="price-info">
                <div className="price-row">
                  <span>Live Price:</span>
                  <span className="live-price">{lastPrice.toFixed(2)}%</span>
                </div>
                <div className="price-row">
                  <span>2025 realized APY:</span>
                  <span className="realized-apy">{(marketSettings[market].apy * 0.98).toFixed(2)}%</span>
                </div>
                <div className="indicator">
                  <span className="indicator-icon">⚡</span>
                  <span>{marketSettings[market].apy.toFixed(2)}%</span>
                </div>
              </div>
            </div>

            <div className="market-selector">
              <select value={market} onChange={(e) => handleMarketChange(e.target.value)} className="market-select">
                {Object.keys(marketSettings).map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
              <div className="market-info">
                <div>Notional / DV01</div>
                <div>$1k dv01 means you gain/lose $1,000 per 1bp move</div>
              </div>
            </div>

            <div className="inputs">
              <div className="input-group">
                <label>DV01 ($)</label>
                <input
                  type="number"
                  value={dv01 || ''}
                  onChange={(e) => setDv01(e.target.value === '' ? 0 : Number(e.target.value))}
                  placeholder="Enter DV01 amount"
                />
              </div>

              <div className="input-group">
                <label>Margin (USDC)</label>
                <input
                  type="number"
                  value={margin || ''}
                  onChange={(e) => setMargin(e.target.value === '' ? 0 : Number(e.target.value))}
                  placeholder="Enter margin amount"
                />
              </div>

              <div className="min-margin">
                <div>Min margin required:</div>
                <div className="min-margin-value">${(dv01 * 20).toLocaleString()}</div>
              </div>

              <div className="trade-buttons">
                <button
                  onClick={() => setTradeType('pay')}
                  className={`trade-btn ${tradeType === 'pay' ? 'active pay-fixed' : ''}`}
                >
                  ● Pay Fixed
                </button>
                <button
                  onClick={() => setTradeType('receive')}
                  className={`trade-btn ${tradeType === 'receive' ? 'active receive-fixed' : ''}`}
                >
                  ● Receive Fixed
                </button>
              </div>

              <button 
                onClick={() => requestTrade(tradeType)}
                disabled={margin < dv01 * 20}
                className={`enter-btn ${margin < dv01 * 20 ? 'disabled' : ''}`}
              >
                {margin < dv01 * 20 ? 'Margin too low' : 'Enter Position'}
              </button>

              <div className="profit-info">
                <div className="profit-row">
                  <span className="profit-dot pay"></span>
                  <span>Pay Fixed: Profit if rates go higher</span>
                </div>
                <div className="profit-row">
                  <span className="profit-dot receive"></span>
                  <span>Receive Fixed: Profit if rates go lower</span>
                </div>
              </div>
            </div>
          </div>

          <div className="right-panel">
            <div className="chart-header">
              <span>Running 365d APY</span>
            </div>
            <div className="chart-container">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
  <XAxis 
    dataKey="year" 
    axisLine={false}
    tickLine={false}
    tick={{ fill: '#9CA3AF', fontSize: 12 }}
    type="number"
    scale="linear"
    domain={[2023, 2025]}
    ticks={[2023, 2024, 2025]}
  />
  <YAxis 
    axisLine={false}
    tickLine={false}
    tick={{ fill: '#9CA3AF', fontSize: 12 }}
    domain={[0, 10]}
    tickFormatter={(value) => `${value.toFixed(1)}%`}
    scale="linear"
  />
  <defs>
    <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
      <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(75, 85, 99, 0.2)" strokeWidth="1"/>
    </pattern>
  </defs>
  <rect width="100%" height="100%" fill="url(#grid)" />
  <Line 
    type="monotone" 
    dataKey="apy" 
    stroke="#10B981" 
    strokeWidth={3}
    dot={false}
    activeDot={{ r: 6, stroke: '#10B981', strokeWidth: 3, fill: '#000' }}
  />
</LineChart>
              </ResponsiveContainer>
            </div>
            <div className="chart-info">
  This chart shows realized APY over last 365 days
</div>

<div className="market-stats">
  <h4>Market Statistics</h4>
  <div className="stats-grid">
    <div className="stat-card">
      <div className="stat-label">Total Volume (24h)</div>
      <div className="stat-value">$2.4M</div>
      <div className="stat-change positive">+12.3%</div>
    </div>
    <div className="stat-card">
      <div className="stat-label">Active Positions</div>
      <div className="stat-value">147</div>
      <div className="stat-change positive">+8</div>
    </div>
    <div className="stat-card">
      <div className="stat-label">Total PnL (24h)</div>
      <div className="stat-value">+$12,847</div>
      <div className="stat-change positive">+5.2%</div>
    </div>
    <div className="stat-card">
      <div className="stat-label">Markets Online</div>
      <div className="stat-value">3/3</div>
      <div className="stat-status online">●</div>
    </div>
    <div className="stat-card">
      <div className="stat-label">Open Interest</div>
      <div className="stat-value">$8.9M</div>
      <div className="stat-change positive">+2.1%</div>
    </div>
    <div className="stat-card">
      <div className="stat-label">Fee Revenue</div>
      <div className="stat-value">$3,241</div>
      <div className="stat-change positive">+15.7%</div>
    </div>
  </div>
</div>
          </div>
        </div>
      )}

      {activeTab === "Settings" && (
        <div className="settings-container">
          <h2>Settings</h2>
          <h3>Market Settings</h3>
          {Object.keys(marketSettings).map((mkt) => (
            <div key={mkt} className="market-setting">
              <h4>{mkt}</h4>
              <div className="setting-inputs">
                <div>
                  <label>Oracle APY:</label>
                  <input
                    type="number"
                    step="0.0001"
                    value={marketSettings[mkt].apy}
                    onChange={(e) => updateMarketSetting(mkt, "apy", e.target.value)}
                  />
                </div>
                <div>
                  <label>K:</label>
                  <input
                    type="number"
                    step="0.000001"
                    value={marketSettings[mkt].k}
                    onChange={(e) => updateMarketSetting(mkt, "k", e.target.value)}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {["Learn", "Docs", "Leaderboard", "Stats"].map(tab => (
        activeTab === tab && (
          <div key={tab} className="tab-content">
            <h2>{tab}</h2>
            <p>{tab === "Learn" ? "Learning resources" : tab === "Docs" ? "Documentation" : tab === "Leaderboard" ? "Leaderboard" : "Statistics"} coming soon...</p>
          </div>
        )
      ))}

      {activeTab === "Swap" && (
        <div className="positions-section">
          <h3>Positions</h3>
          <div className="positions-table">
            <table>
              <thead>
                <tr>
                  <th>Market</th>
                  <th>Direction</th>
                  <th>P&L</th>
                  <th>Entry Price</th>
                  <th>Current Price</th>
                  <th>Liquidation Price</th>
                  <th>Current DV01</th>
                  <th>Collateral</th>
                </tr>
              </thead>
              <tbody>
                {marketTrades.length > 0 ? marketTrades.map((trade, i) => (
                  <tr key={i}>
                    <td>{trade.market}</td>
                    <td className={trade.type === 'pay' ? 'pay-fixed' : 'receive-fixed'}>
                      {trade.type === 'pay' ? 'Pay Fixed' : 'Receive Fixed'}
                    </td>
                    <td className={trade.pnl >= 0 ? 'profit' : 'loss'}>
                      {trade.pnl >= 0 ? '+' : ''}${trade.pl}
                    </td>
                    <td>{trade.entryPrice}%</td>
                    <td>{trade.currentPrice}%</td>
                    <td>{parseFloat(trade.liquidationPrice).toFixed(2)}%</td>
                    <td>${trade.currentDV01.toLocaleString()}</td>
                    <td>${trade.collateral.toLocaleString()}</td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan="8" className="no-positions">No positions yet</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {pendingTrade && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Confirm Trade</h3>
            <div className="trade-details">
              <div className="detail-row">
                <span>Type:</span>
                <span className="trade-type">{pendingTrade.type} Fixed</span>
              </div>
              <div className="detail-row">
                <span>Execution Price:</span>
                <span className="execution-price">{pendingTrade.finalPrice}%</span>
              </div>
              <div className="detail-row">
                <span>Liquidation Price:</span>
                <span className="liq-price">
                  {(pendingTrade.type === 'pay' 
                    ? (parseFloat(pendingTrade.finalPrice) - ((margin / dv01) / 100))
                    : (parseFloat(pendingTrade.finalPrice) + ((margin / dv01) / 100))
                  ).toFixed(2)}%
                </span>
              </div>
              <div className="detail-row">
                <span>Fee:</span>
                <span className="fee">{pendingTrade.feeRate}bp</span>
              </div>
            </div>
            <div className="modal-buttons">
              <button onClick={confirmTrade} className="confirm-btn">Confirm Trade</button>
              <button onClick={() => setPendingTrade(null)} className="cancel-btn">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}