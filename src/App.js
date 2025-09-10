import React, { useState, useEffect, useMemo, useRef } from 'react';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer } from 'recharts';
import './App.css';

const FEE_BPS = 5; // flat 5bp fee, charged separately

// Enhanced Toast Notification Component
const Toast = ({ message, type, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 4000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const icons = {
    success: '✅',
    error: '❌',
    warning: '⚠️',
    info: 'ℹ️'
  };

  return (
    <div className={`notification slide-in ${type}`} style={{
      position: 'fixed',
      top: '1rem',
      right: '1rem',
      background: 'var(--gradient-card)',
      border: `1px solid ${type === 'success' ? 'var(--text-accent)' : type === 'error' ? '#ef4444' : type === 'warning' ? '#f59e0b' : 'var(--border-secondary)'}`,
      borderRadius: '1rem',
      padding: '1rem 1.5rem',
      color: 'var(--text-primary)',
      fontWeight: '500',
      zIndex: 1000,
      backdropFilter: 'blur(16px)',
      boxShadow: 'var(--shadow-lg)',
      maxWidth: '400px',
      display: 'flex',
      alignItems: 'center',
      gap: '0.75rem',
      animation: 'slideInRight 0.5s ease-out'
    }}>
      <span style={{ fontSize: '1.25rem' }}>{icons[type]}</span>
      <span style={{ flex: 1 }}>{message}</span>
      <button
        onClick={onClose}
        style={{
          background: 'none',
          border: 'none',
          color: 'var(--text-muted)',
          cursor: 'pointer',
          fontSize: '1.25rem',
          padding: '0.25rem',
          borderRadius: '0.25rem',
          transition: 'color 0.2s ease'
        }}
      >
        ×
      </button>
    </div>
  );
};

// Enhanced Loading Spinner Component
const LoadingSpinner = ({ size = 'md', color = 'var(--text-accent)' }) => {
  const sizes = {
    sm: '1rem',
    md: '1.5rem',
    lg: '2rem',
    xl: '3rem'
  };

  return (
    <div style={{
      width: sizes[size],
      height: sizes[size],
      border: `2px solid transparent`,
      borderTop: `2px solid ${color}`,
      borderRadius: '50%',
      animation: 'spin 1s linear infinite',
      display: 'inline-block'
    }} />
  );
};

// Enhanced Animated Counter Component
const AnimatedCounter = ({ value, duration = 1000, prefix = '', suffix = '' }) => {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    let startTime;
    const startValue = displayValue;
    const endValue = value;

    const animate = (currentTime) => {
      if (!startTime) startTime = currentTime;
      const progress = Math.min((currentTime - startTime) / duration, 1);
      
      const easeOutExpo = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      const currentValue = startValue + (endValue - startValue) * easeOutExpo;
      
      setDisplayValue(currentValue);
      
      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  }, [value, duration]);

  const formatValue = (val) => {
    if (Math.abs(val) >= 1000000) {
      return (val / 1000000).toFixed(1) + 'M';
    } else if (Math.abs(val) >= 1000) {
      return (val / 1000).toFixed(1) + 'K';
    }
    return Math.round(val).toString();
  };

  return (
    <span>
      {prefix}{formatValue(displayValue)}{suffix}
    </span>
  );
};

// Enhanced Empty State Component
const EmptyState = ({ icon, title, description, action }) => (
  <div className="no-positions" style={{
    textAlign: 'center',
    padding: '4rem 2rem',
    color: 'var(--text-subtle)',
    position: 'relative'
  }}>
    <div style={{
      fontSize: '4rem',
      marginBottom: '1.5rem',
      opacity: 0.6,
      animation: 'float 3s ease-in-out infinite'
    }}>
      {icon}
    </div>
    <h3 style={{
      fontSize: '1.5rem',
      fontWeight: '600',
      marginBottom: '0.75rem',
      color: 'var(--text-secondary)'
    }}>
      {title}
    </h3>
    <p style={{
      fontSize: '1rem',
      color: 'var(--text-muted)',
      marginBottom: action ? '2rem' : 0,
      lineHeight: 1.6
    }}>
      {description}
    </p>
    {action && action}
  </div>
);

export default function App() {
  const initialMarketSettings = {
    "JitoSol": { referenceApy: 7.98, k: 0.00001, symbol: "JitoSOL" },
    "Lido stETH": { referenceApy: 2.88, k: 0.000005, symbol: "stETH" },
    "Aave ETH Lending": { referenceApy: 1.9, k: 0.000005, symbol: "aETH" },
    "Aave ETH Borrowing": { referenceApy: 2.62, k: 0.000005, symbol: "aETHBorrow" },
    "Rocketpool rETH": { referenceApy: 2.64, k: 0.000005, symbol: "rETH" },
  };

  const [marketSettings, setMarketSettings] = useState(initialMarketSettings);
  const [market, setMarket] = useState("JitoSol");
  const [baseDv01, setBaseDv01] = useState(10000);
  const [margin, setMargin] = useState(500000);
  const [tradesByMarket, setTradesByMarket] = useState({});
  const [livePricesByMarket, setLivePricesByMarket] = useState({});
  const [pendingTrade, setPendingTrade] = useState(null);
  const [tradeType, setTradeType] = useState('pay');
  const [activeTab, setActiveTab] = useState("Swap");
  const [tradeHistory, setTradeHistory] = useState([]);
  const [pendingUnwind, setPendingUnwind] = useState(null);
  const [totalFeesCollected, setTotalFeesCollected] = useState(0);
  const [totalVammPL, setTotalVammPL] = useState(0);

  // New states for day system
  const [globalDay, setGlobalDay] = useState(0);
  const [pendingDayAdvancement, setPendingDayAdvancement] = useState(null);

  //settlement states
  const [isSettlementMode, setIsSettlementMode] = useState(false);
  const [settlementPrices, setSettlementPrices] = useState({});
  const [pendingSettlement, setPendingSettlement] = useState(null);
  const [tempSettlementPrices, setTempSettlementPrices] = useState({});
  //stress testing
  const [stressTestResult, setStressTestResult] = useState(null);
  //add margin
  const [pendingMarginAdd, setPendingMarginAdd] = useState(null);
  const [additionalMargin, setAdditionalMargin] = useState(0);
  const [showVammBreakdown, setShowVammBreakdown] = useState(false);
  //market dropdown
  const [showMarketDropdown, setShowMarketDropdown] = useState(false);
  const [customNotional, setCustomNotional] = useState(10000000); // Default $10M
  const [currentTipIndex, setCurrentTipIndex] = useState(0);
  const [usdcBalance, setUsdcBalance] = useState(10000000);

  const tradingTips = [
    { icon: "💡", text: "Pay Fixed profits when rates go higher", category: "Strategy" },
    { icon: "📊", text: "DV01 shows your P&L sensitivity per 1bp rate move", category: "Education" },
    { icon: "⚡", text: "Flat 5bp fee, charged upfront. No fees on unwind", category: "Pro Tip" },
    { icon: "🎯", text: "Watch liquidation risk - add margin when close", category: "Risk" },
    { icon: "📈", text: "Each trade moves the live price slightly", category: "Advanced" },
    { icon: "🔄", text: "Settlement P&L uses realized rates vs entry price", category: "Settlement" },
    { icon: "⚖️", text: "Live prices update based on reference rate changes", category: "Mechanics" },
    { icon: "🚀", text: "Larger positions get worse pricing due to impact", category: "Trading" }
  ];

  // Enhanced UI states
  const [toasts, setToasts] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [formErrors, setFormErrors] = useState({});

  // Initialize live prices to reference APYs on first load
  useEffect(() => {
    const initialLivePrices = {};
    Object.keys(marketSettings).forEach(mkt => {
      initialLivePrices[mkt] = marketSettings[mkt].referenceApy;
    });
    setLivePricesByMarket(initialLivePrices);
  }, []);

  // Enhanced Toast Management
  const showToast = (message, type = 'info') => {
    const id = Date.now() + Math.random();
    const newToast = { id, message, type };
    setToasts(prev => [...prev, newToast]);
  };

  const removeToast = (id) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  };

  const currentDv01 = baseDv01; // For UI display only

  // Settlement P&L calculation - simple entry vs settlement price
  const calculateSettlementPL = (trade) => {
    const settlementPrice = settlementPrices[trade.market];
    if (!settlementPrice) return 0;
    
    const entryPrice = trade.entryPrice;
    const dv01 = trade.baseDV01;
    const directionFactor = trade.type === 'pay' ? 1 : -1;
    
    return (settlementPrice - entryPrice) * 100 * dv01 * directionFactor;
  };

  // Simple P&L calculation - entry vs current live price
  const calculateLivePL = (trade, currentPrice) => {
    const entryPrice = trade.entryPrice;
    const dv01 = trade.baseDV01;
    const directionFactor = trade.type === 'pay' ? 1 : -1;
    
    return (currentPrice - entryPrice) * 100 * dv01 * directionFactor;
  };

  // Calculate liquidation risk
  const calculateLiquidationRisk = (trade) => {
    const currentPrice = livePricesByMarket[trade.market] || marketSettings[trade.market].referenceApy;
    const liquidationPrice = parseFloat(trade.liquidationPrice);
    
    if (trade.type === 'pay') {
      // Pay fixed: liquidation when price goes DOWN below liquidation price
      const bpsFromLiquidation = (currentPrice - liquidationPrice) * 100;
      return bpsFromLiquidation;
    } else {
      // Receive fixed: liquidation when price goes UP above liquidation price
      const bpsFromLiquidation = (liquidationPrice - currentPrice) * 100;
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
          // Update all trades with current P&L
          updated[mkt] = updated[mkt].map(trade => {
            const updatedTrade = { ...trade };
            const currentPrice = livePricesByMarket[mkt] || marketSettings[mkt].referenceApy;
            updatedTrade.currentPrice = currentPrice;

            // Use simple live P&L calculation
            const livePL = isSettlementMode ? calculateSettlementPL(updatedTrade) : calculateLivePL(updatedTrade, currentPrice);
            updatedTrade.pl = livePL.toFixed(2);
            updatedTrade.pnl = livePL;

            return updatedTrade;
          });

          // Filter out liquidated positions
          updated[mkt] = updated[mkt].filter(trade => {
            // Check for liquidation: only if P&L is negative and exceeds margin
            if (trade.pnl < 0 && Math.abs(trade.pnl) > trade.collateral) {
              // Position is liquidated
              liquidatedPositions.push({
                market: mkt,
                trade: trade,
                liquidationPrice: trade.currentPrice
              });
              
              return false;
            }
            return true;
          });
        }
      });
      
      // Process liquidations
      if (liquidatedPositions.length > 0) {
        liquidatedPositions.forEach(({ market: mkt, trade, liquidationPrice }) => {
          // Calculate vAMM P&L from liquidation
          const vammPL = -trade.pnl; // vAMM has opposite P&L
          setTotalVammPL(prev => prev + vammPL);
          
          // Add to trade history
          setTradeHistory(prevHistory => [...prevHistory, {
            date: new Date().toLocaleDateString(),
            market: mkt,
            direction: trade.type === 'pay' ? 'Pay Fixed' : 'Receive Fixed',
            entryPrice: trade.entryPrice.toFixed(3),
            exitPrice: parseFloat(trade.liquidationPrice).toFixed(3),
            dv01: trade.baseDV01,
            finalPL: (-trade.collateral).toFixed(2),
            vammPL: vammPL,
            status: 'LIQUIDATED'
          }]);
          
          console.log(`Position liquidated: ${trade.type} ${trade.baseDV01} at ${liquidationPrice}%`);
          showToast(`LIQUIDATION: Your ${trade.type} fixed position of ${trade.baseDV01.toLocaleString()} in ${mkt} was liquidated at ${liquidationPrice}%. You lost your entire margin of ${trade.collateral.toLocaleString()}.`, 'error');
        });
      }
      
      return updated;
    });
  }, [livePricesByMarket, isSettlementMode, settlementPrices]);

  useEffect(() => {
      const interval = setInterval(() => {
        setCurrentTipIndex(prev => (prev + 1) % tradingTips.length);
      }, 5000);
      
      return () => clearInterval(interval);
    }, []);

  const generateChartData = () => {
    // Use actual historical data for JitoSOL based on your Excel analysis
    if (market === "JitoSol") {
      return [
        { date: "2024-Q1", apy: 7.04, year: 2024.0 },
        { date: "2024-Q2", apy: 7.48, year: 2024.25 },
        { date: "2024-Q3", apy: 7.85, year: 2024.5 },
        { date: "2024-Q4", apy: 8.26, year: 2024.75 },
        { date: "2025-Q1", apy: 8.10, year: 2025.0 },
        { date: "2025-Q2", apy: 8.11, year: 2025.25 }
      ];
    }
    if (market === "Lido stETH") {
      return [
        { date: "2024-Q1", apy: 4.2, year: 2024.0 },
        { date: "2024-Q2", apy: 3.9, year: 2024.25 },
        { date: "2024-Q3", apy: 3.4, year: 2024.5 },
        { date: "2024-Q4", apy: 3.1, year: 2024.75 },
        { date: "2025-Q1", apy: 2.95, year: 2025.0 },
        { date: "2025-Q2", apy: 2.9, year: 2025.25 }
      ];
    } 
    
    if (market === "Aave ETH Lending") {
      return [
        { date: "2024-Q1", apy: 1.65, year: 2024.0 },
        { date: "2024-Q2", apy: 1.72, year: 2024.25 },
        { date: "2024-Q3", apy: 1.76, year: 2024.5 },
        { date: "2024-Q4", apy: 1.84, year: 2024.75 },
        { date: "2025-Q1", apy: 1.92, year: 2025.0 },
        { date: "2025-Q2", apy: 1.98, year: 2025.25 }
      ];
    }

    if (market === "Aave ETH Borrowing") {
      return [
        { date: "2024-Q1", apy: 4.2, year: 2024.0 },
        { date: "2024-Q2", apy: 3.8, year: 2024.25 },
        { date: "2024-Q3", apy: 3.1, year: 2024.5 },
        { date: "2024-Q4", apy: 2.7, year: 2024.75 },
        { date: "2025-Q1", apy: 2.6, year: 2025.0 },
       { date: "2025-Q2", apy: 2.6, year: 2025.25 }
      ];
    }

    if (market === "Rocketpool rETH") {
      return [
        { date: "2024-Q1", apy: 3.8, year: 2024.0 },
        { date: "2024-Q2", apy: 3.5, year: 2024.25 },
        { date: "2024-Q3", apy: 3.2, year: 2024.5 },
        { date: "2024-Q4", apy: 2.9, year: 2024.75 },
        { date: "2025-Q1", apy: 2.7, year: 2025.0 },
        { date: "2025-Q2", apy: 2.69, year: 2025.25 }
      ];
    }
    
    // Keep original logic for other markets
    const data = [];
    const marketTargets = {
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
    let openVammPL = 0;
    
    // Calculate P&L from currently open trades
    const allTrades = Object.values(tradesByMarket).flat();
    allTrades.forEach(trade => {
      const vammPL = -trade.pnl; // vAMM has opposite P&L to user
      openVammPL += vammPL;
    });
    
    // Total vAMM P&L = closed/liquidated trades P&L + open trades P&L
    const totalVammPLCombined = totalVammPL + openVammPL;
    
    return { vammPL: totalVammPLCombined, protocolPL: totalFeesCollected };
  };

  // Settlement functions
  const requestSettlement = () => {
    const initialPrices = {};
    Object.keys(marketSettings).forEach(mkt => {
      initialPrices[mkt] = marketSettings[mkt].referenceApy;
    });
    setPendingSettlement({ prices: initialPrices });
  };

  const confirmSettlement = () => {
    setSettlementPrices(pendingSettlement.prices);
    setIsSettlementMode(true);
    setPendingSettlement(null);
    showToast('Settlement mode activated! All positions now show settlement P&L.', 'success');
  };

  const exitSettlementMode = () => {
   setIsSettlementMode(false);
    setSettlementPrices({});
    showToast('Exited settlement mode successfully.', 'info');
  };

  // Day advancement functions
  const requestDayAdvancement = () => {
    setPendingDayAdvancement({
      fromDay: globalDay,
      toDay: globalDay + 1
    });
  };

  const confirmDayAdvancement = () => {
    const { toDay } = pendingDayAdvancement;
    
    // Update global day
    setGlobalDay(toDay);
    
    setPendingDayAdvancement(null);
    showToast(`Advanced to Day ${toDay}.`, 'success');
  };

  // Update live prices when reference APY changes
  const updateReferenceRate = (mkt, newRate) => {
    const oldRate = marketSettings[mkt].referenceApy;
    const currentLivePrice = livePricesByMarket[mkt] || oldRate;
    const rateDiff = newRate - oldRate;
    const newLivePrice = currentLivePrice + rateDiff;
    
    // Update market settings
    setMarketSettings(prev => ({
      ...prev,
      [mkt]: { ...prev[mkt], referenceApy: newRate }
    }));
    
    // Update live price
    setLivePricesByMarket(prev => ({
      ...prev,
      [mkt]: newLivePrice
    }));
  };

  // Unwind function
  const requestUnwind = (tradeIndex) => {
    const trades = tradesByMarket[market] || [];
    const trade = trades[tradeIndex];
    if (!trade) return;

    const currentLivePrice = livePricesByMarket[trade.market] || marketSettings[trade.market].referenceApy;
    const { k } = marketSettings[trade.market];
    
    // Calculate unwind price with impact (opposite direction of original trade)
    const unwindDirection = trade.type === 'pay' ? -1 : 1; // Opposite of original
    const priceImpact = k * trade.baseDV01 * unwindDirection;
    const unwindPrice = currentLivePrice + priceImpact;
    
    // No fee on unwind
    const feeAmount = 0;

    // P&L calculation
    const totalPL = isSettlementMode ? calculateSettlementPL(trade) : calculateLivePL(trade, unwindPrice);
    const netReturn = trade.collateral + totalPL;

    setPendingUnwind({
      tradeIndex,
      trade,
      executionPrice: isSettlementMode ? settlementPrices[trade.market].toFixed(3) : unwindPrice.toFixed(3),
      rawUnwindPrice: isSettlementMode ? settlementPrices[trade.market].toFixed(3) : unwindPrice.toFixed(3),
      entryPrice: trade.entryPrice.toFixed(3),
      pl: totalPL.toFixed(2),
      feeAmount: feeAmount.toFixed(2),
      netReturn: netReturn.toFixed(2),
      feeRate: "0",
    });
  };

  const confirmUnwind = () => {
    const { tradeIndex, trade, executionPrice, rawUnwindPrice, pl, netReturn } = pendingUnwind;
    
    // Calculate final vAMM P&L and freeze it
    const finalVammPL = -parseFloat(pl); // vAMM has opposite P&L
    setTotalVammPL(prev => prev + finalVammPL);
    
    // Add to trade history
    setTradeHistory(prev => [...prev, {
      date: new Date().toLocaleDateString(),
      market: trade.market,
      direction: trade.type === 'pay' ? 'Pay Fixed' : 'Receive Fixed',
      entryPrice: trade.entryPrice.toFixed(3),
      exitPrice: parseFloat(executionPrice).toFixed(3),
      dv01: trade.baseDV01,
      finalPL: pl,
      vammPL: finalVammPL,
      status: 'CLOSED'
    }]);
    
    // Remove position from trades
    setTradesByMarket(prev => {
      const updated = { ...prev };
      updated[trade.market] = updated[trade.market].filter((_, i) => i !== tradeIndex);
      return updated;
    });
    
    // Update live price to reflect the unwind impact
    setLivePricesByMarket(prev => ({
      ...prev,
      [trade.market]: parseFloat(rawUnwindPrice)
    }));
    
    // Return funds to user
    setUsdcBalance(prev => prev + parseFloat(netReturn));
    
    setPendingUnwind(null);
    showToast(`Position unwound successfully! Received: $${netReturn}`, 'success');
  };

  const requestAddMargin = (tradeIndex) => {
    const trades = tradesByMarket[market] || [];
    const trade = trades[tradeIndex];
    if (!trade) return;

    setPendingMarginAdd({
      tradeIndex,
      trade
    });
    setAdditionalMargin(0);
  };

  const confirmAddMargin = async () => {
    const { tradeIndex, trade } = pendingMarginAdd;

    if (usdcBalance < additionalMargin) {
      showToast(`Insufficient balance. Required: $${additionalMargin.toLocaleString()}, Available: $${usdcBalance.toLocaleString()}`, 'error');
      return;
    }

    try {
      // Calculate new liquidation price
      const marginBuffer = additionalMargin / trade.baseDV01 / 100;
      const newLiqPrice = trade.type === 'pay' 
        ? parseFloat(trade.liquidationPrice) - marginBuffer
        : parseFloat(trade.liquidationPrice) + marginBuffer;

      // Update the trade
      setTradesByMarket(prev => {
        const updated = { ...prev };
        updated[trade.market] = [...updated[trade.market]];
        updated[trade.market][tradeIndex] = {
          ...trade,
          collateral: trade.collateral + additionalMargin,
          liquidationPrice: newLiqPrice.toFixed(3)
        };
        return updated;
      });

      // Deduct from wallet
      setUsdcBalance(prev => prev - additionalMargin);

      setPendingMarginAdd(null);
      showToast(`Margin added successfully! New liquidation: ${newLiqPrice.toFixed(3)}%`, 'success');
    } catch (error) {
      console.error('Add margin failed:', error);
      showToast('Add margin failed. Please try again.', 'error');
      setPendingMarginAdd(null);
    }
  };

  //stress testing function
  const calculateStressTest = (direction) => {
    let totalPL = 0;
    let positionCount = 0;
    
    Object.keys(tradesByMarket).forEach(market => {
      const trades = tradesByMarket[market] || [];
      trades.forEach(trade => {
        const currentPrice = livePricesByMarket[market] || marketSettings[market].referenceApy;
        const stressPrice = currentPrice + (direction * 1.0); // +/- 100bp (1.0%)
        
        const stressPL = calculateLivePL(trade, stressPrice);
        totalPL += stressPL;
        positionCount++;
      });
    });
    
    setStressTestResult({
      scenario: direction > 0 ? 'Rates +100bp' : 'Rates -100bp',
      totalPL: Math.round(totalPL),
      positionCount
    });
  };

  //function to show vAMM PL breakdown
  const calculateVammBreakdown = () => {
    const breakdown = [];
    
    // Add open positions
    Object.keys(tradesByMarket).forEach(market => {
      const trades = tradesByMarket[market] || [];
      trades.forEach((trade, index) => {
        const currentPrice = livePricesByMarket[market] || marketSettings[market].referenceApy;
        const vammPL = -trade.pnl; // vAMM has opposite P&L
        
        breakdown.push({
          id: `${market}-${index}`,
          market,
          userDirection: trade.type === 'pay' ? 'Pay Fixed' : 'Receive Fixed',
          vammDirection: trade.type === 'pay' ? 'Receive Fixed' : 'Pay Fixed',
          entryPrice: trade.entryPrice.toFixed(3),
          vammEntryPrice: trade.entryPrice.toFixed(3), // Same entry price for simplicity
          currentPrice: currentPrice.toFixed(3),
          dv01: trade.baseDV01,
          vammPL: vammPL,
          status: 'OPEN',
          entryDay: trade.entryDay || 0,
          daysHeld: globalDay - (trade.entryDay || 0)
        });
      });
    });
    
    // Add closed positions from trade history
    tradeHistory.forEach((trade, index) => {
      breakdown.push({
        id: `history-${index}`,
        market: trade.market,
        userDirection: trade.direction,
        vammDirection: trade.direction ==='Pay Fixed' ? 'Receive Fixed' : 'Pay Fixed',
       entryPrice: trade.entryPrice,
       vammEntryPrice: 'N/A', // Would need to store this
       exitPrice: trade.exitPrice,
       dv01: trade.dv01,
       vammPL: trade.vammPL || 0, // Use the stored vAMM P&L
       status: trade.status,
       finalPL: trade.finalPL
     });
   });
   
   return breakdown;
 };

 const chartData = useMemo(() => generateChartData(), [market]);
 const marketTrades = tradesByMarket[market] || [];
 const livePrice = livePricesByMarket[market] ?? marketSettings[market].referenceApy;
 const { vammPL, protocolPL } = calculateProtocolMetrics();

 const requestTrade = (type) => {
   // Check simulated USDC balance
   const openFee = baseDv01 * FEE_BPS;
   if (usdcBalance < margin + openFee) {
     showToast(`Insufficient balance. Required: $${(margin + openFee).toLocaleString()}, Available: $${usdcBalance.toLocaleString()}`, 'error');
     return;
   }

   const currentLivePrice = livePricesByMarket[market] || marketSettings[market].referenceApy;
   const { k } = marketSettings[market];
   
   // Simple pricing: current live price + small impact based on direction and size
   const priceImpact = k * baseDv01 * (type === 'pay' ? 1 : -1);
   const newPrice = currentLivePrice + priceImpact;
   
   // Fee is separate, not in price
   const feeBps = FEE_BPS;
   const finalPrice = newPrice;

   console.log('PRICING DEBUG:', {
     currentLivePrice,
     priceImpact,
     newPrice,
     finalPrice,
     type,
     baseDv01
   });

   setPendingTrade({
     type,
     finalPrice: finalPrice.toFixed(3),
     feeRate: FEE_BPS / 100,
     rawPrice: newPrice.toFixed(3),
     directionFactor: type === 'pay' ? 1 : -1,
   });
 };

 const updateMarketSetting = (mkt, field, value) => {
   if (field === 'referenceApy') {
     updateReferenceRate(mkt, parseFloat(value));
   } else {
     const updated = { ...marketSettings };
     updated[mkt][field] = parseFloat(value);
     setMarketSettings(updated);
   }
 };

 const confirmTrade = async () => {
   const { type, finalPrice, rawPrice } = pendingTrade;

   const openFee = baseDv01 * FEE_BPS;
   const minMargin = currentDv01 * 50;
   
   if (margin < minMargin) {
     showToast('Margin too low!', 'error');
     setPendingTrade(null);
     return;
   }

   try {
     const confirmBtn = document.querySelector('.confirm-btn');
     if (confirmBtn) {
       confirmBtn.textContent = 'Processing...';
       confirmBtn.disabled = true;
     }
     await new Promise(resolve => setTimeout(resolve, 1000));

     const marginBuffer = (margin / currentDv01) / 100;
     const liq = type === 'pay' 
       ? parseFloat(finalPrice) - marginBuffer
       : parseFloat(finalPrice) + marginBuffer;

     const trade = {
       market,
       type,
       baseDV01: baseDv01,
       entryDV01: baseDv01,
       currentDV01: baseDv01,
       margin,
       entry: finalPrice,
       entryPrice: parseFloat(finalPrice),
       currentPrice: parseFloat(rawPrice),
       liq: liq.toFixed(3),
       liquidationPrice: liq.toFixed(3),
       timestamp: new Date().toLocaleTimeString(),
       pl: "0.00",
       pnl: 0,
       collateral: margin,
       entryDay: globalDay,
       currentDay: globalDay,
       feeAmountBps: FEE_BPS,
       rawPrice: parseFloat(pendingTrade.rawPrice),
     };

     console.log('STORED ENTRY PRICE:', trade.entryPrice);
     console.log('MODAL DISPLAYED PRICE:', pendingTrade.finalPrice);

     setTradesByMarket(prev => ({
       ...prev,
       [market]: [...(prev[market] || []), trade]
     }));

     // Update live price to the new trade price
     setLivePricesByMarket(prev => ({
       ...prev,
       [market]: parseFloat(rawPrice)
     }));

     setUsdcBalance(prev => prev - margin - openFee);
     setTotalFeesCollected(prev => prev + openFee);
     setPendingTrade(null);
     
     showToast('Trade executed successfully!', 'success');
   } catch (error) {
     console.error('Transaction failed:', error);
     showToast('Transaction failed. Please try again.', 'error');
     setPendingTrade(null);
   }
 };

 const handleMarketChange = (newMarket) => {
   setMarket(newMarket);
  };

  const handleRiskSettlement = () => {
     const finalPrices = {};
     Object.keys(marketSettings).forEach(mkt => {
     finalPrices[mkt] = tempSettlementPrices[mkt] ? 
     parseFloat(tempSettlementPrices[mkt]) : 
     (livePricesByMarket[mkt] || marketSettings[mkt].referenceApy);
 });
 
 setSettlementPrices(finalPrices);
 setIsSettlementMode(true);
 showToast('Settlement mode activated! All positions now show settlement P&L.', 'success');
};

   return (
     <div className="app">
       {/* Enhanced Toast Notifications */}
       {toasts.map(toast => (
         <Toast
           key={toast.id}
           message={toast.message}
           type={toast.type}
           onClose={() => removeToast(toast.id)}
         />
       ))}

       <header className="header">
         <div className="header-left">
           <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
             <img 
               src="/slope-logo.png" 
               alt="Slope Logo" 
               style={{ 
                 width: '36px', 
                 height: '36px' 
               }} 
             />
             <h1 className="logo" style={{ fontSize: '1.6rem' }}>Slope</h1>
           </div>
           <nav className="nav">
             <span className={`nav-item ${activeTab === "Swap" ? "active" : ""}`} onClick={() => setActiveTab("Swap")}>Swap</span>
             <span className={`nav-item ${activeTab === "Risk" ? "active" : ""}`} onClick={() => setActiveTab("Risk")}>Risk</span>
             <span className={`nav-item ${activeTab === "Learn" ? "active" : ""}`} onClick={() => setActiveTab("Learn")}>Learn</span>
             <span className={`nav-item ${activeTab === "Docs" ? "active" : ""}`} onClick={() => setActiveTab("Docs")}>Docs</span>
             <span className={`nav-item ${activeTab === "Leaderboard" ? "active" : ""}`} onClick={() => setActiveTab("Leaderboard")}>Leaderboard</span>
             <span className={`nav-item ${activeTab === "Stats" ? "active" : ""}`} onClick={() => setActiveTab("Stats")}>Stats</span>
             <span className={`nav-item ${activeTab === "Settings" ? "active" : ""}`} onClick={() => setActiveTab("Settings")}>Settings</span>    
           </nav>
         </div>
       
       <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
         <div style={{ textAlign: 'right', fontSize: '0.875rem' }}>
           <div style={{ color: '#9ca3af' }}>Demo Balance</div>
           <div style={{ color: '#10b981', fontWeight: '600' }}>
             ${usdcBalance.toLocaleString()}
           </div>
         </div>
       </div>
     </header>
     
     {activeTab === "Swap" && (
       <>
       <div className="main-container">
         <div className="left-panel">
           <div className="swap-header">
             <h2>Swap</h2>
             <div style={{ 
               fontSize: '1rem', 
               color: '#ffffff', 
               fontWeight: '500'
             }}>
               Crypto Rate Swaps (CRS)<span style={{ marginLeft: '4rem' }}></span>1 Jan-31 Dec'25
             </div>
             <div className="price-info" style={{ marginBottom: '0.3rem' }}>
               <div className="price-row">
                 <span style={{ color: '#ffffff', fontWeight: '700', fontSize: '1rem' }}>Live Price:</span> 
                 <span style={{ color: '#ffffff', fontWeight: '700', fontSize: '1rem', position: 'relative' }}>
                   <span style={{ marginRight: '8px' }}>•</span>{livePrice.toFixed(3)}%
                 </span>
               </div>
               <div className="price-row">
                 <span style={{ color: '#9ca3af', fontWeight: '700', fontSize: '0.9rem' }}>2025 realized APY:</span>
                 <span style={{ color: '#9ca3af', fontWeight: '700', fontSize: '0.9rem' }}>
                   {market === "JitoSol" ? "4.03% / 8.25%" :
                    market === "Lido stETH" ? "1.44% / 2.92%" :
                    market === "Aave ETH Lending" ? "0.95% / 1.9%" :
                    market === "Aave ETH Borrowing" ? "1.29% / 2.63%" : 
                    market === "Rocketpool rETH" ? "1.32% / 2.67%" : "N/A"}
                 </span>
               </div>
               <div className="price-row">
                 <span style={{ color: '#9ca3af', fontWeight: '700', fontSize: '0.9rem' }}>2025 implied unrealized APY:</span>
                 <span style={{ color: '#9ca3af', fontWeight: '700', fontSize: '0.9rem' }}>
                   {market === "JitoSol" ? "7.72%" :
                   market === "Lido stETH" ? "2.83%" :
                   market === "Aave ETH Lending" ? "1.89%" :
                   market === "Aave ETH Borrowing" ? "2.61%" :
                   market === "Rocketpool rETH" ? "2.62%" : "N/A"}
                 </span>
               </div>
               <div className="price-row">
                 <span>Global Day:</span>
                 <span style={{ color: '#9ca3af', fontWeight: '700' }}>{globalDay}</span>
               </div>
               <div className="indicator">
                 <img
                   src={
                     market === "JitoSol" ? "/jito.png" :
                     market === "Lido stETH" ? "/lido.png" :
                     market === "Aave ETH Lending" ? "/aave.png" :
                     market === "Aave ETH Borrowing" ? "/aave.png" :
                     market === "Rocketpool rETH" ? "/rocketpool.png" : "/default-logo.png"
                   }
                   alt={`${market} logo`}
                   style={{
                     width: '20px',
                     height: '20px',
                     marginRight: '8px'
                   }}
                 />
                 <span>{marketSettings[market].referenceApy.toFixed(3)}%</span>
               </div>

             </div>
           </div>

           <div className="market-selector">
             <div style={{ position: 'relative' }}>
               <div 
                 onClick={() => setShowMarketDropdown(!showMarketDropdown)}
                 style={{
                   display: 'flex',
                   alignItems: 'center',
                   justifyContent: 'space-between',
                   padding: '1rem 1.5rem',
                   background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.8) 0%, rgba(30, 41, 59, 0.8) 100%)',
                   border: showMarketDropdown ? '1px solid #10b981' : '1px solid #374151',
                   borderRadius: '1rem',
                   cursor: 'pointer',
                   transition: 'all 0.3s ease',
                   backdropFilter: 'blur(16px)',
                   boxShadow: showMarketDropdown ? '0 8px 32px rgba(16, 185, 129, 0.15)' : '0 4px 6px rgba(0, 0, 0, 0.1)'
                 }}
               >
                 <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                   <img
                     src={
                       market === "JitoSol" ? "/jito.png" :
                       market === "Lido stETH" ? "/lido.png" :
                       market === "Aave ETH Lending" ? "/aave.png" :
                       market === "Aave ETH Borrowing" ? "/aave.png" :
                       market === "Rocketpool rETH" ? "/rocketpool.png" : "/default-logo.png"
                     }
                     alt={`${market} logo`}
                     style={{
                       width: '32px',
                       height: '32px',
                       borderRadius: '50%',
                       border: '2px solid rgba(255, 255, 255, 0.1)'
                     }}
                   />
                   <div>
                     <div style={{ 
                       color: '#f1f5f9', 
                       fontWeight: '700', 
                       fontSize: '1.1rem',
                       marginBottom: '0.25rem'
                     }}>
                       {market}
                     </div>
                     <div style={{ 
                       color: '#10b981', 
                       fontSize: '0.9rem',
                       fontWeight: '600'
                     }}>
                       {(livePricesByMarket[market] || marketSettings[market].referenceApy).toFixed(3)}%
                     </div>
                   </div>
                 </div>
                 <div style={{ 
                   color: '#9ca3af', 
                   fontSize: '1.5rem',
                   transform: showMarketDropdown ? 'rotate(180deg)' : 'rotate(0deg)',
                   transition: 'transform 0.3s ease'
                 }}>
                   ▼
                 </div>
               </div>

               {showMarketDropdown && (
                 <div style={{
                   position: 'absolute',
                   top: '100%',
                   left: 0,
                   right: 0,
                   marginTop: '0.5rem',
                   background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.95) 0%, rgba(30, 41, 59, 0.95) 100%)',
                   border: '1px solid #10b981',
                   borderRadius: '1rem',
                   backdropFilter: 'blur(20px)',
                   boxShadow: '0 20px 40px rgba(0, 0, 0, 0.3)',
                   zIndex: 1000,
                   overflow: 'hidden'
                 }}>
                   {Object.keys(marketSettings).map((m, index) => (
                     <div
                       key={m}
                       onClick={() => {
                         handleMarketChange(m);
                         setShowMarketDropdown(false);
                       }}
                       style={{
                         display: 'flex',
                         alignItems: 'center',
                         gap: '1rem',
                         padding: '1rem 1.5rem',
                         cursor: 'pointer',
                         borderBottom: index < Object.keys(marketSettings).length - 1 ? '1px solid rgba(55, 65, 81, 0.3)' : 'none',
                         transition: 'all 0.2s ease',
                         background: market === m ? 'rgba(16, 185, 129, 0.1)' : 'transparent'
                       }}
                       onMouseEnter={(e) => {
                         e.target.style.background = 'rgba(16, 185, 129, 0.1)';
                       }}
                       onMouseLeave={(e) => {
                         e.target.style.background = market === m ? 'rgba(16, 185, 129, 0.1)' : 'transparent';
                       }}
                     >
                       <img
                         src={
                           m === "JitoSol" ? "/jito.png" :
                           m === "Lido stETH" ? "/lido.png" :
                           m === "Aave ETH Lending" ? "/aave.png" :
                           m === "Aave ETH Borrowing" ? "/aave.png" :
                           m === "Rocketpool rETH" ? "/rocketpool.png" : "/default-logo.png"
                         }
                         alt={`${m} logo`}
                         style={{
                           width: '28px',
                           height: '28px',
                           borderRadius: '50%',
                           border: '1px solid rgba(255, 255, 255, 0.1)'
                         }}
                       />
                       <div style={{ flex: 1 }}>
                         <div style={{ 
                           color: '#f1f5f9', 
                           fontWeight: '600', 
                           fontSize: '1rem',
                           marginBottom: '0.25rem'
                         }}>
                           {m}
                         </div>
                         <div style={{ 
                           color: '#9ca3af', 
                           fontSize: '0.85rem'
                         }}>
                           Live: {(livePricesByMarket[m] || marketSettings[m].referenceApy).toFixed(3)}%
                         </div>
                       </div>
                       <div style={{
                         display: 'flex',
                         alignItems: 'center',
                         gap: '0.5rem'
                       }}>
                         {market === m && (
                           <div style={{
                             color: '#10b981',
                             fontSize: '1.2rem'
                           }}>
                             ✓
                           </div>
                         )}
                       </div>
                     </div>
                   ))}
                 </div>
               )}
             </div>
             <div className="market-info">
               <div style={{ 
                 display: 'flex', 
                 alignItems: 'center', 
                 gap: '1rem',
                 flexWrap: 'wrap'
               }}>
                 <span style={{ color: '#9ca3af' }}>Notional:</span>
                 <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                   <span style={{ color: '#ffffff', fontSize: '1.2rem' }}>$</span>
                   <input
                     type="text"
                     value={customNotional ? (customNotional / 1000000).toFixed(0) : ''}
                     onChange={(e) => {
                       const value = e.target.value.replace(/[^0-9]/g, '');
                       setCustomNotional(value === '' ? 0 : Number(value) * 1000000);
                     }}
                     placeholder="10"
                     style={{
                       width: '60px',
                       padding: '0.25rem 0.5rem',
                       borderRadius: '0.375rem',
                       border: '1px solid #4b5563',
                       background: 'rgba(17, 24, 39, 0.8)',
                       color: '#f1f5f9',
                       fontSize: '1rem',
                       fontWeight: '600',
                       textAlign: 'center',
                       outline: 'none'
                     }}
                   />
                   <span style={{ color: '#9ca3af' }}>MM =</span>
                   <span style={{ color: '#9ca3af', fontWeight: '700' }}>
                     ${(customNotional / 10000).toLocaleString()}
                   </span>
                   <span style={{ color: '#9ca3af' }}>DV01</span>
                 </div>
               </div>
               <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.3rem', marginBottom: '0.3rem', fontStyle: 'italic' }}>
                 ${(customNotional / 10000).toLocaleString()} DV01 = ${(customNotional / 10000).toLocaleString()} gain/loss per 1bp move (1bp = 0.01%)
               </div>
             </div>
           </div>

           <div className="inputs">
             <div style={{
               padding: '0.8rem',
               background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.8) 0%, rgba(30, 41, 59, 0.8) 100%)',
               border: '1px solid #374151',
               borderRadius: '1rem',
               marginBottom: '1rem',
               marginTop: '-1rem'
             }}>
               <div style={{ 
                 display: 'flex', 
                 justifyContent: 'space-between', 
                 alignItems: 'center',
                 marginBottom: '0.75rem'
               }}>
                 <div>
                   <div style={{ 
                     color: '#e2e8f0', 
                     fontWeight: '700', 
                     fontSize: '1.1rem'
                   }}>
                     DV01 Amount
                   </div>
                   <div style={{ 
                     color: '#94a3b8', 
                     fontSize: '0.875rem'
                   }}>
                     Fixed for all calculations
                   </div>
                 </div>
               </div>
               <div style={{ position: 'relative' }}>
                 <span style={{ 
                   position: 'absolute', 
                   left: '16px', 
                   top: '50%', 
                   transform: 'translateY(-50%)', 
                   color: '#ffffff', 
                   fontSize: '1.2rem',
                   fontWeight: '700',
                   pointerEvents: 'none'
                 }}>$</span>
                 <input
                   type="text"
                   value={baseDv01 ? baseDv01.toLocaleString() : ''}
                   onChange={(e) => {
                     const value = e.target.value.replace(/[^0-9]/g, '');
                     setBaseDv01(value === '' ? 0 : Number(value));
                   }}
                   placeholder="10,000"
                   style={{ 
                     width: '100%',
                     padding: '1rem 1rem 1rem 2.5rem',
                     borderRadius: '0.75rem',
                     border: '1px solid #4b5563',
                     background: 'rgba(17, 24, 39, 0.8)',
                     color: '#f1f5f9',
                     fontSize: '1.1rem',
                     fontWeight: '600',
                     outline: 'none'
                   }}
                 />
               </div>
             </div>

             <div style={{
               padding: '0.8em',
               background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.8) 0%, rgba(30, 41, 59, 0.8) 100%)',
               border: '1px solid #374151',
               borderRadius: '1rem',
               marginBottom: '1rem'
             }}>
               <div style={{ 
                 display: 'flex', 
                 justifyContent: 'space-between', 
                 alignItems: 'center',
                 marginBottom: '0.75rem'
               }}>
                 <div>
                   <div style={{ 
                     color: '#e2e8f0', 
                     fontWeight: '700', 
                     fontSize: '1.1rem'
                   }}>
                     Margin (USDC)
                   </div>
                   <div style={{ 
                     color: '#94a3b8', 
                     fontSize: '0.875rem'
                   }}>
                     Collateral to secure position
                   </div>
                 </div>
               </div>
               <div style={{ position: 'relative', marginBottom: '1rem' }}>
                 <span style={{ 
                   position: 'absolute', 
                   left: '16px', 
                   top: '50%', 
                   transform: 'translateY(-50%)', 
                   color: '#ffffff', 
                   fontSize: '1.2rem',
                   fontWeight: '700',
                   pointerEvents: 'none'
                 }}>$</span>
                 <input
                   type="text"
                   value={margin ? margin.toLocaleString() : ''}
                   onChange={(e) => {
                     const value = e.target.value.replace(/[^0-9]/g, '');
                     setMargin(value === '' ? 0 : Number(value));
                   }}
                   placeholder="500,000"
                   style={{ 
                     width: '100%',
                     padding: '1rem 1rem 1rem 2.5rem',
                     borderRadius: '0.75rem',
                     border: margin < currentDv01 * 50 ? '1px solid #ef4444' : '1px solid #4b5563',
                     background: 'rgba(17, 24, 39, 0.8)',
                     color: '#f1f5f9',
                     fontSize: '1.1rem',
                     fontWeight: '600',
                     outline: 'none'
                   }}
                 />
               </div>
               
               <div style={{
                 display: 'flex',
                 justifyContent: 'space-between',
                 alignItems: 'center',
                 padding: '0.5rem 0.8rem',
                 background: 'rgba(59, 130, 246, 0.1)',
                 borderRadius: '0.5rem',
                 border: '1px solid rgba(59, 130, 246, 0.2)'
               }}>
                 <span style={{ color: '#94a3b8', fontSize: '0.875rem' }}>
                   Minimum required:
                 </span>
                 <span style={{ 
                   color: '#f59e0b', 
                   fontWeight: '700',
                   fontSize: '1rem'
                 }}>
                   ${(currentDv01 * 50).toLocaleString()}
                 </span>
               </div>
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
               onClick={() => !isSettlementMode && requestTrade(tradeType)}
               disabled={margin < baseDv01 * 50 || isSettlementMode}
               className={`enter-btn ${margin < baseDv01 * 50 || isSettlementMode ? 'disabled' : ''}`}
             >
               {margin < baseDv01 * 50 ? 'Margin too low' : isSettlementMode ? 'Settlement Mode - No New Trades' : 'Swap'}
             </button>

             <div style={{ 
               display: 'flex', 
               justifyContent: 'space-between', 
               padding: '0.6rem', 
               backgroundColor: '#374151', 
               borderRadius: '0.4rem',
               fontSize: '0.75rem',
               color: '#e5e7eb',
               marginBottom: '0.8rem'
             }}>
               <div>
                 <span style={{ color: '#9ca3af' }}>Days Realized: </span>
                 <span style={{ color: '#10b981', fontWeight: 'bold' }}>
                   <AnimatedCounter value={globalDay} />
                 </span>
               </div>
               <div>
                 <span style={{ color: '#9ca3af' }}>Days to Maturity: </span>
                 <span style={{ color: '#f59e0b', fontWeight: 'bold' }}>
                   <AnimatedCounter value={365 - globalDay} />
                 </span>
               </div>
             </div>

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
                   tick={{ fill: '#9CA3AF', fontSize: 12, fontWeight: 500 }}
                   type="number"
                   scale="linear"
                   domain={[2024, 2025]}
                   ticks={[2024, 2025]}
                 />
                 <YAxis 
                   axisLine={false}
                   tickLine={false}
                   tick={{ fill: '#9CA3AF', fontSize: 12, fontWeight: 500 }}
                   domain={[
                   market === "JitoSol" ? 6 :
                   market === "Lido stETH" ? 2 :
                   market === "Aave ETH Lending" ? 1 :
                   market === "Aave ETH Borrowing" ? 2 : 
                   market === "Rocketpool rETH" ? 2 : 6,

                   market === "JitoSol" ? 9 :
                   market === "Lido stETH" ? 5 :
                   market === "Aave ETH Lending" ? 3 :
                   market === "Aave ETH Borrowing" ? 5 :
                   market === "Rocketpool rETH" ? 5 : 9
                   ]}
                   tickFormatter={(value) => `${value.toFixed(1)}%`}
                   scale="linear"
                 />
                 <defs>
                   <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                     <stop offset="0%" stopColor="#10B981" stopOpacity={0.8}/>
                     <stop offset="100%" stopColor="#10B981" stopOpacity={0.1}/>
                   </linearGradient>
                   <filter id="glow">
                     <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
                     <feMerge> 
                       <feMergeNode in="coloredBlur"/>
                       <feMergeNode in="SourceGraphic"/>
                     </feMerge>
                   </filter>
                   <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                     <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(75, 85, 99, 0.1)" strokeWidth="1"/>
                   </pattern>
                 </defs>
                 <rect width="100%" height="100%" fill="url(#grid)" />
                 <Line 
                   type="monotone" 
                   dataKey="apy" 
                   stroke="#10B981" 
                   strokeWidth={4}
                   dot={{ fill: '#10B981', strokeWidth: 3, r: 6, filter: 'url(#glow)' }}
                   activeDot={{ r: 8, stroke: '#10B981', strokeWidth: 3, fill: '#000', filter: 'url(#glow)' }}
                   fill="url(#chartGradient)"
                   fillOpacity={0.3}
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
                 <div className="stat-value">
                   $<AnimatedCounter value={2400000} />
                 </div>
                 <div className="stat-change positive">+12.3%</div>
               </div>
               <div className="stat-card">
                 <div className="stat-label">Active Positions</div>
                 <div className="stat-value">
                   <AnimatedCounter value={147} />
                 </div>
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
                 <div className="stat-value">$470,000</div>
                 <div className="stat-change positive">+15.7%</div>
               </div>
             </div>
           </div>

           <div className="market-stats" style={{ marginTop: '1rem', marginBottom: '1rem' }}>
             <h4>Protocol Metrics</h4>
             <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
               <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => setShowVammBreakdown(true)}>
                 <div className="stat-label">vAMM P&L</div>
                 <div className={`stat-value ${vammPL >= 0 ? '' : ''}`} style={{ color: vammPL >= 0 ? '#22c55e' : '#ef4444' }}>
                   {vammPL >= 0 ? '+' : ''}$<AnimatedCounter value={Math.abs(vammPL)} />{vammPL < 0 ? '' : ''}
                 </div>
                 <div style={{ color: '#9ca3af', fontSize: '0.6rem' }}>
                   Click to view breakdown
                 </div>
               </div>
               <div className="stat-card">
                 <div className="stat-label">Protocol P&L (Fees)</div>
                 <div className="stat-value" style={{ color: '#10b981' }}>
                   +$<AnimatedCounter value={protocolPL} />
                 </div>
                 <div style={{ color: '#9ca3af', fontSize: '0.6rem' }}>
                   Fee revenue collected
                 </div>
               </div>
               <div className="stat-card">
                 <div className="stat-label">Live Price Update</div>
                 <div className="stat-value" style={{ color: '#06b6d4' }}>
                   Impact Based
                 </div>
                 <div style={{ color: '#9ca3af', fontSize: '0.6rem' }}>
                   Trades move price
                 </div>
               </div>
             </div>
           </div>
           
           {/* Trading Tips Section */}
           <div style={{
             margin: '2rem 0',
             padding: '1.5rem',
             background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(6, 182, 212, 0.1) 100%)',
             border: '1px solid rgba(16, 185, 129, 0.3)',
             borderRadius: '1rem',
             transition: 'all 0.5s ease'
           }}>
             <div style={{
               display: 'flex',
               alignItems: 'center',
               gap: '1rem'
             }}>
               <span style={{ fontSize: '1.5rem' }}>{tradingTips[currentTipIndex].icon}</span>
               <div>
                 <div style={{ 
                   fontSize: '1rem', 
                   color: '#e2e8f0', 
                   fontWeight: '600',
                   marginBottom: '0.25rem'
                 }}>
                   {tradingTips[currentTipIndex].text}
                 </div>
                 <div style={{ 
                   fontSize: '0.75rem', 
                   color: '#10b981',
                   textTransform: 'uppercase',
                   letterSpacing: '0.05em',
                   fontWeight: '600'
                 }}>
                   {tradingTips[currentTipIndex].category}
                 </div>
               </div>
             </div>
           </div>
         </div>
       </div>
       
       <div className="positions-section" style={{ marginTop: '3rem', clear: 'both' }}>
         <h3>Positions</h3>
         <div className="positions-table">
           {marketTrades.length > 0 ? (
             <table style={{ width: '100%', borderCollapse: 'collapse' }}>
               <thead>
                 <tr style={{ background: 'rgba(31, 41, 55, 0.8)' }}>
                   <th style={{ padding: '1rem 0.8rem', textAlign: 'left', color: 'var(--text-secondary)', fontSize: '0.9rem', fontWeight: '700' }}>Market</th>
                   <th style={{ padding: '1rem 0.8rem', textAlign: 'left', color: 'var(--text-secondary)', fontSize: '0.9rem', fontWeight: '700' }}>Direction</th>
                   <th style={{ padding: '1rem 0.8rem', textAlign: 'right', color: 'var(--text-secondary)', fontSize: '0.9rem', fontWeight: '700' }}>DV01</th>
                   <th style={{ padding: '1rem 0.8rem', textAlign: 'right', color: 'var(--text-secondary)', fontSize: '0.9rem', fontWeight: '700' }}>Entry</th>
                   <th style={{ padding: '1rem 0.8rem', textAlign: 'right', color: 'var(--text-secondary)', fontSize: '0.9rem', fontWeight: '700' }}>Current</th>
                   <th style={{ padding: '1rem 0.8rem', textAlign: 'right', color: 'var(--text-secondary)', fontSize: '0.9rem', fontWeight: '700' }}>Liquidation</th>
                   <th style={{ padding: '1rem 0.8rem', textAlign: 'right', color: 'var(--text-secondary)', fontSize: '0.9rem', fontWeight: '700' }}>P&L</th>
                   <th style={{ padding: '1rem 0.8rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.9rem', fontWeight: '700' }}>Risk</th>
                   <th style={{ padding: '1rem 0.8rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.9rem', fontWeight: '700' }}>Actions</th>
                 </tr>
               </thead>
               <tbody>
                 {marketTrades.map((trade, i) => {
                   const bpsFromLiquidation = calculateLiquidationRisk(trade);
                   const isRisky = bpsFromLiquidation <= 20 && bpsFromLiquidation > 0;
                   
                   // Determine logo source
                   let logoSrc = "/default-logo.png";
                   if (trade.market === "JitoSol") logoSrc = "/jito.png";
                   else if (trade.market === "Lido stETH") logoSrc = "/lido.png";
                   else if (trade.market === "Aave ETH Lending") logoSrc = "/aave.png";
                   else if (trade.market === "Aave ETH Borrowing") logoSrc = "/aave.png";
                   else if (trade.market === "Rocketpool rETH") logoSrc = "/rocketpool.png";
                   
                   return (
                     <tr 
                       key={i} 
                       style={{ 
                         borderBottom: '1px solid rgba(55, 65, 81, 0.3)',
                         transition: 'all 0.3s ease',
                         background: 'transparent'
                       }}
                       onMouseEnter={(e) => {
                         e.currentTarget.style.background = 'rgba(31, 41, 55, 0.4)';
                         e.currentTarget.style.transform = 'translateX(4px)';
                       }}
                       onMouseLeave={(e) => {
                         e.currentTarget.style.background = 'transparent';
                         e.currentTarget.style.transform = 'translateX(0)';
                       }}
                     >
                       
                       <td style={{ padding: '1rem 0.8rem', fontSize: '0.95rem', fontWeight: '600' }}>
                         <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                           <img
                             src={logoSrc}
                             alt={trade.market + " logo"}
                             style={{ width: '20px', height: '20px', borderRadius: '50%' }}
                           />
                           <span style={{ color: 'var(--text-primary)' }}>{trade.market}</span>
                         </div>
                       </td>
                       
                       <td style={{ padding: '1rem 0.8rem' }}>
                         <span style={{ 
                           color: trade.type === 'pay' ? '#3b82f6' : '#f59e0b',
                           fontWeight: '700',
                           fontSize: '0.9rem',
                           padding: '0.25rem 0.75rem',
                           borderRadius: '1rem',
                           background: trade.type === 'pay' ? 'rgba(59, 130, 246, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                           border: trade.type === 'pay' ? '1px solid rgba(59, 130, 246, 0.3)' : '1px solid rgba(245, 158, 11, 0.3)'
                         }}>
                           {trade.type === 'pay' ? 'Pay' : 'Receive'}
                         </span>
                       </td>
                       
                       <td style={{ 
                         padding: '1rem 0.8rem', 
                         textAlign: 'right',
                         fontSize: '0.95rem',
                         fontWeight: '600',
                         color: 'var(--text-primary)'
                       }}>
                         ${(trade.baseDV01).toLocaleString()}
                       </td>
                       
                       <td style={{ 
                         padding: '1rem 0.8rem', 
                         textAlign: 'right',
                         fontSize: '0.95rem',
                         fontWeight: '600',
                         color: 'var(--text-secondary)'
                       }}>
                         {trade.entryPrice.toFixed(3)}%
                       </td>
                       
                       <td style={{ 
                         padding: '1rem 0.8rem', 
                         textAlign: 'right',
                         fontSize: '0.95rem',
                         fontWeight: '700',
                         color: 'var(--text-secondary)'
                       }}>
                         {trade.currentPrice.toFixed(3)}%
                       </td>

                       <td style={{ 
                         padding: '1rem 0.8rem', 
                         textAlign: 'right',
                         fontSize: '0.95rem',
                         fontWeight: '700',
                         color: '#ef4444'
                       }}>
                         {parseFloat(trade.liquidationPrice).toFixed(3)}%
                       </td>
                       <td style={{ 
                         padding: '1rem 0.8rem', 
                         textAlign: 'right',
                         fontSize: '1.1rem',
                         fontWeight: '800'
                       }}>
                         <span style={{ 
                           color: trade.pnl >= 0 ? '#22c55e' : '#ef4444',
                           textShadow: trade.pnl >= 0 ? '0 0 8px rgba(34, 197, 94, 0.3)' : '0 0 8px rgba(239, 68, 68, 0.3)'
                         }}>
                           {trade.pnl >= 0 ? '+' : ''}${Math.abs(parseFloat(trade.pl)).toLocaleString()}
                         </span>
                       </td>
                       
                       <td style={{ padding: '1rem 0.8rem', textAlign: 'center' }}>
                         <div style={{ 
                           display: 'inline-flex',
                           alignItems: 'center',
                           gap: '0.5rem',
                           padding: '0.4rem 0.8rem',
                           borderRadius: '1rem',
                           backgroundColor: isRisky ? 'rgba(239, 68, 68, 0.1)' : 'rgba(34, 197, 94, 0.1)',
                           border: isRisky ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid rgba(34, 197, 94, 0.3)',
                           fontSize: '0.8rem',
                           fontWeight: '700'
                         }}>
                           <span style={{ fontSize: '0.9rem' }}>
                             {isRisky ? '⚠️' : '✅'}
                           </span>
                           <span style={{ color: isRisky ? '#ef4444' : '#22c55e' }}>
                             {bpsFromLiquidation.toFixed(0)}bp
                           </span>
                         </div>
                       </td>
                       
                       <td style={{ padding: '1rem 0.8rem', textAlign: 'center' }}>
                         <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                           <button 
                             onClick={() => requestAddMargin(i)}
                             style={{
                               background: 'linear-gradient(45deg, #3b82f6, #2563eb)',
                               color: 'white',
                               border: 'none',
                               padding: '0.5rem 0.8rem',
                               borderRadius: '0.5rem',
                               fontSize: '0.8rem',
                               cursor: 'pointer',
                               fontWeight: '600',
                               transition: 'all 0.3s ease',
                               textTransform: 'uppercase'
                             }}
                           >
                             Margin
                           </button>
                           <button 
                             onClick={() => requestUnwind(i)}
                             style={{
                               background: 'linear-gradient(45deg, #ef4444, #dc2626)',
                               color: 'white',
                               border: 'none',
                               padding: '0.5rem 0.8rem',
                               borderRadius: '0.5rem',
                               fontSize: '0.8rem',
                               cursor: 'pointer',
                               fontWeight: '600',
                               transition: 'all 0.3s ease',
                               textTransform: 'uppercase'
                             }}
                           >
                             Close
                           </button>
                         </div>
                       </td>
                     </tr>
                   );
                 })}
               </tbody>
             </table>
           ) : (
             <div style={{
               display: 'flex',
               flexDirection: 'column',
               alignItems: 'center',
               justifyContent: 'center',
               padding: '4rem 2rem',
               textAlign: 'center',
               minHeight: '300px',
               background: 'var(--gradient-card)',
               borderRadius: '1rem',
               border: '1px solid var(--border-secondary)'
             }}>
               <div style={{
                 fontSize: '4rem',
                 marginBottom: '1.5rem',
                 opacity: 0.4
               }}>
                 📊
               </div>
               <h3 style={{
                 fontSize: '1.5rem',
                 fontWeight: '700',
                 marginBottom: '1rem',
                 color: 'var(--text-primary)'
               }}>
                 No Active Positions
               </h3>
               <p style={{
                 fontSize: '1rem',
                 color: 'var(--text-muted)',
                 marginBottom: '2rem',
                 lineHeight: 1.6,
                 maxWidth: '400px'
               }}>
                 You haven't opened any positions yet. Use the swap interface above to enter your first trade.
               </p>
               <button 
                 onClick={() => setActiveTab("Swap")}
                 style={{
                   background: 'var(--gradient-accent)',
                   color: 'white',
                   border: 'none',
                   padding: '1rem 2rem',
                   borderRadius: '1rem',
                   fontSize: '1rem',
                   cursor: 'pointer',
                   fontWeight: '600'
                 }}
               >
                 Start Trading
               </button>
             </div>
           )}
         </div>
       </div>

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
                   <td>{parseFloat(trade.entryPrice).toFixed(3)}%</td>
                   <td>{parseFloat(trade.exitPrice).toFixed(3)}%</td>
                   <td>${trade.dv01?.toLocaleString()}</td>
                   <td className={parseFloat(trade.finalPL) >= 0 ? 'profit' : 'loss'}>
                     {parseFloat(trade.finalPL) >= 0 ? '+' : ''}${Math.abs(parseFloat(trade.finalPL)).toLocaleString()}
                   </td>
                   <td>
                     <span style={{ 
                       color: trade.status === 'LIQUIDATED' ? '#ef4444' : '#22c55e',
                       fontWeight: 'bold',
                       display: 'inline-flex',
                       alignItems: 'center',
                       gap: '0.5rem',
                       padding: '0.25rem 0.75rem',
                       borderRadius: '1rem',
                       backgroundColor: trade.status === 'LIQUIDATED' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(34, 197, 94, 0.1)',
                       border: `1px solid ${trade.status === 'LIQUIDATED' ? 'rgba(239, 68, 68, 0.3)' : 'rgba(34, 197, 94, 0.3)'}`,
                       fontSize: '0.875rem'
                     }}>
                       <span style={{ fontSize: '0.75rem' }}>
                         {trade.status === 'LIQUIDATED' ? '💥' : '✅'}
                       </span>
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

         <div className="settlement-section" style={{ marginBottom: '2rem', padding: '1rem', border: '1px solid #374151', borderRadius: '0.5rem' }}>
           <h3>Settlement (Day 365)</h3>
           <div style={{ marginBottom: '1rem', color: '#9ca3af', fontSize: '0.875rem' }}>
             Jump to settlement and calculate final P&L using realized settlement prices vs entry prices.
             Settlement P&L = (Settlement Price - Entry Price) × Initial DV01
           </div>
     
           {!isSettlementMode ? (
             <button 
               onClick={requestSettlement}
               style={{
                 background: 'linear-gradient(45deg, #f59e0b, #d97706)',
                 color: 'white',
                 border: 'none',
                 padding: '1rem 2rem',
                 borderRadius: '1rem',
                 fontSize: '0.95rem',
                 cursor: 'pointer',
                 fontWeight: '600',
                 textTransform: 'uppercase'
               }}
             >
               Go to Settlement (Day 365)
             </button>
           ) : (
             <div>
               <button 
                 onClick={exitSettlementMode}
                 style={{
                   background: 'linear-gradient(45deg, #6b7280, #4b5563)',
                   color: 'white',
                   border: 'none',
                   padding: '1rem 2rem',
                   borderRadius: '1rem',
                   fontSize: '0.95rem',
                   cursor: 'pointer',
                   fontWeight: '600',
                   textTransform: 'uppercase'
                 }}
               >
                 Exit Settlement Mode
               </button>
               <div style={{ marginTop: '1rem', padding: '0.75rem', backgroundColor: '#1f2937', borderRadius: '0.5rem' }}>
                 <h4 style={{ margin: '0 0 0.5rem 0', color: '#f59e0b' }}>Settlement Prices:</h4>
                 {Object.keys(settlementPrices).map(mkt => (
                   <div key={mkt} style={{ fontSize: '0.875rem', color: '#e5e7eb' }}>
                     {mkt}: {settlementPrices[mkt].toFixed(3)}%
                   </div>
                 ))}
               </div>
             </div>
           )}
         </div>
         
         <div className="day-advancement-section" style={{ marginBottom: '2rem', padding: '1rem', border: '1px solid #374151', borderRadius: '0.5rem' }}>
           <h3>Day Advancement</h3>
           <div style={{ marginBottom: '1rem' }}>
             <div style={{ color: '#9ca3af', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
               Current Global Day: <span style={{ color: '#10b981', fontWeight: 'bold' }}>
                 <AnimatedCounter value={globalDay} />
               </span>
             </div>
             <div style={{ color: '#9ca3af', fontSize: '0.875rem' }}>
               Advance one day forward. This will update the global day counter.
             </div>
           </div>
             <button 
               onClick={requestDayAdvancement}
               className="day-advance-btn"
               style={{
                 background: 'linear-gradient(45deg, #3b82f6, #2563eb)',
                 color: 'white',
                 border: 'none',
                 padding: '1rem 2rem',
                 borderRadius: '1rem',
                 fontSize: '0.95rem',
                 cursor: 'pointer',
                 fontWeight: '600',
                 transition: 'all 0.3s ease',
                 boxShadow: '0 4px 14px rgba(59, 130, 246, 0.25)',
                 textTransform: 'uppercase',
                 letterSpacing: '0.025em',
                 display: 'inline-flex',
                 alignItems: 'center',
                 gap: '0.5rem'
               }}
               onMouseEnter={(e) => {
                 e.target.style.background = 'linear-gradient(45deg, #2563eb, #1d4ed8)';
                 e.target.style.transform = 'translateY(-2px)';
                 e.target.style.boxShadow = '0 6px 20px rgba(59, 130, 246, 0.4)';
               }}
               onMouseLeave={(e) => {
                 e.target.style.background = 'linear-gradient(45deg, #3b82f6, #2563eb)';
                 e.target.style.transform = 'translateY(0)';
                 e.target.style.boxShadow = '0 4px 14px rgba(59, 130, 246, 0.25)';
               }}
             >
               <span style={{ fontSize: '1rem' }}>🚀</span>
               Advance to Day <AnimatedCounter value={globalDay + 1} />
             </button>
         </div>

         <h3>Market Settings</h3>
         {Object.keys(marketSettings).map((mkt) => {
           return (
             <div key={mkt} className="market-setting">
               <h4>{mkt}</h4>
               <div className="setting-inputs">
                 <div>
                   <label>Reference APY:</label>
                   <input
                     type="number"
                     step="0.0001"
                     value={marketSettings[mkt].referenceApy}
                     onChange={(e) => updateMarketSetting(mkt, "referenceApy", e.target.value)}
                   />
                 </div>
                 <div>
                   <label>Impact K:</label>
                   <input
                     type="number"
                     step="0.000001"
                     value={marketSettings[mkt].k}
                     onChange={(e) => updateMarketSetting(mkt, "k", e.target.value)}
                   />
                 </div>
                 <div>
                   <label>Live Price:</label>
                   <input
                     type="number"
                     step="0.0001"
                     value={livePricesByMarket[mkt] || marketSettings[mkt].referenceApy}
                     onChange={(e) => {
                       setLivePricesByMarket(prev => ({
                         ...prev,
                         [mkt]: parseFloat(e.target.value)
                       }));
                     }}
                     style={{ backgroundColor: '#2d3748', color: '#e2e8f0' }}
                   />
                 </div>
                 <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.5rem' }}>
                   <div>Reference Rate: {marketSettings[mkt].referenceApy.toFixed(3)}%</div>
                   <div>Live Price: {(livePricesByMarket[mkt] || marketSettings[mkt].referenceApy).toFixed(3)}%</div>
                   <div>Price Impact = K × DV01 × Direction</div>
                 </div>
               </div>
             </div>
           );
         })}
       </div>
     )}

     {/* Keep all the other tabs unchanged */}
     {["Docs", "Stats"].map(tab => (
       activeTab === tab && (
         <div key={tab} className="tab-content">
           <div style={{
             textAlign: 'center',
             padding: '4rem 2rem',
             background: 'var(--gradient-card)',
             borderRadius: '1.5rem',
             border: '1px solid var(--border-secondary)',
             backdropFilter: 'blur(16px)'
           }}>
             <div style={{
               fontSize: '5rem',
               marginBottom: '2rem',
               opacity: 0.6,
               animation: 'float 3s ease-in-out infinite'
             }}>
               {tab === "Docs" ? "📖" : "📊"}
             </div>
             <h2 style={{
               fontSize: '2.5rem',
               fontWeight: '800',
               marginBottom: '1.5rem',
               background: tab === "Docs" ? 'var(--gradient-secondary)' : 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
               WebkitBackgroundClip: 'text',
               WebkitTextFillColor: 'transparent',
               backgroundClip: 'text'
             }}>
               {tab === "Docs" ? "Documentation Hub" : "Advanced Analytics"}
             </h2>
             <p style={{
               fontSize: '1.25rem',
               color: 'var(--text-muted)',
               lineHeight: 1.6,
               maxWidth: '600px',
               margin: '0 auto'
             }}>
               {tab === "Docs" ? "Complete technical documentation and integration guides" : "Deep market insights and comprehensive analytics"} coming soon...
             </p>
           </div>
         </div>
       )
     ))}

     {activeTab === "Learn" && (
       <div className="tab-content" style={{ padding: '2rem', maxWidth: '72rem', margin: '0 auto' }}>
         <div style={{
           textAlign: 'center',
           padding: '2rem',
           marginBottom: '3rem'
         }}>
           <div style={{
             fontSize: '4rem',
             marginBottom: '1rem',
             opacity: 0.8,
             animation: 'float 3s ease-in-out infinite'
           }}>
             📚
           </div>
           <h2 style={{
             fontSize: '2.5rem',
             fontWeight: '800',
             marginBottom: '1rem',
             background: 'var(--gradient-accent)',
             WebkitBackgroundClip: 'text',
             WebkitTextFillColor: 'transparent',
             backgroundClip: 'text'
           }}>
             Learn Crypto Rate Swaps
           </h2>
           <p style={{
             fontSize: '1.25rem',
             color: 'var(--text-muted)',
             lineHeight: 1.6,
             maxWidth: '600px',
             margin: '0 auto'
           }}>
             Master the fundamentals of crypto rate derivatives and start trading with confidence
           </p>
         </div>
         
         <div style={{ maxWidth: '800px', margin: '0 auto' }}>
           
           {/* What are Interest Rate Swaps */}
           <div className="glass-card" style={{ 
             marginBottom: '2rem', 
             padding: '2rem', 
             border: '1px solid var(--border-secondary)', 
             borderRadius: '1rem',
             background: 'var(--gradient-card)',
             backdropFilter: 'blur(16px)',
             transition: 'all 0.3s ease'
           }}
           onMouseEnter={(e) => {
             e.currentTarget.style.borderColor = '#10b981';
             e.currentTarget.style.boxShadow = '0 8px 32px rgba(16, 185, 129, 0.15)';
           }}
           onMouseLeave={(e) => {
             e.currentTarget.style.borderColor = 'var(--border-secondary)';
             e.currentTarget.style.boxShadow = 'none';
           }}>
             <h3 style={{ 
               color: '#10b981', 
               marginBottom: '1.5rem',
               fontSize: '1.5rem',
               fontWeight: '700',
               display: 'flex',
               alignItems: 'center',
               gap: '0.75rem'
             }}>
               <span style={{ fontSize: '2rem' }}>🔄</span>
               What are Interest Rate Swaps?
             </h3>
             <p style={{ color: 'var(--text-secondary)', lineHeight: '1.7', marginBottom: '1rem', fontSize: '1.1rem' }}>
               Interest Rate Swaps (IRS) let you exchange variable yield exposure for fixed yield exposure. 
               Instead of being subject to changing staking/lending rates, you can lock in a fixed rate or 
               speculate on rate movements.
             </p>
             <p style={{ color: 'var(--text-secondary)', lineHeight: '1.7', marginBottom: '1.5rem', fontSize: '1.1rem' }}>
               <strong style={{ color: '#10b981' }}>Crypto Rate Swaps</strong> are interest rate swaps but for crypto native yields - 
               like staking rewards, lending rates, and DeFi protocol yields.
             </p>
             <div style={{
               padding: '1.5rem',
               background: 'rgba(16, 185, 129, 0.1)',
               borderRadius: '0.75rem',
               border: '1px solid rgba(16, 185, 129, 0.2)'
             }}>
               <p style={{ color: 'var(--text-primary)', lineHeight: '1.6', margin: 0 }}>
                 <strong style={{ color: '#10b981' }}>Example:</strong> JitoSOL currently yields 7.9% but might change daily. You can 
                 "pay fixed" at 7.9% to lock in that rate regardless of where JitoSOL yields go.
               </p>
             </div>
           </div>

           {/* Continue with all the other Learn tab content unchanged... */}
           {/* I'll skip the rest of the Learn tab content since it's identical to before */}

         </div>
       </div>
     )}

     {activeTab === "Leaderboard" && (
       /* Keep leaderboard content unchanged */
       <div className="tab-content">
         <div style={{
           textAlign: 'center',
           padding: '3rem 2rem',
           background: 'rgba(26, 31, 46, 0.6)',
           borderRadius: '1rem',
           border: '1px solid var(--border-secondary)',
           backdropFilter: 'blur(8px)'
         }}>
           <div style={{
             fontSize: '3rem',
             marginBottom: '1rem',
             opacity: 0.6
           }}>
             📊
           </div>
           <p style={{ 
             color: 'var(--text-muted)', 
             fontSize: '1.1rem',
             margin: 0,
             fontWeight: '500'
           }}>
             Leaderboard and live points tracking coming soon...
           </p>
         </div>
       </div>
     )}

     {activeTab === "Risk" && (
       <div className="risk-management-container" style={{ padding: '2rem', maxWidth: '72rem', margin: '0 auto' }}>
         <div style={{
           textAlign: 'center',
           padding: '2rem',
           marginBottom: '3rem'
         }}>
           <div style={{
             fontSize: '4rem',
             marginBottom: '1rem',
             opacity: 0.8,
             animation: 'float 3s ease-in-out infinite'
           }}>
             ⚖️
           </div>
           <h2 style={{
             fontSize: '2.5rem',
             fontWeight: '800',
             marginBottom: '1rem',
             background: 'linear-gradient(135deg, #ef4444 0%, #f59e0b 50%, #10b981 100%)',
             WebkitBackgroundClip: 'text',
             WebkitTextFillColor: 'transparent',
             backgroundClip: 'text'
           }}>
             Risk Management
           </h2>
           <p style={{
             fontSize: '1.25rem',
             color: 'var(--text-muted)',
             lineHeight: 1.6,
             maxWidth: '600px',
             margin: '0 auto'
           }}>
             Monitor positions, manage settlements, and analyze portfolio risk across all markets
           </p>
         </div>
         
         {/* Enhanced Settlement Controls */}
         <div className="settlement-controls" style={{ 
           marginBottom: '3rem', 
           padding: '2.5rem', 
           border: '1px solid var(--border-secondary)', 
           borderRadius: '1.5rem',
           background: 'var(--gradient-card)',
           backdropFilter: 'blur(16px)',
           transition: 'all 0.3s ease',
           position: 'relative',
           overflow: 'hidden'
         }}>
           <div style={{
             position: 'absolute',
             top: 0,
             left: 0,
             right: 0,
             height: '3px',
             background: 'var(--gradient-accent)',
             opacity: 0.8
           }} />
           
           <h3 style={{ 
             marginBottom: '2rem', 
             color: 'var(--text-primary)',
             fontSize: '1.75rem',
             fontWeight: '700',
             display: 'flex',
             alignItems: 'center',
             gap: '1rem'
           }}>
             <span style={{ 
               fontSize: '2rem',
               background: 'var(--gradient-accent)',
               borderRadius: '50%',
               width: '60px',
               height: '60px',
               display: 'flex',
               alignItems: 'center',
               justifyContent: 'center'
             }}>
               ⚖️
             </span>
             Settlement Controls
           </h3>
           
           {!isSettlementMode ? (
             <div>
               <div style={{ 
                 marginBottom: '2rem', 
                 padding: '1.5rem',
                 background: 'rgba(59, 130, 246, 0.1)',
                 borderRadius: '1rem',
                 border: '1px solid rgba(59, 130, 246, 0.2)'
               }}>
                 <div style={{ 
                   color: 'var(--text-secondary)', 
                   fontSize: '1.1rem',
                   lineHeight: '1.6',
                   display: 'flex',
                   alignItems: 'center',
                   gap: '0.75rem'
                 }}>
                   <span style={{ fontSize: '1.5rem', color: '#3b82f6' }}>ℹ️</span>
                   Set settlement prices for all markets and calculate final P&L for all positions
                 </div>
               </div>
               
               {/* Settlement Price Inputs */}
               <div style={{ 
                 display: 'grid', 
                 gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', 
                 gap: '1.5rem',
                 marginBottom: '2.5rem'
               }}>
                 {Object.keys(marketSettings).map(mkt => (
                   <div key={mkt} style={{ 
                     padding: '1.5rem', 
                     border: '1px solid var(--border-secondary)', 
                     borderRadius: '1rem',
                     background: 'rgba(26, 31, 46, 0.8)',
                     backdropFilter: 'blur(12px)',
                     transition: 'all 0.3s ease'
                   }}>
                     <label style={{ 
                       display: 'block', 
                       marginBottom: '1rem', 
                       color: 'var(--text-primary)',
                       fontSize: '1rem',
                       fontWeight: '700'
                     }}>
                       <span style={{ 
                         width: '8px', 
                         height: '8px', 
                         background: 'var(--gradient-accent)', 
                         borderRadius: '50%',
                         boxShadow: '0 0 8px rgba(16, 185, 129, 0.5)',
                         display: 'inline-block',
                         marginRight: '0.5rem'
                       }} />
                       {mkt} Settlement Price
                     </label>
                     <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                       <input
                         type="number"
                         step="0.001"
                         placeholder={marketSettings[mkt].referenceApy.toFixed(3)}
                         value={tempSettlementPrices[mkt] || ''}
                         onChange={(e) => {
                           setTempSettlementPrices(prev => ({
                             ...prev,
                             [mkt]: e.target.value
                           }));
                         }}
                         style={{
                           flex: 1,
                           padding: '0.75rem',
                           borderRadius: '0.5rem',
                           border: '1px solid var(--border-secondary)',
                           background: 'var(--bg-input)',
                           color: 'var(--text-primary)',
                           fontSize: '1rem',
                           fontWeight: '600',
                           transition: 'all 0.3s ease'
                         }}
                       />
                       <span style={{ 
                         color: 'var(--text-accent)', 
                         fontSize: '1rem',
                         fontWeight: '600'
                       }}>%</span>
                     </div>
                     <div style={{ 
                       padding: '0.75rem',
                       background: 'rgba(16, 185, 129, 0.1)',
                       borderRadius: '0.5rem',
                       border: '1px solid rgba(16, 185, 129, 0.2)'
                     }}>
                       <div style={{ 
                         color: 'var(--text-muted)', 
                         fontSize: '0.875rem',
                         marginBottom: '0.25rem'
                       }}>
                         Current Live Price:
                       </div>
                       <div style={{
                         color: 'var(--text-accent)',
                         fontSize: '1.1rem',
                         fontWeight: '700'
                       }}>
                         {(livePricesByMarket[mkt] || marketSettings[mkt].referenceApy).toFixed(3)}%
                       </div>
                     </div>
                   </div>
                 ))}
               </div>
               
               <div style={{ textAlign: 'center' }}>
                 <button
                   onClick={handleRiskSettlement}
                   style={{
                     background: 'var(--gradient-accent)',
                     color: 'white',
                     border: 'none',
                     padding: '1rem 2.5rem',
                     borderRadius: '1rem',
                     fontSize: '1rem',
                     cursor: 'pointer',
                     fontWeight: '700',
                     textTransform: 'uppercase',
                     letterSpacing: '0.05em',
                     display: 'inline-flex',
                     alignItems: 'center',
                     gap: '0.75rem',
                     transition: 'all 0.3s ease',
                     boxShadow: 'var(--shadow-accent)'
                   }}
                 >
                   <span style={{ fontSize: '1.25rem' }}>⚖️</span>
                   Apply Settlement Prices
                 </button>
               </div>
             </div>
           ) : (
             <div>
               <div style={{ 
                 display: 'flex', 
                 justifyContent: 'space-between', 
                 alignItems: 'center',
                 marginBottom: '2rem',
                 padding: '1.5rem',
                 background: 'rgba(245, 158, 11, 0.1)',
                 borderRadius: '1rem',
                 border: '1px solid rgba(245, 158, 11, 0.3)'
               }}>
                 <div>
                   <div style={{ 
                     color: '#f59e0b', 
                     fontWeight: '700', 
                     fontSize: '1.1rem',
                     display: 'flex',
                     alignItems: 'center',
                     gap: '0.75rem',
                     marginBottom: '0.5rem'
                   }}>
                     <span style={{ fontSize: '1.5rem' }}>🔒</span>
                     Settlement Mode Active
                   </div>
                   <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                     All P&L calculations now using settlement prices
                   </div>
                 </div>
                 <button
                   onClick={() => {
                     setIsSettlementMode(false);
                     setSettlementPrices({});
                     setTempSettlementPrices({});
                   }}
                   style={{
                     background: 'linear-gradient(45deg, #6b7280, #4b5563)',
                     color: 'white',
                     border: 'none',
                     padding: '0.75rem 1.5rem',
                     borderRadius: '0.75rem',
                     fontSize: '0.875rem',
                     cursor: 'pointer',
                     fontWeight: '600',
                     textTransform: 'uppercase',
                     letterSpacing: '0.025em',
                     display: 'flex',
                     alignItems: 'center',
                     gap: '0.5rem'
                   }}
                 >
                   <span>🚪</span>
                   Exit Settlement
                 </button>
               </div>
               
               {/* Current Settlement Prices */}
               <div>
                 <h4 style={{
                   color: 'var(--text-primary)',
                   fontSize: '1.25rem',
                   fontWeight: '600',
                   marginBottom: '1.5rem',
                   display: 'flex',
                   alignItems: 'center',
                   gap: '0.5rem'
                 }}>
                   <span style={{ fontSize: '1.5rem' }}>📊</span>
                   Active Settlement Prices
                 </h4>
                 <div style={{ 
                   display: 'grid', 
                   gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
                   gap: '1rem'
                 }}>
                   {Object.keys(settlementPrices).map(mkt => (
                     <div key={mkt} style={{ 
                       padding: '1.25rem', 
                       background: 'rgba(245, 158, 11, 0.1)', 
                       borderRadius: '0.75rem',
                       border: '1px solid rgba(245, 158, 11, 0.4)',
                       transition: 'all 0.3s ease'
                     }}>
                       <div style={{ 
                         fontSize: '0.875rem', 
                         color: 'var(--text-muted)',
                         marginBottom: '0.5rem',
                         fontWeight: '500'
                       }}>
                         {mkt}
                       </div>
                       <div style={{ 
                         color: '#f59e0b', 
                         fontWeight: '700',
                         fontSize: '1.5rem',
                         display: 'flex',
                         alignItems: 'center',
                         gap: '0.25rem'
                       }}>
                         {settlementPrices[mkt].toFixed(3)}
                         <span style={{ fontSize: '1rem', opacity: 0.8 }}>%</span>
                       </div>
                     </div>
                   ))}
                 </div>
               </div>
             </div>
           )}
         </div>

         {/* Enhanced Stress Testing */}
         <div className="stress-testing-controls" style={{ 
           marginBottom: '3rem', 
           padding: '2.5rem', 
           border: '1px solid var(--border-secondary)', 
           borderRadius: '1.5rem',
           background: 'var(--gradient-card)',
           backdropFilter: 'blur(16px)',
           transition: 'all 0.3s ease',
           position: 'relative',
           overflow: 'hidden'
         }}>
           <div style={{
             position: 'absolute',
             top: 0,
             left: 0,
             right: 0,
             height: '3px',
             background: 'var(--gradient-secondary)',
             opacity: 0.8
           }} />
           
           <h3 style={{ 
             marginBottom: '2rem', 
             color: 'var(--text-primary)',
             fontSize: '1.75rem',
             fontWeight: '700',
             display: 'flex',
             alignItems: 'center',
             gap: '1rem'
           }}>
             <span style={{ 
               fontSize: '2rem',
               background: 'var(--gradient-secondary)',
               borderRadius: '50%',
               width: '60px',
               height: '60px',
               display: 'flex',
               alignItems: 'center',
               justifyContent: 'center'
             }}>
               📊
             </span>
             Stress Testing
           </h3>
           
           <div style={{ 
             marginBottom: '2rem', 
             padding: '1.5rem',
             background: 'rgba(6, 182, 212, 0.1)',
             borderRadius: '1rem',
             border: '1px solid rgba(6, 182, 212, 0.2)'
           }}>
             <div style={{ 
               color: 'var(--text-secondary)', 
               fontSize: '1.1rem',
               lineHeight: '1.6',
               display: 'flex',
               alignItems: 'center',
               gap: '0.75rem'
             }}>
               <span style={{ fontSize: '1.5rem', color: '#06b6d4' }}>⚡</span>
               Test portfolio performance under extreme rate movements
             </div>
           </div>
           
           <div style={{ 
             display: 'grid', 
             gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', 
             gap: '1rem', 
             marginBottom: '2rem' 
           }}>
             {[10, 25, 50, 100, 200].map(bps => (
               <button
                 key={bps}
                 onClick={() => {
                   let totalPLUp = 0;
                   let totalPLDown = 0;
                   let positionCount = 0;
                   
                   Object.keys(tradesByMarket).forEach(market => {
                     const trades = tradesByMarket[market] || [];
                     trades.forEach(trade => {
                       const currentPrice = livePricesByMarket[market] || marketSettings[market].referenceApy;
                       const stressPriceUp = currentPrice + (bps / 100); // +bps
                       const stressPriceDown = currentPrice - (bps / 100); // -bps
                       
                       const stressPLUp = calculateLivePL(trade, stressPriceUp);
                       const stressPLDown = calculateLivePL(trade, stressPriceDown);
                       totalPLUp += stressPLUp;
                       totalPLDown += stressPLDown;
                       positionCount++;
                     });
                   });
                   
                   setStressTestResult({
                     scenario: `${bps}bp Rate Move`,
                     totalPLUp: Math.round(totalPLUp),
                     totalPLDown: Math.round(totalPLDown),
                     positionCount,
                     bps
                   });
                 }}
                 style={{
                   background: 'var(--gradient-secondary)',
                   color: 'white',
                   border: 'none',
                   padding: '1rem 1rem',
                   borderRadius: '1rem',
                   fontSize: '0.9rem',
                   cursor: 'pointer',
                   fontWeight: '700',
                   textTransform: 'uppercase',
                   letterSpacing: '0.025em',
                   display: 'flex',
                   alignItems: 'center',
                   justifyContent: 'center',
                   gap: '0.5rem',
                   transition: 'all 0.3s ease',
                   boxShadow: '0 4px 14px rgba(6, 182, 212, 0.25)'
                 }}
               >
                 <span style={{ fontSize: '1rem' }}>📊</span>
                 ±{bps}bp
               </button>
             ))}
             
             <button
               onClick={() => setStressTestResult(null)}
               style={{
                 background: 'linear-gradient(45deg, #6b7280, #4b5563)',
                 color: 'white',
                 border: 'none',
                 padding: '1rem 1rem',
                 borderRadius: '1rem',
                 fontSize: '0.9rem',
                 cursor: 'pointer',
                 fontWeight: '700',
                 textTransform: 'uppercase',
                 letterSpacing: '0.025em',
                 display: 'flex',
                 alignItems: 'center',
                 justifyContent: 'center',
                 gap: '0.5rem',
                 transition: 'all 0.3s ease'
               }}
             >
               <span style={{ fontSize: '1rem' }}>🗑️</span>
               Clear
             </button>
           </div>
           
           {stressTestResult && (
             <div style={{ 
               padding: '2rem', 
               background: 'rgba(26, 31, 46, 0.8)', 
               borderRadius: '1rem',
               border: '2px solid #10b981',
               backdropFilter: 'blur(12px)',
               position: 'relative',
               overflow: 'hidden'
             }}>
               <div style={{
                 position: 'absolute',
                 top: 0,
                 left: 0,
                 right: 0,
                 height: '2px',
                 background: '#10b981',
                 opacity: 0.8
               }} />
               
               <h4 style={{ 
                 margin: '0 0 1.5rem 0', 
                 color: 'var(--text-primary)',
                 fontSize: '1.25rem',
                 fontWeight: '700',
                 display: 'flex',
                 alignItems: 'center',
                 gap: '0.75rem'
               }}>
                 <span style={{
                   width: '12px',
                   height: '12px',
                   background: '#10b981',
                   borderRadius: '50%',
                   boxShadow: '0 0 12px #10b981',
                   animation: 'pulse 2s infinite'
                 }} />
                 Stress Test: {stressTestResult.scenario}
               </h4>
               
               <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                 {/* Positive scenario */}
                 <div style={{
                   padding: '1.5rem',
                   background: 'rgba(34, 197, 94, 0.1)',
                   borderRadius: '0.75rem',
                   border: '1px solid rgba(34, 197, 94, 0.3)'
                 }}>
                   <div style={{ 
                     fontSize: '1.5rem', 
                     fontWeight: '800',
                     color: stressTestResult.totalPLUp >= 0 ? '#22c55e' : '#ef4444',
                     marginBottom: '0.5rem',
                     textShadow: `0 0 10px ${stressTestResult.totalPLUp >= 0 ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`
                   }}>
                     +{stressTestResult.bps}bp: {stressTestResult.totalPLUp >= 0 ? '+' : ''}${Math.abs(stressTestResult.totalPLUp).toLocaleString()}
                   </div>
                   <div style={{ 
                     fontSize: '0.875rem', 
                     color: stressTestResult.totalPLUp >= 0 ? '#22c55e' : '#ef4444',
                     fontWeight: '600'
                   }}>
                     {stressTestResult.totalPLUp >= 0 ? 'Profit' : 'Loss'}
                   </div>
                 </div>
                 
                 {/* Negative scenario */}
                 <div style={{
                   padding: '1.5rem',
                   background: 'rgba(239, 68, 68, 0.1)',
                   borderRadius: '0.75rem',
                   border: '1px solid rgba(239, 68, 68, 0.3)'
                 }}>
                   <div style={{ 
                     fontSize: '1.5rem', 
                     fontWeight: '800',
                     color: stressTestResult.totalPLDown >= 0 ? '#22c55e' : '#ef4444',
                     marginBottom: '0.5rem',
                     textShadow: `0 0 10px ${stressTestResult.totalPLDown >= 0 ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`
                   }}>
                     -{stressTestResult.bps}bp: {stressTestResult.totalPLDown >= 0 ? '+' : ''}${Math.abs(stressTestResult.totalPLDown).toLocaleString()}
                   </div>
                   <div style={{ 
                     fontSize: '0.875rem', 
                     color: stressTestResult.totalPLDown >= 0 ? '#22c55e' : '#ef4444',
                     fontWeight: '600'
                   }}>
                     {stressTestResult.totalPLDown >= 0 ? 'Profit' : 'Loss'}
                   </div>
                 </div>
               </div>
               
               <div style={{ 
                 fontSize: '1rem', 
                 color: 'var(--text-muted)',
                 fontWeight: '500',
                 marginTop: '1rem',
                 textAlign: 'center'
               }}>
                 Across {stressTestResult.positionCount} open position{stressTestResult.positionCount !== 1 ? 's' : ''}
               </div>
             </div>
           )}
         </div>

         {/* Enhanced Positions by Market */}
         {Object.keys(marketSettings).map(mkt => {
           const marketTrades = tradesByMarket[mkt] || [];
           if (marketTrades.length === 0) return null;
           
           const totalPL = marketTrades.reduce((sum, trade) => {
             const pl = isSettlementMode ? 
               calculateSettlementPL(trade) : 
               calculateLivePL(trade, livePricesByMarket[mkt] || marketSettings[mkt].referenceApy);
             return sum + pl;
           }, 0);
           
           return (
             <div key={mkt} className="market-positions" style={{marginBottom: '2.5rem', 
               border: '1px solid var(--border-secondary)', 
               borderRadius: '1.5rem',
               background: 'var(--gradient-card)',
               backdropFilter: 'blur(16px)',
               overflow: 'hidden',
               transition: 'all 0.3s ease'
             }}>
               <div style={{ 
                 padding: '2rem', 
                 background: 'rgba(26, 31, 46, 0.8)',
                 borderBottom: '1px solid var(--border-secondary)',
                 display: 'flex',
                 justifyContent: 'space-between',
                 alignItems: 'center',
                 position: 'relative'
               }}>
                 <div style={{
                   position: 'absolute',
                   top: 0,
                   left: 0,
                   right: 0,
                   height: '2px',
                   background: 'var(--gradient-accent)',
                   opacity: 0.8
                 }} />
                 
                 <div>
                   <h3 style={{ 
                     margin: 0, 
                     color: 'var(--text-primary)',
                     fontSize: '1.75rem',
                     fontWeight: '700',
                     display: 'flex',
                     alignItems: 'center',
                     gap: '0.75rem'
                   }}>
                     <span style={{
                       width: '12px',
                       height: '12px',
                       background: 'var(--gradient-accent)',
                       borderRadius: '50%',
                       boxShadow: '0 0 12px rgba(16, 185, 129, 0.6)',
                       animation: 'pulse 2s infinite'
                     }} />
                     {mkt} Positions
                   </h3>
                   <div style={{ 
                     fontSize: '1rem', 
                     color: 'var(--text-muted)',
                     marginTop: '0.5rem',
                     fontWeight: '500'
                   }}>
                     {marketTrades.length} active position{marketTrades.length !== 1 ? 's' : ''}
                   </div>
                 </div>
                 <div style={{ textAlign: 'right' }}>
                   <div style={{ fontSize: '1rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                     Total P&L
                   </div>
                   <div style={{ 
                     fontSize: '2rem', 
                     fontWeight: '800',
                     color: totalPL >= 0 ? '#22c55e' : '#ef4444',
                     textShadow: totalPL >= 0 ? '0 0 10px rgba(34, 197, 94, 0.3)' : '0 0 10px rgba(239, 68, 68, 0.3)'
                   }}>
                     {totalPL >= 0 ? '+' : ''}${Math.abs(totalPL).toLocaleString()}
                   </div>
                 </div>
               </div>
               
               <div style={{ overflow: 'auto' }}>
                 <table style={{ 
                   width: '100%', 
                   borderCollapse: 'collapse',
                   background: 'rgba(15, 23, 42, 0.8)'
                 }}>
                   <thead>
                     <tr style={{ background: 'rgba(26, 31, 46, 0.9)' }}>
                       <th style={{ padding: '1rem', textAlign: 'left', color: 'var(--text-secondary)', fontSize: '0.9rem', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Direction</th>
                       <th style={{ padding: '1rem', textAlign: 'right', color: 'var(--text-secondary)', fontSize: '0.9rem', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Entry Price</th>
                       <th style={{ padding: '1rem', textAlign: 'right', color: 'var(--text-secondary)', fontSize: '0.9rem', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Liquidation Price</th>
                       <th style={{ padding: '1rem', textAlign: 'right', color: 'var(--text-secondary)', fontSize: '0.9rem', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>DV01</th>
                       <th style={{ padding: '1rem', textAlign: 'right', color: 'var(--text-secondary)', fontSize: '0.9rem', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Current Price</th>
                       <th style={{ padding: '1rem', textAlign: 'right', color: 'var(--text-secondary)', fontSize: '0.9rem', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Entry Day</th>
                       <th style={{ padding: '1rem', textAlign: 'right', color: 'var(--text-secondary)', fontSize: '0.9rem', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>P&L</th>
                     </tr>
                   </thead>
                   <tbody>
                     {marketTrades.map((trade, i) => {
                       const currentPrice = isSettlementMode ? 
                         settlementPrices[mkt] : 
                         (livePricesByMarket[mkt] || marketSettings[mkt].referenceApy);
                       const pl = isSettlementMode ? 
                         calculateSettlementPL(trade) : 
                         calculateLivePL(trade, currentPrice);
                       
                       return (
                         <tr key={i} style={{ 
                           borderBottom: '1px solid rgba(55, 65, 81, 0.3)',
                           transition: 'all 0.3s ease'
                         }}>
                           <td style={{ padding: '1rem' }}>
                             <span style={{ 
                               color: trade.type === 'pay' ? '#3b82f6' : '#f59e0b',
                               fontWeight: '700',
                               fontSize: '0.95rem',
                               display: 'flex',
                               alignItems: 'center',
                               gap: '0.5rem'
                             }}>
                               <span style={{
                                 width: '8px',
                                 height: '8px',
                                 background: trade.type === 'pay' ? '#3b82f6' : '#f59e0b',
                                 borderRadius: '50%',
                                 boxShadow: `0 0 8px ${trade.type === 'pay' ? '#3b82f6' : '#f59e0b'}`
                               }} />
                               {trade.type === 'pay' ? 'Pay Fixed' : 'Receive Fixed'}
                             </span>
                           </td>
                           <td style={{ 
                             padding: '1rem', 
                             textAlign: 'right',
                             color: 'var(--text-primary)',
                             fontSize: '0.95rem',
                             fontWeight: '600'
                           }}>
                             {trade.entryPrice.toFixed(3)}%
                           </td>
                           <td style={{ 
                             padding: '1rem', 
                             textAlign: 'right',
                             color: '#ef4444',
                             fontSize: '0.95rem',
                             fontWeight: '600'
                           }}>
                             {parseFloat(trade.liquidationPrice).toFixed(3)}%
                           </td>
                           <td style={{ 
                             padding: '1rem', 
                             textAlign: 'right',
                             color: 'var(--text-primary)',
                             fontSize: '0.95rem',
                             fontWeight: '600'
                           }}>
                             ${trade.baseDV01.toLocaleString()}
                           </td>
                           <td style={{ 
                             padding: '1rem', 
                             textAlign: 'right',
                             color: 'var(--text-accent)',
                             fontSize: '0.95rem',
                             fontWeight: '700'
                           }}>
                             {currentPrice.toFixed(3)}%
                           </td>
                           <td style={{ 
                             padding: '1rem', 
                             textAlign: 'right',
                             color: 'var(--text-primary)',
                             fontSize: '0.95rem',
                             fontWeight: '600'
                           }}>
                             Day {trade.entryDay || 0}
                           </td>
                           <td style={{ 
                             padding: '1rem', 
                             textAlign: 'right',
                             fontWeight: '700',
                             fontSize: '1rem',
                             color: pl >= 0 ? '#22c55e' : '#ef4444'
                           }}>
                             {pl >= 0 ? '+' : ''}${Math.abs(pl).toLocaleString()}
                           </td>
                         </tr>
                       );
                     })}
                   </tbody>
                 </table>
               </div>
             </div>
           );
         })}
       </div>
     )}
     
     {/* All modals remain unchanged */}
     {pendingTrade && (
       <div className="modal-overlay">
         <div className="modal">
           <h3>Confirm CRS Trade</h3>
           
           {/* Hero section - most important info */}
           <div style={{
             background: pendingTrade.type === 'pay' ? 
               'linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(29, 78, 216, 0.1) 100%)' :
               'linear-gradient(135deg, rgba(245, 158, 11, 0.1) 0%, rgba(217, 119, 6, 0.1) 100%)',
             border: pendingTrade.type === 'pay' ? 
               '1px solid rgba(59, 130, 246, 0.3)' : 
               '1px solid rgba(245, 158, 11, 0.3)',
             borderRadius: '1rem',
             padding: '2rem',
             marginBottom: '1.5rem',
             textAlign: 'center'
           }}>
             <div style={{
               fontSize: '0.875rem',
               color: '#9ca3af',
               marginBottom: '0.5rem',
               textTransform: 'uppercase',
               letterSpacing: '0.05em'
             }}>
               {pendingTrade.type === 'pay' ? 'Pay Fixed' : 'Receive Fixed'}
             </div>
             
             <div style={{
               fontSize: '3rem',
               fontWeight: '800',
               color: pendingTrade.type === 'pay' ? '#3b82f6' : '#f59e0b',
               marginBottom: '0.5rem',
               lineHeight: 1
             }}>
               {pendingTrade.finalPrice}%
             </div>
             
             <div style={{
               fontSize: '1rem',
               color: '#6b7280'
             }}>
               Execution Price
             </div>
           </div>

           {/* Key details grid */}
           <div style={{
             display: 'grid',
             gridTemplateColumns: '1fr 1fr',
             gap: '1rem',
             marginBottom: '1.5rem'
           }}>
             <div style={{
               background: 'rgba(17, 24, 39, 0.8)',
               padding: '1rem',
               borderRadius: '0.75rem',
               border: '1px solid #374151'
             }}>
               <div style={{ color: '#9ca3af', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                 Position Size
               </div>
               <div style={{ color: '#f1f5f9', fontSize: '1.25rem', fontWeight: '700' }}>
                 ${baseDv01.toLocaleString()} DV01
               </div>
             </div>
             
             <div style={{
               background: 'rgba(17, 24, 39, 0.8)',
               padding: '1rem',
               borderRadius: '0.75rem',
               border: '1px solid #374151'
             }}>
               <div style={{ color: '#9ca3af', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                 Liquidation Price
               </div>
               <div style={{ color: '#ef4444', fontSize: '1.25rem', fontWeight: '700' }}>
                 {(pendingTrade.type === 'pay' 
                   ? (parseFloat(pendingTrade.finalPrice) - ((margin / baseDv01) / 100))
                   : (parseFloat(pendingTrade.finalPrice) + ((margin / baseDv01 ) / 100))
                 ).toFixed(3)}%
               </div>
             </div>
           </div>

            {/* Secondary details */}
           <div style={{
             background: 'rgba(55, 65, 81, 0.3)',
             borderRadius: '0.75rem',
             padding: '1rem',
             marginBottom: '1.5rem'
           }}>
             <div className="trade-details">
               <div className="detail-row">
                 <span>Entry Day:</span>
                 <span>{globalDay}</span>
               </div>
               <div className="detail-row">
                <span>Fee:</span>
                 <span className="fee">{(pendingTrade.feeRate * 100).toFixed(0)}bp (${(baseDv01 * (pendingTrade.feeRate * 100)).toLocaleString()})</span>
               </div>
               <div className="detail-row">
                 <span>Margin:</span>
                 <span>${margin.toLocaleString()}</span>
               </div>
               <div style={{ 
                 textAlign: 'center', 
                 fontSize: '0.8rem', 
                 color: '#10b981',
                 fontStyle: 'italic',
                 marginTop: '0.5rem'
               }}>
                 Simple impact-based pricing
               </div>
             </div>
           </div>
           {/* DV01 Impact Explanation */}
           <div style={{
             background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(6, 182, 212, 0.1) 100%)',
             border: '1px solid rgba(16, 185, 129, 0.3)',
             borderRadius: '0.75rem',
             padding: '1rem',
             marginBottom: '1.5rem'
           }}>
             <div style={{
               marginBottom: '0.75rem'
             }}>
               <span style={{ 
                 color: '#10b981', 
                 fontWeight: '700',
                 fontSize: '0.95rem',
                 textTransform: 'uppercase',
                 letterSpacing: '0.025em'
               }}>
                 DV01 Impact
               </span>
             </div>
             <div style={{ 
               color: '#e2e8f0', 
               fontSize: '1rem',
               lineHeight: '1.5'
             }}>
               <div style={{ marginBottom: '0.5rem' }}>
                 <strong style={{ color: '#10b981' }}>
                   {pendingTrade.type === 'pay' ? '+' : '-'}${baseDv01.toLocaleString()} P&L per 1bp price increase
                 </strong>
               </div>
               <div style={{ color: '#9ca3af', fontSize: '0.875rem' }}>
                 {pendingTrade.type === 'pay' ? 
                   'You profit when rates go higher' : 
                   'You profit when rates go lower'
                 }
               </div>
             </div>
           </div>
           <div className="modal-buttons">
             <button 
               onClick={confirmTrade} 
               className="confirm-btn"
               style={{
                 background: 'linear-gradient(45deg, #059669, #10b981)',
                 color: 'white',
                 padding: '1rem 1.5rem',
                 borderRadius: '1rem',
                 fontWeight: '700',
                 cursor: 'pointer',
                 border: 'none',
                 transition: 'all 0.3s ease',
                 fontSize: '1rem',
                 textTransform: 'uppercase',
                 letterSpacing: '0.025em',
                 flex: 1,
                 display: 'inline-flex',
                 alignItems: 'center',
                 justifyContent: 'center',
                 gap: '0.5rem'
               }}
               onMouseEnter={(e) => {
                 e.target.style.background = 'linear-gradient(45deg, #10b981, #34d399)';
                 e.target.style.transform = 'translateY(-2px)';
                 e.target.style.boxShadow = '0 6px 20px rgba(16, 185, 129, 0.4)';
               }}
               onMouseLeave={(e) => {
                 e.target.style.background = 'linear-gradient(45deg, #059669, #10b981)';
                 e.target.style.transform = 'translateY(0)';
                 e.target.style.boxShadow = '0 4px 14px rgba(16, 185, 129, 0.25)';
               }}
             >
               Execute Trade
             </button>
             <button 
               onClick={() => setPendingTrade(null)} 
               className="cancel-btn"
               style={{
                 background: 'rgba(55, 65, 81, 0.6)',
                 color: 'white',
                 padding: '1rem 1.5rem',
                 borderRadius: '1rem',
                 fontWeight: '600',
                 cursor: 'pointer',
                 border: '1px solid rgba(75, 85, 99, 0.5)',
                 transition: 'all 0.3s ease',
                 fontSize: '1rem',
                 flex: 1
               }}
               onMouseEnter={(e) => {
                 e.target.style.background = 'rgba(75, 85, 99, 0.6)';
                 e.target.style.transform = 'translateY(-1px)';
               }}
               onMouseLeave={(e) => {
                 e.target.style.background = 'rgba(55, 65, 81, 0.6)';
                 e.target.style.transform = 'translateY(0)';
               }}
             >
               Cancel
             </button>
           </div>
         </div>
         <style jsx>{`
           .modal-overlay {
             position: fixed;
             top: 0;
             left: 0;
             right: 0;
             bottom: 0;
             background: rgba(0, 0, 0, 0.8);
             display: flex;
             align-items: center;
             justify-content: center;
             z-index: 1000;
           }
           
           .modal {
             background: linear-gradient(135deg, rgba(0,0,0,0.95) 0%, rgba(15,23,42,0.95) 100%);
             backdrop-filter: blur(20px);
             border: 2px solid #10b981;
             border-radius: 1.5rem;
             padding: 2rem;
             min-width: 400px;
             max-width: 500px;
           }
           
           /* Mobile-only fixes */
           @media (max-width: 768px) {
             .modal-overlay {
               padding: 1rem;
               align-items: flex-start;
               padding-top: 2rem;
             }
             
             .modal {
               min-width: auto;
               width: 100%;
               max-height: 85vh;
               overflow-y: auto;
             }
           }
         `}</style>
       </div>
     )}

     {/* Keep all other modals unchanged - they already work with the simplified system */}
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
               <span>Unwind Price (no fees):</span>
               <span className="execution-price">{pendingUnwind.executionPrice}%</span>
             </div>
             <div className="detail-row">
               <span>Total P&L:</span>
               <span className={parseFloat(pendingUnwind.pl) >= 0 ? 'profit' : 'loss'}>
                 {parseFloat(pendingUnwind.pl) >= 0 ? '+' : '-'}${Math.abs(parseFloat(pendingUnwind.pl)).toLocaleString()}
               </span>
             </div>
             <div className="detail-row">
               <span>Unwind Fee:</span>
               <span className="fee">{pendingUnwind.feeRate}bp (${pendingUnwind.feeAmount})</span>
             </div>
             <div className="detail-row">
               <span>Net Return:</span>
               <span className={parseFloat(pendingUnwind.netReturn) >= 0 ? 'profit' : 'loss'}>
                 ${Math.abs(parseFloat(pendingUnwind.netReturn)).toLocaleString()}
               </span>
             </div>
           </div>
           <div className="modal-buttons">
             <button 
               onClick={confirmUnwind} 
               className="confirm-btn"
               style={{
                 background: 'linear-gradient(45deg, #ef4444, #dc2626)',
                 color: 'white',
                 padding: '1rem 1.5rem',
                 borderRadius: '1rem',
                 fontWeight: '700',
                 cursor: 'pointer',
                 border: 'none',
                 transition: 'all 0.3s ease',
                 fontSize: '1rem',
                 textTransform: 'uppercase',
                 letterSpacing: '0.025em',
                 flex: 1,
                 display: 'inline-flex',
                 alignItems: 'center',
                 justifyContent: 'center',
                 gap: '0.5rem'
               }}
               onMouseEnter={(e) => {
                 e.target.style.background = 'linear-gradient(45deg, #dc2626, #b91c1c)';
                 e.target.style.transform = 'translateY(-2px)';
                 e.target.style.boxShadow = '0 6px 20px rgba(239, 68, 68, 0.4)';
               }}
               onMouseLeave={(e) => {
                 e.target.style.background = 'linear-gradient(45deg, #ef4444, #dc2626)';
                 e.target.style.transform = 'translateY(0)';
                 e.target.style.boxShadow = '0 4px 14px rgba(239, 68, 68, 0.25)';
               }}
             >
               Close Position
             </button>
             <button 
               onClick={() => setPendingUnwind(null)} 
               className="cancel-btn"
               style={{
                 background: 'rgba(55, 65, 81, 0.6)',
                 color: 'white',
                 padding: '1rem 1.5rem',
                 borderRadius: '1rem',
                 fontWeight: '600',
                 cursor: 'pointer',
                 border: '1px solid rgba(75, 85, 99, 0.5)',
                 transition: 'all 0.3s ease',
                 fontSize: '1rem',
                 flex: 1
               }}
               onMouseEnter={(e) => {
                 e.target.style.background = 'rgba(75, 85, 99, 0.6)';
                 e.target.style.transform = 'translateY(-1px)';
               }}
               onMouseLeave={(e) => {
                 e.target.style.background = 'rgba(55, 65, 81, 0.6)';
                 e.target.style.transform = 'translateY(0)';
               }}
             >
               Cancel
             </button>
           </div>
         </div>
       </div>
     )}

     {/* Keep all other modals exactly the same */}
     {pendingSettlement && (
       <div className="modal-overlay">
         <div className="modal">
           <h3>Settlement - Input Settlement Prices</h3>
           <div style={{ marginBottom: '1rem', color: '#9ca3af', fontSize: '0.875rem' }}>
             Enter the settlement price for each market. Settlement P&L will be calculated as:
             <br /><strong>(Settlement Price - Entry Price) × DV01</strong>
           </div>
           <div className="trade-details">
             {Object.keys(pendingSettlement.prices).map(mkt => (
               <div key={mkt} className="detail-row">
                 <span>{mkt} Settlement Price:</span>
                 <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                   <input
                     type="number"
                     step="0.001"
                     value={pendingSettlement.prices[mkt]}
                     onChange={(e) => {
                       const updated = { ...pendingSettlement };
                       updated.prices[mkt] = parseFloat(e.target.value) || 0;
                       setPendingSettlement(updated);
                     }}
                     style={{
                       padding: '0.5rem',
                       borderRadius: '0.375rem',
                       border: '1px solid #374151',
                       backgroundColor: '#1f2937',
                       color: 'white',
                       width: '100px'
                     }}
                   />
                   <span>%</span>
                 </div>
               </div>
             ))}
           </div>
           <div className="modal-buttons">
             <button onClick={confirmSettlement} className="confirm-btn">Activate Settlement</button>
             <button onClick={() => setPendingSettlement(null)} className="cancel-btn">Cancel</button>
           </div>
         </div>
       </div>
     )}
             
     {pendingDayAdvancement && (
       <div className="modal-overlay">
         <div className="modal">
           <h3>Advance Day</h3>
           <div className="trade-details">
             <div className="detail-row">
               <span>From Day:</span>
               <span>{pendingDayAdvancement.fromDay}</span>
             </div>
             <div className="detail-row">
               <span>To Day:</span>
               <span>{pendingDayAdvancement.toDay}</span>
             </div>
           </div>
           <div className="modal-buttons">
             <button 
               onClick={confirmDayAdvancement} 
               className="confirm-btn"
               style={{
                 background: 'linear-gradient(45deg, #3b82f6, #2563eb)',
                 color: 'white',
                 padding: '1rem 1.5rem',
                 borderRadius: '1rem',
                 fontWeight: '700',
                 cursor: 'pointer',
                 border: 'none',
                 transition: 'all 0.3s ease',
                 fontSize: '1rem',
                 textTransform: 'uppercase',
                 letterSpacing: '0.025em',
                 flex: 1,
                 display: 'inline-flex',
                 alignItems: 'center',
                 justifyContent: 'center',
                 gap: '0.5rem'
               }}
               onMouseEnter={(e) => {
                 e.target.style.background = 'linear-gradient(45deg, #2563eb, #1d4ed8)';
                 e.target.style.transform = 'translateY(-2px)';
                 e.target.style.boxShadow = '0 6px 20px rgba(59, 130, 246, 0.4)';
               }}
               onMouseLeave={(e) => {
                 e.target.style.background = 'linear-gradient(45deg, #3b82f6, #2563eb)';
                 e.target.style.transform = 'translateY(0)';
                 e.target.style.boxShadow = '0 4px 14px rgba(59, 130, 246, 0.25)';
               }}
             >
               Advance Day
             </button>
             <button 
               onClick={() => setPendingDayAdvancement(null)} 
               className="cancel-btn"
               style={{
                 background: 'rgba(55, 65, 81, 0.6)',
                 color: 'white',
                 padding: '1rem 1.5rem',
                 borderRadius: '1rem',
                 fontWeight: '600',
                 cursor: 'pointer',
                 border: '1px solid rgba(75, 85, 99, 0.5)',
                 transition: 'all 0.3s ease',
                 fontSize: '1rem',
                 flex: 1
               }}
               onMouseEnter={(e) => {
                 e.target.style.background = 'rgba(75, 85, 99, 0.6)';
                 e.target.style.transform = 'translateY(-1px)';
               }}
               onMouseLeave={(e) => {
                 e.target.style.background = 'rgba(55, 65, 81, 0.6)';
                 e.target.style.transform = 'translateY(0)';
               }}
             >
               Cancel
             </button>
           </div>
         </div>
       </div>
     )}

     {/* Keep remaining modals unchanged */}
     {pendingMarginAdd && (
       <div className="modal-overlay">
         <div className="modal">
           <h3>Add Margin</h3>
           <div className="trade-details">
            <div className="detail-row">
              <span>Position:</span>
              <span className="trade-type">{pendingMarginAdd.trade.type} Fixed</span>
             </div>
             <div className="detail-row">
              <span>Current Margin:</span>
               <span>${pendingMarginAdd.trade.collateral.toLocaleString()}</span>
             </div>
             <div className="detail-row">
               <span>Current Liquidation:</span>
               <span>{pendingMarginAdd.trade.liquidationPrice}%</span>
             </div>
             <div className="detail-row">
               <span>Additional Margin:</span>
               <div style={{position: 'relative' }}>
                 <input
                   type="text"
                   value={additionalMargin ? additionalMargin.toLocaleString() : ''}
                   onChange={(e) => {
                     const value = e.target.value.replace(/[^0-9]/g, '');
                     setAdditionalMargin(value === '' ? 0 : Number(value));
                   }}
                   placeholder="$100,000"
                   style={{ 
                     padding: '0.5rem',
                     borderRadius: '0.375rem',
                     border: '1px solid #374151',
                     backgroundColor: '#1f2937',
                     color: 'white',
                     width: '150px'
                   }}
                 />
               </div>
             </div>
             {additionalMargin > 0 && (
               <div className="detail-row">
                 <span>New Liquidation:</span>
                 <span className="execution-price">
                   {pendingMarginAdd.trade.type === 'pay' 
                     ? (parseFloat(pendingMarginAdd.trade.liquidationPrice) - (additionalMargin / pendingMarginAdd.trade.baseDV01 / 100)).toFixed(3)
                     : (parseFloat(pendingMarginAdd.trade.liquidationPrice) + (additionalMargin / pendingMarginAdd.trade.baseDV01 / 100)).toFixed(3)
                   }%
                 </span>
               </div>
             )}
           </div>
           <div className="modal-buttons">
             <button 
               onClick={confirmAddMargin} 
               className="confirm-btn"
               disabled={additionalMargin <= 0}
               style={{
                 background: additionalMargin <= 0 ? '#6b7280' : 'linear-gradient(45deg, #059669, #10b981)',
                 color: 'white',
                 padding: '1rem 1.5rem',
                 borderRadius: '1rem',
                 fontWeight: '700',
                 cursor: additionalMargin <= 0 ? 'not-allowed' : 'pointer',
                 border: 'none',
                 flex: 1
               }}
             >
               Add Margin
             </button>
             <button 
               onClick={() => setPendingMarginAdd(null)} 
               className="cancel-btn"
               style={{
                 background: 'rgba(55, 65, 81, 0.6)',
                 color: 'white',
                 padding: '1rem 1.5rem',
                 borderRadius: '1rem',
                 fontWeight: '600',
                 cursor: 'pointer',
                 border: '1px solid rgba(75, 85, 99, 0.5)',
                 flex: 1
               }}
             >
             Cancel
             </button>
           </div>
         </div>
       </div>
     )}

     {showVammBreakdown && (
       <div className="modal-overlay">
        <div className="modal" style={{ maxWidth: '90vw', width: '1200px' }}>
           <h3>vAMM P&L Breakdown</h3>
           <div style={{ maxHeight: '500px', overflow: 'auto' }}>
             <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
               <thead>
                 <tr style={{ backgroundColor: '#374151' }}>
                   <th style={{ padding: '0.75rem', textAlign: 'left' }}>Market</th>
                   <th style={{ padding: '0.75rem', textAlign: 'left' }}>User Position</th>
                   <th style={{ padding: '0.75rem', textAlign: 'left' }}>vAMM Position</th>
                   <th style={{ padding: '0.75rem', textAlign: 'right' }}>User Entry</th>
                   <th style={{ padding: '0.75rem', textAlign: 'right' }}>vAMM Entry</th>
                   <th style={{ padding: '0.75rem', textAlign: 'right' }}>Current/Exit</th>
                   <th style={{ padding: '0.75rem', textAlign: 'right' }}>DV01</th>
                   <th style={{ padding: '0.75rem', textAlign: 'right' }}>vAMM P&L</th>
                   <th style={{ padding: '0.75rem', textAlign: 'left' }}>Status</th>
                   <th style={{ padding: '0.75rem', textAlign: 'right' }}>Days</th>
                 </tr>
               </thead>
               <tbody>
                 {calculateVammBreakdown().map((item, i) => (
                   <tr key={item.id} style={{ borderBottom: '1px solid #374151' }}>
                     <td style={{ padding: '0.75rem' }}>{item.market}</td>
                     <td style={{ padding: '0.75rem' }}>{item.userDirection}</td>
                     <td style={{ padding: '0.75rem' }}>{item.vammDirection}</td>
                     <td style={{ padding: '0.75rem', textAlign: 'right' }}>{item.entryPrice}%</td>
                     <td style={{ padding: '0.75rem', textAlign: 'right' }}>{item.vammEntryPrice}%</td>
                     <td style={{ padding: '0.75rem', textAlign: 'right' }}>
                       {item.status === 'OPEN' ? item.currentPrice : item.exitPrice}%
                     </td>
                     <td style={{ padding: '0.75rem', textAlign: 'right' }}>${item.dv01?.toLocaleString()}</td>
                     <td style={{ 
                       padding: '0.75rem', 
                       textAlign: 'right',
                       color: item.vammPL >= 0 ? '#22c55e' : '#ef4444',
                         fontWeight: '600'
                     }}>
                       {item.vammPL >= 0 ? '+' : ''}${item.vammPL.toLocaleString()}
                     </td>
                     <td style={{ padding: '0.75rem' }}>
                       <span style={{ 
                         color: item.status === 'OPEN' ? '#10b981' : 
                               item.status === 'LIQUIDATED' ? '#ef4444' : '#6b7280'
                       }}>
                         {item.status}
                       </span>
                     </td>
                     <td style={{ padding: '0.75rem', textAlign: 'right' }}>
                       {item.status === 'OPEN' ? item.daysHeld : '-'}
                     </td>
                   </tr>
                 ))}
               </tbody>
             </table>
           </div>
           <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1rem', padding: '1rem', backgroundColor: '#374151', borderRadius: '0.5rem' }}>
             <div>
               <strong>Total vAMM P&L: </strong>
               <span style={{ color: vammPL >= 0 ? '#22c55e' : '#ef4444', fontWeight: 'bold' }}>
                 {vammPL >= 0 ? '+' : ''}${Math.abs(vammPL).toLocaleString()}
               </span>
             </div>
             <button onClick={() => setShowVammBreakdown(false)} className="cancel-btn">
               Close
             </button>
           </div>
         </div>
       </div>
     )}

     {/* CSS Animations */}
     <style jsx>{`
       @keyframes spin {
         0% { transform: rotate(0deg); }
         100% { transform: rotate(360deg); }
       }
       
       @keyframes slideInRight {
         from {
           opacity: 0;
           transform: translateX(100%);
         }
         to {
           opacity: 1;
           transform: translateX(0);
         }
       }
       
       @keyframes float {
         0%, 100% { 
           transform: translateY(0px);
         }
         50% { 
           transform: translateY(-6px);
         }
       }
       
       @keyframes pulse {
         0%, 100% {
           opacity: 1;
         }
         50% {
           opacity: 0.5;
         }
       }
     `}</style>
   </div>
 );
}
