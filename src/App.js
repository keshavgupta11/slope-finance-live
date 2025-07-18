import React, { useState, useEffect, useMemo, useRef } from 'react';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer } from 'recharts';
import './App.css';

// Solana imports
import { Connection, PublicKey, clusterApiUrl } from '@solana/web3.js';
import { getAccount, getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from '@solana/spl-token';

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

// Phantom wallet detection
const getProvider = () => {
  if ('phantom' in window) {
    return window.phantom?.solana;
  }
  return null;
};

export default function App() {
  const initialMarketSettings = {
    "JitoSol": { apy: 7.98, k: 0.00001, symbol: "JitoSOL" }, // Based on your 2025 projection
    "Lido stETH": { apy: 2.88, k: 0.000005, symbol: "stETH" },
    "Aave ETH Lending": { apy: 1.9, k: 0.000005, symbol: "aETH" },
    "Aave ETH Borrowing": { apy: 2.62, k: 0.000005, symbol: "aETHBorrow" },
    "Rocketpool rETH": { apy: 2.64, k: 0.000005, symbol: "rETH" },
  };

  const [marketSettings, setMarketSettings] = useState(initialMarketSettings);
  const [market, setMarket] = useState("JitoSol");
  const [baseDv01, setBaseDv01] = useState(10000);
  const [margin, setMargin] = useState(500000);
  const [tradesByMarket, setTradesByMarket] = useState({});
  const [oiByMarket, setOiByMarket] = useState({});
  const [lastPriceByMarket, setLastPriceByMarket] = useState({});
  const [pendingTrade, setPendingTrade] = useState(null);
  const [tradeType, setTradeType] = useState('pay');
  const [activeTab, setActiveTab] = useState("Swap");
  const [tradeHistory, setTradeHistory] = useState([]);
  const [pendingUnwind, setPendingUnwind] = useState(null);
  const [totalFeesCollected, setTotalFeesCollected] = useState(0);
  const [totalVammPL, setTotalVammPL] = useState(0); // Stores P&L from closed/liquidated positions

  // New states for daily P&L system
  const [globalDay, setGlobalDay] = useState(0); // Protocol-wide day counter
  const [dailyClosingPrices, setDailyClosingPrices] = useState({}); // {market: {day: price}}
  const [pendingDayAdvancement, setPendingDayAdvancement] = useState(null);

  //settlement states
  const [isSettlementMode, setIsSettlementMode] = useState(false);
  const [settlementPrices, setSettlementPrices] = useState({});
  const [pendingSettlement, setPendingSettlement] = useState(null);
  //riskk
  const [tempSettlementPrices, setTempSettlementPrices] = useState({});
  //stress testing
  const [stressTestResult, setStressTestResult] = useState(null);
  //add margin
  const [pendingMarginAdd, setPendingMarginAdd] = useState(null);
  const [additionalMargin, setAdditionalMargin] = useState(0);
  const [showVammBreakdown, setShowVammBreakdown] = useState(false);
  //3d sphere
  const [show3DView, setShow3DView] = useState(false);
  const [selectedPosition, setSelectedPosition] = useState(null);
  const [showLegend, setShowLegend] = useState(false);
  //market dropdown
  const [showMarketDropdown, setShowMarketDropdown] = useState(false);
  const [customNotional, setCustomNotional] = useState(10000000); // Default $10M
  const [currentTipIndex, setCurrentTipIndex] = useState(0);
  // Solana wallet state
  const [wallet, setWallet] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [usdcBalance, setUsdcBalance] = useState(0);

  const tradingTips = [
    { icon: "💡", text: "Pay Fixed profits when rates go higher", category: "Strategy" },
    { icon: "📊", text: "DV01 shows your P&L sensitivity per 1bp rate move", category: "Education" },
    { icon: "⚡", text: "Risk-reducing trades get 2bp fees vs 5bp", category: "Pro Tip" },
    { icon: "🎯", text: "Watch liquidation risk - add margin when close", category: "Risk" },
    { icon: "📈", text: "Correlation trades: Lido steth/rETH often move together", category: "Advanced" },
    { icon: "🔄", text: "Settlement P&L uses realized rates vs entry price", category: "Settlement" },
    { icon: "⚖️", text: "Protocol risk = net difference between pay/receive", category: "Mechanics" },
    { icon: "🚀", text: "Larger positions get worse pricing due to impact", category: "Trading" }
  ];

  // Solana connection
  const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');
  
  // USDC token mint on devnet
  const USDC_MINT = new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'); // Devnet USDC

  // Calculate current DV01 based on time to maturity- deleted
  
  // Enhanced UI states
  const [toasts, setToasts] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [formErrors, setFormErrors] = useState({});

  // Helper function to round t/T ratio up to nearest 0.1
  const roundTimeRatioUp = (ratio) => {
    return Math.ceil(ratio * 10) / 10;
  };      

  // Helper function to calculate dynamic k based on time to maturity
  const calculateDynamicK = (baseK, daysToMaturity, totalDays = 365) => {
    const timeRatio = daysToMaturity / totalDays;
    const roundedRatio = roundTimeRatioUp(timeRatio);
    return baseK * roundedRatio;
  };

  // Helper function to round price to 3 decimal places with direction-specific rounding
  const roundPriceForDisplay = (price, tradeType) => {
      const numPrice = Number(price);
      if (tradeType === 'pay') {
        const cleanPrice = parseFloat(numPrice.toFixed(4));
        console.log('cleanprice',cleanPrice);
        // Round UP for payers
        return Math.ceil(cleanPrice * 1000) / 1000;
    } else {
        const cleanPrice = parseFloat(numPrice.toFixed(4));
        console.log('cleanprice',cleanPrice);
      // Round DOWN for receivers
      return Math.floor(cleanPrice * 1000) / 1000;
    }
  };

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

  // Settlement P&L calculation
  const calculateSettlementPL = (trade) => {
  const settlementPrice = settlementPrices[trade.market];
  if (!settlementPrice) return 0;
  
  const entryPrice = trade.entryPrice;
  const initialDV01 = trade.baseDV01;
  const directionFactor = trade.type === 'pay' ? 1 : -1;
  
  return (settlementPrice - entryPrice) * 100 * initialDV01 * directionFactor;
};


  // Calculate total P&L for a position from entry to current day
  const calculateTotalPL = (trade, currentPrice) => {
    let totalPL = 0;
    const entryDay = trade.entryDay || 0;
    const directionFactor = trade.type === 'pay' ? 1 : -1;

    // Calculate P&L for each day from entry to current global day
    for (let day = entryDay; day <= globalDay; day++) {
      const dayDv01 = trade.baseDV01;
      let dayPL = 0;

      if (day === entryDay) {
        // Day 0 (entry day)
        if (globalDay === entryDay) {
          // Still on entry day - use live price
          const priceDiff = currentPrice - trade.entryPrice;
          dayPL = priceDiff * 100 * dayDv01 * directionFactor;
        } else {
          // Past entry day - use day 0 closing price
          const day0ClosingPrice = dailyClosingPrices[trade.market]?.[entryDay] || currentPrice;
          const priceDiff = day0ClosingPrice - trade.entryPrice;
          dayPL = priceDiff * 100 * dayDv01 * directionFactor;
        }
      } else {
        // Day N (N > 0)
        const prevDayClosing = dailyClosingPrices[trade.market]?.[day - 1] || trade.entryPrice;
        let dayPrice;
        
        if (day === globalDay) {
          // Current day - use live price
          dayPrice = currentPrice;
        } else {
          // Past day - use closing price
          dayPrice = dailyClosingPrices[trade.market]?.[day] || prevDayClosing;
        }
        
        const priceDiff = dayPrice - prevDayClosing;
        dayPL = priceDiff * 100 * dayDv01 * directionFactor;
      }
      
      totalPL += dayPL;
    }

    return totalPL;
  };

  // Calculate today's P&L only (current day's performance)
  const calculateTodaysPL = (trade, currentPrice) => {
    const entryDay = trade.entryDay || 0;
    const directionFactor = trade.type === 'pay' ? 1 : -1;
    const currentDayDv01 = trade.baseDV01;

    if (globalDay === entryDay) {
      // Same day as entry - today's P&L is total P&L
      const priceDiff = currentPrice - trade.entryPrice;
      return priceDiff * 100 * currentDayDv01 * directionFactor;
    } else {
      // Different day - calculate P&L from yesterday's close to current price
      const yesterdayClosing = dailyClosingPrices[trade.market]?.[globalDay - 1] || trade.entryPrice;
      const priceDiff = currentPrice - yesterdayClosing;
      return priceDiff * 100 * currentDayDv01 * directionFactor;
    }
  };

  // Calculate protocol OI using current DV01s
  const calculateProtocolOI = () => {
    const oiByMarketCurrent = {};
    
    Object.keys(tradesByMarket).forEach(mkt => {
      let netOI = 0;
      const trades = tradesByMarket[mkt] || [];
      
      trades.forEach(trade => {
        const tradeDv01 = trade.baseDV01;
        const oiChange = trade.type === 'pay' ? tradeDv01 : -tradeDv01;
        netOI += oiChange;
      });
      
      oiByMarketCurrent[mkt] = netOI;
    });
    
    return oiByMarketCurrent;
  };

  // Phantom wallet functions
  const connectWallet = async () => {
    setConnecting(true);
    try {
      const provider = getProvider();
      if (!provider) {
        showToast('Phantom wallet not found! Please install Phantom wallet.', 'error');
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
      showToast('Failed to connect wallet. Please try again.', 'error');
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
          // First update all trades with current P&L using daily calculation
          updated[mkt] = updated[mkt].map(trade => {
            const updatedTrade = { ...trade };
            updatedTrade.currentDay = globalDay;
            updatedTrade.currentDV01 = trade.baseDV01;
            updatedTrade.currentPrice = lastPriceByMarket[mkt] || marketSettings[mkt].apy;

            // Use total P&L calculation
            const totalPL = isSettlementMode ? calculateSettlementPL(updatedTrade) : calculateTotalPL(updatedTrade, updatedTrade.currentPrice);
            const todaysPL = isSettlementMode ? 0 : calculateTodaysPL(updatedTrade, updatedTrade.currentPrice);
            updatedTrade.pl = totalPL.toFixed(2);
            updatedTrade.pnl = totalPL;
            updatedTrade.todaysPL = todaysPL;

            return updatedTrade;
          });

          // Then filter out liquidated positions
          updated[mkt] = updated[mkt].filter(trade => {
            // Check for liquidation: only if P&L is negative and exceeds margin
            if (trade.pnl < 0 && Math.abs(trade.pnl) > trade.collateral) {
              // Position is liquidated
              liquidatedPositions.push({
                market: mkt,
                trade: trade,
                liquidationPrice: trade.currentPrice
              });
              
              // Don't include this trade in the updated array (it's liquidated)
              return false;
            }
            return true;
          });
        }
      });
      
      // Process liquidations
      if (liquidatedPositions.length > 0) {
        liquidatedPositions.forEach(({ market: mkt, trade, liquidationPrice }) => {
          // Calculate vAMM P&L from liquidation and freeze it
          const vammDirection = trade.type === 'pay' ? -1 : 1; // vAMM has opposite position
          
          // Calculate vAMM's daily P&L up to liquidation point using raw entry price
          const vammTrade = {
            ...trade,
            entryPrice: trade.rawPrice, // vAMM enters at raw price
            type: trade.type === 'pay' ? 'receive' : 'pay' // Opposite direction
          };
          const vammLiquidationPL = calculateTotalPL(vammTrade, parseFloat(trade.liquidationPrice));
          setTotalVammPL(prev => prev + vammLiquidationPL);
          
          // Add to trade history
          setTradeHistory(prevHistory => [...prevHistory, {
            date: new Date().toLocaleDateString(),
            market: mkt,
            direction: trade.type === 'pay' ? 'Pay Fixed' : 'Receive Fixed',
            entryPrice: trade.entryPrice.toFixed(3),
            exitPrice: parseFloat(trade.liquidationPrice).toFixed(3),
            dv01: trade.currentDV01,
            finalPL: (-trade.collateral).toFixed(2),
            vammPL: vammLiquidationPL,
            status: 'LIQUIDATED'
          }]);
          
          console.log(`Position liquidated: ${trade.type} ${trade.currentDV01} at ${liquidationPrice}%`);
          showToast(`LIQUIDATION: Your ${trade.type} fixed position of ${trade.currentDV01.toLocaleString()} in ${mkt} was liquidated at ${liquidationPrice}%. You lost your entire margin of ${trade.collateral.toLocaleString()}.`, 'error');
        });
      }
      
      return updated;
    });
    
    // Update OI based on current DV01s
    setOiByMarket(calculateProtocolOI());
  }, [globalDay, lastPriceByMarket, marketSettings, dailyClosingPrices, isSettlementMode, settlementPrices]);

  useEffect(() => {
      const interval = setInterval(() => {
        setCurrentTipIndex(prev => (prev + 1) % tradingTips.length);
      }, 5000);
      
      return () => clearInterval(interval);
    }, []);

  //3d sphere function
  const FloatingPositionSpheres = () => {
    const canvasRef = useRef(null);
    const animationRef = useRef(null);
    
    // Get all positions from all markets
    const allPositions = [];
    Object.keys(tradesByMarket).forEach(market => {
      const trades = tradesByMarket[market] || [];
      trades.forEach((trade, index) => {
        const currentPrice = lastPriceByMarket[market] || marketSettings[market].apy;
        const pl = calculateTotalPL(trade, currentPrice);
        const liquidationRisk = calculateLiquidationRisk(trade);
        
        allPositions.push({
          id: `${market}-${index}`,
          market,
          trade,
          pl,
          liquidationRisk,
          dv01: trade.baseDV01,
          type: trade.type,
          entryPrice: trade.entryPrice,
          currentPrice,
          collateral: trade.collateral
        });
      });
    });

    useEffect(() => {
      if (!canvasRef.current || !show3DView) return;
      
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      
      // Set canvas size - simple approach with forced refresh
      const resizeCanvas = () => {
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = rect.height;
      };
      
      // Multiple resize attempts to ensure proper sizing
      resizeCanvas();
      
      // Force immediate re-render
      requestAnimationFrame(resizeCanvas);
      
      // Additional backup resizes
      setTimeout(resizeCanvas, 50);
      setTimeout(resizeCanvas, 150);
      setTimeout(resizeCanvas, 300);
      
      let animationTime = 0;
      
      // Create sphere positions - DV01 for size, liquidation risk for distance from center
      const spheres = allPositions.map((position, i) => {
        console.log(`Position ${i}:`, position.market, position.dv01, position.liquidationRisk); // Debug
        
        // Size based on DV01 - more granular scaling every 5k
        const dv01 = position.dv01;
        let dv01Size;
        
        if (dv01 <= 5000) {
          dv01Size = 18; // Base size for 5k and under (increased from 15)
        } else if (dv01 <= 10000) {
          dv01Size = 22; // 10k (increased from 18)
        } else if (dv01 <= 15000) {
          dv01Size = 26; // 15k (increased from 21)
        } else if (dv01 <= 20000) {
          dv01Size = 30; // 20k (increased from 24)
        } else if (dv01 <= 25000) {
          dv01Size = 34; // 25k (increased from 27)
        } else if (dv01 <= 30000) {
          dv01Size = 38; // 30k (increased from 30)
        } else if (dv01 <= 40000) {
          dv01Size = 42; // 40k (increased from 34)
        } else if (dv01 <= 50000) {
          dv01Size = 46; // 50k (increased from 38)
        } else {
          dv01Size = Math.min(50, 46 + ((dv01 - 50000) / 10000) * 2); // 50k+ scales gradually (increased max)
        }
        
        // Distance from center based on liquidation risk (closer to liquidation = closer to center)
        const liquidationDistance = Math.max(5, position.liquidationRisk); // Minimum 5bp for safety
        
        // Calculate max safe radius based on canvas size (assume minimum 300px canvas)
        const maxSafeRadius = 120; // Keep spheres well within bounds
        const radiusFromCenter = Math.min(maxSafeRadius, Math.max(60, liquidationDistance * 1.8)); // Reduced scaling and max radius
        
        // Always position on circumference - spread them out more
        const angle = (i / allPositions.length) * Math.PI * 2;
        const x = Math.cos(angle) * radiusFromCenter;
        const y = Math.sin(angle) * radiusFromCenter;
        
        console.log(`Sphere ${i} position:`, { x, y, size: dv01Size, radius: radiusFromCenter }); // Debug
        
        return {
          ...position,
          x,
          y,
          size: dv01Size,
          baseSize: dv01Size,
          radiusFromCenter
        };
      });
      
      const animate = () => {
        animationTime += 0.01;
        
        // Clear canvas with gradient background
        const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
        gradient.addColorStop(0, '#0f172a');
        gradient.addColorStop(0.5, '#1e293b');
        gradient.addColorStop(1, '#0f172a');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Draw subtle grid pattern
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.05)';
        ctx.lineWidth = 1;
        const gridSize = 30;
        for (let x = 0; x < canvas.width; x += gridSize) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, canvas.height);
          ctx.stroke();
        }
        for (let y = 0; y < canvas.height; y += gridSize) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(canvas.width, y);
          ctx.stroke();
        }
        
        // Draw floating particles for ambiance
        ctx.fillStyle = 'rgba(148, 163, 184, 0.3)';
        for (let i = 0; i < 12; i++) {
          const particleX = (Math.sin(animationTime * 0.3 + i) * 100 + canvas.width / 2) % canvas.width;
          const particleY = (Math.cos(animationTime * 0.2 + i) * 80 + canvas.height / 2) % canvas.height;
          ctx.beginPath();
          ctx.arc(particleX, particleY, 1, 0, Math.PI * 2);
          ctx.fill();
        }
        
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        
        // Draw liquidation blackhole in center
        const blackholeRadius = 20;
        const blackholeGradient = ctx.createRadialGradient(
          centerX, centerY, 0,
          centerX, centerY, blackholeRadius
        );
        blackholeGradient.addColorStop(0, 'rgba(0, 0, 0, 0.9)');
        blackholeGradient.addColorStop(0.7, 'rgba(0, 0, 0, 0.6)');
        blackholeGradient.addColorStop(1, 'rgba(0, 0, 0, 0.2)');
        ctx.fillStyle = blackholeGradient;
        ctx.beginPath();
        ctx.arc(centerX, centerY, blackholeRadius, 0, Math.PI * 2);
        ctx.fill();
        
        // Draw liquidation center dot - pure black
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.arc(centerX, centerY, 8, 0, Math.PI * 2);
        ctx.fill();
        
        // White border around dot for visibility
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(centerX, centerY, 8, 0, Math.PI * 2);
        ctx.stroke();
        
        // Pulsing effect for blackhole - dark rings
        const pulseRadius = blackholeRadius + Math.sin(animationTime * 4) * 5;
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(centerX, centerY, pulseRadius, 0, Math.PI * 2);
        ctx.stroke();
        
        // Draw spheres with improved rendering
        spheres.forEach((sphere, i) => {
          // Position with gentle floating
          const floatOffset = Math.sin(animationTime * 2 + i) * 3;
          const screenX = centerX + sphere.x;
          const screenY = centerY + sphere.y + floatOffset;
          
          // Color based on P&L - simple red/green
          let sphereColor, shadowColor;
          if (sphere.pl >= 0) {
            sphereColor = '#22c55e'; // Green for profit
            shadowColor = 'rgba(34, 197, 94, 0.4)';
          } else {
            sphereColor = '#ef4444'; // Red for loss
            shadowColor = 'rgba(239, 68, 68, 0.4)';
          }
          
          // Draw shadow with better quality
          ctx.fillStyle = shadowColor;
          ctx.beginPath();
          ctx.arc(screenX + 3, screenY + 3, sphere.size, 0, Math.PI * 2);
          ctx.fill();
          
          // Draw outer glow with more gradient stops for smoother effect
          const glowGradient = ctx.createRadialGradient(
            screenX, screenY, sphere.size * 0.3,
            screenX, screenY, sphere.size + 12
          );
          glowGradient.addColorStop(0, sphereColor + 'cc');
          glowGradient.addColorStop(0.4, sphereColor + '80');
          glowGradient.addColorStop(0.7, sphereColor + '40');
          glowGradient.addColorStop(1, 'transparent');
          ctx.fillStyle = glowGradient;
          ctx.beginPath();
          ctx.arc(screenX, screenY, sphere.size + 12, 0, Math.PI * 2);
          ctx.fill();
          
          // Draw main sphere with multiple gradient layers for depth
          const sphereGradient = ctx.createRadialGradient(
            screenX - sphere.size/2.5, screenY - sphere.size/2.5, 0,
            screenX, screenY, sphere.size
          );
          sphereGradient.addColorStop(0, sphereColor + 'ff');
          sphereGradient.addColorStop(0.3, sphereColor + 'f0');
          sphereGradient.addColorStop(0.7, sphereColor + 'cc');
          sphereGradient.addColorStop(1, sphereColor + '99');
          ctx.fillStyle = sphereGradient;
          ctx.beginPath();
          ctx.arc(screenX, screenY, sphere.size, 0, Math.PI * 2);
          ctx.fill();
          
          // Add inner rim for more depth
          const rimGradient = ctx.createRadialGradient(
            screenX, screenY, sphere.size * 0.85,
            screenX, screenY, sphere.size
          );
          rimGradient.addColorStop(0, 'transparent');
          rimGradient.addColorStop(1, 'rgba(0, 0, 0, 0.2)');
          ctx.fillStyle = rimGradient;
          ctx.beginPath();
          ctx.arc(screenX, screenY, sphere.size, 0, Math.PI * 2);
          ctx.fill();
          
          // Draw multiple highlights for glass effect
          // Main highlight
          ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
          ctx.beginPath();
          ctx.arc(screenX - sphere.size/2.8, screenY - sphere.size/2.8, sphere.size/4, 0, Math.PI * 2);
          ctx.fill();
          
          // Secondary highlight
          ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
          ctx.beginPath();
          ctx.arc(screenX - sphere.size/4, screenY - sphere.size/4, sphere.size/8, 0, Math.PI * 2);
          ctx.fill();
          
          // Create a circular clip for the logo
          ctx.save();
          ctx.beginPath();
          ctx.arc(screenX, screenY, sphere.size * 0.6, 0, Math.PI * 2);
          ctx.clip();
          
          // Draw market letter directly on sphere
          ctx.fillStyle = 'white';
          ctx.font = `bold ${Math.max(12, sphere.size/2)}px -apple-system, system-ui, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
          ctx.shadowOffsetX = 1;
          ctx.shadowOffsetY = 1;
          ctx.shadowBlur = 2;
          
          const label = sphere.market === 'JitoSol' ? 'J' : 
                      sphere.market === 'Lido stETH' ? 'L' : 
                      sphere.market === 'Rocketpool rETH' ? 'R' :
                      sphere.market.includes('Aave') ? 'A' : 'M';
          ctx.fillText(label, screenX, screenY);
          
          ctx.restore(); // Restore clip
          
          // Reset shadow for next elements
          ctx.shadowColor = 'transparent';
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 0;
          ctx.shadowBlur = 0;
          
          // Position type indicator - more refined
          const indicatorColor = sphere.type === 'pay' ? '#3b82f6' : '#f59e0b';
          ctx.fillStyle = indicatorColor;
          ctx.beginPath();
          ctx.arc(screenX + sphere.size/2, screenY - sphere.size/2, 4, 0, Math.PI * 2);
          ctx.fill();
          
          // Indicator border
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(screenX + sphere.size/2, screenY - sphere.size/2, 4, 0, Math.PI * 2);
          ctx.stroke();
          
          // Store screen position for click detection
          sphere.screenX = screenX;
          sphere.screenY = screenY;
          sphere.screenSize = sphere.size;
        });
        
        animationRef.current = requestAnimationFrame(animate);
      };
      
      animate();
      
      // Click handler - improved for single trades
      const handleClick = (e) => {
        const rect = canvas.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const clickY = e.clientY - rect.top;
        
        // Find clicked sphere - improved detection
        const clickedSphere = spheres.find(sphere => {
          const distance = Math.sqrt(
            (clickX - sphere.screenX) ** 2 + (clickY - sphere.screenY) ** 2
          );
          // Increased tolerance, especially for single trades
          const tolerance = sphere.screenSize + 15;
          return distance <= tolerance;
        });
        
        if (clickedSphere) {
          setSelectedPosition(clickedSphere);
        } else {
          setSelectedPosition(null);
        }
      };
      
      canvas.addEventListener('click', handleClick);
      window.addEventListener('resize', resizeCanvas);
      
      return () => {
        if (animationRef.current) {
          cancelAnimationFrame(animationRef.current);
        }
        canvas.removeEventListener('click', handleClick);
        window.removeEventListener('resize', resizeCanvas);
      };
    }, [show3DView, allPositions, lastPriceByMarket]);

    // No positions case
    if (allPositions.length === 0) {
      return (
        <div style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: '1px solid #374151',
          borderRadius: '0.75rem',
          backgroundColor: '#111827',
          color: '#9ca3af'
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🌌</div>
            <div style={{ fontSize: '1.125rem', marginBottom: '0.5rem' }}>No positions yet</div>
            <div style={{ fontSize: '0.875rem' }}>Open some trades to see your portfolio galaxy</div>
          </div>
        </div>
      );
    }

    return (
      <div style={{ position: 'relative', width: '100%', height: '100%' }}>
        <canvas
          ref={canvasRef}
          style={{
            width: '100%',
            height: '100%',
            borderRadius: '0.75rem',
            border: '2px solid #334155',
            backgroundColor: '#0f172a',
            cursor: 'pointer',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)'
          }}
        />
        
        {/* Legend - toggleable and improved */}
        <div 
          onClick={() => setShowLegend(!showLegend)}
          style={{
            position: 'absolute',
            top: '0.75rem',
            left: '0.75rem',
            background: 'rgba(0, 0, 0, 0.85)',
            color: 'white',
            padding: showLegend ? '0.75rem' : '0.5rem',
            borderRadius: '0.5rem',
            fontSize: '0.7rem',
            backdropFilter: 'blur(8px)',
            cursor: 'pointer',
            transition: 'all 0.3s ease',
            minWidth: showLegend ? '150px' : '60px',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)'
          }}
        >
          {showLegend ? (
            <div>
              <div style={{ fontWeight: '600', marginBottom: '0.5rem', color: '#f1f5f9' }}>Position Galaxy</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem' }}>
                <div style={{ width: '8px', height: '8px', backgroundColor: '#10b981', borderRadius: '50%' }}></div>
                <span>Profit</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem' }}>
                <div style={{ width: '8px', height: '8px', backgroundColor: '#ef4444', borderRadius: '50%' }}></div>
                <span>Loss</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem' }}>
                <div style={{ width: '8px', height: '8px', backgroundColor: '#f59e0b', borderRadius: '50%' }}></div>
                <span>At Risk</span>
              </div>
              <div style={{ fontSize: '0.6rem', color: '#cbd5e1', marginTop: '0.5rem', borderTop: '1px solid rgba(255, 255, 255, 0.1)', paddingTop: '0.5rem' }}>
                Size = DV01 Amount<br/>
                Distance = Liquidation Risk<br/>
                Click spheres for details
              </div>
            </div>
          ) : (
            <div style={{ fontWeight: '600', textAlign: 'center', fontSize: '0.65rem' }}>
              🌌<br/>
              <span style={{ fontSize: '0.55rem', color: '#cbd5e1' }}>click</span>
            </div>
          )}
        </div>
        
        {/* Selected position details */}
        {selectedPosition && (
          <div style={{
            position: 'absolute',
            top: '1rem',
            right: '1rem',
            bottom: '1rem',
            background: 'rgba(0, 0, 0, 0.9)',
            color: 'white',
            padding: '1rem',
            borderRadius: '0.5rem',
            fontSize: '0.875rem',
            minWidth: '250px',
            maxWidth: '300px',
            backdropFilter: 'blur(4px)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            zIndex: 1000,
            maxHeight: 'calc(100% - 2rem)',
            overflow: 'auto',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)'
          }}>
            <div style={{ fontWeight: '600', marginBottom: '0.75rem', color: '#fbbf24' }}>
              {selectedPosition.market} Position
            </div>
            <div style={{ marginBottom: '0.5rem' }}>
              <strong>Direction:</strong> {selectedPosition.type === 'pay' ? 'Pay Fixed' : 'Receive Fixed'}
            </div>
            <div style={{ marginBottom: '0.5rem' }}>
              <strong>DV01:</strong> ${selectedPosition.dv01.toLocaleString()}
            </div>
            <div style={{ marginBottom: '0.5rem' }}>
              <strong>Entry Price:</strong> {selectedPosition.entryPrice.toFixed(3)}%
            </div>
            <div style={{ marginBottom: '0.5rem' }}>
              <strong>Current Price:</strong> {selectedPosition.currentPrice.toFixed(3)}%
            </div>
            <div style={{ marginBottom: '0.5rem' }}>
              <strong>Margin:</strong> ${selectedPosition.collateral.toLocaleString()}
            </div>
            <div style={{ 
              marginBottom: '0.5rem',
              color: selectedPosition.pl >= 0 ? '#22c55e' : '#ef4444'
            }}>
              <strong>P&L:</strong> {selectedPosition.pl >= 0 ? '+' : ''}${selectedPosition.pl.toLocaleString()}
            </div>
            <div style={{ 
              marginBottom: '0.75rem',
              color: selectedPosition.liquidationRisk <= 20 ? '#fbbf24' : '#22c55e'
            }}>
              <strong>Liquidation Risk:</strong> {selectedPosition.liquidationRisk.toFixed(0)}bp away
            </div>
            <button
              onClick={() => setSelectedPosition(null)}
              style={{
                background: '#374151',
                color: 'white',
                border: 'none',
                padding: '0.75rem 1rem',
                borderRadius: '0.375rem',
                fontSize: '0.875rem',
                cursor: 'pointer',
                width: '100%',
                fontWeight: '600',
                transition: 'all 0.2s ease',
                marginTop: '0.5rem'
              }}
              onMouseEnter={(e) => {
                e.target.style.background = '#4b5563';
              }}
              onMouseLeave={(e) => {
                e.target.style.background = '#374151';
              }}
            >
              ✕ Close Details
            </button>
          </div>
        )}
      </div>
    );
  };

  const generateChartData = () => {
    // Use actual historical data for JitoSOL based on your Excel analysis
    if (market === "JitoSol") {
      return [
        { date: "2024-Q1", apy: 7.04, year: 2024.0 },
        { date: "2024-Q2", apy: 7.48, year: 2024.25 },
        { date: "2024-Q3", apy: 7.85, year: 2024.5 },
        { date: "2024-Q4", apy: 8.26, year: 2024.75 },
        { date: "2025-Q1", apy: 8.10, year: 2025.0 },
        { date: "2025-Q2", apy: 8.11, year: 2025.25 } // Your 2025 projection
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
    //this section not used anymore- was for adding charts
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

  // Calculate vAMM P&L and Protocol P&L using daily calculation
  const calculateProtocolMetrics = () => {
    let openVammPL = 0;
    
    // Calculate P&L from currently open trades using daily calculation
    const allTrades = Object.values(tradesByMarket).flat();
    allTrades.forEach(trade => {
      const currentPrice = lastPriceByMarket[trade.market] || marketSettings[trade.market].apy;
      
      // vAMM has opposite position and enters at raw price
      const vammTrade = {
        ...trade,
        entryPrice: trade.rawPrice, // vAMM enters at raw price (before fees)
        type: trade.type === 'pay' ? 'receive' : 'pay' // Opposite direction
      };
      
      const vammDailyPL = calculateTotalPL(vammTrade, currentPrice);
      openVammPL += vammDailyPL;
    });
    
    // Total vAMM P&L = closed/liquidated trades P&L + open trades P&L
    const totalVammPLCombined = totalVammPL + openVammPL;
    
    return { vammPL: totalVammPLCombined, protocolPL: totalFeesCollected };
  };

  // Settlement functions
  const requestSettlement = () => {
    const initialPrices = {};
    Object.keys(marketSettings).forEach(mkt => {
    initialPrices[mkt] = marketSettings[mkt].apy;
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
    const currentClosingPrices = {};
    Object.keys(marketSettings).forEach(mkt => {
      currentClosingPrices[mkt] = lastPriceByMarket[mkt] || marketSettings[mkt].apy;
    });
    
    setPendingDayAdvancement({
      fromDay: globalDay,
      toDay: globalDay + 1,
      closingPrices: currentClosingPrices
    });
  };

  const confirmDayAdvancement = () => {
    const { toDay, closingPrices } = pendingDayAdvancement;
    
    // Store closing prices for the previous day
    setDailyClosingPrices(prev => {
      const updated = { ...prev };
      Object.keys(closingPrices).forEach(mkt => {
        if (!updated[mkt]) updated[mkt] = {};
        updated[mkt][globalDay] = closingPrices[mkt]; // Store current day's closing prices
      });
      return updated;
    });
    
    // Update global day
    setGlobalDay(toDay);
    
    // Update all live trades with new DV01s (P&L will be recalculated in useEffect)
    setTradesByMarket(prev => {
      const updated = { ...prev };
      Object.keys(updated).forEach(mkt => {
        if (updated[mkt]) {
          updated[mkt] = updated[mkt].map(trade => ({
            ...trade,
            currentDay: toDay,
            currentDV01: trade.baseDV01
          }));
        }
      });
      return updated;
    });
    
    setPendingDayAdvancement(null);
    showToast(`Advanced to Day ${toDay}. All live positions updated with new DV01s and daily P&L recalculated.`, 'success');
  };

  // Unwind function
  const requestUnwind = (tradeIndex) => {
    const trade = marketTrades[tradeIndex];
    if (!trade) return;

    const protocolOI = calculateProtocolOI();
    const currentOI = protocolOI[trade.market] || 0;
    
    // Calculate unwind execution price using current DV01
    const preOI = currentOI;
    const currentTradeDv01 = trade.baseDV01;
    const postOI = trade.type === 'pay' ? currentOI - currentTradeDv01 : currentOI + currentTradeDv01;
    
    // Calculate pricing based on risk change
    const preRisk = Math.abs(preOI);
    const postRisk = Math.abs(postOI);
    
    let unwindPrice;
    let feeBps;
    let executionPrice;
    
    const { apy: baseAPY, k } = marketSettings[trade.market];
    
    // Calculate dynamic k based on current global day
    const daysToMaturity = Math.max(0, 365 - globalDay);
    const dynamicK = calculateDynamicK(k, daysToMaturity);

    // Apply correlation adjustment for Lido/Aave ETH Lending
    const correlationMultiplier = getCorrelationMultiplier(trade.market, trade.type === 'pay' ? 'receive' : 'pay', currentTradeDv01);
    const adjustedDynamicK = dynamicK * correlationMultiplier;

    
    if (postRisk > preRisk) {
      // Risk increasing: use post OI directly + 5bp fee
      unwindPrice = baseAPY + adjustedDynamicK * postOI;
      feeBps = 5;
      const feeInPrice = feeBps / 100;
      const directionFactor = trade.type === 'pay' ? -1 : 1; // Opposite for unwind
      executionPrice = unwindPrice + (feeInPrice * directionFactor);
    } else if (postRisk < preRisk) {
      // Risk reducing: use midpoint
      const midpointOI = (preOI + postOI) / 2;
      unwindPrice = baseAPY + adjustedDynamicK * midpointOI;
      feeBps = 2;
      const feeInPrice = feeBps / 100;
      const directionFactor = trade.type === 'pay' ? -1 : 1; // Opposite for unwind
      executionPrice = unwindPrice + (feeInPrice * directionFactor);
    } else {
      // Risk staying same (absolute value): use midpoint with 5bp fees
      const midpointOI = (preOI + postOI) / 2;
      unwindPrice = baseAPY + adjustedDynamicK * midpointOI;
      feeBps = 5;
      const feeInPrice = feeBps / 100;
      const directionFactor = trade.type === 'pay' ? -1 : 1; // Opposite for unwind
      executionPrice = unwindPrice + (feeInPrice * directionFactor);
    }
    
    // Round execution price for display with directional rounding
    // For unwind, the trade direction is opposite: pay traders are selling (receive), receive traders are buying (pay)
    const unwindTradeType = trade.type === 'pay' ? 'receive' : 'pay';
    const roundedExecutionPrice = roundPriceForDisplay(executionPrice, unwindTradeType);
    
    // Calculate fees using current DV01 and no fee if settlement
    const feeAmount = isSettlementMode ? 0 : currentTradeDv01 * feeBps;

    
    // Calculate P&L using settlement or total P&L calculation
    const totalPL = isSettlementMode ? calculateSettlementPL(trade) : calculateTotalPL(trade, roundedExecutionPrice);
    const netReturn = trade.collateral + totalPL;
    
    setPendingUnwind({
      tradeIndex,
      trade,
      executionPrice: isSettlementMode ? settlementPrices[trade.market].toFixed(3) : roundedExecutionPrice.toFixed(3),
      rawUnwindPrice: isSettlementMode ? settlementPrices[trade.market].toFixed(3) : unwindPrice.toFixed(3),
      entryPrice: trade.entryPrice.toFixed(3),
      pl: totalPL.toFixed(2),
      feeAmount: feeAmount.toFixed(2),
      netReturn: netReturn.toFixed(2),
      feeRate: isSettlementMode ? "0" : feeBps.toString(),
      feeBps: isSettlementMode ? 0 : feeBps
      });
  };

  const confirmUnwind = () => {
    const { tradeIndex, trade, executionPrice, rawUnwindPrice, pl, netReturn } = pendingUnwind;
    
    // Calculate final vAMM P&L using daily calculation and freeze it
    const vammTrade = {
      ...trade,
      entryPrice: trade.rawPrice, // vAMM enters at raw price
      type: trade.type === 'pay' ? 'receive' : 'pay' // Opposite direction
    };
    // Use the raw unwind price (without user fees) for vAMM P&L calculation
    const finalVammPL = calculateTotalPL(vammTrade, parseFloat(rawUnwindPrice));
    setTotalVammPL(prev => prev + finalVammPL);
    
    // Add unwind fee to total
    const currentTradeDv01 = trade.baseDV01;
    const feeAmount = currentTradeDv01 * pendingUnwind.feeBps;
    setTotalFeesCollected(prev => prev + feeAmount);
    
    // Add to trade history
    setTradeHistory(prev => [...prev, {
      date: new Date().toLocaleDateString(),
      market: trade.market,
      direction: trade.type === 'pay' ? 'Pay Fixed' : 'Receive Fixed',
      entryPrice: trade.entryPrice.toFixed(3),
      exitPrice: parseFloat(executionPrice).toFixed(3),
      dv01: currentTradeDv01,
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
    
    // Update market price to the raw unwind price (the new "last trade")
    setLastPriceByMarket(prev => ({
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
  
  // Check wallet balance
    const simulatedUSDC = usdcBalance + 10000000;
    if (simulatedUSDC < additionalMargin) {
      showToast(`Insufficient USDC balance. Required: $${margin.toLocaleString()}, Available: $${simulatedUSDC.toLocaleString()}`, 'error');
      return;
    }

    try {
    // Simulate wallet transaction
      if (wallet) {
        console.log('Processing margin addition...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

    // Calculate new liquidation price
      const marginBuffer = additionalMargin / trade.currentDV01 / 100;
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


  const getCorrelationMultiplier = (market, tradeType, tradeDv01) => {
  // Only apply to correlated pair: Lido stETH and Aave ETH Lending
  if (market !== "Lido stETH" && market !== "Rocketpool rETH") {
    return 1.0; // No adjustment for other markets
  }
  
  // Calculate combined exposure for the correlated pair
  const lidoTrades = tradesByMarket["Lido stETH"] || [];
  const rocketpoolTrades = tradesByMarket["Rocketpool rETH"] || [];
  
  let combinedOI = 0;
  
  // Sum Lido positions
  lidoTrades.forEach(trade => {
    combinedOI += trade.type === 'pay' ? trade.baseDV01 : -trade.baseDV01;
  });
  
  // Sum Aave Lending positions  
  rocketpoolTrades.forEach(trade => {
    combinedOI += trade.type === 'pay' ? trade.baseDV01 : -trade.baseDV01;
  });
  
  // Add proposed trade to combined exposure
  const newTradeOI = tradeType === 'pay' ? tradeDv01 : -tradeDv01;
  const postTradeCombinedOI = combinedOI + newTradeOI;
  
  // Only apply correlation adjustment if absolute exposure >= 20k
  if (Math.abs(combinedOI) < 20000) {
    return 1.0; // Normal pricing under 20k threshold
  }
  
  // If trade reduces combined correlated exposure: tighter spread (0.8x k)
  if (Math.abs(postTradeCombinedOI) < Math.abs(combinedOI)) {
    return 0.8;
  }
  
  // If trade increases combined correlated exposure: wider spread (1.2x k)
  if (Math.abs(postTradeCombinedOI) > Math.abs(combinedOI)) {
    return 1.2;
  }
  
  return 1.0; // No change if exposure stays same
};

//stress testing function
const calculateStressTest = (direction) => {
  let totalPL = 0;
  let positionCount = 0;
  
  Object.keys(tradesByMarket).forEach(market => {
    const trades = tradesByMarket[market] || [];
    trades.forEach(trade => {
      const currentPrice = lastPriceByMarket[market] || marketSettings[market].apy;
      const stressPrice = currentPrice + (direction * 1.0); // +/- 100bp (1.0%)
      
      const stressPL = calculateTotalPL(trade, stressPrice);
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
      const currentPrice = lastPriceByMarket[market] || marketSettings[market].apy;
      
      // vAMM has opposite position at raw price
      const vammTrade = {
        ...trade,
        entryPrice: trade.rawPrice,
        type: trade.type === 'pay' ? 'receive' : 'pay'
      };
      
      const vammPL = calculateTotalPL(vammTrade, currentPrice);
      
      breakdown.push({
        id: `${market}-${index}`,
        market,
        userDirection: trade.type === 'pay' ? 'Pay Fixed' : 'Receive Fixed',
        vammDirection: trade.type === 'pay' ? 'Receive Fixed' : 'Pay Fixed',
        entryPrice: trade.entryPrice.toFixed(3),
        vammEntryPrice: trade.rawPrice.toFixed(3),
        currentPrice: currentPrice.toFixed(3),
        dv01: trade.baseDV01,
        vammPL: vammPL,
        status: 'OPEN',
        entryDay: trade.entryDay || 0,
        daysHeld: globalDay - (trade.entryDay || 0)
      });
    });
  });
  
  // Add closed/liquidated positions from trade history
  tradeHistory.forEach((trade, index) => {
    // Calculate what the vAMM P&L was for this closed trade
    // This would be stored when the trade was closed, but for now we can estimate
    breakdown.push({
      id: `history-${index}`,
      market: trade.market,
      userDirection: trade.direction,
      vammDirection: trade.direction === 'Pay Fixed' ? 'Receive Fixed' : 'Pay Fixed',
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
  const protocolOI = calculateProtocolOI();
  const netOI = protocolOI[market] || 0;
  const lastPrice = lastPriceByMarket[market] ?? marketSettings[market].apy;
  const { apy: baseAPY, k } = marketSettings[market];
  const { vammPL, protocolPL } = calculateProtocolMetrics();

  const requestTrade = (type) => {
    

    // Check if wallet is connected
    if (!wallet) {
      showToast('Please connect your Phantom wallet first!', 'error');
      return;
    }

    // Check simulated USDC balance
    const simulatedUSDC = usdcBalance + 10000000;
    if (simulatedUSDC < margin) {
      showToast(`Insufficient USDC balance. Required: $${margin.toLocaleString()}, Available: $${simulatedUSDC.toLocaleString()}`, 'error');
      return;
    }

    // Check protocol risk limits
    const currentNetOI = netOI;
    const newTradeOI = type === 'pay' ? currentDv01 : -currentDv01;
    const postTradeNetOI = currentNetOI + newTradeOI;
    
    if (type === 'pay' && postTradeNetOI > 50000) {
      showToast(`Cannot open new Pay Fixed positions. Protocol net OI is ${currentNetOI.toLocaleString()} (limit: 50k). Current protocol risk: Pay Fixed exposure too high.`, 'error');
      return;
    }
    
    if (type === 'receive' && postTradeNetOI < -50000) {
      showToast(`Cannot open new Receive Fixed positions. Protocol net OI is ${Math.abs(currentNetOI).toLocaleString()} Receive Fixed (limit: 50k). Current protocol risk: Receive Fixed exposure too high.`, 'error');
      return;
    }

    const preOI = netOI;
    const postOI = type === 'pay' ? netOI + currentDv01 : netOI - currentDv01;
    
    // Calculate pricing based on risk change
    const preRisk = Math.abs(preOI);
    const postRisk = Math.abs(postOI);
    
    let rawPrice;
    let feeBps;
    let finalPrice;
    
    // Calculate dynamic k based on current global day
    const daysToMaturity = Math.max(0, 365 - globalDay);
    const dynamicK = calculateDynamicK(k, daysToMaturity);

    // Apply correlation adjustment for Lido/Aave ETH Lending
    const correlationMultiplier = getCorrelationMultiplier(market, type, currentDv01);
    const adjustedDynamicK = dynamicK * correlationMultiplier;
    
    if (postRisk > preRisk) {
      // Risk increasing: use post OI directly + 5bp fee
      const priceImpact = parseFloat((adjustedDynamicK * postOI).toFixed(5));
      console.log('CLEANED priceImpact:', priceImpact);
      rawPrice = parseFloat((baseAPY + priceImpact).toFixed(4));
      feeBps = 5;
      const directionFactor = type === 'pay' ? 1 : -1;
      const feeInPercentage = feeBps / 100;
      const fee = feeInPercentage * directionFactor;
      finalPrice = parseFloat((rawPrice + fee).toFixed(3));
    } else if (postRisk < preRisk) {
      // Risk reducing: use midpoint
      const midpointOI = (preOI + postOI) / 2;
      const priceImpact = parseFloat((adjustedDynamicK * midpointOI).toFixed(5));
      rawPrice = parseFloat((baseAPY + priceImpact).toFixed(4));
      feeBps = 2;
      const directionFactor = type === 'pay' ? 1 : -1;
      const feeInPercentage = feeBps / 100;
      const fee = feeInPercentage * directionFactor;
      finalPrice = parseFloat((rawPrice + fee).toFixed(3));
    } else {
      // Risk staying same: use midpoint with 5bp fees
      const midpointOI = (preOI + postOI) / 2;
      const priceImpact = parseFloat((adjustedDynamicK * midpointOI).toFixed(5));
      rawPrice = parseFloat((baseAPY + priceImpact).toFixed(4));
      feeBps = 5;
      const directionFactor = type === 'pay' ? 1 : -1;
      const feeInPercentage = feeBps / 100;
      const fee = feeInPercentage * directionFactor;
      finalPrice = parseFloat((rawPrice + fee).toFixed(3));
    }

    // Round final price for display with directional rounding
    const roundedFinalPrice = roundPriceForDisplay(finalPrice, type);

    // Add the console log here:
  console.log('PRICING DEBUG:', {
    amount: currentDv01,
    baseAPY: baseAPY,
    dynamicK: dynamicK,
    postOI: postOI,
    rawPrice: rawPrice,
    feeBps: feeBps,
    finalPrice: finalPrice
  });

    setPendingTrade({
      type,
      finalPrice: finalPrice.toFixed(3), // Show 3 decimal places
      feeRate: feeBps / 100,
      rawPrice: rawPrice.toFixed(3), // Keep raw price precise for calculations
      directionFactor: type === 'pay' ? 1 : -1,
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
    const { type, finalPrice, rawPrice, preOI, postOI } = pendingTrade;

    const minMargin = currentDv01 * 50;
    if (margin < minMargin) {
      showToast('Margin too low!', 'error');
      setPendingTrade(null);
      return;
    }

    try {
      const provider = getProvider();
      if (provider && wallet) {
        console.log('Simulating transaction for wallet:', wallet.toString());
        
        const confirmBtn = document.querySelector('.confirm-btn');
        if (confirmBtn) {
          confirmBtn.textContent = 'Processing...';
          confirmBtn.disabled = true;
        }

        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      const marginBuffer = (margin / currentDv01) / 100;
      const liq = type === 'pay' 
        ? parseFloat(finalPrice) - marginBuffer
        : parseFloat(finalPrice) + marginBuffer;

      const trade = {
        market,
        type,
        baseDV01: baseDv01, //for reference
        entryDV01: baseDv01, // base DV01 at entry 
        currentDV01: baseDv01, // Use global day for real positions
        margin,
        entry: finalPrice,
        entryPrice: parseFloat(finalPrice),
        currentPrice: parseFloat(rawPrice),
        liq: liq.toFixed(3),
        liquidationPrice: liq.toFixed(3),
        timestamp: new Date().toLocaleTimeString(),
        pl: "0.00",
        pnl: 0,
        todaysPL: 0, // Initialize today's P&L
        collateral: margin,
        entryDay: globalDay, // Use global day for real positions
        currentDay: globalDay,
        feeAmountBps: pendingTrade.feeRate * 100,
        rawPrice: parseFloat(pendingTrade.rawPrice),
        txSignature: wallet ? `${Math.random().toString(36).substr(2, 9)}...` : null
      };
      //console to check entry of user
      console.log('STORED ENTRY PRICE:', trade.entryPrice);
      console.log('MODAL DISPLAYED PRICE:', pendingTrade.finalPrice);
      // Add trade fee to total - use the actual calculated fee basis points
      const feeAmountBps = pendingTrade.feeRate * 100; // Convert back to basis points 
      const actualDv01 = baseDv01; // Use global day
      const feeAmount = actualDv01 * feeAmountBps;
      setTotalFeesCollected(prev => prev + feeAmount);

      setTradesByMarket(prev => ({
        ...prev,
        [market]: [...(prev[market] || []), trade]
      }));

      setLastPriceByMarket(prev => ({
        ...prev,
        [market]: parseFloat(rawPrice)
      }));

      setUsdcBalance(prev => prev - margin);

      setPendingTrade(null);
      
      showToast(`Trade executed successfully! ${wallet ? `Tx: ${trade.txSignature}` : ''}`, 'success');
    } catch (error) {
      console.error('Transaction failed:', error);
      showToast('Transaction failed. Please try again.', 'error');
      setPendingTrade(null);
    }
  };

  const formatAddress = (address) => {
    if (!address) return '';
    const str = address.toString();
    return `${str.slice(0, 4)}...${str.slice(-4)}`;
   };
   //riskk
   const handleMarketChange = (newMarket) => {
    setMarket(newMarket);
   };

   const handleRiskSettlement = () => {
      const finalPrices = {};
      Object.keys(marketSettings).forEach(mkt => {
      finalPrices[mkt] = tempSettlementPrices[mkt] ? 
      parseFloat(tempSettlementPrices[mkt]) : 
      (lastPriceByMarket[mkt] || marketSettings[mkt].apy);
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
              <span className={`nav-item ${activeTab === "Learn" ? "active" : ""}`} onClick={() => setActiveTab("Learn")}>Learn</span>
              <span className={`nav-item ${activeTab === "Docs" ? "active" : ""}`} onClick={() => setActiveTab("Docs")}>Docs</span>
              <span className={`nav-item ${activeTab === "Leaderboard" ? "active" : ""}`} onClick={() => setActiveTab("Leaderboard")}>Leaderboard</span>
              <span className={`nav-item ${activeTab === "Stats" ? "active" : ""}`} onClick={() => setActiveTab("Stats")}>Stats</span>
              <span className={`nav-item ${activeTab === "Settings" ? "active" : ""}`} onClick={() => setActiveTab("Settings")}>Settings</span>
              <span className={`nav-item ${activeTab === "Risk" ? "active" : ""}`} onClick={() => setActiveTab("Risk")}>Risk</span>
            </nav>
          </div>
        
        {wallet ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{ textAlign: 'right', fontSize: '0.875rem' }}>
              <div style={{ color: '#9ca3af' }}>USDC Balance</div>
              <div style={{ color: '#10b981', fontWeight: '600' }}>
                ${(usdcBalance + 10000000).toLocaleString()}
              </div>
            </div>
            <button className="wallet-btn" onClick={disconnectWallet}>
              {formatAddress(wallet)}
            </button>
          </div>
        ) : (
          <button 
            className="wallet-btn" 
            onClick={connectWallet} 
            disabled={connecting}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            {connecting && <LoadingSpinner size="sm" />}
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
              <div style={{ 
                fontSize: '0.875rem', 
                color: '#9ca3af', 
                marginTop: '0.25rem',
                fontWeight: '500'
              }}>
                Crypto Rate Swaps (CRS)<span style={{ marginLeft: '1rem' }}></span>1 Jan-31 Dec'25
              </div>
              <div className="price-info">
                <div className="price-row">
                  <span>Live Price:</span>
                  <span style={{ color: '#ffffff', fontWeight: '700', fontSize: '1rem', position: 'relative' }}>
                    <span style={{ marginRight: '8px' }}>•</span>{lastPrice.toFixed(3)}%
                  </span>
                </div>
                <div className="price-row">
                  <span>2025 realized APY:</span>
                  <span style={{ color: '#9ca3af', fontWeight: '700', fontSize: '1rem' }}>
                    {market === "JitoSol" ? "4.03% / 8.25%" :
                     market === "Lido stETH" ? "1.44% / 2.92%" :
                     market === "Aave ETH Lending" ? "0.95% / 1.9%" :
                     market === "Aave ETH Borrowing" ? "1.29% / 2.63%" : 
                     market === "Rocketpool rETH" ? "1.32% / 2.67%" : "N/A"}
                  </span>
                </div>
                <div className="price-row">
                  <span>2025 implied unrealized APY:</span>
                  <span style={{ color: '#9ca3af', fontWeight: '700', fontSize: '1rem' }}>
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
                  <span>{marketSettings[market].apy.toFixed(3)}%</span>
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
                        {(lastPriceByMarket[market] || marketSettings[market].apy).toFixed(3)}%
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
                            Live: {(lastPriceByMarket[m] || marketSettings[m].apy).toFixed(3)}%
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
                    <span style={{ color: '#10b981', fontWeight: '700' }}>
                      ${(customNotional / 10000).toLocaleString()}
                    </span>
                    <span style={{ color: '#9ca3af' }}>DV01</span>
                  </div>
                </div>
                <div style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.5rem' }}>
                  ${(customNotional / 10000).toLocaleString()} DV01 = ${(customNotional / 10000).toLocaleString()} gain/loss per 1bp move
                </div>
              </div>
            </div>

            <div className="inputs">
              <div style={{
                padding: '0.8rem',
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
                    color: '#3b82f6', 
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
                disabled={!wallet || margin < baseDv01 * 50 || isSettlementMode}
                className={`enter-btn ${!wallet || margin < baseDv01 * 50 || isSettlementMode ? 'disabled' : ''}`}
              >
                {!wallet ? 'Connect Wallet' : margin < baseDv01 * 50 ? 'Margin too low' : isSettlementMode ? 'Settlement Mode - No New Trades' : 'Swap'}
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
              <button
                onClick={() => {
                  setShow3DView(!show3DView);
                  setShowLegend(false);
                  setSelectedPosition(null);
                }}
                style={{
                  background: show3DView ? '#6b7280' : 'linear-gradient(45deg, #8b5cf6, #7c3aed)',
                  color: 'white',
                  border: 'none',
                  padding: '0.5rem 1rem',
                  borderRadius: '0.375rem',
                  fontSize: '0.875rem',
                  cursor: 'pointer',
                  fontWeight: '600',
                  float: 'right'
                }}
              >
                {show3DView ? 'Show Chart' : 'Show Galaxy'}
              </button>
            </div>
            <div className="chart-container" style={{ display: 'flex', gap: '1rem' }}>
              <div style={{ width: show3DView ? '50%' : '100%', transition: 'width 0.3s ease' }}>
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
              {show3DView && (
                <div style={{ width: '50%' }}>
                  <FloatingPositionSpheres key={`galaxy-${show3DView}-${Object.keys(tradesByMarket).length}`} />
                </div>
              )}
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
                  <div className="stat-label">Protocol Risk</div>
                  <div className="stat-value" style={{ color: netOI >= 0 ? '#06b6d4' : '#f59e0b' }}>
                    {netOI >= 0 ? 'Received' : 'Paid'} $<AnimatedCounter value={Math.abs(netOI)} />
                  </div>
                  <div style={{ color: '#9ca3af', fontSize: '0.6rem' }}>
                    Current DV01 based OI
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
              <table>
                <thead>
                  <tr>
                    <th>Market</th>
                    <th>Direction</th>
                    <th>{isSettlementMode ? 'Settlement P&L' : 'Total P&L'}</th>
                    <th>Today's P&L</th>
                    <th>Entry Price</th>
                    <th>Current Price</th>
                    <th>Liquidation Price</th>
                    <th>Margin Posted</th>
                    <th>DV01</th>
                    <th>Entry Day</th>
                    <th>Days Held</th>
                    <th>Tx Hash</th>
                    <th>Liquidation Risk</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {marketTrades.map((trade, i) => {
                    const bpsFromLiquidation = calculateLiquidationRisk(trade);
                    const isRisky = bpsFromLiquidation <= 5 && bpsFromLiquidation > 0;
                    
                    return (
                      <tr key={i}>
                        <td>{trade.market}</td>
                        <td className={trade.type === 'pay' ? 'pay-fixed' : 'receive-fixed'}>
                          {trade.type === 'pay' ? 'Pay Fixed' : 'Receive Fixed'}
                        </td>
                        <td className={trade.pnl >= 0 ? 'profit' : 'loss'}>
                          {trade.pnl >= 0 ? '+' : ''}${Math.abs(parseFloat(trade.pl)).toLocaleString()}{trade.pnl < 0 ? '' : ''}
                        </td>
                        <td className={trade.todaysPL >= 0 ? 'profit' : 'loss'}>
                          {isSettlementMode ? '$0' : (trade.todaysPL >= 0 ? '+' : '') + '$' + Math.abs(trade.todaysPL).toLocaleString() + (trade.todaysPL < 0 ? '' : '')}
                        </td>
                        <td>{trade.entryPrice.toFixed(3)}%</td>
                        <td>{trade.currentPrice.toFixed(3)}%</td>
                        <td>{parseFloat(trade.liquidationPrice).toFixed(3)}%</td>
                        <td>${trade.collateral?.toLocaleString() || 'N/A'}</td>
                        <td>${(trade.baseDV01)?.toLocaleString() || 'N/A'}</td>
                        <td>{trade.entryDay || 0}</td>
                        <td>{globalDay - (trade.entryDay || 0)}</td>
                        <td style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                          {trade.txSignature || 'Simulated'}
                        </td>
                        <td>
                          <span style={{ 
                            color: isRisky ? '#ef4444' : '#22c55e', 
                            fontWeight: 'bold',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            padding: '0.25rem 0.75rem',
                            borderRadius: '1rem',
                            backgroundColor: isRisky ? 'rgba(239, 68, 68, 0.1)' : 'rgba(34, 197, 94, 0.1)',
                            border: `1px solid ${isRisky ? 'rgba(239, 68, 68, 0.3)' : 'rgba(34, 197, 94, 0.3)'}`,
                            fontSize: '0.875rem'
                          }}>
                            <span style={{ fontSize: '0.75rem' }}>
                              {isRisky ? '⚠️' : '✅'}
                            </span>
                            {isRisky ? 'RISKY' : 'Safe'}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '0.5rem', flexDirection: 'column' }}>
                            <button 
                              onClick={() => requestAddMargin(i)}
                              style={{
                                background: 'linear-gradient(45deg, #3b82f6, #2563eb)',
                                color: 'white',
                                border: 'none',
                                padding: '0.5rem 1rem',
                                borderRadius: '0.5rem',
                                fontSize: '0.75rem',
                                cursor: 'pointer',
                                fontWeight: '600',
                                transition: 'all 0.3s ease',
                                textTransform: 'uppercase',
                                letterSpacing: '0.025em'
                              }}
                              onMouseEnter={(e) => {
                                e.target.style.background = 'linear-gradient(45deg, #2563eb, #1d4ed8)';
                                e.target.style.transform = 'translateY(-1px)';
                              }}
                              onMouseLeave={(e) => {
                                e.target.style.background = 'linear-gradient(45deg, #3b82f6, #2563eb)';
                                e.target.style.transform = 'translateY(0)';
                              }}
                            >
                              Add Margin
                            </button>
                            <button 
                              onClick={() => requestUnwind(i)}
                              className="unwind-btn"
                              style={{
                                background: 'linear-gradient(45deg, #ef4444, #dc2626)',
                                color: 'white',
                                border: 'none',
                                padding: '0.5rem 1rem',
                                borderRadius: '0.5rem',
                                fontSize: '0.75rem',
                                cursor: 'pointer',
                                fontWeight: '600',
                                transition: 'all 0.3s ease',
                                textTransform: 'uppercase',
                                letterSpacing: '0.025em'
                              }}
                              onMouseEnter={(e) => {
                                e.target.style.background = 'linear-gradient(45deg, #dc2626, #b91c1c)';
                                e.target.style.transform = 'translateY(-1px)';
                              }}
                              onMouseLeave={(e) => {
                                e.target.style.background = 'linear-gradient(45deg, #ef4444, #dc2626)';
                                e.target.style.transform = 'translateY(0)';
                              }}
                            >
                              Close Position
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
                  opacity: 0.4,
                  animation: 'float 3s ease-in-out infinite'
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
                    fontWeight: '600',
                    transition: 'all 0.3s ease',
                    textTransform: 'uppercase',
                    letterSpacing: '0.025em',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem'
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.transform = 'translateY(-2px)';
                    e.target.style.boxShadow = '0 8px 25px rgba(16, 185, 129, 0.4)';
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.transform = 'translateY(0)';
                    e.target.style.boxShadow = 'none';
                  }}
                >
                  <span>🚀</span>
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
                Advance one day forward and set closing prices for all markets. This will update all live positions with new DV01s and recalculate daily P&L.
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
            const daysToMaturity = Math.max(0, 365 - globalDay);
            const timeRatio = daysToMaturity / 365;
            const roundedTimeRatio = roundTimeRatioUp(timeRatio);
            const currentDynamicK = marketSettings[mkt].k * roundedTimeRatio;
            
            return (
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
                    <label>Base K:</label>
                    <input
                      type="number"
                      step="0.000001"
                      value={marketSettings[mkt].k}
                      onChange={(e) => updateMarketSetting(mkt, "k", e.target.value)}
                    />
                  </div>
                  <div>
                    <label>
                      Current Dynamic K:
                      <span style={{ fontSize: '0.75rem', color: '#9ca3af', marginLeft: '0.5rem' }}>
                        (Base K × {roundedTimeRatio})
                      </span>
                    </label>
                    <input
                      type="number"
                      step="0.000001"
                      value={currentDynamicK.toFixed(5)}
                      onChange={(e) => {
                        // Calculate what the base K should be to achieve this dynamic K
                        const targetDynamicK = parseFloat(e.target.value);
                        const newBaseK = roundedTimeRatio > 0 ? targetDynamicK / roundedTimeRatio : targetDynamicK;
                        updateMarketSetting(mkt, "k", newBaseK);
                      }}
                      style={{ backgroundColor: '#2d3748', color: '#e2e8f0' }}
                    />
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.5rem' }}>
                    <div>Days to Maturity: <AnimatedCounter value={daysToMaturity} /></div>
                    <div>Time Ratio (t/T): {timeRatio.toFixed(3)} → {roundedTimeRatio.toFixed(1)}</div>
                    <div>Dynamic K = Base K × {roundedTimeRatio.toFixed(1)} = {currentDynamicK.toFixed(8)}</div>
                  </div>
                </div>
              </div>
            );
          })}

          <div className="closing-prices-section" style={{ marginTop: '2rem', padding: '1rem', border: '1px solid #374151', borderRadius: '0.5rem' }}>
            <h3>Historical Closing Prices</h3>
            {Object.keys(dailyClosingPrices).length > 0 ? (
              Object.keys(dailyClosingPrices).map(mkt => (
                <div key={mkt} style={{ marginBottom: '1rem' }}>
                  <h4>{mkt}</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: '0.5rem' }}>
                    {Object.keys(dailyClosingPrices[mkt]).map(day => (
                      <div key={day} style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                        Day {day}: {dailyClosingPrices[mkt][day].toFixed(3)}%
                      </div>
                    ))}
                  </div>
                </div>
              ))
            ) : (
              <div style={{ color: '#9ca3af', fontSize: '0.875rem' }}>
                No historical closing prices yet. Advance days to build history.
              </div>
            )}
          </div>
        </div>
      )}

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

            {/* Key Terms */}
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
              e.currentTarget.style.borderColor = '#3b82f6';
              e.currentTarget.style.boxShadow = '0 8px 32px rgba(59, 130, 246, 0.15)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--border-secondary)';
              e.currentTarget.style.boxShadow = 'none';
            }}>
              <h3 style={{ 
                color: '#3b82f6', 
                marginBottom: '2rem',
                fontSize: '1.5rem',
                fontWeight: '700',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem'
              }}>
                <span style={{ fontSize: '2rem' }}>📚</span>
                Key Terms
              </h3>
              
              <div style={{ display: 'grid', gap: '1.5rem' }}>
                <div style={{
                  padding: '1.5rem',
                  background: 'rgba(245, 158, 11, 0.1)',
                  borderRadius: '0.75rem',
                  border: '1px solid rgba(245, 158, 11, 0.2)'
                }}>
                  <h4 style={{ color: '#f59e0b', marginBottom: '0.75rem', fontSize: '1.25rem', fontWeight: '600' }}>Pay Fixed</h4>
                  <p style={{ color: 'var(--text-secondary)', lineHeight: '1.6', margin: 0 }}>
                    You lock in a fixed rate and profit if rates go <strong style={{ color: '#22c55e' }}>higher</strong>. You're betting that 
                    yields will increase above your fixed rate.
                  </p>
                </div>

                <div style={{
                  padding: '1.5rem',
                  background: 'rgba(245, 158, 11, 0.1)',
                  borderRadius: '0.75rem',
                  border: '1px solid rgba(245, 158, 11, 0.2)'
                }}>
                  <h4 style={{ color: '#f59e0b', marginBottom: '0.75rem', fontSize: '1.25rem', fontWeight: '600' }}>Receive Fixed</h4>
                  <p style={{ color: 'var(--text-secondary)', lineHeight: '1.6', margin: 0 }}>
                    You receive a fixed rate and profit if rates go <strong style={{ color: '#22c55e' }}>lower</strong>. You're betting that 
                    yields will decrease below your fixed rate.
                  </p>
                </div>

                <div style={{
                  padding: '1.5rem',
                  background: 'rgba(245, 158, 11, 0.1)',
                  borderRadius: '0.75rem',
                  border: '1px solid rgba(245, 158, 11, 0.2)'
                }}>
                  <h4 style={{ color: '#f59e0b', marginBottom: '0.75rem', fontSize: '1.25rem', fontWeight: '600' }}>DV01 (Dollar Value of 1 Basis Point)</h4>
                  <p style={{ color: 'var(--text-secondary)', lineHeight: '1.6', marginBottom: '1.5rem' }}>
                    Your position size. <strong>$10K DV01</strong> means you gain/lose $10,000 for every 
                    1 basis point (0.01%) the rate moves in your favor/against you.
                  </p>
                  <div style={{ 
                    padding: '1.5rem', 
                    background: 'rgba(26, 31, 46, 0.8)', 
                    borderRadius: '0.75rem',
                    border: '1px solid var(--border-secondary)',
                    fontFamily: 'monospace',
                    fontSize: '0.9rem'
                  }}>
                    <div style={{ color: '#10b981', fontWeight: 'bold', marginBottom: '1rem', fontSize: '1rem' }}>
                      DV01 Calculation:
                    </div>
                    <div style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                      DV01 = Notional × 1bp × Time to Maturity
                    </div>
                    <div style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                      DV01 = $10M × 0.0001 × 1 = $1,000/bp
                    </div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                      (Assuming $10M notional; Time to Maturity = 1 since we use full-year pricing regardless of entry day)
                    </div>
                  </div>
                </div>

                <div style={{
                  padding: '1.5rem',
                  background: 'rgba(245, 158, 11, 0.1)',
                  borderRadius: '0.75rem',
                  border: '1px solid rgba(245, 158, 11, 0.2)'
                }}>
                  <h4 style={{ color: '#f59e0b', marginBottom: '0.75rem', fontSize: '1.25rem', fontWeight: '600' }}>Liquidation Price</h4>
                  <p style={{ color: 'var(--text-secondary)', lineHeight: '1.6', margin: 0 }}>
                    The rate level where your losses equal your posted margin. Your position gets 
                    automatically closed to prevent further losses.
                  </p>
                </div>
              </div>
            </div>

            {/* Trading Examples */}
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
              e.currentTarget.style.borderColor = '#ef4444';
              e.currentTarget.style.boxShadow = '0 8px 32px rgba(239, 68, 68, 0.15)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--border-secondary)';
              e.currentTarget.style.boxShadow = 'none';
            }}>
              <h3 style={{ 
                color: '#ef4444', 
                marginBottom: '2rem',
                fontSize: '1.5rem',
                fontWeight: '700',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem'
              }}>
                <span style={{ fontSize: '2rem' }}>💡</span>
                Trading Examples
              </h3>
              
              <div style={{ display: 'grid', gap: '1.5rem' }}>
                <div style={{ 
                  padding: '1.5rem', 
                  background: 'rgba(34, 197, 94, 0.1)', 
                  borderRadius: '0.75rem',
                  border: '1px solid rgba(34, 197, 94, 0.2)'
                }}>
                  <h4 style={{ color: '#22c55e', marginBottom: '1rem', fontSize: '1.25rem', fontWeight: '600' }}>Example 1: Pay Fixed</h4>
                  <div style={{ color: 'var(--text-secondary)', lineHeight: '1.7', fontSize: '1.05rem' }}>
                    • You pay fixed 7.9% on $10K DV01 JitoSOL<br/>
                    • JitoSOL yields rise to 8.4% (+50bp)<br/>
                    • Your profit: 50bp × $10K/bp = <strong style={{ color: '#22c55e', fontSize: '1.1rem' }}>+$500,000</strong>
                  </div>
                </div>

                <div style={{ 
                  padding: '1.5rem', 
                  background: 'rgba(34, 197, 94, 0.1)', 
                  borderRadius: '0.75rem',
                  border: '1px solid rgba(34, 197, 94, 0.2)'
                }}>
                  <h4 style={{ color: '#22c55e', marginBottom: '1rem', fontSize: '1.25rem', fontWeight: '600' }}>Example 2: Receive Fixed</h4>
                  <div style={{ color: 'var(--text-secondary)', lineHeight: '1.7', fontSize: '1.05rem' }}>
                    • You receive fixed 7.9% on $10K DV01 JitoSOL<br/>
                    • JitoSOL yields fall to 7.4% (-50bp)<br/>
                    • Your profit: 50bp × $10K/bp = <strong style={{ color: '#22c55e', fontSize: '1.1rem' }}>+$500,000</strong>
                  </div>
                </div>
              </div>
            </div>

            {/* Pricing Model */}
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
              e.currentTarget.style.borderColor = '#8b5cf6';
              e.currentTarget.style.boxShadow = '0 8px 32px rgba(139, 92, 246, 0.15)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--border-secondary)';
              e.currentTarget.style.boxShadow = 'none';
            }}>
              <h3 style={{ 
                color: '#8b5cf6', 
                marginBottom: '1.5rem',
                fontSize: '1.5rem',
                fontWeight: '700',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem'
              }}>
                <span style={{ fontSize: '2rem' }}>⚙️</span>
                Our Pricing Model
              </h3>
              <div style={{ marginBottom: '1.5rem' }}>
                <p style={{ color: 'var(--text-secondary)', lineHeight: '1.7', marginBottom: '1.5rem', fontSize: '1.05rem' }}>
                  <strong style={{ color: '#8b5cf6' }}>Full Year Pricing:</strong> All contracts are priced for the full 365-day period, 
                  regardless of when you enter. Whether you trade on Day 0 or Day 90, you're getting 
                  exposure to the full year's yield curve.
                </p>
                <p style={{ color: 'var(--text-secondary)', lineHeight: '1.7', marginBottom: '1rem', fontSize: '1.05rem' }}>
                  <strong style={{ color: '#8b5cf6' }}>Dynamic Pricing:</strong> Prices adjust based on:
                </p>
              </div>
              <ul style={{ 
                color: 'var(--text-secondary)', 
                lineHeight: '1.7', 
                paddingLeft: '1.5rem',
                fontSize: '1.05rem',
                listStyle: 'none'
              }}>
                <li style={{ marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ color: '#8b5cf6' }}>•</span>
                  Current protocol risk exposure
                </li>
                <li style={{ marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ color: '#8b5cf6' }}>•</span>
                  Time remaining to maturity
                </li>
                <li style={{ marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ color: '#8b5cf6' }}>•</span>
                  Correlation between markets
                </li>
                <li style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ color: '#8b5cf6' }}>•</span>
                  Trade size (larger trades pay more)
                </li>
              </ul>
            </div>

            {/* Risk Management */}
            <div className="glass-card" style={{ 
              padding: '2rem', 
              border: '1px solid var(--border-secondary)', 
              borderRadius: '1rem',
              background: 'var(--gradient-card)',
              backdropFilter: 'blur(16px)',
              transition: 'all 0.3s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#f59e0b';
              e.currentTarget.style.boxShadow = '0 8px 32px rgba(245, 158, 11, 0.15)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--border-secondary)';
              e.currentTarget.style.boxShadow = 'none';
            }}>
              <h3 style={{ 
                color: '#f59e0b', 
                marginBottom: '1.5rem',
                fontSize: '1.5rem',
                fontWeight: '700',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem'
              }}>
                <span style={{ fontSize: '2rem' }}>⚠️</span>
                Risk Management
              </h3>
              <ul style={{ 
                color: 'var(--text-secondary)', 
                lineHeight: '1.7', 
                paddingLeft: '1.5rem',
                fontSize: '1.05rem',
                listStyle: 'none'
              }}>
                <li style={{ marginBottom: '1rem', display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                  <span style={{ color: '#f59e0b', marginTop: '0.1rem' }}>•</span>
                  <div>
                    <strong style={{ color: '#f59e0b' }}>Liquidation Risk:</strong> Monitor your positions - rates can move quickly
                  </div>
                </li>
                <li style={{ marginBottom: '1rem', display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                  <span style={{ color: '#f59e0b', marginTop: '0.1rem' }}>•</span>
                  <div>
                    <strong style={{ color: '#f59e0b' }}>Margin Requirements:</strong> Minimum 200:1 leverage (0.5% margin)
                  </div>
                </li>
                <li style={{ marginBottom: '1rem', display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                  <span style={{ color: '#f59e0b', marginTop: '0.1rem' }}>•</span>
                  <div>
                    <strong style={{ color: '#f59e0b' }}>Add Margin:</strong> Improve your liquidation price by posting more collateral
                  </div>
                </li>
                <li style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                  <span style={{ color: '#f59e0b', marginTop: '0.1rem' }}>•</span>
                  <div>
                    <strong style={{ color: '#f59e0b' }}>Settlement:</strong> All positions settle on last day of the year based on realized yields
                  </div>
                </li>
              </ul>
            </div>

          </div>
        </div>
      )}

      {activeTab === "Leaderboard" && (
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
              🏆
            </div>
            <h2 style={{
              fontSize: '2.5rem',
              fontWeight: '800',
              marginBottom: '1rem',
              background: 'var(--gradient-premium)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text'
            }}>
              Trading Leaderboard
            </h2>
            <p style={{
              fontSize: '1.25rem',
              color: 'var(--text-muted)',
              lineHeight: 1.6,
              maxWidth: '600px',
              margin: '0 auto'
            }}>
              Compete with the best traders and earn exclusive rewards through our points system
            </p>
          </div>

          <div className="glass-card" style={{ 
            padding: '2.5rem', 
            border: '1px solid var(--border-secondary)', 
            borderRadius: '1.5rem',
            background: 'var(--gradient-card)',
            backdropFilter: 'blur(16px)',
            marginBottom: '2rem',
            transition: 'all 0.3s ease'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'var(--border-glow)';
            e.currentTarget.style.boxShadow = '0 12px 40px rgba(16, 185, 129, 0.15)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'var(--border-secondary)';
            e.currentTarget.style.boxShadow = 'none';
          }}>
            <h3 style={{ 
              marginBottom: '2rem', 
              color: 'var(--text-primary)',
              fontSize: '2rem',
              fontWeight: '700',
              textAlign: 'center',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '1rem'
            }}>
              <span style={{ fontSize: '2.5rem' }}>🎯</span>
              Slope Points System
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '2.5rem' }}>
        
              <div style={{
                padding: '2rem',
                background: 'rgba(16, 185, 129, 0.1)',
                borderRadius: '1rem',
                border: '1px solid rgba(16, 185, 129, 0.2)'
              }}>
                <h4 style={{ 
                  color: '#10b981', 
                  marginBottom: '1.5rem',
                  fontSize: '1.5rem',
                  fontWeight: '700',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem'
                }}>
                  <span style={{ fontSize: '1.75rem' }}>📈</span>
                  How to Earn Points
                </h4>
                <ul style={{ 
                  color: 'var(--text-secondary)', 
                  lineHeight: '1.8', 
                  paddingLeft: '0',
                  listStyle: 'none',
                  fontSize: '1.05rem'
                }}>
                  <li style={{ marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span style={{ color: '#10b981', fontSize: '1.2rem' }}>•</span>
                    <strong>10 points per $1K DV01</strong> traded
                  </li>
                  <li style={{ marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span style={{ color: '#10b981', fontSize: '1.2rem' }}>•</span>
                    <strong>2x multiplier</strong> for JitoSol trades
                  </li>
                  <li style={{ marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span style={{ color: '#10b981', fontSize: '1.2rem' }}>•</span>
                    <strong>2 points</strong> for adding margin to positions
                  </li>
                  <li style={{ marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span style={{ color: '#10b981', fontSize: '1.2rem' }}>•</span>
                    <strong>2x multiplier</strong> for risk-reducing trades
                  </li>
                  <li style={{ marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span style={{ color: '#10b981', fontSize: '1.2rem' }}>•</span>
                    <strong>20 points</strong> for trading multiple markets
                  </li>
                  <li style={{ marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span style={{ color: '#10b981', fontSize: '1.2rem' }}>•</span>
                    <strong>10 points</strong> for successful referrals
                  </li>
                  <li style={{ marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span style={{ color: '#10b981', fontSize: '1.2rem' }}>•</span>
                    <strong>50 points</strong> for holding to settlement
                  </li>
                  <li style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span style={{ color: '#10b981', fontSize: '1.2rem' }}>•</span>
                    <strong>2x multiplier</strong> for consecutive trading days
                  </li>
                </ul>
              </div>
        
              <div>
                <div style={{
                  padding: '2rem',
                  background: 'rgba(59, 130, 246, 0.1)',
                  borderRadius: '1rem',
                  border: '1px solid rgba(59, 130, 246, 0.2)',
                  marginBottom: '1.5rem'
                }}>
                  <h4 style={{ 
                    color: '#3b82f6', 
                    marginBottom: '1.5rem',
                    fontSize: '1.5rem',
                    fontWeight: '700',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem'
                  }}>
                    <span style={{ fontSize: '1.75rem' }}>💰</span>
                    Fee Discounts
                  </h4>
                  <ul style={{ 
                    color: 'var(--text-secondary)', 
                    lineHeight: '1.8', 
                    paddingLeft: '0',
                    listStyle: 'none',
                    fontSize: '1.05rem'
                  }}>
                    <li style={{ marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <span style={{ color: '#cd7f32', fontSize: '1.2rem' }}>🥉</span>
                      <strong>Bronze (50+ points):</strong> 5% fee discount
                    </li>
                    <li style={{ marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <span style={{ color: '#c0c0c0', fontSize: '1.2rem' }}>🥈</span>
                      <strong>Silver (100+ points):</strong> 10% fee discount
                    </li>
                    <li style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <span style={{ color: '#ffd700', fontSize: '1.2rem' }}>🥇</span>
                      <strong>Gold (500+ points):</strong> 15% fee discount
                    </li>
                  </ul>
                </div>
          
                <div style={{
                  padding: '2rem',
                  background: 'rgba(245, 158, 11, 0.1)',
                  borderRadius: '1rem',
                  border: '1px solid rgba(245, 158, 11, 0.2)'
                }}>
                  <h4 style={{ 
                    color: '#f59e0b', 
                    marginBottom: '1.5rem',
                    fontSize: '1.5rem',
                    fontWeight: '700',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem'
                  }}>
                    <span style={{ fontSize: '1.75rem' }}>🎁</span>
                    Future Rewards
                  </h4>
                  <ul style={{ 
                  color: 'var(--text-secondary)', 
                  lineHeight: '1.8', 
                  paddingLeft: '0',
                  listStyle: 'none',
                  fontSize: '1.05rem'
                }}>
                  <li style={{ marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span style={{ color: '#f59e0b', fontSize: '1.2rem' }}>•</span>
                    Airdrop eligibility and allocation
                  </li>
                  <li style={{ marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span style={{ color: '#f59e0b', fontSize: '1.2rem' }}>•</span>
                    Exclusive features and early access
                  </li>
                  <li style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span style={{ color: '#f59e0b', fontSize: '1.2rem' }}>•</span>
                    Governance participation rights
                  </li>
                </ul>
              </div>
            </div>
      
          </div>

          <div style={{ 
            marginTop: '2.5rem', 
            padding: '2rem', 
            background: 'rgba(26, 31, 46, 0.8)', 
            borderRadius: '1rem',
            border: '1px solid var(--border-secondary)',
            textAlign: 'center'
          }}>
            <p style={{ 
              color: 'var(--text-muted)', 
              fontSize: '1.1rem', 
              margin: '0 0 1rem 0',
              fontWeight: '500'
            }}>
              <strong style={{ color: 'var(--text-accent)' }}>Current Season:</strong> Pre-Launch Phase - Get ready for points tracking!
            </p>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.75rem 1.5rem',
              background: 'var(--gradient-accent)',
              borderRadius: '2rem',
              color: 'white',
              fontWeight: '600',
              fontSize: '0.9rem',
              textTransform: 'uppercase',
              letterSpacing: '0.05em'
            }}>
              <span style={{ fontSize: '1.2rem' }}>🚀</span>
              Coming Soon
            </div>
          </div>
        </div>

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
                          placeholder={marketSettings[mkt].apy.toFixed(3)}
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
                          {(lastPriceByMarket[mkt] || marketSettings[mkt].apy).toFixed(3)}%
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
                        const currentPrice = lastPriceByMarket[market] || marketSettings[market].apy;
                        const stressPriceUp = currentPrice + (bps / 100); // +bps
                        const stressPriceDown = currentPrice - (bps / 100); // -bps
                        
                        const stressPLUp = calculateTotalPL(trade, stressPriceUp);
                        const stressPLDown = calculateTotalPL(trade, stressPriceDown);
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
                calculateTotalPL(trade, lastPriceByMarket[mkt] || marketSettings[mkt].apy);
              return sum + pl;
            }, 0);
            
            return (
              <div key={mkt} className="market-positions" style={{ 
                marginBottom: '2.5rem', 
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
                        <th style={{ padding: '1rem', textAlign: 'right', color: 'var(--text-secondary)', fontSize: '0.9rem', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Entry DV01</th>
                        <th style={{ padding: '1rem', textAlign: 'right', color: 'var(--text-secondary)', fontSize: '0.9rem', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Current Price</th>
                        <th style={{ padding: '1rem', textAlign: 'right', color: 'var(--text-secondary)', fontSize: '0.9rem', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Entry Day</th>
                        <th style={{ padding: '1rem', textAlign: 'right', color: 'var(--text-secondary)', fontSize: '0.9rem', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>P&L</th>
                      </tr>
                    </thead>
                    <tbody>
                      {marketTrades.map((trade, i) => {
                        const currentPrice = isSettlementMode ? 
                          settlementPrices[mkt] : 
                          (lastPriceByMarket[mkt] || marketSettings[mkt].apy);
                        const pl = isSettlementMode ? 
                          calculateSettlementPL(trade) : 
                          calculateTotalPL(trade, currentPrice);
                        
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
                              ${(trade.entryDV01 || trade.baseDV01).toLocaleString()}
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

      {pendingTrade && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Confirm Trade</h3>
            
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
                  <span className="fee">{(pendingTrade.feeRate * 100).toFixed(0)}bp</span>
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
                  Trading 2025 full-year APY (compounded)
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
                <span>⚡</span>
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
                <span>Unwind Price (with fees):</span>
                <span className="execution-price">{pendingUnwind.executionPrice}%</span>
              </div>
              <div className="detail-row">
                <span>Raw Unwind Price:</span>
                <span className="execution-price">{pendingUnwind.rawUnwindPrice}%</span>
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
                <span>🔒</span>
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
      {pendingSettlement && (
  <div className="modal-overlay">
    <div className="modal">
      <h3>Settlement - Input Settlement Prices</h3>
      <div style={{ marginBottom: '1rem', color: '#9ca3af', fontSize: '0.875rem' }}>
        Enter the settlement price for each market. Settlement P&L will be calculated as:
        <br /><strong>(Settlement Price - Entry Price) × Initial DV01</strong>
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
        <div style={{ marginTop: '1rem', padding: '0.75rem', backgroundColor: '#1f2937', borderRadius: '0.375rem', fontSize: '0.75rem', color: '#9ca3af' }}>
          <strong>Example:</strong> Pay Fixed 8.5% with 10k DV01, settlement 9.0%
          <br />Settlement P&L = (9.0% - 8.5%) × 10k = +500,000
        </div>
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
              <div style={{ marginTop: '1rem' }}>
                <h4>Set Closing Prices for Day {pendingDayAdvancement.fromDay}:</h4>
                {Object.keys(pendingDayAdvancement.closingPrices).map(mkt => (
                  <div key={mkt} className="detail-row">
                    <span>{mkt}:</span>
                    <input
                      type="number"
                      step="0.001"
                      value={pendingDayAdvancement.closingPrices[mkt]}
                      onChange={(e) => {
                        const updated = { ...pendingDayAdvancement };
                        updated.closingPrices[mkt] = parseFloat(e.target.value);
                        setPendingDayAdvancement(updated);
                      }}
                      style={{
                        padding: '0.25rem',
                        borderRadius: '0.25rem',
                        border: '1px solid #374151',
                        backgroundColor: '#1f2937',
                        color: 'white',
                        width: '80px'
                      }}
                    />
                    <span>%</span>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: '1rem', padding: '0.5rem', backgroundColor: '#1f2937', borderRadius: '0.25rem', fontSize: '0.75rem', color: '#9ca3af' }}>
                This will:
                <ul style={{ margin: '0.5rem 0', paddingLeft: '1rem' }}>
                  <li>Store Day {pendingDayAdvancement.fromDay} closing prices</li>
                  <li>Advance to Day {pendingDayAdvancement.toDay}</li>
                  <li>Update all live positions' DV01s to Day {pendingDayAdvancement.toDay} levels</li>
                  <li>Recalculate all P&Ls using daily P&L method</li>
                </ul>
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
                <span>🚀</span>
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
                <div style={{ position: 'relative' }}>
                 
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
                      ? (parseFloat(pendingMarginAdd.trade.liquidationPrice) - (additionalMargin / pendingMarginAdd.trade.currentDV01 / 100)).toFixed(3)
                      : (parseFloat(pendingMarginAdd.trade.liquidationPrice) + (additionalMargin / pendingMarginAdd.trade.currentDV01 / 100)).toFixed(3)
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
      `}</style>
    </div>
  );
}