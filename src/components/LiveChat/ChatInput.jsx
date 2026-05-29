import { Paperclip, Smile, Send, Bot } from 'lucide-react'
import { cn } from '../../utils/cn'

export default function ChatInput({ draft, setDraft, handleSend, botPaused, toggleBot }) {
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="px-4 py-3 border-t border-white/[0.06] bg-[#0d1117]/80 backdrop-blur-sm shrink-0">
      {/* Bot status banner */}
      <div className={cn(
        "flex items-center justify-between mb-2.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all",
        botPaused
          ? 'bg-warning/10 border border-warning/20 text-warning'
          : 'bg-whatsapp/8 border border-whatsapp/15 text-whatsapp'
      )}>
        <div className="flex items-center gap-1.5">
          <Bot className="w-3.5 h-3.5" />
          <span>{botPaused ? 'Bot is paused — you are replying manually' : 'AI Bot is handling this conversation'}</span>
        </div>
        <button
          onClick={toggleBot}
          className={cn(
            "relative w-9 h-5 rounded-full transition-all duration-300 cursor-pointer shrink-0",
            botPaused ? 'bg-warning/30' : 'bg-whatsapp/30'
          )}
        >
          <span className={cn(
            "absolute top-0.5 w-4 h-4 rounded-full transition-all duration-300 shadow-sm",
            botPaused ? 'left-[18px] bg-warning' : 'left-0.5 bg-whatsapp'
          )} />
        </button>
      </div>

      {/* Input row */}
      <div className="flex items-center gap-2">
        <button className="p-2 rounded-lg text-surface-400 hover:bg-white/[0.06] hover:text-surface-200 transition-colors cursor-pointer shrink-0">
          <Paperclip className="w-4 h-4" />
        </button>
        <div className="flex-1 relative">
          <input
            type="text"
            placeholder="Type a message..."
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full px-4 py-2.5 rounded-xl bg-white/[0.05] border border-white/[0.08] text-[13px] text-surface-100 placeholder:text-surface-500 focus:outline-none focus:ring-1 focus:ring-brand-500/40 focus:border-brand-500/30 transition-all"
          />
        </div>
        <button className="p-2 rounded-lg text-surface-400 hover:bg-white/[0.06] hover:text-surface-200 transition-colors cursor-pointer shrink-0">
          <Smile className="w-4 h-4" />
        </button>
        <button
          onClick={handleSend}
          disabled={!draft.trim()}
          className="flex items-center justify-center w-10 h-10 rounded-xl bg-brand-600 text-white hover:bg-brand-500 disabled:opacity-20 disabled:hover:bg-brand-600 transition-all duration-200 shadow-lg shadow-brand-600/20 cursor-pointer disabled:cursor-not-allowed shrink-0"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
