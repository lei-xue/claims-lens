import { useState } from 'react'
import { api, useAuth, type User } from '../lib/api'

const DEMO = [
  { email: 'dana@demo.claimslens.dev', name: 'Dana Kim', role: 'Biller' },
  { email: 'jordan@demo.claimslens.dev', name: 'Jordan Lee', role: 'Biller' },
  { email: 'alex@demo.claimslens.dev', name: 'Alex Morgan', role: 'Manager — can approve large write-offs and reopen closed work' },
]
const DEMO_PASSWORD = 'demo1234!'

export default function Login() {
  const { setUser } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const signIn = async (e: string, p: string) => {
    setBusy(true)
    setError('')
    try {
      const { user } = await api<{ user: User }>('/auth/login', { method: 'POST', json: { email: e, password: p } })
      setUser(user)
      if (!location.hash || location.hash === '#/' || location.hash.startsWith('#/login')) location.hash = '#/work'
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="landing">
      <section className="landing-copy">
        <span className="eyebrow">Denial management for physician billing teams</span>
        <h1>Every denied dollar, worked to a finish.</h1>
        <p className="lead">
          Claims Lens imports 835 remittances, matches them to the 837 claims you sent, and turns every denial into a work item — explained in plain English, with the fix, the appeal deadline and an audit trail.
        </p>
        <ul className="features">
          <li><b>Auto-reconciliation</b> — each service line: billed, allowed, paid and why.</li>
          <li><b>Worklist</b> — assign, correct &amp; resubmit (frequency-7 837P), draft appeals, write off with manager approval.</li>
          <li><b>Closed loop</b> — when the corrected claim is paid on a later 835, the denial resolves itself and the recovery is counted.</li>
        </ul>
        <a className="btn" href="#/inspect">Try the file inspector without signing in →</a>
      </section>

      <section className="panel pad login-card" aria-labelledby="signin">
        <h2 id="signin">Sign in to the demo</h2>
        <p className="small muted" style={{ marginTop: 4 }}>A fictional practice with ~200 days of claims. Data resets nightly.</p>
        <div className="stack" style={{ marginTop: 16 }}>
          {DEMO.map((d) => (
            <button key={d.email} className="demo-user" disabled={busy} onClick={() => signIn(d.email, DEMO_PASSWORD)}>
              <span className="avatar">{d.name.split(' ').map((w) => w[0]).join('')}</span>
              <span>
                <b>{d.name}</b>
                <span className="small muted" style={{ display: 'block' }}>{d.role}</span>
              </span>
              <span className="mono small" aria-hidden="true">→</span>
            </button>
          ))}
        </div>
        <form
          className="stack"
          style={{ marginTop: 20 }}
          onSubmit={(e) => {
            e.preventDefault()
            signIn(email, password)
          }}
        >
          <label className="field">
            <span>Email</span>
            <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label className="field">
            <span>Password</span>
            <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="btn primary" disabled={busy} type="submit">{busy ? 'Signing in…' : 'Sign in'}</button>
          <p className="small muted">Demo password for all accounts: <span className="mono">{DEMO_PASSWORD}</span></p>
        </form>
      </section>
    </div>
  )
}
