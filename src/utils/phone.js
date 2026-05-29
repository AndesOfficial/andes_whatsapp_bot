export const formatPhoneDisplay = (phone) => {
  if (!phone) return ''
  const clean = phone.replace(/\D/g, '')
  if (clean.length === 12 && clean.startsWith('91')) {
    return `+91 ${clean.slice(2, 7)} ${clean.slice(7)}`
  }
  return phone
}
