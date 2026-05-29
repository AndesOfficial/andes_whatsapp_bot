import { useState } from 'react'
import { Megaphone, Users, Loader2, Send } from 'lucide-react'
import { formatPhoneDisplay } from '../../utils/phone'
import { cn } from '../../utils/cn'

export default function BroadcastWindow({
  recipients,
  contacts,
  onCancel,
  onSend,
  isMobileHidden,
}) {
  const [draft, setDraft] = useState('')
  const [isSending, setIsSending] = useState(false)

  const handleSendClick = async () => {
    if (!draft.trim() || recipients.length === 0) return
    setIsSending(true)
    await onSend(draft.trim())
    setIsSending(false)
  }

  return (
    <div className={cn(
      "flex flex-col flex-1 bg-[#0a0e1a]",
      isMobileHidden ? "hidden md:flex" : "flex"
    )}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 h-16 border-b border-white/[0.06] bg-[#0d1117]/80 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-brand-500/20 text-brand-400">
            <Megaphone className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-[14px] font-bold text-white">Broadcast Message</h3>
            <p className="text-[11px] text-surface-400 flex items-center gap-1.5">
              <Users className="w-3 h-3" />
              {recipients.length} recipients selected
            </p>
          </div>
        </div>
        <button
          onClick={onCancel}
          disabled={isSending}
          className="px-4 py-2 rounded-lg bg-white/[0.05] text-surface-300 text-[12px] font-semibold hover:bg-white/10 transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
      </div>

      {/* Main Area */}
      <div className="flex-1 overflow-y-auto px-6 py-6 flex flex-col items-center">
        <div className="w-full max-w-2xl">
          <div className="bg-[#0d1117] border border-white/[0.06] rounded-2xl p-6 shadow-xl mb-6">
            <h4 className="text-sm font-semibold text-white mb-4">Selected Recipients</h4>
            <div className="flex flex-wrap gap-2 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
              {recipients.length === 0 ? (
                <p className="text-sm text-surface-500">No recipients selected. Select contacts from the sidebar.</p>
              ) : (
                recipients.map(phone => {
                  const contact = contacts.find(c => c.phone === phone)
                  return (
                    <div key={phone} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-800 border border-white/[0.04] text-[12px]">
                      <span className="font-semibold text-surface-200 truncate max-w-[120px]">
                        {contact?.name || formatPhoneDisplay(phone)}
                      </span>
                    </div>
                  )
                })
              )}
            </div>
          </div>

          <div className="bg-[#0d1117] border border-white/[0.06] rounded-2xl p-6 shadow-xl">
            <h4 className="text-sm font-semibold text-white mb-4">Compose Message</h4>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              disabled={isSending}
              placeholder="Type your broadcast message here..."
              className="w-full h-32 bg-surface-950 border border-white/[0.08] rounded-xl p-4 text-[13px] text-white placeholder:text-surface-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50 resize-none mb-4 disabled:opacity-50"
            />
            
            <div className="flex items-center justify-between">
              <p className="text-xs text-surface-500">
                <strong className="text-amber-400">Warning:</strong> Messages will be sent sequentially. High volumes may trigger spam filters.
              </p>
              <button
                onClick={handleSendClick}
                disabled={isSending || recipients.length === 0 || !draft.trim()}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-brand-600 text-white font-semibold text-[13px] hover:bg-brand-500 transition-all disabled:opacity-50 shadow-lg shadow-brand-500/25"
              >
                {isSending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Send to {recipients.length}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
