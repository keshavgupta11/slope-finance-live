import React, { useState, useEffect, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer } from 'recharts';
import './App.css';

// Solana imports
import { Connection, PublicKey, clusterApiUrl } from '@solana/web3.js';
import { getAccount, getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from '@solana/spl-token';

// Phantom wallet detection
const getProvider = () => {
  if ('phantom' in window) {
    return window.phantom?.solana;
  }
  return null;
};

export default function App() {
  const initialMarketSettings = {
    "JitoSol": { apy: 8.45, k: 0.00001, symbol: "JitoSOL" },
    "Lido stETH": { apy: 5.0, k: 0.00001, symbol: "stETH" },
    "Ethena sUSDe": { apy: 4.0, k: 0.00001, symbol: "sUSDe" },
  };

  const [marketSettings, setMarketSettings] = useState(initialMarketSettings);
  const [market, setMarket] = useState("JitoSol");
  const [baseDv01, setBaseDv01] = useState(10000);
  const [margin, setMargin] = useState(200000);
  const [currentDay, setCurrentDay] = useState(0);
  const [tradesByMarket, setTradesByMarket] = useState({});
  const [oiByMarket, setOiByMarket] = useState({});
  const [lastPriceByMarket, setLastPriceByMarket] = useState({});
  const [pendingTrade, setPendingTrade] = useState(null);
  const [tradeType, setTradeType] = useState('pay');
  const [activeTab, setActiveTab] = useState("Swap");
  const [tradeHistory, setTradeHistory] = useState([]);
  const [pendingUnwind, setPendingUnwind] = useState(null);

  // Solana wallet state
  const [wallet, setWallet] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [usdcBalance, setUsdcBalance] = useState(0);

  // Solana connection
  const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');
  
  // USDC token mint on devnet
  const USDC_MINT = new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'); // Devnet USDC

  // Calculate current DV01 based on time to maturity
  const calculateCurrentDv01 = (baseDv01, daysPassed, totalDays = 365) => {
    const timeToMaturity = Math.max(0, totalDays - daysPassed);
    return baseDv01 * (timeToMaturity / totalDays);
  };

  const currentDv01 = calculateCurrentDv01(baseDv01, currentDay);

  // Phantom wallet functions
  const connectWallet = async () => {
    setConnecting(true);
    try {
      const provider = getProvider();
      if (!provider) {
        alert('Phantom wallet not found! Please install Phantom wallet.');
        setConnecting(false);
        return;
      }

      const response = await provider.connect();
      setWallet(response.publicKey);
      console.log('Connected to wallet:', response.publicKey.toString());
      
      // Fetch USDC balance after connecting
      await fetchUSDCBalance(response.publicKey);
    } catch (error) {
      console.error('Error connecting to wallet:', error);
      alert('Failed to connect wallet');
    }
    setConnecting(false);
  };

  const disconnectWallet = async () => {
    try {
      const provider = getProvider();
      if (provider) {
        await provider.disconnect();
      }
      setWallet(null);
      setUsdcBalance(0);
    } catch (error) {
      console.error('Error disconnecting wallet:', error);
    }
  };

  // Fetch USDC balance
  const fetchUSDCBalance = async (walletPublicKey) => {
    try {
      const tokenAccount = await getAssociatedTokenAddress(
        USDC_MINT,
        walletPublicKey
      );

      const account = await getAccount(connection, tokenAccount);
      const balance = Number(account.amount) / 1e6; // USDC has 6 decimals
      setUsdcBalance(balance);
    } catch (error) {
      console.log('No USDC account found or balance is 0');
      setUsdcBalance(0);
    }
  };

  // Check if wallet is connected on component mount
  useEffect(() => {
    const provider = getProvider();
    if (provider) {
      provider.on('connect', (publicKey) => {
        setWallet(publicKey);
        fetchUSDCBalance(publicKey);
      });
      
      provider.on('disconnect', () => {
        setWallet(null);
        setUsdcBalance(0);
      });

      // Check if already connected
      if (provider.isConnected) {
        setWallet(provider.publicKey);
        fetchUSDCBalance(provider.publicKey);
      }
    }

    return () => {
      if (provider) {
        provider.removeAllListeners();
      }
    };
  }, []);

  // Calculate liquidation risk
  const calculateLiquidationRisk = (trade) => {
    const currentPrice = lastPriceByMarket[trade.market] || marketSettings[trade.market].apy;
    const liquidationPrice = parseFloat(trade.liquidationPrice);
    
    if (trade.type === 'pay') {
      // Pay fixed: liquidation when price goes above liquidation price
      const bpsFromLiquidation = (liquidationPrice - currentPrice) * 100;
      return bpsFromLiquidation;
    } else {
      // Receive fixed: liquidation when price goes below liquidation price
      const bpsFromLiquidation = (currentPrice - liquidationPrice) * 100;
      return bpsFromLiquidation;
    }
  };

  // Update P&L calculations and check for liquidations
  useEffect(() => {
    setTradesByMarket(prev => {
      const updated = { ...prev };
      const liquidatedPositions = [];
      
      Object.keys(updated).forEach(mkt => {
        if (updated[mkt]) {
          updated[mkt] = updated[mkt].filter(trade => {
            const updatedTrade = { ...trade };
            updatedTrade.currentDay = currentDay;
            updatedTrade.currentDV01 = calculateCurrentDv01(trade.baseDV01, currentDay);
            updatedTrade.currentPrice = lastPriceByMarket[mkt] || marketSettings[mkt].apy;
            
            const directionFactor = trade.type === 'pay' ? 1 : -1;
            // Fixed P&L calculation - removed * 100 multiplier
            const plUSD = (updatedTrade.currentPrice - trade.entryPrice) * directionFactor * updatedTrade.currentDV01;
            
            updatedTrade.pl = plUSD.toFixed(2);
            updatedTrade.pnl = plUSD;
            
            // Check for liquidation: only if P&L is negative and exceeds margin
            if (plUSD < 0 && Math.abs(plUSD) > trade.collateral) {
              // Position is liquidated
              liquidatedPositions.push({
                market: mkt,
                trade: updatedTrade,
                liquidationPrice: updatedTrade.currentPrice
              });
              
              // Don't include this trade in the updated array (it's liquidated)
              return false;
            }
            
            return updatedTrade;
          }).filter(Boolean); // Remove any undefined entries
        }
      });
      
      // Process liquidations
      if (liquidatedPositions.length > 0) {
        liquidatedPositions.forEach(({ market: mkt, trade, liquidationPrice }) => {
          // Add to trade history
          setTradeHistory(prevHistory => [...prevHistory, {
            date: new Date().toLocaleDateString(),
            market: mkt,
            direction: trade.type === 'pay' ? 'Pay Fixed' : 'Receive Fixed',
            entryPrice: trade.entryPrice.toFixed(2),
            exitPrice: liquidationPrice.toFixed(2),
            dv01: trade.currentDV01,
            finalPL: (-trade.collateral).toFixed(2), // User loses entire margin
            status: 'LIQUIDATED'
          }]);
          
          // Update protocol risk - protocol takes opposite position
          setOiByMarket(prevOI => {
            const currentOI = prevOI[mkt] || 0;
            const protocolTakesPosition = trade.type === 'pay' ? trade.currentDV01 : -trade.currentDV01;
            return {
              ...prevOI,
              [mkt]: currentOI + protocolTakesPosition
            };
          });
          
          // User loses entire margin - no balance return
          console.log(`Position liquidated: ${trade.type} ${trade.currentDV01} at ${liquidationPrice}%`);
          
          // Show liquidation alert
          alert(`LIQUIDATION: Your ${trade.type} fixed position of ${trade.currentDV01.toLocaleString()} in ${mkt} was liquidated at ${liquidationPrice}%. You lost your entire margin of ${trade.collateral.toLocaleString()}.`);
        });
      }
      
      return updated;
    });
  }, [currentDay, lastPriceByMarket, marketSettings]);

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

  // Calculate vAMM P&L and Protocol P&L
  const calculateProtocolMetrics = () => {
    let vammPL = 0;
    let protocolPL = 0;
    
    // Get all trades from all markets
    const allTrades = Object.values(tradesByMarket).flat();
    allTrades.forEach(trade => {
      // Protocol P&L: All fees collected
      const feeAmountBps = trade.type === 'pay' ? 5 : 2; // 5bp or 2bp
      const feeAmount = trade.currentDV01 * feeAmountBps; // Convert to dollar amount
      protocolPL += feeAmount;
      
      // vAMM P&L: Opposite side of user trade, using raw price (before fees)
      const vammDirection = trade.type === 'pay' ? -1 : 1; // vAMM takes opposite direction
      const rawEntry = trade.rawPrice || parseFloat(trade.entry); // Use stored raw price
      const vammTradeResult = (trade.currentPrice - rawEntry) * vammDirection * trade.currentDV01;
      vammPL += vammTradeResult;
    });
    
    return { vammPL, protocolPL };
  };

  // Unwind function
  const requestUnwind = (tradeIndex) => {
    const trade = marketTrades[tradeIndex];
    if (!trade) return;

    const currentPrice = lastPriceByMarket[trade.market] || marketSettings[trade.market].apy;
    const currentOI = oiByMarket[trade.market] || 0;
    
    // Calculate unwind execution price
    const preOI = currentOI;
    const postOI = trade.type === 'pay' ? currentOI - trade.currentDV01 : currentOI + trade.currentDV01;
    
    let midpointOI;
    if (Math.abs(postOI) > Math.abs(preOI)) {
      midpointOI = preOI + postOI;
    } else {
      midpointOI = (preOI + postOI) / 2;
    }
    
    const { apy: baseAPY, k } = marketSettings[trade.market];
    const unwindPrice = baseAPY + k * midpointOI;
    
    // Calculate fees
    const protocolRiskIncreases = Math.abs(postOI) >= Math.abs(preOI);
    const feeRate = protocolRiskIncreases ? 0.0005 : 0.0002; // 5bp or 2bp
    const directionFactor = trade.type === 'pay' ? -1 : 1; // Opposite for unwind
    const fee = feeRate * directionFactor;
    const executionPrice = unwindPrice + fee;
    
    // Calculate P&L
    const plUSD = (executionPrice - trade.entryPrice) * (trade.type === 'pay' ? 1 : -1) * trade.currentDV01;
    const feeAmount = Math.abs(fee * trade.currentDV01);
    const netReturn = trade.collateral + plUSD - feeAmount;
    
    setPendingUnwind({
      tradeIndex,
      trade,
      executionPrice: executionPrice.toFixed(4),
      entryPrice: trade.entryPrice.toFixed(4),
      pl: plUSD.toFixed(2),
      feeAmount: feeAmount.toFixed(2),
      netReturn: netReturn.toFixed(2),
      feeRate: (feeRate * 10000).toFixed(0)
    });
  };

  const confirmUnwind = () => {
    const { tradeIndex, trade, executionPrice, pl, netReturn } = pendingUnwind;
    
    // Add to trade history
    setTradeHistory(prev => [...prev, {
      date: new Date().toLocaleDateString(),
      market: trade.market,
      direction: trade.type === 'pay' ? 'Pay Fixed' : 'Receive Fixed',
      entryPrice: trade.entryPrice.toFixed(2),
      exitPrice: parseFloat(executionPrice).toFixed(2),
      dv01: trade.currentDV01,
      finalPL: pl,
      status: 'CLOSED'
    }]);
    
    // Remove position from trades
    setTradesByMarket(prev => {
      const updated = { ...prev };
      updated[trade.market] = updated[trade.market].filter((_, i) => i !== tradeIndex);
      return updated;
    });
    
    // Update protocol OI
    setOiByMarket(prev => {
      const currentOI = prev[trade.market] || 0;
      const oiChange = trade.type === 'pay' ? -trade.currentDV01 : trade.currentDV01;
      return {
        ...prev,
        [trade.market]: currentOI + oiChange
      };
    });
    
    // Update market price
    setLastPriceByMarket(prev => ({
      ...prev,
      [trade.market]: parseFloat(executionPrice)
    }));
    
    // Return funds to user
    setUsdcBalance(prev => prev + parseFloat(netReturn));
    
    setPendingUnwind(null);
    alert(`Position unwound successfully! Received: $${netReturn}`);
  };

  const chartData = useMemo(() => generateChartData(), [market]);
  const marketTrades = tradesByMarket[market] || [];
  const netOI = oiByMarket[market] || 0;
  const lastPrice = lastPriceByMarket[market] ?? marketSettings[market].apy;
  const { apy: baseAPY, k } = marketSettings[market];
  const { vammPL, protocolPL } = calculateProtocolMetrics();

  const handleMarketChange = (newMarket) => {
    setMarket(newMarket);
  };

  const handleDayChange = (newDay) => {
    setCurrentDay(Math.max(0, Math.min(365, newDay)));
  };

  const requestTrade = (type) => {
    // Check if wallet is connected
    if (!wallet) {
      alert('Please connect your Phantom wallet first!');
      return;
    }

    // Check simulated USDC balance (for demo)
    const simulatedUSDC = usdcBalance + 5000000; // Add simulated USDC for demo
    if (simulatedUSDC < margin) {
      alert(`Insufficient USDC balance. Required: $${margin.toLocaleString()}, Available: $${simulatedUSDC.toLocaleString()}`);
      return;
    }

    const preOI = netOI;
    const postOI = type === 'pay' ? netOI + currentDv01 : netOI - currentDv01;
    
    // Calculate midpoint based on whether absolute risk increases or decreases
    let midpointOI;
    if (Math.abs(postOI) > Math.abs(preOI)) {
      // Risk increases: use preOI + postOI
      midpointOI = preOI + postOI;
    } else {
      // Risk decreases or stays same: use (preOI + postOI) / 2
      midpointOI = (preOI + postOI) / 2;
    }
    
    const directionFactor = type === 'pay' ? 1 : -1;

    const rawPrice = baseAPY + k * midpointOI;
    const protocolRiskIncreases = Math.abs(postOI) >= Math.abs(preOI);
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

  const confirmTrade = async () => {
    const { type, finalPrice, rawPrice, directionFactor, preOI, postOI } = pendingTrade;

    const minMargin = currentDv01 * 20;
    if (margin < minMargin) {
      alert('Margin too low!');
      setPendingTrade(null);
      return;
    }

    // Simulate transaction signing
    try {
      const provider = getProvider();
      if (provider && wallet) {
        // In a real implementation, you'd create and send a transaction here
        console.log('Simulating transaction for wallet:', wallet.toString());
        
        // Show loading state
        const confirmBtn = document.querySelector('.confirm-btn');
        if (confirmBtn) {
          confirmBtn.textContent = 'Processing...';
          confirmBtn.disabled = true;
        }

        // Simulate transaction delay
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      const marginBuffer = (margin / currentDv01) / 100;
      const liq = type === 'pay' 
        ? parseFloat(finalPrice) + marginBuffer
        : parseFloat(finalPrice) - marginBuffer;

      const trade = {
        market,
        type,
        baseDV01: baseDv01,
        currentDV01: currentDv01,
        margin,
        entry: finalPrice,
        entryPrice: parseFloat(finalPrice),
        currentPrice: parseFloat(rawPrice),
        liq: liq.toFixed(2),
        liquidationPrice: liq.toFixed(2),
        timestamp: new Date().toLocaleTimeString(),
        pl: "0.00",
        pnl: 0,
        collateral: margin,
        entryDay: currentDay,
        currentDay: currentDay,
        feeAmountBps: pendingTrade.feeRate * 100,
        rawPrice: parseFloat(pendingTrade.rawPrice),
        txSignature: wallet ? `${Math.random().toString(36).substr(2, 9)}...` : null // Simulated tx hash
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

      // Update simulated USDC balance
      setUsdcBalance(prev => prev - (margin )); // Simulate using margin

      setPendingTrade(null);
      
      alert(`Trade executed successfully! ${wallet ? `Tx: ${trade.txSignature}` : ''}`);
    } catch (error) {
      console.error('Transaction failed:', error);
      alert('Transaction failed. Please try again.');
      setPendingTrade(null);
    }
  };

  const formatAddress = (address) => {
    if (!address) return '';
    const str = address.toString();
    return `${str.slice(0, 4)}...${str.slice(-4)}`;
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
        
        {/* Wallet Connection */}
        {wallet ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{ textAlign: 'right', fontSize: '0.875rem' }}>
              <div style={{ color: '#9ca3af' }}>USDC Balance</div>
              <div style={{ color: '#10b981', fontWeight: '600' }}>${(usdcBalance + 5000000).toLocaleString()}</div>
            </div>
            <button className="wallet-btn" onClick={disconnectWallet}>
              {formatAddress(wallet)}
            </button>
          </div>
        ) : (
          <button className="wallet-btn" onClick={connectWallet} disabled={connecting}>
            {connecting ? 'Connecting...' : 'Connect Phantom'}
          </button>
        )}
      </header>

      {activeTab === "Swap" && (
        <>
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

            {/* Time to Maturity Control */}
            <div className="input-group">
              <label>
                <span>Days from Entry: {currentDay}</span>
                <span>Time to Maturity: {365 - currentDay} days</span>
              </label>
              <input
                type="range"
                min="0"
                max="365"
                value={currentDay}
                onChange={(e) => handleDayChange(Number(e.target.value))}
                style={{
                  width: '100%',
                  margin: '0.5rem 0',
                  accentColor: '#10b981'
                }}
              />
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                fontSize: '0.75rem', 
                color: '#6b7280' 
              }}>
                <span>Day 0</span>
                <span>DV01 Multiplier: {(currentDv01 / baseDv01).toFixed(3)}</span>
                <span>Day 365</span>
              </div>
            </div>

            <div className="inputs">
              <div className="input-group">
                <label>
                  <span>Base DV01 ($) - Day 0</span>
                  <span>Current DV01: ${currentDv01.toLocaleString()}</span>
                </label>
                <input
                  type="number"
                  value={baseDv01 || ''}
                  onChange={(e) => setBaseDv01(e.target.value === '' ? 0 : Number(e.target.value))}
                  placeholder="Enter base DV01 amount"
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
                <div className="min-margin-value">${(currentDv01 * 20).toLocaleString()}</div>
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
                disabled={!wallet || margin < currentDv01 * 20}
                className={`enter-btn ${!wallet || margin < currentDv01 * 20 ? 'disabled' : ''}`}
              >
                {!wallet ? 'Connect Wallet' : margin < currentDv01 * 20 ? 'Margin too low' : 'Enter Position'}
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

            {/* vAMM and Protocol P&L */}
            <div className="market-stats" style={{ marginTop: '1rem', marginBottom: '1rem' }}>
              <h4>Protocol Metrics</h4>
              <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                <div className="stat-card">
                  <div className="stat-label">vAMM P&L</div>
                  <div className={`stat-value ${vammPL >= 0 ? '' : ''}`} style={{ color: vammPL >= 0 ? '#22c55e' : '#ef4444' }}>
                    {vammPL >= 0 ? '+' : ''}${vammPL.toFixed(0)}
                  </div>
                  <div style={{ color: '#9ca3af', fontSize: '0.6rem' }}>
                    Opposite side of user trades
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">Protocol P&L (Fees)</div>
                  <div className="stat-value" style={{ color: '#10b981' }}>
                    +${protocolPL.toFixed(0)}
                  </div>
                  <div style={{ color: '#9ca3af', fontSize: '0.6rem' }}>
                    Fee revenue collected
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">Protocol Risk</div>
                  <div className="stat-value" style={{ color: netOI >= 0 ? '#06b6d4' : '#f59e0b' }}>
                    {netOI >= 0 ? 'Receive' : 'Pay'} ${Math.abs(netOI).toLocaleString()}
                  </div>
                  <div style={{ color: '#9ca3af', fontSize: '0.6rem' }}>
                    Net open interest exposure
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="positions-section" style={{ marginTop: '3rem', clear: 'both' }}>
          <h3>Positions</h3>
          <div className="positions-table">
            <table>
              <thead>
                <tr>
                  <th>Market</th>
                  <th>Direction</th>
                  <th>Live P&L</th>
                  <th>Entry Price</th>
                  <th>Current Price</th>
                  <th>Liquidation Price</th>
                  <th>Base DV01</th>
                  <th>Current DV01</th>
                  <th>Days Held</th>
                  <th>Tx Hash</th>
                  <th>Liquidation Risk</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {marketTrades.length > 0 ? marketTrades.map((trade, i) => {
                  const bpsFromLiquidation = calculateLiquidationRisk(trade);
                  const isRisky = bpsFromLiquidation <= 5 && bpsFromLiquidation > 0;
                  
                  return (
                    <tr key={i}>
                      <td>{trade.market}</td>
                      <td className={trade.type === 'pay' ? 'pay-fixed' : 'receive-fixed'}>
                        {trade.type === 'pay' ? 'Pay Fixed' : 'Receive Fixed'}
                      </td>
                      <td className={trade.pnl >= 0 ? 'profit' : 'loss'}>
                        {trade.pnl >= 0 ? '+' : ''}${trade.pl}
                      </td>
                      <td>{trade.entryPrice.toFixed(2)}%</td>
                      <td>{trade.currentPrice.toFixed(2)}%</td>
                      <td>{parseFloat(trade.liquidationPrice).toFixed(2)}%</td>
                      <td>${trade.baseDV01?.toLocaleString() || 'N/A'}</td>
                      <td>${trade.currentDV01?.toLocaleString() || trade.baseDV01?.toLocaleString() || 'N/A'}</td>
                      <td>{currentDay - (trade.entryDay || 0)}</td>
                      <td style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                        {trade.txSignature || 'Simulated'}
                      </td>
                      <td>
                        <div style={{ textAlign: 'center' }}>
                          <span style={{ 
                            color: isRisky ? '#ef4444' : '#22c55e', 
                            fontWeight: 'bold',
                            display: 'block'
                          }}>
                            {isRisky ? 'RISKY' : 'Safe'}
                          </span>
                          <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                            {bpsFromLiquidation > 0 ? `${bpsFromLiquidation.toFixed(0)}bp away` : 'N/A'}
                          </span>
                        </div>
                      </td>
                      <td>
                        <button 
                          onClick={() => requestUnwind(i)}
                          style={{
                            backgroundColor: '#ef4444',
                            color: 'white',
                            border: 'none',
                            padding: '0.5rem 1rem',
                            borderRadius: '0.375rem',
                            fontSize: '0.875rem',
                            cursor: 'pointer',
                            fontWeight: '500'
                          }}
                        >
                          Unwind
                        </button>
                      </td>
                    </tr>
                  );
                }) : (
                  <tr>
                    <td colSpan="12" className="no-positions">No positions yet</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Trade History Section */}
        <div className="positions-section" style={{ marginTop: '2rem' }}>
          <h3>Trade History</h3>
          <div className="positions-table">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Market</th>
                  <th>Direction</th>
                  <th>Entry Price</th>
                  <th>Exit Price</th>
                  <th>DV01</th>
                  <th>Final P&L</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {tradeHistory.length > 0 ? tradeHistory.map((trade, i) => (
                  <tr key={i}>
                    <td>{trade.date}</td>
                    <td>{trade.market}</td>
                    <td className={trade.direction === 'Pay Fixed' ? 'pay-fixed' : 'receive-fixed'}>
                      {trade.direction}
                    </td>
                    <td>{trade.entryPrice}%</td>
                    <td>{trade.exitPrice}%</td>
                    <td>${trade.dv01?.toLocaleString()}</td>
                    <td className={parseFloat(trade.finalPL) >= 0 ? 'profit' : 'loss'}>
                      {parseFloat(trade.finalPL) >= 0 ? '+' : ''}${trade.finalPL}
                    </td>
                    <td>
                      <span style={{ 
                        color: trade.status === 'LIQUIDATED' ? '#ef4444' : '#22c55e',
                        fontWeight: 'bold'
                      }}>
                        {trade.status}
                      </span>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan="8" className="no-positions">No trade history yet</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        </>
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
                <span>Current DV01:</span>
                <span>${currentDv01.toLocaleString()}</span>
              </div>
              <div className="detail-row">
                <span>Days from Entry:</span>
                <span>{currentDay}</span>
              </div>
              <div className="detail-row">
                <span>Liquidation Price:</span>
                <span className="liq-price">
                  {(pendingTrade.type === 'pay' 
                    ? (parseFloat(pendingTrade.finalPrice) + ((margin / currentDv01) / 100))
                    : (parseFloat(pendingTrade.finalPrice) - ((margin / currentDv01) / 100))
                  ).toFixed(2)}%
                </span>
              </div>
              <div className="detail-row">
                <span>Fee:</span>
                <span className="fee">{(pendingTrade.feeRate * 100).toFixed(0)}bp</span>
              </div>
              {wallet && (
                <div className="detail-row">
                  <span>Wallet:</span>
                  <span style={{ fontSize: '0.875rem', color: '#10b981' }}>{formatAddress(wallet)}</span>
                </div>
              )}
            </div>
            <div className="modal-buttons">
              <button onClick={confirmTrade} className="confirm-btn">Confirm Trade</button>
              <button onClick={() => setPendingTrade(null)} className="cancel-btn">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {pendingUnwind && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Confirm Unwind</h3>
            <div className="trade-details">
              <div className="detail-row">
                <span>Position:</span>
                <span className="trade-type">{pendingUnwind.trade.type} Fixed</span>
              </div>
              <div className="detail-row">
                <span>Entry Price:</span>
                <span>{pendingUnwind.entryPrice}%</span>
              </div>
              <div className="detail-row">
                <span>Unwind Price:</span>
                <span className="execution-price">{pendingUnwind.executionPrice}%</span>
              </div>
              <div className="detail-row">
                <span>P&L:</span>
                <span className={parseFloat(pendingUnwind.pl) >= 0 ? 'profit' : 'loss'}>
                  {parseFloat(pendingUnwind.pl) >= 0 ? '+' : ''}${pendingUnwind.pl}
                </span>
              </div>
              <div className="detail-row">
                <span>Unwind Fee:</span>
                <span className="fee">{pendingUnwind.feeRate}bp (${pendingUnwind.feeAmount})</span>
              </div>
              <div className="detail-row">
                <span>Net Return:</span>
                <span className={parseFloat(pendingUnwind.netReturn) >= 0 ? 'profit' : 'loss'}>
                  ${pendingUnwind.netReturn}
                </span>
              </div>
            </div>
            <div className="modal-buttons">
              <button onClick={confirmUnwind} className="confirm-btn">Confirm Unwind</button>
              <button onClick={() => setPendingUnwind(null)} className="cancel-btn">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}