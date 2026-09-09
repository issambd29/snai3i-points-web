import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
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
} from 'lucide-react';

export const StudentStore = () => {
  const { state, currentUser, purchaseProduct } = useApp();

  const studentsList = state?.students || [];
  const productsList = (state?.products || []).filter((p) => p.isAvailable !== false);
  const ordersList = state?.orders || [];

  // Find active student
  const student =
    studentsList.find((s) => s.userId === currentUser?.id) || studentsList[0];
  const studentCoins = student?.coins || 0;

  // Student orders only
  const studentOrders = ordersList.filter(
    (o) => o.studentId === student?.id || Number(o.studentRawId) === Number(student?.rawId)
  );

  const [activeTab, setActiveTab] = useState('catalog'); // 'catalog' | 'orders'
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [purchasing, setPurchasing] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

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
        setTimeout(() => {
          setSelectedProduct(null);
          setPurchasing(false);
          setActiveTab('orders');
        }, 1200);
      } else {
        setErrorMsg(res?.error || 'Could not complete redemption.');
        setPurchasing(false);
      }
    } catch (err) {
      setErrorMsg(err?.message || 'Something went wrong. Please try again.');
      setPurchasing(false);
    }
  };

  const pendingOrdersCount = studentOrders.filter((o) => o.status === 'pending').length;

  return (
    <div style={{ marginTop: '8px' }}>
      {/* COINS BALANCE & NAV BAR */}
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
          marginBottom: '22px',
          boxShadow: '0 1px 4px rgba(0,0,0,0.03)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '10px',
              background: 'rgba(242, 168, 7, 0.12)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ca8a04',
            }}
          >
            <Coins className="w-6 h-6" />
          </div>
          <div>
            <div style={{ fontSize: '11px', fontWeight: '800', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
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
            Rewards ({productsList.length})
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
          {productsList.length === 0 ? (
            <div className="empty-state" style={{ borderRadius: '12px', border: '1px solid var(--border)' }}>
              <div className="empty-icon">
                <Gift className="w-6 h-6" />
              </div>
              <div className="empty-title">No Rewards Available</div>
              <div className="empty-desc">Check back soon! New rewards will be added by your teachers.</div>
            </div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
                gap: '18px',
              }}
            >
              {productsList.map((product) => {
                const canAfford = studentCoins >= product.priceCoins;
                const isOutOfStock = product.stock <= 0;
                const isLowStock = !isOutOfStock && product.stock <= 3;

                return (
                  <div key={product.id} className="reward-card">
                    {/* PRODUCT IMAGE OR ICON */}
                    <div className="reward-card-media">
                      {product.imageUrl ? (
                        <img
                          src={product.imageUrl}
                          alt={product.name}
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div
                          style={{
                            width: '56px',
                            height: '56px',
                            borderRadius: '12px',
                            background: 'rgba(242, 168, 7, 0.12)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#ca8a04',
                          }}
                        >
                          <Gift className="w-8 h-8" />
                        </div>
                      )}

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
                    <div className="reward-card-body">
                      <h3 className="reward-card-title">{product.name}</h3>

                      {product.description ? (
                        <p className="reward-card-desc">{product.description}</p>
                      ) : (
                        <p className="reward-card-desc" style={{ fontStyle: 'italic', opacity: 0.6 }}>
                          Official classroom reward
                        </p>
                      )}

                      {/* PRICE & REDEEM BUTTON */}
                      <div className="reward-card-footer">
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
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1.8fr 100px 120px 140px',
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
              </div>

              {studentOrders.map((order) => {
                const status = order.status || 'pending';
                return (
                  <div
                    key={order.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1.8fr 100px 120px 140px',
                      padding: '14px 16px',
                      borderBottom: '1px solid var(--border)',
                      alignItems: 'center',
                      fontSize: '13px',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: '800', color: 'var(--navy)' }}>
                        {order.productName || 'Reward'}
                      </div>
                      {order.notes && (
                        <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>
                          Note: {order.notes}
                        </div>
                      )}
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
                          title="Your coins were refunded back to your account"
                        >
                          <XCircle className="w-3 h-3" />
                          Refunded
                        </span>
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
