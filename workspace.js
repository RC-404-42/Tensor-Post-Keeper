(()=>{'use strict';const $=s=>document.querySelector(s),sleep=ms=>new Promise(r=>setTimeout(r,ms));let workspace,root,queue=[],page=0,busy=false,scanning=false,scanStop=false,stopped=false,paused=false,processingTab=null,helperTab=null;const logs=[];let sourceDescription=null,rememberedRoot=null,sourceReady=false,connecting=false,sourceError='';
 async function runtime(m){const r=await chrome.runtime.sendMessage(m);if(!r?.ok)throw Error(r?.error||'工作台沒有回應，請重新開啟。');return r;}
 async function site(tab,m){const r=await chrome.tabs.sendMessage(tab,m);if(!r?.ok)throw Error(r?.error||'來源分頁沒有回應，請重新整理該分頁。');return r;}
 function log(text){logs.push({at:new Date().toISOString(),text});if(logs.length>500)logs.shift();const li=document.createElement('li');li.textContent=text;$('#log').append(li);if($('#log').children.length>200)$('#log').firstElementChild.remove();li.scrollIntoView({block:'nearest'});}
 function status(text){$('#status').textContent=text;}
 function controls(){const selected=queue.filter(x=>x.selected!==false);$('#start').disabled=!root||!sourceReady||connecting||busy||scanning||(!selected.length&&workspace?.mode==='author');$('#folder').disabled=busy||scanning;$('#reuse-folder').disabled=busy||scanning;$('#self-test').disabled=!root||busy||scanning;$('#scan').disabled=!sourceReady||workspace?.mode!=='author'||connecting||busy||scanning;$('#reconnect').disabled=!workspace||connecting||busy||scanning;$('#limit').disabled=busy||scanning;$('#pause').hidden=!busy;$('#stop').hidden=!busy;$('#stop-scan').hidden=!scanning;$('#pause').textContent=paused?'繼續':'暫停';$('#queue-count').textContent=`已選 ${selected.length} / ${queue.length} 篇`;
  for(const id of ['#skip','#sidecar','#select-all','#select-none'])$(id).disabled=busy||scanning;
 }
 function renderQueue(){const start=page*100;$('#queue').replaceChildren();queue.slice(start,start+100).forEach(item=>{const label=document.createElement('label'),check=document.createElement('input'),text=document.createElement('span'),state=document.createElement('small');check.type='checkbox';check.checked=item.selected!==false;check.disabled=busy||scanning;check.onchange=()=>{item.selected=check.checked;controls();};text.textContent=`貼文 ${item.id} · 清單已見 ${item.images?.length||1} 張`;state.textContent=item.state||'待處理';label.append(check,text,state);$('#queue').append(label);});$('#queue-box').hidden=!queue.length;$('#page').textContent=`${page+1} / ${Math.max(1,Math.ceil(queue.length/100))}`;$('#prev').disabled=page===0;$('#next').disabled=start+100>=queue.length;controls();}
 async function useDirectory(handle,persist=false){
  const prepared=await TPKFolderStore.prepare(handle);root=prepared.handle;rememberedRoot=root;TPKSetDirectory(root);$('#folder-name').textContent=root.name+'（已記憶）';$('#folder').textContent='更換存檔資料夾';$('#reuse-folder').hidden=true;
  if(persist){try{await TPKFolderStore.remember(root);}catch(e){log('本次可使用，但資料夾記憶失敗：'+e.message);$('#folder-name').textContent=root.name+'（僅本次）';}}
  if(prepared.reused)log('已沿用現有 Tensor-Post-Keeper 收藏根目錄，沒有新增同名層級。');log('存檔根目錄：'+root.name);status(sourceReady?(workspace.mode==='author'?'資料夾與作者來源已就緒；請先掃描作者貼文。':'資料夾與貼文來源已就緒，可以開始。'):(sourceError||'資料夾已就緒，請先連接圖片來源。'));controls();
 }
 async function restoreDirectory(){try{const saved=await TPKFolderStore.read();if(!saved)return;rememberedRoot=saved;$('#folder-name').textContent=saved.name+'（已記憶）';$('#reuse-folder').hidden=false;$('#reuse-folder').textContent='允許沿用 '+saved.name;
   if(await saved.queryPermission({mode:'readwrite'})==='granted')await useDirectory(saved);
   else{status('已記住資料夾；按「允許沿用」確認權限即可，不必重新選擇。');controls();}
  }catch(e){log('無法恢復已記憶資料夾：'+e.message);}}
 $('#folder').onclick=async()=>{try{if(typeof showDirectoryPicker!=='function')throw Error('這個瀏覽器無法直接選擇資料夾。請使用近期 Chrome 或 Edge。');const options={id:'tpk-output',mode:'readwrite'};if(rememberedRoot)options.startIn=rememberedRoot;const handle=await showDirectoryPicker(options);await useDirectory(handle,true);}catch(e){if(e.name!=='AbortError'){status(e.message);log(e.message);}}};
 $('#reuse-folder').onclick=async()=>{if(!rememberedRoot)return;try{const permission=await rememberedRoot.requestPermission({mode:'readwrite'});if(permission!=='granted')throw Error('未取得資料夾寫入權限；可以再次允許沿用，或更換存檔資料夾。');await useDirectory(rememberedRoot);}catch(e){status(e.message);log(e.message);}};
 $('#self-test').onclick=async()=>{try{const w=new TPKDirectoryWriter(root),blob=new Blob(['Tensor Post Keeper 1.2.2 folder write test\n'],{type:'text/plain'}),sha256=await TPKDigest(blob),record=await w.write({post:'_write-test',image:'0',index:0,filename:'write-test.txt',blob,sha256});log('資料夾寫入及讀回核對成功：'+record.path);status('資料夾寫入測試成功；沒有使用逐檔另存。');}catch(e){status(e.message);log('寫入測試失敗：'+e.message);}};
 async function scan(){if(busy||scanning||!sourceReady||workspace?.mode!=='author')return;scanning=true;scanStop=false;stopped=false;queue=[];page=0;renderQueue();const entries=new Map();let idle=0,previousHeight=0,expected=null,reason='';const limit=Math.max(0,Number($('#limit').value)||0);
  try{await runtime({type:'workspace-busy',busy:true});let desc=await site(workspace.sourceTabId,{type:'describe'});if(!desc.profile||desc.profile.id!==workspace.author)throw Error('來源已不是原本的作者頁；請按「重新連接來源」更新。');if(new URL(desc.url).pathname.replace(/\/$/,'')!==`/u/${workspace.author}/posts`){await chrome.tabs.update(workspace.sourceTabId,{url:desc.profile.url});await waitSource(workspace.sourceTabId,null,true);}
   while(!scanStop){const r=await site(workspace.sourceTabId,{type:'profile-step',scroll:false});if(r.author!==workspace.author)throw Error('作者頁已切換，已停止掃描。');const before=entries.size;
    for(const post of r.posts){const old=entries.get(post.id);if(old)old.images=[...new Set([...old.images,...post.images])];else if(!limit||entries.size<limit)entries.set(post.id,{...post,selected:true});}
    expected=r.expected||expected;if(r.name)$('#source-title').textContent='02　'+r.name+' 的貼文';$('#scan-status').textContent=`已找到 ${entries.size} 篇貼文${expected?`；頁面標示 ${expected} 篇`:''}，正在載入…`;
    if(limit&&entries.size>=limit){reason='已達設定篇數';break;}
    if(expected&&entries.size>=expected){reason='已達作者頁標示篇數';break;}
    if(entries.size===before&&r.atBottom&&r.height===previousHeight)idle++;else idle=0;previousHeight=r.height;
    if(idle>=6){reason='頁底連續 12 秒沒有新貼文';break;}
    await site(workspace.sourceTabId,{type:'profile-step',scroll:true});await sleep(2000);
   }
   if(scanStop)reason='已由你停止掃描';queue=[...entries.values()];const partial=expected&&queue.length<expected;$('#scan-status').textContent=`掃描結束：${queue.length} 篇。${reason}。${partial?`少於頁面標示的 ${expected} 篇；結果可能受隱藏、篩選或載入限制影響。`:''} 圖片總數會在逐篇展開後確認。`;log($('#scan-status').textContent);
  }catch(e){queue=[...entries.values()];$('#scan-status').textContent='掃描停止：'+e.message;log($('#scan-status').textContent);}finally{await runtime({type:'workspace-busy',busy:false}).catch(()=>{});scanning=false;renderQueue();}
 }
 async function waitSource(tab,expectedImage,profile=false){const start=Date.now();while(Date.now()-start<45000){if(stopped)throw Error('已停止');try{const d=await site(tab,{type:'describe'});if(d.version!=='1.2.2')throw Error('來源頁載入的不是 1.2.2，請重新載入擴充功能並重新整理來源頁。');if(profile?d.profile?.id===workspace.author&&new URL(d.url).pathname.replace(/\/$/,'')===`/u/${workspace.author}/posts`:d.gallery&&(!expectedImage||TPKCore.imageId(d.url)===expectedImage)){await sleep(1500);return d;}}catch(e){if(/不是 1.2.2/.test(e.message))throw e;}await sleep(500);}throw Error('等候來源頁載入逾時；請檢查登入狀態或網站限制。');}
 $('#scan').onclick=scan;$('#stop-scan').onclick=()=>{scanStop=true;$('#scan-status').textContent='正在停止掃描並保留已收集貼文…';};
 $('#select-all').onclick=()=>{queue.forEach(x=>x.selected=true);renderQueue();};$('#select-none').onclick=()=>{queue.forEach(x=>x.selected=false);renderQueue();};$('#prev').onclick=()=>{if(page>0)page--;renderQueue();};$('#next').onclick=()=>{if((page+1)*100<queue.length)page++;renderQueue();};
 async function run(){if(busy||scanning||!root||!sourceReady||connecting||workspace?.mode==='author'&&!queue.some(x=>x.selected!==false))return;busy=true;stopped=false;paused=false;controls();renderQueue();let completedPosts=0,done=0,skipped=0,failed=0,consecutiveFailures=0;const items=workspace.mode==='author'?queue.filter(x=>x.selected!==false):[{id:sourceDescription.gallery.post,url:workspace.sourceURL,selected:true}];
  $('#progress').max=Math.max(1,items.length);$('#progress').value=0;
  try{await runtime({type:'workspace-busy',busy:true});for(let n=0;n<items.length;n++){if(stopped)break;while(paused&&!stopped)await sleep(300);if(stopped)break;const entry=items[n];entry.state='處理中';renderQueue();status(`第 ${n+1} / ${items.length} 篇 · 已完成 ${done} 張，跳過 ${skipped} 張`);
    try{
     if(workspace.mode==='author'){
      if(!helperTab){const t=await chrome.tabs.create({url:entry.url,active:false});helperTab=t.id;}else await chrome.tabs.update(helperTab,{url:entry.url});processingTab=helperTab;
     }else processingTab=workspace.sourceTabId;
     await runtime({type:'workspace-processing',tabId:processingTab});const desc=await waitSource(processingTab,TPKCore.imageId(entry.url));if(workspace.mode==='author'&&desc.creator!==workspace.author)throw Error('貼文作者無法確認或與來源不同，已略過。');
     const result=await site(processingTab,{type:'run-post',options:{batch:workspace.mode==='author'?workspace.author:'',skipExisting:$('#skip').checked,sidecar:$('#sidecar').checked}});
     if(typeof result.total!=='number')throw Error('來源未開始處理，請確認該分頁沒有另一個批次。');
     const skip=result.results.filter(x=>x.skipped).length;done+=result.done-skip;skipped+=skip;failed+=result.total-result.done;entry.state=result.done===result.total?'完成':`未完成 ${result.total-result.done} 張`;completedPosts+=result.done===result.total?1:0;consecutiveFailures=result.done?0:consecutiveFailures+1;
     const errors=result.results.filter(x=>x.state!=='complete').map(x=>x.error);log(`貼文 ${entry.id}：新存 ${result.done-skip} 張，跳過 ${skip} 張，未完成 ${result.total-result.done} 張。${errors.join('；')}`);
    }catch(e){entry.state='失敗';consecutiveFailures++;failed++;log(`貼文 ${entry.id}：${e.message}`);}
    $('#progress').value=n+1;renderQueue();if(consecutiveFailures>=3){log('連續三篇無法處理，已停止。請檢查網站、登入狀態或資料夾權限。');stopped=true;break;}if(!stopped)await sleep(1200);
   }
   status(`${stopped?'已停止':'處理結束'}：新存 ${done} 張，跳過 ${skipped} 張，完成 ${completedPosts} / ${items.length} 篇。${failed?'有未完成項目，請查看紀錄。':''}`);
  }catch(e){status('已停止：'+e.message);log(e.message);}finally{await runtime({type:'workspace-busy',busy:false}).catch(()=>{});busy=false;paused=false;processingTab=null;renderQueue();controls();}
 }
 $('#start').onclick=run;$('#pause').onclick=()=>{paused=!paused;controls();if(processingTab)site(processingTab,{type:'job-control',action:paused?'pause':'resume'}).catch(()=>{});};$('#stop').onclick=()=>{stopped=true;paused=false;if(processingTab)site(processingTab,{type:'job-control',action:'stop'}).catch(()=>{});status('正在停止；目前已開始的寫入會完成。');};
 $('#diagnostics').onclick=async()=>{const text=JSON.stringify({version:'1.2.2',saveMode:'directory-write; no chrome.downloads',pickerAvailable:typeof showDirectoryPicker==='function',source:workspace?.sourceURL,mode:workspace?.mode,directory:root?.name,sourceReady,sourceError,description:sourceDescription,logs},null,2);try{await navigator.clipboard.writeText(text);log('診斷已複製到剪貼簿。');}catch{status(text);}};
 window.addEventListener('tpk-file-saved',e=>{log('原檔已寫入：'+e.detail.path);if(busy)status('原檔已寫入：'+e.detail.filename);});
 window.addEventListener('beforeunload',e=>{if(busy||scanning){e.preventDefault();e.returnValue='';}});
 async function connectSource(){if(busy||scanning||connecting||!workspace)return;connecting=true;sourceReady=false;sourceError='';sourceDescription=null;controls();$('#source').textContent='正在確認目前的來源頁面…';
  try{const oldKey=`${workspace.mode}:${workspace.author}:${workspace.sourceURL}`,r=await runtime({type:'workspace-source'});workspace=r.workspace;sourceDescription=r.description;
   const valid=workspace.mode==='author'?sourceDescription.profile?.id===workspace.author:!!sourceDescription.gallery;
   if(!valid)throw Error('來源尚未就緒；請確認來源分頁，再按「重新連接來源」。');
   const newKey=`${workspace.mode}:${workspace.author}:${workspace.sourceURL}`;if(oldKey!==newKey){queue=[];page=0;$('#scan-status').textContent='';}
   sourceReady=true;$('#source').textContent=(workspace.mode==='author'?'作者貼文來源：':'單篇貼文來源：')+workspace.sourceURL;$('#source-title').textContent=workspace.mode==='author'?'02　作者貼文來源':'02　圖片來源';$('#author-options').hidden=workspace.mode!=='author';$('#start').textContent=workspace.mode==='author'?'下載所選貼文':'下載此篇全部圖片';log('來源已連接：'+workspace.mode+' · '+workspace.sourceURL);status(workspace.mode==='author'?'作者來源已就緒，請按「掃描作者貼文」。':root?'資料夾與貼文來源已就緒，可以開始。':'來源已就緒，請選擇或允許沿用存檔資料夾。');
  }catch(e){sourceError=e.message;$('#source').textContent='來源未就緒：'+e.message;status(sourceError);log('來源連接失敗：'+e.message);}
  finally{connecting=false;renderQueue();controls();}
 }
 $('#reconnect').onclick=connectSource;
 controls();
 (async()=>{try{const r=await runtime({type:'workspace-init'});workspace=r.workspace;if(!workspace)throw Error('工作台沒有綁定來源，請從網站重新開啟。');await connectSource();}catch(e){sourceError=e.message;status(e.message);log(e.message);$('#source').textContent='來源未就緒：'+e.message;}finally{await restoreDirectory();controls();}})();
})();
