import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  Coins,
  Package,
  Plus,
  Pencil,
  Trash2,
  CheckCircle2,
  XCircle,
  Truck,
  Clock,
  Upload,
  Gift,
  AlertCircle,
} from 'lucide-react';

export const StoreManagement = () => {
  const {
    state,
    addProduct,
    updateProduct,
    deleteProduct,
    updateOrderStatus,
    deleteOrder,
  } = useApp();

  const productsList = state?.products || [];
  const ordersList = state?.orders || [];
  const studentsList = state?.students || [];
  const classroomsList = state?.classrooms || [];

  // Helper lookups
  const studentMap = new Map(studentsList.map((s) => [s.id, s]));
  const classMap = new Map(classroomsList.map((c) => [c.id, c]));

  // Active subtab: 'requests' | 'catalog'
  const [activeTab, setActiveTab] = useState('requests');
  const [requestFilter, setRequestFilter] = useState('pending'); // 'all' | 'pending' | 'completed'

  // Modal states for Product Add / Edit & Delete Confirmation
  const [showProductModal, setShowProductModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [productToDelete, setProductToDelete] = useState(null);
  const [deletingProductId, setDeletingProductId] = useState(null);
  const [productForm, setProductForm] = useState({
    name: '',
    description: '',
    priceCoins: 50,
    stock: 10,
    imageUrl: '',
  });
  const [imageFile, setImageFile] = useState(null);
  const [savingProduct, setSavingProduct] = useState(false);
  const [productModalError, setProductModalError] = useState('');

  // Processing action state
  const [processingOrderId, setProcessingOrderId] = useState(null);
  const [actionFeedback, setActionFeedback] = useState(null);

  // Quick feedback auto-dismiss
  const showFeedback = (text, isError = false) => {
    setActionFeedback({ text, isError });
    setTimeout(() => setActionFeedback(null), 3000);
  };

  // Filtered orders
  const pendingOrders = ordersList.filter((o) => o.status === 'pending');
  const filteredOrders = ordersList.filter((o) => {
    if (requestFilter === 'pending') return o.status === 'pending';
    if (requestFilter === 'completed') return o.status === 'delivered' || o.status === 'approved' || o.status === 'rejected';
    return true;
  });

  // Handle Order Status Changes - removes request upon completion (accept/approve or reject)
  const handleUpdateStatus = async (orderId, newStatus) => {
    setProcessingOrderId(orderId);
    try {
      // Pass remove: true so request is immediately removed once action completes
      const res = await updateOrderStatus(orderId, newStatus, '', { remove: true });
      if (res && res.success) {
        if (newStatus === 'rejected') {
          showFeedback('Request rejected. Coins were refunded to the student and request removed.');
        } else if (newStatus === 'approved' || newStatus === 'completed' || newStatus === 'delivered') {
          showFeedback('Request approved and removed.');
        } else {
          showFeedback('Request action completed and removed.');
        }
      } else {
        showFeedback(res?.error || 'Failed to update request.', true);
      }
    } catch (err) {
      showFeedback(err?.message || 'Error updating status', true);
    } finally {
      setProcessingOrderId(null);
    }
  };

  // Direct removal of any request
  const handleRemoveOrder = async (orderId) => {
    setProcessingOrderId(orderId);
    try {
      const res = await deleteOrder(orderId);
      if (res && res.success) {
        showFeedback('Request removed.');
      } else {
        showFeedback(res?.error || 'Failed to remove request.', true);
      }
    } catch (err) {
      showFeedback(err?.message || 'Error removing request', true);
    } finally {
      setProcessingOrderId(null);
    }
  };

  // Open Add Product Modal
  const handleOpenAddProduct = () => {
    setEditingProduct(null);
    setProductForm({
      name: '',
      description: '',
      priceCoins: 30,
      stock: 10,
      imageUrl: '',
    });
    setImageFile(null);
    setProductModalError('');
    setShowProductModal(true);
  };

  // Open Edit Product Modal
  const handleOpenEditProduct = (product) => {
    setEditingProduct(product);
    setProductForm({
      name: product.name || '',
      description: product.description || '',
      priceCoins: product.priceCoins || 10,
      stock: product.stock ?? 0,
      imageUrl: product.imageUrl || '',
    });
    setImageFile(null);
    setProductModalError('');
    setShowProductModal(true);
  };

  // Save Product (Add or Edit)
  const handleSaveProduct = async (e) => {
    e.preventDefault();
    if (!productForm.name.trim()) {
      setProductModalError('Please provide a reward name.');
      return;
    }
    if (Number(productForm.priceCoins) <= 0) {
      setProductModalError('Price must be at least 1 coin.');
      return;
    }

    setSavingProduct(true);
    setProductModalError('');

    try {
      const payload = {
        name: productForm.name.trim(),
        description: productForm.description.trim(),
        priceCoins: Number(productForm.priceCoins),
        stock: Math.max(0, Number(productForm.stock) || 0),
        imageUrl: productForm.imageUrl.trim(),
        isAvailable: true,
      };

      let res;
      if (editingProduct) {
        res = await updateProduct(editingProduct.id, payload, imageFile);
      } else {
        res = await addProduct(payload, imageFile);
      }

      if (res && res.success) {
        setShowProductModal(false);
        showFeedback(editingProduct ? 'Reward updated successfully.' : 'New reward added to store.');
      } else {
        setProductModalError(res?.error || 'Could not save reward.');
      }
    } catch (err) {
      setProductModalError(err?.message || 'Failed to save.');
    } finally {
      setSavingProduct(false);
    }
  };

  // Delete Product - triggered from modal confirmation
  const handleConfirmDeleteProduct = async () => {
    if (!productToDelete) return;
    setDeletingProductId(productToDelete.id);
    try {
      const res = await deleteProduct(productToDelete.id);
      if (res && res.success) {
        showFeedback(`"${productToDelete.name}" was removed from the store.`);
        setProductToDelete(null);
      } else {
        showFeedback(res?.error || 'Could not remove reward.', true);
      }
    } catch (err) {
      showFeedback(err?.message || 'Error deleting reward', true);
    } finally {
      setDeletingProductId(null);
    }
  };

  return (
    <div style={{ marginTop: '4px' }}>
      {/* HEADER BAR */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '16px',
          marginBottom: '20px',
        }}
      >
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: '900', color: 'var(--navy)', margin: '0 0 4px 0' }}>
            Rewards Store
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--muted)', margin: 0 }}>
            Manage student redemption requests and reward inventory.
          </p>
        </div>

        <button
          type="button"
          className="add-btn"
          onClick={handleOpenAddProduct}
          style={{ gap: '6px' }}
        >
          <Plus className="w-4 h-4" />
          Add Reward
        </button>
      </div>

      {/* GLOBAL TOAST FEEDBACK */}
      {actionFeedback && (
        <div
          style={{
            background: actionFeedback.isError ? '#fef2f2' : '#f0fdf4',
            border: actionFeedback.isError ? '1px solid #fecaca' : '1px solid #bbf7d0',
            color: actionFeedback.isError ? '#b91c1c' : '#15803d',
            padding: '10px 16px',
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: '700',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          {actionFeedback.isError ? (
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          )}
          <span>{actionFeedback.text}</span>
        </div>
      )}

      {/* TOP TABS */}
      <div className="tabs" style={{ marginBottom: '18px' }}>
        <button
          type="button"
          className={`tab-btn ${activeTab === 'requests' ? 'active' : ''}`}
          onClick={() => setActiveTab('requests')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
        >
          <Clock className="w-4 h-4" />
          Student Requests
          {pendingOrders.length > 0 && (
            <span
              style={{
                fontSize: '10px',
                fontWeight: '800',
                padding: '2px 7px',
                borderRadius: '999px',
                background: activeTab === 'requests' ? '#ffffff' : '#EF4444',
                color: activeTab === 'requests' ? '#EF4444' : '#ffffff',
              }}
            >
              {pendingOrders.length}
            </span>
          )}
        </button>

        <button
          type="button"
          className={`tab-btn ${activeTab === 'catalog' ? 'active' : ''}`}
          onClick={() => setActiveTab('catalog')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
        >
          <Package className="w-4 h-4" />
          Catalog Items ({productsList.length})
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: STUDENT REDEMPTION REQUESTS                                        */}
      {/* ========================================================================= */}
      {activeTab === 'requests' && (
        <div>
          {/* REQUESTS BAR */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: '13px', fontWeight: '800', color: 'var(--navy)' }}>
              Active Student Requests ({ordersList.length})
            </div>
            <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
              Approving or rejecting a request fulfills the action and removes it from the queue.
            </div>
          </div>

          <div className="table-card">
            {filteredOrders.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">
                  <Package className="w-6 h-6" />
                </div>
                <div className="empty-title">No Requests Found</div>
                <div className="empty-desc">
                  {requestFilter === 'pending'
                    ? 'There are currently no pending redemption requests.'
                    : 'No requests match the selected filter.'}
                </div>
              </div>
            ) : (
              <div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1.4fr 1.3fr 90px 100px 120px 160px',
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
                  <div>Student</div>
                  <div>Reward</div>
                  <div>Coins</div>
                  <div>Date</div>
                  <div>Status</div>
                  <div style={{ textAlign: 'right' }}>Actions</div>
                </div>

                {filteredOrders.map((order) => {
                  const student = studentMap.get(order.studentId);
                  const classroom = student?.classroomId ? classMap.get(student.classroomId) : null;
                  const status = order.status || 'pending';
                  const isProcessing = processingOrderId === order.id;

                  return (
                    <div
                      key={order.id}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1.4fr 1.3fr 90px 100px 120px 160px',
                        padding: '12px 16px',
                        borderBottom: '1px solid var(--border)',
                        alignItems: 'center',
                        fontSize: '13px',
                      }}
                    >
                      {/* STUDENT INFO */}
                      <div>
                        <div style={{ fontWeight: '800', color: 'var(--navy)' }}>
                          {student?.user?.firstName || order.studentName || 'Student'}{' '}
                          {student?.user?.lastName || ''}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
                          {classroom?.name || 'Classroom'}
                        </div>
                      </div>

                      {/* PRODUCT */}
                      <div>
                        <div style={{ fontWeight: '700', color: 'var(--navy)' }}>
                          {order.productName || 'Reward'}
                        </div>
                      </div>

                      {/* COINS */}
                      <div style={{ fontWeight: '800', color: '#ca8a04', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Coins className="w-3.5 h-3.5" />
                        {order.coinsCost || order.coinsSpent || 0}
                      </div>

                      {/* DATE */}
                      <div style={{ color: 'var(--muted)', fontSize: '12px' }}>
                        {order.createdAt ? new Date(order.createdAt).toLocaleDateString() : 'Recent'}
                      </div>

                      {/* STATUS BADGE */}
                      <div>
                        {status === 'pending' && (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontSize: '11px',
                              fontWeight: '800',
                              padding: '2px 7px',
                              borderRadius: '999px',
                              background: 'rgba(242,168,7,0.12)',
                              color: '#b45309',
                              border: '1px solid rgba(242,168,7,0.3)',
                            }}
                          >
                            <Clock className="w-3 h-3" /> Pending
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
                              padding: '2px 7px',
                              borderRadius: '999px',
                              background: 'rgba(59,130,246,0.1)',
                              color: '#1d4ed8',
                              border: '1px solid rgba(59,130,246,0.25)',
                            }}
                          >
                            <CheckCircle2 className="w-3 h-3" /> Approved
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
                              padding: '2px 7px',
                              borderRadius: '999px',
                              background: 'rgba(34,197,94,0.1)',
                              color: '#15803d',
                              border: '1px solid rgba(34,197,94,0.25)',
                            }}
                          >
                            <Truck className="w-3 h-3" /> Delivered
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
                              padding: '2px 7px',
                              borderRadius: '999px',
                              background: 'rgba(239,68,68,0.1)',
                              color: '#b91c1c',
                              border: '1px solid rgba(239,68,68,0.25)',
                            }}
                          >
                            <XCircle className="w-3 h-3" /> Refunded
                          </span>
                        )}
                      </div>

                      {/* ACTIONS: Approve or Reject (both fulfill the action and remove the request) */}
                      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '8px' }}>
                        <button
                          type="button"
                          id={`approve-order-${order.id}`}
                          onClick={() => handleUpdateStatus(order.id, 'approved')}
                          disabled={isProcessing}
                          style={{
                            padding: '6px 14px',
                            borderRadius: '6px',
                            border: '1px solid #bbf7d0',
                            background: '#f0fdf4',
                            color: '#15803d',
                            fontSize: '12px',
                            fontWeight: '800',
                            cursor: isProcessing ? 'wait' : 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            transition: 'all 0.15s ease',
                          }}
                          title="Approve request and remove from list"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          Approve
                        </button>
                        <button
                          type="button"
                          id={`reject-order-${order.id}`}
                          onClick={() => handleUpdateStatus(order.id, 'rejected')}
                          disabled={isProcessing}
                          style={{
                            padding: '6px 14px',
                            borderRadius: '6px',
                            border: '1px solid #fecaca',
                            background: '#fef2f2',
                            color: '#b91c1c',
                            fontSize: '12px',
                            fontWeight: '800',
                            cursor: isProcessing ? 'wait' : 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            transition: 'all 0.15s ease',
                          }}
                          title="Reject request, refund coins to student, and remove from list"
                        >
                          <XCircle className="w-4 h-4" />
                          Reject
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: REWARD CATALOG MANAGEMENT                                          */}
      {/* ========================================================================= */}
      {activeTab === 'catalog' && (
        <div>
          {productsList.length === 0 ? (
            <div className="empty-state" style={{ borderRadius: '12px', border: '1px solid var(--border)' }}>
              <div className="empty-icon">
                <Gift className="w-6 h-6" />
              </div>
              <div className="empty-title">No Rewards in Catalog</div>
              <div className="empty-desc">Create your first reward for students to redeem with their coins.</div>
              <button type="button" className="empty-action" onClick={handleOpenAddProduct}>
                <Plus className="w-4 h-4" /> Add Reward
              </button>
            </div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                gap: '16px',
              }}
            >
              {productsList.map((product) => {
                const isOutOfStock = product.stock <= 0;
                const isLowStock = !isOutOfStock && product.stock <= 3;

                return (
                  <div key={product.id} className="reward-card">
                    {/* PREVIEW IMAGE / THUMBNAIL */}
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
                          ? '0 in stock'
                          : `${product.stock} in stock`}
                      </span>
                    </div>

                    {/* INFO */}
                    <div className="reward-card-body">
                      <h3 className="reward-card-title">{product.name}</h3>

                      {product.description ? (
                        <p className="reward-card-desc">{product.description}</p>
                      ) : (
                        <p className="reward-card-desc" style={{ fontStyle: 'italic', opacity: 0.6 }}>
                          No description provided
                        </p>
                      )}

                      {/* PRICE & ACTIONS */}
                      <div className="reward-card-footer">
                        <div className="reward-price-pill">
                          <Coins className="w-4 h-4 text-[#F2A807]" />
                          <span>{product.priceCoins}</span>
                          <span className="sub">coins</span>
                        </div>

                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button
                            type="button"
                            id={`edit-product-${product.id}`}
                            onClick={() => handleOpenEditProduct(product)}
                            style={{
                              padding: '6px 9px',
                              border: '1px solid var(--border)',
                              borderRadius: '8px',
                              background: '#ffffff',
                              color: 'var(--navy)',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              transition: 'all 0.15s ease',
                            }}
                            title="Edit reward"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            id={`delete-product-${product.id}`}
                            onClick={() => setProductToDelete(product)}
                            style={{
                              padding: '6px 9px',
                              border: '1px solid #fecaca',
                              borderRadius: '8px',
                              background: '#fef2f2',
                              color: '#dc2626',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              transition: 'all 0.15s ease',
                            }}
                            title="Remove reward"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
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
      {/* ADD / EDIT REWARD MODAL                                                   */}
      {/* ========================================================================= */}
      <div className={`modal-overlay ${showProductModal ? 'open' : ''}`}>
        {showProductModal && (
          <div className="modal" style={{ maxWidth: '440px' }}>
            <h2>{editingProduct ? 'Edit Reward' : 'Add New Reward'}</h2>

            {productModalError && (
              <div
                style={{
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  color: '#b91c1c',
                  padding: '9px 12px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  marginBottom: '14px',
                }}
              >
                {productModalError}
              </div>
            )}

            <form onSubmit={handleSaveProduct}>
              <div className="field">
                <label>Reward Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 3D Printed Keyring, Micro:bit Starter Kit"
                  value={productForm.name}
                  onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="field">
                  <label>Cost in Coins</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={productForm.priceCoins}
                    onChange={(e) => setProductForm({ ...productForm, priceCoins: e.target.value })}
                  />
                </div>

                <div className="field">
                  <label>Stock Quantity</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={productForm.stock}
                    onChange={(e) => setProductForm({ ...productForm, stock: e.target.value })}
                  />
                </div>
              </div>

              <div className="field">
                <label>Description (Optional)</label>
                <input
                  type="text"
                  placeholder="Brief details about this reward"
                  value={productForm.description}
                  onChange={(e) => setProductForm({ ...productForm, description: e.target.value })}
                />
              </div>

              <div className="field">
                <label>Image (Upload or URL)</label>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '6px' }}>
                  <label
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '8px 12px',
                      border: '1px solid var(--border)',
                      borderRadius: '6px',
                      background: '#f9f9fb',
                      fontSize: '12px',
                      fontWeight: '700',
                      cursor: 'pointer',
                      margin: 0,
                    }}
                  >
                    <Upload className="w-3.5 h-3.5" />
                    Upload File
                    <input
                      type="file"
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) setImageFile(file);
                      }}
                    />
                  </label>
                  {imageFile && (
                    <span style={{ fontSize: '11px', color: 'var(--muted)', alignSelf: 'center' }}>
                      {imageFile.name}
                    </span>
                  )}
                </div>

                <input
                  type="url"
                  placeholder="Or paste image URL (https://...)"
                  value={productForm.imageUrl}
                  onChange={(e) => setProductForm({ ...productForm, imageUrl: e.target.value })}
                />
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn-cancel"
                  onClick={() => setShowProductModal(false)}
                  disabled={savingProduct}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-confirm"
                  disabled={savingProduct}
                >
                  {savingProduct ? 'Saving...' : editingProduct ? 'Save Changes' : 'Create Reward'}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* REMOVE REWARD CONFIRMATION MODAL                                          */}
      {/* ========================================================================= */}
      <div className={`modal-overlay ${productToDelete ? 'open' : ''}`}>
        {productToDelete && (
          <div className="modal" style={{ maxWidth: '420px' }}>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#dc2626' }}>
              <Trash2 className="w-5 h-5 text-red-600" /> Remove Reward
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--muted)', margin: '12px 0 20px 0', lineHeight: 1.6 }}>
              Are you sure you want to remove <strong>{productToDelete.name}</strong> from the store catalog?
              This item will be permanently removed and students will no longer see it.
            </p>
            <div className="modal-footer">
              <button
                type="button"
                className="btn-cancel"
                onClick={() => setProductToDelete(null)}
                disabled={Boolean(deletingProductId)}
              >
                Cancel
              </button>
              <button
                type="button"
                id="confirm-remove-product-btn"
                className="btn-confirm danger"
                onClick={handleConfirmDeleteProduct}
                disabled={Boolean(deletingProductId)}
                style={{
                  background: '#dc2626',
                  color: '#ffffff',
                  border: 'none',
                }}
              >
                {deletingProductId ? 'Removing...' : 'Remove Reward'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
