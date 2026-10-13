import { useEffect, useState } from 'react'
import { CodeDrawerProvider } from './components/CodeDrawer'
import { api, AuthContext, initials, type User } from './lib/api'
import Inspect from './pages/Inspect'
import CodesPage from './pages/Codes'
import Denials from './pages/Denials'
import About from './pages/About'
import Login from './pages/Login'
import Worklist from './pages/Worklist'
import Remittances from './pages/Remittances'

function useRoute() {
  const get = () => location.hash.replace(/^#/, '') || '/'
  const [r, set] = useState(get)
  useEffect(() => {
    const on = () => {
      set(get())
      if (!/^\/work\/\d+/.test(get())) window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return r
}

const PRIVATE = ['/work', '/remits', '/analytics']

export default function App() {
  const route = useRoute()
  const [user, setUser] = useState<User | null>(null)
  const [checked, setChecked] = useState(false)
  const [menu, setMenu] = useState(false)
  useEffect(() => setMenu(false), [route])
  useEffect(() => {
    api<{ user: User }>('/me').then((r) => setUser(r.user), () => setUser(null)).finally(() => setChecked(true))
    const out = () => setUser(null)
    window.addEventListener('cl:signed-out', out)
    return () => window.removeEventListener('cl:signed-out', out)
  }, [])

  const parts = route.split('/')
  const path = '/' + (parts[1] ?? '')
  const signOut = async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => {})
    setUser(null)
    location.hash = '#/'
  }

  let page
  if (!checked) page = <div className="empty">Loading…</div>
  else if (path === '/inspect') page = <Inspect />
  else if (path === '/codes') page = <CodesPage query={decodeURIComponent(parts[2] ?? '')} />
  else if (path === '/about') page = <About />
  else if (!user || path === '/login') page = <Login />
  else if (path === '/remits') page = <Remittances />
  else if (path === '/analytics') page = <Denials />
  else page = <Worklist selected={parts[2] ? Number(parts[2]) : undefined} />

  const tabs: [string, string][] = user
    ? [['/work', 'Worklist'], ['/remits', 'Remittances'], ['/analytics', 'Analytics'], ['/inspect', 'Inspector'], ['/codes', 'Codes']]
    : [['/', 'Sign in'], ['/inspect', 'Inspector'], ['/codes', 'Codes'], ['/about', 'How it works']]
  const active = (p: string) => (p === path || (p === '/work' && path === '/') || (p === '/' && (path === '/login' || (!user && PRIVATE.includes(path)))) ? 'on' : '')

  return (
    <AuthContext.Provider value={{ user, setUser }}>
      <CodeDrawerProvider>
        <header className="top">
          <div className="top-in">
            <a className="logo" href={user ? '#/work' : '#/'}>
              <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true">
                <rect width="32" height="32" rx="8" fill="#162029" />
                <circle cx="14" cy="14" r="7" fill="none" stroke="#2dd4bf" strokeWidth="3" />
                <path d="M19 19l6 6" stroke="#2dd4bf" strokeWidth="3" strokeLinecap="round" />
                <path d="M11 14h6" stroke="#e6edf3" strokeWidth="2" strokeLinecap="round" />
              </svg>
              Claims Lens
            </a>
            <button className="btn menu-btn" aria-expanded={menu} aria-controls="main-nav" onClick={() => setMenu(!menu)}>
              {tabs.find(([p]) => active(p))?.[1] ?? 'Menu'} <span aria-hidden="true">▾</span>
            </button>
            <nav id="main-nav" className={`tabs ${menu ? 'open' : ''}`} aria-label="Main">
              {tabs.map(([p, label]) => (
                <a key={p} href={`#${p}`} className={active(p)} aria-current={active(p) ? 'page' : undefined}>
                  {label}
                </a>
              ))}
            </nav>
            {user ? (
              <div className="user-menu">
                <span className="avatar sm" aria-hidden="true">{initials(user.name)}</span>
                <span className="small hide-sm">{user.name} <span className="muted">· {user.role}</span></span>
                <button className="btn ghost" onClick={signOut}>Sign out</button>
              </div>
            ) : (
              <a className="btn ghost gh small" href="https://github.com/lei-xue/claims-lens" target="_blank" rel="noreferrer">GitHub ↗</a>
            )}
          </div>
        </header>
        <main className={`wrap ${path === '/work' || path === '/' && user ? 'wide' : ''}`}>{page}</main>
        <footer className="wrap">
          <p className="small muted">
            <a href="mailto:hi@leixue.dev">hi@leixue.dev</a>
          </p>
        </footer>
      </CodeDrawerProvider>
    </AuthContext.Provider>
  )
}
