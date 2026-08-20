import { createApp, createRouter, defineEventHandler, getRouterParam, toNodeListener } from 'h3'
import { createServer } from 'node:http'

const app = createApp()
const router = createRouter()
router.get('/api/preview/:id', defineEventHandler((event) => {
  const id = getRouterParam(event, 'id')
  return { id }
}))
app.use(router)
const server = createServer(toNodeListener(app))
server.listen(8934, () => console.log('up'))
