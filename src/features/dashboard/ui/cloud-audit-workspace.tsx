"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { getPipelineAuthorizationHeader } from "@/lib/pipeline-session";
import { CLOUD_AUDIT_API as API, cloudAuditRequest } from "../data/cloud-audit-client";
import { AUDIT_MODULES, type AuditModule } from "../domain/ppc-audit";
import type { Conflict, ImportStage, Issue, ReportContext } from "../domain/cloud-audit";
import s from "./ppc-audit-workspace.module.css";
import c from "./cloud-audit-workspace.module.css";

type Coverage={accepted:number;excluded:number;repeated:number;conflictCount:number;partial:boolean};
type Review={id:string;name:string;filename:string;status:ImportStage;revision:number;context:ReportContext|null;progress:Record<string,string|number>;failure:string|null;rawAvailable:boolean;manifest:{id:string;name:string;rows:number;family:string|null}[];issues:Issue[];coverage:Coverage;conflicts:Conflict[];conflictPage:number};
type Snapshot={id:string;name:string;active:boolean;context:ReportContext;coverage:{partial:boolean};created_at:string};
type History={imports:{id:string;name:string;filename:string;status:ImportStage}[];snapshots:Snapshot[]};
type Metrics=Record<"spend"|"sales"|"orders"|"clicks"|"impressions",string|null>;
type ModuleData={snapshot:Snapshot;module:string;page:number;pageSize:number;total:number;rows:({label:string;rows:number}&Metrics)[];metrics:Metrics;ratios:{acos:number|null;cpc:number|null;conversion:number|null};note:string|null};
type Sources={snapshotId:string;page:number;rows:{id:string;source_name:string;source_row:string;campaign:string;campaign_id:string;family:string;grain:string;attribution:string;acceptance:string;metrics:Metrics}[]};
const terminal=new Set(["preview_ready","failed","cancelled","awaiting_period"]);
const metricLabels={spend:"Ad Spend",sales:"PPC Sales",orders:"PPC Orders",clicks:"Clicks",impressions:"Impressions"};
const number=(value:unknown)=>value===null||value===undefined?"—":Number(value).toLocaleString("en-US",{maximumFractionDigits:0});
export function CloudAuditWorkspace({todayIso,onLegacy,canEdit}:{todayIso:string;onLegacy:()=>void;canEdit:boolean}) {
  const [history,setHistory]=useState<History>({imports:[],snapshots:[]});
  const [review,setReview]=useState<Review|null>(null),[snapshot,setSnapshot]=useState("");
  const [module,setModule]=useState<AuditModule>("Performance Summary"),[data,setData]=useState<ModuleData|null>(null);
  const [page,setPage]=useState(0),[search,setSearch]=useState("");
  const [sources,setSources]=useState<Sources|null>(null);
  const [error,setError]=useState(""),[busy,setBusy]=useState(false),[uploadProgress,setUploadProgress]=useState<number|null>(null);
  const [period,setPeriod]=useState<ReportContext>({start:"",end:"",currency:"USD"});
  const input=useRef<HTMLInputElement>(null),abort=useRef<AbortController|null>(null);
  const importKey=useRef("");
  const refreshHistory=useCallback(async()=>{const result=await cloudAuditRequest<History>("");setHistory(result);return result;},[]);
  useEffect(()=>{let current=true;cloudAuditRequest<History>("").then(result=>{if(current){setHistory(result);setSnapshot(result.snapshots.find(v=>v.active)?.id||"");}}).catch(e=>{if(current)setError(e.message);});return()=>{current=false;abort.current?.abort();};},[]);
  const reviewId=review?.id,reviewStatus=review?.status;
  const detectedStart=review?.context?.start,detectedEnd=review?.context?.end;
  // Prefill detected report dates when the review status or detected range changes
  // (adjusted during render, as React recommends, instead of in an effect).
  const periodKey=`${reviewStatus??""}|${detectedStart??""}|${detectedEnd??""}`;
  const [appliedPeriodKey,setAppliedPeriodKey]=useState(periodKey);
  if(appliedPeriodKey!==periodKey){setAppliedPeriodKey(periodKey);if(reviewStatus==="awaiting_period")setPeriod(current=>({...current,start:detectedStart||current.start,end:detectedEnd||current.end}));}
  useEffect(()=>{
    if(!reviewId||terminal.has(reviewStatus||""))return;
    let current=true,timer:ReturnType<typeof setTimeout>;let failures=0;
    const poll=async()=>{try{const result=await cloudAuditRequest<Review>(`/${reviewId}`);if(current){setReview(result);failures=0;if(!terminal.has(result.status))timer=setTimeout(poll,3000);else void refreshHistory();}}catch(e){if(current){failures++;setError((e as Error).message);timer=setTimeout(poll,Math.min(30000,3000*2**failures));}}};
    timer=setTimeout(poll,1500);return()=>{current=false;clearTimeout(timer);};
  },[reviewId,reviewStatus,refreshHistory]);
  useEffect(()=>{
    if(!snapshot)return;const controller=new AbortController();let current=true;
    const timer=setTimeout(()=>{cloudAuditRequest<ModuleData>(`/snapshots/${snapshot}?module=${encodeURIComponent(module)}&page=${page}&search=${encodeURIComponent(search)}`,{signal:controller.signal}).then(result=>{if(current)setData(result);}).catch(e=>{if(current&&e.name!=="AbortError")setError(e.message);});},200);
    return()=>{current=false;clearTimeout(timer);controller.abort();};
  },[snapshot,module,page,search]);
  async function chooseFile(file:File) {
    if(file.size>50*1024*1024||!file.size||! /\.(csv|xlsx)$/i.test(file.name)){setError("Choose a PPC CSV or XLSX file up to 50 MB.");return;}
    setBusy(true);setError("");setUploadProgress(0);abort.current=new AbortController();importKey.current=crypto.randomUUID();
    try{
      const item=await cloudAuditRequest<{id:string;pathname:string}>("",{method:"POST",body:JSON.stringify({filename:file.name,size:file.size,name:"Amazon PPC Audit",idempotencyKey:importKey.current})});
      setReview(await cloudAuditRequest<Review>(`/${item.id}`));
      await upload(item.pathname,file,{access:"private",handleUploadUrl:`${API}/${item.id}/upload`,headers:getPipelineAuthorizationHeader(),multipart:true,abortSignal:abort.current.signal,onUploadProgress:({percentage})=>setUploadProgress(percentage)});
      setReview(await cloudAuditRequest<Review>(`/${item.id}/complete`,{method:"POST",body:JSON.stringify({revision:0})}));
      await refreshHistory();
    }catch(e){if((e as Error).name!=="AbortError")setError((e as Error).message);}
    finally{setBusy(false);setUploadProgress(null);if(input.current)input.current.value="";}
  }
  async function act(action:string,value:Record<string,unknown>={}) {
    if(!review)return;setBusy(true);setError("");
    try{
      const result=await cloudAuditRequest<Review&{id:string}>(`/${review.id}/${action}`,{method:"POST",body:JSON.stringify({revision:review.revision,...value})});
      if(action==="publish"){setSnapshot(result.id);setData(null);setReview(null);}else setReview(result);
      await refreshHistory();
    }catch(e){setError((e as Error).message);setReview(await cloudAuditRequest<Review>(`/${review.id}`).catch(()=>review));}
    finally{setBusy(false);}
  }
  async function openImport(id:string,conflictPage=0){setError("");try{const result=await cloudAuditRequest<Review>(`/${id}?page=${conflictPage}`);setReview(result);if(result.context)setPeriod(result.context);}catch(e){setError((e as Error).message);}}
  async function downloadOriginal(){if(!review)return;try{const response=await fetch(`${API}/${review.id}/raw`,{headers:getPipelineAuthorizationHeader()});if(!response.ok)throw new Error("The original is unavailable or expired.");const url=URL.createObjectURL(await response.blob());const anchor=document.createElement("a");anchor.href=url;anchor.download=review.filename;anchor.click();URL.revokeObjectURL(url);}catch(e){setError((e as Error).message);}}
  async function loadSources(sourcePage=0){try{setSources(await cloudAuditRequest<Sources>(`/snapshots/${snapshot}?sources=true&page=${sourcePage}&search=${encodeURIComponent(search)}`));}catch(e){setError((e as Error).message);}}
  return <section className={s.workspace} aria-label="Shared PPC audits">
    <header className={s.toolbar}><div><strong>Amazon PPC Audit</strong><small>Shared imports · PPC Report only</small></div><div className={s.actions}><button onClick={onLegacy}>Legacy local audits</button>{canEdit&&<button className={s.primary} disabled={busy||!!review&&!terminal.has(review.status)} onClick={()=>input.current?.click()}>Upload PPC Report</button>}<input ref={input} type="file" accept=".csv,.xlsx" hidden onChange={event=>{const file=event.target.files?.[0];if(file)void chooseFile(file);}}/></div></header>
    <div className={s.body}><nav className={s.sidebar} aria-label="Audit modules"><h2>Audit navigation · 14 modules</h2>{AUDIT_MODULES.map(name=><button key={name} aria-current={module===name?"page":undefined} onClick={()=>{setModule(name);setPage(0);setData(null);}}>{name}</button>)}<div className={s.sources}><strong>Audit history</strong>{history.snapshots.map(item=><button key={item.id} onClick={()=>{setSnapshot(item.id);setData(null);setPage(0);}} aria-pressed={snapshot===item.id}>{item.name}<small>{item.context.start} – {item.context.end}{item.coverage.partial?" · Partial":""}</small></button>)}<strong>Imports</strong>{history.imports.map(item=><button key={item.id} onClick={()=>void openImport(item.id)}>{item.filename}<small>{item.status.replaceAll("_"," ")}</small></button>)}</div></nav>
    <main className={s.main} tabIndex={0} aria-label="Audit report content">
      {error&&<p role="alert" className={s.note}>{error}</p>}
      {review&&<section className={`${s.card} ${c.review}`} aria-label="Import review"><div className={s.heading}><div><h2>{review.filename}</h2><p role="status">{uploadProgress!==null?`Uploading ${Math.round(uploadProgress)}%`:review.status.replaceAll("_"," ")}</p></div><div className={s.actions}>{canEdit&&!terminal.has(review.status)&&<button disabled={busy&&uploadProgress===null} onClick={()=>{abort.current?.abort();void act("cancel");}}>Cancel import</button>}<button disabled={busy||!terminal.has(review.status)} onClick={()=>setReview(null)}>Close review</button></div></div>
        {uploadProgress!==null&&<progress max={100} value={uploadProgress} aria-label="Upload progress"/>}
        <p>{review.context?`${review.context.start} – ${review.context.end} · ${review.context.currency}`:"Reporting dates are not yet confirmed."}</p>
        {!terminal.has(review.status)&&<p>{number(review.progress.parsedRows)} rows processed. You can leave this page after uploading; processing continues.</p>}
        {review.status==="awaiting_period"&&<form className={s.filters} onSubmit={event=>{event.preventDefault();void act("period",{context:period});}}><label>Report start date<input type="date" value={period.start} max={todayIso} required onChange={e=>setPeriod({...period,start:e.target.value})}/></label><label>Report end date<input type="date" value={period.end} min={period.start} max={todayIso} required onChange={e=>setPeriod({...period,end:e.target.value})}/></label><label>Currency<select value={period.currency} onChange={e=>setPeriod({...period,currency:e.target.value})}>{["USD","GBP","EUR","CAD","AUD","JPY"].map(v=><option key={v}>{v}</option>)}</select></label>{canEdit&&<button disabled={busy}>Continue processing</button>}<p>Dates could not be detected reliably. Use the report’s reporting period.</p></form>}
        {review.failure&&<p className={s.note}>{review.failure}</p>}
        {typeof review.progress.duplicateImport==="string"&&<button onClick={()=>void openImport(String(review.progress.duplicateImport))}>Review existing import</button>}
        {review.status==="failed"&&canEdit&&review.rawAvailable&&<button disabled={busy} onClick={()=>void act("retry")}>Retry processing</button>}
        {!!review.manifest.length&&<details><summary>Recognized sheets ({review.manifest.filter(v=>v.family).length} of {review.manifest.length})</summary><ul>{review.manifest.map(sheet=><li key={sheet.id}>{sheet.name} · {sheet.family||"Unsupported; excluded"} · {number(sheet.rows)} rows</li>)}</ul></details>}
        {review.status==="preview_ready"&&<><p className={s.note}>{number(review.coverage.accepted)} accepted rows · {number(review.coverage.excluded)} excluded · {number(review.coverage.repeated)} identical repeats. {review.coverage.partial?"Partial coverage; affected ratios are unavailable.":"No unresolved coverage issues."}</p>
          {review.conflicts.map(conflict=><div key={conflict.scope} className={c.conflict}><strong>{conflict.campaign}</strong><p>Overlapping sources disagree. Select one complete source or exclude this scope.</p><div className={s.tableWrap}><table className={s.table}><caption>Compare complete sources</caption><thead><tr><th>Source</th><th>Rows</th><th>Spend</th><th>PPC Sales</th><th>Orders</th></tr></thead><tbody>{conflict.sources.map(source=><tr key={source.id}><td>{source.name}<small>{source.grains.join(", ")}</small></td><td>{source.rows}</td><td>{number(source.metrics.spend)}</td><td>{number(source.metrics.sales)}</td><td>{number(source.metrics.orders)}</td></tr>)}</tbody></table></div>{canEdit?<label>Accepted source<select defaultValue="" disabled={busy} onChange={event=>{if(event.target.value)void act("review",{scope:conflict.scope,sourceId:event.target.value});}}><option value="" disabled>Choose a source</option>{conflict.sources.map(source=><option key={source.id} value={source.id} disabled={!source.selectable}>{source.name} · {source.rows} rows{!source.selectable?" · Internally conflicting":""}</option>)}<option value="exclude">Exclude this scope</option></select></label>:<p>An editor must choose the source.</p>}<details><summary>Scope details</summary><code>{conflict.scope}</code></details></div>)}
          {review.coverage.conflictCount>20&&<div className={s.actions}><button disabled={!review.conflictPage} onClick={()=>void openImport(review.id,review.conflictPage-1)}>Previous issues</button><button disabled={(review.conflictPage+1)*20>=review.coverage.conflictCount} onClick={()=>void openImport(review.id,review.conflictPage+1)}>Next issues</button></div>}
          {canEdit&&<button className={s.primary} disabled={busy||!review.coverage.accepted} onClick={()=>void act("publish")}>Use this audit{review.coverage.partial?" · Partial":""}</button>}<p>The selected audit stays available until you use this import.</p></>}
        {!!review.issues.length&&<details><summary>Diagnostics ({review.issues.length}{review.issues.length===100?"+":""})</summary><ul>{review.issues.map((issue,index)=><li key={index}>{issue.message}{issue.row?` · Row ${issue.row}`:""}</li>)}</ul></details>}
        {canEdit&&<button disabled={!review.rawAvailable||busy} onClick={()=>void downloadOriginal()}>Download original{!review.rawAvailable?" · Expired":""}</button>}<small>Original files expire after 30 days. Saved audit results remain available.</small>
      </section>}
      <div className={s.heading}><div><h1>{module}</h1><p>{snapshot?"From the selected shared audit snapshot.":"Upload a PPC Report, review its sources, then choose Use this audit."}</p></div>{snapshot&&<button onClick={()=>void loadSources()}>View source rows</button>}</div>
      {sources?.snapshotId===snapshot&&<section className={s.card}><div className={s.heading}><h2>Source provenance</h2><button onClick={()=>setSources(null)}>Close source rows</button></div><div className={s.tableWrap}><table className={s.table}><caption>Source rows · Page {sources.page+1}</caption><thead><tr><th>Source / row</th><th>Campaign ID</th><th>Grain</th><th>Attribution</th><th>Coverage</th></tr></thead><tbody>{sources.rows.map(row=><tr key={row.id}><td>{row.source_name} · {row.source_row}<small>{row.family}</small></td><td>{row.campaign_id}</td><td>{row.grain}</td><td>{row.attribution}</td><td>{row.acceptance}</td></tr>)}</tbody></table></div><div className={s.actions}><button disabled={!sources.page} onClick={()=>void loadSources(sources.page-1)}>Previous source rows</button><button disabled={sources.rows.length<50} onClick={()=>void loadSources(sources.page+1)}>Next source rows</button></div></section>}
      {snapshot&&data?.snapshot.id===snapshot&&data.module===module&&data.page===page?<>
        <p>{data.snapshot.context.start} – {data.snapshot.context.end} · {data.snapshot.context.currency} · Snapshot {data.snapshot.id.slice(0,8)}</p>
        {data.snapshot.coverage.partial&&<p className={s.note}>Partial coverage. Excluded scopes are not included; ratios are unavailable.</p>}
        <div className={s.metrics}>{Object.entries(metricLabels).map(([key,label])=><div key={key} className={s.metric}><span>{label}</span><strong>{number(data.metrics[key as keyof Metrics])}</strong><small>Accepted campaign coverage</small></div>)}<div className={s.metric}><span>ACOS</span><strong>{data.ratios.acos===null?"—":`${number(data.ratios.acos)}%`}</strong><small>Unavailable when coverage is incomplete</small></div></div>
        {data.note&&<p className={s.note}>{data.note}</p>}
        <div className={s.filters}><label>Search this module<input value={search} onChange={e=>{setSearch(e.target.value);setPage(0);}} placeholder="Search labels…"/></label><span>{number(data.total)} results</span></div>
        <div className={s.tableWrap}><table className={s.table}><caption>{module} · accepted sources only</caption><thead><tr><th>Group</th>{Object.values(metricLabels).map(v=><th key={v}>{v}</th>)}</tr></thead><tbody>{data.rows.map((row,index)=><tr key={`${row.label}-${index}`}><td>{row.label}</td>{Object.keys(metricLabels).map(key=><td key={key}>{number(row[key as keyof Metrics])}</td>)}</tr>)}{!data.rows.length&&<tr><td colSpan={6}>No accepted rows for this module and filter. A separate report breakdown may be required.</td></tr>}</tbody></table></div>
        <div className={s.actions}><button disabled={!page} onClick={()=>setPage(page-1)}>Previous</button><span>Page {page+1}</span><button disabled={(page+1)*50>=data.total} onClick={()=>setPage(page+1)}>Next</button></div>
      </>:snapshot?<p role="status">Loading audit results…</p>:<div className={s.empty}>No shared audit selected. Local audits are available in Legacy local audits.</div>}
    </main></div>
  </section>;
}
