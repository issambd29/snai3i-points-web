import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { useGuard } from '../utils/useGuard';
import { SafeImage } from './SafeImage';
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
  Search,
  Sparkles,
  BookOpen,
  Award,
  Trophy,
  Star,
  Check,
  Eye,
  EyeOff,
  Inbox,
  Filter,
} from 'lucide-react';

const CATEGORIES = ['Stationery', 'Privilege', 'Leadership', 'Activity', 'Merchandise', 'Digital', 'General'];
const ICON_OPTIONS = [
  { label: 'Gift', icon: Gift },
  { label: 'Sparkles', icon: Sparkles },
  { label: 'BookOpen', icon: BookOpen },
  { label: 'Award', icon: Award },
  { label: 'Trophy', icon: Trophy },
  { label: 'Star', icon: Star },
  { label: 'Clock', icon: Clock },
];

export const StoreManagement = () => {
  const {
    state,
    addProduct,
    updateProduct,
    deleteProduct,
    updateOrderStatus,
    deleteOrder,
    triggerToast,
  } = useApp();

  const productsList = state?.products || [];
  const ordersList = state?.orders || [];
  const studentsList = state?.students || [];
  const classroomsList = state?.classrooms || [];

  // Helper lookups
  const studentMap = useMemo(() => new Map(studentsList.map((s) => [s.id, s])), [studentsList]);
  const classMap = useMemo(() => new Map(classroomsList.map((c) => [c.id, c])), [classroomsList]);

  // Active subtab: 'requests' | 'catalog'
  const [activeTab, setActiveTab] = useState('requests');
  const [requestFilter, setRequestFilter] = useState('pending'); // 'all' | 'pending' | 'approved' | 'delivered' | 'rejected'
  const [requestSearch, setRequestSearch] = useState('');
  const [catalogSearch, setCatalogSearch] = useState('');
  const [guard] = useGuard();

  // Modal states for Product Add / Edit & Delete Confirmation
  const [showProductModal, setShowProductModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [productToDelete, setProductToDelete] = useState(null);
  const [deletingProductId, setDeletingProductId] = useState(null);
  const [productForm, setProductForm] = useState({
    name: '',
    description: '',
    category: 'General',
    priceCoins: 5,
    stock: 10,
    icon: 'Gift',
    imageUrl: '',
    isAvailable: true,
  });
  const [imageFile, setImageFile] = useState(null);
  const [savingProduct, setSavingProduct] = useState(false);
  const [productModalError, setProductModalError] = useState('');

  // Reject order modal state
  const [orderToReject, setOrderToReject] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [processingOrderId, setProcessingOrderId] = useState(null);

  // Summary Metrics
  const metrics = useMemo(() => {
    const totalOrders = ordersList.length;
    const pendingCount = ordersList.filter((o) => o.status === 'pending').length;
    const approvedCount = ordersList.filter((o) => o.status === 'approved').length;
    const deliveredCount = ordersList.filter((o) => o.status === 'delivered' || o.status === 'completed').length;
    const totalCoinsRedeemed = ordersList
      .filter((o) => o.status !== 'rejected')
      .reduce((sum, o) => sum + (Number(o.costCoins || o.pricePaid) || 0), 0);

    return { totalOrders, pendingCount, approvedCount, deliveredCount, totalCoinsRedeemed };
  }, [ordersList]);

  // Filtered orders
  const filteredOrders = useMemo(() => {
    return ordersList.filter((o) => {
      const status = o.status || 'pending';
      const matchFilter =
        requestFilter === 'all' ||
        (requestFilter === 'pending' && status === 'pending') ||
        (requestFilter === 'approved' && status === 'approved') ||
        (requestFilter === 'delivered' && (status === 'delivered' || status === 'completed')) ||
        (requestFilter === 'rejected' && status === 'rejected');

      const q = requestSearch.trim().toLowerCase();
      const matchSearch =
        !q ||
        (o.studentName && o.studentName.toLowerCase().includes(q)) ||
        (o.productName && o.productName.toLowerCase().includes(q)) ||
        (o.studentEmail && o.studentEmail.toLowerCase().includes(q));

      return matchFilter && matchSearch;
    });
  }, [ordersList, requestFilter, requestSearch]);

  // Filtered products
  const filteredProducts = useMemo(() => {
    return productsList.filter((p) => {
      const q = catalogSearch.trim().toLowerCase();
      const matchSearch =
        !q ||
        (p.name && p.name.toLowerCase().includes(q)) ||
        (p.description && p.description.toLowerCase().includes(q));
      return matchSearch;
    });
  }, [productsList, catalogSearch]);

  // Handle Order Status Changes
  const handleUpdateStatus = async (orderId, newStatus, reason = '') => {
    setProcessingOrderId(orderId);
    try {
      await updateOrderStatus(orderId, newStatus, reason, { remove: false });
    } catch (err) {
      if (triggerToast) {
        triggerToast('Action Failed', err?.message || 'Could not update request status', 'danger');
      }
    } finally {
      setProcessingOrderId(null);
      setOrderToReject(null);
      setRejectReason('');
    }
  };

  // Direct permanent removal of a request record
  const handleRemoveOrder = async (orderId) => {
    if (!window.confirm('Permanently remove this order record from history?')) return;
    setProcessingOrderId(orderId);
    try {
      await deleteOrder(orderId, false);
    } catch (err) {
      if (triggerToast) {
        triggerToast('Error', err?.message || 'Failed to remove request', 'danger');
      }
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
      category: 'Stationery',
      priceCoins: 5,
      stock: 15,
      icon: 'Gift',
      imageUrl: '',
      isAvailable: true,
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
      category: product.category || 'General',
      priceCoins: product.priceCoins || 5,
      stock: product.stock ?? 10,
      icon: product.icon || 'Gift',
      imageUrl: product.imageUrl || '',
      isAvailable: product.isAvailable !== false,
    });
    setImageFile(null);
    setProductModalError('');
    setShowProductModal(true);
  };

  // Toggle Availability
  const handleToggleAvailability = guard(async (product) => {
    const updated = !product.isAvailable;
    try {
      const res = await updateProduct(product.id, { isAvailable: updated });
      if (res?.success) triggerToast(updated ? 'Reward Visible' : 'Reward Hidden', `"${product.name}" is now ${updated ? 'visible to students' : 'hidden from students'}.`);
      else triggerToast('Error', res?.error || 'Failed to update reward', 'danger');
    } catch (err) {
      if (triggerToast) {
        triggerToast('Error', err?.message || 'Failed to update reward', 'danger');
      }
    }
  });

  // Save Product (Add or Edit)
  const handleSaveProduct = async (e) => {
    e.preventDefault();
    if (savingProduct) return;
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
        category: productForm.category || 'General',
        priceCoins: Number(productForm.priceCoins),
        stock: Math.max(0, Number(productForm.stock) || 0),
        icon: productForm.icon || 'Gift',
        imageUrl: productForm.imageUrl.trim(),
        isAvailable: Boolean(productForm.isAvailable),
      };

      let res;
      if (editingProduct) {
        res = await updateProduct(editingProduct.id, payload, imageFile);
      } else {
        res = await addProduct(payload, imageFile);
      }

      if (res && res.success) {
        setShowProductModal(false);
        triggerToast(editingProduct ? 'Reward Updated' : 'Reward Added', `"${payload.name}" saved.`);
      } else {
        setProductModalError(res?.error || 'Could not save reward.');
      }
    } catch (err) {
      setProductModalError(err?.message || 'Failed to save.');
    } finally {
      setSavingProduct(false);
    }
  };

  // Delete Product Confirmation
  const handleConfirmDeleteProduct = async () => {
    if (!productToDelete || deletingProductId) return;
    setDeletingProductId(productToDelete.id);
    const name = productToDelete.name;
    try {
      const res = await deleteProduct(productToDelete.id);
      setProductToDelete(null);
      if (res?.success) triggerToast(res.action === 'deactivated' ? 'Reward Hidden' : 'Reward Deleted', res.message || `"${name}" removed.`, res.action === 'deactivated' ? 'info' : 'success');
      else triggerToast('Error', res?.error || 'Failed to delete reward', 'danger');
    } catch (err) {
      if (triggerToast) {
        triggerToast('Error', err?.message || 'Failed to delete reward', 'danger');
      }
    } finally {
      setDeletingProductId(null);
    }
  };

  const renderProductIcon = (iconName) => {
    switch ((iconName || '').toLowerCase()) {
      case 'sparkles':
        return <Sparkles className="w-5 h-5 text-amber-500" />;
      case 'bookopen':
      case 'book':
        return <BookOpen className="w-5 h-5 text-amber-500" />;
      case 'award':
        return <Award className="w-5 h-5 text-amber-500" />;
      case 'trophy':
        return <Trophy className="w-5 h-5 text-amber-500" />;
      case 'star':
        return <Star className="w-5 h-5 text-amber-500" />;
      case 'clock':
        return <Clock className="w-5 h-5 text-amber-500" />;
      default:
        return <Gift className="w-5 h-5 text-amber-500" />;
    }
  };

  return (
    <div style={{ marginTop: '4px' }}>
      {/* HEADER & TOP STATS */}
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
            Rewards Store & Fulfillment
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--muted)', margin: 0 }}>
            Review student redemptions, manage rewards catalog, and dispense items.
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

      {/* METRIC CARDS */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '14px',
          marginBottom: '22px',
        }}
      >
        <div className="stat-card" style={{ padding: '14px 18px' }}>
          <div style={{ fontSize: '11px', fontWeight: '800', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Pending Requests
          </div>
          <div style={{ fontSize: '24px', fontWeight: '900', color: metrics.pendingCount > 0 ? '#d97706' : 'var(--navy)', marginTop: '4px' }}>
            {metrics.pendingCount}
          </div>
        </div>

        <div className="stat-card" style={{ padding: '14px 18px' }}>
          <div style={{ fontSize: '11px', fontWeight: '800', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Approved (Ready)
          </div>
          <div style={{ fontSize: '24px', fontWeight: '900', color: '#2563eb', marginTop: '4px' }}>
            {metrics.approvedCount}
          </div>
        </div>

        <div className="stat-card" style={{ padding: '14px 18px' }}>
          <div style={{ fontSize: '11px', fontWeight: '800', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Delivered
          </div>
          <div style={{ fontSize: '24px', fontWeight: '900', color: '#16a34a', marginTop: '4px' }}>
            {metrics.deliveredCount}
          </div>
        </div>

        <div className="stat-card" style={{ padding: '14px 18px' }}>
          <div style={{ fontSize: '11px', fontWeight: '800', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Active Rewards
          </div>
          <div style={{ fontSize: '24px', fontWeight: '900', color: 'var(--navy)', marginTop: '4px' }}>
            {productsList.filter((p) => p.isAvailable !== false).length}
          </div>
        </div>
      </div>

      {/* TOP TABS */}
      <div className="tabs" style={{ marginBottom: '18px' }}>
        <button
          type="button"
          className={`tab-btn ${activeTab === 'requests' ? 'active' : ''}`}
          onClick={() => setActiveTab('requests')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
        >
          <Inbox className="w-4 h-4" />
          Redemption Requests
          {metrics.pendingCount > 0 && (
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
              {metrics.pendingCount}
            </span>
          )}
        </button>

        <button
          type="button"
          className={`tab-btn ${activeTab === 'catalog' ? 'active' : ''}`}
          onClick={() => setActiveTab('catalog')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
        >
          <Gift className="w-4 h-4" />
          Catalog Inventory ({productsList.length})
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: REDEMPTION REQUESTS                                                */}
      {/* ========================================================================= */}
      {activeTab === 'requests' && (
        <div>
          {/* SEARCH & STATUS FILTER BAR */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '12px',
              marginBottom: '16px',
            }}
          >
            {/* Filter Pills */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
              {[
                { id: 'pending', label: 'Pending', count: metrics.pendingCount },
                { id: 'approved', label: 'Approved', count: metrics.approvedCount },
                { id: 'delivered', label: 'Delivered', count: metrics.deliveredCount },
                { id: 'rejected', label: 'Refunded', count: ordersList.filter((o) => o.status === 'rejected').length },
                { id: 'all', label: 'All Requests', count: ordersList.length },
              ].map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setRequestFilter(f.id)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '999px',
                    fontSize: '12px',
                    fontWeight: '700',
                    border: '1px solid',
                    borderColor: requestFilter === f.id ? 'var(--navy)' : 'var(--border)',
                    background: requestFilter === f.id ? 'var(--navy)' : '#ffffff',
                    color: requestFilter === f.id ? '#ffffff' : 'var(--navy)',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <span>{f.label}</span>
                  <span
                    style={{
                      fontSize: '10px',
                      padding: '1px 5px',
                      borderRadius: '999px',
                      background: requestFilter === f.id ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.06)',
                      color: requestFilter === f.id ? '#ffffff' : 'inherit',
                    }}
                  >
                    {f.count}
                  </span>
                </button>
              ))}
            </div>

            {/* Search Input */}
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
                placeholder="Search student or reward..."
                value={requestSearch}
                onChange={(e) => setRequestSearch(e.target.value)}
                style={{
                  border: 'none',
                  outline: 'none',
                  fontSize: '12.5px',
                  width: '100%',
                  background: 'transparent',
                }}
              />
              {requestSearch && (
                <button
                  type="button"
                  onClick={() => setRequestSearch('')}
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#94a3b8' }}
                >
                  ×
                </button>
              )}
            </div>
          </div>

          {/* ORDERS TABLE */}
          <div className="table-card">
            {filteredOrders.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">
                  <Package className="w-6 h-6" />
                </div>
                <div className="empty-title">
                  {requestFilter === 'pending'
                    ? 'No Pending Requests'
                    : 'No Requests Found'}
                </div>
                <div className="empty-desc">
                  {requestFilter === 'pending'
                    ? 'Great job! All student reward requests have been handled.'
                    : 'Try changing the status filter or search query.'}
                </div>
              </div>
            ) : (
              <div>
                <div
                  className="rt-head"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1.6fr 1.6fr 90px 110px 120px 170px',
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
                  <div>Reward Requested</div>
                  <div>Coins</div>
                  <div>Date</div>
                  <div>Status</div>
                  <div style={{ textAlign: 'right' }}>Actions</div>
                </div>

                {filteredOrders.map((order) => {
                  const status = order.status || 'pending';
                  const isProcessing = processingOrderId === order.id;

                  return (
                    <div
                      key={order.id}
                      className="rt-row"
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1.6fr 1.6fr 90px 110px 120px 170px',
                        padding: '14px 16px',
                        borderBottom: '1px solid var(--border)',
                        alignItems: 'center',
                        fontSize: '13px',
                      }}
                    >
                      {/* STUDENT INFO */}
                      <div>
                        <div style={{ fontWeight: '800', color: 'var(--navy)' }}>
                          {order.studentName || 'Student'}
                        </div>
                        <div style={{ fontSize: '11.5px', color: 'var(--muted)' }}>
                          {order.studentClass || 'Classroom'}
                        </div>
                      </div>

                      {/* REWARD INFO */}
                      <div>
                        <div style={{ fontWeight: '700', color: 'var(--navy)' }}>
                          {order.productName || 'Reward'}
                        </div>
                        {status === 'rejected' && order.rejectionReason && (
                          <div style={{ fontSize: '11px', color: '#b91c1c', marginTop: '2px' }}>
                            Reason: {order.rejectionReason}
                          </div>
                        )}
                      </div>

                      {/* COINS COST */}
                      <div style={{ fontWeight: '800', color: '#ca8a04', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Coins className="w-3.5 h-3.5" />
                        {order.costCoins ?? order.pricePaid ?? 0}
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
                              padding: '3px 8px',
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
                              padding: '3px 8px',
                              borderRadius: '999px',
                              background: 'rgba(59,130,246,0.1)',
                              color: '#1d4ed8',
                              border: '1px solid rgba(59,130,246,0.25)',
                            }}
                          >
                            <CheckCircle2 className="w-3 h-3" /> Approved
                          </span>
                        )}
                        {(status === 'delivered' || status === 'completed') && (
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
                              padding: '3px 8px',
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

                      {/* ACTIONS */}
                      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '6px' }}>
                        {status === 'pending' && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleUpdateStatus(order.id, 'approved')}
                              disabled={isProcessing}
                              style={{
                                padding: '5px 10px',
                                borderRadius: '6px',
                                border: '1px solid #bbf7d0',
                                background: '#f0fdf4',
                                color: '#15803d',
                                fontSize: '11.5px',
                                fontWeight: '800',
                                cursor: isProcessing ? 'wait' : 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                              }}
                              title="Approve request"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setOrderToReject(order);
                                setRejectReason('');
                              }}
                              disabled={isProcessing}
                              style={{
                                padding: '5px 10px',
                                borderRadius: '6px',
                                border: '1px solid #fecaca',
                                background: '#fef2f2',
                                color: '#b91c1c',
                                fontSize: '11.5px',
                                fontWeight: '800',
                                cursor: isProcessing ? 'wait' : 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                              }}
                              title="Reject request and refund coins"
                            >
                              <XCircle className="w-3.5 h-3.5" /> Reject
                            </button>
                          </>
                        )}

                        {status === 'approved' && (
                          <button
                            type="button"
                            onClick={() => handleUpdateStatus(order.id, 'delivered')}
                            disabled={isProcessing}
                            style={{
                              padding: '5px 10px',
                              borderRadius: '6px',
                              border: '1px solid #bbf7d0',
                              background: '#f0fdf4',
                              color: '#15803d',
                              fontSize: '11.5px',
                              fontWeight: '800',
                              cursor: isProcessing ? 'wait' : 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                            }}
                            title="Mark reward as delivered to student"
                          >
                            <Truck className="w-3.5 h-3.5" /> Mark Delivered
                          </button>
                        )}

                        {/* Subtle delete record button */}
                        <button
                          type="button"
                          onClick={() => handleRemoveOrder(order.id)}
                          disabled={isProcessing}
                          style={{
                            padding: '4px',
                            background: 'transparent',
                            border: 'none',
                            color: '#94a3b8',
                            cursor: 'pointer',
                            borderRadius: '4px',
                          }}
                          title="Delete record from history"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-slate-400 hover:text-red-500" />
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
          {/* SEARCH */}
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
                placeholder="Search catalog rewards..."
                value={catalogSearch}
                onChange={(e) => setCatalogSearch(e.target.value)}
                style={{
                  border: 'none',
                  outline: 'none',
                  fontSize: '12.5px',
                  width: '100%',
                  background: 'transparent',
                }}
              />
              {catalogSearch && (
                <button
                  type="button"
                  onClick={() => setCatalogSearch('')}
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#94a3b8' }}
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
              <div className="empty-desc">Create your first classroom reward.</div>
              <button type="button" className="empty-action" onClick={handleOpenAddProduct}>
                <Plus className="w-4 h-4" /> Add Reward
              </button>
            </div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: '18px',
              }}
            >
              {filteredProducts.map((product) => {
                const isOutOfStock = (product.stock || 0) <= 0;
                const isAvailable = product.isAvailable !== false;

                return (
                  <div
                    key={product.id}
                    className="reward-card"
                    style={{
                      opacity: isAvailable ? 1 : 0.65,
                      display: 'flex',
                      flexDirection: 'column',
                    }}
                  >
                    {/* MEDIA */}
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

                      <span
                        className={`reward-card-badge ${
                          !isAvailable ? 'out-of-stock' : isOutOfStock ? 'out-of-stock' : 'in-stock'
                        }`}
                      >
                        {!isAvailable ? 'Hidden / Inactive' : isOutOfStock ? 'Out of stock' : `${product.stock} in stock`}
                      </span>
                    </div>

                    {/* BODY */}
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
                          Classroom reward
                        </p>
                      )}

                      {/* FOOTER & ADMIN CONTROLS */}
                      <div
                        style={{
                          marginTop: 'auto',
                          paddingTop: '12px',
                          borderTop: '1px solid var(--border)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '8px',
                        }}
                      >
                        <div className="reward-price-pill">
                          <Coins className="w-4 h-4 text-[#F2A807]" />
                          <span>{product.priceCoins}</span>
                          <span className="sub">coins</span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {/* Toggle Active / Inactive */}
                          <button
                            type="button"
                            onClick={() => handleToggleAvailability(product)}
                            style={{
                              padding: '5px',
                              background: '#f8fafc',
                              border: '1px solid var(--border)',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              color: isAvailable ? '#15803d' : '#94a3b8',
                            }}
                            title={isAvailable ? 'Hide from students' : 'Make visible in store'}
                          >
                            {isAvailable ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                          </button>

                          {/* Edit */}
                          <button
                            type="button"
                            onClick={() => handleOpenEditProduct(product)}
                            style={{
                              padding: '5px',
                              background: '#f8fafc',
                              border: '1px solid var(--border)',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              color: 'var(--navy)',
                            }}
                            title="Edit reward"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>

                          {/* Delete */}
                          <button
                            type="button"
                            onClick={() => setProductToDelete(product)}
                            style={{
                              padding: '5px',
                              background: '#fff5f5',
                              border: '1px solid #fecaca',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              color: '#b91c1c',
                            }}
                            title="Delete reward"
                          >
                            <Trash2 className="w-4 h-4" />
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
      {/* MODAL: ADD / EDIT REWARD                                                  */}
      {/* ========================================================================= */}
      <div className={`modal-overlay ${showProductModal ? 'open' : ''}`}>
        <div className="modal" style={{ maxWidth: '500px' }}>
          <h2>{editingProduct ? 'Edit Reward' : 'Add New Reward'}</h2>
          <form onSubmit={handleSaveProduct}>
            <div className="field">
              <label>Reward Name</label>
              <input
                type="text"
                required
                placeholder="e.g. Homework Free Pass"
                value={productForm.name}
                onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
              />
            </div>

            <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="field">
                <label>Category</label>
                <select
                  value={productForm.category}
                  onChange={(e) => setProductForm({ ...productForm, category: e.target.value })}
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label>Icon Style</label>
                <select
                  value={productForm.icon}
                  onChange={(e) => setProductForm({ ...productForm, icon: e.target.value })}
                >
                  {ICON_OPTIONS.map((ico) => (
                    <option key={ico.label} value={ico.label}>
                      {ico.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="field">
              <label>Description (optional)</label>
              <textarea
                placeholder="Brief explanation of what the student receives upon redemption..."
                rows={2}
                value={productForm.description}
                onChange={(e) => setProductForm({ ...productForm, description: e.target.value })}
                style={{
                  width: '100%',
                  padding: '10px',
                  borderRadius: '6px',
                  border: '1px solid var(--border)',
                  fontFamily: 'inherit',
                  fontSize: '13px',
                }}
              />
            </div>

            <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="field">
                <label>Price (Coins)</label>
                <input
                  type="number"
                  min="1"
                  required
                  value={productForm.priceCoins}
                  onChange={(e) => setProductForm({ ...productForm, priceCoins: e.target.value })}
                />
              </div>

              <div className="field">
                <label>Inventory Stock</label>
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
              <label>Reward Image URL (optional)</label>
              <input
                type="text"
                placeholder="https://example.com/item.png"
                value={productForm.imageUrl}
                onChange={(e) => setProductForm({ ...productForm, imageUrl: e.target.value })}
              />
            </div>

            {(imageFile || productForm.imageUrl) && (
              <div className="field">
                <SafeImage
                  src={imageFile ? URL.createObjectURL(imageFile) : productForm.imageUrl}
                  alt="Preview"
                  style={{ maxHeight: '110px', borderRadius: '8px', border: '1px solid var(--border)' }}
                />
              </div>
            )}

            <div className="field">
              <label>Or Upload Custom Image</label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setImageFile(e.target.files?.[0] || null)}
                style={{ fontSize: '12px' }}
              />
            </div>

            {productModalError && (
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
                <span>{productModalError}</span>
              </div>
            )}

            <div className="modal-footer" style={{ marginTop: '16px' }}>
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
      </div>

      {/* ========================================================================= */}
      {/* MODAL: REJECT REQUEST & REFUND                                            */}
      {/* ========================================================================= */}
      <div className={`modal-overlay ${orderToReject ? 'open' : ''}`}>
        {orderToReject && (
          <div className="modal" style={{ maxWidth: '440px' }}>
            <h2 style={{ color: '#b91c1c', marginBottom: '8px' }}>Reject Request & Refund Coins</h2>
            <p style={{ fontSize: '13px', color: 'var(--muted)', margin: '0 0 16px 0', lineHeight: 1.5 }}>
              Rejecting request for <strong>{orderToReject.productName}</strong> by{' '}
              <strong>{orderToReject.studentName}</strong> will automatically refund{' '}
              <strong style={{ color: '#ca8a04' }}>{orderToReject.costCoins} coins</strong> to their balance and restore stock.
            </p>

            <div className="field">
              <label>Reason for Rejection (optional)</label>
              <input
                type="text"
                placeholder="e.g. Out of physical stock, contact teacher"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
              />
            </div>

            <div className="modal-footer" style={{ marginTop: '16px' }}>
              <button
                type="button"
                className="btn-cancel"
                onClick={() => setOrderToReject(null)}
                disabled={processingOrderId === orderToReject.id}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-confirm danger"
                onClick={() => handleUpdateStatus(orderToReject.id, 'rejected', rejectReason)}
                disabled={processingOrderId === orderToReject.id}
              >
                {processingOrderId === orderToReject.id ? 'Processing...' : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* MODAL: DELETE PRODUCT CONFIRMATION                                        */}
      {/* ========================================================================= */}
      <div className={`modal-overlay ${productToDelete ? 'open' : ''}`}>
        {productToDelete && (
          <div className="modal" style={{ maxWidth: '420px' }}>
            <h2 style={{ color: 'var(--destructive)', marginBottom: '8px' }}>Remove Reward</h2>
            <p style={{ fontSize: '13px', color: 'var(--muted)', margin: '0 0 16px 0', lineHeight: 1.5 }}>
              Are you sure you want to delete <strong>{productToDelete.name}</strong> from the store?
            </p>

            <div className="modal-footer">
              <button
                type="button"
                className="btn-cancel"
                onClick={() => setProductToDelete(null)}
                disabled={deletingProductId === productToDelete.id}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-confirm danger"
                onClick={handleConfirmDeleteProduct}
                disabled={deletingProductId === productToDelete.id}
              >
                {deletingProductId === productToDelete.id ? 'Removing...' : 'Delete'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
