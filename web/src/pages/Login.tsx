import { useState } from 'react'
import { api, useAuth, type User } from '../lib/api'

const DEMO = [
  { email: 'dana@demo.claimslens.dev', name: 'Dana Kim', role: 'Biller' },
  { email: 'jordan@demo.claimslens.dev', name: 'Jordan Lee', role: 'Biller' },
  { email: 'alex@demo.claimslens.dev', name: 'Alex Morgan', role: 'Billing manager · sees team workload' },
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
        <span className="eyebrow">Denial management for medical practices</span>
        <h1>Every denied dollar, worked to a finish.</h1>
        <p className="lead">
          See what insurers didn’t pay, why, and what to do next — so your team recovers it before the appeal deadline.
        </p>
        <div className="proof">
          <span><b>Every denial</b> becomes a task with a deadline</span>
          <span><b>Plain-English</b> reason and next step</span>
          <span><b>Closes itself</b> when the payer pays</span>
        </div>
      </section>

      <section className="panel pad login-card" aria-labelledby="signin">
        <h2 id="signin">Try it as…</h2>
        <p className="small muted" style={{ marginTop: 4 }}>A fictional practice, ~200 days of claims. One click, no signup; data resets nightly.</p>
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
        <details className="email-login">
          <summary>Sign in with email instead</summary>
          <form
            className="stack"
            style={{ marginTop: 12 }}
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
            <button className="btn primary" disabled={busy} type="submit">{busy ? 'Signing in…' : 'Sign in'}</button>
          </form>
        </details>
        {error && <p className="form-error" role="alert">{error}</p>}
      </section>
    </div>
  )
}
