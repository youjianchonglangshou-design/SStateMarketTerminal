/* v2.0.5: single lazy-hover CCI card. No additional network requests. */
(function(root){'use strict';
 const W=760,H=150,L=42,R=14,T=10,B=30;
 let config=null,card=null,active=null,target=null,showTimer=0,hideTimer=0,signature='';
 const finite=v=>typeof v==='number'&&Number.isFinite(v);
 const fmt=v=>finite(v)?v.toFixed(1):'—';
 const colorName=c=>c==='yellow'?'cci-sma-yellow':c==='purple'?'cci-sma-purple':'cci-sma-flat';
 const esc=s=>String(s).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
 function make(){if(card)return card;card=document.createElement('div');card.id='liqCciHoverCard';card.className='radar-cci-hover-card';card.hidden=true;card.setAttribute('role','tooltip');document.body.append(card);return card;}
 function compute(daily){
   const engine=root.SStateMonitorEngine;
   if(!engine?.calculateCciSma||!Array.isArray(daily)||daily.length<34)return [];
   // Use the same currently forming 1D OHLC source as the scanner itself.
   const rows=daily.map(d=>({time:d.t,open:d.o,high:d.h,low:d.l,close:d.c,volume:d.v||0}));
   // Same function as SState's root monitor engine; never independently infer colors.
   return engine.calculateCciSma(rows).slice(-20);
 }
 function svg(points){
   if(points.length<2||!points.some(p=>finite(p.cci)||finite(p.smoothing_ma)))return '<div class="radar-cci-empty">日線 CCI-SMA 歷史不足</div>';
   const vals=[100,0,-100];for(const p of points){if(finite(p.cci))vals.push(p.cci);if(finite(p.smoothing_ma))vals.push(p.smoothing_ma);}
   const lo=Math.min(...vals),hi=Math.max(...vals),pad=Math.max(1,(hi-lo)*.08);
   const min=Math.min(-150,Math.floor((lo-pad)/50)*50),max=Math.max(150,Math.ceil((hi+pad)/50)*50);
   const x=i=>L+i*(W-L-R)/(points.length-1),y=v=>T+(max-v)/(max-min)*(H-T-B);
   let cciPath='',drawing=false,steps='';
   for(let i=0;i<points.length;i++){
     const p=points[i];if(finite(p.cci)){cciPath+=(drawing?'L':'M')+x(i).toFixed(1)+','+y(p.cci).toFixed(1);drawing=true;}else drawing=false;
     if(i>0&&finite(p.smoothing_ma)&&finite(points[i-1].smoothing_ma)){
       const prev=points[i-1].smoothing_ma,cur=p.smoothing_ma;
       steps+='<path class="cci-sma-step '+colorName(p.smoothing_color)+'" d="M'+x(i-1).toFixed(1)+','+y(prev).toFixed(1)+' H'+x(i).toFixed(1)+' V'+y(cur).toFixed(1)+'"/>';
     }
   }
   const refs=[100,0,-100].map(v=>'<line class="cci-ref-line '+(v===0?'cci-ref-zero':'cci-ref-band')+'" x1="'+L+'" y1="'+y(v)+'" x2="'+(W-R)+'" y2="'+y(v)+'"/><text class="cci-axis-text" x="4" y="'+(y(v)+3)+'">'+v+'</text>').join('');
   const ticks=[0,Math.floor((points.length-1)/3),Math.floor((points.length-1)*2/3),points.length-1];
   const dates=[...new Set(ticks)].map(i=>{const d=new Date(points[i].time);const str=String(d.getUTCMonth()+1).padStart(2,'0')+'/'+String(d.getUTCDate()).padStart(2,'0');return '<text class="cci-axis-text cci-date-text" x="'+(x(i)-8)+'" y="'+(H-4)+'" transform="rotate(-35 '+(x(i)-8)+' '+(H-4)+')">'+str+'</text>';}).join('');
   const last=points.at(-1),idx=points.length-1;let dots='';
   if(finite(last.cci))dots+='<circle class="cci-last-dot cci-line-dot" cx="'+x(idx)+'" cy="'+y(last.cci)+'" r="3.5"/>';
   if(finite(last.smoothing_ma))dots+='<circle class="cci-last-dot '+(last.smoothing_color==='yellow'?'cci-sma-dot-yellow':last.smoothing_color==='purple'?'cci-sma-dot-purple':'cci-sma-dot-neutral')+'" cx="'+x(idx)+'" cy="'+y(last.smoothing_ma)+'" r="3.5"/>';
   return '<svg class="radar-cci-svg" viewBox="0 0 760 150" preserveAspectRatio="none" aria-label="CCI 20 原始白線，SMA 14 黃紫階梯">'+refs+steps+'<path class="cci-line" d="'+cciPath+'"/>'+dots+dates+'</svg>';
 }
 function content(symbol){
   const daily=config?.getDaily(symbol)||[],points=compute(daily),last=points.at(-1);
   const sma=last?.smoothing_ma,cci=last?.cci,tone=last?.smoothing_color||'gray';
   const relation=finite(cci)&&finite(sma)?cci>sma?'up':cci<sma?'down':'neutral':'neutral';
   const h='<div class="radar-cci-header"><span class="radar-cci-title">'+esc(symbol)+' · CCI 20 / SMA 14 · 1D</span><div class="radar-cci-live"><span class="radar-cci-value radar-sma '+tone+'">SMA <b>'+fmt(sma)+'</b></span><span class="radar-cci-value radar-raw '+relation+'">CCI <b>'+fmt(cci)+'</b></span></div></div>';
   return h+svg(points);
 }
 function reposition(anchor){
   if(!card||card.hidden||!anchor)return;
   // Floating chart headers rebuild capsule nodes on quote refresh. Re-anchor
   // to the new identical capsule instead of jumping to (0,0) with a stale node.
   if(!document.contains(anchor)){
     const cls=anchor.classList?.contains('chart-semantic')?'.chart-semantic.cci':'.metric-cci';
     anchor=[...document.querySelectorAll(cls+'[data-cci-hover]')].find(el=>el.dataset.cciHover===active);
     if(!anchor){hide();return;}target=anchor;
   }
   const r=anchor.getBoundingClientRect(),w=card.offsetWidth||520,h=card.offsetHeight||170;
   const x=Math.max(8,Math.min(window.innerWidth-w-8,r.left+r.width/2-w/2));
   const below=r.bottom+10,y=below+h<=window.innerHeight-8?below:Math.max(8,r.top-h-10);
   card.style.left=x+'px';card.style.top=y+'px';
 }
 function show(symbol,anchor){if(!config||!symbol||!anchor)return;make();active=symbol;target=anchor;card.innerHTML=content(symbol);signature='';card.hidden=false;reposition(anchor);}
 function hide(){clearTimeout(showTimer);if(card)card.hidden=true;active=null;target=null;signature='';}
 function refresh(){if(!active||!card||card.hidden)return;const old=card.innerHTML,html=content(active);if(html!==old){card.innerHTML=html;reposition(target);}}
 function enter(ev){const match=ev.target?.closest?.('[data-cci-hover]');if(!match||match.contains(ev.relatedTarget))return;
   clearTimeout(hideTimer);clearTimeout(showTimer);const symbol=match.dataset.cciHover;if(!symbol)return;
   showTimer=setTimeout(()=>{if(document.contains(match))show(symbol,match);},110);
 }
 function leave(ev){const match=ev.target?.closest?.('[data-cci-hover]');if(!match||match.contains(ev.relatedTarget))return;
   clearTimeout(showTimer);hideTimer=setTimeout(()=>hide(),120);
 }
 function init(opts){config=opts;make();if(root.LiqRadarCciCard._bound)return;root.LiqRadarCciCard._bound=true;
   document.addEventListener('pointerover',enter);document.addEventListener('pointerout',leave);
   document.addEventListener('scroll',()=>{if(active)reposition(target);},{passive:true,capture:true});
   window.addEventListener('resize',()=>{if(active)reposition(target);});
 }
 root.LiqRadarCciCard={init,refresh,compute,svg,show,hide,_bound:false};
})(window);
