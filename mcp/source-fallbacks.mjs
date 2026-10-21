/**
 * Public daily OHLC alternatives for an independent MCP when the deployed
 * primary Worker endpoint or Pionex API is unavailable. These are clearly
 * labelled CROSS-EXCHANGE spot proxies, never misrepresented as Pionex PERP.
 * All URLs are deterministic/public; no keys and no user supplied hostname.
 */
export async function fallbackDailyHistory(base,readJson,normalize){
  const b=String(base).toUpperCase();
  if(!/^[A-Z0-9]{1,20}$/.test(b))throw Error('unsupported cross-exchange symbol');
  const lower=b.toLowerCase();
  const usdt=b+'USDT';
  const urls=[
    {name:'COINBASE_USD_SPOT_PROXY',quote:'USD',
      url:'https://api.exchange.coinbase.com/products/'+b+'-USD/candles?granularity=86400',
      parse:p=>Array.isArray(p)?p.map(x=>({time:Number(x[0])*1000,low:x[1],high:x[2],open:x[3],close:x[4],volume:x[5]})):null},
    {name:'KRAKEN_USD_SPOT_PROXY',quote:'USD',
      url:'https://api.kraken.com/0/public/OHLC?pair='+(b==='BTC'?'XBT':b)+'USD&interval=1440',
      parse:p=>{const r=p?.result;if(!r||p.error?.length)return null;
        const key=Object.keys(r).find(x=>x!=='last'&&Array.isArray(r[x]));
        return key?r[key].map(x=>({time:Number(x[0])*1000,open:x[1],high:x[2],low:x[3],close:x[4],volume:x[6]})):null;}},
    {name:'BITSTAMP_USD_SPOT_PROXY',quote:'USD',
      url:'https://www.bitstamp.net/api/v2/ohlc/'+lower+'usd/?step=86400&limit=200',
      parse:p=>Array.isArray(p?.data?.ohlc)?p.data.ohlc.map(x=>({time:Number(x.timestamp)*1000,open:x.open,high:x.high,low:x.low,close:x.close,volume:x.volume})):null},
    {name:'GATE_USDT_SPOT_PROXY',quote:'USDT',
      url:'https://api.gateio.ws/api/v4/spot/candlesticks?currency_pair='+b+'_USDT&interval=1d&limit=200',
      parse:p=>Array.isArray(p)?p.map(x=>({time:Number(x[0])*1000,open:x[5],high:x[3],low:x[4],close:x[2],volume:x[6]??x[1]})):null},
    {name:'CRYPTOCOMPARE_USDT_SPOT_PROXY',quote:'USDT',
      url:'https://min-api.cryptocompare.com/data/v2/histoday?fsym='+b+'&tsym=USDT&limit=200',
      parse:p=>Array.isArray(p?.Data?.Data)?p.Data.Data.map(x=>({time:Number(x.time)*1000,open:x.open,high:x.high,low:x.low,close:x.close,volume:x.volumefrom})):null},
    {name:'BITFINEX_USD_SPOT_PROXY',quote:'USD',
      url:'https://api-pub.bitfinex.com/v2/candles/trade:1D:t'+b+'USD/hist?limit=200&sort=1',
      parse:p=>Array.isArray(p)?p.map(x=>({time:Number(x[0]),open:x[1],close:x[2],high:x[3],low:x[4],volume:x[5]})):null},
    {name:'GEMINI_USD_SPOT_PROXY',quote:'USD',
      url:'https://api.gemini.com/v2/candles/'+lower+'usd/1day',
      parse:p=>Array.isArray(p)?p.map(x=>({time:Number(x[0]),open:x[1],high:x[2],low:x[3],close:x[4],volume:x[5]})):null}
  ];
  const responses=await Promise.allSettled(urls.map(async provider=>{
    const payload=await readJson(provider.url);
    const raw=provider.parse(payload);
    if(!Array.isArray(raw))throw Error('response has no OHLC array');
    const clean=normalize(raw);
    const now=Date.now(),latest=clean.at(-1)?.time;
    if(clean.length<40)throw Error('fewer than 40 valid daily OHLC bars');
    if(latest>now+86400000||latest<now-10*86400000)throw Error('daily history is stale or future dated');
    return {klines:clean.slice(-200),source:provider.name,quote_currency:provider.quote,
      market_basis:'SPOT_PROXY',cross_exchange_proxy:true,fetched_at:new Date().toISOString()};
  }));
  const first=responses.find(x=>x.status==='fulfilled');
  if(first)return first.value;
  const errors=responses.map((r,i)=>urls[i].name+':'+String(r.reason?.message||'unavailable'));
  throw Error('daily history unavailable: '+errors.join(' | '));
}
