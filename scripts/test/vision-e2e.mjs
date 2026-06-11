import { readFileSync } from 'node:fs'
const B='https://staging.milesvault.com', TOK=process.env.TEST_USER_TOKEN, CK=`mv-test-token=${encodeURIComponent(TOK)}`
const H={cookie:CK,'content-type':'application/json'}
const jget=async(u,o)=>{const r=await fetch(u,o);const t=await r.text();try{return JSON.parse(t)}catch{return {__raw:t.slice(0,120),__status:r.status}}}
const imgs=JSON.parse(readFileSync('/tmp/hsbc-images.json','utf8')).images
await jget(`${B}/api/test/reset`,{method:'POST',headers:H})
await jget(`${B}/api/ledger/journal/batch`,{method:'PUT',headers:H,body:JSON.stringify({knownIds:[],buffer:'2026-01-01 open Liabilities:CreditCards:HSBC:Premier INR\n'})})
const c=await jget(`${B}/api/statements`,{method:'POST',headers:H,body:JSON.stringify({filename:'hsbc.pdf',text:'HSBC PREMIER statement','images':imgs,mode:'inbox'})})
const id=c.id; console.log('statement:',id,c.__raw?`(${c.__status} ${c.__raw})`:'')
if(!id)process.exit(1)
let row
for(let i=0;i<70;i++){
  const cs=await jget(`${B}/api/ledger/captures`,{headers:{cookie:CK}})
  row=(cs.rows||[]).find(x=>x.id===id)
  if(i%4===0)console.log(`  [${i}] ${row?.state}`)
  if(row?.state==='extracted'||row?.draft_error)break
  await new Promise(r=>setTimeout(r,6000))
}
console.log('FINAL:',row?.state,'| err:',(row?.draft_error||'').slice(0,200))
const d=JSON.parse(row?.drafts||'[]'); console.log('entries:',d.length)
const pts=d.filter(e=>/POINTS|HSBC-PREMIER/i.test(e))
console.log('points entries:'); pts.slice(0,6).forEach(e=>console.log('  '+e.replace(/\n/g,' / ')))
