import { useState, useEffect } from 'react'
import { db, botDb, auth } from '../firebase'
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
  limit,
  getDocs,
} from 'firebase/firestore'
import toast from 'react-hot-toast'
import ContactList from '../components/LiveChat/ContactList'
import ChatWindow from '../components/LiveChat/ChatWindow'
import BroadcastWindow from '../components/LiveChat/BroadcastWindow'

export default function LiveChat() {
  const [contacts, setContacts] = useState([])
  const [selectedPhone, setSelectedPhone] = useState(null)
  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [botPaused, setBotPaused] = useState(false)
  const [customerNames, setCustomerNames] = useState({})
  const [isBroadcastMode, setIsBroadcastMode] = useState(false)
  const [selectedLeads, setSelectedLeads] = useState([])
  const [chatFilter, setChatFilter] = useState('support') // 'support' or 'all'

  // Fetch customer names from users and orders (default DB) with caching
  useEffect(() => {
    const fetchNames = async () => {
      try {
        const cachedNames = sessionStorage.getItem('andes_customer_names')
        if (cachedNames) {
          setCustomerNames(JSON.parse(cachedNames))
          // Still fetch in background to update cache
        }
        
        const nameMap = cachedNames ? JSON.parse(cachedNames) : {}
        let updated = false

        // 1. Fetch from users collection (default DB)
        const usersSnapshot = await getDocs(query(collection(db, 'users'), limit(2000)))
        usersSnapshot.docs.forEach(docSnap => {
          const data = docSnap.data()
          const nameVal = data.name || data.displayName || data.userName || data.customerName || (data.firstName ? `${data.firstName} ${data.lastName || ''}`.trim() : null)
          if (nameVal) {
            const phoneVal = data.mobile || data.phone || data.userPhone || data.phoneNumber;
            if (phoneVal) {
              const cleanPhone = String(phoneVal).replace(/\D/g, '')
              if (cleanPhone.length >= 10) {
                const p10 = cleanPhone.slice(-10)
                if (nameMap[p10] !== nameVal) { nameMap[p10] = nameVal; updated = true; }
                if (nameMap['91' + p10] !== nameVal) { nameMap['91' + p10] = nameVal; updated = true; }
                if (nameMap[cleanPhone] !== nameVal) { nameMap[cleanPhone] = nameVal; updated = true; }
              }
            }
          }
        })

        // 2. Fetch from orders collection (default DB) as fallback
        try {
          const ordersSnapshot = await getDocs(query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limit(500)))
          ordersSnapshot.docs.forEach(docSnap => {
            const data = docSnap.data()
            const nameVal = data.userName || data.name || data.customerName || data.displayName;
            const phoneVal = data.userPhone || data.phone || data.mobile || data.phoneNumber;
            if (nameVal && phoneVal) {
              const cleanPhone = String(phoneVal).replace(/\D/g, '')
              if (cleanPhone.length >= 10) {
                const p10 = cleanPhone.slice(-10)
                if (nameMap[p10] !== nameVal) { nameMap[p10] = nameVal; updated = true; }
                if (nameMap['91' + p10] !== nameVal) { nameMap['91' + p10] = nameVal; updated = true; }
                if (nameMap[cleanPhone] !== nameVal) { nameMap[cleanPhone] = nameVal; updated = true; }
              }
            }
          })
        } catch (orderErr) {
          console.error('Failed to fetch fallback names from default orders:', orderErr)
        }

        if (updated || !cachedNames) {
          sessionStorage.setItem('andes_customer_names', JSON.stringify(nameMap))
          setCustomerNames(nameMap)
        }
      } catch (err) {
        console.error('Failed to fetch customer names:', err)
      }
    }
    fetchNames()
  }, [])

  // Fetch unique contacts with limit to prevent massive reads (from botDb)
  useEffect(() => {
    const q = query(
      collection(botDb, 'chat_history'),
      orderBy('timestamp', 'desc'),
      limit(200)
    )
    const unsub = onSnapshot(q, (snapshot) => {
      const contactMap = new Map()
      snapshot.docs.forEach((docSnap) => {
        const data = docSnap.data()
        // Filter logic based on channel
        if (chatFilter === 'support' && data.channel === 'marketing') {
          return // Skip marketing messages
        }
        if (chatFilter === 'marketing' && data.channel !== 'marketing') {
          return // Skip support messages
        }

        if (!contactMap.has(data.phone)) {
          const cleanPhone = data.phone.replace(/\D/g, '')
          contactMap.set(data.phone, {
            phone: data.phone,
            name: data.name || data.userName || data.customerName || customerNames[cleanPhone] || customerNames[data.phone],
            lastMessage: data.message,
            lastTimestamp: data.timestamp,
            sender: data.sender,
            messageCount: 1,
          })
        } else {
          contactMap.get(data.phone).messageCount++
        }
      })
      
      const sortedContacts = Array.from(contactMap.values()).sort((a, b) => {
        const timeA = a.lastTimestamp?.toMillis?.() || 0
        const timeB = b.lastTimestamp?.toMillis?.() || 0
        return timeB - timeA
      })
      
      setContacts(sortedContacts)
    }, (error) => {
      console.error('Contacts listener error:', error)
      toast.error('Failed to load recent chats')
    })
    return () => unsub()
  }, [customerNames, chatFilter])

  // Fetch messages for selected phone (from botDb)
  useEffect(() => {
    if (!selectedPhone) return
    const q = query(
      collection(botDb, 'chat_history'),
      where('phone', '==', selectedPhone),
      orderBy('timestamp', 'desc'),
      limit(15)
    )
    const unsub = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
      setMessages(msgs.reverse())
    }, (error) => {
      console.error('Messages listener error:', error)
      toast.error('Failed to load messages')
    })
    return () => unsub()
  }, [selectedPhone])

  // Sync bot status for selected phone (from botDb)
  useEffect(() => {
    if (!selectedPhone) return
    const unsub = onSnapshot(doc(botDb, 'bot_settings', selectedPhone), (docSnap) => {
      if (docSnap.exists()) {
        setBotPaused(docSnap.data().paused || false)
      } else {
        setBotPaused(false)
      }
    })
    return () => unsub()
  }, [selectedPhone])

  const handleSend = async () => {
    if (!draft.trim() || !selectedPhone) return
    const message = draft.trim()
    setDraft('')

    try {
      const token = await auth.currentUser?.getIdToken()
      // Send via Bot API to WhatsApp (the backend will log it to Firestore)
      await fetch(`${import.meta.env.VITE_BOT_SERVER_URL}/send`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-API-Secret': import.meta.env.VITE_BOT_API_SECRET || '',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ phone: selectedPhone, message }),
      })
    } catch (err) {
      console.error('Failed to send message:', err)
      toast.error('Failed to send message')
      setDraft(message) // restore draft
    }
  }

  const handleBroadcastSend = async (stats) => {
    // BroadcastWindow handles actual sending in batches.
    const { sent, failed, recipients: recipientPhones, template } = stats || { sent: 0, failed: 0, recipients: [], template: null }
    const total = sent + failed

    // Log campaign to Firestore for audit trail (use botDb which maps to andesdb)
    try {
      const logEntry = {
        sentBy: auth.currentUser?.email || 'unknown',
        template: template || 'unknown',
        recipientCount: recipientPhones?.length || total,
        sentCount: sent,
        failedCount: failed,
        recipientPhones: recipientPhones || [],
        timestamp: serverTimestamp(),
        aborted: total < (recipientPhones?.length || 0),
      }
      await addDoc(collection(botDb, 'broadcast_logs'), logEntry)
    } catch (logErr) {
      console.error('Failed to log broadcast campaign:', logErr)
    }

    if (failed === 0 && sent > 0) {
      toast.success(`Successfully sent to all ${sent} recipients`)
    } else if (sent > 0) {
      toast(`Sent to ${sent}/${total} recipients (${failed} failed)`, { icon: '⚠️' })
    } else {
      toast.error('Failed to send messages')
    }
    
    // Reset and close
    setIsBroadcastMode(false)
    setSelectedLeads([])
  }

  const toggleBot = async () => {
    if (!selectedPhone) return
    const newState = !botPaused
    setBotPaused(newState) // Optimistic update
    try {
      await setDoc(doc(botDb, 'bot_settings', selectedPhone), {
        paused: newState,
        updated_at: serverTimestamp(),
      }, { merge: true })
      toast.success(newState ? 'Bot paused' : 'Bot activated')
    } catch (err) {
      console.error('Failed to toggle bot:', err)
      setBotPaused(!newState) // Revert on failure
      toast.error('Failed to update bot settings')
    }
  }

  const activeContact = contacts.find(c => c.phone === selectedPhone)

  return (
    <div className="flex h-full">
      <ContactList
        contacts={contacts}
        selectedPhone={selectedPhone}
        setSelectedPhone={setSelectedPhone}
        isMobileHidden={!!selectedPhone && !isBroadcastMode}
        isBroadcastMode={isBroadcastMode}
        toggleBroadcastMode={() => {
          setIsBroadcastMode(!isBroadcastMode)
          if (!isBroadcastMode) setSelectedPhone(null) // clear normal chat when entering broadcast
        }}
        selectedLeads={selectedLeads}
        toggleLead={(phone) => {
          setSelectedLeads(prev => 
            prev.includes(phone) ? prev.filter(p => p !== phone) : [...prev, phone]
          )
        }}
        chatFilter={chatFilter}
        setChatFilter={setChatFilter}
      />
      {isBroadcastMode ? (
        <BroadcastWindow
          recipients={selectedLeads}
          contacts={contacts}
          setRecipients={setSelectedLeads}
          onCancel={() => {
            setIsBroadcastMode(false)
            setSelectedLeads([])
          }}
          onSend={handleBroadcastSend}
          isMobileHidden={!isBroadcastMode}
        />
      ) : (
        <ChatWindow
          selectedPhone={selectedPhone}
          activeContact={activeContact}
          messages={messages}
          draft={draft}
          setDraft={setDraft}
          handleSend={handleSend}
          botPaused={botPaused}
          toggleBot={toggleBot}
          isMobileHidden={!selectedPhone}
          onBack={() => setSelectedPhone(null)}
        />
      )}
    </div>
  )
}
