// Pass an EDI document between pages (e.g. Denials → Inspect) without a server.
const KEY = 'claimslens.inspect'
export function sendToInspector(text: string) {
  try {
    sessionStorage.setItem(KEY, text)
  } catch {
    /* ignore */
  }
  location.hash = '#/inspect'
}
export function takeHandoff(): string | null {
  try {
    const t = sessionStorage.getItem(KEY)
    sessionStorage.removeItem(KEY)
    return t
  } catch {
    return null
  }
}
