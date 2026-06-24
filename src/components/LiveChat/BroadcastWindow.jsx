import { useState, useRef, useCallback } from 'react'
import { Megaphone, Users, Loader2, Send, Upload, FileSpreadsheet, X, AlertTriangle, CheckCircle2, Clock, ShieldCheck, Info, Image, Link2, Trash2 } from 'lucide-react'
import { formatPhoneDisplay } from '../../utils/phone'
import { cn } from '../../utils/cn'
import * as XLSX from 'xlsx'
import { storage } from '../../firebase'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'

// ─── Constants ───────────────────────────────────────────────────
const MAX_FILE_SIZE_MB = 5
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024
const MAX_CELLS_SCAN = 10000
const MAX_RECIPIENTS = 500
const MAX_MESSAGE_LENGTH = 1024
const BATCH_SIZE = 10
const BATCH_DELAY_MS = 3000 // 3s between batches
const DAILY_LIMIT = 1000
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
  const [draft, setDraft] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [sendProgress, setSendProgress] = useState({ sent: 0, failed: 0, total: 0 })
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
  const cooldownTimerRef = useRef(null)

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

  const handleInsertLink = () => {
    const url = prompt('Enter the URL to include in your message:')
    if (url && url.trim()) {
      setDraft(prev => {
        const newDraft = prev + (prev.length > 0 && !prev.endsWith('\n') && !prev.endsWith(' ') ? '\n' : '') + url.trim()
        return newDraft.slice(0, MAX_MESSAGE_LENGTH)
      })
    }
  }

  const handleDraftChange = (e) => {
    const val = e.target.value
    if (val.length <= MAX_MESSAGE_LENGTH) {
      setDraft(val)
    }
  }

  // ─── Pre-send Validation ──────────────────────────────────────
  const handlePreSend = () => {
    if (!draft.trim() || recipients.length === 0) return

    // Check cooldown
    const cooldown = getCooldownRemaining()
    if (cooldown > 0) {
      setCooldownLeft(cooldown)
      startCooldownTimer()
      return
    }

    // Check daily limit
    const remaining = getDailyRemaining()
    if (remaining <= 0) {
      setImportError('Daily sending limit reached (1000 messages). Try again tomorrow.')
      return
    }

    if (recipients.length > remaining) {
      setImportError(`Only ${remaining} messages remaining in today's quota. Reduce recipients or try again tomorrow.`)
      return
    }

    // Show confirmation dialog
    setShowConfirm(true)
  }

  // ─── Confirmed Send ───────────────────────────────────────────
  const handleConfirmedSend = async () => {
    setShowConfirm(false)
    const message = draft.trim()
    const imageUrl = attachedImage?.url || null
    setIsSending(true)
    abortRef.current = false
    setSendProgress({ sent: 0, failed: 0, total: recipients.length })

    let sent = 0
    let failed = 0

    for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
      if (abortRef.current) break

      const batch = recipients.slice(i, i + BATCH_SIZE)
      const results = await Promise.allSettled(
        batch.map(async (phone) => {
          const payload = { phone, message }
          if (imageUrl) payload.imageUrl = imageUrl
          const res = await fetch(`${import.meta.env.VITE_BOT_SERVER_URL}/send`, {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'X-API-Secret': import.meta.env.VITE_BOT_API_SECRET || ''
            },
            body: JSON.stringify(payload),
          })
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
        })
      )

      for (const r of results) {
        if (r.status === 'fulfilled') sent++
        else failed++
      }
      setSendProgress({ sent, failed, total: recipients.length })

      // Delay between batches
      if (i + BATCH_SIZE < recipients.length && !abortRef.current) {
        await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS))
      }
    }

    // Update daily count and set cooldown
    addToDailyCount(sent + failed)
    setCooldownStart()
    setCooldownLeft(COOLDOWN_MS)
    startCooldownTimer()

    setIsSending(false)
    await onSend(message, { sent, failed, recipients: recipients, imageUrl })
    handleRemoveImage()
  }

  const handleAbort = () => {
    abortRef.current = true
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
  const cooldownMin = Math.floor(cooldownSec / 60)
  const cooldownSecRemainder = cooldownSec % 60

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
              <div className="px-3 py-2 rounded-lg bg-surface-900">
                <p className="text-[11px] text-surface-400 mb-1">Message preview:</p>
                <p className="text-[12px] text-surface-200 line-clamp-3">"{draft.trim()}"</p>
              </div>
              <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/15">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 mt-0.5 shrink-0" />
                <p className="text-[11px] text-amber-300 leading-relaxed">
                  Messages will be sent via WhatsApp. Ensure recipients have opted in to receive marketing messages. A 5-minute cooldown will apply after this campaign.
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

          {/* ─── Cooldown Banner ─── */}
          {cooldownLeft > 0 && !isSending && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/15">
              <Clock className="w-4 h-4 text-amber-400 shrink-0" />
              <p className="text-[12px] text-amber-300">
                <strong>Cooldown active.</strong> Next campaign available in {cooldownMin > 0 ? `${cooldownMin}m ` : ''}{cooldownSecRemainder}s
              </p>
            </div>
          )}

          {/* ─── Excel Import Card ─── */}
          <div className="bg-[#0d1117] border border-white/[0.06] rounded-2xl p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-brand-400" />
                Import from Excel
              </h4>
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

            <div className="flex items-start gap-2 text-[11px] text-surface-500 mb-3">
              <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-surface-600" />
              <p>
                Upload .xlsx, .xls, or .csv (max {MAX_FILE_SIZE_MB} MB). Phone numbers auto-detected. 10-digit numbers prefixed with +91. Max {MAX_RECIPIENTS} recipients per campaign.
              </p>
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
                {(rejectedCount > 0 || cappedCount > 0) && (
                  <div className="flex flex-wrap gap-3 text-[11px]">
                    {rejectedCount > 0 && (
                      <span className="text-amber-400">⚠ {rejectedCount} invalid numbers skipped</span>
                    )}
                    {cappedCount > 0 && (
                      <span className="text-amber-400">⚠ {cappedCount} numbers trimmed (max {MAX_RECIPIENTS})</span>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ─── Recipients Summary ─── */}
          <div className="bg-[#0d1117] border border-white/[0.06] rounded-2xl p-6 shadow-xl">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-white">
                Recipients ({recipients.length}/{MAX_RECIPIENTS})
              </h4>
              {recipients.length >= MAX_RECIPIENTS && (
                <span className="text-[10px] text-amber-400 font-semibold px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/15">
                  LIMIT REACHED
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-2 max-h-[180px] overflow-y-auto pr-2 custom-scrollbar">
              {recipients.length === 0 ? (
                <p className="text-sm text-surface-500">No recipients yet. Upload an Excel file or select contacts from the sidebar.</p>
              ) : recipients.length > 50 ? (
                <div className="text-[12px] text-surface-300 space-y-2 w-full">
                  <div className="flex flex-wrap gap-2">
                    {recipients.slice(0, 20).map(phone => (
                      <span key={phone} className="px-2.5 py-1 rounded-md bg-surface-800 border border-white/[0.04] text-[11px] text-surface-300 tabular-nums">
                        {formatPhoneDisplay(phone)}
                      </span>
                    ))}
                    <span className="px-2.5 py-1 rounded-md bg-brand-600/20 border border-brand-500/20 text-[11px] text-brand-400 font-semibold">
                      +{recipients.length - 20} more
                    </span>
                  </div>
                </div>
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

          {/* ─── Compose & Send ─── */}
          <div className="bg-[#0d1117] border border-white/[0.06] rounded-2xl p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-sm font-semibold text-white">Compose Message</h4>
              <span className={cn(
                "text-[11px] font-mono tabular-nums",
                draft.length > MAX_MESSAGE_LENGTH * 0.9 ? "text-amber-400" : "text-surface-500"
              )}>
                {draft.length}/{MAX_MESSAGE_LENGTH}
              </span>
            </div>
            <textarea
              value={draft}
              onChange={handleDraftChange}
              disabled={isSending}
              placeholder="Type your marketing message here..."
              className="w-full h-32 bg-surface-950 border border-white/[0.08] rounded-xl p-4 text-[13px] text-white placeholder:text-surface-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50 resize-none disabled:opacity-50"
            />

            {/* Media Toolbar */}
            <div className="flex items-center gap-2 mb-4 mt-2">
              <button
                onClick={() => imageInputRef.current?.click()}
                disabled={isSending || !!attachedImage}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors border",
                  attachedImage
                    ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400 cursor-default"
                    : "bg-white/[0.04] border-white/[0.06] text-surface-400 hover:bg-white/[0.08] hover:text-white disabled:opacity-50"
                )}
              >
                <Image className="w-3.5 h-3.5" />
                {attachedImage ? 'Image attached' : 'Attach Image'}
              </button>
              <input
                ref={imageInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleImageSelect}
                className="hidden"
              />
              <button
                onClick={handleInsertLink}
                disabled={isSending}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06] text-surface-400 text-[11px] font-semibold hover:bg-white/[0.08] hover:text-white transition-colors disabled:opacity-50"
              >
                <Link2 className="w-3.5 h-3.5" />
                Insert Link
              </button>
              <span className="text-[10px] text-surface-600 ml-1">JPG, PNG, WebP · max {MAX_IMAGE_SIZE_MB} MB</span>
            </div>

            {/* Image Preview */}
            {attachedImage && (
              <div className="mb-4 relative inline-block">
                <div className="relative rounded-xl overflow-hidden border border-white/[0.08] bg-surface-900">
                  <img
                    src={attachedImage.preview}
                    alt="Attachment preview"
                    className="max-h-[160px] max-w-full object-contain rounded-xl"
                  />
                  {attachedImage.uploading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-xl">
                      <div className="flex items-center gap-2 text-[12px] text-white">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Uploading...
                      </div>
                    </div>
                  )}
                </div>
                <button
                  onClick={handleRemoveImage}
                  disabled={isSending}
                  className="absolute -top-2 -right-2 flex items-center justify-center w-6 h-6 rounded-full bg-red-500/90 text-white hover:bg-red-500 transition-colors shadow-lg disabled:opacity-50"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Send Progress */}
            {isSending && (
              <div className="mb-4 space-y-2">
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
            )}
            
            <div className="flex items-center justify-between gap-4">
              <p className="text-[11px] text-surface-500 leading-relaxed">
                <strong className="text-amber-400">Note:</strong> Batches of {BATCH_SIZE} with {BATCH_DELAY_MS / 1000}s delay. Ensure recipients have opted in.
              </p>
              <div className="flex items-center gap-2 shrink-0">
                {isSending && (
                  <button
                    onClick={handleAbort}
                    className="px-4 py-2.5 rounded-xl bg-red-500/20 text-red-400 font-semibold text-[12px] hover:bg-red-500/30 transition-colors border border-red-500/20"
                  >
                    Stop
                  </button>
                )}
                <button
                  onClick={handlePreSend}
                  disabled={isSending || recipients.length === 0 || !draft.trim() || cooldownLeft > 0 || (attachedImage && attachedImage.uploading)}
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
                      Cooldown {cooldownMin}:{String(cooldownSecRemainder).padStart(2, '0')}
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
    </div>
  )
}
