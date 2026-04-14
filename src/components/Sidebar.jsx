import {
  MessageSquare,
  Package,
  Mountain,
  LayoutDashboard,
  Settings,
  Bell,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { useState } from 'react'

const navItems = [
  { id: 'chat', label: 'Live Chat', icon: MessageSquare, badge: true },
  { id: 'orders', label: 'Orders', icon: Package },
]

export default function Sidebar({ activePage, setActivePage, unreadCount = 0 }) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <aside
      className={`
        flex flex-col h-full border-r border-white/[0.06] bg-[#0d1117] shrink-0
        transition-all duration-300 ease-in-out relative
        ${collapsed ? 'w-[72px]' : 'w-[240px]'}
      `}
    >
      {/* Brand */}
      <div className={`flex items-center gap-3 px-4 h-16 border-b border-white/[0.06] shrink-0 ${collapsed ? 'justify-center' : ''}`}>
        <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500 to-purple-600 shadow-lg shadow-brand-500/25 shrink-0">
          <Mountain className="w-4.5 h-4.5 text-white" />
        </div>
        {!collapsed && (
          <div className="animate-slide-in overflow-hidden">
            <h1 className="text-[13px] font-bold text-white tracking-tight leading-tight">Andes Laundry</h1>
            <p className="text-[10px] font-semibold text-brand-400/80 tracking-widest uppercase">Command Center</p>
          </div>
        )}
      </div>

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-[52px] z-50 flex items-center justify-center w-6 h-6 rounded-full bg-surface-800 border border-white/10 text-surface-400 hover:text-white hover:bg-surface-700 transition-all cursor-pointer shadow-lg"
      >
        {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
      </button>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-5">
        {!collapsed && (
          <p className="px-3 mb-3 text-[9px] font-bold tracking-[0.2em] uppercase text-surface-500/70">
            Menu
          </p>
        )}
        <div className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive = activePage === item.id
            return (
              <button
                key={item.id}
                id={`nav-${item.id}`}
                onClick={() => setActivePage(item.id)}
                title={collapsed ? item.label : ''}
                className={`
                  flex items-center gap-3 w-full rounded-xl text-[13px] font-medium
                  transition-all duration-200 cursor-pointer group relative
                  ${collapsed ? 'justify-center px-0 py-3' : 'px-3 py-2.5'}
                  ${isActive
                    ? 'bg-brand-600/15 text-brand-400'
                    : 'text-surface-400 hover:bg-white/[0.04] hover:text-surface-200'
                  }
                `}
              >
                {/* Active indicator bar */}
                {isActive && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-brand-500" />
                )}
                <div className={`
                  relative flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-200 shrink-0
                  ${isActive
                    ? 'bg-brand-500/20 text-brand-400'
                    : 'text-surface-500 group-hover:text-surface-300'
                  }
                `}>
                  <Icon className="w-[18px] h-[18px]" />
                  {/* Notification badge */}
                  {item.badge && unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-danger text-[9px] font-bold text-white">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </div>
                {!collapsed && (
                  <span className="animate-slide-in">{item.label}</span>
                )}
              </button>
            )
          })}
        </div>
      </nav>

      {/* Bottom section */}
      <div className="px-3 pb-4 space-y-1">
        {!collapsed && (
          <p className="px-3 mb-2 text-[9px] font-bold tracking-[0.2em] uppercase text-surface-500/70">
            Account
          </p>
        )}
        <button className={`
          flex items-center gap-3 w-full rounded-xl text-[13px] font-medium text-surface-400
          hover:bg-white/[0.04] hover:text-surface-200 transition-all cursor-pointer
          ${collapsed ? 'justify-center px-0 py-3' : 'px-3 py-2.5'}
        `}>
          <div className="flex items-center justify-center w-8 h-8 rounded-lg text-surface-500">
            <Settings className="w-[18px] h-[18px]" />
          </div>
          {!collapsed && <span className="animate-slide-in">Settings</span>}
        </button>

        <div className={`
          mt-3 pt-3 border-t border-white/[0.06]
          ${collapsed ? 'flex justify-center' : ''}
        `}>
          <div className={`flex items-center gap-3 ${collapsed ? '' : 'px-3 py-2'}`}>
            <div className="relative shrink-0">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-br from-brand-400 to-purple-500 text-white text-[11px] font-bold">
                A
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-success border-2 border-[#0d1117]" />
            </div>
            {!collapsed && (
              <div className="animate-slide-in overflow-hidden">
                <p className="text-[12px] font-semibold text-surface-200 truncate">Admin</p>
                <p className="text-[10px] text-success font-medium">Online</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </aside>
  )
}
