import { useState, useEffect } from 'react'
import { db, botDb } from '../firebase'
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
  const [broadcastRecipients, setBroadcastRecipients] = useState([])

  // Fetch customer names from orders (bot DB)
  useEffect(() => {
    const fetchNames = async () => {
      try {
        const q = query(collection(botDb, 'orders'), orderBy('createdAt', 'desc'), limit(500))
        const snapshot = await getDocs(q)
        const nameMap = {}
        snapshot.docs.forEach(docSnap => {
          const data = docSnap.data()
          if (data.phone && data.name) {
            const cleanPhone = String(data.phone).replace(/\D/g, '')
            if (cleanPhone.length === 10) {
              nameMap[cleanPhone] = data.name
              nameMap['91' + cleanPhone] = data.name
            } else if (cleanPhone.length === 12 && cleanPhone.startsWith('91')) {
              nameMap[cleanPhone] = data.name
              nameMap[cleanPhone.slice(2)] = data.name
            } else {
              nameMap[cleanPhone] = data.name
            }
          }
        })
        setCustomerNames(nameMap)
      } catch (err) {
        console.error('Failed to fetch customer names:', err)
        toast.error(`Failed to fetch names: ${err.message}`, { duration: 5000 })
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
  }, [customerNames])

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
      // 1. Add to Firestore for local history (to botDb)
      await addDoc(collection(botDb, 'chat_history'), {
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
      toast.error('Failed to send message')
      setDraft(message) // restore draft
    }
  }

  const handleBroadcastSend = async (messageText) => {
    let successCount = 0
    const total = broadcastRecipients.length

    for (const phone of broadcastRecipients) {
      try {
        await addDoc(collection(botDb, 'chat_history'), {
          phone,
          message: messageText,
          sender: 'bot',
          timestamp: serverTimestamp(),
        })

        await fetch(`${import.meta.env.VITE_BOT_SERVER_URL}/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone, message: messageText }),
        })
        successCount++
      } catch (err) {
        console.error(`Failed to send to ${phone}:`, err)
      }
    }

    if (successCount === total) {
      toast.success(`Successfully sent to all ${total} recipients`)
    } else {
      toast.error(`Sent to ${successCount}/${total} recipients`)
    }
    
    // Reset and close
    setIsBroadcastMode(false)
    setBroadcastRecipients([])
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
        broadcastRecipients={broadcastRecipients}
        toggleRecipient={(phone) => {
          setBroadcastRecipients(prev => 
            prev.includes(phone) ? prev.filter(p => p !== phone) : [...prev, phone]
          )
        }}
      />
      {isBroadcastMode ? (
        <BroadcastWindow
          recipients={broadcastRecipients}
          contacts={contacts}
          onCancel={() => {
            setIsBroadcastMode(false)
            setBroadcastRecipients([])
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
