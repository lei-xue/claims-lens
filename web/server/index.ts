// load .env in development; production passes real environment variables
try {
  process.loadEnvFile()
} catch {
  /* no .env file */
}
// Production entry: serves the built SPA and the API from one process.
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { app as api } from './app'

const root = new Hono()
root.use('*', async (c, next) => {
  await next()
  c.header('X-Content-Type-Options', 'nosniff')
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin')
  c.header('X-Frame-Options', 'DENY')
})
root.route('/', api)
root.use('/assets/*', serveStatic({ root: './dist', onFound: (_p, c) => c.header('Cache-Control', 'public, max-age=31536000, immutable') }))
root.use('/*', serveStatic({ root: './dist' }))
root.get('*', serveStatic({ path: './dist/index.html' }))

const port = Number(process.env.PORT ?? 3000)
serve({ fetch: root.fetch, port }, () => console.log(`claims-lens listening on :${port}`))
