import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Activity, AlertTriangle, BarChart3, BedDouble, Bell, CheckCircle2, Clock,
  ClipboardList, DoorOpen, Download, Filter, LayoutDashboard, MessageSquare,
  Plus, RefreshCw, Search, Stethoscope, Trash2, UserRound, Users, X, Wifi,
  ShieldCheck, Database, Upload, Zap, ArrowRight, ClipboardCheck, TimerReset,
  CalendarDays, Sparkles, ChevronsRight, MonitorCheck, FileUp, Eye
} from 'lucide-react';
import {
  Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis
} from 'recharts';
import './styles.css';
import { boardPath, isLiveConfigured, saveLiveBoard, subscribeLiveBoard } from './liveStore.js';

const STAGES = ['Scheduled','Checked in','Waiting room','Roomed','MA/nurse done','Provider in room','Provider done','Imaging/procedure','Checkout','Completed'];
const ACTIVE_STAGES = STAGES.filter(s => s !== 'Completed');
const DELAY_REASONS = ['Provider running behind','Patient arrived late','Paperwork incomplete','Insurance issue','Waiting for room','Waiting for MA/nurse','Waiting for imaging/X-ray','Procedure setup','Room turnover delay','Checkout delay','Complex visit','Patient questions'];
const ROOM_STATUSES = ['Ready','Occupied','Needs turnover','Waiting for provider','Waiting for MA','Waiting for imaging','Closed'];
const PROVIDERS = ['Dr. Eeric Truumees','Dr. Matthew Geck','Dr. John Stokes','Dr. Lee Moroz','Dr. Enrique Pena','Dr. Kano Mayer','Dr. Rory Mayer','Dr. Alex Cruz','Dr. John Politz'];
const VISIT_TYPES = ['New patient','Follow-up','Post-op','Injection','Imaging review','Procedure'];
const ROLES = [
  { id:'command', label:'Command', icon:MonitorCheck, note:'next actions + whole clinic' },
  { id:'frontdesk', label:'Front desk', icon:ClipboardList, note:'arrivals + checkout' },
  { id:'ma', label:'MA / rooming', icon:BedDouble, note:'rooms + rooming flow' },
  { id:'provider', label:'Provider', icon:Stethoscope, note:'ready rooms' },
  { id:'manager', label:'Manager', icon:BarChart3, note:'bottlenecks + report' },
];
const CHART_COLORS = ['#2563eb','#0f766e','#f59e0b','#e11d48','#7c3aed','#0891b2','#16a34a','#ea580c'];
const WAIT_RULES = {
  'Scheduled': 5,
  'Checked in': 10,
  'Waiting room': 15,
  'Roomed': 12,
  'MA/nurse done': 10,
  'Provider in room': 35,
  'Provider done': 8,
  'Imaging/procedure': 20,
  'Checkout': 10
};
const now = () => Date.now();
const minsBetween = (a, b = now()) => a ? Math.max(0, Math.round((b - a) / 60000)) : 0;
const fmtTime = (ts) => ts ? new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '—';
const todayISO = () => new Date().toISOString().slice(0,10);
function appointmentTimestamp(timeText){
  if(!timeText) return now();
  const clean = String(timeText).trim();
  const d = new Date(`${todayISO()} ${clean}`);
  if(!isNaN(d)) return d.getTime();
  const m = clean.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if(m){ let h=Number(m[1]); const min=Number(m[2]||0); const ap=m[3]?.toLowerCase(); if(ap==='pm' && h<12) h+=12; if(ap==='am' && h===12) h=0; const dt=new Date(); dt.setHours(h,min,0,0); return dt.getTime(); }
  return now();
}
function createBlankBoard() {
  const base = now();
  return {
    createdAt: base,
    updatedAt: base,
    rooms: Array.from({ length: 10 }, (_, i) => ({ id: `Room ${i + 1}`, status: 'Ready', patientId: null, updatedAt: base })),
    visits: []
  };
}

function App(){
  const [data,setData] = useState(null);
  const [liveStatus,setLiveStatus] = useState(isLiveConfigured ? 'connecting':'not-configured');
  const [remoteReady,setRemoteReady] = useState(false);
  const [role,setRole] = useState('command');
  const [providerFilter,setProviderFilter] = useState('All');
  const [search,setSearch] = useState('');
  const [selectedVisit,setSelectedVisit] = useState(null);
  const [showAdd,setShowAdd] = useState(false);
  const [showImport,setShowImport] = useState(false);
  const [tick,setTick] = useState(0);
  const applyingRemote = useRef(false);

  useEffect(()=>{
    if(!isLiveConfigured){ setLiveStatus('not-configured'); return; }
    const unsub = subscribeLiveBoard((remoteData)=>{ applyingRemote.current=true; setData(remoteData); setRemoteReady(Boolean(remoteData)); setLiveStatus(remoteData?'live':'empty'); }, (err)=>{ console.error(err); setLiveStatus('error'); });
    return unsub;
  },[]);
  useEffect(()=>{
    if(!data || !remoteReady) return;
    if(applyingRemote.current){ applyingRemote.current=false; return; }
    saveLiveBoard({...data, updatedAt: now()}).catch(()=>setLiveStatus('error'));
  },[data, remoteReady]);
  useEffect(()=>{ const t=setInterval(()=>setTick(x=>x+1), 30000); return ()=>clearInterval(t); },[]);

  async function createLiveBoard(){ const blank=createBlankBoard(); setData(blank); setRemoteReady(true); await saveLiveBoard(blank).then(()=>setLiveStatus('live')).catch(()=>setLiveStatus('error')); }
  async function clearTodayBoard(){ if(!window.confirm('Clear today’s live board? This removes visits but keeps rooms.')) return; const blank=createBlankBoard(); setData(blank); setSelectedVisit(null); await saveLiveBoard(blank).catch(()=>setLiveStatus('error')); }

  if(!isLiveConfigured) return <LiveSetupScreen />;
  if(!data) return <EmptyLiveBoard status={liveStatus} createLiveBoard={createLiveBoard}/>;

  const visits = data.visits || [];
  const rooms = data.rooms || [];
  const metrics = computeMetrics(data, tick);
  const alerts = computeAlerts(data, tick);
  const nextActions = computeNextActions(data, metrics, alerts, tick);
  const charts = buildChartData(data, metrics);
  const risks = computeScheduleRisks(data, tick);
  const { clinicId, boardId } = boardPath();
  const filteredVisits = visits.filter(v=>{
    if(providerFilter !== 'All' && v.provider !== providerFilter) return false;
    if(search && !`${v.initials} ${v.provider} ${v.visitType} ${v.room||''} ${v.stage}`.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  function setBoard(updater){ setData(prev => typeof updater === 'function' ? updater(prev) : updater); }
  function updateVisit(id, patch){ setBoard(prev=>({...prev, visits: prev.visits.map(v=>v.id===id?{...v,...patch}:v)})); }
  function addVisit(visit){ setBoard(prev=>({...prev, visits:[...prev.visits, visit]})); setShowAdd(false); }
  function importVisits(newVisits){ setBoard(prev=>({...prev, visits:[...prev.visits, ...newVisits]})); setShowImport(false); }
  function moveVisit(id, nextStage){
    setBoard(prev=>{
      const stamp=now();
      const visit=prev.visits.find(v=>v.id===id); if(!visit) return prev;
      const patch={ stage:nextStage, stageStartedAt:stamp, timestamps:{...(visit.timestamps||{}), [nextStage]:stamp}, completedAt: nextStage==='Completed'?stamp:visit.completedAt };
      let rooms = prev.rooms;
      if(nextStage==='Roomed' && visit.room){ rooms = rooms.map(r=>r.id===visit.room?{...r,status:'Occupied',patientId:id,updatedAt:stamp}:r); }
      if(nextStage==='Provider done' && visit.room){ rooms = rooms.map(r=>r.id===visit.room?{...r,status:'Needs turnover',patientId:null,updatedAt:stamp}:r); }
      if(nextStage==='Completed' && visit.room){ rooms = rooms.map(r=>r.id===visit.room?{...r,status:'Ready',patientId:null,updatedAt:stamp}:r); }
      return {...prev, rooms, visits: prev.visits.map(v=>v.id===id?{...v,...patch}:v)};
    });
  }
  function moveToRoom(id, roomId){
    setBoard(prev=>{
      const stamp=now();
      const rooms=prev.rooms.map(r=> r.id===roomId ? {...r,status:'Occupied',patientId:id,updatedAt:stamp} : r.patientId===id ? {...r,status:'Ready',patientId:null,updatedAt:stamp} : r);
      return {...prev, rooms, visits: prev.visits.map(v=>v.id===id?{...v, room:roomId, stage:'Roomed', stageStartedAt:stamp, timestamps:{...(v.timestamps||{}), Roomed:stamp}}:v)};
    });
  }
  function tagDelay(id, reason){ setBoard(prev=>({...prev, visits: prev.visits.map(v=>v.id===id?{...v, delayReasons: (v.delayReasons||[]).includes(reason)?v.delayReasons:[...(v.delayReasons||[]), reason]}:v)})); }
  function updateRoom(id, status){ setBoard(prev=>({...prev, rooms: prev.rooms.map(r=>r.id===id?{...r,status,updatedAt:now(), patientId: status==='Ready'?null:r.patientId}:r)})); }
  function exportReport(){ const report=buildTextReport(data, metrics, alerts, risks); const blob=new Blob([report],{type:'text/plain;charset=utf-8'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`ClinicFlowIQ_Report_${todayISO()}.txt`; a.click(); URL.revokeObjectURL(a.href); }

  return <div className="app">
    <header className="topbar">
      <button className="brand" onClick={()=>setRole('command')}><span><Activity size={19}/></span><div><b>ClinicFlowIQ</b><small>smart live clinic-flow board</small></div></button>
      <nav>{ROLES.map(r=>{const I=r.icon; return <button key={r.id} className={role===r.id?'active':''} onClick={()=>setRole(r.id)}><I size={16}/>{r.label}</button>})}</nav>
    </header>
    <main className="page">
      <section className="hero liveHero">
        <div>
          <div className="eyebrow"><Wifi size={14}/> Live Firebase board · {clinicId} / {boardId}</div>
          <h1>Show the team what needs attention now.</h1>
          <p>Built to reduce manual tracking: import the schedule, use one-tap status changes, and tag delay reasons only when a card turns red.</p>
          <div className="liveStatusRow inline"><span className={`liveBadge ${liveStatus}`}>{liveStatus==='live'?'Live sync active':liveStatus}</span><span><ShieldCheck size={15}/> Use initials/ticket numbers only</span></div>
        </div>
        <div className="metricsGrid compact"><Metric label="Active visits" value={metrics.activeVisits} tone="blue"/><Metric label="Needs action" value={nextActions.length} tone="rose"/><Metric label="Avg visit" value={`${metrics.avgCycle||0} min`} tone="green"/><Metric label="Longest wait" value={`${metrics.longestWait||0} min`} tone="orange"/></div>
      </section>

      <RoleToolbar role={role} setRole={setRole} />

      <section className="toolbar polishedToolbar">
        <div className="searchBox"><Search size={16}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search initials/ticket, provider, visit type, room" /></div>
        <div className="filter"><Filter size={16}/><select value={providerFilter} onChange={e=>setProviderFilter(e.target.value)}><option>All</option>{PROVIDERS.map(p=><option key={p}>{p}</option>)}</select></div>
        <button className="primary" onClick={()=>setShowAdd(true)}><Plus size={16}/> Add visit</button>
        <button className="primary alt" onClick={()=>setShowImport(true)}><FileUp size={16}/> Import schedule CSV</button>
        <button className="soft" onClick={exportReport}><Download size={16}/> Export report</button>
        <button className="dangerBtn" onClick={clearTodayBoard}><Trash2 size={16}/> Clear today</button>
      </section>

      {role==='command' && <CommandView visits={filteredVisits} rooms={rooms} metrics={metrics} alerts={alerts} nextActions={nextActions} risks={risks} charts={charts} moveVisit={moveVisit} moveToRoom={moveToRoom} tagDelay={tagDelay} onSelect={setSelectedVisit}/>} 
      {role==='frontdesk' && <FrontDeskView visits={filteredVisits} nextActions={nextActions} moveVisit={moveVisit} onSelect={setSelectedVisit}/>} 
      {role==='ma' && <MAView visits={filteredVisits} rooms={rooms} moveVisit={moveVisit} moveToRoom={moveToRoom} updateRoom={updateRoom} tagDelay={tagDelay} onSelect={setSelectedVisit}/>} 
      {role==='provider' && <ProviderView visits={filteredVisits} providerFilter={providerFilter} moveVisit={moveVisit} onSelect={setSelectedVisit}/>} 
      {role==='manager' && <ManagerView data={data} metrics={metrics} alerts={alerts} risks={risks} charts={charts} exportReport={exportReport}/>} 
    </main>
    {selectedVisit && <VisitDrawer visit={selectedVisit} close={()=>setSelectedVisit(null)} moveVisit={moveVisit} tagDelay={tagDelay} updateVisit={updateVisit} />}
    {showAdd && <AddVisitModal close={()=>setShowAdd(false)} add={addVisit} rooms={rooms}/>} 
    {showImport && <CSVImportModal close={()=>setShowImport(false)} importVisits={importVisits}/>} 
  </div>
}

function RoleToolbar({role,setRole}){ return <section className="roleStrip">{ROLES.map(r=>{const I=r.icon;return <button key={r.id} className={role===r.id?'on':''} onClick={()=>setRole(r.id)}><I size={18}/><b>{r.label}</b><small>{r.note}</small></button>})}</section> }
function Metric({label,value,tone}){ return <div className={`metric ${tone}`}><b>{value}</b><span>{label}</span></div> }

function CommandView(props){ const {visits,rooms,metrics,alerts,nextActions,risks,charts,moveVisit,moveToRoom,tagDelay,onSelect}=props; return <div className="commandGrid">
  <NextActionsPanel actions={nextActions} moveVisit={moveVisit} moveToRoom={moveToRoom} tagDelay={tagDelay}/>
  <section className="panel"><div className="sectionTitle"><LayoutDashboard size={18}/><h2>Live flow</h2></div><FlowBoard visits={visits} moveVisit={moveVisit} tagDelay={tagDelay} onSelect={onSelect}/></section>
  <section className="panel sidePanel"><div className="sectionTitle"><Bell size={18}/><h2>Bottlenecks</h2></div><AlertList alerts={alerts}/><ScheduleRiskList risks={risks}/></section>
  <section className="panel sidePanel"><div className="sectionTitle"><BedDouble size={18}/><h2>Rooms</h2></div><RoomTiles rooms={rooms} visits={visits}/></section>
  <DashboardCharts charts={charts}/>
</div> }
function FrontDeskView({visits,nextActions,moveVisit,onSelect}){ const front = visits.filter(v=>['Scheduled','Checked in','Waiting room','Checkout'].includes(v.stage)); return <section className="panel"><div className="sectionTitle"><ClipboardList size={18}/><h2>Front desk queue</h2></div><p className="helper">Focus only on arrivals, waiting room, delay notifications, and checkout. No room-board clutter.</p><div className="priorityList">{nextActions.filter(a=>['arrival','notify','checkout','late'].includes(a.type)).map(a=><ActionCard key={a.id} action={a} moveVisit={moveVisit}/>)}</div><VisitList visits={front} moveVisit={moveVisit} onSelect={onSelect}/></section> }
function MAView({visits,rooms,moveVisit,moveToRoom,updateRoom,tagDelay,onSelect}){ const ma = visits.filter(v=>['Checked in','Waiting room','Roomed','MA/nurse done','Imaging/procedure'].includes(v.stage)); return <div className="twoCol"><section className="panel"><div className="sectionTitle"><BedDouble size={18}/><h2>Rooming worklist</h2></div><p className="helper">Room next patient, update room status, and tag reasons only for delayed red cards.</p><VisitList visits={ma} moveVisit={moveVisit} moveToRoom={moveToRoom} tagDelay={tagDelay} onSelect={onSelect}/></section><section className="panel"><RoomBoard rooms={rooms} visits={visits} updateRoom={updateRoom}/></section></div> }
function ProviderView({visits,providerFilter,moveVisit,onSelect}){ const ready = visits.filter(v=>['Roomed','MA/nurse done','Provider in room'].includes(v.stage)); return <section className="panel"><div className="sectionTitle"><Stethoscope size={18}/><h2>Provider-ready rooms</h2></div><p className="helper">Shows roomed patients ready for provider attention. Use provider filter to narrow to one doctor.</p><VisitList visits={ready} moveVisit={moveVisit} onSelect={onSelect}/></section> }
function ManagerView({data,metrics,alerts,risks,charts,exportReport}){ return <section className="reportPage"><div className="reportCards"><Metric label="Active visits" value={metrics.activeVisits} tone="blue"/><Metric label="Completed" value={metrics.completedToday} tone="green"/><Metric label="Delayed" value={metrics.delayedVisits} tone="rose"/><Metric label="Longest wait" value={`${metrics.longestWait} min`} tone="orange"/></div><section className="panel"><div className="sectionTitle"><Zap size={18}/><h2>Manager interpretation</h2></div><p className="managerText">{managerInterpretation(metrics,alerts,charts.reasonData,risks)}</p></section><section className="panel"><div className="sectionTitle"><Bell size={18}/><h2>Active bottlenecks</h2></div><AlertList alerts={alerts}/><ScheduleRiskList risks={risks}/></section><DashboardCharts charts={charts}/><button className="primary" onClick={exportReport}><Download size={16}/> Export end-of-day report</button></section> }

function NextActionsPanel({actions,moveVisit,moveToRoom,tagDelay}){ return <section className="panel nextActions"><div className="sectionTitle"><Zap size={18}/><h2>Do next</h2><span>{actions.length} active</span></div>{actions.length? <div className="priorityList">{actions.slice(0,6).map(a=><ActionCard key={a.id} action={a} moveVisit={moveVisit} moveToRoom={moveToRoom} tagDelay={tagDelay}/>)}</div>:<div className="allClear"><CheckCircle2 size={32}/><b>Flow is stable</b><p>No urgent action from current timers.</p></div>}</section> }
function ActionCard({action,moveVisit,moveToRoom,tagDelay}){ return <div className={`actionCard ${action.level}`}><div><b>{action.title}</b><p>{action.message}</p><small>{action.why}</small></div><div className="actionBtns">{action.visitId && action.nextStage && <button onClick={()=>moveVisit(action.visitId,action.nextStage)}>Move to {action.nextStage}</button>}{action.visitId && action.reason && <button onClick={()=>tagDelay(action.visitId,action.reason)}>Tag reason</button>}</div></div> }

function FlowBoard({visits, moveVisit, tagDelay, onSelect}){ const stages=['Scheduled','Checked in','Waiting room','Roomed','MA/nurse done','Provider in room','Provider done','Imaging/procedure','Checkout']; return <div className="board compactBoard">{stages.map(stage=><section key={stage} className="stageCol"><div className="stageHead"><b>{stage}</b><span>{visits.filter(v=>v.stage===stage).length}</span></div><div className="stageList">{visits.filter(v=>v.stage===stage).map(v=><VisitCard key={v.id} visit={v} moveVisit={moveVisit} tagDelay={tagDelay} onSelect={onSelect}/>)}{visits.filter(v=>v.stage===stage).length===0 && <div className="emptySlot">No patients</div>}</div></section>)}</div> }
function VisitList({visits,moveVisit,moveToRoom,tagDelay,onSelect}){ if(!visits.length) return <div className="allClear"><CheckCircle2 size={30}/><b>No active patients for this view</b></div>; return <div className="visitList">{visits.map(v=><VisitCard key={v.id} visit={v} moveVisit={moveVisit} moveToRoom={moveToRoom} tagDelay={tagDelay} onSelect={onSelect}/>)}</div> }
function VisitCard({visit,moveVisit,moveToRoom,tagDelay,onSelect}){
  const elapsed=minsBetween(visit.stageStartedAt); const threshold=WAIT_RULES[visit.stage] || 15; const danger=elapsed>=threshold+10; const warn=elapsed>=threshold; const next=nextStage(visit.stage);
  return <div className={`visitCard ${danger?'danger':warn?'warn':''}`}><div className="cardTop"><div><b>{visit.initials}</b><small>{visit.provider}</small></div><span className="timer"><Clock size={13}/>{elapsed} min</span></div><div className="visitMeta"><span>{visit.visitType}</span><span>{visit.stage}</span>{visit.room&&<span>{visit.room}</span>}<span>{fmtTime(visit.appointmentTime)}</span></div>{warn && <DelayPrompt visit={visit} tagDelay={tagDelay}/>}<div className="cardActions">{next&&<button onClick={()=>moveVisit(visit.id,next)}>One tap: {next}</button>}<button onClick={()=>onSelect(visit)}><Eye size={13}/> Details</button>{visit.stage==='Waiting room'&&<RoomQuickAssign visit={visit} moveToRoom={moveToRoom}/>}</div></div>
}
function DelayPrompt({visit,tagDelay}){ const suggested = suggestedDelayReason(visit); return <div className="delayPrompt"><AlertTriangle size={14}/><span>Delayed — tag if known:</span><button onClick={()=>tagDelay(visit.id,suggested)}>{suggested}</button><button onClick={()=>tagDelay(visit.id,'Other')}>Other</button></div> }
function RoomQuickAssign({visit,moveToRoom}){ return <select onChange={e=>e.target.value && moveToRoom(visit.id,e.target.value)} defaultValue=""><option value="">Assign room</option>{Array.from({length:10},(_,i)=><option key={i}>Room {i+1}</option>)}</select> }

function RoomTiles({rooms,visits}){ return <div className="roomTiles">{rooms.map(r=>{const v=visits.find(x=>x.id===r.patientId || x.room===r.id && x.stage!=='Completed'); return <div key={r.id} className={`roomTile ${slug(r.status)}`}><b>{r.id}</b><span>{r.status}</span>{v && <small>{v.initials} · {v.provider.replace('Dr. ','')}</small>}</div>})}</div> }
function RoomBoard({rooms,visits,updateRoom}){ return <div><div className="sectionTitle"><BedDouble size={18}/><h2>Room board</h2></div><div className="roomGrid">{rooms.map(r=>{const v=visits.find(x=>x.id===r.patientId || (x.room===r.id && x.stage!=='Completed'));return <div key={r.id} className={`roomCard ${slug(r.status)}`}><div className="roomTop"><b>{r.id}</b><span>{r.status}</span></div>{v ? <div className="roomPatient"><UserRound size={18}/><div><b>{v.initials}</b><small>{v.provider} · {v.stage}</small></div></div> : <p className="helper">No active patient assigned.</p>}<select value={r.status} onChange={e=>updateRoom(r.id,e.target.value)}>{ROOM_STATUSES.map(s=><option key={s}>{s}</option>)}</select></div>})}</div></div> }

function AlertList({alerts}){ if(!alerts.length) return <div className="allClear small"><CheckCircle2 size={28}/><b>No major bottlenecks</b></div>; return <div className="alertsList">{alerts.map((a,i)=><div key={i} className={`alertCard ${a.level}`}><AlertTriangle size={22}/><div><b>{a.title}</b><p>{a.message}</p><small>{a.action}</small></div></div>)}</div> }
function ScheduleRiskList({risks}){ if(!risks.length) return null; return <div className="riskList"><div className="sectionTitle"><CalendarDays size={17}/><h3>Schedule risks</h3></div>{risks.slice(0,5).map((r,i)=><div className="riskItem" key={i}><b>{r.title}</b><p>{r.message}</p></div>)}</div> }
function DashboardCharts({charts}){ return <section className="dashboardCharts"><div className="miniChart cardBlue"><div className="sectionTitle"><Activity size={17}/><h3>Patients by stage</h3></div>{charts.stageData.length?<ResponsiveContainer width="100%" height={220}><BarChart data={charts.stageData}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="name" tick={{fontSize:11}}/><YAxis allowDecimals={false}/><Tooltip/><Bar dataKey="count" fill="#2563eb" radius={[8,8,0,0]}/></BarChart></ResponsiveContainer>:<p>No active visits.</p>}</div><div className="miniChart cardGreen"><div className="sectionTitle"><Stethoscope size={17}/><h3>Provider load</h3></div>{charts.providerLoad.length?<ResponsiveContainer width="100%" height={220}><BarChart data={charts.providerLoad}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="short"/><YAxis allowDecimals={false}/><Tooltip/><Bar dataKey="count" fill="#0f766e" radius={[8,8,0,0]}/></BarChart></ResponsiveContainer>:<p>No provider load yet.</p>}</div><div className="miniChart cardOrange"><div className="sectionTitle"><AlertTriangle size={17}/><h3>Delay reasons</h3></div>{charts.reasonData.length?<ResponsiveContainer width="100%" height={220}><BarChart data={charts.reasonData}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="name" tick={{fontSize:10}} angle={-22} textAnchor="end" height={78}/><YAxis allowDecimals={false}/><Tooltip/><Bar dataKey="count" fill="#e11d48" radius={[8,8,0,0]}/></BarChart></ResponsiveContainer>:<p>No reasons tagged yet.</p>}</div></section> }

function VisitDrawer({visit,close,moveVisit,tagDelay,updateVisit}){ const [note,setNote]=useState(visit.note||''); const next=nextStage(visit.stage); return <aside className="drawer"><div className="drawerPanel"><button className="close" onClick={close}><X size={18}/></button><div className="eyebrow"><ClipboardList size={14}/> Visit details</div><h2>{visit.initials} · {visit.provider}</h2><div className="detailGrid"><span>Visit type<b>{visit.visitType}</b></span><span>Current stage<b>{visit.stage}</b></span><span>Room<b>{visit.room||'Not roomed'}</b></span><span>Stage timer<b>{minsBetween(visit.stageStartedAt)} min</b></span></div><div className="sectionTitle"><AlertTriangle size={17}/><h3>Delay reason, only if delayed</h3></div><div className="reasonGrid">{DELAY_REASONS.map(r=><button key={r} className={(visit.delayReasons||[]).includes(r)?'selected':''} onClick={()=>tagDelay(visit.id,r)}>{r}</button>)}</div><label className="noteBox"><span>Operational note</span><textarea value={note} onChange={e=>setNote(e.target.value)} onBlur={()=>updateVisit(visit.id,{note})} placeholder="Operational note only. No diagnosis, MRN, DOB, or clinical details."/></label><div className="drawerActions">{next&&<button className="primary" onClick={()=>{moveVisit(visit.id,next);close();}}>Move to {next}</button>}<button className="soft" onClick={close}>Done</button></div></div></aside> }
function AddVisitModal({close,add,rooms}){ const [form,setForm]=useState({initials:'',provider:PROVIDERS[0],visitType:VISIT_TYPES[0],time:'',stage:'Checked in',room:''}); function submit(e){e.preventDefault(); const clean=form.initials.trim(); if(!clean) return; const stamp=now(); const appt=appointmentTimestamp(form.time)||stamp; add({id:`visit-${stamp}`,initials:clean,provider:form.provider,visitType:form.visitType,appointmentTime:appt,arrivalTime:form.stage==='Scheduled'?null:stamp,stage:form.stage,room:form.room||null,stageStartedAt:stamp,timestamps:{Scheduled:appt,[form.stage]:stamp},delayReasons:[],note:'',completedAt:null});} return <aside className="drawer"><form className="drawerPanel compactModal" onSubmit={submit}><button className="close" type="button" onClick={close}><X size={18}/></button><h2>Add live visit</h2><label>Initials or ticket number<input required value={form.initials} onChange={e=>setForm({...form,initials:e.target.value})} placeholder="J.S. or Ticket 24"/></label><label>Appointment time<input value={form.time} onChange={e=>setForm({...form,time:e.target.value})} placeholder="9:30 AM"/></label><label>Provider<select value={form.provider} onChange={e=>setForm({...form,provider:e.target.value})}>{PROVIDERS.map(p=><option key={p}>{p}</option>)}</select></label><label>Visit type<select value={form.visitType} onChange={e=>setForm({...form,visitType:e.target.value})}>{VISIT_TYPES.map(v=><option key={v}>{v}</option>)}</select></label><label>Starting stage<select value={form.stage} onChange={e=>setForm({...form,stage:e.target.value})}>{ACTIVE_STAGES.map(s=><option key={s}>{s}</option>)}</select></label><label>Room optional<select value={form.room} onChange={e=>setForm({...form,room:e.target.value})}><option value="">No room assigned</option>{rooms.map(r=><option key={r.id}>{r.id}</option>)}</select></label><button className="primary" type="submit">Add to live board</button></form></aside> }
function CSVImportModal({close,importVisits}){ const [preview,setPreview]=useState([]); const [error,setError]=useState(''); function readFile(file){ if(!file) return; const reader=new FileReader(); reader.onload=()=>{ try{ const rows=parseCSV(String(reader.result||'')); const visits=rowsToVisits(rows); setPreview(visits); setError(''); }catch(e){ setError(e.message||'Could not read CSV'); } }; reader.readAsText(file); }
  return <aside className="drawer"><div className="drawerPanel"><button className="close" onClick={close}><X size={18}/></button><div className="eyebrow"><Upload size={14}/> Phase 1: schedule import</div><h2>Import today’s schedule CSV</h2><p className="helper">Expected columns: initials/ticket, provider, appointment time, visit type. This avoids manually adding every patient.</p><label className="uploadDrop"><Upload size={22}/><b>Choose CSV file</b><small>Export from EHR/schedule, remove PHI, then upload.</small><input type="file" accept=".csv,text/csv" onChange={e=>readFile(e.target.files?.[0])}/></label>{error&&<div className="errorLine">{error}</div>}{preview.length>0&&<div><div className="sectionTitle"><CheckCircle2 size={17}/><h3>{preview.length} visits ready</h3></div><div className="previewTable">{preview.slice(0,8).map(v=><div key={v.id}><b>{v.initials}</b><span>{fmtTime(v.appointmentTime)} · {v.provider} · {v.visitType}</span></div>)}</div><button className="primary" onClick={()=>importVisits(preview)}>Add {preview.length} visits to live board</button></div>}</div></aside> }

function LiveSetupScreen(){ return <main className="setupScreen"><section className="setupCard"><div className="setupIcon"><Wifi size={28}/></div><h1>Live Firebase setup required.</h1><p>This build is live-only. Add Firebase/Vercel environment variables before using the board.</p><div className="setupList"><span>VITE_FIREBASE_API_KEY</span><span>VITE_FIREBASE_AUTH_DOMAIN</span><span>VITE_FIREBASE_PROJECT_ID</span><span>VITE_FIREBASE_APP_ID</span></div></section></main> }
function EmptyLiveBoard({status,createLiveBoard}){ return <main className="setupScreen"><section className="setupCard emptyBoard"><div className="setupIcon"><Database size={28}/></div><h1>Create today’s live board.</h1><p>Firebase is configured, but no board exists yet. Create an empty board, then import the schedule or add visits.</p><button className="primary" onClick={createLiveBoard}>{status==='connecting'?<RefreshCw size={18}/>:<Plus size={18}/>} Create today’s live board</button></section></main> }

function parseCSV(text){ const lines=text.split(/\r?\n/).filter(Boolean); if(lines.length<2) throw new Error('CSV needs a header row and at least one visit.'); const headers=splitCSVLine(lines[0]).map(h=>h.trim().toLowerCase()); return lines.slice(1).map(line=>{ const cells=splitCSVLine(line); const obj={}; headers.forEach((h,i)=>obj[h]=cells[i]?.trim()||''); return obj; }); }
function splitCSVLine(line){ const out=[]; let cur='', q=false; for(let i=0;i<line.length;i++){ const ch=line[i]; if(ch==='"'){ q=!q; continue;} if(ch===',' && !q){ out.push(cur); cur=''; } else cur+=ch; } out.push(cur); return out; }
function getAny(row,names){ for(const n of names){ const k=Object.keys(row).find(x=>x.includes(n)); if(k && row[k]) return row[k]; } return ''; }
function rowsToVisits(rows){ const stamp=now(); return rows.map((row,i)=>{ const providerRaw=getAny(row,['provider','doctor','physician','doc']) || PROVIDERS[0]; const provider=PROVIDERS.find(p=>providerRaw.toLowerCase().includes(p.replace('Dr. ','').split(' ').slice(-1)[0].toLowerCase())) || providerRaw; const initials=getAny(row,['initial','ticket','patient','visit']) || `Visit ${i+1}`; const time=getAny(row,['time','appt','appointment']); const type=getAny(row,['type','visit']) || 'Follow-up'; const appt=appointmentTimestamp(time); return {id:`csv-${stamp}-${i}`, initials, provider, visitType: normalizeVisitType(type), appointmentTime: appt, arrivalTime:null, stage:'Scheduled', room:null, stageStartedAt: stamp, timestamps:{Scheduled:appt}, delayReasons:[], note:'', completedAt:null}; }); }
function normalizeVisitType(t){ const m=VISIT_TYPES.find(v=>String(t).toLowerCase().includes(v.toLowerCase().split(' ')[0])); return m || String(t||'Follow-up'); }
function nextStage(stage){ const i=STAGES.indexOf(stage); return i>=0 && i<STAGES.length-1?STAGES[i+1]:null; }
function shortStage(s){ return s.replace('Provider ','Prov. ').replace('Imaging/procedure','Imaging').replace('MA/nurse done','MA done').replace('Waiting room','Waiting'); }
function avg(nums){ const a=nums.filter(n=>Number.isFinite(n)); return a.length?Math.round(a.reduce((x,y)=>x+y,0)/a.length):0; }
function slug(s){ return String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,'-'); }
function suggestedDelayReason(v){ if(['Roomed','MA/nurse done'].includes(v.stage)) return 'Provider running behind'; if(['Checked in','Waiting room'].includes(v.stage)) return 'Waiting for room'; if(v.stage==='Imaging/procedure') return 'Waiting for imaging/X-ray'; if(v.stage==='Checkout') return 'Checkout delay'; return 'Complex visit'; }
function computeMetrics(data){ const visits=data.visits||[]; const active=visits.filter(v=>v.stage!=='Completed'); const delayed=active.filter(v=>minsBetween(v.stageStartedAt)>=(WAIT_RULES[v.stage]||15)); const completed=visits.filter(v=>v.stage==='Completed'); return { activeVisits:active.length, delayedVisits:delayed.length, completedToday:completed.length, avgCycle:avg(completed.map(v=>minsBetween(v.arrivalTime||v.appointmentTime,v.completedAt))), longestWait:active.length?Math.max(...active.map(v=>minsBetween(v.stageStartedAt))):0, waitingRoom:active.filter(v=>['Checked in','Waiting room'].includes(v.stage)).length, roomedWaiting:active.filter(v=>['Roomed','MA/nurse done'].includes(v.stage)).length, checkoutQueue:active.filter(v=>v.stage==='Checkout').length }; }
function computeAlerts(data){ const visits=(data.visits||[]).filter(v=>v.stage!=='Completed'); const rooms=data.rooms||[]; const alerts=[]; const groups=visits.reduce((acc,v)=>{acc[v.provider]=[...(acc[v.provider]||[]),v];return acc;},{}); Object.entries(groups).forEach(([provider,items])=>{ const roomed=items.filter(v=>['Roomed','MA/nurse done'].includes(v.stage)&&minsBetween(v.stageStartedAt)>=10); if(roomed.length>=2) alerts.push({level:'high',title:`${provider} provider bottleneck`,message:`${roomed.length} patients are roomed/ready. Longest wait ${Math.max(...roomed.map(v=>minsBetween(v.stageStartedAt)))} min.`,action:`Notify next ${provider} patients if delay reaches 20 minutes.`}); }); const waiting=visits.filter(v=>['Checked in','Waiting room'].includes(v.stage)&&minsBetween(v.stageStartedAt)>=15); const readyRooms=rooms.filter(r=>r.status==='Ready').length; if(waiting.length>=3 || (waiting.length>=2 && readyRooms===0)) alerts.push({level:'medium',title:'Rooming bottleneck',message:`${waiting.length} checked-in patients waiting; ${readyRooms} room(s) ready.`,action:'Prioritize turnover and room the next short follow-up if appropriate.'}); const imaging=visits.filter(v=>v.stage==='Imaging/procedure'&&minsBetween(v.stageStartedAt)>=20); if(imaging.length>=2) alerts.push({level:'medium',title:'Imaging/procedure bottleneck',message:`${imaging.length} patients waiting in imaging/procedure flow.`,action:'Confirm imaging queue and whether provider is waiting on results.'}); const checkout=visits.filter(v=>v.stage==='Checkout'&&minsBetween(v.stageStartedAt)>=10); if(checkout.length>=2) alerts.push({level:'low',title:'Checkout delay',message:`${checkout.length} patients waiting at checkout.`,action:'Move one staff member to checkout for 10–15 minutes if possible.'}); const turnover=rooms.filter(r=>r.status==='Needs turnover'&&minsBetween(r.updatedAt)>=8); if(turnover.length) alerts.push({level:'medium',title:'Room turnover delay',message:`${turnover.length} room(s) need turnover.`,action:'Turn over room(s) now to prevent the waiting-room queue from growing.'}); return alerts; }
function computeNextActions(data,metrics,alerts){ const visits=(data.visits||[]).filter(v=>v.stage!=='Completed'); const rooms=data.rooms||[]; const readyRoom=rooms.find(r=>r.status==='Ready'); const actions=[]; visits.forEach(v=>{ const elapsed=minsBetween(v.stageStartedAt); const th=WAIT_RULES[v.stage]||15; if(['Checked in','Waiting room'].includes(v.stage)&&readyRoom) actions.push({id:`room-${v.id}`,type:'arrival',level:elapsed>=th?'high':'medium',visitId:v.id,title:`Room ${v.initials}`,message:`${v.provider} · waiting ${elapsed} min. ${readyRoom.id} is ready.`,why:'Reduces front-desk waiting and keeps provider schedule moving.',nextStage:'Roomed'}); if(['Roomed','MA/nurse done'].includes(v.stage)&&elapsed>=th) actions.push({id:`prov-${v.id}`,type:'notify',level:'high',visitId:v.id,title:`Provider attention: ${v.initials}`,message:`Roomed/ready for ${elapsed} min for ${v.provider}.`,why:'Provider-room delay is the current risk.',reason:'Provider running behind'}); if(v.stage==='Checkout'&&elapsed>=th) actions.push({id:`checkout-${v.id}`,type:'checkout',level:'medium',visitId:v.id,title:`Checkout ${v.initials}`,message:`Waiting ${elapsed} min at checkout.`,why:'Checkout delays back up rooms and patient experience.',nextStage:'Completed'}); if(v.stage==='Scheduled' && v.appointmentTime < now()-10*60000) actions.push({id:`late-${v.id}`,type:'late',level:'medium',visitId:v.id,title:`Check arrival: ${v.initials}`,message:`Appointment time was ${fmtTime(v.appointmentTime)}.`,why:'Late arrivals can shift rooming order.',reason:'Patient arrived late'}); }); alerts.forEach((a,i)=>actions.push({id:`alert-${i}`,type:'alert',level:a.level,title:a.title,message:a.action,why:a.message})); const levelOrder={high:0,medium:1,low:2}; return actions.sort((a,b)=>(levelOrder[a.level]??9)-(levelOrder[b.level]??9)).slice(0,10); }
function computeScheduleRisks(data){ const scheduled=(data.visits||[]).filter(v=>v.stage==='Scheduled').sort((a,b)=>a.appointmentTime-b.appointmentTime); const risks=[]; const byProv=scheduled.reduce((acc,v)=>{acc[v.provider]=[...(acc[v.provider]||[]),v];return acc;},{}); Object.entries(byProv).forEach(([provider,items])=>{ for(let i=1;i<items.length;i++){ const gap=minsBetween(items[i-1].appointmentTime, items[i].appointmentTime); if(gap<=15 && /new|procedure|injection/i.test(`${items[i-1].visitType} ${items[i].visitType}`)) risks.push({title:`Schedule risk: ${provider}`,message:`${items[i-1].initials} and ${items[i].initials} are ${gap} min apart with higher-time visit type. Consider watching room/provider delay.`}); } }); return risks.slice(0,8); }
function reasonCounts(visits){ const counts={}; visits.forEach(v=>(v.delayReasons||[]).forEach(r=>counts[r]=(counts[r]||0)+1)); return Object.entries(counts).map(([name,count])=>({name,count})).sort((a,b)=>b.count-a.count).slice(0,8); }
function buildChartData(data){ const visits=data.visits||[]; const active=visits.filter(v=>v.stage!=='Completed'); const stageData=STAGES.map(s=>({name:shortStage(s),count:active.filter(v=>v.stage===s).length})).filter(x=>x.count>0); const providerLoad=PROVIDERS.map(provider=>({provider,short:provider.replace('Dr. ','').split(' ').slice(-1)[0],count:active.filter(v=>v.provider===provider).length})).filter(x=>x.count>0); const reasonData=reasonCounts(visits); return {stageData,providerLoad,reasonData}; }
function managerInterpretation(metrics,alerts,reasonData,risks){ if(alerts.length) return `${alerts[0].title}: ${alerts[0].action}`; if(risks.length) return `${risks[0].title}: ${risks[0].message}`; if(reasonData.length) return `Most tagged delay reason today is ${reasonData[0].name}. Review whether this is provider, room capacity, or staffing related.`; if(metrics.activeVisits===0) return 'Import the schedule or add visits as patients arrive to start tracking live flow.'; return 'Flow is stable. Keep using one-tap stage changes and tag reasons only when cards turn red.'; }
function buildTextReport(data,metrics,alerts,risks){ const reasons=reasonCounts(data.visits||[]).map(r=>`- ${r.name}: ${r.count}`).join('\n')||'- None tagged'; return `ClinicFlowIQ SmartOps Report\nDate: ${new Date().toLocaleString()}\n\nSummary\n- Active visits: ${metrics.activeVisits}\n- Completed visits: ${metrics.completedToday}\n- Delayed visits: ${metrics.delayedVisits}\n- Average completed visit time: ${metrics.avgCycle} min\n- Longest current wait: ${metrics.longestWait} min\n\nActive Bottlenecks\n${alerts.map(a=>`- ${a.title}: ${a.message} Action: ${a.action}`).join('\n')||'- No major bottlenecks'}\n\nSchedule Risks\n${risks.map(r=>`- ${r.title}: ${r.message}`).join('\n')||'- No schedule risks detected'}\n\nDelay Reasons\n${reasons}\n` }

createRoot(document.getElementById('root')).render(<App />);
