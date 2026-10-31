import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import confetti from 'canvas-confetti';
import { SafeImage } from './SafeImage';
import {
  Coins,
  ShoppingBag,
  Package,
  Clock,
  CheckCircle2,
  XCircle,
  Truck,
  AlertCircle,
  Gift,
  Search,
  Sparkles,
  BookOpen,
  Award,
  Trophy,
  Star,
  Undo2,
  Check,
} from 'lucide-react';

export const StudentStore = () => {
  const { state, currentUser, purchaseProduct, cancelOrder, triggerToast } = useApp();

  const studentsList = state?.students || [];
  const productsList = (state?.products || []).filter((p) => p.isAvailable !== false);
  const ordersList = state?.orders || [];

  // Find active student
  const student = studentsList.find((s) => s.userId === currentUser?.id);
  const studentCoins = student?.coins || 0;

  // Student orders only
  const studentOrders = useMemo(() => {
    return ordersList
      .filter((o) => o.studentId === student?.id || Number(o.studentRawId) === Number(student?.rawId))
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  }, [ordersList, student]);

  const [activeTab, setActiveTab] = useState('catalog'); // 'catalog' | 'orders'
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [purchasing, setPurchasing] = useState(false);
  const [cancellingOrderId, setCancellingOrderId] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Filtered products
  const filteredProducts = useMemo(() => {
    return productsList.filter((p) => {
      const matchSearch =
        !searchQuery.trim() ||
        (p.name && p.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (p.description && p.description.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchSearch;
    });
  }, [productsList, searchQuery]);

  const handleOpenRedeem = (product) => {
    setErrorMsg('');
    setSuccessMsg('');
    setSelectedProduct(product);
  };

  const handleCloseModal = () => {
    if (purchasing) return;
    setSelectedProduct(null);
    setErrorMsg('');
    setSuccessMsg('');
  };

  const handleConfirmPurchase = async () => {
    if (!selectedProduct || !student) return;
    setPurchasing(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const res = await purchaseProduct(student.id, selectedProduct.id);
      if (res && res.success) {
        setSuccessMsg(res.message || 'Reward redeemed successfully! Your request is pending review.');
        try {
          confetti({
            particleCount: 50,
            spread: 60,
            origin: { y: 0.6 },
            colors: ['#F2A807', '#10B981', '#3B82F6'],
          });
        } catch (_) {}

        setTimeout(() => {
          setSelectedProduct(null);
          setPurchasing(false);
          setActiveTab('orders');
        }, 1100);
      } else {
        setErrorMsg(res?.error || 'Could not complete redemption.');
        setPurchasing(false);
      }
    } catch (err) {
      setErrorMsg(err?.message || 'Something went wrong. Please try again.');
      setPurchasing(false);
    }
  };

  const handleCancelOrder = async (orderId) => {
    if (!window.confirm('Cancel this pending reward request? Your coins will be refunded immediately.')) {
      return;
    }
    setCancellingOrderId(orderId);
    try {
      // cancelOrder already shows the success / error toast.
      await cancelOrder(orderId, true);
    } catch (err) {
      if (triggerToast) {
        triggerToast('Error', err?.message || 'Failed to cancel request.', 'danger');
      }
    } finally {
      setCancellingOrderId(null);
    }
  };

  const pendingOrdersCount = studentOrders.filter((o) => o.status === 'pending').length;

  const renderProductIcon = (iconName) => {
    switch ((iconName || '').toLowerCase()) {
      case 'sparkles':
        return <Sparkles className="w-8 h-8 text-[#ca8a04]" />;
      case 'bookopen':
      case 'book':
        return <BookOpen className="w-8 h-8 text-[#ca8a04]" />;
      case 'award':
        return <Award className="w-8 h-8 text-[#ca8a04]" />;
      case 'trophy':
        return <Trophy className="w-8 h-8 text-[#ca8a04]" />;
      case 'star':
        return <Star className="w-8 h-8 text-[#ca8a04]" />;
      case 'clock':
        return <Clock className="w-8 h-8 text-[#ca8a04]" />;
      default:
        return <Gift className="w-8 h-8 text-[#ca8a04]" />;
    }
  };

  return (
    <div style={{ marginTop: '8px' }}>
      {/* COINS BALANCE & STORE NAV */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '16px',
          background: '#ffffff',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          padding: '16px 20px',
          marginBottom: '20px',
          boxShadow: '0 1px 4px rgba(0,0,0,0.03)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div
            style={{
              width: '46px',
              height: '46px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, rgba(242, 168, 7, 0.2), rgba(242, 168, 7, 0.08))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ca8a04',
              boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.8)',
            }}
          >
            <Coins className="w-6 h-6 text-amber-500" />
          </div>
          <div>
            <div style={{ fontSize: '11px', fontWeight: '800', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
              Your Coin Balance
            </div>
            <div style={{ fontSize: '24px', fontWeight: '900', color: '#ca8a04', lineHeight: 1.1 }}>
              {studentCoins} <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--navy)' }}>Coins</span>
            </div>
          </div>
        </div>

        {/* SUB-TABS */}
        <div className="tabs" style={{ margin: 0 }}>
          <button
            type="button"
            className={`tab-btn ${activeTab === 'catalog' ? 'active' : ''}`}
            onClick={() => setActiveTab('catalog')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <ShoppingBag className="w-4 h-4" />
            Browse Rewards ({productsList.length})
          </button>
          <button
            type="button"
            className={`tab-btn ${activeTab === 'orders' ? 'active' : ''}`}
            onClick={() => setActiveTab('orders')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <Clock className="w-4 h-4" />
            My Requests
            {pendingOrdersCount > 0 && (
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: '800',
                  padding: '1px 6px',
                  borderRadius: '999px',
                  background: activeTab === 'orders' ? '#ffffff' : '#EF4444',
                  color: activeTab === 'orders' ? '#EF4444' : '#ffffff',
                }}
              >
                {pendingOrdersCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: REWARDS CATALOG                                                    */}
      {/* ========================================================================= */}
      {activeTab === 'catalog' && (
        <div>
          {/* SEARCH & CATEGORY FILTERS */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '12px',
              marginBottom: '18px',
            }}
          >
            {/* Search Bar */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: '#ffffff',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                padding: '6px 12px',
                width: '100%',
                maxWidth: '260px',
              }}
            >
              <Search className="w-4 h-4 text-slate-400 shrink-0" />
              <input
                type="text"
                placeholder="Search rewards..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  border: 'none',
                  outline: 'none',
                  fontSize: '12.5px',
                  width: '100%',
                  background: 'transparent',
                }}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 0 }}
                >
                  ×
                </button>
              )}
            </div>
          </div>

          {filteredProducts.length === 0 ? (
            <div className="empty-state" style={{ borderRadius: '12px', border: '1px solid var(--border)' }}>
              <div className="empty-icon">
                <Gift className="w-6 h-6" />
              </div>
              <div className="empty-title">No Rewards Found</div>
              <div className="empty-desc">
                {searchQuery
                  ? 'Try a different search.'
                  : 'Check back soon! New rewards will be added by your teachers.'}
              </div>
              {searchQuery && (
                <button
                  type="button"
                  className="empty-action"
                  onClick={() => {
                    setSearchQuery('');
                  }}
                >
                  Clear Search
                </button>
              )}
            </div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                gap: '18px',
              }}
            >
              {filteredProducts.map((product) => {
                const canAfford = studentCoins >= product.priceCoins;
                const isOutOfStock = product.stock <= 0;
                const isLowStock = !isOutOfStock && product.stock <= 3;

                return (
                  <div key={product.id} className="reward-card" style={{ display: 'flex', flexDirection: 'column' }}>
                    {/* PRODUCT IMAGE OR ICON */}
                    <div className="reward-card-media">
                      <SafeImage
                        src={product.imageUrl}
                        alt={product.name}
                        fallback={(
                        <div
                          style={{
                            width: '56px',
                            height: '56px',
                            borderRadius: '12px',
                            background: 'rgba(242, 168, 7, 0.12)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          {renderProductIcon(product.icon)}
                        </div>
                        )}
                      />

                      {/* STOCK BADGE */}
                      <span
                        className={`reward-card-badge ${
                          isOutOfStock
                            ? 'out-of-stock'
                            : isLowStock
                            ? 'low-stock'
                            : 'in-stock'
                        }`}
                      >
                        {isOutOfStock
                          ? 'Sold out'
                          : isLowStock
                          ? `Only ${product.stock} left`
                          : `${product.stock} available`}
                      </span>
                    </div>

                    {/* DETAILS */}
                    <div className="reward-card-body" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '4px' }}>
                        <h3 className="reward-card-title" style={{ margin: 0 }}>{product.name}</h3>
                        {product.category && (
                          <span
                            style={{
                              fontSize: '10px',
                              fontWeight: '700',
                              color: 'var(--muted)',
                              textTransform: 'uppercase',
                              letterSpacing: '0.5px',
                            }}
                          >
                            {product.category}
                          </span>
                        )}
                      </div>

                      {product.description ? (
                        <p className="reward-card-desc" style={{ flex: 1 }}>{product.description}</p>
                      ) : (
                        <p className="reward-card-desc" style={{ fontStyle: 'italic', opacity: 0.6, flex: 1 }}>
                          Official classroom reward
                        </p>
                      )}

                      {/* PRICE & REDEEM BUTTON */}
                      <div className="reward-card-footer" style={{ marginTop: 'auto' }}>
                        <div className="reward-price-pill">
                          <Coins className="w-4 h-4 text-[#F2A807]" />
                          <span>{product.priceCoins}</span>
                          <span className="sub">coins</span>
                        </div>

                        {isOutOfStock ? (
                          <button
                            type="button"
                            disabled
                            className="reward-action-btn"
                          >
                            Sold Out
                          </button>
                        ) : !canAfford ? (
                          <button
                            type="button"
                            disabled
                            className="reward-action-btn need-coins"
                            title={`Need ${product.priceCoins - studentCoins} more coins to redeem`}
                          >
                            Need {product.priceCoins - studentCoins} more
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleOpenRedeem(product)}
                            className="reward-action-btn"
                          >
                            Redeem
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: MY REQUESTS / REDEMPTION ORDERS                                    */}
      {/* ========================================================================= */}
      {activeTab === 'orders' && (
        <div className="table-card">
          {studentOrders.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">
                <Package className="w-6 h-6" />
              </div>
              <div className="empty-title">No Requests Yet</div>
              <div className="empty-desc">
                When you redeem rewards from the store, you can track your request status here.
              </div>
              <button
                type="button"
                className="empty-action"
                onClick={() => setActiveTab('catalog')}
              >
                Browse Rewards
              </button>
            </div>
          ) : (
            <div>
              <div
                className="rt-head"
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1.8fr 90px 110px 140px 100px',
                  padding: '12px 16px',
                  background: '#f9f9fb',
                  borderBottom: '1px solid var(--border)',
                  fontSize: '11px',
                  fontWeight: '800',
                  color: 'var(--muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}
              >
                <div>Reward Item</div>
                <div>Coins</div>
                <div>Date</div>
                <div>Status</div>
                <div style={{ textAlign: 'right' }}>Action</div>
              </div>

              {studentOrders.map((order) => {
                const status = order.status || 'pending';
                const isCancelling = cancellingOrderId === order.id;

                return (
                  <div
                    key={order.id}
                    className="rt-row"
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1.8fr 90px 110px 140px 100px',
                      padding: '14px 16px',
                      borderBottom: '1px solid var(--border)',
                      alignItems: 'center',
                      fontSize: '13px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <SafeImage
                        src={order.productImage}
                        alt=""
                        style={{ width: '36px', height: '36px', borderRadius: '8px', objectFit: 'cover', flexShrink: 0 }}
                      />
                    <div>
                      <div style={{ fontWeight: '800', color: 'var(--navy)' }}>
                        {order.productName || 'Reward'}
                      </div>
                      {order.notes && (
                        <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>
                          Note: {order.notes}
                        </div>
                      )}
                      {status === 'rejected' && order.rejectionReason && (
                        <div style={{ fontSize: '11px', color: '#b91c1c', marginTop: '2px', fontWeight: '600' }}>
                          Reason: {order.rejectionReason}
                        </div>
                      )}
                    </div>
                    </div>

                    <div style={{ fontWeight: '800', color: '#ca8a04', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Coins className="w-3.5 h-3.5" />
                      {order.costCoins ?? order.pricePaid ?? order.coinsCost ?? 0}
                    </div>

                    <div style={{ color: 'var(--muted)', fontSize: '12px' }}>
                      {order.createdAt ? new Date(order.createdAt).toLocaleDateString() : 'Recent'}
                    </div>

                    <div>
                      {status === 'pending' && (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontSize: '11px',
                            fontWeight: '800',
                            padding: '3px 8px',
                            borderRadius: '999px',
                            background: 'rgba(242,168,7,0.12)',
                            color: '#b45309',
                            border: '1px solid rgba(242,168,7,0.3)',
                          }}
                        >
                          <Clock className="w-3 h-3" />
                          Pending Review
                        </span>
                      )}

                      {status === 'approved' && (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontSize: '11px',
                            fontWeight: '800',
                            padding: '3px 8px',
                            borderRadius: '999px',
                            background: 'rgba(59,130,246,0.1)',
                            color: '#1d4ed8',
                            border: '1px solid rgba(59,130,246,0.25)',
                          }}
                          title="Approved! See your teacher to collect"
                        >
                          <CheckCircle2 className="w-3 h-3" />
                          Approved
                        </span>
                      )}

                      {status === 'delivered' && (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontSize: '11px',
                            fontWeight: '800',
                            padding: '3px 8px',
                            borderRadius: '999px',
                            background: 'rgba(34,197,94,0.1)',
                            color: '#15803d',
                            border: '1px solid rgba(34,197,94,0.25)',
                          }}
                        >
                          <Truck className="w-3 h-3" />
                          Delivered
                        </span>
                      )}

                      {status === 'rejected' && (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontSize: '11px',
                            fontWeight: '800',
                            padding: '3px 8px',
                            borderRadius: '999px',
                            background: 'rgba(239,68,68,0.1)',
                            color: '#b91c1c',
                            border: '1px solid rgba(239,68,68,0.25)',
                          }}
                          title="Your coins were refunded back to your balance"
                        >
                          <XCircle className="w-3 h-3" />
                          Refunded
                        </span>
                      )}
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      {status === 'pending' ? (
                        <button
                          type="button"
                          onClick={() => handleCancelOrder(order.id)}
                          disabled={isCancelling}
                          style={{
                            padding: '4px 10px',
                            fontSize: '11.5px',
                            fontWeight: '700',
                            borderRadius: '6px',
                            border: '1px solid #fecaca',
                            background: '#fff5f5',
                            color: '#b91c1c',
                            cursor: isCancelling ? 'wait' : 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            transition: 'all 0.15s ease',
                          }}
                          title="Cancel request and get coins back"
                        >
                          <Undo2 className="w-3 h-3" />
                          Cancel
                        </button>
                      ) : (
                        <span style={{ fontSize: '11px', color: '#94a3b8' }}>—</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* REDEEM CONFIRMATION MODAL                                                 */}
      {/* ========================================================================= */}
      <div className={`modal-overlay ${selectedProduct ? 'open' : ''}`}>
        {selectedProduct && (
          <div className="modal" style={{ maxWidth: '420px' }}>
            <h2 style={{ marginBottom: '14px' }}>Confirm Redemption</h2>

            <p style={{ fontSize: '13px', color: 'var(--muted)', margin: '0 0 16px 0', lineHeight: 1.5 }}>
              Are you sure you want to redeem <strong>{selectedProduct.name}</strong>?
            </p>

            <div
              style={{
                background: '#f9f9fb',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                padding: '14px',
                marginBottom: '18px',
                fontSize: '13px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ color: 'var(--muted)' }}>Current Coins:</span>
                <span style={{ fontWeight: '800', color: 'var(--navy)' }}>{studentCoins}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ color: 'var(--muted)' }}>Reward Cost:</span>
                <span style={{ fontWeight: '800', color: '#ca8a04' }}>- {selectedProduct.priceCoins}</span>
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  paddingTop: '8px',
                  borderTop: '1px solid var(--border)',
                  fontWeight: '800',
                }}
              >
                <span>Remaining Balance:</span>
                <span style={{ color: 'var(--navy)' }}>
                  {studentCoins - selectedProduct.priceCoins} Coins
                </span>
              </div>
            </div>

            {errorMsg && (
              <div
                style={{
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  color: '#b91c1c',
                  padding: '10px 12px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  marginBottom: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {successMsg && (
              <div
                style={{
                  background: '#f0fdf4',
                  border: '1px solid #bbf7d0',
                  color: '#15803d',
                  padding: '10px 12px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  marginBottom: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                <span>{successMsg}</span>
              </div>
            )}

            <div className="modal-footer" style={{ marginTop: '10px' }}>
              <button
                type="button"
                className="btn-cancel"
                onClick={handleCloseModal}
                disabled={purchasing}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-confirm"
                onClick={handleConfirmPurchase}
                disabled={purchasing || Boolean(successMsg)}
              >
                {purchasing ? 'Redeeming...' : 'Confirm'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
