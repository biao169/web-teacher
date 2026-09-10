import { defineConfig, devices } from '@playwright/test'
const baseURL=process.env.CMS_E2E_BASE_URL
if(!baseURL || !/^https:\/\/127\.0\.0\.1:\d+$/u.test(baseURL))throw new Error('Run pnpm test:e2e:production; this suite must not target a real website')
const requestedBrowser=process.env.CMS_E2E_BROWSER
if(requestedBrowser && requestedBrowser!=='chromium' && requestedBrowser!=='firefox')throw new Error('CMS_E2E_BROWSER must be chromium or firefox')
const browserName=requestedBrowser==='firefox'?'firefox':'chromium'
const desktopDevice=browserName==='firefox'?devices['Desktop Firefox']:devices['Desktop Chrome']
const grep=process.env.CMS_E2E_GREP
export default defineConfig({
  testDir:'./tests/production',
  outputDir:process.env.CMS_E2E_OUTPUT ?? '.tmp/playwright-artifacts',
  fullyParallel:false,
  workers:1,
  retries:0,
  forbidOnly:true,
  ...(grep?{grep:new RegExp(grep,'u')}:{}),
  timeout:45000,
  reporter:[['list'],['json',{outputFile:process.env.CMS_E2E_RESULT ?? 'reports/stage10b/production-playwright.json'}]],
  use:{baseURL,ignoreHTTPSErrors:true,trace:'off',screenshot:'only-on-failure'},
  projects:[
    {name:`${browserName}-production`,use:{...desktopDevice,browserName}},
    {name:`mobile-${browserName}-production`,use:{...devices['Pixel 7'],browserName}},
  ],
  // The runner owns a fresh production process and a fresh database; no reuseExistingServer.
})
