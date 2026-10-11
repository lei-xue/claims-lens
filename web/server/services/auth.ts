import { createHash, randomBytes, scrypt as _scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { and, eq, gt, lt } from 'drizzle-orm'
import { schema, type Db } from '../db'

const scrypt = promisify(_scrypt) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>
const { users, sessions } = schema
export const SESSION_DAYS = 14

export async function hashPassword(pw: string) {
  const salt = randomBytes(16)
  const key = await scrypt(pw, salt, 32)
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`
}

export async function verifyPassword(pw: string, stored: string) {
  const [alg, salt, key] = stored.split('$')
  if (alg !== 'scrypt' || !salt || !key) return false
  const expected = Buffer.from(key, 'base64')
  const got = await scrypt(pw, Buffer.from(salt, 'base64'), expected.length)
  return timingSafeEqual(expected, got)
}

const sha = (s: string) => createHash('sha256').update(s).digest('hex')

export async function login(db: Db, email: string, password: string) {
  const [u] = await db.select().from(users).where(eq(users.email, email.trim().toLowerCase())).limit(1)
  // always run scrypt so timing doesn't reveal whether the email exists
  const ok = await verifyPassword(password, u?.passwordHash ?? 'scrypt$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=')
  if (!u || !ok) return null
  const token = randomBytes(32).toString('base64url')
  await db.insert(sessions).values({ id: sha(token), userId: u.id, expiresAt: new Date(Date.now() + SESSION_DAYS * 86400000) })
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()))
  return { token, user: publicUser(u) }
}

export async function userForToken(db: Db, token: string | undefined) {
  if (!token) return null
  const [row] = await db
    .select({ u: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, sha(token)), gt(sessions.expiresAt, new Date())))
    .limit(1)
  return row ? publicUser(row.u) : null
}

export async function logout(db: Db, token: string | undefined) {
  if (token) await db.delete(sessions).where(eq(sessions.id, sha(token)))
}

export type PublicUser = { id: number; email: string; name: string; role: 'biller' | 'manager' }
const publicUser = (u: typeof users.$inferSelect): PublicUser => ({ id: u.id, email: u.email, name: u.name, role: u.role })
