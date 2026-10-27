/* Read only the current post panel. Never inspect page globals or credentials. */
(()=>{'use strict';
 const aliases={prompt:/^(prompt|positive prompt|提示詞|提示词)$/i,negativePrompt:/^(negative prompt|負面提示詞|負面提示|负面提示词|负向提示|負向提示|负向提示词|負向提示詞)$/i,steps:/^(steps|sampling steps|步驟|步骤|步數|步数|迭代步[数數](?:\(Steps\))?)$/i,cfgScale:/^(cfg scale|cfg|提示詞相關性|提示词相关性|提示詞相關性\(CFG Scale\)|提示词相关性\(CFG Scale\))$/i,seed:/^(seed|種子|种子|随机种子\(Seed\))$/i,clipSkip:/^(clip skip|跳過剪輯|跳过剪辑)$/i,size:/^(size|尺寸|resolution)$/i,sampler:/^(sampler|採樣器|采样器|採樣方法|采样方法)$/i,scheduler:/^(scheduler|調度器|调度器)$/i};
 const key=s=>Object.keys(aliases).find(k=>aliases[k].test(s.trim().replace(/[：:]$/,'')));
 const text=e=>String(e?.innerText||e?.textContent||'').trim();
 function panel(scope){let e=scope;for(let i=0;e&&i<6;i++,e=e.parentElement){if(e.tagName==='ASIDE')return e;const aside=e.querySelector?.('aside');if(aside)return aside;}return scope;}
 function collect(scope,source){const p=panel(scope),fields={},rawFields=[];if(!p)throw Error('找不到生成資訊側欄。');
  for(const label of p.querySelectorAll('h2,h3,label,dt')){const name=text(label),k=key(name);if(!k)continue;let box=label.parentElement;
   for(let depth=0;box&&depth<3;depth++,box=box.parentElement){const controls=[...box.querySelectorAll('input,textarea,select')].filter(e=>!['hidden','password','search'].includes(e.type));let value=controls.map(e=>e.value).join('\n').trim();
    if(!value){const full=text(box);if(full.startsWith(name))value=full.slice(name.length).trim();}
    if(value){fields[k]=value;rawFields.push({label:name,value});break;}
   }
  }
  const models=[...p.querySelectorAll('a[href*="/models/"]')].map(a=>({name:text(a),url:a.href})).filter(x=>x.name);const unique=[...new Map(models.map(m=>[m.url,m])).values()];
  const missing=['prompt','negativePrompt','steps','cfgScale','seed','clipSkip','size','sampler'].filter(k=>!Object.hasOwn(fields,k));
  return {schemaVersion:1,source,imageId:TPKCore.imageId(source),capturedAt:new Date().toISOString(),fields,models:unique,rawFields,panelText:text(p),missingFields:missing,note:'網站目前圖片側欄提供的資料；缺少欄位未推測，未修改圖片。'};
 }
 globalThis.TPKParameters={collect,panel};
})();
