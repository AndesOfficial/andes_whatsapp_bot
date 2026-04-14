import { useState, useEffect } from 'react'
import { db } from '../firebase'
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  doc,
  updateDoc,
} from 'firebase/firestore'
import {
  Package,
  Search,
  Clock,
  Truck,
  CheckCircle2,
  ChevronDown,
  TrendingUp,
  MapPin,
  CalendarClock,
  X,
  Sparkles,
} from 'lucide-react'

const STATUS_CONFIG = {
  PENDING: {
    label: 'Pending',
    color: 'text-amber-400',
    bg: 'bg-amber-400/10',
    border: 'border-amber-400/20',
    icon: Clock,
    selectBg: 'bg-amber-500/15',
  },
  'PICKED UP': {
    label: 'Picked Up',
    color: 'text-blue-400',
    bg: 'bg-blue-400/10',
    border: 'border-blue-400/20',
    icon: Truck,
    selectBg: 'bg-blue-500/15',
  },
  DELIVERED: {
    label: 'Delivered',
    color: 'text-emerald-400',
    bg: 'bg-emerald-400/10',
    border: 'border-emerald-400/20',
    icon: CheckCircle2,
    selectBg: 'bg-emerald-500/15',
  },
}

const SERVICE_LABELS = {
  dry_clean: { label: 'Dry Clean', emoji: '👔' },
  wash_iron: { label: 'Wash & Iron', emoji: '👕' },
  wash_fold: { label: 'Wash & Fold', emoji: '🧺' },
}

const PICKUP_LABELS = {
  today_evening: 'Today Evening',
  today_morning: 'Today Morning',
  tomorrow_morning: 'Tomorrow Morning',
  tomorrow_evening: 'Tomorrow Evening',
}

export default function Orders() {
  const [orders, setOrders] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [updatingId, setUpdatingId] = useState(null)

  useEffect(() => {
    const q = query(collection(db, 'orders'), orderBy('created_at', 'desc'))
    const unsub = onSnapshot(q, (snapshot) => {
      setOrders(
        snapshot.docs.map((docSnap) => ({ _docId: docSnap.id, ...docSnap.data() }))
      )
    }, (error) => {
      console.error('Orders listener error:', error)
    })
    return () => unsub()
  }, [])

  const handleStatusChange = async (docId, newStatus) => {
    setUpdatingId(docId)
    try {
      await updateDoc(doc(db, 'orders', docId), { status: newStatus })
    } catch (err) {
      console.error('Failed to update status:', err)
    } finally {
      setTimeout(() => setUpdatingId(null), 800)
    }
  }

  const filteredOrders = orders.filter((o) => {
    const matchesSearch =
      (o.order_id || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (o.phone || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (o.service || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (o.address || '').toLowerCase().includes(searchQuery.toLowerCase())
    const matchesStatus = statusFilter === 'ALL' || o.status === statusFilter
    return matchesSearch && matchesStatus
  })

  const formatDateTime = (timestamp) => {
    if (!timestamp) return '—'
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
    return date.toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const stats = {
    total: orders.length,
    pending: orders.filter((o) => o.status === 'PENDING').length,
    pickedUp: orders.filter((o) => o.status === 'PICKED UP').length,
    delivered: orders.filter((o) => o.status === 'DELIVERED').length,
  }

  const STAT_CARDS = [
    {
      label: 'Total Orders',
      value: stats.total,
      icon: Package,
      gradient: 'from-violet-500/20 to-purple-600/10',
      iconBg: 'bg-violet-500/20',
      iconColor: 'text-violet-400',
      valueColor: 'text-violet-300',
      glow: 'stat-glow-purple',
      borderColor: 'border-violet-500/15',
    },
    {
      label: 'Pending',
      value: stats.pending,
      icon: Clock,
      gradient: 'from-amber-500/20 to-orange-600/10',
      iconBg: 'bg-amber-500/20',
      iconColor: 'text-amber-400',
      valueColor: 'text-amber-300',
      glow: 'stat-glow-amber',
      borderColor: 'border-amber-500/15',
    },
    {
      label: 'Picked Up',
      value: stats.pickedUp,
      icon: Truck,
      gradient: 'from-blue-500/20 to-cyan-600/10',
      iconBg: 'bg-blue-500/20',
      iconColor: 'text-blue-400',
      valueColor: 'text-blue-300',
      glow: 'stat-glow-blue',
      borderColor: 'border-blue-500/15',
    },
    {
      label: 'Delivered',
      value: stats.delivered,
      icon: CheckCircle2,
      gradient: 'from-emerald-500/20 to-green-600/10',
      iconBg: 'bg-emerald-500/20',
      iconColor: 'text-emerald-400',
      valueColor: 'text-emerald-300',
      glow: 'stat-glow-green',
      borderColor: 'border-emerald-500/15',
    },
  ]

  return (
    <div className="flex flex-col h-full bg-[#0a0e1a]">
      {/* ─── Header ─── */}
      <div className="px-6 pt-5 pb-4 border-b border-white/[0.06] bg-[#0d1117]/60 shrink-0">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">Order Management</h2>
            <p className="text-[12px] text-surface-400 mt-0.5">Track and manage all laundry orders in real-time</p>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-whatsapp/8 border border-whatsapp/15">
            <span className="w-1.5 h-1.5 rounded-full bg-whatsapp animate-pulse-dot" />
            <span className="text-[11px] text-whatsapp font-medium">Live sync</span>
          </div>
        </div>

        {/* ─── Stats Cards ─── */}
        <div className="grid grid-cols-4 gap-3 mb-5">
          {STAT_CARDS.map((stat) => (
            <div
              key={stat.label}
              className={`
                relative flex items-center gap-3.5 px-4 py-3.5 rounded-xl
                bg-gradient-to-br ${stat.gradient}
                border ${stat.borderColor}
                ${stat.glow}
                transition-all duration-300 hover:scale-[1.02] group
              `}
            >
              <div className={`flex items-center justify-center w-10 h-10 rounded-xl ${stat.iconBg} transition-transform group-hover:scale-110`}>
                <stat.icon className={`w-5 h-5 ${stat.iconColor}`} />
              </div>
              <div>
                <p className={`text-2xl font-bold ${stat.valueColor} tabular-nums`}>{stat.value}</p>
                <p className="text-[10px] font-semibold text-surface-400 uppercase tracking-widest">{stat.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ─── Controls ─── */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-surface-500" />
            <input
              id="order-search"
              type="text"
              placeholder="Search orders, phone, service..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-8 py-2 rounded-lg bg-white/[0.05] border border-white/[0.08] text-[13px] text-surface-200 placeholder:text-surface-500 focus:outline-none focus:ring-1 focus:ring-brand-500/40 focus:border-brand-500/30 transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-500 hover:text-surface-300 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-white/[0.04] border border-white/[0.06]">
            {['ALL', 'PENDING', 'PICKED UP', 'DELIVERED'].map((status) => {
              const cfg = STATUS_CONFIG[status]
              const isActive = statusFilter === status
              return (
                <button
                  key={status}
                  id={`filter-${status.replace(' ', '-').toLowerCase()}`}
                  onClick={() => setStatusFilter(status)}
                  className={`
                    flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-semibold transition-all duration-200 cursor-pointer
                    ${isActive
                      ? status === 'ALL'
                        ? 'bg-brand-600/20 text-brand-400'
                        : `${cfg.bg} ${cfg.color}`
                      : 'text-surface-400 hover:text-surface-200 hover:bg-white/[0.04]'
                    }
                  `}
                >
                  {status === 'ALL' ? (
                    'All'
                  ) : (
                    <>
                      <cfg.icon className="w-3 h-3" />
                      {cfg.label}
                    </>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* ─── Table ─── */}
      <div className="flex-1 overflow-auto px-6 py-4">
        {filteredOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full">
            <div className="relative mb-6">
              <div className="absolute inset-0 rounded-full bg-brand-500/10 blur-2xl scale-[2]" />
              <div className="relative flex items-center justify-center w-16 h-16 rounded-2xl bg-white/[0.04] border border-white/[0.06]">
                <Package className="w-7 h-7 text-surface-500/50" />
              </div>
            </div>
            <p className="text-[14px] font-semibold text-surface-300">No orders found</p>
            <p className="text-[12px] text-surface-500 mt-1">Try adjusting your search or filter criteria</p>
          </div>
        ) : (
          <div className="rounded-xl border border-white/[0.06] overflow-hidden">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="bg-white/[0.03]">
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-surface-500">Order ID</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-surface-500">Phone</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-surface-500">Service</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-surface-500">Address</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-surface-500">Pickup</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-surface-500">Created</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-surface-500">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map((order, idx) => {
                  const statusCfg = STATUS_CONFIG[order.status] || STATUS_CONFIG.PENDING
                  const StatusIcon = statusCfg.icon
                  const isUpdating = updatingId === order._docId
                  const serviceCfg = SERVICE_LABELS[order.service] || { label: order.service, emoji: '🧺' }
                  const pickupLabel = PICKUP_LABELS[order.pickup] || order.pickup

                  return (
                    <tr
                      key={order._docId}
                      className={`
                        border-t border-white/[0.04] transition-all duration-200
                        hover:bg-white/[0.02] group
                        ${isUpdating ? 'bg-brand-600/5' : ''}
                      `}
                      style={{ animationDelay: `${idx * 30}ms` }}
                    >
                      {/* Order ID */}
                      <td className="px-4 py-3.5">
                        <span className="font-mono text-[12px] font-bold text-brand-400 bg-brand-500/10 px-2 py-0.5 rounded-md border border-brand-500/15">
                          {order.order_id || '—'}
                        </span>
                      </td>

                      {/* Phone */}
                      <td className="px-4 py-3.5">
                        <span className="text-surface-200 font-medium">{order.phone || '—'}</span>
                      </td>

                      {/* Service */}
                      <td className="px-4 py-3.5">
                        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/[0.05] text-surface-300 text-[12px] font-medium border border-white/[0.06]">
                          <span>{serviceCfg.emoji}</span>
                          {serviceCfg.label}
                        </span>
                      </td>

                      {/* Address */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1.5 text-surface-300 max-w-[180px]">
                          <MapPin className="w-3 h-3 text-surface-500 shrink-0" />
                          <span className="truncate capitalize">{order.address || '—'}</span>
                        </div>
                      </td>

                      {/* Pickup */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1.5 text-surface-300">
                          <CalendarClock className="w-3 h-3 text-surface-500 shrink-0" />
                          <span className="text-[12px]">{pickupLabel || '—'}</span>
                        </div>
                      </td>

                      {/* Created */}
                      <td className="px-4 py-3.5">
                        <span className="text-surface-400 text-[12px] tabular-nums">{formatDateTime(order.created_at)}</span>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3.5">
                        <div className="relative inline-block">
                          <select
                            id={`status-${order._docId}`}
                            value={order.status}
                            onChange={(e) => handleStatusChange(order._docId, e.target.value)}
                            className={`
                              appearance-none pl-3 pr-7 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer
                              border transition-all duration-300
                              ${statusCfg.bg} ${statusCfg.color} ${statusCfg.border}
                              focus:outline-none focus:ring-1 focus:ring-brand-500/20
                              ${isUpdating ? 'animate-pulse scale-105' : ''}
                            `}
                          >
                            <option value="PENDING" className="bg-surface-900 text-surface-200">⏳ Pending</option>
                            <option value="PICKED UP" className="bg-surface-900 text-surface-200">🚚 Picked Up</option>
                            <option value="DELIVERED" className="bg-surface-900 text-surface-200">✅ Delivered</option>
                          </select>
                          <ChevronDown className={`absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 ${statusCfg.color} pointer-events-none`} />
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
