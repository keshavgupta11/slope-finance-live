import React, { useState, useEffect } from 'react';

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
    <div style={{
      position: 'fixed',
      top: '1rem',
      right: '1rem',
      background: 'linear-gradient(145deg, rgba(26, 31, 46, 0.9) 0%, rgba(17, 24, 39, 0.6) 50%, rgba(15, 23, 42, 0.3) 100%)',
      border: `1px solid ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : type === 'warning' ? '#f59e0b' : '#374151'}`,
      borderRadius: '1rem',
      padding: '1rem 1.5rem',
      color: '#ffffff',
      fontWeight: '500',
      zIndex: 1000,
      backdropFilter: 'blur(16px)',
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6)',
      maxWidth: '400px',
      display: 'flex',
      alignItems: 'center',
      gap: '0.75rem',
      animation: 'slideInRight 0.5s ease-out'
    }}>
      <span style={{ fontSize: '1.25rem' }}>{icons[type]}</span>
      <span style={{ flex: 1 }}>{message}</span>
      <button onClick={onClose} style={{
        background: 'none',
        border: 'none',
        color: '#9ca3af',
        cursor: 'pointer',
        fontSize: '1.25rem',
        padding: '0.25rem',
        borderRadius: '0.25rem',
        transition: 'color 0.2s ease'
      }}>×</button>
    </div>
  );
};

export default function App() {
  const initialMarkets = {
    "JitoSol": { apy: 7.98, symbol: "JitoSOL" },
    "Lido stETH": { apy: 2.88, symbol: "stETH" },
    "Aave ETH Lending": { apy: 1.9, symbol: "aETH" },
    "Aave ETH Borrowing": { apy: 2.62, symbol: "aETHBorrow" },
    "Rocketpool rETH": { apy: 2.64, symbol: "rETH" }
  };

  const [marketSettings, setMarketSettings] = useState(initialMarkets);
  const [selectedMarket, setSelectedMarket] = useState("JitoSol");
  const [betAmount, setBetAmount] = useState(1000);
  const [userBalance, setUserBalance] = useState(20000);
  const [protocolTreasury, setProtocolTreasury] = useState(50000);
  const [activeBets, setActiveBets] = useState([]);
  const [activeTab, setActiveTab] = useState("Betting");
  const [pendingBet, setPendingBet] = useState(null);
  const [isSettlement, setIsSettlement] = useState(false);
  const [settlementPrices, setSettlementPrices] = useState({});
  const [pendingSettlement, setPendingSettlement] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [showMarketDropdown, setShowMarketDropdown] = useState(false);

  const showToast = (message, type = 'info') => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type }]);
  };

  const removeToast = (id) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  };

  const placeBet = (direction) => {
    if (betAmount > userBalance) {
      showToast('Insufficient balance!', 'error');
      return;
    }
    if (betAmount < 100) {
      showToast('Minimum bet is $100', 'error');
      return;
    }
    if (isSettlement) {
      showToast('Cannot place bets during settlement', 'error');
      return;
    }

    const currentPrice = marketSettings[selectedMarket].apy;
    setPendingBet({
      market: selectedMarket,
      direction,
      amount: betAmount,
      currentPrice: currentPrice.toFixed(3),
      potentialWin: (betAmount * 0.9).toFixed(2)
    });
  };

  const confirmBet = () => {
    const { market, direction, amount, currentPrice } = pendingBet;
    
    const newBet = {
      id: Date.now(),
      market,
      direction,
      amount,
      currentPrice: parseFloat(currentPrice),
      timestamp: new Date().toLocaleTimeString(),
      potentialWin: amount * 0.9,
      status: 'active'
    };

    setActiveBets(prev => [...prev, newBet]);
    setUserBalance(prev => prev - amount);
    setPendingBet(null);
    showToast(`Bet placed: ${direction} on ${market}`, 'success');
  };

  const requestSettlement = () => {
    const initialPrices = {};
    Object.keys(marketSettings).forEach(market => {
      initialPrices[market] = marketSettings[market].apy;
    });
    setPendingSettlement({ prices: initialPrices });
  };

  const confirmSettlement = () => {
    setSettlementPrices(pendingSettlement.prices);
    setIsSettlement(true);
    
    let totalWinnings = 0;
    let totalLosses = 0;
    
    const updatedBets = activeBets.map(bet => {
      const settlementPrice = pendingSettlement.prices[bet.market];
      const isWinner = 
        (bet.direction === 'higher' && settlementPrice > bet.currentPrice) ||
        (bet.direction === 'lower' && settlementPrice < bet.currentPrice);
      
      if (isWinner) {
        totalWinnings += bet.amount + bet.potentialWin;
        return { ...bet, status: 'won', settlementPrice };
      } else {
        totalLosses += bet.amount;
        return { ...bet, status: 'lost', settlementPrice };
      }
    });
    
    setUserBalance(prev => prev + totalWinnings);
    setProtocolTreasury(prev => prev + totalLosses - (totalWinnings - activeBets.reduce((sum, bet) => {
      const settlementPrice = pendingSettlement.prices[bet.market];
      const isWinner = 
        (bet.direction === 'higher' && settlementPrice > bet.currentPrice) ||
        (bet.direction === 'lower' && settlementPrice < bet.currentPrice);
      return isWinner ? sum + bet.amount : sum;
    }, 0)));
    
    setActiveBets(updatedBets);
    setPendingSettlement(null);
    showToast('Settlement completed!', 'success');
  };

  const exitSettlement = () => {
    setIsSettlement(false);
    setSettlementPrices({});
    showToast('Settlement mode exited', 'info');
  };

  const updateMarketSetting = (market, value) => {
    const updated = { ...marketSettings };
    updated[market].apy = parseFloat(value);
    setMarketSettings(updated);
  };

  const handleMarketChange = (newMarket) => {
    setSelectedMarket(newMarket);
    setShowMarketDropdown(false);
  };

  // Get market logo source
  const getMarketLogo = (market) => {
    if (market === "JitoSol") return "/jito.png";
    if (market === "Lido stETH") return "/lido.png";
    if (market === "Aave ETH Lending" || market === "Aave ETH Borrowing") return "/aave.png";
    if (market === "Rocketpool rETH") return "/rocketpool.png";
    return "/default-logo.png";
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #000510 0%, #030712 25%, #0f172a 50%, #111827 100%)',
      color: '#ffffff',
      fontFamily: "'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Enhanced background effects */}
      <div style={{
        position: 'fixed',
        top: '-50%',
        left: '-50%',
        width: '200%',
        height: '200%',
        background: `
          radial-gradient(circle at 20% 80%, rgba(16, 185, 129, 0.12) 0%, transparent 50%),
          radial-gradient(circle at 80% 20%, rgba(6, 182, 212, 0.08) 0%, transparent 50%),
          radial-gradient(circle at 40% 40%, rgba(59, 130, 246, 0.06) 0%, transparent 50%)
        `,
        zIndex: -2,
        animation: 'meshFloat 30s ease-in-out infinite',
        opacity: 0.8
      }} />

      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: `
          linear-gradient(45deg, transparent 49%, rgba(16, 185, 129, 0.02) 50%, transparent 51%),
          linear-gradient(-45deg, transparent 49%, rgba(6, 182, 212, 0.02) 50%, transparent 51%)
        `,
        backgroundSize: '60px 60px',
        zIndex: -1,
        animation: 'gridMove 20s linear infinite'
      }} />

      {toasts.map(toast => (
        <Toast
          key={toast.id}
          message={toast.message}
          type={toast.type}
          onClose={() => removeToast(toast.id)}
        />
      ))}

      <header style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0.8rem 1.5rem',
        borderBottom: '1px solid rgba(55, 65, 81, 0.6)',
        background: 'rgba(26, 31, 46, 0.8)',
        backdropFilter: 'blur(20px) saturate(180%)',
        position: 'sticky',
        top: 0,
        zIndex: 100,
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
        height: '60px',
        transition: 'all 0.3s ease'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', position: 'relative', padding: '0.3rem 0' }}>
            <h1 style={{
              fontSize: '1.4rem',
              fontWeight: '900',
              background: 'linear-gradient(135deg, #059669 0%, #10b981 35%, #34d399 70%, #6ee7b7 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              margin: 0,
              letterSpacing: '-0.025em',
              position: 'relative',
              transition: 'all 0.3s ease'
            }}>
              Slope Betting
            </h1>
            <div style={{
              fontSize: '0.65rem',
              color: '#9ca3af',
              fontWeight: '600',
              margin: 0,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              position: 'relative',
              transition: 'all 0.3s ease'
            }}>
              Crypto Rate Prediction
            </div>
          </div>
          <nav style={{ display: 'flex', gap: '1.5rem' }}>
            {['Betting', 'Docs', 'Leaderboard', 'Settings'].map(tab => (
              <span 
                key={tab}
                style={{
                  color: activeTab === tab ? '#10b981' : '#ffffff',
                  cursor: 'pointer',
                  transition: 'all 0.3s ease',
                  fontWeight: '500',
                  fontSize: '1rem',
                  padding: '0.5rem 0.8rem',
                  position: 'relative',
                  borderRadius: '0.5rem',
                  background: activeTab === tab ? 'rgba(16, 185, 129, 0.1)' : 'transparent',
                  transform: 'translateY(0)',
                  '&:hover': {
                    transform: 'translateY(-2px)'
                  }
                }}
                onClick={() => setActiveTab(tab)}
                onMouseEnter={(e) => {
                  if (activeTab !== tab) {
                    e.target.style.transform = 'translateY(-2px)';
                    e.target.style.background = 'rgba(16, 185, 129, 0.05)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (activeTab !== tab) {
                    e.target.style.transform = 'translateY(0)';
                    e.target.style.background = 'transparent';
                  }
                }}
              >
                {tab}
                <div style={{
                  position: 'absolute',
                  bottom: '0',
                  left: '50%',
                  width: activeTab === tab ? '80%' : '0',
                  height: '2px',
                  background: 'linear-gradient(135deg, #059669 0%, #10b981 35%, #34d399 70%, #6ee7b7 100%)',
                  transition: 'all 0.6s cubic-bezier(0.68, -0.55, 0.265, 1.55)',
                  transform: 'translateX(-50%)',
                  borderRadius: '1px'
                }} />
              </span>
            ))}
          </nav>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
          <div style={{ textAlign: 'right', fontSize: '0.875rem' }}>
            <div style={{ color: '#9ca3af' }}>Balance</div>
            <div style={{ color: '#10b981', fontWeight: '600' }}>
              ${userBalance.toLocaleString()}
            </div>
          </div>
          <div style={{ textAlign: 'right', fontSize: '0.875rem' }}>
            <div style={{ color: '#9ca3af' }}>Treasury</div>
            <div style={{ color: '#3b82f6', fontWeight: '600' }}>
              ${protocolTreasury.toLocaleString()}
            </div>
          </div>
        </div>
      </header>

      {activeTab === "Betting" && (
        <div style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
          {/* Hero Section */}
          <div style={{
            textAlign: 'center',
            padding: '3rem 2rem',
            marginBottom: '3rem'
          }}>
            <h2 style={{
              fontSize: '3rem',
              fontWeight: '800',
              marginBottom: '1rem',
              background: 'linear-gradient(135deg, #059669 0%, #10b981 35%, #34d399 70%, #6ee7b7 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              letterSpacing: '-0.025em'
            }}>
              Bet on Crypto Rates
            </h2>
            <p style={{
              fontSize: '1.25rem',
              color: '#9ca3af',
              lineHeight: 1.6,
              maxWidth: '600px',
              margin: '0 auto',
              fontWeight: '500'
            }}>
              Will rates go higher or lower tomorrow? Place your bets and win 90% returns on correct predictions.
            </p>
          </div>

          {/* Enhanced Betting Interface */}
          <div style={{
            background: 'linear-gradient(145deg, rgba(26, 31, 46, 0.9) 0%, rgba(17, 24, 39, 0.6) 50%, rgba(15, 23, 42, 0.3) 100%)',
            backdropFilter: 'blur(16px) saturate(180%)',
            border: '1px solid rgba(55, 65, 81, 0.6)',
            borderRadius: '1.5rem',
            padding: '2.5rem',
            marginBottom: '3rem',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
            position: 'relative',
            overflow: 'hidden'
          }}>
            {/* Top border glow */}
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: '2px',
              background: 'linear-gradient(135deg, #059669 0%, #10b981 35%, #34d399 70%, #6ee7b7 100%)',
              opacity: 0.6
            }} />

            {/* Enhanced Market Selection */}
            <div style={{ marginBottom: '2rem' }}>
              <label style={{ 
                display: 'block', 
                marginBottom: '1rem', 
                color: '#ffffff',
                fontSize: '1.1rem',
                fontWeight: '700'
              }}>
                Select Market
              </label>
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
                      src={getMarketLogo(selectedMarket)}
                      alt={`${selectedMarket} logo`}
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
                        {selectedMarket}
                      </div>
                      <div style={{ 
                        color: '#10b981', 
                        fontSize: '0.9rem',
                        fontWeight: '600'
                      }}>
                        {marketSettings[selectedMarket].apy.toFixed(3)}%
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
                        onClick={() => handleMarketChange(m)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '1rem',
                          padding: '1rem 1.5rem',
                          cursor: 'pointer',
                          borderBottom: index < Object.keys(marketSettings).length - 1 ? '1px solid rgba(55, 65, 81, 0.3)' : 'none',
                          transition: 'all 0.2s ease',
                          background: selectedMarket === m ? 'rgba(16, 185, 129, 0.1)' : 'transparent'
                        }}
                        onMouseEnter={(e) => {
                          e.target.style.background = 'rgba(16, 185, 129, 0.1)';
                        }}
                        onMouseLeave={(e) => {
                          e.target.style.background = selectedMarket === m ? 'rgba(16, 185, 129, 0.1)' : 'transparent';
                        }}
                      >
                        <img
                          src={getMarketLogo(m)}
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
                            Live: {marketSettings[m].apy.toFixed(3)}%
                          </div>
                        </div>
                        {selectedMarket === m && (
                          <div style={{
                            color: '#10b981',
                            fontSize: '1.2rem'
                          }}>
                            ✓
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Enhanced Current Price Display */}
            <div style={{
              textAlign: 'center',
              padding: '2rem',
              background: 'rgba(16, 185, 129, 0.1)',
              borderRadius: '1rem',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              marginBottom: '2rem',
              position: 'relative',
              overflow: 'hidden'
            }}>
              <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: '1px',
                background: 'linear-gradient(135deg, #059669 0%, #10b981 35%, #34d399 70%, #6ee7b7 100%)',
                opacity: 0.6
              }} />
              <div style={{ color: '#9ca3af', fontSize: '1rem', marginBottom: '0.5rem', fontWeight: '500' }}>
                Current Rate
              </div>
              <div style={{
                fontSize: '3rem',
                fontWeight: '800',
                color: '#10b981',
                marginBottom: '0.5rem',
                textShadow: '0 0 20px rgba(16, 185, 129, 0.3)',
                position: 'relative'
              }}>
                {marketSettings[selectedMarket].apy.toFixed(3)}%
                <div style={{
                  position: 'absolute',
                  left: '-20px',
                  top: '50%',
                  width: '8px',
                  height: '8px',
                  background: '#10b981',
                  borderRadius: '50%',
                  transform: 'translateY(-50%)',
                  animation: 'pulse 2s infinite',
                  boxShadow: '0 0 10px #10b981'
                }} />
              </div>
              <div style={{ color: '#9ca3af', fontSize: '0.9rem', fontWeight: '500' }}>
                Will tomorrow's rate be higher or lower?
              </div>
            </div>

            {/* Enhanced Bet Amount */}
            <div style={{ marginBottom: '2rem' }}>
              <label style={{ 
                display: 'block', 
                marginBottom: '1rem', 
                color: '#ffffff',
                fontSize: '1.1rem',
                fontWeight: '700'
              }}>
                Bet Amount
              </label>
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
                  type="number"
                  value={betAmount}
                  onChange={(e) => setBetAmount(Number(e.target.value))}
                  min="100"
                  max={userBalance}
                  style={{ 
                    width: '100%',
                    padding: '1rem 1rem 1rem 2.5rem',
                    borderRadius: '0.75rem',
                    border: '1px solid rgba(75, 85, 99, 0.4)',
                    background: 'rgba(31, 41, 55, 0.8)',
                    color: '#ffffff',
                    fontSize: '1.1rem',
                    fontWeight: '600',
                    backdropFilter: 'blur(8px)',
                    transition: 'all 0.3s ease'
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = '#10b981';
                    e.target.style.background = 'rgba(31, 41, 55, 0.95)';
                    e.target.style.boxShadow = '0 0 0 3px rgba(16, 185, 129, 0.15), 0 4px 20px rgba(16, 185, 129, 0.4)';
                    e.target.style.transform = 'translateY(-2px)';
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = 'rgba(75, 85, 99, 0.4)';
                    e.target.style.background = 'rgba(31, 41, 55, 0.8)';
                    e.target.style.boxShadow = 'none';
                    e.target.style.transform = 'translateY(0)';
                  }}
                />
              </div>
              <div style={{ 
                marginTop: '0.5rem', 
                color: '#9ca3af', 
                fontSize: '0.875rem',
                fontWeight: '500'
              }}>
                Potential winnings: ${(betAmount * 0.9).toLocaleString()}
              </div>
            </div>

            {/* Enhanced Betting Buttons */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <button
                onClick={() => placeBet('higher')}
                disabled={isSettlement}
                style={{
                  background: isSettlement ? '#6b7280' : 'linear-gradient(135deg, #059669 0%, #10b981 35%, #34d399 70%, #6ee7b7 100%)',
                  color: 'white',
                  border: 'none',
                  padding: '1.5rem',
                  borderRadius: '1rem',
                  fontSize: '1.1rem',
                  fontWeight: '700',
                  cursor: isSettlement ? 'not-allowed' : 'pointer',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  position: 'relative',
                  overflow: 'hidden',
                  transition: 'all 0.3s ease',
                  boxShadow: isSettlement ? 'none' : '0 4px 20px rgba(16, 185, 129, 0.4)',
                  textShadow: '0 1px 2px rgba(0, 0, 0, 0.3)',
                  opacity: isSettlement ? 0.5 : 1
                }}
                onMouseEnter={(e) => {
                  if (!isSettlement) {
                    e.target.style.background = 'linear-gradient(135deg, #10b981 0%, #34d399 35%, #6ee7b7 70%, #a7f3d0 100%)';
                    e.target.style.boxShadow = '0 0 40px rgba(16, 185, 129, 0.2)';
                    e.target.style.transform = 'translateY(-3px) scale(1.02)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSettlement) {
                    e.target.style.background = 'linear-gradient(135deg, #059669 0%, #10b981 35%, #34d399 70%, #6ee7b7 100%)';
                    e.target.style.boxShadow = '0 4px 20px rgba(16, 185, 129, 0.4)';
                    e.target.style.transform = 'translateY(0) scale(1)';
                  }
                }}
              >
                📈 BET HIGHER
              </button>
              <button
                onClick={() => placeBet('lower')}
                disabled={isSettlement}
                style={{
                  background: isSettlement ? '#6b7280' : 'linear-gradient(135deg, #dc2626 0%, #ef4444 35%, #f87171 70%, #fca5a5 100%)',
                  color: 'white',
                  border: 'none',
                  padding: '1.5rem',
                  borderRadius: '1rem',
                  fontSize: '1.1rem',
                  fontWeight: '700',
                  cursor: isSettlement ? 'not-allowed' : 'pointer',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  position: 'relative',
                  overflow: 'hidden',
                  transition: 'all 0.3s ease',
                  boxShadow: isSettlement ? 'none' : '0 4px 20px rgba(239, 68, 68, 0.4)',
                  textShadow: '0 1px 2px rgba(0, 0, 0, 0.3)',
                  opacity: isSettlement ? 0.5 : 1
                }}
                onMouseEnter={(e) => {
                  if (!isSettlement) {
                    e.target.style.background = 'linear-gradient(135deg, #ef4444 0%, #f87171 35%, #fca5a5 70%, #fecaca 100%)';
                    e.target.style.boxShadow = '0 0 40px rgba(239, 68, 68, 0.2)';
                    e.target.style.transform = 'translateY(-3px) scale(1.02)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSettlement) {
                    e.target.style.background = 'linear-gradient(135deg, #dc2626 0%, #ef4444 35%, #f87171 70%, #fca5a5 100%)';
                    e.target.style.boxShadow = '0 4px 20px rgba(239, 68, 68, 0.4)';
                    e.target.style.transform = 'translateY(0) scale(1)';
                  }
                }}
              >
                📉 BET LOWER
              </button>
            </div>
          </div>

          {/* Enhanced Active Bets Table */}
          <div style={{
            background: 'linear-gradient(145deg, rgba(26, 31, 46, 0.9) 0%, rgba(17, 24, 39, 0.6) 50%, rgba(15, 23, 42, 0.3) 100%)',
            backdropFilter: 'blur(16px) saturate(180%)',
            border: '1px solid rgba(55, 65, 81, 0.6)',
            borderRadius: '1rem',
            padding: '2rem',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
            position: 'relative',
            overflow: 'hidden'
          }}>
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: '2px',
              background: 'linear-gradient(135deg, #059669 0%, #10b981 35%, #34d399 70%, #6ee7b7 100%)',
              opacity: 0.6
            }} />

            <h3 style={{
              fontSize: '1.5rem',
              fontWeight: '700',
              marginBottom: '1.5rem',
              color: '#ffffff',
              position: 'relative'
            }}>
              Your Bets
              <div style={{
                position: 'absolute',
                bottom: '-6px',
                left: '0',
                width: '60px',
                height: '2px',
                background: 'linear-gradient(135deg, #059669 0%, #10b981 35%, #34d399 70%, #6ee7b7 100%)',
                borderRadius: '2px'
              }} />
            </h3>
            
            {activeBets.length > 0 ? (
              <div style={{
                overflowX: 'auto',
                background: 'rgba(26, 31, 46, 0.8)',
                borderRadius: '0.8rem',
                border: '1px solid rgba(55, 65, 81, 0.6)',
                backdropFilter: 'blur(12px)',
                boxShadow: '0 4px 16px rgba(0, 0, 0, 0.5)',
                position: 'relative'
              }}>
                <div style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  height: '1px',
                  background: 'linear-gradient(135deg, #059669 0%, #10b981 35%, #34d399 70%, #6ee7b7 100%)',
                  opacity: 0.3
                }} />
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                  <thead>
                    <tr style={{ background: 'rgba(31, 41, 55, 0.5)' }}>
                      <th style={{ 
                        padding: '0.8rem 0.6rem', 
                        textAlign: 'left', 
                        color: '#9ca3af', 
                        borderBottom: '1px solid rgba(55, 65, 81, 0.6)',
                        fontWeight: '600',
                        fontSize: '0.75rem',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em'
                      }}>Market</th>
                      <th style={{ 
                        padding: '0.8rem 0.6rem', 
                        textAlign: 'left', 
                        color: '#9ca3af', 
                        borderBottom: '1px solid rgba(55, 65, 81, 0.6)',
                        fontWeight: '600',
                        fontSize: '0.75rem',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em'
                      }}>Direction</th>
                      <th style={{ 
                        padding: '0.8rem 0.6rem', 
                        textAlign: 'right', 
                        color: '#9ca3af', 
                        borderBottom: '1px solid rgba(55, 65, 81, 0.6)',
                        fontWeight: '600',
                        fontSize: '0.75rem',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em'
                      }}>Amount</th>
                      <th style={{ 
                        padding: '0.8rem 0.6rem', 
                        textAlign: 'right', 
                        color: '#9ca3af', 
                        borderBottom: '1px solid rgba(55, 65, 81, 0.6)',
                        fontWeight: '600',
                        fontSize: '0.75rem',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em'
                      }}>Entry</th>
                      <th style={{ 
                        padding: '0.8rem 0.6rem', 
                        textAlign: 'right', 
                        color: '#9ca3af', 
                        borderBottom: '1px solid rgba(55, 65, 81, 0.6)',
                        fontWeight: '600',
                        fontSize: '0.75rem',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em'
                      }}>Settlement</th>
                      <th style={{ 
                        padding: '0.8rem 0.6rem', 
                        textAlign: 'center', 
                        color: '#9ca3af', 
                        borderBottom: '1px solid rgba(55, 65, 81, 0.6)',
                        fontWeight: '600',
                        fontSize: '0.75rem',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em'
                      }}>Status</th>
                      <th style={{ 
                        padding: '0.8rem 0.6rem', 
                        textAlign: 'right', 
                        color: '#9ca3af', 
                        borderBottom: '1px solid rgba(55, 65, 81, 0.6)',
                        fontWeight: '600',
                        fontSize: '0.75rem',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em'
                      }}>Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeBets.map(bet => (
                      <tr 
                        key={bet.id}
                        style={{
                          borderBottom: '1px solid rgba(55, 65, 81, 0.3)',
                          transition: 'all 0.3s ease',
                          position: 'relative'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'rgba(31, 41, 55, 0.3)';
                          e.currentTarget.style.transform = 'translateX(4px)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'transparent';
                          e.currentTarget.style.transform = 'translateX(0)';
                        }}
                      >
                        <td style={{ 
                          padding: '0.8rem 0.6rem', 
                          fontSize: '0.95rem', 
                          fontWeight: '600' 
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <img
                              src={getMarketLogo(bet.market)}
                              alt={bet.market + " logo"}
                              style={{ width: '20px', height: '20px', borderRadius: '50%' }}
                            />
                            <span style={{ color: '#ffffff' }}>{bet.market}</span>
                          </div>
                        </td>
                        <td style={{ padding: '0.8rem 0.6rem' }}>
                          <span style={{
                            color: bet.direction === 'higher' ? '#22c55e' : '#ef4444',
                            fontWeight: '700',
                            fontSize: '0.9rem',
                            padding: '0.25rem 0.75rem',
                            borderRadius: '1rem',
                            background: bet.direction === 'higher' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                            border: bet.direction === 'higher' ? '1px solid rgba(34, 197, 94, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.25rem'
                          }}>
                            {bet.direction === 'higher' ? '📈' : '📉'} {bet.direction.toUpperCase()}
                          </span>
                        </td>
                        <td style={{ 
                          padding: '0.8rem 0.6rem', 
                          textAlign: 'right', 
                          fontSize: '0.95rem',
                          fontWeight: '600',
                          color: '#ffffff'
                        }}>
                          ${bet.amount.toLocaleString()}
                        </td>
                        <td style={{ 
                          padding: '0.8rem 0.6rem', 
                          textAlign: 'right', 
                          fontSize: '0.95rem',
                          fontWeight: '600',
                          color: '#e5e7eb'
                        }}>
                          {bet.currentPrice.toFixed(3)}%
                        </td>
                        <td style={{ 
                          padding: '0.8rem 0.6rem', 
                          textAlign: 'right', 
                          fontSize: '0.95rem',
                          fontWeight: '700',
                          color: '#e5e7eb'
                        }}>
                          {bet.settlementPrice ? `${bet.settlementPrice.toFixed(3)}%` : '-'}
                        </td>
                        <td style={{ padding: '0.8rem 0.6rem', textAlign: 'center' }}>
                          <span style={{
                            padding: '0.4rem 0.8rem',
                            borderRadius: '1rem',
                            fontSize: '0.8rem',
                            fontWeight: '700',
                            color: bet.status === 'won' ? '#22c55e' : bet.status === 'lost' ? '#ef4444' : '#f59e0b',
                            background: bet.status === 'won' ? 'rgba(34, 197, 94, 0.1)' : bet.status === 'lost' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                            border: `1px solid ${bet.status === 'won' ? 'rgba(34, 197, 94, 0.3)' : bet.status === 'lost' ? 'rgba(239, 68, 68, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            textShadow: bet.status === 'won' ? '0 0 8px rgba(34, 197, 94, 0.3)' : bet.status === 'lost' ? '0 0 8px rgba(239, 68, 68, 0.3)' : '0 0 8px rgba(245, 158, 11, 0.3)'
                          }}>
                            <span style={{ fontSize: '0.75rem' }}>
                              {bet.status === 'won' ? '✅' : bet.status === 'lost' ? '❌' : '⏳'}
                            </span>
                            {bet.status.toUpperCase()}
                          </span>
                        </td>
                        <td style={{ 
                          padding: '0.8rem 0.6rem', 
                          textAlign: 'right',
                          fontSize: '1.1rem',
                          fontWeight: '800'
                        }}>
                          {bet.status === 'won' && (
                            <span style={{ 
                              color: '#22c55e', 
                              textShadow: '0 0 8px rgba(34, 197, 94, 0.3)'
                            }}>
                              +${(bet.amount + bet.potentialWin).toLocaleString()}
                            </span>
                          )}
                          {bet.status === 'lost' && (
                            <span style={{ 
                              color: '#ef4444', 
                              textShadow: '0 0 8px rgba(239, 68, 68, 0.3)'
                            }}>
                              -${bet.amount.toLocaleString()}
                            </span>
                          )}
                          {bet.status === 'active' && (
                            <span style={{ 
                              color: '#f59e0b', 
                              fontWeight: '600',
                              textShadow: '0 0 8px rgba(245, 158, 11, 0.3)'
                            }}>
                              Pending
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{
                textAlign: 'center',
                padding: '4rem 2rem',
                color: '#9ca3af',
                position: 'relative'
              }}>
                <div style={{
                  fontSize: '4rem',
                  marginBottom: '1.5rem',
                  opacity: 0.3,
                  animation: 'float 3s ease-in-out infinite'
                }}>
                  🎲
                </div>
                <h3 style={{
                  fontSize: '1.5rem',
                  fontWeight: '600',
                  marginBottom: '1rem',
                  color: '#e5e7eb'
                }}>
                  No Active Bets
                </h3>
                <p style={{
                  fontSize: '1rem',
                  lineHeight: 1.6,
                  maxWidth: '400px',
                  margin: '0 auto'
                }}>
                  You haven't placed any bets yet. Use the betting interface above to make your first prediction.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Settings Tab */}
      {activeTab === "Settings" && (
        <div style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
          <h2 style={{
            fontSize: '1.8rem',
            fontWeight: '700',
            marginBottom: '1.5rem',
            color: '#ffffff',
            background: 'linear-gradient(135deg, #059669 0%, #10b981 35%, #34d399 70%, #6ee7b7 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            position: 'relative'
          }}>
            Settlement & Settings
            <div style={{
              position: 'absolute',
              bottom: '-6px',
              left: '0',
              width: '80px',
              height: '2px',
              background: 'linear-gradient(135deg, #059669 0%, #10b981 35%, #34d399 70%, #6ee7b7 100%)',
              borderRadius: '2px'
            }} />
          </h2>

          {/* Settlement Section */}
          <div style={{
            background: 'linear-gradient(145deg, rgba(26, 31, 46, 0.9) 0%, rgba(17, 24, 39, 0.6) 50%, rgba(15, 23, 42, 0.3) 100%)',
            border: '1px solid rgba(55, 65, 81, 0.6)',
            borderRadius: '0.8rem',
            padding: '1.2rem',
            marginBottom: '1.5rem',
            backdropFilter: 'blur(12px)',
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.5)',
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
              background: 'linear-gradient(135deg, #059669 0%, #10b981 35%, #34d399 70%, #6ee7b7 100%)',
              opacity: 0.8
            }} />

            <h3 style={{
              fontSize: '1.1rem',
              fontWeight: '600',
              marginBottom: '1.2rem',
              color: '#ffffff',
              position: 'relative'
            }}>
              Settlement
              <div style={{
                position: 'absolute',
                bottom: '-4px',
                left: '0',
                width: '40px',
                height: '2px',
                background: 'linear-gradient(135deg, #059669 0%, #10b981 35%, #34d399 70%, #6ee7b7 100%)',
                borderRadius: '1px'
              }} />
            </h3>
            
            {!isSettlement ? (
              <div>
                <p style={{ 
                  color: '#9ca3af', 
                  marginBottom: '1.5rem',
                  fontSize: '1rem',
                  lineHeight: '1.6'
                }}>
                  Enter tomorrow's actual rates to settle all active bets.
                </p>
                
                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', 
                  gap: '1.2rem',
                  marginBottom: '2rem'
                }}>
                  {Object.keys(marketSettings).map(market => (
                    <div key={market} style={{
                      padding: '1.5rem',
                      background: 'rgba(26, 31, 46, 0.8)',
                      borderRadius: '0.75rem',
                      border: '1px solid rgba(55, 65, 81, 0.6)',
                      backdropFilter: 'blur(12px)',
                      transition: 'all 0.3s ease'
                    }}>
                      <label style={{ 
                        display: 'block', 
                        marginBottom: '1rem', 
                        color: '#ffffff',
                        fontWeight: '700',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}>
                        <span style={{ 
                          width: '8px', 
                          height: '8px', 
                          background: 'linear-gradient(135deg, #059669 0%, #10b981 35%, #34d399 70%, #6ee7b7 100%)', 
                          borderRadius: '50%',
                          boxShadow: '0 0 8px rgba(16, 185, 129, 0.5)',
                          display: 'inline-block'
                        }} />
                        {market}
                      </label>
                      <input
                        type="number"
                        step="0.001"
                        placeholder={marketSettings[market].apy.toFixed(3)}
                        style={{
                          width: '100%',
                          padding: '0.6rem 0.8rem',
                          borderRadius: '0.6rem',
                          border: '1px solid rgba(75, 85, 99, 0.4)',
                          background: 'rgba(31, 41, 55, 0.8)',
                          color: '#ffffff',
                          fontWeight: '500',
                          transition: 'all 0.3s ease',
                          backdropFilter: 'blur(8px)',
                          fontSize: '0.85rem'
                        }}
                       onChange={(e) => {
                        const updated = { ...settlementInputs || {} };
                        updated[market] = e.target.value;
                        setSettlementInputs(updated);
                      }}
                        onFocus={(e) => {
                          e.target.style.borderColor = '#10b981';
                          e.target.style.background = 'rgba(31, 41, 55, 0.95)';
                          e.target.style.boxShadow = '0 0 0 3px rgba(16, 185, 129, 0.15)';
                          e.target.style.transform = 'translateY(-1px)';
                        }}
                        onBlur={(e) => {
                          e.target.style.borderColor = 'rgba(75, 85, 99, 0.4)';
                          e.target.style.background = 'rgba(31, 41, 55, 0.8)';
                          e.target.style.boxShadow = 'none';
                          e.target.style.transform = 'translateY(0)';
                        }}
                      />
                    </div>
                  ))}
                </div>
                
                <button
                  onClick={requestSettlement}
                  style={{
                    background: 'linear-gradient(135deg, #059669 0%, #10b981 35%, #34d399 70%, #6ee7b7 100%)',
                    color: 'white',
                    border: 'none',
                    padding: '1rem 2rem',
                    borderRadius: '1rem',
                    fontSize: '1rem',
                    fontWeight: '700',
                    cursor: 'pointer',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    transition: 'all 0.3s ease',
                    boxShadow: '0 4px 20px rgba(16, 185, 129, 0.4)',
                    textShadow: '0 1px 2px rgba(0, 0, 0, 0.3)',
                    position: 'relative',
                    overflow: 'hidden'
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.background = 'linear-gradient(135deg, #10b981 0%, #34d399 35%, #6ee7b7 70%, #a7f3d0 100%)';
                    e.target.style.boxShadow = '0 0 40px rgba(16, 185, 129, 0.2)';
                    e.target.style.transform = 'translateY(-2px)';
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.background = 'linear-gradient(135deg, #059669 0%, #10b981 35%, #34d399 70%, #6ee7b7 100%)';
                    e.target.style.boxShadow = '0 4px 20px rgba(16, 185, 129, 0.4)';
                    e.target.style.transform = 'translateY(0)';
                  }}
                >
                  Settle All Bets
                </button>
              </div>
            ) : (
              <div>
                <div style={{
                  padding: '1rem',
                  background: 'rgba(245, 158, 11, 0.1)',
                  borderRadius: '0.5rem',
                  border: '1px solid rgba(245, 158, 11, 0.3)',
                  marginBottom: '1rem'
                }}>
                  <span style={{ color: '#f59e0b', fontWeight: '600' }}>🔒 Settlement Mode Active</span>
                </div>
                
                <h4 style={{ color: '#ffffff', marginBottom: '1rem' }}>Settlement Prices:</h4>
                {Object.keys(settlementPrices).map(market => (
                  <div key={market} style={{ 
                    fontSize: '0.875rem', 
                    color: '#e5e7eb',
                    marginBottom: '0.5rem'
                  }}>
                    {market}: {settlementPrices[market].toFixed(3)}%
                  </div>
                ))}
                
                <button
                  onClick={exitSettlement}
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
                    marginTop: '1rem'
                  }}
                >
                  Exit Settlement Mode
                </button>
              </div>
            )}
          </div>

          {/* Market Settings */}
          <div style={{
            background: 'linear-gradient(145deg, rgba(26, 31, 46, 0.9) 0%, rgba(17, 24, 39, 0.6) 50%, rgba(15, 23, 42, 0.3) 100%)',
            border: '1px solid rgba(55, 65, 81, 0.6)',
            borderRadius: '0.8rem',
            padding: '1.2rem',
            backdropFilter: 'blur(12px)',
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.5)',
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
              background: 'linear-gradient(135deg, #059669 0%, #10b981 35%, #34d399 70%, #6ee7b7 100%)',
              opacity: 0.8
            }} />

            <h3 style={{
              fontSize: '1.1rem',
              fontWeight: '600',
              marginBottom: '1.2rem',
              color: '#ffffff',
              position: 'relative'
            }}>
              Market Rates
              <div style={{
                position: 'absolute',
                bottom: '-4px',
                left: '0',
                width: '40px',
                height: '2px',
                background: 'linear-gradient(135deg, #059669 0%, #10b981 35%, #34d399 70%, #6ee7b7 100%)',
                borderRadius: '1px'
              }} />
            </h3>
            
            {Object.keys(marketSettings).map(market => (
              <div key={market} style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '1rem',
                borderBottom: '1px solid rgba(55, 65, 81, 0.6)',
                marginBottom: '1rem',
                transition: 'all 0.3s ease',
                borderRadius: '0.4rem'
              }}>
                <span style={{ color: '#ffffff', fontWeight: '600' }}>{market}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="number"
                    step="0.001"
                    value={marketSettings[market].apy}
                    onChange={(e) => updateMarketSetting(market, e.target.value)}
                    style={{
                      width: '100px',
                      padding: '0.6rem 0.8rem',
                      borderRadius: '0.6rem',
                      border: '1px solid rgba(75, 85, 99, 0.4)',
                      background: 'rgba(31, 41, 55, 0.8)',
                      color: '#ffffff',
                      textAlign: 'right',
                      fontWeight: '500',
                      transition: 'all 0.3s ease',
                      backdropFilter: 'blur(8px)',
                      fontSize: '0.85rem'
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = '#10b981';
                      e.target.style.boxShadow = '0 0 0 3px rgba(16, 185, 129, 0.15)';
                      e.target.style.background = 'rgba(31, 41, 55, 0.95)';
                      e.target.style.transform = 'translateY(-1px)';
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = 'rgba(75, 85, 99, 0.4)';
                      e.target.style.boxShadow = 'none';
                      e.target.style.background = 'rgba(31, 41, 55, 0.8)';
                      e.target.style.transform = 'translateY(0)';
                    }}
                  />
                  <span style={{ color: '#9ca3af', fontWeight: '600' }}>%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Placeholder tabs with enhanced styling */}
      {(activeTab === "Docs" || activeTab === "Leaderboard") && (
        <div style={{
          textAlign: 'center',
          padding: '4rem 2rem',
          background: 'linear-gradient(145deg, rgba(26, 31, 46, 0.9) 0%, rgba(17, 24, 39, 0.6) 50%, rgba(15, 23, 42, 0.3) 100%)',
          borderRadius: '1.5rem',
          border: '1px solid rgba(55, 65, 81, 0.6)',
          backdropFilter: 'blur(16px)',
          margin: '2rem auto',
          maxWidth: '800px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
          position: 'relative',
          overflow: 'hidden'
        }}>
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '2px',
            background: activeTab === "Docs" ? 
              'linear-gradient(135deg, #0891b2 0%, #06b6d4 35%, #22d3ee 70%, #67e8f9 100%)' :
              'linear-gradient(135deg, #6366f1 0%, #8b5cf6 25%, #a855f7 50%, #c084fc 75%, #e879f9 100%)',
            opacity: 0.8
          }} />
          <div style={{
            fontSize: '5rem',
            marginBottom: '2rem',
            opacity: 0.6,
            animation: 'float 3s ease-in-out infinite'
          }}>
            {activeTab === "Docs" ? "📖" : "🏆"}
          </div>
          <h2 style={{
            fontSize: '2.5rem',
            fontWeight: '800',
            marginBottom: '1.5rem',
            background: activeTab === "Docs" ? 
              'linear-gradient(135deg, #0891b2 0%, #06b6d4 35%, #22d3ee 70%, #67e8f9 100%)' :
              'linear-gradient(135deg, #6366f1 0%, #8b5cf6 25%, #a855f7 50%, #c084fc 75%, #e879f9 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text'
          }}>
            {activeTab === "Docs" ? "Documentation Hub" : "Betting Leaderboard"}
          </h2>
          <p style={{
            fontSize: '1.25rem',
            color: '#9ca3af',
            lineHeight: 1.6,
            maxWidth: '600px',
            margin: '0 auto'
          }}>
            {activeTab === "Docs" ? 
              "Complete betting rules and platform documentation" : 
              "Top performers and betting statistics"
            } coming soon...
          </p>
        </div>
      )}

      {/* Enhanced Bet Confirmation Modal */}
      {pendingBet && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          backdropFilter: 'blur(8px) saturate(180%)',
          animation: 'fadeIn 0.3s ease-out'
        }}>
          <div style={{
            background: 'linear-gradient(145deg, rgba(26, 31, 46, 0.9) 0%, rgba(17, 24, 39, 0.6) 50%, rgba(15, 23, 42, 0.3) 100%)',
            border: '1px solid rgba(55, 65, 81, 0.6)',
            borderRadius: '1rem',
            padding: '1.5rem',
            maxWidth: '28rem',
            width: '100%',
            margin: '0 1rem',
            backdropFilter: 'blur(20px) saturate(180%)',
            boxShadow: '0 20px 64px rgba(0, 0, 0, 0.4)',
            position: 'relative',
            overflow: 'hidden',
            animation: 'slideUp 0.4s ease-out'
          }}>
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: '2px',
              background: 'linear-gradient(135deg, #059669 0%, #10b981 35%, #34d399 70%, #6ee7b7 100%)',
              opacity: 0.8
            }} />

            <h3 style={{
              fontSize: '1.3rem',
              fontWeight: '700',
              marginBottom: '1.2rem',
              color: '#ffffff',
              position: 'relative'
            }}>
              Confirm Your Bet
              <div style={{
                position: 'absolute',
                bottom: '-6px',
                left: '0',
                width: '50px',
                height: '2px',
                background: 'linear-gradient(135deg, #059669 0%, #10b981 35%, #34d399 70%, #6ee7b7 100%)',
                borderRadius: '1px'
              }} />
            </h3>
            
            <div style={{
              background: pendingBet.direction === 'higher' ? 
                'linear-gradient(135deg, rgba(34, 197, 94, 0.1) 0%, rgba(22, 163, 74, 0.1) 100%)' :
                'linear-gradient(135deg, rgba(239, 68, 68, 0.1) 0%, rgba(220, 38, 38, 0.1) 100%)',
              border: pendingBet.direction === 'higher' ? 
                '1px solid rgba(34, 197, 94, 0.3)' : 
                '1px solid rgba(239, 68, 68, 0.3)',
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
                Betting {pendingBet.direction}
              </div>
              
              <div style={{
                fontSize: '2.5rem',
                fontWeight: '800',
                color: pendingBet.direction === 'higher' ? '#22c55e' : '#ef4444',
                marginBottom: '0.5rem',
                lineHeight: 1
              }}>
                {pendingBet.direction === 'higher' ? '📈' : '📉'} {pendingBet.currentPrice}%
              </div>
              
              <div style={{
                fontSize: '1rem',
                color: '#6b7280'
              }}>
                Current {pendingBet.market} Rate
              </div>
            </div>

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
                  Bet Amount
                </div>
                <div style={{ color: '#f1f5f9', fontSize: '1.25rem', fontWeight: '700' }}>
                  ${pendingBet.amount.toLocaleString()}
                </div>
              </div>
              
              <div style={{
                background: 'rgba(17, 24, 39, 0.8)',
                padding: '1rem',
                borderRadius: '0.75rem',
                border: '1px solid #374151'
              }}>
                <div style={{ color: '#9ca3af', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                  Potential Win
                </div>
                <div style={{ color: '#22c55e', fontSize: '1.25rem', fontWeight: '700' }}>
                  ${pendingBet.potentialWin}
                </div>
              </div>
            </div>

            <div style={{
              background: 'rgba(55, 65, 81, 0.3)',
              borderRadius: '0.75rem',
              padding: '1rem',
              marginBottom: '1.5rem'
            }}>
              <div style={{ fontSize: '0.875rem', color: '#9ca3af', marginBottom: '0.5rem' }}>
                Market: {pendingBet.market}
              </div>
              <div style={{ fontSize: '0.875rem', color: '#9ca3af' }}>
                Prediction: Rate will go {pendingBet.direction} than {pendingBet.currentPrice}%
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.8rem' }}>
              <button 
                onClick={confirmBet} 
                style={{
                  background: 'linear-gradient(135deg, #059669 0%, #10b981 35%, #34d399 70%, #6ee7b7 100%)',
                  color: 'white',
                  padding: '0.8rem',
                  borderRadius: '0.8rem',
                  fontWeight: '700',
                  cursor: 'pointer',
                  border: 'none',
                  transition: 'all 0.3s ease',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  position: 'relative',
                  overflow: 'hidden',
                  fontSize: '0.85rem',
                  flex: 1
                }}
                onMouseEnter={(e) => {
                  e.target.style.background = 'linear-gradient(135deg, #10b981 0%, #34d399 35%, #6ee7b7 70%, #a7f3d0 100%)';
                  e.target.style.transform = 'translateY(-2px)';
                  e.target.style.boxShadow = '0 0 40px rgba(16, 185, 129, 0.2)';
                }}
                onMouseLeave={(e) => {
                  e.target.style.background = 'linear-gradient(135deg, #059669 0%, #10b981 35%, #34d399 70%, #6ee7b7 100%)';
                  e.target.style.transform = 'translateY(0)';
                  e.target.style.boxShadow = 'none';
                }}
              >
                Confirm Bet
              </button>
              <button 
                onClick={() => setPendingBet(null)} 
                style={{
                  background: 'rgba(55, 65, 81, 0.6)',
                  color: 'white',
                  padding: '0.8rem',
                  borderRadius: '0.8rem',
                  fontWeight: '600',
                  cursor: 'pointer',
                  border: '1px solid rgba(75, 85, 99, 0.5)',
                  transition: 'all 0.3s ease',
                  fontSize: '0.85rem',
                  flex: 1
                }}
                onMouseEnter={(e) => {
                  e.target.style.background = 'rgba(75, 85, 99, 0.6)';
                  e.target.style.transform = 'translateY(-2px)';
                  e.target.style.borderColor = '#10b981';
                  e.target.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.1)';
                }}
                onMouseLeave={(e) => {
                  e.target.style.background = 'rgba(55, 65, 81, 0.6)';
                  e.target.style.transform = 'translateY(0)';
                  e.target.style.borderColor = 'rgba(75, 85, 99, 0.5)';
                  e.target.style.boxShadow = 'none';
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Enhanced Settlement Confirmation Modal */}
      {pendingSettlement && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          backdropFilter: 'blur(8px) saturate(180%)'
        }}>
          <div style={{
            background: 'linear-gradient(145deg, rgba(26, 31, 46, 0.9) 0%, rgba(17, 24, 39, 0.6) 50%, rgba(15, 23, 42, 0.3) 100%)',
            border: '1px solid rgba(55, 65, 81, 0.6)',
            borderRadius: '1rem',
            padding: '1.5rem',
            maxWidth: '28rem',
            width: '100%',
            margin: '0 1rem',
            backdropFilter: 'blur(20px) saturate(180%)',
            boxShadow: '0 20px 64px rgba(0, 0, 0, 0.4)',
            position: 'relative',
            overflow: 'hidden'
          }}>
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: '2px',
              background: 'linear-gradient(135d, #059669 0%, #10b981 35%, #34d399 70%, #6ee7b7 100%)',
              opacity: 0.8
            }} />

            <h3 style={{
              fontSize: '1.3rem',
              fontWeight: '700',
              marginBottom: '1rem',
              color: '#ffffff',
              position: 'relative'
            }}>
              Confirm Settlement
              <div style={{
                position: 'absolute',
                bottom: '-6px',
                left: '0',
                width: '50px',
                height: '2px',
                background: 'linear-gradient(135deg, #059669 0%, #10b981 35%, #34d399 70%, #6ee7b7 100%)',
                borderRadius: '1px'
              }} />
            </h3>
            <div style={{ marginBottom: '1rem', color: '#9ca3af', fontSize: '0.875rem' }}>
              This will settle all active bets using these final rates:
            </div>
            <div style={{ marginBottom: '1.5rem' }}>
              {Object.keys(pendingSettlement.prices).map(market => (
                <div key={market} style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between',
                  padding: '0.5rem 0',
                  borderBottom: '1px solid rgba(55, 65, 81, 0.3)'
                }}>
                  <span>{market}:</span>
                  <span style={{ fontWeight: '600' }}>
                    {pendingSettlement.prices[market]?.toFixed(3) || marketSettings[market].apy.toFixed(3)}%
                  </span>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button onClick={confirmSettlement} style={{
                background: 'linear-gradient(135deg, #059669 0%, #10b981 35%, #34d399 70%, #6ee7b7 100%)',
                color: 'white',
                padding: '1rem 1.5rem',
                borderRadius: '1rem',
                fontWeight: '700',
                cursor: 'pointer',
                border: 'none',
                flex: 1
              }}>
                Settle All Bets
              </button>
              <button onClick={() => setPendingSettlement(null)} style={{
                background: 'rgba(55, 65, 81, 0.6)',
                color: 'white',
                padding: '1rem 1.5rem',
                borderRadius: '1rem',
                fontWeight: '600',
                cursor: 'pointer',
                border: '1px solid rgba(75, 85, 99, 0.5)',
                flex: 1
              }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CSS Animations */}
      <style jsx>{`
        @keyframes meshFloat {
          0%, 100% { 
            transform: rotate(0deg) scale(1) translate(0, 0); 
            opacity: 0.8;
          }
          25% { 
            transform: rotate(90deg) scale(1.1) translate(2%, 1%); 
            opacity: 1;
          }
          50% { 
            transform: rotate(180deg) scale(0.9) translate(-1%, 2%); 
            opacity: 0.9;
          }
          75% { 
            transform: rotate(270deg) scale(1.05) translate(1%, -1%); 
            opacity: 0.95;
          }
        }

        @keyframes gridMove {
          0% { transform: translate(0, 0); }
          100% { transform: translate(60px, 60px); }
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
            transform: scale(1);
          }
          50% { 
            opacity: 0.5;
            transform: scale(1.05);
          }
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

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(32px) scale(0.95);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      `}</style>
    </div>
  );
}
