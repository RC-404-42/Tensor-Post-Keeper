/* Optional derivative PNG only. Original downloads are never overwritten. */
(()=>{'use strict';const enc=new TextEncoder(),dec=new TextDecoder(),sig=[137,80,78,71,13,10,26,10];
 const table=new Uint32Array(256);for(let i=0;i<256;i++){let c=i;for(let j=0;j<8;j++)c=(c>>>1)^((c&1)?0xedb88320:0);table[i]=c>>>0;}
 function crc(bytes){let c=0xffffffff;for(const b of bytes)c=(c>>>8)^table[(c^b)&255];return (c^0xffffffff)>>>0;}
 function join(parts){const b=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let o=0;for(const p of parts){b.set(p,o);o+=p.length;}return b;}
 function chunks(b){if(!sig.every((n,i)=>b[i]===n))throw Error('不是有效的 PNG。');const out=[];let o=8,ended=false;while(o+12<=b.length){const v=new DataView(b.buffer,b.byteOffset+o),len=v.getUint32(0),end=o+12+len;if(len>512*1024*1024||end>b.length)throw Error('PNG 區塊長度錯誤。');const type=dec.decode(b.subarray(o+4,o+8)),data=b.subarray(o+8,o+8+len);if(v.getUint32(8+len)!==crc(b.subarray(o+4,o+8+len)))throw Error('PNG 區塊校驗失敗。');out.push({type,data,bytes:b.subarray(o,end)});o=end;if(type==='IEND'){ended=true;break;}}
  if(!ended||o!==b.length||out[0]?.type!=='IHDR'||out[0].data.length!==13||!out.some(c=>c.type==='IDAT'))throw Error('PNG 結構不完整或含不支援的尾端資料。');if(out.some(c=>c.type==='acTL'))throw Error('動畫 PNG 不產生相容副本，原檔仍保留。');return out;
 }
 function textChunk(key,text){const data=join([enc.encode(key),new Uint8Array(5),enc.encode(text)]),body=join([enc.encode('iTXt'),data]),b=new Uint8Array(data.length+12),v=new DataView(b.buffer);v.setUint32(0,data.length);b.set(body,4);v.setUint32(b.length-4,crc(body));return b;}
 const one=s=>String(s??'').replace(/[\r\n]+/g,' ').trim();
 const quoted=s=>'"'+one(s).replaceAll('"',"'")+'"';
 function format(meta){const f=meta.fields||{};if(!f.prompt?.trim())throw Error('頁面沒有可用提示詞，略過相容副本；原圖仍保留。');const pairs=[],put=(k,v)=>{if(v!==undefined&&v!==null&&String(v).trim())pairs.push(k+': '+v);};
  const positive=one(f.prompt),negative=one(f.negativePrompt),models=meta.models||[],checkpoint=models.find(m=>m.type==='CHECKPOINT'),size=one(f.size).replace(/[×＊*]/g,'x').replace(/\s+/g,'');
  if(/^\d+$/.test(one(f.steps)))put('Steps',one(f.steps));if(/^\d+(?:\.\d+)?$/.test(one(f.cfgScale)))put('CFG scale',one(f.cfgScale));if(/^-?\d+$/.test(one(f.seed)))put('Seed',one(f.seed));if(/^\d+x\d+$/.test(size))put('Size',size);put('Sampler',one(f.sampler));put('Schedule type',one(f.scheduler));if(/^\d+$/.test(one(f.clipSkip)))put('Clip skip',one(f.clipSkip));put('Model',checkpoint?quoted(checkpoint.name):undefined);
  put('TPK source',quoted(meta.source));if(models.length)put('TPK resources',quoted(models.map(m=>`${m.type||'RESOURCE'} ${m.name} ${m.url}`).join(' | ')));
  // The manager splits negative prompt at the first newline; flatten only this
  // compatibility string. Exact original multiline text stays in coco/TPK JSON.
  const parameters=[positive,'Negative prompt: '+negative,pairs.join(', ')].join('\n');const coco={prompt:f.prompt,negative:f.negativePrompt||'',tpk_source:meta.source,tpk_resources:models,tpk_missing_fields:meta.missingFields||[]};
  for(const [from,to] of [['steps','steps'],['cfgScale','cfg'],['clipSkip','clip_skip']]){if(f[from]!==undefined&&/^\d+(?:\.\d+)?$/.test(one(f[from])))coco[to]=Number(f[from]);}if(/^-?\d+$/.test(one(f.seed)))coco.seed=Number.isSafeInteger(Number(f.seed))?Number(f.seed):one(f.seed);if(f.sampler)coco.sampler=f.sampler;if(checkpoint)coco.model=checkpoint.name;
  return {parameters,coco};
 }
 function embed(b,meta){const parts=chunks(b),data=format(meta),replace=new Set(['parameters','coco','tensor_post_keeper']),out=[new Uint8Array(sig)];let added=false;for(const c of parts){if(['tEXt','iTXt','zTXt'].includes(c.type)){const zero=c.data.indexOf(0);if(replace.has(dec.decode(c.data.subarray(0,zero))))continue;}if(c.type==='IDAT'&&!added){out.push(textChunk('parameters',data.parameters),textChunk('coco',JSON.stringify(data.coco)),textChunk('tensor_post_keeper',JSON.stringify(meta)));added=true;}out.push(c.bytes);}return join(out);}
 async function pngCopy(blob){if(blob.size>128*1024*1024)throw Error('原圖超過 128 MiB，略過相容副本以避免記憶體不足。');const b=new Uint8Array(await blob.arrayBuffer());if(sig.every((n,i)=>b[i]===n))return {bytes:b,converted:false};const jpeg=b[0]===255&&b[1]===216,webp=dec.decode(b.subarray(0,4))==='RIFF'&&dec.decode(b.subarray(8,12))==='WEBP';if(!jpeg&&!webp)throw Error('相容副本僅支援 PNG、JPG、靜態 WebP；原檔仍保留。');
  if(webp){for(let o=12;o+8<=b.length;){const kind=dec.decode(b.subarray(o,o+4)),n=new DataView(b.buffer,b.byteOffset+o+4).getUint32(0,true);if(kind==='ANIM'||kind==='ANMF')throw Error('動畫 WebP 不轉成靜態副本。');o+=8+n+(n%2);}}
  const bitmap=await createImageBitmap(blob);try{if(!bitmap.width||!bitmap.height||bitmap.width*bitmap.height>64000000)throw Error('圖片太大，略過 PNG 副本以避免縮圖。');const canvas=new OffscreenCanvas(bitmap.width,bitmap.height),ctx=canvas.getContext('2d');if(!ctx)throw Error('無法建立 PNG 副本。');ctx.drawImage(bitmap,0,0);const png=await canvas.convertToBlob({type:'image/png'});const bytes=new Uint8Array(await png.arrayBuffer());chunks(bytes);return {bytes,converted:true};}finally{bitmap.close();}
 }
 globalThis.TPKEmbed={embed,format,chunks,pngCopy};
})();
