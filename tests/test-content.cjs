const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const codeDir=fs.existsSync(__dirname+'/../extension/core.js')?__dirname+'/../extension':__dirname+'/..';const core=require(codeDir+'/core.js');
// Execute the real content script against a deterministic SPA and download bridge.
// The fake native download control is the only producer of downloads.
function fixture(domain,failId,withParameters=false,existing=false,embed=false){
 let messages=[],current='101',clicked=[],downloaded=[],pending=null,token=0,messageListener;
 const location={href:`https://${domain}/images/101?post_id=900`};
 const controls=new Map();const control=id=>{if(!controls.has(id))controls.set(id,{textContent:'',checked:true,style:{}});return controls.get(id);};
 const ui={querySelector:s=>control(s),innerHTML:''};let row;
 const links=['101','102','103'].map(id=>({tagName:'A',href:`https://${domain}/images/${id}?post_id=900`,get parentElement(){return row},click(){current=id;location.href=this.href;}}));row={children:links};
 const img={getAttribute:()=>`https://image.tensorartassets.com/${current}.png`};
 const s={querySelectorAll:()=>links,querySelector:()=>img,cloneNode:()=>({querySelectorAll:()=>[],textContent:'Prompt: test; Seed: '+current})};
 const button={title:'Ctrl + S',getClientRects:()=>[{}],closest:q=>q==='#tpk-root'?null:s,querySelector:()=>({}),click(){clicked.push(current);if(current!==failId)downloaded.push(current);pending={id:current};}};
 const doc={querySelectorAll:q=>q==='button'?[button]:[],createElement:()=>({style:{},dataset:{},attachShadow:()=>ui}),documentElement:{append(){}}};
 const chrome={storage:{local:{get:async()=>({sidecar:true}),set:async()=>{}}},runtime:{id:'test-id',onMessage:{addListener(f){messageListener=f}},sendMessage:async m=>{messages.push(m);
  if(m.type==='existing')return {ok:true,exists:existing,record:{filename:'existing.png'}};
  if(m.type==='arm'){pending=null;return {ok:true,token:String(++token)};}
  if(m.type==='poll'){return pending?.id===failId?{ok:true,state:'interrupted',error:'NETWORK_FAILED'}:{ok:true,state:'complete',bytes:123,mime:'image/png',filename:pending.id+'.png'};}
  return {ok:true};
 }}};
 const context=vm.createContext({document:doc,location,chrome,TPKCore:core,URL,Date,console,TPKParameters:{collect:(_,source)=>({imageId:core.imageId(source),source,fields:{seed:core.imageId(source)},missingFields:[]})},TPKProfile:{profile:()=>null},TPKCapture:{capture:async(token,b)=>{b.click();return {}},transfer:async()=>{}},getComputedStyle:()=>({visibility:'visible'}),setInterval:()=>{},setTimeout:(fn)=>setTimeout(fn,1)});
 vm.runInContext(fs.readFileSync(codeDir+'/content.js','utf8'),context);
 return {ui,controls,clicked,downloaded,location,messages,action:()=>messageListener({type:'open-from-action'},{id:'test-id'},()=>{}),run:()=>new Promise(res=>messageListener({type:'run-post',options:{skipExisting:true,sidecar:withParameters,embed}},{id:'test-id'},res)),retry:()=>new Promise(res=>messageListener({type:'run-post',options:{skipExisting:true,sidecar:withParameters,embed}},{id:'test-id'},res))};
}
for(const domain of ['tensor.art','tensorhub.art'])test(`${domain}: all images in order and restore original view`,async()=>{const f=fixture(domain);await f.run();assert.deepEqual(f.clicked,['101','102','103']);assert.deepEqual(f.downloaded,['101','102','103']);assert.match(f.location.href,/\/101\?/);assert.match(f.controls.get('#status').textContent,/完成：3 \/ 3/);});
test('failure stops the current post and reports the error',async()=>{const f=fixture('tensor.art','102');await f.run();assert.deepEqual(f.clicked,['101','102']);assert.equal(f.controls.get('#retry').hidden,false);// Durable skip/resume is verified against real files in test-directory.cjs.
 assert.match(f.controls.get('#status').textContent,/NETWORK_FAILED/);});

for(const domain of ['tensor.art','tensorhub.art'])test(`${domain}: action forwards the live SPA URL rather than relying on sender metadata`,async()=>{const f=fixture(domain);f.location.href=`https://${domain}/images/999?post_id=777`;f.action();await new Promise(r=>setTimeout(r,2));const m=f.messages.find(x=>x.type==='open-workspace');assert.equal(m.sourceURL,f.location.href);assert.equal(m.mode,'post');});

test('each downloaded image sends its own current parameters',async()=>{const f=fixture('tensor.art',null,true);await f.run();const saved=f.messages.filter(m=>m.type==='image-parameters');assert.equal(saved.length,3);assert.deepEqual(saved.map(m=>m.metadata.fields.seed),['101','102','103']);});
test('existing verified pictures still get parameter sidecars without redownloading',async()=>{const f=fixture('tensorhub.art',null,true,true);await f.run();assert.equal(f.downloaded.length,0);assert.deepEqual(f.messages.filter(m=>m.type==='image-parameters').map(m=>m.metadata.imageId),['101','102','103']);});

test('embedding alone collects metadata for existing images without redownloading or enabling text sidecars',async()=>{const f=fixture('tensor.art',null,false,true,true);await f.run();assert.equal(f.downloaded.length,0);const saved=f.messages.filter(m=>m.type==='image-parameters');assert.equal(saved.length,3);assert.ok(saved.every(m=>m.embed===true));assert.deepEqual(saved.map(m=>m.metadata.imageId),['101','102','103']);});
