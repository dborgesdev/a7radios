import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'

const origin = process.env.A7_TEST_ORIGIN ?? 'http://127.0.0.1:8173'
assert.match(origin, /^http:\/\/(?:127\.0\.0\.1|localhost):[0-9]+$/, 'Use a WordPress local descartável.')
const { email, password, categoryId } = JSON.parse(await readFile('.local/local-admin.json', 'utf8'))
const logo = new Blob([await readFile('public/a7-icon.png')], { type: 'image/png' })
const rest = '/app/wp-json/a7-radios/v1'
const ajax = '/app/wp-admin/admin-ajax.php?action=a7r_'
const suffix = randomUUID().slice(0, 8)

function client() {
  const cookies = new Map()
  async function request(path, { method = 'GET', body, headers } = {}) {
    const result = await fetch(origin + path, {
      method, body, redirect: 'manual', headers: {
        ...(method === 'POST' ? { Origin: origin } : {}), ...headers,
        ...(cookies.size ? { Cookie: Array.from(cookies, ([key, value]) => key + '=' + value).join('; ') } : {}),
      },
    })
    for (const cookie of result.headers.getSetCookie()) {
      const [pair] = cookie.split(';')
      const index = pair.indexOf('=')
      const value = pair.slice(index + 1)
      if (!value || value === 'deleted' || /Max-Age=0(;|$)/i.test(cookie)) cookies.delete(pair.slice(0, index))
      else cookies.set(pair.slice(0, index), value)
    }
    return result
  }
  return { request }
}

function form(fields) {
  const data = new FormData()
  for (const [key, value] of Object.entries(fields)) data.set(key, String(value))
  return data
}

async function verify(response, expected) {
  const text = await response.text()
  assert.equal(response.status, expected, text.slice(0, 600))
  return text
}
async function json(response, status) { return JSON.parse(await verify(response, status)) }

async function action(browser, name, fields, expected = 200) {
  const session = await json(await browser.request(ajax + 'session'), 200)
  return json(await browser.request(ajax + name, {
    method: 'POST', body: form({ csrf: session.csrf, ...fields }),
  }), expected)
}

async function owner(label) {
  const browser = client()
  const credentials = { email: 'a7-' + label + '-' + suffix + '@example.test', password }
  await action(browser, 'register', { ...credentials, name: 'DEMO ' + label })
  await action(browser, 'login', credentials)
  const response = await browser.request(ajax + 'session')
  assert.match(response.headers.get('cache-control'), /no-store/)
  const auth = await json(response, 200)
  assert.equal(auth.authenticated, true)
  assert.equal(auth.user.canSubmit, true)
  return { ...browser, nonce: auth.nonce, email: credentials.email }
}

const anon = client()
const admin = client()
const ownerA = await owner('A')
const ownerB = await owner('B')
await action(admin, 'login', { email, password })
await action(anon, 'recover', { email: 'a7-unknown-' + suffix + '@example.test' })
await verify(await anon.request(ajax + 'login', { method: 'POST', body: form({ email, password }) }), 403)
const cleanPanel = await anon.request('/painel/')
assert.match(cleanPanel.headers.get('cache-control'), /no-store/)
assert.match(cleanPanel.headers.get('x-robots-tag'), /noindex/)
await verify(cleanPanel, 200)
await verify(await ownerA.request('/app/wp-admin/admin.php?page=a7r'), 302)
console.log('OK sessão WordPress, criação de duas contas, login, resposta de recuperação, CSRF e painel privado')

const original = 'Rádio DEMO ' + suffix
const revised = 'Rádio Revisada DEMO ' + suffix
const description = 'Descrição sintética para QA de HTML sem JavaScript.'
const headers = { 'X-WP-Nonce': ownerA.nonce }
const settingsResponse = await ownerA.request(rest + '/me/submission-settings', { headers })
assert.match(settingsResponse.headers.get('cache-control'), /no-store/)
const settings = await json(settingsResponse, 200)
assert.match(settings.terms.version, /^(?:demo-|\d{8}-\d{6}-)/)
assert.equal(typeof settings.remoteImages, 'boolean')
const fields = {
  name: original, categoryId, country: 'Brasil', region: 'SP', city: 'Cidade DEMO ' + suffix,
  streamUrl: 'https://stream.example.com/audio', description,
  websiteUrl: 'https://www.example.com/', appDownloadUrl: 'https://www.example.com/app',
  accepted: 1, termsVersion: settings.terms.version, submissionKey: randomUUID(),
}

const upload = form(fields)
upload.set('image', logo, 'demo.png')
await verify(await ownerA.request(rest + '/me/radios', { method: 'POST', body: upload }), 401)
const unsafeImage = form({ ...fields, imageUrl: 'https://127.0.0.1/image.png' })
await verify(await ownerA.request(rest + '/me/radios', { method: 'POST', headers, body: unsafeImage }), 422)
const wrongFile = form(fields)
wrongFile.set('image', new Blob(['A7 DEMO'], { type: 'image/png' }), 'wrong.png')
await verify(await ownerA.request(rest + '/me/radios', { method: 'POST', headers, body: wrongFile }), 422)
const radio = await json(await ownerA.request(rest + '/me/radios', { method: 'POST', headers, body: upload }), 201)
assert.equal(radio.status, 'pending')
assert.equal((await json(await ownerA.request(rest + '/me/radios', { method: 'POST', headers, body: upload }), 200)).id, radio.id)
const page = '/radio/' + radio.slug + '/'
const privatePath = rest + '/me/radios/' + radio.id
const filtered = rest + '/radios?search=' + encodeURIComponent(original)
const mediaRoute = '/app/wp-content/a7-radios-media/'
const originalImage = (await reviewImages())[0]
assert.ok(originalImage, 'Prévia administrativa ausente')
await verify(await anon.request(originalImage.api), 404)
await verify(await anon.request(originalImage.disk), 403)
await verify(await ownerB.request(originalImage.review), 403)
const preview = await admin.request(originalImage.review)
assert.match(preview.headers.get('cache-control'), /no-store/)
assert.match(preview.headers.get('content-type'), /image\/png/)
await verify(preview, 200)
await verify(await anon.request(page), 404)
assert.equal((await json(await anon.request(filtered), 200)).total, 0)
assert.ok(!(await verify(await anon.request('/sitemap.xml'), 200)).includes(radio.slug))
const isolated = await ownerB.request(privatePath, { headers: { 'X-WP-Nonce': ownerB.nonce } })
assert.match(isolated.headers.get('cache-control'), /no-store/)
await verify(isolated, 404)
await verify(await ownerB.request(privatePath + '/revisions', {
  method: 'POST', headers: { 'X-WP-Nonce': ownerB.nonce }, body: form(fields),
}), 404)
console.log('OK submissão idempotente, nova rádio privada, sitemap e isolamento entre titulares')

async function moderationForm() {
  const screen = await verify(await admin.request('/app/wp-admin/admin.php?page=a7r&radio=' + radio.id), 200)
  const nonce = screen.match(/name="_wpnonce" value="([^"]+)"/)?.[1]
  const sequence = screen.match(/name="sequence" value="([^"]+)"/)?.[1]
  assert.ok(nonce && sequence, 'Formulário nativo de moderação ausente')
  return { action: 'a7r_decide', id: radio.id, _wpnonce: nonce, sequence }
}

async function reviewImages() {
  const screen = await verify(await admin.request('/app/wp-admin/admin.php?page=a7r&radio=' + radio.id), 200)
  return [...screen.matchAll(/<img src="([^"]+)" width="96" height="96" alt="Imagem para revisão">/g)].map(match => {
    const url = new URL(match[1].replace(/&#0*38;|&amp;/g, '&'))
    const asset = url.searchParams.get('asset')
    assert.match(asset, /^[a-f0-9]{48}$/)
    return { api: rest + '/images/' + radio.id + '/' + asset, disk: mediaRoute + asset + '.png', review: url.pathname + url.search }
  })
}

async function decide(decision, expected, supplied, reason = 'Decisão DEMO local') {
  const data = supplied ?? await moderationForm()
  return verify(await admin.request('/app/wp-admin/admin-post.php', {
    method: 'POST', body: form({ ...data, decision, reason }),
  }), expected)
}

const initialQueue = await verify(await admin.request('/app/wp-admin/admin.php?page=a7r&status=queue&s=' + radio.id), 200)
const initialBulkNonce = initialQueue.match(/name="_wpnonce" value="([^"]+)"/)?.[1]
const initialSelection = initialQueue.match(/name="selected\[\]" value="([^"]+)"/)?.[1]
assert.ok(initialBulkNonce && initialSelection?.startsWith(String(radio.id) + ':'))
const initialBulk = form({ action: 'a7r_bulk', _wpnonce: initialBulkNonce, decision: 'approve', filter: 'queue' })
initialBulk.append('selected[]', initialSelection)
initialBulk.append('selected[]', '9999999999999999:1')
const initialBulkResponse = await admin.request('/app/wp-admin/admin-post.php', { method: 'POST', body: initialBulk })
await verify(initialBulkResponse, 303)
const bulkReportUrl = new URL(initialBulkResponse.headers.get('location'))
const bulkReport = await verify(await admin.request(bulkReportUrl.pathname + bulkReportUrl.search), 200)
assert.match(bulkReport, /Decisão registrada/)
assert.match(bulkReport, /Rádio indisponível/)
console.log('OK moderação em lote com sucesso e falha parcial no mesmo envio')
const seoResponse = await anon.request(page)
assert.match(seoResponse.headers.get('x-robots-tag'), /noindex/)
const html = await verify(seoResponse, 200)
assert.ok(html.includes('<h1>' + original + '</h1>'))
assert.ok(html.includes(description))
assert.ok(html.includes('<link rel="canonical" href="' + origin + page + '">'))
assert.match(html, /property="og:description"/)
assert.match(html, /name="twitter:card"/)
assert.match(html, /"@type":"WebPage"/)
await verify(await anon.request(page, { method: 'HEAD' }), 200)
await verify(await anon.request(page.slice(0, -1)), 301)
await verify(await anon.request('/radio/inexistente-a7-test/'), 404)
await verify(await anon.request('/rota-inexistente-a7-test/'), 404)
const sitemap = await anon.request('/sitemap.xml')
assert.match(sitemap.headers.get('x-robots-tag'), /noindex/)
assert.ok((await verify(sitemap, 200)).includes(radio.slug))
assert.doesNotMatch(await verify(await anon.request('/robots.txt'), 200), /^Sitemap:/im)
const publicRadio = await json(await anon.request(rest + '/radios/' + radio.slug), 200)
assert.equal(new URL(publicRadio.image.url).pathname, originalImage.api)
assert.equal(publicRadio.city, fields.city)
assert.ok(html.includes(fields.city))
assert.equal((await json(await anon.request(rest + '/radios?search=' + encodeURIComponent(fields.city)), 200)).total, 1)
const ownImage = (await json(await ownerA.request(privatePath, { headers }), 200)).imagePath
await verify(await ownerA.request(ownImage, { headers }), 200)
await verify(await ownerB.request(ownImage, { headers: { 'X-WP-Nonce': ownerB.nonce } }), 404)
await verify(await anon.request(originalImage.disk, { method: 'HEAD' }), 403)
await verify(await anon.request(rest + '/radios/inexistente-a7-test?slug=' + radio.slug), 404)
const image = await anon.request(new URL(publicRadio.image.url).pathname)
assert.equal(image.status, 200)
assert.match(image.headers.get('content-type'), /image\/png/)
const png = Buffer.from(await image.arrayBuffer())
assert.equal(png.toString('ascii', 12, 16), 'IHDR')
assert.equal(png.readUInt32BE(16), 512)
assert.equal(png.readUInt32BE(20), 512)
await verify(await anon.request('/app/'), 200)
await verify(await anon.request('/app/wp-admin/'), 302)
await verify(await anon.request('/app/wp-json/'), 200)
await verify(await anon.request('/app/wp-login.php'), 200)
console.log('OK HTML livre de dependência de JS, status 200/301/404, canonical, OG, Twitter, JSON-LD, imagem, sitemap e rotas /app/')

async function revision(name, replaceImage = false) {
  const current = await json(await ownerA.request(privatePath, { headers }), 200)
  const body = form({ ...fields, name, version: current.version, revisionId: current.revisionId })
  if (replaceImage) body.set('image', logo, 'revision.png')
  return json(await ownerA.request(privatePath + '/revisions', {
    method: 'POST', headers, body,
  }), 201)
}

await revision(revised, true)
const rejectedImage = (await reviewImages())[1]
assert.notEqual(rejectedImage.api, originalImage.api)
await verify(await anon.request(rejectedImage.api), 404)
await verify(await anon.request(rejectedImage.disk), 403)
await verify(await anon.request(originalImage.api, { method: 'HEAD' }), 200)
assert.ok((await verify(await anon.request(page), 200)).includes('<h1>' + original + '</h1>'))
const stale = await moderationForm()
await decide('reject', 303, stale)
await verify(await anon.request(rejectedImage.api), 404)
assert.ok((await verify(await anon.request(page), 200)).includes('<h1>' + original + '</h1>'))
await revision(revised, true)
const replacementImage = (await reviewImages())[1]
assert.notEqual(replacementImage.api, rejectedImage.api)
await decide('approve', 409, stale)
const concurrent = await moderationForm()
const decisions = await Promise.all([1, 2].map(() => admin.request('/app/wp-admin/admin-post.php', {
  method: 'POST', body: form({ ...concurrent, decision: 'approve', reason: '' }),
})))
assert.deepEqual(decisions.map(response => response.status).sort(), [303, 409])
await verify(await anon.request(replacementImage.api, { method: 'HEAD' }), 200)
await verify(await anon.request(rejectedImage.api), 404)
await verify(await anon.request(originalImage.api), 404)
await verify(await anon.request(replacementImage.disk), 403)
assert.ok((await verify(await anon.request(page), 200)).includes('<h1>' + revised + '</h1>'))
const first = await anon.request(rest + '/radios/' + radio.id + '/visit', { method: 'POST' })
await verify(first, 204)
await verify(await anon.request(rest + '/radios/' + radio.id + '/visit', { method: 'POST' }), 204)
assert.equal((await json(await anon.request(rest + '/radios/' + radio.slug), 200)).visitCount, 1)
console.log('OK revisão pendente e rejeitada preservam publicação, aprovação atômica, decisão obsoleta e deduplicação de visitas')

if (process.env.A7_KEEP_DEMO === '1') console.log('DEMO local preservada: ' + origin + page)
else {
  const editor = await verify(await admin.request('/app/wp-admin/admin.php?page=a7r&view=edit&radio=' + radio.id), 200)
  const editNonce = editor.match(/name="_wpnonce" value="([^"]+)"/)?.[1]
  const sequence = editor.match(/name="sequence" value="([^"]+)"/)?.[1]
  assert.ok(editNonce && sequence)
  const adminEdit = { ...fields, name: revised + ' · administração', action: 'a7r_manual_edit', id: radio.id, sequence, _wpnonce: editNonce, reason: 'Correção DEMO' }
  await verify(await admin.request('/app/wp-admin/admin-post.php', { method: 'POST', body: form(adminEdit) }), 303)
  assert.equal((await json(await anon.request(rest + '/radios/' + radio.slug), 200)).name, adminEdit.name)
  await verify(await admin.request('/app/wp-admin/admin-post.php', { method: 'POST', body: form(adminEdit) }), 409)
  await verify(await ownerB.request(privatePath + '/removal', { method: 'POST', headers: { 'X-WP-Nonce': ownerB.nonce }, body: form({ reason: 'Isolamento DEMO' }) }), 404)
  const ownerRemoval = () => ownerA.request(privatePath + '/removal', { method: 'POST', headers, body: form({ reason: 'Pedido privado DEMO' }) })
  await verify(await ownerRemoval(), 201)
  await verify(await ownerRemoval(), 409)
  assert.equal((await json(await ownerA.request(privatePath, { headers }), 200)).removalStatus, 'pending')
  const removal = await anon.request(rest + '/radios/' + radio.id + '/removal', {
    method: 'POST', body: form({ name: 'Solicitante ' + suffix, email: suffix + '@example.test', reason: 'Motivo DEMO', evidence: 'Dados sintéticos para homologação.' }),
  })
  assert.match(removal.headers.get('cache-control'), /no-store/)
  await verify(removal, 201)
  await verify(await anon.request(page), 200)
  await decideRequest('removal', 'Solicitante ' + suffix)
  await verify(await anon.request(page), 404)
  await verify(await anon.request(replacementImage.api), 404)
  assert.ok(!(await verify(await anon.request('/sitemap.xml'), 200)).includes(radio.slug))
  console.log('OK arquivamento retira página e sitemap')
}
if (!process.env.A7_KEEP_DEMO) {
  const category = 'Categoria DEMO ' + suffix
  const suggestion = rest + '/me/category-suggestions'
  const proposal = await json(await ownerB.request(suggestion, { method: 'POST', headers: { 'X-WP-Nonce': ownerB.nonce }, body: form({ name: category }) }), 201)
  await verify(await ownerB.request(suggestion, { method: 'POST', headers: { 'X-WP-Nonce': ownerB.nonce }, body: form({ name: category.toUpperCase() }) }), 409)
  const privateCategories = async () => json(await ownerB.request(rest + '/me/categories', { headers: { 'X-WP-Nonce': ownerB.nonce } }), 200)
  assert.equal((await privateCategories()).some(item => item.name === category), false)
  const categoryUpload = form({ ...fields, name: 'Categoria vinculada DEMO ' + suffix, categoryId: '', categorySuggestion: proposal.id, submissionKey: randomUUID() })
  categoryUpload.set('image', logo, 'demo.png')
  const linked = await json(await ownerB.request(rest + '/me/radios', { method: 'POST', headers: { 'X-WP-Nonce': ownerB.nonce }, body: categoryUpload }), 201)
  assert.equal(linked.categorySuggestion.name, category)
  const queue = await verify(await admin.request('/app/wp-admin/admin.php?page=a7r&status=queue&s=' + linked.id), 200)
  const bulkNonce = queue.match(/name="_wpnonce" value="([^"]+)"/)?.[1]
  const selection = queue.match(/name="selected\[\]" value="([^"]+)"/)?.[1]
  assert.ok(bulkNonce && selection && queue.includes(category))
  const bulk = async (decision, reason) => {
    const data = form({ action: 'a7r_bulk', _wpnonce: bulkNonce, decision, reason, filter: 'queue' })
    data.append('selected[]', selection)
    const result = await admin.request('/app/wp-admin/admin-post.php', { method: 'POST', body: data })
    await verify(result, 303)
    return verify(await admin.request(new URL(result.headers.get('location')).pathname + new URL(result.headers.get('location')).search), 200)
  }
  assert.match(await bulk('approve', ''), /Defina uma categoria válida/)
  const review = await verify(await admin.request('/app/wp-admin/admin.php?page=a7r&radio=' + linked.id), 200)
  const reviewNonce = review.match(/name="_wpnonce" value="([^"]+)"/)?.[1]
  const linkedSequence = selection.split(':')[1]
  const normalized = 'Normalizada DEMO ' + suffix
  await verify(await admin.request('/app/wp-admin/admin-post.php', { method: 'POST', body: form({ action: 'a7r_decide', id: linked.id, sequence: linkedSequence, _wpnonce: reviewNonce, decision: 'approve', createCategory: 1, categoryName: normalized }) }), 303)
  assert.equal((await json(await anon.request(rest + '/radios/' + linked.slug), 200)).category.name, normalized)
  assert.equal((await privateCategories()).some(item => item.name === normalized), true)
  assert.match(await bulk('approve', ''), /A versão mudou/)
  const dashboard = await verify(await admin.request('/app/wp-admin/index.php'), 200)
  assert.match(dashboard, /id="a7r_overview"/)
  console.log('OK sugestões de categorias, solicitações de remoção e widget administrativo')
}

await action(ownerA, 'logout', {})
assert.equal((await json(await ownerA.request(ajax + 'session'), 200)).authenticated, false)
console.log('OK logout encerra a sessão')

await action(anon, 'recover', { email: ownerB.email })
const digest = createHash('sha256').update(ownerB.email.toLowerCase()).digest('hex')
const mail = await readFile('.local/mail/' + digest + '.txt', 'utf8')
const link = new URL(mail.trim().split(/\s+/).at(-1))
assert.equal(link.origin, origin)
assert.equal(link.pathname, '/recuperar-senha/')
const replacement = randomUUID()
await action(anon, 'reset', {
  key: link.searchParams.get('key'), login: link.searchParams.get('login'), password: replacement,
})
await action(anon, 'login', { email: ownerB.email, password }, 401)
await action(anon, 'login', { email: ownerB.email, password: replacement })
await action(anon, 'logout', {})
await action(anon, 'reset', {
  key: link.searchParams.get('key'), login: link.searchParams.get('login'), password: replacement,
}, 400)
console.log('OK reset com chave real do WordPress, capturada localmente, e invalidação após uso')

async function decideRequest(kind, name) {
  const screen = await verify(await admin.request('/app/wp-admin/admin.php?page=a7r-requests&kind=' + kind), 200)
  const panel = screen.split('</form>').find(part => part.includes('<h2>' + name + '</h2>'))
  const nonce = panel?.match(/name="_wpnonce" value="([^"]+)"/)?.[1]
  const record = panel?.match(/name="record" value="([^"]+)"/)?.[1]
  assert.ok(nonce && record, 'Solicitação ausente na fila: ' + name)
  await verify(await admin.request('/app/wp-admin/admin-post.php', {
    method: 'POST', body: form({ action: 'a7r_request_decision', _wpnonce: nonce, record, decision: 'approve', confirmArchive: 1, reason: 'Decisão DEMO local' }),
  }), 303)
}


await verify(await admin.request('/app/wp-admin/edit-tags.php?taxonomy=a7_radio_category&post_type=a7_radio'), 200)
const legal = await verify(await admin.request('/app/wp-admin/admin.php?page=a7r-legal'), 200)
const legalNonce = legal.match(/name="_wpnonce" value="([^"]+)"/)?.[1]
assert.ok(legalNonce)
const legalFields = { action: 'a7r_legal', _wpnonce: legalNonce, document: 'terms', approved: 1, base: settings.terms.version }
const saveLegal = content => admin.request('/app/wp-admin/admin-post.php', {
  method: 'POST', body: form({ ...legalFields, content }),
})
const legalTexts = ['## Texto DEMO um\n\n**Ênfase**', '## Texto DEMO dois\n\n**Ênfase**']
const legalResults = await Promise.all(legalTexts.map(saveLegal))
assert.deepEqual(legalResults.map(response => response.status).sort(), [303, 409])
const publishedLegal = await json(await anon.request(rest + '/terms'), 200)
assert.match(publishedLegal.version, /^\d{8}-\d{6}-[a-f0-9]{8}$/)
assert.notEqual(publishedLegal.version, legalFields.base)
assert.equal(publishedLegal.content.replaceAll('\r\n', '\n'), legalResults[0].status === 303 ? legalTexts[0] : legalTexts[1])
assert.match(publishedLegal.html, /<h3[^>]+>Texto DEMO/)
assert.match(publishedLegal.html, /<strong>Ênfase<\/strong>/)
assert.match(await verify(await anon.request('/termos/'), 200), /<h3[^>]+>Texto DEMO/)
const historyPage = await verify(await admin.request('/app/wp-admin/admin.php?page=a7r-legal'), 200)
assert.ok(historyPage.includes('Versão ' + legalFields.base))
console.log('OK gestão nativa de categorias e publicação imutável de documento jurídico versionado')
