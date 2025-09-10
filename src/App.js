import React, { useState, useEffect } from 'react';

// Toast Component
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
      background: 'linear-gradient(145deg, rgba(26, 31, 46, 0.9) 0%, rgba(17, 24, 39, 0.6) 50%)',
      border: `1px solid ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#f59e0b'}`,
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
      gap: '0.75rem'
    }}>
      <span style={{ fontSize: '1.25rem' }}>{icons[type]}</span>
      <span style={{ flex: 1 }}>{message}</span>
      <button onClick={onClose} style={{
        background: 'none',
        border: 'none',
        color: '#9ca3af',
        cursor: 'pointer',
        fontSize: '1.25rem'
      }}>×</button>
    </div>
  );
};

export default function App() {
  const initialMarkets = {
    "JitoSol": { apy: 7.98 },
    "Lido stETH": { apy: 2.88 },
    "Aave ETH Lending": { apy: 1.9 },
    "Aave ETH Borrowing": { apy: 2.62 },
    "Rocketpool rETH": { apy: 2.64 }
  };

  const [marketSettings, setMarketSettings] = useState(initialMarkets);
  const [selectedMarket, setSelectedMarket] = useState("JitoSol");
  const [betAmount, setBetAmount] = useState(1000);
  const [userBalance, setUserBalance] = useState(10000);
  const [protocolTreasury, setProtocolTreasury] = useState(50000);
  const [activeBets, setActiveBets] = useState([]);
  const [activeTab, setActiveTab] = useState("Betting");
  const [pendingBet, setPendingBet] = useState(null);
  const [isSettlement, setIsSettlement] = useState(false);
  const [settlementPrices, setSettlementPrices] = useState({});
  const [pendingSettlement, setPendingSettlement] = useState(null);
  const [toasts, setToasts] = useState([]);

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

  // Styles
  const appStyle = {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #000510 0%, #030712 25%, #0f172a 50%, #111827 100%)',
    color: '#ffffff',
    fontFamily: "'Inter', system-ui, sans-serif"
  };

  const headerStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '1rem 1.5rem',
    borderBottom: '1px solid rgba(55, 65, 81, 0.6)',
    background: 'rgba(26, 31, 46, 0.8)',
    backdropFilter: 'blur(20px)',
    position: 'sticky',
    top: 0,
    zIndex: 100
  };

  const glassCardStyle = {
    background: 'linear-gradient(145deg, rgba(26, 31, 46, 0.9) 0%, rgba(17, 24, 39, 0.6) 50%)',
    backdropFilter: 'blur(16px)',
    border: '1px solid rgba(55, 65, 81, 0.6)',
    borderRadius: '1rem'
  };

  return (
    <div style={appStyle}>
      {toasts.map(toast => (
        <Toast
          key={toast.id}
          message={toast.message}
          type={toast.type}
          onClose={() => removeToast(toast.id)}
        />
      ))}

      <header style={headerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
          <h1 style={{
            fontSize: '1.6rem',
            fontWeight: '900',
            background: 'linear-gradient(135deg, #059669 0%, #10b981 35%, #34d399 70%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            margin: 0
          }}>
            Slope Betting
          </h1>
          <nav style={{ display: 'flex', gap: '1.5rem' }}>
            {['Betting', 'Docs', 'Leaderboard', 'Settings'].map(tab => (
              <span 
                key={tab}
                style={{
                  color: activeTab === tab ? '#10b981' : '#ffffff',
                  cursor: 'pointer',
                  fontWeight: '500',
                  padding: '0.5rem 0.8rem',
                  borderRadius: '0.5rem',
                  background: activeTab === tab ? 'rgba(16, 185, 129, 0.1)' : 'transparent'
                }}
                onClick={() => setActiveTab(tab)}
              >
                {tab}
              </span>
            ))}
          </nav>
        </div>
        
        <div style={{ display: 'flex', gap: '2rem', fontSize: '0.875rem' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ color: '#9ca3af' }}>Balance</div>
            <div style={{ color: '#10b981', fontWeight: '600' }}>
              ${userBalance.toLocaleString()}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ color: '#9ca3af' }}>Treasury</div>
            <div style={{ color: '#3b82f6', fontWeight: '600' }}>
              ${protocolTreasury.toLocaleString()}
            </div>
          </div>
        </div>
      </header>

      {activeTab === "Betting" && (
        <div style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
          {/* Hero */}
          <div style={{ textAlign: 'center', padding: '3rem 2rem', marginBottom: '3rem' }}>
            <h2 style={{
              fontSize: '3rem',
              fontWeight: '800',
              marginBottom: '1rem',
              background: 'linear-gradient(135deg, #059669 0%, #10b981 35%, #34d399 70%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent'
            }}>
              Bet on Crypto Rates
            </h2>
            <p style={{
              fontSize: '1.25rem',
              color: '#9ca3af',
              lineHeight: 1.6,
              maxWidth: '600px',
              margin: '0 auto'
            }}>
              Will rates go higher or lower tomorrow? Win 90% returns on correct predictions.
            </p>
          </div>

          {/* Betting Interface */}
          <div style={{ ...glassCardStyle, padding: '2.5rem', marginBottom: '3rem' }}>
            {/* Market Selection */}
            <div style={{ marginBottom: '2rem' }}>
              <label style={{ 
                display: 'block', 
                marginBottom: '1rem', 
                fontSize: '1.1rem',
                fontWeight: '600'
              }}>
                Select Market
              </label>
              <select
                value={selectedMarket}
                onChange={(e) => setSelectedMarket(e.target.value)}
                style={{
                  width: '100%',
                  padding: '1rem',
                  borderRadius: '0.75rem',
                  border: '1px solid rgba(75, 85, 99, 0.4)',
                  background: 'rgba(31, 41, 55, 0.8)',
                  color: '#ffffff',
                  fontSize: '1rem'
                }}
              >
                {Object.keys(marketSettings).map(market => (
                  <option key={market} value={market} style={{ background: '#1f2937' }}>
                    {market} - {marketSettings[market].apy.toFixed(3)}%
                  </option>
                ))}
              </select>
            </div>

            {/* Current Price */}
            <div style={{
              textAlign: 'center',
              padding: '2rem',
              background: 'rgba(16, 185, 129, 0.1)',
              borderRadius: '1rem',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              marginBottom: '2rem'
            }}>
              <div style={{ color: '#9ca3af', fontSize: '1rem', marginBottom: '0.5rem' }}>
                Current Rate
              </div>
              <div style={{
                fontSize: '3rem',
                fontWeight: '800',
                color: '#10b981',
                marginBottom: '0.5rem'
              }}>
                {marketSettings[selectedMarket].apy.toFixed(3)}%
              </div>
              <div style={{ color: '#9ca3af', fontSize: '0.9rem' }}>
                Will tomorrow's rate be higher or lower?
              </div>
            </div>

            {/* Bet Amount */}
            <div style={{ marginBottom: '2rem' }}>
              <label style={{ 
                display: 'block', 
                marginBottom: '1rem', 
                fontSize: '1.1rem',
                fontWeight: '600'
              }}>
                Bet Amount
              </label>
              <div style={{ position: 'relative' }}>
                <span style={{ 
                  position: 'absolute', 
                  left: '16px', 
                  top: '50%', 
                  transform: 'translateY(-50%)', 
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
                    fontSize: '1.1rem'
                  }}
                />
              </div>
              <div style={{ marginTop: '0.5rem', color: '#9ca3af', fontSize: '0.875rem' }}>
                Potential winnings: ${(betAmount * 0.9).toLocaleString()}
              </div>
            </div>

            {/* Betting Buttons */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <button
                onClick={() => placeBet('higher')}
                disabled={isSettlement}
                style={{
                  background: isSettlement ? '#6b7280' : 'linear-gradient(45deg, #22c55e, #16a34a)',
                  color: 'white',
                  border: 'none',
                  padding: '1.5rem',
                  borderRadius: '1rem',
                  fontSize: '1.1rem',
                  fontWeight: '700',
                  cursor: isSettlement ? 'not-allowed' : 'pointer',
                  textTransform: 'uppercase'
                }}
              >
                📈 BET HIGHER
              </button>
              <button
                onClick={() => placeBet('lower')}
                disabled={isSettlement}
                style={{
                  background: isSettlement ? '#6b7280' : 'linear-gradient(45deg, #ef4444, #dc2626)',
                  color: 'white',
                  border: 'none',
                  padding: '1.5rem',
                  borderRadius: '1rem',
                  fontSize: '1.1rem',
                  fontWeight: '700',
                  cursor: isSettlement ? 'not-allowed' : 'pointer',
                  textTransform: 'uppercase'
                }}
              >
                📉 BET LOWER
              </button>
            </div>
          </div>

          {/* Active Bets Table */}
          <div style={{ ...glassCardStyle, padding: '2rem' }}>
            <h3 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '1.5rem' }}>
              Your Bets
            </h3>
            
            {activeBets.length > 0 ? (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ padding: '1rem', textAlign: 'left', color: '#9ca3af', borderBottom: '1px solid rgba(55, 65, 81, 0.6)' }}>Market</th>
                      <th style={{ padding: '1rem', textAlign: 'left', color: '#9ca3af', borderBottom: '1px solid rgba(55, 65, 81, 0.6)' }}>Direction</th>
                      <th style={{ padding: '1rem', textAlign: 'right', color: '#9ca3af', borderBottom: '1px solid rgba(55, 65, 81, 0.6)' }}>Amount</th>
                      <th style={{ padding: '1rem', textAlign: 'right', color: '#9ca3af', borderBottom: '1px solid rgba(55, 65, 81, 0.6)' }}>Entry</th>
                      <th style={{ padding: '1rem', textAlign: 'right', color: '#9ca3af', borderBottom: '1px solid rgba(55, 65, 81, 0.6)' }}>Settlement</th>
                      <th style={{ padding: '1rem', textAlign: 'center', color: '#9ca3af', borderBottom: '1px solid rgba(55, 65, 81, 0.6)' }}>Status</th>
                      <th style={{ padding: '1rem', textAlign: 'right', color: '#9ca3af', borderBottom: '1px solid rgba(55, 65, 81, 0.6)' }}>Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeBets.map(bet => (
                      <tr key={bet.id}>
                        <td style={{ padding: '1rem' }}>{bet.market}</td>
                        <td style={{ padding: '1rem' }}>
                          <span style={{
                            color: bet.direction === 'higher' ? '#22c55e' : '#ef4444',
                            fontWeight: '600'
                          }}>
                            {bet.direction === 'higher' ? '📈' : '📉'} {bet.direction.toUpperCase()}
                          </span>
                        </td>
                        <td style={{ padding: '1rem', textAlign: 'right', fontWeight: '600' }}>
                          ${bet.amount.toLocaleString()}
                        </td>
                        <td style={{ padding: '1rem', textAlign: 'right' }}>
                          {bet.currentPrice.toFixed(3)}%
                        </td>
                        <td style={{ padding: '1rem', textAlign: 'right' }}>
                          {bet.settlementPrice ? `${bet.settlementPrice.toFixed(3)}%` : '-'}
                        </td>
                        <td style={{ padding: '1rem', textAlign: 'center' }}>
                          <span style={{
                            padding: '0.25rem 0.75rem',
                            borderRadius: '1rem',
                            fontSize: '0.875rem',
                            fontWeight: '600',
                            color: bet.status === 'won' ? '#22c55e' : bet.status === 'lost' ? '#ef4444' : '#f59e0b',
                            background: bet.status === 'won' ? 'rgba(34, 197, 94, 0.1)' : bet.status === 'lost' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(245, 158, 11, 0.1)'
                          }}>
                            {bet.status.toUpperCase()}
                          </span>
                        </td>
                        <td style={{ padding: '1rem', textAlign: 'right' }}>
                          {bet.status === 'won' && (
                            <span style={{ color: '#22c55e', fontWeight: '700' }}>
                              +${(bet.amount + bet.potentialWin).toLocaleString()}
                            </span>
                          )}
                          {bet.status === 'lost' && (
                            <span style={{ color: '#ef4444', fontWeight: '700' }}>
                              -${bet.amount.toLocaleString()}
                            </span>
                          )}
                          {bet.status === 'active' && (
                            <span style={{ color: '#f59e0b', fontWeight: '600' }}>Pending</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '3rem', color: '#9ca3af' }}>
                <div style={{ fontSize: '3rem', marginBottom: '1rem', opacity: 0.5 }}>🎲</div>
                <p>No active bets yet. Place your first bet above!</p>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "Settings" && (
        <div style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
          <h2 style={{ fontSize: '2rem', fontWeight: '700', marginBottom: '2rem' }}>
            Settlement & Settings
          </h2>

          {/* Settlement Section */}
          <div style={{ ...glassCardStyle, marginBottom: '2rem', padding: '2rem' }}>
            <h3 style={{ fontSize: '1.5rem', fontWeight: '600', marginBottom: '1.5rem' }}>
              Settlement
            </h3>
            
            {!isSettlement ? (
              <div>
                <p style={{ color: '#9ca3af', marginBottom: '1.5rem' }}>
                  Enter tomorrow's actual rates to settle all active bets.
                </p>
                
                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', 
                  gap: '1rem',
                  marginBottom: '2rem'
                }}>
                  {Object.keys(marketSettings).map(market => (
                    <div key={market}>
                      <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>
                        {market}
                      </label>
                      <input
                        type="number"
                        step="0.001"
                        placeholder={marketSettings[market].apy.toFixed(3)}
                        style={{
                          width: '100%',
                          padding: '0.75rem',
                          borderRadius: '0.5rem',
                          border: '1px solid rgba(75, 85, 99, 0.4)',
                          background: 'rgba(31, 41, 55, 0.8)',
                          color: '#ffffff'
                        }}
                        onChange={(e) => {
                          const updated = { ...pendingSettlement?.prices || {} };
                          updated[market] = parseFloat(e.target.value) || marketSettings[market].apy;
                          setPendingSettlement(prev => ({ ...prev, prices: updated }));
                        }}
                      />
                    </div>
                  ))}
                </div>
                
                <button
                  onClick={requestSettlement}
                  style={{
                    background: 'linear-gradient(135deg, #059669 0%, #10b981 35%, #34d399 70%)',
                    color: 'white',
                    border: 'none',
                    padding: '1rem 2rem',
                    borderRadius: '1rem',
                    fontWeight: '700',
                    cursor: 'pointer',
                    textTransform: 'uppercase'
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
                  <span style={{ color: '#f59e0b', fontWeight: '600' }}>Settlement Mode Active</span>
                </div>
                
                <h4 style={{ marginBottom: '1rem' }}>Settlement Prices:</h4>
                {Object.keys(settlementPrices).map(market => (
                  <div key={market} style={{ fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                    {market}: {settlementPrices[market].toFixed(3)}%
                  </div>
                ))}
                
                <button
                  onClick={exitSettlement}
                  style={{
                    background: 'rgba(55, 65, 81, 0.6)',
                    color: 'white',
                    border: '1px solid rgba(75, 85, 99, 0.5)',
                    padding: '0.75rem 1.5rem',
                    borderRadius: '0.75rem',
                    cursor: 'pointer',
                    fontWeight: '600',
                    marginTop: '1rem'
                  }}
                >
                  Exit Settlement Mode
                </button>
              </div>
            )}
          </div>

          {/* Market Settings */}
          <div style={{ ...glassCardStyle, padding: '2rem' }}>
            <h3 style={{ fontSize: '1.5rem', fontWeight: '600', marginBottom: '1.5rem' }}>
              Market Rates
            </h3>
            
            {Object.keys(marketSettings).map(market => (
              <div key={market} style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                padding: '1rem',
                borderBottom: '1px solid rgba(55, 65, 81, 0.6)',
                marginBottom: '1rem'
              }}>
                <span style={{ fontWeight: '600' }}>{market}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="number"
                    step="0.001"
                    value={marketSettings[market].apy}
                    onChange={(e) => updateMarketSetting(market, e.target.value)}
                    style={{
                      width: '100px',
                      padding: '0.5rem',
                      borderRadius: '0.375rem',
                      border: '1px solid rgba(75, 85, 99, 0.4)',
                      background: 'rgba(31, 41, 55, 0.8)',
                      color: '#ffffff',
                      textAlign: 'right'
                    }}
                  />
                  <span style={{ color: '#9ca3af' }}>%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Placeholder tabs */}
      {(activeTab === "Docs" || activeTab === "Leaderboard") && (
        <div style={{
          textAlign: 'center',
          padding: '4rem 2rem',
          background: 'linear-gradient(145deg, rgba(26, 31, 46, 0.9) 0%, rgba(17, 24, 39, 0.6) 50%)',
          borderRadius: '1.5rem',
          border: '1px solid rgba(55, 65, 81, 0.6)',
          backdropFilter: 'blur(16px)',
          margin: '2rem auto',
          maxWidth: '800px'
        }}>
          <div style={{ fontSize: '5rem', marginBottom: '2rem', opacity: 0.6 }}>
            {activeTab === "Docs" ? "📖" : "🏆"}
          </div>
          <h2 style={{
            fontSize: '2.5rem',
            fontWeight: '800',
            marginBottom: '1.5rem',
            background: 'linear-gradient(135d, #059669 0%, #10b981 35%, #34d399 70%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent'
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

      {/* Bet Confirmation Modal */}
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
          zIndex: 1000
        }}>
          <div style={{
            background: 'linear-gradient(135deg, rgba(0,0,0,0.95) 0%, rgba(15,23,42,0.95) 100%)',
            backdropFilter: 'blur(20px)',
            border: '2px solid #10b981',
            borderRadius: '1.5rem',
            padding: '2rem',
            minWidth: '400px',
            maxWidth: '500px'
          }}>
            <h3 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '1.5rem' }}>
              Confirm Your Bet
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
                textTransform: 'uppercase'
              }}>
                Betting {pendingBet.direction}
              </div>
              
              <div style={{
                fontSize: '2.5rem',
                fontWeight: '800',
                color: pendingBet.direction === 'higher' ? '#22c55e' : '#ef4444',
                marginBottom: '0.5rem'
              }}>
                {pendingBet.currentPrice}%
              </div>
              
              <div style={{ fontSize: '1rem', color: '#6b7280' }}>
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

            <div style={{ display: 'flex', gap: '1rem' }}>
              <button 
                onClick={confirmBet} 
                style={{
                  background: 'linear-gradient(45deg, #059669, #10b981)',
                  color: 'white',
                  padding: '1rem 1.5rem',
                  borderRadius: '1rem',
                  fontWeight: '700',
                  cursor: 'pointer',
                  border: 'none',
                  flex: 1,
                  textTransform: 'uppercase'
                }}
              >
                Confirm Bet
              </button>
              <button 
                onClick={() => setPendingBet(null)} 
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

      {/* Settlement Confirmation Modal */}
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
          zIndex: 1000
        }}>
          <div style={{
            background: 'linear-gradient(135deg, rgba(0,0,0,0.95) 0%, rgba(15,23,42,0.95) 100%)',
            backdropFilter: 'blur(20px)',
            border: '2px solid #10b981',
            borderRadius: '1.5rem',
            padding: '2rem',
            minWidth: '400px'
          }}>
            <h3 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '1rem' }}>
              Confirm Settlement
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
                  borderBottom: '1px solid #374151'
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
                background: 'linear-gradient(135deg, #059669 0%, #10b981 35%, #34d399 70%)',
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
    </div>
  );
}
