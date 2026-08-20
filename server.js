import express from "express";
import OpenAI from "openai";
const app=express(); app.use(express.json({limit:"2mb"})); app.use(express.static("public"));
const PORT=process.env.PORT||3000;

function ema(v,p){if(v.length<p)return null;let e=v.slice(0,p).reduce((a,b)=>a+b,0)/p,k=2/(p+1);for(let i=p;i<v.length;i++)e=v[i]*k+e*(1-k);return e}
function analyze(c){
 if(c.length<20)throw Error("At least 20 candles are required.");
 const closes=c.map(x=>+x.close),last=c.at(-1),prev=c.at(-2),e20=ema(closes,20),e50=ema(closes,50);
 const r=c.slice(-20),hi=Math.max(...r.map(x=>+x.high)),lo=Math.min(...r.map(x=>+x.low));
 const atr=r.reduce((s,x)=>s+(+x.high-+x.low),0)/r.length;
 const bull=e50?last.close>e20&&e20>e50:last.close>e20,bear=e50?last.close<e20&&e20<e50:last.close<e20;
 const bias=bull?"Bullish":bear?"Bearish":"Sideways";
 const body=Math.abs(last.close-last.open),up=last.high-Math.max(last.open,last.close),dn=Math.min(last.open,last.close)-last.low;
 const pattern=bull&&dn>body*2?"Bullish rejection":bear&&up>body*2?"Bearish rejection":last.close>last.open?"Bullish candle":"Bearish candle";
 const entry=+last.close,risk=Math.max(atr*1.15,Math.abs(entry-(bull?lo:hi))),sl=bull?entry-risk:entry+risk;
 const t1=bull?entry+risk*2:entry-risk*2,t2=bull?entry+risk*3:entry-risk*3;
 let score=50+(bias==="Sideways"?0:18)+(pattern.includes("rejection")?8:0)+((last.close>prev.close)===bull?8:0);
 score=Math.max(35,Math.min(92,Math.round(score))); const p=bias==="Bullish"?score:bias==="Bearish"?100-score:50;
 return {bias,score,pattern,ema20:e20,ema50:e50,support:lo,resistance:hi,entry,stop_loss:sl,target_1:t1,target_2:t2,risk_reward:"1:2 / 1:3",bullish_probability:p,bearish_probability:100-p,invalidation:bull?`Below ${sl}`:bear?`Above ${sl}`:"Range break",updated_at:new Date().toISOString()};
}

app.get("/api/health",(req,res)=>res.json({ok:true,service:"AI Trading Analyzer V5"}));
app.get("/api/candles",async(req,res)=>{
 try{
  const symbol=req.query.symbol||"XAU/USD",interval=req.query.interval||"15min";
  if(!process.env.TWELVE_DATA_API_KEY)return res.status(503).json({error:"TWELVE_DATA_API_KEY is not configured."});
  const u=new URL("https://api.twelvedata.com/time_series"); u.searchParams.set("symbol",symbol);u.searchParams.set("interval",interval);u.searchParams.set("outputsize","100");u.searchParams.set("apikey",process.env.TWELVE_DATA_API_KEY);
  const rr=await fetch(u),d=await rr.json(); if(!rr.ok||d.status==="error")throw Error(d.message||"Market data request failed");
  const candles=(d.values||[]).reverse().map(x=>({time:x.datetime,open:+x.open,high:+x.high,low:+x.low,close:+x.close,volume:+(x.volume||0)}));
  res.json({symbol,interval,candles,analysis:analyze(candles)});
 }catch(e){res.status(500).json({error:e.message})}
});
app.post("/api/ai-commentary",async(req,res)=>{
 try{
  if(!process.env.OPENAI_API_KEY)return res.status(503).json({error:"OPENAI_API_KEY is not configured."});
  const client=new OpenAI({apiKey:process.env.OPENAI_API_KEY});
  const r=await client.responses.create({model:process.env.OPENAI_MODEL||"gpt-5.6-luna",input:`You are a cautious trading-analysis assistant. Explain this numeric technical setup. Do not guarantee outcomes. State confirmation and invalidation clearly. Return concise plain text.\n${JSON.stringify(req.body)}`});
  res.json({commentary:r.output_text});
 }catch(e){res.status(500).json({error:e.message})}
});
app.post("/webhook/tradingview",(req,res)=>{console.log("TradingView alert",req.body);res.json({ok:true})});
app.listen(PORT,()=>console.log(`V5 listening on ${PORT}`));
