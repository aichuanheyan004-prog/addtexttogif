import { readFile } from 'node:fs/promises'

const host = 'www.addtexttogif.net'
const origin = 'https://' + host
const key = 'ed2229b052ae56981ce81fc3c485709414f9c5b265773c110e8955208a183d3c'
const keyLocation = origin + '/' + key + '.txt'
const endpoint = 'https://api.indexnow.org/indexnow'
const args = new Set(process.argv.slice(2))
const live = args.has('--live')
const skipKeyCheck = args.has('--skip-key-check')

const xml = await readFile('public/sitemap.xml', 'utf8')
const urlList = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => match[1].trim())
if (urlList.length === 0) throw new Error('No URLs found in public/sitemap.xml')

const invalid = urlList.filter((url) => {
  try {
    const parsed = new URL(url)
    return parsed.host !== host || parsed.origin !== origin
  } catch {
    return true
  }
})
if (invalid.length > 0) throw new Error('Sitemap contains non-canonical URLs: ' + invalid.join(', '))

if (!live) {
  console.log('[dry-run] IndexNow payload:')
  console.log(JSON.stringify({ host, keyLocation, urlList: [...new Set(urlList)] }, null, 2))
  console.log('Run with --live after production deploy to submit these URLs.')
  process.exit(0)
}

if (!skipKeyCheck) {
  const response = await fetch(keyLocation, { cache: 'no-store' })
  const body = (await response.text()).trim()
  if (!response.ok || body !== key) throw new Error('IndexNow key is not publicly verifiable at ' + keyLocation)
}

const response = await fetch(endpoint, {
  method: 'POST',
  headers: { 'content-type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ host, key, keyLocation, urlList: [...new Set(urlList)] }),
})
const body = await response.text()
if (![200, 202].includes(response.status)) throw new Error('IndexNow submission failed: ' + response.status + ' ' + body)
console.log(JSON.stringify({ submitted: new Set(urlList).size, status: response.status, body }, null, 2))
