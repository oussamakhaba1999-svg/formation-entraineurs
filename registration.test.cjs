const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
function harness(){
 const headers=['Date','Référence','Nom','Prénom','CIN','Téléphone','E-mail','Club / association','Ville','Consentement'];
 const rows=[headers];let held=false,release=0,flushes=0;
 const props={SPREADSHEET_ID:'test-sheet',REGISTRATION_OPEN:'true',PRIVACY_NOTICE:'Test privacy notice'};
 const sheet={getLastRow:()=>rows.length,appendRow:r=>rows.push(r),getRange:(r,c,n,w)=>({getValues:()=>rows.slice(r-1,r-1+n).map(x=>x.slice(c-1,c-1+w)),getDisplayValues:()=>rows.slice(r-1,r-1+n).map(x=>x.slice(c-1,c-1+w).map(String))})};
 const ctx=vm.createContext({PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k]})},SpreadsheetApp:{openById:()=>({getSheetByName:()=>sheet}),flush:()=>flushes++},LockService:{getScriptLock:()=>({tryLock:()=>!held,releaseLock:()=>release++})},Utilities:{getUuid:()=>`test-${rows.length}`}});
 vm.runInContext(fs.readFileSync('Code.gs','utf8'),ctx);
 return {ctx,rows,props,busy:()=>held=true,released:()=>release,flushed:()=>flushes};
}
const valid=(cin='AB123456')=>({nom:'Test',prenom:'Personne',cin,telephone:'06 12 34 56 78',email:'test@example.com',club:'Club test',ville:'Marrakech',consent:true,website:''});
test('valid registration persists once and returns reference without personal details',()=>{const h=harness();const r=h.ctx.registerParticipant(valid());assert.equal(r.ok,true);assert.equal(r.remaining,79);assert.equal(h.rows.length,2);assert.equal(h.flushed(),1);assert.equal(h.released(),1);assert.deepEqual(Object.keys(r).sort(),['ok','reference','remaining']);});
test('CIN normalization prevents a duplicate',()=>{const h=harness();h.ctx.registerParticipant(valid());assert.equal(h.ctx.registerParticipant(valid(' ab 123456 ')).code,'REFUSED');assert.equal(h.rows.length,2);});
test('the 80th registration succeeds and the 81st cannot write',()=>{const h=harness();for(let i=0;i<80;i++)assert.equal(h.ctx.registerParticipant(valid('A'+String(10000+i))).ok,true);assert.equal(h.ctx.registerParticipant(valid('B99999')).code,'FULL');assert.equal(h.rows.length,81);assert.equal(h.ctx.getStatus().available,false);assert.equal(h.ctx.getStatus().remaining,0);});
test('invalid and malicious inputs fail before writing',()=>{for(const change of [{consent:false},{cin:'=1+1'},{telephone:'abc'},{email:'nope'},{nom:' '},{nom:'x'.repeat(101)},{website:'spam'},{ville:'a\u0000b'}]){const h=harness();assert.equal(h.ctx.registerParticipant({...valid(),...change}).code,'INVALID');assert.equal(h.rows.length,1);}});
test('closed or unconfigured privacy blocks collection',()=>{for(const key of ['REGISTRATION_OPEN','PRIVACY_NOTICE']){const h=harness();h.props[key]='';assert.equal(h.ctx.registerParticipant(valid()).code,'CLOSED');assert.equal(h.ctx.getStatus().available,false);assert.equal(h.rows.length,1);}});
test('lock contention prevents a write',()=>{const h=harness();h.busy();assert.equal(h.ctx.registerParticipant(valid()).code,'BUSY');assert.equal(h.rows.length,1);});
test('formula prefixes are neutralized',()=>{const h=harness();assert.equal(h.ctx.registerParticipant({...valid(),club:'=IMPORTXML("x")'}).ok,true);assert.equal(h.rows[1][7][0],"'");assert.equal(h.rows[1][5],"'0612345678".replace("'",''));assert.equal(h.ctx.safeCell_('+212600000000'),"'+212600000000");});
test('backend failures disclose no internals and release lock',()=>{const h=harness();h.ctx.SpreadsheetApp.openById=()=>{throw Error('secret id')};assert.equal(h.ctx.registerParticipant(valid()).code,'UNAVAILABLE');assert.equal(h.released(),1);assert.equal(h.ctx.getStatus().available,false);});
test('frontend includes all required fields and disables standalone collection',()=>{const html=fs.readFileSync('Index.html','utf8');for(const field of ['nom','prenom','cin','telephone','email','club','ville'])assert.ok(html.includes(`name="${field}"`));assert.match(html,/<button id="submit" disabled>/);assert.doesNotMatch(html,/localStorage|sessionStorage|fetch\(/);const js=html.match(/<script>([\s\S]*?)<\/script>/)[1];new vm.Script(js);});
