import { readFileSync } from 'node:fs'
const B='https://staging.milesvault.com', TOK=process.env.TEST_USER_TOKEN, CK=`mv-test-token=${encodeURIComponent(TOK)}`
const H={cookie:CK,'content-type':'application/json'}
const imgs=JSON.parse(readFileSync(process.argv[2],'utf8')).images
await fetch(`${B}/api/test/reset`,{method:'POST',headers:H})
await fetch(`${B}/api/ledger/journal/batch`,{method:'PUT',headers:H,body:JSON.stringify({knownIds:[],buffer:'2026-01-01 open Liabilities:CreditCards:HSBC:Premier INR\n'})})
const c=await (await fetch(`${B}/api/statements`,{method:'POST',headers:H,body:JSON.stringify({filename:'hsbc.pdf',text:'HSBC PREMIER statement',images:imgs,mode:'inbox'})})).json()
const id=c.id; if(!id){console.log('POST failed',JSON.stringify(c));process.exit(1)}
let row
for(let i=0;i<70;i++){
  const cs=await (await fetch(`${B}/api/ledger/captures`,{headers:{cookie:CK}})).json()
  row=(cs.rows||[]).find(x=>x.id===id)
  if(row?.state==='extracted'||row?.draft_error)break
  await new Promise(r=>setTimeout(r,6000))
}
console.log('FINAL:',row?.state,'| err:',(row?.draft_error||'').slice(0,250))
const d=JSON.parse(row?.drafts||'[]')
console.log('entries:',d.length)
d.forEach((e,i)=>console.log('['+i+'] '+e.replace(/\n/g,' / ')))
