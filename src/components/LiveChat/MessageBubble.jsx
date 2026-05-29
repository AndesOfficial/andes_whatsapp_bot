import { User, Sparkles, Bot } from 'lucide-react'
import { formatTime } from '../../utils/date'
import { cn } from '../../utils/cn'

export default function MessageBubble({ msg, isBot }) {
  return (
    <div className={cn("flex mb-3 animate-fade-in", isBot ? 'justify-end' : 'justify-start')}>
      {/* Avatar for customer */}
      {!isBot && (
        <div className="flex items-end mr-2 shrink-0">
          <div className="flex items-center justify-center w-7 h-7 rounded-full bg-white/[0.08] text-surface-400 text-[9px] font-bold border border-white/[0.06]">
            <User className="w-3.5 h-3.5" />
          </div>
        </div>
      )}

      <div className={cn(
        "max-w-[60%] rounded-2xl px-4 py-2.5 text-[13px] leading-relaxed relative",
        isBot
          ? "bg-gradient-to-br from-brand-600 to-brand-700 text-white rounded-br-md shadow-lg shadow-brand-600/10"
          : "bg-white/[0.07] text-surface-100 rounded-bl-md border border-white/[0.06]"
      )}>
        {/* Sender label */}
        <p className={cn(
          "text-[9px] font-bold uppercase tracking-widest mb-1 flex items-center gap-1",
          isBot ? 'text-brand-200/70' : 'text-surface-500'
        )}>
          {isBot ? (
            <><Sparkles className="w-2.5 h-2.5" /> AI Bot</>
          ) : (
            <><User className="w-2.5 h-2.5" /> Customer</>
          )}
        </p>
        <p className="whitespace-pre-wrap">{msg.message}</p>
        <p className={cn(
          "text-[10px] mt-1.5 tabular-nums",
          isBot ? 'text-brand-200/40' : 'text-surface-500/60'
        )}>
          {formatTime(msg.timestamp)}
        </p>
      </div>

      {/* Avatar for bot */}
      {isBot && (
        <div className="flex items-end ml-2 shrink-0">
          <div className="flex items-center justify-center w-7 h-7 rounded-full bg-brand-600/30 text-brand-400 text-[9px] font-bold border border-brand-500/20">
            <Bot className="w-3.5 h-3.5" />
          </div>
        </div>
      )}
    </div>
  )
}
