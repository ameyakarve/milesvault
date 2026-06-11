import { chromium } from '@playwright/test'
const T=process.env.TEST_USER_TOKEN, B='https://staging.milesvault.com'
const b=await chromium.launch(); const c=await b.newContext({viewport:{width:1100,height:1000}})
await c.addCookies([{name:'mv-test-token',value:encodeURIComponent(T),url:B}])
const p=await c.newPage(); await p.goto(`${B}/`,{waitUntil:'networkidle'}); await p.waitForTimeout(2500)
await p.screenshot({path:'/tmp/vault-final.png',fullPage:true}); await b.close(); console.log('shot')
