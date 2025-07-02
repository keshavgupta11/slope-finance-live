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
    "JitoSol": { apy: 7.959, k: 0.00001, symbol: "JitoSOL" }, // Based on your 2025 projection
    "Lido stETH": { apy: 5.0, k: 0.00002, symbol: "stETH" },
    "Ethena sUSDe": { apy: 4.0, k: 0.00001, symbol: "sUSDe" },
  };

  const [marketSettings, setMarketSettings] = useState(initialMarketSettings);
  const [market, setMarket] = useState("JitoSol");
  const [baseDv01, setBaseDv01] = useState(10000);
  const [margin, setMargin] = useState(500000);
  const [currentDay, setCurrentDay] = useState(0); // UI slider only - doesn't affect real positions
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
    if (tradeType === 'pay') {
      // Round UP for payers
      return Math.ceil(price * 1000) / 1000;
    } else {
      // Round DOWN for receivers
      return Math.floor(price * 1000) / 1000;
    }
  };

  const currentDv01 = calculateCurrentDv01(baseDv01, currentDay); // For UI display only

  // Calculate total P&L for a position from entry to current day
  const calculateTotalPL = (trade, currentPrice) => {
    let totalPL = 0;
    const entryDay = trade.entryDay || 0;
    const directionFactor = trade.type === 'pay' ? 1 : -1;

    // Calculate P&L for each day from entry to current global day
    for (let day = entryDay; day <= globalDay; day++) {
      const dayDv01 = calculateCurrentDv01(trade.baseDV01, day);
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
    const currentDayDv01 = calculateCurrentDv01(trade.baseDV01, globalDay);

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
        const tradeDv01 = calculateCurrentDv01(trade.baseDV01, globalDay);
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
            updatedTrade.currentDV01 = calculateCurrentDv01(trade.baseDV01, globalDay);
            updatedTrade.currentPrice = lastPriceByMarket[mkt] || marketSettings[mkt].apy;

            // Use total P&L calculation
            const totalPL = calculateTotalPL(updatedTrade, updatedTrade.currentPrice);
            const todaysPL = calculateTodaysPL(updatedTrade, updatedTrade.currentPrice);
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
            entryPrice: trade.entryPrice.toFixed(2),
            exitPrice: liquidationPrice.toFixed(2),
            dv01: trade.currentDV01,
            finalPL: (-trade.collateral).toFixed(2),
            status: 'LIQUIDATED'
          }]);
          
          console.log(`Position liquidated: ${trade.type} ${trade.currentDV01} at ${liquidationPrice}%`);
          alert(`LIQUIDATION: Your ${trade.type} fixed position of ${trade.currentDV01.toLocaleString()} in ${mkt} was liquidated at ${liquidationPrice}%. You lost your entire margin of ${trade.collateral.toLocaleString()}.`);
        });
      }
      
      return updated;
    });
    
    // Update OI based on current DV01s
    setOiByMarket(calculateProtocolOI());
  }, [globalDay, lastPriceByMarket, marketSettings, dailyClosingPrices]);

  const generateChartData = () => {
    // Use actual historical data for JitoSOL based on your Excel analysis
    if (market === "JitoSol") {
      return [
        { date: "2023-Q1", apy: 7.04, year: 2023.0 },
        { date: "2023-Q2", apy: 7.26, year: 2023.25 },
        { date: "2023-Q3", apy: 7.48, year: 2023.5 },
        { date: "2023-Q4", apy: 7.63, year: 2023.75 },
        { date: "2024-Q1", apy: 7.85, year: 2024.0 },
        { date: "2024-Q2", apy: 8.28, year: 2024.25 },
        { date: "2024-Q3", apy: 8.26, year: 2024.5 },
        { date: "2024-Q4", apy: 8.24, year: 2024.75 },
        { date: "2025-Q1", apy: 8.10, year: 2025.0 },
        { date: "2025-Q2", apy: 7.959, year: 2025.25 } // Your 2025 projection
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
            currentDV01: calculateCurrentDv01(trade.baseDV01, toDay)
          }));
        }
      });
      return updated;
    });
    
    setPendingDayAdvancement(null);
    alert(`Advanced to Day ${toDay}. All live positions updated with new DV01s and daily P&L recalculated.`);
  };

  // Unwind function
  const requestUnwind = (tradeIndex) => {
    const trade = marketTrades[tradeIndex];
    if (!trade) return;

    const protocolOI = calculateProtocolOI();
    const currentOI = protocolOI[trade.market] || 0;
    
    // Calculate unwind execution price using current DV01
    const preOI = currentOI;
    const currentTradeDv01 = calculateCurrentDv01(trade.baseDV01, globalDay);
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
    
    if (postRisk > preRisk) {
      // Risk increasing: use post OI directly + 5bp fee
      unwindPrice = baseAPY + dynamicK * postOI;
      feeBps = 5;
      const feeInPrice = feeBps / 100;
      const directionFactor = trade.type === 'pay' ? -1 : 1; // Opposite for unwind
      executionPrice = unwindPrice + (feeInPrice * directionFactor);
    } else if (postRisk < preRisk) {
      // Risk reducing: use midpoint
      const midpointOI = (preOI + postOI) / 2;
      unwindPrice = baseAPY + dynamicK * midpointOI;
      feeBps = 2;
      const feeInPrice = feeBps / 100;
      const directionFactor = trade.type === 'pay' ? -1 : 1; // Opposite for unwind
      executionPrice = unwindPrice + (feeInPrice * directionFactor);
    } else {
      // Risk staying same (absolute value): use midpoint with 5bp fees
      const midpointOI = (preOI + postOI) / 2;
      unwindPrice = baseAPY + dynamicK * midpointOI;
      feeBps = 5;
      const feeInPrice = feeBps / 100;
      const directionFactor = trade.type === 'pay' ? -1 : 1; // Opposite for unwind
      executionPrice = unwindPrice + (feeInPrice * directionFactor);
    }
    
    // Round execution price for display with directional rounding
    // For unwind, the trade direction is opposite: pay traders are selling (receive), receive traders are buying (pay)
    const unwindTradeType = trade.type === 'pay' ? 'receive' : 'pay';
    const roundedExecutionPrice = roundPriceForDisplay(executionPrice, unwindTradeType);
    
    // Calculate fees using current DV01
    const feeAmount = currentTradeDv01 * feeBps; // DV01 * basis points
    
    // Calculate P&L using total P&L calculation
    const totalPL = calculateTotalPL(trade, roundedExecutionPrice);
    const netReturn = trade.collateral + totalPL;
    
    setPendingUnwind({
      tradeIndex,
      trade,
      executionPrice: roundedExecutionPrice.toFixed(3), // Show 3 decimal places
      rawUnwindPrice: unwindPrice.toFixed(4), // Store the raw unwind price separately
      entryPrice: trade.entryPrice.toFixed(3),
      pl: totalPL.toFixed(2),
      feeAmount: feeAmount.toFixed(2),
      netReturn: netReturn.toFixed(2),
      feeRate: feeBps.toString(),
      feeBps: feeBps
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
    const currentTradeDv01 = calculateCurrentDv01(trade.baseDV01, globalDay);
    const feeAmount = currentTradeDv01 * pendingUnwind.feeBps;
    setTotalFeesCollected(prev => prev + feeAmount);
    
    // Add to trade history
    setTradeHistory(prev => [...prev, {
      date: new Date().toLocaleDateString(),
      market: trade.market,
      direction: trade.type === 'pay' ? 'Pay Fixed' : 'Receive Fixed',
      entryPrice: trade.entryPrice.toFixed(2),
      exitPrice: parseFloat(executionPrice).toFixed(2),
      dv01: currentTradeDv01,
      finalPL: pl,
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
    alert(`Position unwound successfully! Received: $${netReturn}`);
  };

  const chartData = useMemo(() => generateChartData(), [market]);
  const marketTrades = tradesByMarket[market] || [];
  const protocolOI = calculateProtocolOI();
  const netOI = protocolOI[market] || 0;
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

    // Check simulated USDC balance
    const simulatedUSDC = usdcBalance + 5000000;
    if (simulatedUSDC < margin) {
      alert(`Insufficient USDC balance. Required: $${margin.toLocaleString()}, Available: $${simulatedUSDC.toLocaleString()}`);
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
    
    if (postRisk > preRisk) {
      // Risk increasing: use post OI directly + 5bp fee
      rawPrice = baseAPY + dynamicK * postOI;
      feeBps = 5;
      const directionFactor = type === 'pay' ? 1 : -1;
      const feeInPercentage = feeBps / 100;
      const fee = feeInPercentage * directionFactor;
      finalPrice = rawPrice + fee;
    } else if (postRisk < preRisk) {
      // Risk reducing: use midpoint
      const midpointOI = (preOI + postOI) / 2;
      rawPrice = baseAPY + dynamicK * midpointOI;
      feeBps = 2;
      const directionFactor = type === 'pay' ? 1 : -1;
      const feeInPercentage = feeBps / 100;
      const fee = feeInPercentage * directionFactor;
      finalPrice = rawPrice + fee;
    } else {
      // Risk staying same: use midpoint with 5bp fees
      const midpointOI = (preOI + postOI) / 2;
      rawPrice = baseAPY + dynamicK * midpointOI;
      feeBps = 5;
      const directionFactor = type === 'pay' ? 1 : -1;
      const feeInPercentage = feeBps / 100;
      const fee = feeInPercentage * directionFactor;
      finalPrice = rawPrice + fee;
    }

    // Round final price for display with directional rounding
    const roundedFinalPrice = roundPriceForDisplay(finalPrice, type);

    setPendingTrade({
      type,
      finalPrice: roundedFinalPrice.toFixed(3), // Show 3 decimal places
      feeRate: feeBps / 100,
      rawPrice: rawPrice.toFixed(4), // Keep raw price precise for calculations
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
      alert('Margin too low!');
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
        baseDV01: baseDv01,
        currentDV01: calculateCurrentDv01(baseDv01, globalDay), // Use global day for real positions
        margin,
        entry: finalPrice,
        entryPrice: parseFloat(finalPrice),
        currentPrice: parseFloat(rawPrice),
        liq: liq.toFixed(2),
        liquidationPrice: liq.toFixed(2),
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

      // Add trade fee to total - use the actual calculated fee basis points
      const feeAmountBps = pendingTrade.feeRate * 100; // Convert back to basis points 
      const actualDv01 = calculateCurrentDv01(baseDv01, globalDay); // Use global day
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
                  <span className="live-price">{lastPrice.toFixed(3)}%</span>
                </div>
                <div className="price-row">
                  <span>2025 realized APY:</span>
                  <span className="realized-apy">
                    {market === "JitoSol" ? "4.03% / 8.43%" : (marketSettings[market].apy * 0.98).toFixed(3) + "%"}
                  </span>
                </div>
                <div className="price-row">
                  <span>Global Day:</span>
                  <span className="global-day" style={{ color: '#10b981', fontWeight: 'bold' }}>{globalDay}</span>
                </div>
                <div className="indicator">
                  <span className="indicator-icon">⚡</span>
                  <span>{marketSettings[market].apy.toFixed(3)}%</span>
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
                <div>Notional / DV01: $10mm / $1k DV01, Day 0</div>
                <div>$1k DV01 means you gain/lose $1,000 per 1bp move</div>
              </div>
            </div>

            <div className="input-group">
              <label>
                <span>Days from Entry (UI Only): {currentDay}</span>
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
                  <span>Current DV01 (UI): ${currentDv01.toLocaleString()}</span>
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
                <div className="min-margin-value">${(currentDv01 * 50).toLocaleString()}</div>
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
                disabled={!wallet || margin < currentDv01 * 50}
                className={`enter-btn ${!wallet || margin < currentDv01 * 50 ? 'disabled' : ''}`}
              >
                {!wallet ? 'Connect Wallet' : margin < currentDv01 * 50 ? 'Margin too low' : 'Enter Position'}
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
                    tick={{ fill: '#9CA3AF', fontSize: 12, fontWeight: 500 }}
                    type="number"
                    scale="linear"
                    domain={[2023, 2025]}
                    ticks={[2023, 2024, 2025]}
                  />
                  <YAxis 
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#9CA3AF', fontSize: 12, fontWeight: 500 }}
                    domain={[6, 9]}
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
                  <div className="stat-value">$470,000</div>
                  <div className="stat-change positive">+15.7%</div>
                </div>
              </div>
            </div>

            <div className="market-stats" style={{ marginTop: '1rem', marginBottom: '1rem' }}>
              <h4>Protocol Metrics</h4>
              <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                <div className="stat-card">
                  <div className="stat-label">vAMM P&L</div>
                  <div className={`stat-value ${vammPL >= 0 ? '' : ''}`} style={{ color: vammPL >= 0 ? '#22c55e' : '#ef4444' }}>
                    {vammPL >= 0 ? '+' : ''}${Math.abs(vammPL).toLocaleString()}{vammPL < 0 ? '' : ''}
                  </div>
                  <div style={{ color: '#9ca3af', fontSize: '0.6rem' }}>
                    Daily P&L calculation
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">Protocol P&L (Fees)</div>
                  <div className="stat-value" style={{ color: '#10b981' }}>
                    +${protocolPL.toLocaleString()}
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
                    Current DV01 based OI
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
                  <th>Total P&L</th>
                  <th>Today's P&L</th>
                  <th>Entry Price</th>
                  <th>Current Price</th>
                  <th>Liquidation Price</th>
                  <th>Margin Posted</th>
                  <th>Base DV01</th>
                  <th>Current DV01</th>
                  <th>Entry Day</th>
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
                        {trade.pnl >= 0 ? '+' : ''}${Math.abs(parseFloat(trade.pl)).toLocaleString()}{trade.pnl < 0 ? '' : ''}
                      </td>
                      <td className={trade.todaysPL >= 0 ? 'profit' : 'loss'}>
                        {trade.todaysPL >= 0 ? '+' : ''}${Math.abs(trade.todaysPL).toLocaleString()}{trade.todaysPL < 0 ? '' : ''}
                      </td>
                      <td>{trade.entryPrice.toFixed(3)}%</td>
                      <td>{trade.currentPrice.toFixed(3)}%</td>
                      <td>{parseFloat(trade.liquidationPrice).toFixed(3)}%</td>
                      <td>${trade.collateral?.toLocaleString() || 'N/A'}</td>
                      <td>${trade.baseDV01?.toLocaleString() || 'N/A'}</td>
                      <td>${trade.currentDV01?.toLocaleString() || trade.baseDV01?.toLocaleString() || 'N/A'}</td>
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
                        <button 
                          onClick={() => requestUnwind(i)}
                          className="unwind-btn"
                          style={{
                            background: 'linear-gradient(45deg, #ef4444, #dc2626)',
                            color: 'white',
                            border: 'none',
                            padding: '0.75rem 1.25rem',
                            borderRadius: '0.75rem',
                            fontSize: '0.875rem',
                            cursor: 'pointer',
                            fontWeight: '600',
                            transition: 'all 0.3s ease',
                            boxShadow: '0 4px 14px rgba(239, 68, 68, 0.25)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.025em'
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
                      </td>
                    </tr>
                  );
                }) : (
                  <tr>
                    <td colSpan="15" className="no-positions">No positions yet</td>
                  </tr>
                )}
              </tbody>
            </table>
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
                    <td>{trade.entryPrice}%</td>
                    <td>{trade.exitPrice}%</td>
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
          
          <div className="day-advancement-section" style={{ marginBottom: '2rem', padding: '1rem', border: '1px solid #374151', borderRadius: '0.5rem' }}>
            <h3>Day Advancement</h3>
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ color: '#9ca3af', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                Current Global Day: <span style={{ color: '#10b981', fontWeight: 'bold' }}>{globalDay}</span>
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
                Advance to Day {globalDay + 1}
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
                      value={currentDynamicK.toFixed(8)}
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
                    <div>Days to Maturity: {daysToMaturity}</div>
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
                <span>Current DV01 (UI):</span>
                <span>${currentDv01.toLocaleString()}</span>
              </div>
              <div className="detail-row">
                <span>Real DV01 (Global Day {globalDay}):</span>
                <span>${calculateCurrentDv01(baseDv01, globalDay).toLocaleString()}</span>
              </div>
              <div className="detail-row">
                <span>Entry Day:</span>
                <span>{globalDay}</span>
              </div>
              <div className="detail-row">
                <span>Liquidation Price:</span>
                <span className="liq-price">
                  {(pendingTrade.type === 'pay' 
                    ? (parseFloat(pendingTrade.finalPrice) - ((margin / calculateCurrentDv01(baseDv01, globalDay)) / 100))
                    : (parseFloat(pendingTrade.finalPrice) + ((margin / calculateCurrentDv01(baseDv01, globalDay)) / 100))
                  ).toFixed(3)}%
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
    </div>
  );
}