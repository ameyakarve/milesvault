import { readFileSync } from 'node:fs'
const B='https://staging.milesvault.com', TOK=process.env.TEST_USER_TOKEN, CK=`mv-test-token=${encodeURIComponent(TOK)}`
const H={cookie:CK,'content-type':'application/json'}
const imgs=JSON.parse(readFileSync('/tmp/hsbc-images.json','utf8')).images
await fetch(`${B}/api/test/reset`,{method:'POST',headers:H})
await fetch(`${B}/api/ledger/journal/batch`,{method:'PUT',headers:H,body:JSON.stringify({knownIds:[],buffer:'2026-01-01 open Liabilities:CreditCards:HSBC:Premier INR\n'})})
const r=await fetch(`${B}/api/statements`,{method:'POST',headers:H,body:JSON.stringify({filename:'hsbc.pdf',text:'HSBC PREMIER statement',images:imgs,mode:'inbox'})})
const {id}=await r.json(); console.log('statement:',id,'http',r.status)
let row
for(let i=0;i<60;i++){
  const cs=await (await fetch(`${B}/api/ledger/captures`,{headers:{cookie:CK}})).json()
  row=cs.rows.find(x=>x.id===id)
  process.stdout.write(`  [${i}] ${row?.state}\n`)
  if(row?.state==='extracted'||row?.draft_error)break
  await new Promise(r=>setTimeout(r,6000))
}
console.log('FINAL:',row?.state,'err:',(row?.draft_error||'').slice(0,200))
const d=JSON.parse(row?.drafts||'[]'); console.log('entries:',d.length)
const pts=d.filter(e=>/POINTS|HSBC-PREMIER/i.test(e)&&/balance|Pending/i.test(e))
console.log('points/balance entries:'); pts.slice(0,6).forEach(e=>console.log('  '+e.replace(/\n/g,' / ')))
