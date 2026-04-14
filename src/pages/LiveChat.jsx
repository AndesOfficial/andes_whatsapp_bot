import { useState, useEffect, useRef } from 'react'
import { db } from '../firebase'
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  where,
  addDoc,
  serverTimestamp,
  doc,
  setDoc,
} from 'firebase/firestore'
import {
  Search,
  Send,
  Phone,
  MoreVertical,
  Bot,
  User,
  MessageSquareText,
  Smile,
  Paperclip,
  ArrowDown,
  Sparkles,
  X,
} from 'lucide-react'

export default function LiveChat() {
  const [contacts, setContacts] = useState([])
  const [selectedPhone, setSelectedPhone] = useState(null)
  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [botPaused, setBotPaused] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [showScrollBtn, setShowScrollBtn] = useState(false)
  const messagesEndRef = useRef(null)
  const chatContainerRef = useRef(null)

  // Fetch unique contacts
  useEffect(() => {
    const q = query(collection(db, 'chat_history'), orderBy('timestamp', 'desc'))
    const unsub = onSnapshot(q, (snapshot) => {
      const contactMap = new Map()
      snapshot.docs.forEach((doc) => {
        const data = doc.data()
        if (!contactMap.has(data.phone)) {
          contactMap.set(data.phone, {
            phone: data.phone,
            lastMessage: data.message,
            lastTimestamp: data.timestamp,
            sender: data.sender,
            messageCount: 1,
          })
        } else {
          contactMap.get(data.phone).messageCount++
        }
      })
      setContacts(Array.from(contactMap.values()))
    }, (error) => {
      console.error('Contacts listener error:', error)
    })
    return () => unsub()
  }, [])

  // Fetch messages for selected phone
  useEffect(() => {
    if (!selectedPhone) return
    const q = query(
      collection(db, 'chat_history'),
      where('phone', '==', selectedPhone),
      orderBy('timestamp', 'asc')
    )
    const unsub = onSnapshot(q, (snapshot) => {
      setMessages(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })))
    }, (error) => {
      console.error('Messages listener error:', error)
    })
    return () => unsub()
  }, [selectedPhone])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Sync bot status for selected phone
  useEffect(() => {
    if (!selectedPhone) return
    const unsub = onSnapshot(doc(db, 'bot_settings', selectedPhone), (docSnap) => {
      if (docSnap.exists()) {
        setBotPaused(docSnap.data().paused || false)
      } else {
        setBotPaused(false)
      }
    })
    return () => unsub()
  }, [selectedPhone])

  // Scroll detection
  const handleScroll = () => {
    if (!chatContainerRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current
    setShowScrollBtn(scrollHeight - scrollTop - clientHeight > 100)
  }

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const handleSend = async () => {
    if (!draft.trim() || !selectedPhone) return
    const message = draft.trim()
    setDraft('')

    try {
      // 1. Add to Firestore for local history
      await addDoc(collection(db, 'chat_history'), {
        phone: selectedPhone,
        message: message,
        sender: 'bot',
        timestamp: serverTimestamp(),
      })

      // 2. Send via Bot API to WhatsApp
      await fetch(`${import.meta.env.VITE_BOT_SERVER_URL}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: selectedPhone, message }),
      })
    } catch (err) {
      console.error('Failed to send message:', err)
    }
  }

  const toggleBot = async () => {
    if (!selectedPhone) return
    const newState = !botPaused
    setBotPaused(newState) // Optimistic update
    try {
      await setDoc(doc(db, 'bot_settings', selectedPhone), {
        paused: newState,
        updated_at: serverTimestamp(),
      }, { merge: true })
    } catch (err) {
      console.error('Failed to toggle bot:', err)
      setBotPaused(!newState) // Revert on failure
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const formatTime = (timestamp) => {
    if (!timestamp) return ''
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const formatDate = (timestamp) => {
    if (!timestamp) return ''
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    if (date.toDateString() === today.toDateString()) return 'Today'
    if (date.toDateString() === yesterday.toDateString()) return 'Yesterday'
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
  }

  const formatPhoneDisplay = (phone) => {
    if (!phone) return ''
    const clean = phone.replace(/\D/g, '')
    if (clean.length === 12 && clean.startsWith('91')) {
      return `+91 ${clean.slice(2, 7)} ${clean.slice(7)}`
    }
    return phone
  }

  const filteredContacts = contacts.filter((c) =>
    c.phone.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // Group messages by date
  const groupedMessages = messages.reduce((groups, msg) => {
    const dateKey = msg.timestamp
      ? (msg.timestamp.toDate ? msg.timestamp.toDate() : new Date(msg.timestamp)).toDateString()
      : 'Unknown'
    if (!groups[dateKey]) groups[dateKey] = []
    groups[dateKey].push(msg)
    return groups
  }, {})

  return (
    <div className="flex h-full">
      {/* ─── Contacts Panel ─── */}
      <div className="flex flex-col w-[320px] border-r border-white/[0.06] bg-[#0d1117] shrink-0">
        {/* Header */}
        <div className="px-4 h-16 flex items-center justify-between border-b border-white/[0.06] shrink-0">
          <div className="flex items-center gap-2">
            <h2 className="text-[15px] font-bold text-white">Chats</h2>
            <span className="flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full bg-brand-500/20 text-brand-400 text-[10px] font-bold">
              {contacts.length}
            </span>
          </div>
        </div>

        {/* Search */}
        <div className="px-3 py-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-surface-500" />
            <input
              id="contact-search"
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
              const isSelected = selectedPhone === contact.phone
              return (
                <button
                  key={contact.phone}
                  id={`contact-${contact.phone}`}
                  onClick={() => setSelectedPhone(contact.phone)}
                  className={`
                    flex items-center gap-3 w-full px-4 py-3 text-left transition-all duration-150 cursor-pointer
                    border-b border-white/[0.03] relative
                    ${isSelected
                      ? 'bg-brand-600/10'
                      : 'hover:bg-white/[0.03]'
                    }
                  `}
                  style={{ animationDelay: `${i * 30}ms` }}
                >
                  {/* Active indicator */}
                  {isSelected && (
                    <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-brand-500 rounded-r" />
                  )}

                  {/* Avatar */}
                  <div className="relative shrink-0">
                    <div className={`
                      flex items-center justify-center w-10 h-10 rounded-full text-[12px] font-bold
                      ${isSelected
                        ? 'bg-gradient-to-br from-brand-500 to-purple-500 text-white'
                        : 'bg-white/[0.08] text-surface-300 border border-white/[0.06]'
                      }
                    `}>
                      {contact.phone.slice(-2)}
                    </div>
                    {/* Online dot */}
                    <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-whatsapp border-2 border-[#0d1117] animate-pulse-dot" />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className={`text-[13px] font-semibold truncate ${isSelected ? 'text-white' : 'text-surface-200'}`}>
                        {formatPhoneDisplay(contact.phone)}
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

      {/* ─── Chat Window ─── */}
      <div className="flex flex-col flex-1 bg-[#0a0e1a]">
        {selectedPhone ? (
          <>
            {/* Chat Header */}
            <div className="flex items-center justify-between px-5 h-16 border-b border-white/[0.06] bg-[#0d1117]/80 backdrop-blur-sm shrink-0">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="flex items-center justify-center w-9 h-9 rounded-full bg-gradient-to-br from-brand-500 to-purple-500 text-white text-[11px] font-bold">
                    {selectedPhone.slice(-2)}
                  </div>
                  <span className="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-whatsapp border-2 border-[#0d1117]" />
                </div>
                <div>
                  <p className="text-[13px] font-bold text-white">{formatPhoneDisplay(selectedPhone)}</p>
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
              className="flex-1 overflow-y-auto px-5 py-4 relative"
              style={{
                backgroundImage: `
                  radial-gradient(ellipse at 10% 90%, rgba(99,102,241,0.04) 0%, transparent 50%),
                  radial-gradient(ellipse at 90% 10%, rgba(139,92,246,0.03) 0%, transparent 50%)
                `,
              }}
            >
              {Object.entries(groupedMessages).map(([dateKey, msgs]) => (
                <div key={dateKey}>
                  {/* Date pill */}
                  <div className="flex items-center justify-center my-5">
                    <span className="px-3 py-1 rounded-full bg-white/[0.06] text-[10px] font-semibold text-surface-400 uppercase tracking-wider border border-white/[0.04]">
                      {formatDate(msgs[0]?.timestamp)}
                    </span>
                  </div>

                  {msgs.map((msg, i) => {
                    const isBot = msg.sender === 'bot'
                    return (
                      <div
                        key={msg.id}
                        className={`flex mb-3 animate-fade-in ${isBot ? 'justify-end' : 'justify-start'}`}
                        style={{ animationDelay: `${i * 20}ms` }}
                      >
                        {/* Avatar for customer */}
                        {!isBot && (
                          <div className="flex items-end mr-2 shrink-0">
                            <div className="flex items-center justify-center w-7 h-7 rounded-full bg-white/[0.08] text-surface-400 text-[9px] font-bold border border-white/[0.06]">
                              <User className="w-3.5 h-3.5" />
                            </div>
                          </div>
                        )}

                        <div className={`
                          max-w-[60%] rounded-2xl px-4 py-2.5 text-[13px] leading-relaxed relative
                          ${isBot
                            ? 'bg-gradient-to-br from-brand-600 to-brand-700 text-white rounded-br-md shadow-lg shadow-brand-600/10'
                            : 'bg-white/[0.07] text-surface-100 rounded-bl-md border border-white/[0.06]'
                          }
                        `}>
                          {/* Sender label */}
                          <p className={`text-[9px] font-bold uppercase tracking-widest mb-1 flex items-center gap-1 ${
                            isBot ? 'text-brand-200/70' : 'text-surface-500'
                          }`}>
                            {isBot ? (
                              <><Sparkles className="w-2.5 h-2.5" /> AI Bot</>
                            ) : (
                              <><User className="w-2.5 h-2.5" /> Customer</>
                            )}
                          </p>
                          <p className="whitespace-pre-wrap">{msg.message}</p>
                          <p className={`text-[10px] mt-1.5 tabular-nums ${
                            isBot ? 'text-brand-200/40' : 'text-surface-500/60'
                          }`}>
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
                  })}
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

            {/* ─── Input Bar ─── */}
            <div className="px-4 py-3 border-t border-white/[0.06] bg-[#0d1117]/80 backdrop-blur-sm shrink-0">
              {/* Bot status banner */}
              <div className={`
                flex items-center justify-between mb-2.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all
                ${botPaused
                  ? 'bg-warning/10 border border-warning/20 text-warning'
                  : 'bg-whatsapp/8 border border-whatsapp/15 text-whatsapp'
                }
              `}>
                <div className="flex items-center gap-1.5">
                  <Bot className="w-3.5 h-3.5" />
                  <span>{botPaused ? 'Bot is paused — you are replying manually' : 'AI Bot is handling this conversation'}</span>
                </div>
                <button
                  id="bot-toggle"
                  onClick={toggleBot}
                  className={`
                    relative w-9 h-5 rounded-full transition-all duration-300 cursor-pointer shrink-0
                    ${botPaused
                      ? 'bg-warning/30'
                      : 'bg-whatsapp/30'
                    }
                  `}
                >
                  <span className={`
                    absolute top-0.5 w-4 h-4 rounded-full transition-all duration-300 shadow-sm
                    ${botPaused
                      ? 'left-[18px] bg-warning'
                      : 'left-0.5 bg-whatsapp'
                    }
                  `} />
                </button>
              </div>

              {/* Input row */}
              <div className="flex items-center gap-2">
                <button className="p-2 rounded-lg text-surface-400 hover:bg-white/[0.06] hover:text-surface-200 transition-colors cursor-pointer shrink-0">
                  <Paperclip className="w-4 h-4" />
                </button>
                <div className="flex-1 relative">
                  <input
                    id="message-input"
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
                  id="send-button"
                  onClick={handleSend}
                  disabled={!draft.trim()}
                  className="flex items-center justify-center w-10 h-10 rounded-xl bg-brand-600 text-white hover:bg-brand-500 disabled:opacity-20 disabled:hover:bg-brand-600 transition-all duration-200 shadow-lg shadow-brand-600/20 cursor-pointer disabled:cursor-not-allowed shrink-0"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </>
        ) : (
          /* ─── Empty State ─── */
          <div className="flex flex-col items-center justify-center h-full">
            <div className="relative mb-8">
              <div className="absolute inset-0 rounded-full bg-brand-500/10 blur-3xl scale-[2]" />
              <div className="relative flex items-center justify-center w-20 h-20 rounded-2xl bg-white/[0.04] border border-white/[0.06] rotate-6">
                <MessageSquareText className="w-8 h-8 text-brand-400/50 -rotate-6" />
              </div>
            </div>
            <h3 className="text-lg font-bold text-surface-200 mb-2">No Chat Selected</h3>
            <p className="text-[13px] text-surface-500 max-w-[240px] text-center leading-relaxed">
              Pick a conversation from the left to start viewing messages
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
