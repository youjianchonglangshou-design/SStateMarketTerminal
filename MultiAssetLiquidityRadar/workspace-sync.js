/* v1.7.0: remote shared workstation state (R2) with offline local fallback.
 * Shared profile across devices using this installation. This is NOT private account auth.
 */
(()=>{'use strict';
 const ROOT=String(window.SSTATE_CONFIG?.workerUrl||'https://white-meadow-16bc.youjianchonglangshou.workers.dev').replace(/\/$/,'');
 const ENDPOINT=ROOT+'/api/monitor/radar/workspace';
 const WS='SStateLiquidityRadar.workspace.v1.5',CUSTOM='SStateLiquidityRadar.customPERP.v1';
 const MODIFIED='SStateLiquidityRadar.sharedModified.v1';
 let revision=0,lastServerTs=0,online=false,task=null,dirty=false,debounce=0,revisionChange=0;
 const get=k=>{try{return JSON.parse(localStorage.getItem(k)||'null');}catch(_){return null;}};
 const put=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));}catch(_){}};
 const snapshot=()=>({workspace:get(WS),custom:get(CUSTOM)||[]});
 const useRemote=data=>{if(data?.workspace&&typeof data.workspace==='object')put(WS,data.workspace);if(Array.isArray(data?.custom))put(CUSTOM,data.custom);};
 const fetchJson=async(url,init={})=>{
   const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),4000);
   try{const res=await fetch(url,{cache:'no-store',signal:controller.signal,...init});const json=await res.json();
     if(!res.ok){const error=Error(json.error||'HTTP '+res.status);error.status=res.status;throw error;}
     return json;
   }finally{clearTimeout(timeout);}
 };
 async function push(){
   if(task)return task;
   task=(async()=>{
     for(let attempt=0;attempt<3;attempt++){
       const local=snapshot(),started=revisionChange;
       try{
         const out=await fetchJson(ENDPOINT,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({...local,expected_revision:revision})});
         revision=out.revision;online=true;lastServerTs=Date.parse(out.updated_at)||Date.now();
         if(revisionChange===started){dirty=false;put(MODIFIED,lastServerTs);}else dirty=true;
         return true;
       }catch(err){if(err.status!==409){online=false;return false;}
         try{const remote=await fetchJson(ENDPOINT);revision=remote.revision||0;}catch(_){return false;}
       }
     }
     return false;
   })();try{return await task;}finally{task=null;if(dirty&&online)setTimeout(()=>{if(dirty)push();},2000);}
 }
 function changed(){dirty=true;revisionChange++;put(MODIFIED,Date.now());clearTimeout(debounce);debounce=setTimeout(()=>{push();},900);}
 async function init(){
   const before=snapshot();
   const localTs=Number(get(MODIFIED))||0;
   try{
     const remote=await fetchJson(ENDPOINT);
     revision=Number(remote.revision)||0;lastServerTs=Date.parse(remote.updated_at)||0;online=true;
     if(remote.workspace||remote.custom){
       if(localTs>lastServerTs+1000){dirty=true;revisionChange++;}
       else useRemote(remote);
     }else if(before.workspace||before.custom.length){dirty=true;revisionChange++;}
   }catch(err){online=false;console.warn('[Radar Sync] Worker 未啟用或不可連線，暫以本機記憶運作',err.message);}
   if(dirty&&online)setTimeout(push,350);
 }
 const ready=init();
 window.LIQ_SHARED_STATE={ready,changed,isOnline:()=>online,forceSync:()=>push(),getStatus:()=>({online,dirty,revision,lastServerTs})};
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&dirty)push();});
})();
