/* v2.1.2: independent R2 configuration for global stop-loss amounts / RR thresholds. */
(()=>{'use strict';
 const ROOT=String(window.SSTATE_CONFIG?.workerUrl||'https://white-meadow-16bc.youjianchonglangshou.workers.dev').replace(/\/$/,'');
 const API=ROOT+'/api/monitor/radar/settings';
 const LOCAL='SStateLiquidityRadar.settings.v1';
 const LEGACY='SStateLiquidityRadar.workspace.v1.5';
 const DEFAULT={riskDefaults:{riskAmount1:1000,riskAmount2:100},rrThresholds:{continuation:1.5,reversal:1.7}};
 const getLocal=key=>{try{return JSON.parse(localStorage.getItem(key)||'null');}catch(_){return null;}};
 const setLocal=value=>{try{localStorage.setItem(LOCAL,JSON.stringify(value));}catch(_){}};
 const valid=(kind,o)=>!!o&&typeof o==='object'&&(kind==='risk'
   ?['riskAmount1','riskAmount2'].every(k=>typeof o[k]==='number'&&Number.isFinite(o[k])&&o[k]>0&&o[k]<=1e12)
   :['continuation','reversal'].every(k=>typeof o[k]==='number'&&Number.isFinite(o[k])&&o[k]>=1&&o[k]<=100));
 const clone=x=>({...x});
 // Snapshot old settings before the existing workspace sync can overwrite the legacy JSON.
 const legacy=getLocal(LEGACY);
 const local=getLocal(LOCAL);
 let values={riskDefaults:clone(DEFAULT.riskDefaults),rrThresholds:clone(DEFAULT.rrThresholds)};
 let dirty={risk:false,rr:false},revision=0,online=false,lastError='',inFlight=null;
 const listeners=new Set();
 function notify(){for(const fn of listeners)try{fn(current());}catch(e){console.warn('[Settings sync listener]',e);}}
 const hasLocal=!!local&&typeof local==='object';
 for(const [kind,key] of [['risk','riskDefaults'],['rr','rrThresholds']]){
   if(valid(kind,local?.[key])){values[key]=clone(local[key]);dirty[kind]=!!local.dirty?.[kind];}
   else if(valid(kind,legacy?.[key])){
     // Values persisted before v2.1.2 but discarded by old R2 workspace sanitizer.
     values[key]=clone(legacy[key]);
     if(JSON.stringify(values[key])!==JSON.stringify(DEFAULT[key]))dirty[kind]=true;
   }
 }
 const persist=()=>setLocal({...values,dirty,revision,updatedAt:Date.now()});
 const status=()=>({online,dirtyRisk:dirty.risk,dirtyRR:dirty.rr,error:lastError,revision});
 function applyRemote(r,keepDirty=true){
   if(valid('risk',r?.riskDefaults)&&(!keepDirty||!dirty.risk))values.riskDefaults=clone(r.riskDefaults);
   if(valid('rr',r?.rrThresholds)&&(!keepDirty||!dirty.rr))values.rrThresholds=clone(r.rrThresholds);
   revision=Number(r?.revision)||0;persist();notify();
 }
 async function request(init){
   const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),6500);
   try{
     const response=await fetch(API,{cache:'no-store',...init,signal:ctl.signal});
     const data=await response.json();
     if(!response.ok){const e=Error(data.error||'HTTP '+response.status);e.status=response.status;throw e;}
     return data;
   }finally{clearTimeout(timer);}
 }
 function current(){return {riskDefaults:clone(values.riskDefaults),rrThresholds:clone(values.rrThresholds)};}
 async function pull(){
   try{
     const remote=await request();online=true;lastError='';
     // A freshly deployed/reset R2 object must not erase prior explicitly saved local values.
     // The absence of a remote settings JSON does NOT mean the user requested a reset.
     if(remote.configured===false){
       for(const [kind,key] of [['risk','riskDefaults'],['rr','rrThresholds']]){
         if(valid(kind,local?.[key])&&
            JSON.stringify(local[key])!==JSON.stringify(DEFAULT[key]))dirty[kind]=true;
       }
     }
     applyRemote(remote);
     // Only seed remote if there are explicit legacy/offline edits to preserve.
     if(dirty.risk||dirty.rr)void flush();
     return true;
   }catch(e){online=false;lastError=String(e?.message||e);return false;}
 }
 async function flush(){
   if(inFlight)return inFlight;
   inFlight=(async()=>{
     for(const kind of ['risk','rr']){
       if(!dirty[kind])continue;
       const key=kind==='risk'?'riskDefaults':'rrThresholds';
       // Snapshot to avoid discarding edits performed while a request is pending.
       const snapshot=clone(values[key]);
       let completed=false;
       for(let attempt=0;attempt<4;attempt++){
         try{
           const remote=await request({method:'PUT',headers:{'Content-Type':'application/json'},
             body:JSON.stringify({expected_revision:revision,section:kind,values:snapshot})});
           revision=Number(remote.revision)||revision+1;online=true;lastError='';
           completed=true;
           if(JSON.stringify(values[key])===JSON.stringify(snapshot))dirty[kind]=false;
           // Synchronize the opposite section only, never overwrite a pending local edit.
           const other=kind==='risk'?'rr':'risk',otherKey=other==='risk'?'riskDefaults':'rrThresholds';
           if(!dirty[other]&&valid(other,remote[otherKey]))values[otherKey]=clone(remote[otherKey]);
           persist();notify();break;
         }catch(e){
           if(e.status!==409){online=false;lastError=String(e?.message||e);persist();return false;}
           try{const latest=await request();applyRemote(latest,true);online=true;}
           catch(fetchError){online=false;lastError=String(fetchError?.message||fetchError);return false;}
         }
       }
       if(!completed)return false;
     }
     return true;
   })();
   try{return await inFlight;}finally{inFlight=null;}
 }
 async function update(kind,input){
   const key=kind==='risk'?'riskDefaults':kind==='rr'?'rrThresholds':null;
   if(!key||!valid(kind,input))return {valid:false,synced:false};
   values[key]=clone(input);dirty[kind]=true;persist();notify();
   const synced=await flush();
   return {valid:true,synced:!!synced&&!dirty[kind],status:status()};
 }
 const ready=pull();
 window.LIQ_PERSISTENT_SETTINGS={ready,current,update,status,pull,flush,subscribe(fn){listeners.add(fn);return ()=>listeners.delete(fn);},API};
 window.addEventListener('online',()=>{void pull();});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)void pull();});
})();
