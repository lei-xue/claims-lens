// HTTP API. Session cookie auth; every mutating route requires a signed-in user.
import { Hono, type Context } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { z } from 'zod'
import { getDb } from './db'
import { login, logout, SESSION_DAYS, userForToken, type PublicUser } from './services/auth'
import { import835, import837, ImportError } from './services/imports'
import { analytics, denialDetail, kpis, lookups, remittanceList, remittanceRaw, worklist } from './services/queries'
import { addNote, assign, correctedClaim, draftAppeal, setStatus, WorkflowError } from './services/workflow'

type Env = { Variables: { user: PublicUser } }
const COOKIE = 'cl_session'
const MAX_UPLOAD = 2_000_000

export const app = new Hono<Env>().basePath('/api')

app.onError((err, c) => {
  if (err instanceof ImportError || err instanceof WorkflowError) return c.json({ error: err.message }, err.status as 400)
  if (err instanceof z.ZodError) return c.json({ error: 'Invalid request', details: err.issues }, 400)
  console.error(err)
  return c.json({ error: 'Something went wrong' }, 500)
})

// tiny per-IP limiter for login attempts
const attempts = new Map<string, { n: number; until: number }>()
function ipOf(c: Context) {
  // behind the Cloudflare tunnel only CF-Connecting-IP is trustworthy
  return c.req.header('cf-connecting-ip') ?? 'local'
}

app.post('/auth/login', async (c) => {
  const ip = ipOf(c)
  const a = attempts.get(ip)
  if (a && a.n >= 10 && a.until > Date.now()) return c.json({ error: 'Too many attempts — try again in a few minutes.' }, 429)
  const body = z.object({ email: z.string().max(200), password: z.string().max(200) }).parse(await c.req.json())
  const res = await login(getDb(), body.email, body.password)
  if (!res) {
    attempts.set(ip, { n: (a && a.until > Date.now() ? a.n : 0) + 1, until: Date.now() + 10 * 60000 })
    return c.json({ error: 'Email or password is incorrect.' }, 401)
  }
  attempts.delete(ip)
  setCookie(c, COOKIE, res.token, { httpOnly: true, sameSite: 'Lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: SESSION_DAYS * 86400 })
  return c.json({ user: res.user })
})

app.post('/auth/logout', async (c) => {
  await logout(getDb(), getCookie(c, COOKIE))
  deleteCookie(c, COOKIE, { path: '/' })
  return c.json({ ok: true })
})

app.use('*', async (c, next) => {
  const user = await userForToken(getDb(), getCookie(c, COOKIE))
  if (!user) return c.json({ error: 'Sign in required' }, 401)
  c.set('user', user)
  await next()
})

app.get('/me', (c) => c.json({ user: c.get('user') }))
app.get('/kpis', async (c) => c.json(await kpis(getDb())))
app.get('/lookups', async (c) => c.json(await lookups(getDb())))
app.get('/analytics', async (c) => c.json(await analytics(getDb())))

const listQuery = z.object({
  status: z.string().optional(),
  payer: z.coerce.number().int().optional(),
  category: z.string().max(60).optional(),
  owner: z.union([z.literal('me'), z.literal('none'), z.coerce.number().int()]).optional(),
  age: z.enum(['0-30', '31-60', '61-90', '90+']).optional(),
  q: z.string().max(80).optional(),
  sort: z.enum(['age', 'amount', 'appealBy']).optional(),
  page: z.coerce.number().int().min(1).max(1000).optional(),
})
app.get('/denials', async (c) => c.json(await worklist(getDb(), listQuery.parse(c.req.query()), c.get('user').id)))

const idParam = (c: Context) => z.coerce.number().int().positive().parse(c.req.param('id'))
app.get('/denials/:id', async (c) => {
  const d = await denialDetail(getDb(), idParam(c))
  return d ? c.json(d) : c.json({ error: 'Not found' }, 404)
})
app.post('/denials/:id/assign', async (c) => {
  const { ownerId } = z.object({ ownerId: z.number().int().nullable() }).parse(await c.req.json())
  await assign(getDb(), idParam(c), ownerId, c.get('user').id)
  return c.json({ ok: true })
})
app.post('/denials/:id/status', async (c) => {
  const b = z.object({
    status: z.enum(['new', 'in_progress', 'resubmitted', 'appealed', 'resolved', 'written_off']),
    note: z.string().max(2000).optional(),
    recovered: z.number().min(0).optional(),
  }).parse(await c.req.json())
  await setStatus(getDb(), idParam(c), b.status, c.get('user'), b)
  return c.json({ ok: true })
})
app.post('/denials/:id/notes', async (c) => {
  const { text } = z.object({ text: z.string().min(1).max(2000) }).parse(await c.req.json())
  await addNote(getDb(), idParam(c), text, c.get('user').id)
  return c.json({ ok: true })
})
app.post('/denials/:id/resubmit', async (c) => {
  const { edits } = z.object({
    edits: z.array(z.object({ lineId: z.number().int(), modifiers: z.array(z.string().regex(/^[A-Z0-9]{2}$/)).max(4).optional(), procedure: z.string().regex(/^[A-Z0-9]{5}$/).optional() })).max(50).default([]),
  }).parse(await c.req.json().catch(() => ({})))
  const text = await correctedClaim(getDb(), idParam(c), c.get('user').id, edits)
  return c.json({ x837: text })
})
app.post('/denials/:id/appeal', async (c) => {
  const { argument } = z.object({ argument: z.string().max(4000).default('') }).parse(await c.req.json().catch(() => ({})))
  return c.json({ letter: await draftAppeal(getDb(), idParam(c), c.get('user').id, argument) })
})

app.get('/remittances', async (c) => c.json(await remittanceList(getDb())))
app.get('/remittances/:id/raw', async (c) => {
  const raw = await remittanceRaw(getDb(), idParam(c))
  return raw ? c.text(raw) : c.json({ error: 'Not found' }, 404)
})

async function readUpload(c: Context) {
  const text = await c.req.text()
  if (text.length > MAX_UPLOAD) throw new ImportError('File is larger than 2 MB.', 413)
  if (!text.trim()) throw new ImportError('The file is empty.')
  return text
}
app.post('/import/835', async (c) => c.json(await import835(getDb(), await readUpload(c), c.get('user').id, c.req.query('name')?.slice(0, 120))))
app.post('/import/837', async (c) => c.json(await import837(getDb(), await readUpload(c), c.get('user').id)))
