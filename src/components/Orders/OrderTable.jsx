import { Package, MapPin, CalendarClock, ChevronDown, Trash2 } from 'lucide-react'
import { formatDateTime } from '../../utils/date'
import { cn } from '../../utils/cn'

const STATUS_CONFIG = {
  PENDING: {
    label: 'Pending',
    color: 'text-amber-400',
    bg: 'bg-amber-400/10',
    border: 'border-amber-400/20',
  },
  'PICKED UP': {
    label: 'Picked Up',
    color: 'text-blue-400',
    bg: 'bg-blue-400/10',
    border: 'border-blue-400/20',
  },
  DELIVERED: {
    label: 'Delivered',
    color: 'text-emerald-400',
    bg: 'bg-emerald-400/10',
    border: 'border-emerald-400/20',
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

export default function OrderTable({ filteredOrders, handleStatusChange, updatingId, handleDeleteOrder, onLoadMore, hasMore }) {
  if (filteredOrders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <div className="mb-4">
          <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-white/[0.04] border border-white/[0.06]">
            <Package className="w-6 h-6 text-surface-500" />
          </div>
        </div>
        <p className="text-[14px] font-semibold text-surface-300">No orders found</p>
        <p className="text-[12px] text-surface-500 mt-1">Try adjusting your search or filter criteria</p>
      </div>
    )
  }

  return (
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
            const isUpdating = updatingId === order._docId
            const serviceCfg = SERVICE_LABELS[order.service] || { label: order.service, emoji: '🧺' }
            const pickupLabel = PICKUP_LABELS[order.pickup] || order.pickup

            return (
              <tr
                key={order._docId}
                className={cn(
                  "border-t border-white/[0.04] transition-all duration-200 hover:bg-white/[0.02] group",
                  isUpdating && "bg-brand-600/5"
                )}
                style={{ animationDelay: `${idx * 30}ms` }}
              >
                {/* Order ID */}
                <td className="px-4 py-3.5">
                  <span className="font-mono text-[12px] font-bold text-brand-400 bg-brand-500/10 px-2 py-0.5 rounded-md border border-brand-500/15">
                    {order.order_id || '—'}
                  </span>
                </td>

                {/* Phone & Name */}
                <td className="px-4 py-3.5">
                  <div className="flex flex-col">
                    <span className="text-surface-200 font-medium">{order.userName || order.name || order.customerName || '—'}</span>
                    <span className="text-surface-500 text-[11px]">{order.userMobile || order.phone || '—'}</span>
                  </div>
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
                  <span className="text-surface-400 text-[12px] tabular-nums">{formatDateTime(order.createdAt)}</span>
                </td>

                {/* Status & Actions */}
                <td className="px-4 py-3.5">
                  <div className="flex items-center gap-2">
                    <div className="relative inline-block">
                      <select
                        value={order.status}
                        onChange={(e) => handleStatusChange(order._docId, e.target.value)}
                        className={cn(
                          "appearance-none pl-3 pr-7 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer border transition-all duration-300 focus:outline-none focus:ring-1 focus:ring-brand-500/20",
                          statusCfg.bg, statusCfg.color, statusCfg.border,
                          isUpdating && "animate-pulse scale-105"
                        )}
                      >
                        <option value="PENDING" className="bg-surface-900 text-surface-200">⏳ Pending</option>
                        <option value="PICKED UP" className="bg-surface-900 text-surface-200">🚚 Picked Up</option>
                        <option value="DELIVERED" className="bg-surface-900 text-surface-200">✅ Delivered</option>
                      </select>
                      <ChevronDown className={cn("absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 pointer-events-none", statusCfg.color)} />
                    </div>
                    
                    <button
                      onClick={() => handleDeleteOrder(order._docId)}
                      className="p-1.5 rounded-lg text-surface-500 hover:bg-danger/10 hover:text-danger transition-colors cursor-pointer"
                      title="Delete Order"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {hasMore && (
        <div className="flex justify-center p-6 border-t border-white/[0.06]">
          <button
            onClick={onLoadMore}
            className="px-6 py-2.5 rounded-xl bg-surface-800 text-[13px] font-semibold text-white hover:bg-surface-700 transition-all border border-white/[0.08]"
          >
            Load More Orders
          </button>
        </div>
      )}
    </div>
  )
}
