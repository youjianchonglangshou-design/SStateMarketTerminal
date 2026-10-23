/* Multi-Asset Liquidity Radar v1.0.0 — watchlist from user's chosen symbols. */
(function(g){ 'use strict';
const crypto=['BTC','ETH','LTC','BCH','ETC','DOGE','DOT','XRP','ADA','LINK','SOL','BNB','AVAX','UNI','ATOM','AAVE','ARB','OP','SUI','PEPE','SHIB','WLD','ORDI','FLOKI','XLM','BOME','TAO'];
// CRMX deliberately excluded. SOXLX explicitly called out in user's CoinGlass example.
const tokenized=['XAU','TSLAX','INTCX','MSTRX','NVDAX','CRCLX','COINX','HOODX','MUX','MRVLX','METAX',CL'];
const cgOverrides={CL:['CL'],MUX:['MU'],XAU:['XAU'],PEPE:['1000PEPE'],SHIB:['1000SHIB'],FLOKI:['1000FLOKI']};
const all=[...crypto.map(id=>({id,group:'crypto'})),...tokenized.map(id=>({id,group:'stock'}))].map(s=>({
 ...s,pionex:s.id+'_USDT_PERP',tv:'PIONEX:'+s.id+'USDT.P',cg:cgOverrides[s.id]||[s.group==='stock'?s.id.replace(/X$/,''):s.id]
}));
g.LIQ_SYMBOLS=Object.freeze(all);
g.LIQ_VERSION='1.0.0';
})(window);
