import { useState, useEffect } from 'react'
import { db, botDb } from '../firebase'
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  updateDoc,
  deleteDoc,
  limit,
} from 'firebase/firestore'
import {
  Package,
  Search,
  Clock,
  Truck,
  CheckCircle2,
  X,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { cn } from '../utils/cn'
import StatCard from '../components/Orders/StatCard'
import OrderTable from '../components/Orders/OrderTable'

const STATUS_CONFIG = {
  PENDING: {
    label: 'Pending',
    color: 'text-amber-400',
    bg: 'bg-amber-400/10',
    border: 'border-amber-400/20',
    icon: Clock,
  },
  'PICKED UP': {
    label: 'Picked Up',
    color: 'text-blue-400',
    bg: 'bg-blue-400/10',
    border: 'border-blue-400/20',
    icon: Truck,
  },
  DELIVERED: {
    label: 'Delivered',
    color: 'text-emerald-400',
    bg: 'bg-emerald-400/10',
    border: 'border-emerald-400/20',
    icon: CheckCircle2,
  },
}

export default function Orders() {
  const [orders, setOrders] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [updatingId, setUpdatingId] = useState(null)
  const [limitCount, setLimitCount] = useState(50)

  useEffect(() => {
    const q = query(collection(botDb, 'orders'), orderBy('createdAt', 'desc'), limit(limitCount))
    const unsub = onSnapshot(q, (snapshot) => {
      setOrders(
        snapshot.docs.map((docSnap) => ({ _docId: docSnap.id, ...docSnap.data() }))
      )
    }, (error) => {
      console.error('Orders listener error:', error)
      toast.error('Failed to load orders')
    })
    return () => unsub()
  }, [limitCount])

  const handleStatusChange = async (docId, newStatus) => {
    setUpdatingId(docId)
    try {
      const orderRef = doc(botDb, 'orders', docId)
      await updateDoc(orderRef, { status: newStatus })
      toast.success('Status updated')
    } catch (err) {
      console.error('Failed to update status:', err)
      toast.error('Failed to update order status')
    } finally {
      setTimeout(() => setUpdatingId(null), 800)
    }
  }

  const handleDeleteOrder = async (docId) => {
    if (!window.confirm('Are you sure you want to delete this order?')) return
    try {
      await deleteDoc(doc(botDb, 'orders', docId))
      toast.success('Order deleted')
    } catch (err) {
      console.error('Failed to delete order:', err)
      toast.error('Failed to delete order')
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
            <StatCard key={stat.label} stat={stat} />
          ))}
        </div>

        {/* ─── Controls ─── */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-surface-500" />
            <input
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
                  onClick={() => setStatusFilter(status)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-semibold transition-all duration-200 cursor-pointer",
                    isActive
                      ? status === 'ALL'
                        ? 'bg-brand-600/20 text-brand-400'
                        : `${cfg.bg} ${cfg.color}`
                      : 'text-surface-400 hover:text-surface-200 hover:bg-white/[0.04]'
                  )}
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

      <div className="flex-1 overflow-auto px-6 py-4">
        <OrderTable
          filteredOrders={filteredOrders}
          handleStatusChange={handleStatusChange}
          updatingId={updatingId}
          handleDeleteOrder={handleDeleteOrder}
          onLoadMore={() => setLimitCount(prev => prev + 50)}
          hasMore={orders.length === limitCount} // Simple heuristic: if we got exactly the limit, there might be more
        />
      </div>
    </div>
  )
}
