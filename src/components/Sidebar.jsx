import {
  MessageSquare,
  Package,
  LayoutDashboard,
  Settings,
  Bell,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Menu,
  X,
} from 'lucide-react'
import { useState } from 'react'
import { auth } from '../firebase'
import { signOut } from 'firebase/auth'
import { NavLink } from 'react-router-dom'

const navItems = [
  { id: 'chat', path: '/chat', label: 'Live Chat', icon: MessageSquare, badge: true },
  { id: 'orders', path: '/orders', label: 'Orders', icon: Package },
]

export default function Sidebar({ unreadCount = 0 }) {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <>
      {/* Mobile Toggle Button */}
      <button
        onClick={() => setMobileOpen(true)}
        className="md:hidden fixed top-4 left-4 z-40 p-2 bg-surface-800 rounded-lg border border-white/10 text-white shadow-lg"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Mobile Overlay */}
      {mobileOpen && (
        <div 
          className="md:hidden fixed inset-0 bg-black/50 z-40 backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={`
          flex flex-col h-full border-r border-white/[0.06] bg-[#0d1117] shrink-0
          transition-all duration-300 ease-in-out z-50
          absolute md:relative
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
          ${collapsed ? 'w-[72px]' : 'w-[240px]'}
        `}
      >
        {/* Brand */}
      <div className={`flex items-center gap-3 px-4 h-16 border-b border-white/[0.06] shrink-0 ${collapsed ? 'justify-center' : ''}`}>
        <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-white p-0.5 shrink-0 border border-white/[0.08]">
          <img src="/logo.png" alt="Andes Laundry Logo" className="w-full h-full object-contain rounded-lg" />
        </div>
        {!collapsed && (
          <div className="animate-slide-in overflow-hidden">
            <h1 className="text-[13px] font-bold text-white tracking-tight leading-tight">Andes Laundry</h1>
            <p className="text-[10px] font-semibold text-brand-400/80 tracking-widest uppercase">Command Center</p>
          </div>
        )}
      </div>

      {/* Collapse toggle (Desktop only) */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="hidden md:flex absolute -right-3 top-[52px] z-50 items-center justify-center w-6 h-6 rounded-full bg-surface-800 border border-white/10 text-surface-400 hover:text-white hover:bg-surface-700 transition-all cursor-pointer shadow-lg"
      >
        {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
      </button>

      {/* Close toggle (Mobile only) */}
      <button
        onClick={() => setMobileOpen(false)}
        className="md:hidden absolute -right-3 top-[52px] z-50 flex items-center justify-center w-6 h-6 rounded-full bg-surface-800 border border-white/10 text-surface-400 hover:text-white hover:bg-surface-700 transition-all cursor-pointer shadow-lg"
      >
        <X className="w-3 h-3" />
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
            return (
              <NavLink
                key={item.id}
                to={item.path}
                title={collapsed ? item.label : ''}
                className={({ isActive }) => `
                  flex items-center gap-3 w-full rounded-xl text-[13px] font-medium
                  transition-all duration-200 cursor-pointer group relative
                  ${collapsed ? 'justify-center px-0 py-3' : 'px-3 py-2.5'}
                  ${isActive
                    ? 'bg-brand-600/15 text-brand-400'
                    : 'text-surface-400 hover:bg-white/[0.04] hover:text-surface-200'
                  }
                `}
              >
                {({ isActive }) => (
                  <>
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
                  </>
                )}
              </NavLink>
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

        <button 
          onClick={() => signOut(auth)}
          className={`
          flex items-center gap-3 w-full rounded-xl text-[13px] font-medium text-surface-400
          hover:bg-danger/10 hover:text-danger transition-all cursor-pointer mt-1
          ${collapsed ? 'justify-center px-0 py-3' : 'px-3 py-2.5'}
        `}>
          <div className="flex items-center justify-center w-8 h-8 rounded-lg text-inherit">
            <LogOut className="w-[18px] h-[18px]" />
          </div>
          {!collapsed && <span className="animate-slide-in">Sign Out</span>}
        </button>

        <div className={`
          mt-3 pt-3 border-t border-white/[0.06]
          ${collapsed ? 'flex justify-center' : ''}
        `}>
          <div className={`flex items-center gap-3 ${collapsed ? '' : 'px-3 py-2'}`}>
            <div className="relative shrink-0">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-brand-500 text-white text-[11px] font-bold">
                {auth.currentUser?.email?.[0]?.toUpperCase() || 'A'}
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-success border-2 border-[#0d1117]" />
            </div>
            {!collapsed && (
              <div className="animate-slide-in overflow-hidden">
                <p className="text-[12px] font-semibold text-surface-200 truncate">{auth.currentUser?.email?.split('@')[0] || 'Admin'}</p>
                <p className="text-[10px] text-success font-medium">Online</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </aside>
    </>
  )
}
