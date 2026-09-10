import { createServer } from 'node:http'

const port = Number(process.env.CMS_FAKE_TRANSLATION_PORT ?? 8124)
let calls = 0
let failures = 0
let failFirst = process.env.CMS_FAKE_TRANSLATION_FAIL_FIRST === '1'

const server = createServer(async (request, response) => {
  if (request.method === 'GET' && request.url === '/stats') {
    response.setHeader('content-type', 'application/json')
    response.end(JSON.stringify({ calls, failures }))
    return
  }
  if (request.method !== 'POST' || request.url !== '/translate') {
    response.statusCode = 404
    response.end('not found')
    return
  }
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  let body
  try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')) }
  catch { response.statusCode = 400; response.end('invalid json'); return }
  const values = Array.isArray(body?.q) ? body.q : [body?.q]
  if (values.some(value => typeof value !== 'string') || body?.source !== 'zh' || body?.target !== 'en') {
    response.statusCode = 422
    response.end('invalid translation payload')
    return
  }
  calls++
  if (failFirst) {
    failFirst = false
    failures++
    response.statusCode = 503
    response.setHeader('content-type', 'application/json')
    response.end(JSON.stringify({ error: 'intentional first-call failure' }))
    return
  }
  response.setHeader('content-type', 'application/json')
  response.end(JSON.stringify({ translatedText: values.map(value => `EN:${value}`) }))
})

server.listen(port, '127.0.0.1', () => process.stdout.write(`fake translation provider listening on ${port}\n`))
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)))
