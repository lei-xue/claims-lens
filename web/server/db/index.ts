import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import * as schema from './schema'

export type Db = NodePgDatabase<typeof schema>
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

let pool: pg.Pool | undefined
let db: Db | undefined

export function getDb(): Db {
  if (!db) {
    const url = process.env.DATABASE_URL
    if (!url) throw new Error('DATABASE_URL is not set')
    pool = new pg.Pool({ connectionString: url, max: 8 })
    db = drizzle(pool, { schema })
  }
  return db
}

export async function closeDb() {
  await pool?.end()
  pool = undefined
  db = undefined
}

export { schema }
