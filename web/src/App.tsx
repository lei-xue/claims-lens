import { useEffect, useState } from 'react'
import { CodeDrawerProvider } from './components/CodeDrawer'
import Inspect from './pages/Inspect'
import CodesPage from './pages/Codes'
import Denials from './pages/Denials'
import About from './pages/About'

function useRoute() {
  const get = () => location.hash.replace(/^#/, '') || '/'
  const [r, set] = useState(get)
  useEffect(() => {
    const on = () => {
      set(get())
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return r
}

const TABS = [
  ['/', 'Inspect a file'],
  ['/denials', 'Denial analytics'],
  ['/codes', 'Code lookup'],
  ['/about', 'How it works'],
] as const

export default function App() {
  const route = useRoute()
  const path = '/' + (route.split('/')[1] ?? '')
  const page = path === '/codes' ? <CodesPage query={decodeURIComponent(route.split('/')[2] ?? '')} /> : path === '/denials' ? <Denials /> : path === '/about' ? <About /> : <Inspect />
  return (
    <CodeDrawerProvider>
      <header className="top">
        <div className="top-in">
          <a className="logo" href="#/">
            <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true">
              <rect width="32" height="32" rx="8" fill="#14121f" />
              <circle cx="14" cy="14" r="7" fill="none" stroke="#8b7bff" strokeWidth="3" />
              <path d="M19 19l6 6" stroke="#8b7bff" strokeWidth="3" strokeLinecap="round" />
              <path d="M11 14h6" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
            </svg>
            Claims Lens
          </a>
          <nav className="tabs">
            {TABS.map(([p, label]) => (
              <a key={p} href={`#${p}`} className={path === p ? 'on' : ''}>
                {label}
              </a>
            ))}
          </nav>
          <a className="btn ghost gh small" href="https://github.com/lei-xue/claims-lens" target="_blank" rel="noreferrer">
            GitHub ↗
          </a>
        </div>
      </header>
      <main className="wrap">{page}</main>
    </CodeDrawerProvider>
  )
}
