/* v1.6.0 - explicit click to open; hover inside chart works, leave chart closes. */
(()=>{'use strict';
 const root=document.getElementById('fgPopover'),trigger=document.getElementById('fgTrigger'),panel=document.getElementById('fgPanel'),frame=document.getElementById('fgChartFrame');
 if(!root||!trigger||!panel||!frame)return;
 // Portal prevents the fixed footer from clipping or stacking below floating chart windows.
 document.body.append(panel);
 let open=false,closeTimer=0;
 function position(){
   const width=Math.min(1020,innerWidth-30),height=Math.min(660,innerHeight-82);
   const left=Math.max(12,Math.min(innerWidth-width-12,trigger.getBoundingClientRect().right-width));
   const top=Math.max(12,innerHeight-height-56);
   Object.assign(panel.style,{width:width+'px',height:height+'px',left:left+'px',top:top+'px'});
 }
 function show(){clearTimeout(closeTimer);if(!frame.getAttribute('src'))frame.src=frame.dataset.src;
   open=true;position();panel.classList.add('fg-click-open');trigger.setAttribute('aria-expanded','true');}
 function hide(){clearTimeout(closeTimer);open=false;panel.classList.remove('fg-click-open');trigger.setAttribute('aria-expanded','false');}
 trigger.addEventListener('click',event=>{event.stopPropagation();open?hide():show();});
 // Trigger -> panel has a short pointer travel corridor. The panel itself closes when left.
 trigger.addEventListener('pointerleave',()=>{if(open)closeTimer=setTimeout(()=>{if(!panel.matches(':hover'))hide();},600);});
 panel.addEventListener('pointerenter',()=>clearTimeout(closeTimer));
 panel.addEventListener('pointerleave',hide);
 document.addEventListener('pointerdown',event=>{if(open&&!panel.contains(event.target)&&!root.contains(event.target))hide();});
 document.addEventListener('keydown',event=>{if(open&&event.key==='Escape')hide();});
 window.addEventListener('resize',()=>{if(open)position();});
})();
