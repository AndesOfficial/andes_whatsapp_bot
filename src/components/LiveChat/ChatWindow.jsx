import { useRef, useEffect, useState } from 'react'
import { Phone, MoreVertical, ArrowDown, MessageSquareText, ChevronLeft } from 'lucide-react'
import { formatPhoneDisplay } from '../../utils/phone'
import { formatDate } from '../../utils/date'
import { cn } from '../../utils/cn'
import MessageBubble from './MessageBubble'
import ChatInput from './ChatInput'

export default function ChatWindow({
  selectedPhone,
  activeContact,
  messages,
  draft,
  setDraft,
  handleSend,
  botPaused,
  toggleBot,
  isMobileHidden,
  onBack,
}) {
  const [showScrollBtn, setShowScrollBtn] = useState(false)
  const messagesEndRef = useRef(null)
  const chatContainerRef = useRef(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleScroll = () => {
    if (!chatContainerRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current
    setShowScrollBtn(scrollHeight - scrollTop - clientHeight > 100)
  }

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  // Group messages by date
  const groupedMessages = messages.reduce((groups, msg) => {
    const dateKey = msg.timestamp
      ? (msg.timestamp.toDate ? msg.timestamp.toDate() : new Date(msg.timestamp)).toDateString()
      : 'Unknown'
    if (!groups[dateKey]) groups[dateKey] = []
    groups[dateKey].push(msg)
    return groups
  }, {})

  if (!selectedPhone) {
    return (
      <div className={cn(
        "flex-col items-center justify-center flex-1 bg-surface-950",
        isMobileHidden ? "hidden md:flex" : "flex"
      )}>
        <div className="mb-6">
          <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-white/[0.04] border border-white/[0.06]">
            <MessageSquareText className="w-7 h-7 text-surface-500" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={cn(
      "flex flex-col flex-1 bg-[#0a0e1a]",
      isMobileHidden ? "hidden md:flex" : "flex"
    )}>
      {/* Chat Header */}
      <div className="flex items-center justify-between px-5 h-16 border-b border-white/[0.06] bg-[#0d1117]/80 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-3">
          <button 
            onClick={onBack}
            className="md:hidden flex items-center justify-center w-8 h-8 rounded-lg bg-white/[0.05] text-surface-300 hover:bg-white/10"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="relative">
            <div className="flex items-center justify-center w-9 h-9 rounded-full bg-brand-500 text-white text-[11px] font-bold">
              {selectedPhone.slice(-2)}
            </div>
            <span className="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-whatsapp border-2 border-[#0d1117]" />
          </div>
          <div>
            <p className="text-[13px] font-bold text-white">{activeContact?.name || formatPhoneDisplay(selectedPhone)}</p>
            <div className="flex items-center gap-1.5 text-[11px] text-whatsapp">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-whatsapp animate-pulse-dot" />
              <span className="font-medium">WhatsApp</span>
              <span className="text-surface-500">•</span>
              <span className="text-surface-400">{messages.length} messages</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button className="p-2 rounded-lg text-surface-400 hover:bg-white/[0.06] hover:text-surface-200 transition-colors cursor-pointer">
            <Phone className="w-4 h-4" />
          </button>
          <button className="p-2 rounded-lg text-surface-400 hover:bg-white/[0.06] hover:text-surface-200 transition-colors cursor-pointer">
            <MoreVertical className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div
        ref={chatContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-5 py-4"
      >
        {Object.entries(groupedMessages).map(([dateKey, msgs]) => (
          <div key={dateKey}>
            {/* Date pill */}
            <div className="flex items-center justify-center my-5">
              <span className="px-3 py-1 rounded-full bg-white/[0.06] text-[10px] font-semibold text-surface-400 uppercase tracking-wider border border-white/[0.04]">
                {formatDate(msgs[0]?.timestamp)}
              </span>
            </div>

            {msgs.map((msg) => (
              <MessageBubble key={msg.id} msg={msg} isBot={msg.sender === 'bot'} />
            ))}
          </div>
        ))}
        <div ref={messagesEndRef} />

        {/* Scroll to bottom fab */}
        {showScrollBtn && (
          <button
            onClick={scrollToBottom}
            className="fixed bottom-24 right-8 flex items-center justify-center w-9 h-9 rounded-full bg-brand-600 text-white shadow-lg shadow-brand-600/30 hover:bg-brand-500 transition-all cursor-pointer z-10 animate-fade-in"
          >
            <ArrowDown className="w-4 h-4" />
          </button>
        )}
      </div>

      <ChatInput
        draft={draft}
        setDraft={setDraft}
        handleSend={handleSend}
        botPaused={botPaused}
        toggleBot={toggleBot}
      />
    </div>
  )
}
