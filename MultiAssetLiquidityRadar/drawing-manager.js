/* Drawing manager v2.0.0 — list and clear only per-symbol drawings; workspace stays intact. */
(()=>{'use strict';
 const $=id=>document.getElementById(id),api=window.DrawingWorkspace;
 if(!api)return;
 const modal=$('dwManageModal'),status=$('dwManagerStatus'),list=$('dwManagerList');
 const clear=()=>{modal.hidden=true;};
 const fillRisk=()=>{const d=window.LIQ_WORKSPACE?.getDefaultRisk?.();if(!d)return;$('dwDefaultRisk1').value=d.riskAmount1;$('dwDefaultRisk2').value=d.riskAmount2;};
 const fillRR=()=>{const d=window.LIQ_WORKSPACE?.getRRThresholds?.()||window.LIQ_RR_CONFIG?.getThresholds?.();
   if(!d)return;$('dwRRContinuation').value=d.continuation;$('dwRRReversal').value=d.reversal;};
 $('dwRRSave')?.addEventListener('click',async()=>{
   const continuation=Number($('dwRRContinuation').value),reversal=Number($('dwRRReversal').value);
   const ok=$('dwRRContinuation').value.trim()!==''&&$('dwRRReversal').value.trim()!==''&&
     await window.LIQ_WORKSPACE?.setRRThresholds?.({continuation,reversal});
   $('dwRRStatus').textContent=!ok?.valid?'請輸入有效 RR（1.00～100.00）':ok.synced?'RR 已儲存到 R2，跨裝置同步生效':'RR 已存本機，R2 尚未同步成功；連線恢復後重試';
 });
 $('dwRRReset')?.addEventListener('click',async()=>{
   const defaults=window.LIQ_RR_CONFIG?.DEFAULTS||{continuation:1.5,reversal:1.7};
   const ok=await window.LIQ_WORKSPACE?.setRRThresholds?.({...defaults});if(ok?.valid){fillRR();$('dwRRStatus').textContent=ok.synced?'已恢復 1.50／1.70 且儲存到 R2':'已恢復預設並存本機，R2 待同步';}
 });
 $('dwDefaultRiskSave')?.addEventListener('click',async()=>{const data={riskAmount1:Number($('dwDefaultRisk1').value),riskAmount2:Number($('dwDefaultRisk2').value)};const ok=await window.LIQ_WORKSPACE?.setDefaultRisk?.(data);$('dwDefaultRiskStatus').textContent=!ok?.valid?'請輸入兩個有效且大於 0 的金額':ok.synced?'止損金額已存入獨立 R2 設定；新畫部位將使用此金額':'止損金額已存本機，R2 尚未同步成功；連線恢復後重試';});
 async function render(){list.replaceChildren();status.textContent='正在讀取 R2 與本機繪圖…';
   const rows=await api.listRemote();status.textContent=rows.length?`共有 ${rows.length} 個具備繪圖記憶的標的`:'沒有可列出的繪圖記憶（遠端若未部署，請檢查 Worker）';
   for(const x of rows){const row=document.createElement('div');row.className='dw-manager-item';
     const info=document.createElement('span');info.textContent=`${x.symbol}｜${x.count||0} 個｜${x.updatedAt?new Date(x.updatedAt).toLocaleString('zh-TW',{timeZone:'Asia/Taipei'}):'本機資料'}`;
     const del=document.createElement('button');del.type='button';del.textContent='清除該幣';del.title='僅清除此幣的繪圖及 HA 延伸，不影響監控清單與視窗';
     del.addEventListener('click',async()=>{if(!confirm('確定清空 '+x.symbol+' 所有繪圖記憶？\n不會刪除監控清單或圖表視窗。'))return;
       del.disabled=true;const ok=await api.clearSymbol(x.symbol);status.textContent=ok?'已清除並寫入 R2':'已清除本機，R2 暫未同步成功（稍後重試）';await render();});
     const short=x.symbol.replace(/_USDT_PERP$/,'');
     if(window.LIQ_CHART_API?.hasSymbol?.(short)){
       const show=document.createElement('button');show.type='button';show.textContent='開啟圖表';
       show.addEventListener('click',()=>{window.LIQ_WORKSPACE?.addWindow?.(short);modal.hidden=true;});
       row.append(info,show,del);
     }else row.append(info,del);
     list.append(row);
   }
 }
 $('drawingManageButton')?.addEventListener('click',()=>{modal.hidden=false;fillRisk();fillRR();void render();});
 $('dwManageClose')?.addEventListener('click',clear);
 $('dwManagerRefresh')?.addEventListener('click',()=>void render());
 modal.addEventListener('click',e=>{if(e.target===modal)clear();});
 $('dwPositionModal')?.addEventListener('click',e=>{if(e.target===e.currentTarget)e.currentTarget.hidden=true;});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'){$('dwPositionModal').hidden=true;clear();}});
})();
