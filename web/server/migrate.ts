import 'dotenv/config'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { closeDb, getDb } from './db'

export async function runMigrations() {
  await migrate(getDb(), { migrationsFolder: process.env.MIGRATIONS_DIR ?? './server/db/migrations' })
}

if (process.argv[1]?.match(/migrate\.(ts|c?js)$/)) {
  runMigrations()
    .then(() => console.log('migrations applied'))
    .catch((e) => {
      console.error(e)
      process.exitCode = 1
    })
    .finally(closeDb)
}
