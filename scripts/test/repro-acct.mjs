import { chromium } from '@playwright/test'
const B='https://staging.milesvault.com', T=process.env.TEST_USER_TOKEN
const b=await chromium.launch(); const c=await b.newContext({viewport:{width:1280,height:850}})
await c.addCookies([{name:'mv-test-token',value:encodeURIComponent(T),url:B}])
const p=await c.newPage()
await p.goto(`${B}/editor`,{waitUntil:'networkidle'}); await p.waitForTimeout(2500)
// 1. Update balance modal → open account select
await p.getByText('Update balance',{exact:true}).first().click(); await p.waitForTimeout(800)
await p.getByText('Choose an account').click(); await p.waitForTimeout(600)
await p.screenshot({path:'/tmp/acct-ub.png'})
// try to click the credit card option
const cc = p.getByRole('option').filter({hasText:'CreditCards'})
console.log('UB credit-card options:', await cc.count())
try { await cc.first().click({timeout:2000}); await p.waitForTimeout(400); console.log('UB clicked CC ok') } catch(e){ console.log('UB CC click FAILED:', String(e).slice(0,80)) }
await p.screenshot({path:'/tmp/acct-ub-after.png'})
await b.close()
