// End-to-end smoke test: drives the complete demo transaction through the real
// UI — seller accepts the leading sealed offer, buyer authorises payment,
// seller ships, watchmaker receives and passes the inspection, admin releases
// settlement, buyer confirms delivery. Run with the preview server up:
//   npm run build && npx vite preview --port 4173 &   node e2e/smoke.mjs
import { chromium } from 'playwright-core'

const BASE = process.env.BASE_URL ?? 'http://localhost:4173'
const executablePath = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const browser = await chromium.launch({ executablePath })
const page = await browser.newPage()
const errors = []
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
page.on('console', (m) => {
  // Ignore external resource noise (e.g. webfonts blocked by a sandbox proxy);
  // fail only on real application errors.
  if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text())
})
page.on('dialog', (d) => d.accept())

const step = async (name, fn) => {
  try {
    await fn()
    console.log('✓', name)
  } catch (e) {
    console.error('✗', name, '\n ', e.message)
    await page.screenshot({ path: 'e2e/failure.png', fullPage: true })
    await browser.close()
    process.exit(1)
  }
}

const signInAs = async (label) => {
  await page.goto(BASE + '/#/signin')
  await page.getByRole('button', { name: new RegExp(label) }).first().click()
  await page.waitForTimeout(300)
}
const signOut = async () => {
  await page.getByRole('button', { name: 'Sign out' }).click()
  await page.waitForTimeout(200)
}

await step('public home renders', async () => {
  await page.goto(BASE + '/#/')
  await page.waitForSelector('text=Sell your watch through verified competition.')
})

await step('seller sees 5 sealed offers on the GMT', async () => {
  await signInAs('Alexandra Chen')
  await page.click('text=GMT-Master II')
  await page.waitForSelector('text=Highest offer')
  const accepts = await page.getByRole('button', { name: 'Accept offer' }).count()
  if (accepts !== 5) throw new Error(`expected 5 active offers, saw ${accepts}`)
})

await step('seller accepts the leading offer (A$22,400)', async () => {
  await page.getByRole('button', { name: 'Accept offer' }).first().click()
  await page.waitForSelector('text=Accept this offer?')
  await page.getByRole('button', { name: /begin secure transaction/ }).click()
  await page.waitForSelector('text=Offer accepted')
  await signOut()
})

await step('buyer authorises payment (simulated escrow)', async () => {
  await signInAs('Priya Nair')
  await page.click('text=authorise payment')
  await page.getByRole('button', { name: /Authorise A\$/ }).click()
  await page.waitForSelector('text=Awaiting shipment from seller')
  await signOut()
})

await step('seller generates insured label and lodges shipment', async () => {
  await signInAs('Alexandra Chen')
  await page.goto(BASE + '/#/seller/transactions')
  await page.click('text=GMT-Master II')
  await page.getByRole('button', { name: 'Generate insured label' }).click()
  await page.getByRole('button', { name: /lodged the package/ }).click()
  await page.waitForSelector('text=In transit to authentication')
  await signOut()
})

await step('watchmaker records arrival and opens inspection', async () => {
  await signInAs('Henrik Larsen')
  await page.getByRole('button', { name: 'Record package arrival' }).click()
  await page.waitForSelector('text=Awaiting inspection')
  await page.click('text=GMT-Master II')
  await page.waitForSelector('text=1. Chain of custody')
})

await step('watchmaker submits report: passed as described', async () => {
  await page.fill('input[placeholder="+2.0 s/day"]', '+1.9 s/day')
  await page.fill('input[placeholder="290°"]', '295°')
  await page.fill('input[placeholder="0.2 ms"]', '0.1 ms')
  const conclusion = page.locator('textarea').last()
  await conclusion.fill('Genuine Rolex GMT-Master II 126710BLNR, full set, movement correct, timekeeping within specification. Passed as described.')
  await page.getByRole('button', { name: /Submit report/ }).click()
  await page.waitForSelector('text=Passed as described')
  await signOut()
})

await step('admin releases settlement and dispatches to buyer', async () => {
  await signInAs('Eleanor Voss')
  await page.goto(BASE + '/#/admin/transactions')
  await page.click('text=GMT-Master II')
  await page.getByRole('button', { name: /Release settlement/ }).click()
  await page.waitForSelector('text=In transit to buyer')
  await signOut()
})

await step('buyer confirms delivery — transaction completes', async () => {
  await signInAs('Priya Nair')
  await page.click('text=confirm delivery')
  await page.getByRole('button', { name: 'Confirm delivery received' }).click()
  await page.waitForSelector('text=Transaction complete')
})

await step('authentication report is viewable by the buyer', async () => {
  await page.getByRole('link', { name: 'Authentication report' }).click()
  await page.waitForSelector('text=Independent Authentication Report')
  await page.waitForSelector('text=Section findings')
})

if (errors.length) {
  console.error('Runtime errors detected:\n' + errors.join('\n'))
  await browser.close()
  process.exit(1)
}
console.log('\nAll steps passed — full transaction lifecycle verified end to end.')
await browser.close()
