import { useState, useRef, useCallback, useEffect } from 'react'
import { Megaphone, Users, Loader2, Send, Upload, FileSpreadsheet, X, AlertTriangle, CheckCircle2, Clock, ShieldCheck, Info, Image, Link2, Trash2 } from 'lucide-react'
import { formatPhoneDisplay } from '../../utils/phone'
import { cn } from '../../utils/cn'
import * as XLSX from 'xlsx'
import { storage, botDb, auth } from '../../firebase'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { collection, addDoc, serverTimestamp, doc, setDoc, getDoc, updateDoc, deleteDoc } from 'firebase/firestore'

// ─── Constants ───────────────────────────────────────────────────
const MAX_FILE_SIZE_MB = 5
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024
const MAX_CELLS_SCAN = 10000
const MAX_RECIPIENTS = 500
const MAX_MESSAGE_LENGTH = 1024
const BATCH_SIZE = 10
const BATCH_DELAY_MS = 3000 // 3s between batches
const DAILY_LIMIT = 2000
const COOLDOWN_MS = 5 * 60 * 1000 // 5 minutes
const DAILY_LIMIT_KEY = 'andes_daily_send_count'
const DAILY_LIMIT_DATE_KEY = 'andes_daily_send_date'
const COOLDOWN_KEY = 'andes_last_campaign_ts'
const MAX_IMAGE_SIZE_MB = 2
const MAX_IMAGE_SIZE_BYTES = MAX_IMAGE_SIZE_MB * 1024 * 1024
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const ALLOWED_MIME_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-excel', // .xls
  'text/csv',
  'application/csv',
  '', // some browsers don't set MIME for CSV
]

// ─── Helpers ─────────────────────────────────────────────────────

// Normalize any phone string to 12-digit Indian format (91XXXXXXXXXX)
function normalizePhone(raw) {
  if (!raw) return null
  const digits = String(raw).replace(/\D/g, '')
  if (digits.length === 10) return '91' + digits
  if (digits.length === 12 && digits.startsWith('91')) return digits
  if (digits.length === 11 && digits.startsWith('0')) return '91' + digits.slice(1)
  if (digits.length > 12 && digits.startsWith('91')) return digits.slice(0, 12)
  return null // invalid
}

// Parse phone numbers from an Excel/CSV workbook with cell cap
function parsePhoneNumbers(workbook) {
  const phones = new Set()
  const rejected = []
  let cellsScanned = 0

  for (const sheetName of workbook.SheetNames) {
    if (cellsScanned >= MAX_CELLS_SCAN) break
    const sheet = workbook.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
    for (const row of rows) {
      for (const cell of row) {
        cellsScanned++
        if (cellsScanned > MAX_CELLS_SCAN) break
        const val = String(cell).trim()
        if (!val) continue
        // Only consider values that look like they could be phone numbers
        const digits = val.replace(/\D/g, '')
        if (digits.length < 10 || digits.length > 15) continue
        const normalized = normalizePhone(val)
        if (normalized) {
          phones.add(normalized)
        } else {
          rejected.push(val)
        }
      }
      if (cellsScanned > MAX_CELLS_SCAN) break
    }
  }
  return { phones: Array.from(phones), rejected, cellsScanned }
}

// Daily limit helpers
function getDailyCount() {
  const today = new Date().toDateString()
  const storedDate = localStorage.getItem(DAILY_LIMIT_DATE_KEY)
  if (storedDate !== today) {
    // New day — reset
    localStorage.setItem(DAILY_LIMIT_DATE_KEY, today)
    localStorage.setItem(DAILY_LIMIT_KEY, '0')
    return 0
  }
  return parseInt(localStorage.getItem(DAILY_LIMIT_KEY) || '0', 10)
}

function addToDailyCount(count) {
  const current = getDailyCount()
  localStorage.setItem(DAILY_LIMIT_KEY, String(current + count))
}

function getDailyRemaining() {
  return Math.max(0, DAILY_LIMIT - getDailyCount())
}

// Cooldown helpers
function getCooldownRemaining() {
  const lastTs = parseInt(localStorage.getItem(COOLDOWN_KEY) || '0', 10)
  if (!lastTs) return 0
  const elapsed = Date.now() - lastTs
  return Math.max(0, COOLDOWN_MS - elapsed)
}

function setCooldownStart() {
  localStorage.setItem(COOLDOWN_KEY, String(Date.now()))
}

// ─── Component ───────────────────────────────────────────────────

export default function BroadcastWindow({
  recipients,
  contacts,
  onCancel,
  onSend,
  setRecipients,
  isMobileHidden,
}) {
  const [selectedTemplate, setSelectedTemplate] = useState('fo_new_customers')
  const [manualPhone, setManualPhone] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [sendProgress, setSendProgress] = useState({ sent: 0, failed: 0, total: 0 })
  const [activeCampaign, setActiveCampaign] = useState(null)
  const [isLoadingCampaign, setIsLoadingCampaign] = useState(true)
  const [importedFileName, setImportedFileName] = useState(null)
  const [importedCount, setImportedCount] = useState(0)
  const [rejectedCount, setRejectedCount] = useState(0)
  const [cappedCount, setCappedCount] = useState(0)
  const [importError, setImportError] = useState(null)
  const [showConfirm, setShowConfirm] = useState(false)
  const [cooldownLeft, setCooldownLeft] = useState(getCooldownRemaining())
  const [attachedImage, setAttachedImage] = useState(null) // { file, preview, uploading, url }
  const fileInputRef = useRef(null)
  const imageInputRef = useRef(null)
  const abortRef = useRef(false)
  const pauseRef = useRef(false)
  const cooldownTimerRef = useRef(null)

  // ─── Crash Recovery (Active Campaigns) ─────────────────────────
  useEffect(() => {
    const checkActiveCampaign = async () => {
      const userId = auth.currentUser?.uid || 'default_user'
      try {
        const docRef = doc(botDb, 'active_campaigns', userId)
        const snap = await getDoc(docRef)
        if (snap.exists()) {
          const data = snap.data()
          if (data.recipients && data.recipients.length > 0) {
            setActiveCampaign(data)
            // Do not pre-fill yet, wait for user to click Resume
          }
        }
      } catch (err) {
        console.error('Failed to load active campaign:', err)
      } finally {
        setIsLoadingCampaign(false)
      }
    }
    checkActiveCampaign()
  }, [])

  const handleResumeCampaign = () => {
    if (!activeCampaign) return
    setRecipients(activeCampaign.recipients)
    setSelectedTemplate(activeCampaign.template_name)
    setSendProgress(activeCampaign.progress || { sent: 0, failed: 0, total: activeCampaign.recipients.length })
    setActiveCampaign(null) // Exit recovery mode UI
  }

  const handleDiscardCampaign = async () => {
    const userId = auth.currentUser?.uid || 'default_user'
    try {
      await deleteDoc(doc(botDb, 'active_campaigns', userId))
    } catch(e) {}
    setActiveCampaign(null)
    setRecipients([])
    setSendProgress({ sent: 0, failed: 0, total: 0 })
  }

  const handlePauseToggle = () => {
    const newState = !pauseRef.current
    pauseRef.current = newState
    setIsPaused(newState)
  }

  // Start cooldown countdown if needed
  const startCooldownTimer = useCallback(() => {
    if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current)
    cooldownTimerRef.current = setInterval(() => {
      const remaining = getCooldownRemaining()
      setCooldownLeft(remaining)
      if (remaining <= 0) clearInterval(cooldownTimerRef.current)
    }, 1000)
  }, [])

  // Check cooldown on mount-like behavior
  useState(() => {
    const remaining = getCooldownRemaining()
    if (remaining > 0) {
      setCooldownLeft(remaining)
      startCooldownTimer()
    }
  })

  // ─── Manual Phone Add ──────────────────────────────────────────
  const handleAddManualPhone = (e) => {
    e?.preventDefault()
    if (!manualPhone.trim()) return
    const normalized = normalizePhone(manualPhone)
    if (normalized) {
      if (!recipients.includes(normalized)) {
        setRecipients(prev => [...prev, normalized])
      }
      setManualPhone('')
      setImportError(null)
    } else {
      setImportError('Invalid phone number format. Must be 10 digits.')
    }
  }

  // ─── File Upload ───────────────────────────────────────────────
  const handleFileUpload = useCallback((e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImportError(null)
    setRejectedCount(0)
    setCappedCount(0)

    // Validate file size
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setImportError(`File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is ${MAX_FILE_SIZE_MB} MB.`)
      e.target.value = ''
      return
    }

    // Validate MIME type
    if (file.type && !ALLOWED_MIME_TYPES.includes(file.type)) {
      setImportError(`Invalid file type: "${file.type}". Please upload .xlsx, .xls, or .csv files only.`)
      e.target.value = ''
      return
    }

    const reader = new FileReader()
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target.result)
        const workbook = XLSX.read(data, { type: 'array' })
        const { phones: extracted, rejected, cellsScanned } = parsePhoneNumbers(workbook)

        if (extracted.length === 0) {
          setImportError(`No valid phone numbers found. ${rejected.length > 0 ? `${rejected.length} values were rejected as invalid.` : ''} ${cellsScanned >= MAX_CELLS_SCAN ? `(Scanned first ${MAX_CELLS_SCAN.toLocaleString()} cells)` : ''}`)
          return
        }

        setRejectedCount(rejected.length)

        // Merge with existing recipients, deduplicate
        const existing = new Set(recipients)
        const newPhones = extracted.filter(p => !existing.has(p))
        const combined = [...recipients, ...newPhones]

        // Cap at MAX_RECIPIENTS
        if (combined.length > MAX_RECIPIENTS) {
          const capped = combined.length - MAX_RECIPIENTS
          setCappedCount(capped)
          setRecipients(combined.slice(0, MAX_RECIPIENTS))
        } else {
          setRecipients(combined)
        }

        setImportedFileName(file.name)
        setImportedCount(Math.min(newPhones.length, MAX_RECIPIENTS - recipients.length))
      } catch (err) {
        console.error('Failed to parse file:', err)
        setImportError('Failed to read file. Please upload a valid .xlsx, .xls, or .csv file.')
      }
    }
    reader.readAsArrayBuffer(file)
    e.target.value = ''
  }, [recipients, setRecipients])

  // ─── Message Handling ──────────────────────────────────────────
  // ─── Image Attachment ─────────────────────────────────────────
  const handleImageSelect = useCallback(async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    // Validate type
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      setImportError('Only JPG, PNG, and WebP images are allowed.')
      return
    }

    // Validate size
    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      setImportError(`Image too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max ${MAX_IMAGE_SIZE_MB} MB.`)
      return
    }

    setImportError(null)
    const preview = URL.createObjectURL(file)
    setAttachedImage({ file, preview, uploading: true, url: null })

    try {
      // Upload to Firebase Storage
      const timestamp = Date.now()
      const ext = file.name.split('.').pop() || 'jpg'
      const storageRef = ref(storage, `broadcast_images/${timestamp}_${Math.random().toString(36).slice(2)}.${ext}`)
      await uploadBytes(storageRef, file)
      const downloadUrl = await getDownloadURL(storageRef)
      setAttachedImage(prev => prev ? { ...prev, uploading: false, url: downloadUrl } : null)
    } catch (err) {
      console.error('Failed to upload image:', err)
      setImportError('Failed to upload image. Please try again.')
      setAttachedImage(null)
    }
  }, [])

  const handleRemoveImage = () => {
    if (attachedImage?.preview) URL.revokeObjectURL(attachedImage.preview)
    setAttachedImage(null)
  }


  // ─── Pre-send Validation ──────────────────────────────────────
  const handlePreSend = () => {
    if (recipients.length === 0) return
    if (!selectedTemplate) return
    const remaining = getDailyRemaining()
    if (recipients.length > remaining) {
      alert(`Daily limit exceeded! You can only send ${remaining} more messages today.`)
      return
    }

    // Show confirmation dialog
    setShowConfirm(true)
  }

  // ─── Confirmed Send ───────────────────────────────────────────
  const handleConfirmedSend = async () => {
    setShowConfirm(false)
    setIsSending(true)
    setIsPaused(false)
    abortRef.current = false
    pauseRef.current = false
    setSendProgress({ sent: 0, failed: 0, total: recipients.length })

    const userId = auth.currentUser?.uid || 'default_user'
    const docRef = doc(botDb, 'active_campaigns', userId)

    // Save initial state to Firebase
    try {
      await setDoc(docRef, {
        recipients: recipients,
        template_name: selectedTemplate,
        progress: { sent: 0, failed: 0, total: recipients.length },
        updatedAt: serverTimestamp()
      })
    } catch (err) {
      console.error('Failed to init active campaign:', err)
    }

    let sent = 0
    let failed = 0

    for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
      if (abortRef.current) break

      const batch = recipients.slice(i, i + BATCH_SIZE)
      const results = await Promise.allSettled(
        batch.map(async (phone) => {
          const token = await auth.currentUser?.getIdToken()
          const payload = { phone: phone, template_name: selectedTemplate }
          const res = await fetch(`${import.meta.env.VITE_BOT_SERVER_URL}/api/marketing/broadcast`, {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'X-API-Secret': import.meta.env.VITE_BOT_API_SECRET || '',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(payload),
          })
          if (!res.ok) throw new Error(`HTTP ${res.status}`)

          // Log to chat_history to immediately show in Live Chat
          try {
            await addDoc(collection(botDb, 'chat_history'), {
              phone: phone,
              message: `[Campaign Sent: ${selectedTemplate}]`,
              sender: 'bot',
              timestamp: serverTimestamp(),
              channel: 'marketing'
            })
          } catch (logErr) {
            console.error('Failed to log to chat history:', logErr)
          }
        })
      )

      for (const r of results) {
        if (r.status === 'fulfilled') sent++
        else failed++
      }
      setSendProgress({ sent, failed, total: recipients.length })

      // Update Firebase crash recovery state
      const remainingRecipients = recipients.slice(i + BATCH_SIZE)
      try {
        await updateDoc(docRef, {
          recipients: remainingRecipients,
          progress: { sent, failed, total: recipients.length },
          updatedAt: serverTimestamp()
        })
      } catch (err) {
        console.error('Failed to update active campaign:', err)
      }

      // Delay between batches
      if (i + BATCH_SIZE < recipients.length && !abortRef.current) {
        await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS))
      }

      // Check for pause
      while (pauseRef.current && !abortRef.current) {
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }

    // Update daily count and set cooldown
    addToDailyCount(sent + failed)
    setCooldownStart()
    setCooldownLeft(COOLDOWN_MS)
    startCooldownTimer()

    // Cleanup active campaign from Firebase if finished or manually stopped
    try {
      await deleteDoc(docRef)
    } catch (err) {}

    setIsSending(false)
    await onSend({ sent, failed, recipients: recipients, template: selectedTemplate })
  }

  const handleAbort = async () => {
    abortRef.current = true
    pauseRef.current = false
    setIsPaused(false)
    
    // Cleanup active campaign
    const userId = auth.currentUser?.uid || 'default_user'
    try {
      await deleteDoc(doc(botDb, 'active_campaigns', userId))
    } catch(e) {}
  }

  const handleRemoveImported = () => {
    setRecipients([])
    setImportedFileName(null)
    setImportedCount(0)
    setRejectedCount(0)
    setCappedCount(0)
  }

  const progressPct = sendProgress.total > 0 ? Math.round(((sendProgress.sent + sendProgress.failed) / sendProgress.total) * 100) : 0
  const dailyRemaining = getDailyRemaining()
  const cooldownSec = Math.ceil(cooldownLeft / 1000)

  return (
    <div className={cn(
      "flex flex-col flex-1 bg-[#0a0e1a]",
      isMobileHidden ? "hidden md:flex" : "flex"
    )}>
      {/* ─── Confirmation Overlay ─── */}
      {showConfirm && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#0d1117] border border-white/[0.08] rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-amber-500/15">
                <ShieldCheck className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <h3 className="text-[15px] font-bold text-white">Confirm Broadcast</h3>
                <p className="text-[11px] text-surface-400">Review before sending</p>
              </div>
            </div>

            <div className="space-y-3 mb-5">
              <div className="flex justify-between text-[12px] px-3 py-2 rounded-lg bg-surface-900">
                <span className="text-surface-400">Recipients</span>
                <span className="text-white font-semibold">{recipients.length}</span>
              </div>
              <div className="flex justify-between text-[12px] px-3 py-2 rounded-lg bg-surface-900">
                <span className="text-surface-400">Daily quota remaining</span>
                <span className={cn("font-semibold", dailyRemaining < 100 ? "text-amber-400" : "text-emerald-400")}>
                  {dailyRemaining - recipients.length} after this
                </span>
              </div>
              <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/15">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 mt-0.5 shrink-0" />
                <p className="text-[11px] text-amber-300 leading-relaxed">
                  Messages will be sent via WhatsApp. Ensure recipients have opted in.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 px-4 py-2.5 rounded-xl bg-white/[0.05] text-surface-300 text-[13px] font-semibold hover:bg-white/10 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmedSend}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-brand-600 text-white text-[13px] font-semibold hover:bg-brand-500 transition-all shadow-lg shadow-brand-500/25"
              >
                <Send className="w-4 h-4" />
                Confirm & Send
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Header ─── */}
      <div className="flex items-center justify-between px-5 h-16 border-b border-white/[0.06] bg-[#0d1117]/80 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-brand-500/20 text-brand-400">
            <Megaphone className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-[14px] font-bold text-white">Bulk Marketing</h3>
            <p className="text-[11px] text-surface-400 flex items-center gap-1.5">
              <Users className="w-3 h-3" />
              {recipients.length} recipients
              <span className="text-surface-600">·</span>
              <span className={cn(dailyRemaining < 100 ? "text-amber-400" : "text-surface-400")}>
                {dailyRemaining} daily left
              </span>
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

      {/* ─── Main Area ─── */}
      <div className="flex-1 overflow-y-auto px-6 py-6 flex flex-col items-center">
        <div className="w-full max-w-2xl space-y-5">
          {isLoadingCampaign ? (
            <div className="flex flex-col items-center justify-center py-20 text-surface-400 gap-4">
              <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
              <p className="text-sm font-semibold">Checking for active campaigns...</p>
            </div>
          ) : activeCampaign ? (
            <div className="bg-[#0d1117] border border-amber-500/30 rounded-2xl p-8 shadow-xl mt-4">
              <div className="flex flex-col items-center text-center gap-5">
                <div className="w-16 h-16 rounded-2xl bg-amber-500/10 flex items-center justify-center border border-amber-500/20">
                  <AlertTriangle className="w-8 h-8 text-amber-400" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white mb-2">Unfinished Campaign Detected</h3>
                  <p className="text-[13px] text-surface-400 max-w-md mx-auto leading-relaxed">
                    You have a paused campaign with <strong className="text-white">{activeCampaign.recipients.length}</strong> recipients remaining. Would you like to resume sending?
                  </p>
                </div>
                <div className="flex items-center gap-3 mt-4 w-full max-w-sm">
                  <button
                    onClick={handleDiscardCampaign}
                    className="flex-1 px-4 py-3 rounded-xl bg-white/[0.05] text-surface-300 text-[13px] font-semibold hover:bg-white/10 transition-colors border border-white/[0.05]"
                  >
                    Discard
                  </button>
                  <button
                    onClick={handleResumeCampaign}
                    className="flex-1 px-4 py-3 rounded-xl bg-amber-500 text-[#0d1117] text-[13px] font-bold hover:bg-amber-400 transition-colors shadow-lg shadow-amber-500/20"
                  >
                    Resume Campaign
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* ─── Add Recipients Card ─── */}
              <div className="bg-[#0d1117] border border-white/[0.06] rounded-2xl p-6 shadow-xl">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-sm font-semibold text-white">Add Recipients</h4>
              {isSending && <Loader2 className="w-4 h-4 text-brand-400 animate-spin" />}
            </div>

            <div className="flex flex-col gap-4 mb-4">
              {/* Manual Input */}
              <form onSubmit={handleAddManualPhone} className="flex gap-2">
                <input
                  type="text"
                  value={manualPhone}
                  onChange={(e) => setManualPhone(e.target.value)}
                  placeholder="Enter phone number..."
                  className="flex-1 bg-surface-900 border border-white/[0.08] rounded-lg px-3 py-2 text-[13px] text-white placeholder:text-surface-500 focus:outline-none focus:ring-1 focus:ring-brand-500/50"
                  disabled={isSending}
                />
                <button
                  type="submit"
                  disabled={isSending || !manualPhone.trim()}
                  className="px-4 py-2 rounded-lg bg-surface-800 text-white text-[12px] font-semibold hover:bg-surface-700 transition-colors border border-white/[0.06] disabled:opacity-50"
                >
                  Add
                </button>
              </form>

              <div className="flex items-center gap-4">
                <div className="h-px bg-white/[0.06] flex-1"></div>
                <span className="text-[10px] text-surface-500 font-semibold uppercase tracking-wider">OR</span>
                <div className="h-px bg-white/[0.06] flex-1"></div>
              </div>

              {/* Excel Upload */}
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isSending}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-600/20 text-brand-400 text-[12px] font-semibold hover:bg-brand-600/30 transition-colors border border-brand-500/20 disabled:opacity-50"
              >
                <Upload className="w-3.5 h-3.5" />
                Upload File
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileUpload}
                className="hidden"
              />
            </div>

            {importError && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-[12px] mb-3">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                {importError}
              </div>
            )}

            {importedFileName && (
              <div className="space-y-2">
                <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span className="text-[12px] text-emerald-300">
                      <strong>{importedCount}</strong> numbers imported from <strong>{importedFileName}</strong>
                    </span>
                  </div>
                  <button
                    onClick={handleRemoveImported}
                    disabled={isSending}
                    className="p-1 rounded hover:bg-white/10 text-surface-400 hover:text-white transition-colors disabled:opacity-50"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ─── Recipients Summary ─── */}
          <div className="bg-[#0d1117] border border-white/[0.06] rounded-2xl p-6 shadow-xl">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-white">
                Recipients ({recipients.length}/{MAX_RECIPIENTS})
              </h4>
            </div>
            <div className="flex flex-wrap gap-2 max-h-[180px] overflow-y-auto pr-2 custom-scrollbar">
              {recipients.length === 0 ? (
                <p className="text-sm text-surface-500">No recipients yet.</p>
              ) : (
                <div className="text-[12px] text-surface-300 space-y-2 w-full">
                  <div className="flex flex-wrap gap-2">
                    {recipients.slice(0, 20).map(phone => (
                      <span key={phone} className="px-2.5 py-1 rounded-md bg-surface-800 border border-white/[0.04] text-[11px] text-surface-300 tabular-nums">
                        {formatPhoneDisplay(phone)}
                      </span>
                    ))}
                    <span className="px-2.5 py-1 rounded-md bg-brand-600/20 border border-brand-500/20 text-[11px] text-brand-400 font-semibold">
                      +{Math.max(0, recipients.length - 20)} more
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ─── Compose & Send ─── */}
          <div className="bg-[#0d1117] border border-white/[0.06] rounded-2xl p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-sm font-semibold text-white">Select Campaign Template</h4>
            </div>

            <div className="relative mb-6">
              <select
                value={selectedTemplate}
                onChange={(e) => setSelectedTemplate(e.target.value)}
                disabled={isSending}
                className="w-full bg-surface-950 border border-white/[0.08] rounded-xl px-4 py-3 text-[13px] text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50 appearance-none disabled:opacity-50"
              >
                <option value="fo_new_customers">New Customer Campaign (₹100 Credit)</option>
                <option value="for_existingusers">Retention Campaign (₹80 Credit)</option>
              </select>
            </div>

            {/* Send Progress */}
            {isSending && (
              <div className="mb-4 space-y-4">
                <div className="px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-[12px] text-amber-300 leading-relaxed">
                    <strong>Warning:</strong> Do not minimize this tab or switch windows while sending. Browsers put inactive tabs to sleep, which will pause your campaign!
                  </p>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[12px]">
                  <span className="text-surface-400 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 animate-spin" />
                    Sending in batches of {BATCH_SIZE} ({BATCH_DELAY_MS / 1000}s delay)...
                  </span>
                  <span className="text-white font-semibold tabular-nums">
                    {sendProgress.sent + sendProgress.failed} / {sendProgress.total}
                  </span>
                </div>
                <div className="w-full h-2 bg-surface-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-brand-600 to-brand-400 rounded-full transition-all duration-300"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-emerald-400">{sendProgress.sent} sent</span>
                  {sendProgress.failed > 0 && (
                    <span className="text-red-400">{sendProgress.failed} failed</span>
                  )}
                </div>
                </div>
              </div>
            )}
            
            <div className="flex items-center justify-between gap-4">
              <p className="text-[11px] text-surface-500 leading-relaxed">
                <strong className="text-amber-400">Note:</strong> Batches of {BATCH_SIZE} with {BATCH_DELAY_MS / 1000}s delay. Ensure recipients have opted in.
              </p>
              <div className="flex items-center gap-2 shrink-0">
                {isSending && (
                  <>
                    <button
                      onClick={handlePauseToggle}
                      className={cn(
                        "px-4 py-2.5 rounded-xl font-semibold text-[12px] transition-colors border",
                        isPaused
                          ? "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border-emerald-500/20"
                          : "bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 border-amber-500/20"
                      )}
                    >
                      {isPaused ? 'Resume' : 'Pause'}
                    </button>
                    <button
                      onClick={handleAbort}
                      className="px-4 py-2.5 rounded-xl bg-red-500/20 text-red-400 font-semibold text-[12px] hover:bg-red-500/30 transition-colors border border-red-500/20"
                    >
                      Stop
                    </button>
                  </>
                )}
                <button
                  onClick={handlePreSend}
                  disabled={isSending || recipients.length === 0 || !selectedTemplate || cooldownLeft > 0}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-brand-600 text-white font-semibold text-[13px] hover:bg-brand-500 transition-all disabled:opacity-50 shadow-lg shadow-brand-500/25"
                >
                  {isSending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Sending...
                    </>
                  ) : cooldownLeft > 0 ? (
                    <>
                      <Clock className="w-4 h-4" />
                      Cooldown {Math.floor(Math.ceil(cooldownLeft / 1000) / 60)}:{String(Math.ceil(cooldownLeft / 1000) % 60).padStart(2, '0')}
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
            </>
          )}
        </div>
      </div>
    </div>
  )
}
