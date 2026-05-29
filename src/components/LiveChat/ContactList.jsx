import { useState } from 'react'
import { Search, X, MessageSquareText, Sparkles, Megaphone, CheckSquare, Square } from 'lucide-react'
import { formatPhoneDisplay } from '../../utils/phone'
import { formatDate } from '../../utils/date'
import { cn } from '../../utils/cn'

export default function ContactList({ 
  contacts, 
  selectedPhone, 
  setSelectedPhone, 
  isMobileHidden,
  isBroadcastMode,
  toggleBroadcastMode,
  broadcastRecipients,
  toggleRecipient
}) {
  const [searchQuery, setSearchQuery] = useState('')

  const filteredContacts = contacts.filter((c) =>
    c.phone.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className={cn(
      "flex flex-col w-full md:w-[320px] border-r border-white/[0.06] bg-[#0d1117] shrink-0",
      isMobileHidden ? "hidden md:flex" : "flex"
    )}>
      {/* Header */}
      <div className="px-4 h-16 flex items-center justify-between border-b border-white/[0.06] shrink-0">
        <div className="flex items-center gap-2">
          <h2 className="text-[15px] font-bold text-white">Chats</h2>
          <span className="flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full bg-brand-500/20 text-brand-400 text-[10px] font-bold">
            {contacts.length}
          </span>
        </div>
        <button
          onClick={toggleBroadcastMode}
          className={cn(
            "flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-semibold transition-all",
            isBroadcastMode ? "bg-brand-500 text-white" : "bg-white/[0.05] text-surface-400 hover:bg-white/[0.08]"
          )}
        >
          <Megaphone className="w-3.5 h-3.5" />
          Broadcast
        </button>
      </div>

      {/* Search */}
      <div className="px-3 py-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-surface-500" />
          <input
            type="text"
            placeholder="Search by phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-lg bg-white/[0.05] border border-white/[0.08] text-[13px] text-surface-200 placeholder:text-surface-500 focus:outline-none focus:ring-1 focus:ring-brand-500/40 focus:border-brand-500/30 transition-all"
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
      </div>

      {/* Contact List */}
      <div className="flex-1 overflow-y-auto">
        {filteredContacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-surface-500 px-8">
            <MessageSquareText className="w-8 h-8 mb-2 opacity-30" />
            <p className="text-xs text-center">No conversations</p>
          </div>
        ) : (
          filteredContacts.map((contact, i) => {
            const isSelected = isBroadcastMode 
              ? broadcastRecipients.includes(contact.phone)
              : selectedPhone === contact.phone

            return (
              <button
                key={contact.phone}
                onClick={() => {
                  if (isBroadcastMode) {
                    toggleRecipient(contact.phone)
                  } else {
                    setSelectedPhone(contact.phone)
                  }
                }}
                className={cn(
                  "flex items-center gap-3 w-full px-4 py-3 text-left transition-all duration-150 cursor-pointer border-b border-white/[0.03] relative",
                  isSelected ? "bg-brand-600/10" : "hover:bg-white/[0.03]"
                )}
                style={{ animationDelay: `${i * 30}ms` }}
              >
                {/* Active indicator */}
                {isSelected && !isBroadcastMode && (
                  <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-brand-500 rounded-r" />
                )}

                {/* Broadcast Checkbox */}
                {isBroadcastMode && (
                  <div className={cn(
                    "flex items-center justify-center w-4 h-4 rounded shrink-0 mr-1 border transition-colors",
                    isSelected ? "bg-brand-500 border-brand-500 text-white" : "border-surface-600"
                  )}>
                    {isSelected && <CheckSquare className="w-3.5 h-3.5" />}
                  </div>
                )}

                {/* Avatar */}
                <div className="relative shrink-0">
                  <div className={cn(
                    "flex items-center justify-center w-10 h-10 rounded-full text-[12px] font-bold",
                    isSelected
                      ? "bg-brand-500 text-white"
                      : "bg-white/[0.08] text-surface-300 border border-white/[0.06]"
                  )}>
                    {contact.phone.slice(-2)}
                  </div>
                  {/* Online dot */}
                  <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-whatsapp border-2 border-[#0d1117] animate-pulse-dot" />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className={cn("text-[13px] font-semibold truncate", isSelected ? "text-white" : "text-surface-200")}>
                      {contact.name || formatPhoneDisplay(contact.phone)}
                    </p>
                    <span className="text-[10px] text-surface-500 shrink-0 tabular-nums">
                      {formatDate(contact.lastTimestamp)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <p className="text-[12px] text-surface-400 truncate flex items-center gap-1">
                      {contact.sender === 'bot' && (
                        <Sparkles className="w-3 h-3 text-brand-400 shrink-0" />
                      )}
                      {contact.lastMessage}
                    </p>
                    {contact.messageCount > 1 && (
                      <span className="flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-whatsapp/20 text-whatsapp text-[9px] font-bold shrink-0">
                        {contact.messageCount}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
