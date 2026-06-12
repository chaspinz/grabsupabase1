import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell
} from "recharts";
import * as XLSX from "xlsx";
import { supabase } from "./supabase.js";

// ─── Helpers ──────────────────────────────────────────────────────
const fmt = (n) => new Intl.NumberFormat("id-ID", { style:"currency", currency:"IDR", maximumFractionDigits:0 }).format(n||0);
const fmtShort = (n) => {
  n = parseFloat(n)||0;
  if(n>=1e9) return `Rp${(n/1e9).toFixed(1)}M`;
  if(n>=1e6) return `Rp${(n/1e6).toFixed(1)}Jt`;
  if(n>=1e3) return `Rp${(n/1e3).toFixed(0)}rb`;
  return `Rp${n}`;
};
const todayStr = () => new Date().toISOString().split("T")[0];
const DAYS_ID = ["Minggu","Senin","Selasa","Rabu","Kamis","Jumat","Sabtu"];
const MONTHS_ID = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];
const KAT_COLOR = { Operasional:"#f59e0b", Maintenance:"#ef4444", Cicilan:"#8b5cf6" };
const fmtInput = (v) => { const n=String(v).replace(/\D/g,""); return n?new Intl.NumberFormat("id-ID").format(n):""; };

// ─── Sample data untuk preview saat belum ada data ────────────────
const SAMPLE_PI = [
  {id:"s1",tanggal:"2025-05-03",uraian:"GrabCar pagi Sabtu",jumlah:185000},
  {id:"s2",tanggal:"2025-05-10",uraian:"GrabFood Sabtu siang",jumlah:210000},
  {id:"s3",tanggal:"2025-05-17",uraian:"GrabCar Sabtu penuh",jumlah:320000},
  {id:"s4",tanggal:"2025-06-07",uraian:"GrabCar Sabtu",jumlah:290000},
  {id:"s5",tanggal:"2025-06-14",uraian:"GrabFood Sabtu",jumlah:200000},
  {id:"s6",tanggal:"2025-06-21",uraian:"GrabCar Sabtu malam",jumlah:270000},
];
const SAMPLE_PO = [
  {id:"t1",tanggal:"2025-05-05",kategori:"Operasional",uraian:"BBM Pertamax",jumlah:80000},
  {id:"t2",tanggal:"2025-05-15",kategori:"Maintenance",uraian:"Servis rutin",jumlah:150000},
  {id:"t3",tanggal:"2025-05-31",kategori:"Cicilan",uraian:"Cicilan motor Mei",jumlah:500000},
  {id:"t4",tanggal:"2025-06-10",kategori:"Operasional",uraian:"BBM Shell",jumlah:90000},
  {id:"t5",tanggal:"2025-06-30",kategori:"Cicilan",uraian:"Cicilan motor Juni",jumlah:500000},
];

// ═══════════════════════════════════════════════════════════════════
export default function App() {
  const [tab, setTab] = useState("dashboard");
  const [pi, setPi] = useState([]);
  const [po, setPo] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [filterPeriod, setFilterPeriod] = useState("bulan");
  const [filterDate, setFilterDate] = useState(todayStr().slice(0,7));
  const [fI, setFI] = useState({tanggal:todayStr(),uraian:"",jumlah:""});
  const [fE, setFE] = useState({tanggal:todayStr(),kategori:"Operasional",uraian:"",jumlah:""});
  const [online, setOnline] = useState(navigator.onLine);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [isSample, setIsSample] = useState(false);
  const toastRef = useRef(null);
  const savingRef = useRef(false); // ref untuk mencegah double submit

  // PWA install
  useEffect(() => {
    const h = (e) => { e.preventDefault(); setInstallPrompt(e); };
    window.addEventListener("beforeinstallprompt", h);
    return () => window.removeEventListener("beforeinstallprompt", h);
  }, []);

  // Online/offline
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online",on); window.removeEventListener("offline",off); };
  }, []);

  const showToast = useCallback((msg, type="success") => {
    setToast({msg,type});
    clearTimeout(toastRef.current);
    toastRef.current = setTimeout(()=>setToast(null), 3000);
  },[]);

  // ─ Load data dari Supabase ─────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: piData, error: e1 }, { data: poData, error: e2 }] = await Promise.all([
        supabase.from('pemasukan').select('*').order('tanggal', { ascending: false }),
        supabase.from('pengeluaran').select('*').order('tanggal', { ascending: false })
      ]);
      if(e1||e2) throw new Error(e1?.message || e2?.message);
      if(piData.length===0 && poData.length===0) {
        setPi(SAMPLE_PI); setPo(SAMPLE_PO); setIsSample(true);
      } else {
        setPi(piData||[]); setPo(poData||[]); setIsSample(false);
      }
    } catch(err) {
      setPi(SAMPLE_PI); setPo(SAMPLE_PO); setIsSample(true);
      showToast("⚠️ Cek koneksi Supabase","warn");
    }
    setLoading(false);
  },[showToast]);

  useEffect(() => { loadData(); }, [loadData]);

  // ─ Real-time subscription ──────────────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel('grabfinance-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pemasukan' }, () => loadData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pengeluaran' }, () => loadData())
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [loadData]);

  // ─ Submit Pemasukan ────────────────────────────────────────────
  const submitIncome = async () => {
    if(!fI.uraian.trim()||!fI.jumlah) return showToast("Lengkapi semua field ⚠️","warn");
    if(savingRef.current) return; // anti double submit
    savingRef.current = true;
    setSaving(true);
    const payload = {
      tanggal: fI.tanggal,
      uraian: fI.uraian.trim(),
      jumlah: parseFloat(String(fI.jumlah).replace(/\D/g,""))
    };
    try {
      const { error } = await supabase.from('pemasukan').insert([payload]);
      if(error) throw error;
      setFI({tanggal:todayStr(),uraian:"",jumlah:""});
      showToast("✅ Pemasukan disimpan!");
      await loadData();
    } catch(err) {
      showToast("❌ Gagal menyimpan: "+err.message,"error");
    }
    setSaving(false);
    savingRef.current = false;
  };

  // ─ Submit Pengeluaran ──────────────────────────────────────────
  const submitExpense = async () => {
    if(!fE.uraian.trim()||!fE.jumlah) return showToast("Lengkapi semua field ⚠️","warn");
    if(savingRef.current) return; // anti double submit
    savingRef.current = true;
    setSaving(true);
    const payload = {
      tanggal: fE.tanggal,
      kategori: fE.kategori,
      uraian: fE.uraian.trim(),
      jumlah: parseFloat(String(fE.jumlah).replace(/\D/g,""))
    };
    try {
      const { error } = await supabase.from('pengeluaran').insert([payload]);
      if(error) throw error;
      setFE({tanggal:todayStr(),kategori:"Operasional",uraian:"",jumlah:""});
      showToast("✅ Pengeluaran disimpan!");
      await loadData();
    } catch(err) {
      showToast("❌ Gagal menyimpan: "+err.message,"error");
    }
    setSaving(false);
    savingRef.current = false;
  };

  // ─ Hapus ──────────────────────────────────────────────────────
  const delI = async (id) => {
    if(!confirm("Hapus data ini?")) return;
    setPi(prev=>prev.filter(x=>x.id!==id));
    const { error } = await supabase.from('pemasukan').delete().eq('id', id);
    if(error) { showToast("❌ Gagal hapus","error"); await loadData(); }
    else showToast("🗑️ Data dihapus");
  };
  const delE = async (id) => {
    if(!confirm("Hapus data ini?")) return;
    setPo(prev=>prev.filter(x=>x.id!==id));
    const { error } = await supabase.from('pengeluaran').delete().eq('id', id);
    if(error) { showToast("❌ Gagal hapus","error"); await loadData(); }
    else showToast("🗑️ Data dihapus");
  };

  // ─ Install PWA ────────────────────────────────────────────────
  const installPWA = async () => {
    if(!installPrompt) return;
    installPrompt.prompt();
    const {outcome} = await installPrompt.userChoice;
    if(outcome==="accepted") { setInstallPrompt(null); showToast("✅ Aplikasi berhasil diinstall!"); }
  };

  // ─ Computed stats ─────────────────────────────────────────────
  const stats = useMemo(()=>{
    const now = new Date();
    const thisM = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
    const tI = pi.reduce((s,x)=>s+(parseFloat(x.jumlah)||0),0);
    const tO = po.reduce((s,x)=>s+(parseFloat(x.jumlah)||0),0);
    const mI = pi.filter(x=>String(x.tanggal).slice(0,7)===thisM).reduce((s,x)=>s+(parseFloat(x.jumlah)||0),0);
    const mO = po.filter(x=>String(x.tanggal).slice(0,7)===thisM).reduce((s,x)=>s+(parseFloat(x.jumlah)||0),0);
    return {tI,tO,net:tI-tO,mI,mO};
  },[pi,po]);

  const chartMonthly = useMemo(()=>{
    const map={};
    pi.forEach(x=>{ const m=String(x.tanggal).slice(0,7); if(!map[m])map[m]={month:m,pemasukan:0,pengeluaran:0}; map[m].pemasukan+=parseFloat(x.jumlah)||0; });
    po.forEach(x=>{ const m=String(x.tanggal).slice(0,7); if(!map[m])map[m]={month:m,pemasukan:0,pengeluaran:0}; map[m].pengeluaran+=parseFloat(x.jumlah)||0; });
    return Object.values(map).sort((a,b)=>a.month.localeCompare(b.month)).map(d=>({
      ...d, net:d.pemasukan-d.pengeluaran,
      label:`${MONTHS_ID[parseInt(d.month.split("-")[1])-1]} '${d.month.split("-")[0].slice(2)}`
    }));
  },[pi,po]);

  const expPie = useMemo(()=>{
    const m={};
    po.forEach(x=>{m[x.kategori]=(m[x.kategori]||0)+(parseFloat(x.jumlah)||0);});
    return Object.entries(m).map(([name,value])=>({name,value}));
  },[po]);

  const dayPred = useMemo(()=>{
    const m=Array(7).fill(0).map((_,i)=>({day:DAYS_ID[i],total:0,count:0}));
    pi.forEach(x=>{ const d=new Date(x.tanggal); if(isNaN(d))return; m[d.getDay()].total+=parseFloat(x.jumlah)||0; m[d.getDay()].count+=1; });
    return m.map(d=>({...d,avg:d.count?Math.round(d.total/d.count):0})).sort((a,b)=>b.avg-a.avg);
  },[pi]);

  const filtered = useMemo(()=>{
    let pI=pi, pO=po;
    if(filterPeriod==="bulan"){ pI=pi.filter(x=>String(x.tanggal).slice(0,7)===filterDate); pO=po.filter(x=>String(x.tanggal).slice(0,7)===filterDate); }
    else if(filterPeriod==="tahun"){ const y=filterDate.slice(0,4); pI=pi.filter(x=>String(x.tanggal).startsWith(y)); pO=po.filter(x=>String(x.tanggal).startsWith(y)); }
    const iT=pI.reduce((s,x)=>s+(parseFloat(x.jumlah)||0),0);
    const oT=pO.reduce((s,x)=>s+(parseFloat(x.jumlah)||0),0);
    return {pI,pO,iT,oT,net:iT-oT};
  },[pi,po,filterPeriod,filterDate]);

  // ─ Export Excel ───────────────────────────────────────────────
  const exportExcel = () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(pi.map(x=>({Tanggal:x.tanggal,Uraian:x.uraian,Pemasukan:x.jumlah}))), "Pemasukan");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(po.map(x=>({Tanggal:x.tanggal,Kategori:x.kategori,Uraian:x.uraian,Pengeluaran:x.jumlah}))), "Pengeluaran");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(chartMonthly.map(m=>({Bulan:m.label,Pemasukan:m.pemasukan,Pengeluaran:m.pengeluaran,NetProfit:m.net}))), "Ringkasan");
    XLSX.writeFile(wb, `KeuanganGrab_${todayStr()}.xlsx`);
    showToast("📊 File Excel berhasil diunduh!");
  };

  const NAV = [
    {id:"dashboard",label:"Dashboard",em:"🏠"},
    {id:"pemasukan",label:"Pemasukan",em:"💰"},
    {id:"pengeluaran",label:"Pengeluaran",em:"💸"},
    {id:"laporan",label:"Laporan",em:"📋"},
    {id:"analitik",label:"Analitik",em:"📊"},
  ];

  const TT = {formatter:(v)=>fmt(v), contentStyle:{background:"#fff",border:"1px solid #e2e8f0",borderRadius:8,fontSize:11}};

  const StatCard = ({label,val,color,sub}) => (
    <div style={{background:"#fff",border:`1px solid ${color}25`,borderRadius:14,padding:"16px 18px",position:"relative",overflow:"hidden",boxShadow:"0 1px 4px rgba(0,0,0,.06)"}}>
      <div style={{fontSize:10,color:"#94a3b8",fontWeight:700,letterSpacing:1,textTransform:"uppercase",marginBottom:7}}>{label}</div>
      <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:19,fontWeight:800,color}}>{fmtShort(val)}</div>
      {sub&&<div style={{fontSize:10,color:"#94a3b8",marginTop:3}}>{sub}</div>}
      <div style={{position:"absolute",right:-8,top:-8,width:60,height:60,borderRadius:"50%",background:color,opacity:0.07}}/>
    </div>
  );

  return (
    <div style={{fontFamily:"'Sora','Nunito',sans-serif",background:"#f0f4f8",minHeight:"100vh",color:"#1e293b",display:"flex",flexDirection:"column"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;600&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:#f0f4f8}::-webkit-scrollbar-thumb{background:#cbd5e1;border-radius:2px}
        .inp{background:#fff;border:1px solid #e2e8f0;color:#1e293b;border-radius:10px;font-family:inherit;font-size:13px;padding:10px 13px;width:100%;transition:border .2s;box-shadow:0 1px 3px rgba(0,0,0,.04)}
        .inp:focus{outline:none;border-color:#0ea5e9;box-shadow:0 0 0 3px rgba(14,165,233,.1)}
        .btn{border:none;cursor:pointer;border-radius:10px;font-family:inherit;font-weight:700;transition:all .2s;font-size:13px}
        .btn:active{transform:scale(.97)}
        .btn:disabled{opacity:.6;cursor:not-allowed;transform:none}
        .nav{display:flex;align-items:center;gap:9px;padding:10px 13px;border-radius:10px;cursor:pointer;transition:all .2s;color:#64748b;font-weight:600;font-size:13px}
        .nav:hover{background:#e2e8f0;color:#475569}
        .nav.on{background:linear-gradient(135deg,rgba(14,165,233,.12),rgba(99,102,241,.08));color:#0284c7;border:1px solid rgba(14,165,233,.2)}
        .card{background:#fff;border:1px solid #e2e8f0;border-radius:16px;box-shadow:0 1px 4px rgba(0,0,0,.05)}
        .tr{border-bottom:1px solid #f1f5f9;transition:background .15s}
        .tr:hover{background:#f8fafc}
        .badge{display:inline-flex;align-items:center;padding:2px 9px;border-radius:999px;font-size:10px;font-weight:700}
        .toast{position:fixed;top:16px;right:16px;z-index:9999;padding:11px 18px;border-radius:12px;font-weight:600;font-size:12px;display:flex;align-items:center;gap:8px;box-shadow:0 8px 24px rgba(0,0,0,.12);animation:slIn .3s ease;max-width:300px}
        @keyframes slIn{from{transform:translateX(120px);opacity:0}to{transform:translateX(0);opacity:1}}
        .spin{animation:spin 1s linear infinite;display:inline-block}
        @keyframes spin{to{transform:rotate(360deg)}}
        .pulse{animation:pulse 1.5s ease-in-out infinite}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
        .botNav{display:none}
        @media(max-width:768px){
          .sidebar{display:none!important}
          .main{margin-left:0!important;padding:14px 12px 80px!important}
          .botNav{display:flex;position:fixed;bottom:0;left:0;right:0;background:#fff;border-top:1px solid #e2e8f0;z-index:100;padding:4px 0;box-shadow:0 -2px 10px rgba(0,0,0,.06)}
          .g4{grid-template-columns:repeat(2,1fr)!important}
          .g32{grid-template-columns:1fr!important}
          .g2{grid-template-columns:1fr!important}
          .g3{grid-template-columns:repeat(2,1fr)!important}
        }
        select option{background:#fff}
        input[type=date]::-webkit-calendar-picker-indicator{cursor:pointer;opacity:.6}
      `}</style>

      {/* Header */}
      <header style={{background:"#fff",borderBottom:"1px solid #e2e8f0",padding:"10px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:50,boxShadow:"0 1px 4px rgba(0,0,0,.05)"}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{background:"linear-gradient(135deg,#0ea5e9,#6366f1)",borderRadius:9,width:34,height:34,display:"flex",alignItems:"center",justifyContent:"center",fontSize:17}}>🚗</div>
          <div>
            <div style={{fontWeight:800,fontSize:15,color:"#0f172a"}}>GrabFinance</div>
            <div style={{fontSize:9,color:"#0ea5e9",letterSpacing:2,textTransform:"uppercase"}}>Manajer Keuangan</div>
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          {isSample&&<div style={{fontSize:10,color:"#f59e0b",fontWeight:700,background:"#fef3c7",padding:"3px 10px",borderRadius:6}}>⚠️ Data Contoh</div>}
          <div style={{display:"flex",alignItems:"center",gap:5,fontSize:11,color:online?"#16a34a":"#dc2626",fontWeight:600}}>
            <div style={{width:7,height:7,borderRadius:"50%",background:online?"#16a34a":"#dc2626"}}/>
            {online?"Online":"Offline"}
          </div>
          {saving&&<div style={{fontSize:11,color:"#0ea5e9",fontWeight:600}} className="pulse">⏳ Menyimpan...</div>}
          {installPrompt&&(
            <button className="btn" onClick={installPWA} style={{padding:"6px 12px",background:"linear-gradient(135deg,#0ea5e9,#6366f1)",color:"#fff",fontSize:11}}>
              📲 Install
            </button>
          )}
          <button className="btn" onClick={loadData} style={{padding:"6px 10px",background:"#f1f5f9",border:"1px solid #e2e8f0",color:"#64748b",fontSize:13}}>🔄</button>
        </div>
      </header>

      <div style={{display:"flex",flex:1}}>
        {/* Sidebar */}
        <aside className="sidebar" style={{width:200,background:"#fff",borderRight:"1px solid #e2e8f0",padding:"16px 10px",display:"flex",flexDirection:"column",position:"sticky",top:57,height:"calc(100vh - 57px)",overflowY:"auto"}}>
          <nav style={{flex:1,display:"flex",flexDirection:"column",gap:3}}>
            {NAV.map(n=>(
              <div key={n.id} className={`nav${tab===n.id?" on":""}`} onClick={()=>setTab(n.id)}>
                <span style={{fontSize:16}}>{n.em}</span>{n.label}
              </div>
            ))}
          </nav>
          <div style={{borderTop:"1px solid #e2e8f0",paddingTop:12,display:"flex",flexDirection:"column",gap:3}}>
            <div className="nav" style={{color:"#16a34a"}} onClick={exportExcel}>📥 Export Excel</div>
          </div>
          <div style={{marginTop:10,padding:"8px 10px",background:"#f0fdf4",borderRadius:8,fontSize:9,color:"#16a34a",textAlign:"center",fontWeight:600,border:"1px solid #bbf7d0"}}>
            ⚡ Supabase — Real-time
          </div>
        </aside>

        {/* Main */}
        <main className="main" style={{flex:1,padding:"20px 22px 40px",overflowY:"auto",maxWidth:"100%"}}>

          {/* Loading skeleton */}
          {loading&&(
            <div style={{display:"flex",flexDirection:"column",gap:14}}>
              {[1,2,3].map(i=>(
                <div key={i} style={{height:80,borderRadius:14,background:"linear-gradient(90deg,#f1f5f9 25%,#e2e8f0 50%,#f1f5f9 75%)",backgroundSize:"200%",animation:"slIn .8s ease infinite",opacity:.7}}/>
              ))}
            </div>
          )}

          {!loading&&<>

          {/* ══ DASHBOARD ══════════════════════════════════════════ */}
          {tab==="dashboard"&&(
            <div>
              <div style={{marginBottom:18}}>
                <h1 style={{fontSize:22,fontWeight:800,color:"#0f172a"}}>Dashboard 🏠</h1>
                <p style={{color:"#94a3b8",fontSize:12,marginTop:2}}>Ringkasan keuangan Grab real-time</p>
              </div>

              <div className="g4" style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:18}}>
                <StatCard label="Total Pemasukan" val={stats.tI} color="#16a34a" sub={`${pi.length} transaksi`}/>
                <StatCard label="Total Pengeluaran" val={stats.tO} color="#dc2626" sub={`${po.length} transaksi`}/>
                <StatCard label="Net Profit" val={stats.net} color={stats.net>=0?"#16a34a":"#dc2626"} sub={fmt(stats.net)}/>
                <StatCard label="Bulan Ini (Masuk)" val={stats.mI} color="#0ea5e9" sub={`Keluar: ${fmtShort(stats.mO)}`}/>
              </div>

              <div className="g32" style={{display:"grid",gridTemplateColumns:"3fr 2fr",gap:14,marginBottom:14}}>
                <div className="card" style={{padding:18}}>
                  <div style={{fontSize:11,fontWeight:700,color:"#94a3b8",letterSpacing:1,marginBottom:12}}>TREN BULANAN</div>
                  <ResponsiveContainer width="100%" height={190}>
                    <AreaChart data={chartMonthly}>
                      <defs>
                        <linearGradient id="gi" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#16a34a" stopOpacity={.2}/><stop offset="95%" stopColor="#16a34a" stopOpacity={0}/></linearGradient>
                        <linearGradient id="go" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#dc2626" stopOpacity={.2}/><stop offset="95%" stopColor="#dc2626" stopOpacity={0}/></linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
                      <XAxis dataKey="label" tick={{fill:"#94a3b8",fontSize:10}} axisLine={false}/>
                      <YAxis tickFormatter={fmtShort} tick={{fill:"#94a3b8",fontSize:9}} axisLine={false}/>
                      <Tooltip {...TT}/>
                      <Legend wrapperStyle={{fontSize:10,color:"#64748b"}}/>
                      <Area type="monotone" dataKey="pemasukan" name="Pemasukan" stroke="#16a34a" fill="url(#gi)" strokeWidth={2}/>
                      <Area type="monotone" dataKey="pengeluaran" name="Pengeluaran" stroke="#dc2626" fill="url(#go)" strokeWidth={2}/>
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <div className="card" style={{padding:18}}>
                  <div style={{fontSize:11,fontWeight:700,color:"#94a3b8",letterSpacing:1,marginBottom:12}}>KATEGORI PENGELUARAN</div>
                  <ResponsiveContainer width="100%" height={190}>
                    <PieChart>
                      <Pie data={expPie} cx="50%" cy="50%" innerRadius={45} outerRadius={72} dataKey="value" label={({name,percent})=>`${name} ${(percent*100).toFixed(0)}%`} labelLine={false} fontSize={10}>
                        {expPie.map((e,i)=><Cell key={i} fill={KAT_COLOR[e.name]||"#0ea5e9"}/>)}
                      </Pie>
                      <Tooltip {...TT}/>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="card" style={{padding:18}}>
                <div style={{fontSize:11,fontWeight:700,color:"#94a3b8",letterSpacing:1,marginBottom:12}}>🔥 PREDIKSI HARI RAMAI</div>
                <ResponsiveContainer width="100%" height={140}>
                  <BarChart data={dayPred}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
                    <XAxis dataKey="day" tick={{fill:"#94a3b8",fontSize:11}} axisLine={false}/>
                    <YAxis tickFormatter={fmtShort} tick={{fill:"#94a3b8",fontSize:9}} axisLine={false}/>
                    <Tooltip {...TT}/>
                    <Bar dataKey="avg" name="Rata-rata" radius={[6,6,0,0]}>
                      {dayPred.map((_,i)=><Cell key={i} fill={["#0ea5e9","#6366f1","#8b5cf6","#e2e8f0","#e2e8f0","#e2e8f0","#e2e8f0"][i]}/>)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <div style={{display:"flex",gap:8,marginTop:10,flexWrap:"wrap"}}>
                  {dayPred.slice(0,3).map((d,i)=>(
                    <div key={i} style={{background:i===0?"#eff6ff":i===1?"#f5f3ff":"#f8fafc",border:`1px solid ${i===0?"#bfdbfe":i===1?"#ddd6fe":"#e2e8f0"}`,borderRadius:8,padding:"5px 12px",fontSize:11,fontWeight:600,color:i===0?"#1d4ed8":i===1?"#6d28d9":"#64748b"}}>
                      {["🔥","📈","✨"][i]} {d.day} — {fmtShort(d.avg)}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ══ PEMASUKAN ══════════════════════════════════════════ */}
          {tab==="pemasukan"&&(
            <div>
              <h1 style={{fontSize:22,fontWeight:800,color:"#0f172a",marginBottom:18}}>💰 Input Pemasukan</h1>
              <div className="g32" style={{display:"grid",gridTemplateColumns:"340px 1fr",gap:18}}>
                <div className="card" style={{padding:20,alignSelf:"start"}}>
                  <div style={{fontSize:11,fontWeight:700,color:"#0284c7",letterSpacing:1,marginBottom:16}}>TAMBAH PEMASUKAN</div>
                  <div style={{display:"flex",flexDirection:"column",gap:12}}>
                    <div>
                      <label style={{fontSize:10,color:"#94a3b8",display:"block",marginBottom:5,fontWeight:700,letterSpacing:.5}}>TANGGAL</label>
                      <input type="date" className="inp" value={fI.tanggal} onChange={e=>setFI({...fI,tanggal:e.target.value})}/>
                    </div>
                    <div>
                      <label style={{fontSize:10,color:"#94a3b8",display:"block",marginBottom:5,fontWeight:700,letterSpacing:.5}}>URAIAN</label>
                      <input type="text" className="inp" placeholder="Contoh: GrabCar pagi, GrabFood..." value={fI.uraian} onChange={e=>setFI({...fI,uraian:e.target.value})} onKeyDown={e=>e.key==="Enter"&&!saving&&submitIncome()}/>
                    </div>
                    <div>
                      <label style={{fontSize:10,color:"#94a3b8",display:"block",marginBottom:5,fontWeight:700,letterSpacing:.5}}>JUMLAH (Rp)</label>
                      <input type="text" inputMode="numeric" className="inp" style={{fontFamily:"'JetBrains Mono',monospace"}} placeholder="0" value={fI.jumlah} onChange={e=>setFI({...fI,jumlah:fmtInput(e.target.value)})} onKeyDown={e=>e.key==="Enter"&&!saving&&submitIncome()}/>
                    </div>
                    <button className="btn" disabled={saving} onClick={submitIncome} style={{padding:"12px",background:"linear-gradient(135deg,#0ea5e9,#6366f1)",color:"#fff",marginTop:4}}>
                      {saving?"⏳ Menyimpan...":"+ Simpan Pemasukan"}
                    </button>
                  </div>
                  <div style={{marginTop:16,padding:12,background:"#f0fdf4",borderRadius:10,border:"1px solid #bbf7d0"}}>
                    <div style={{fontSize:10,color:"#16a34a",fontWeight:700,marginBottom:4}}>TOTAL PEMASUKAN</div>
                    <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:20,fontWeight:800,color:"#16a34a"}}>{fmtShort(stats.tI)}</div>
                    <div style={{fontSize:10,color:"#94a3b8",marginTop:2}}>{pi.length} transaksi</div>
                  </div>
                </div>
                <div className="card" style={{padding:20}}>
                  <div style={{fontSize:11,fontWeight:700,color:"#64748b",letterSpacing:1,marginBottom:14}}>RIWAYAT PEMASUKAN ({pi.length})</div>
                  <div style={{overflowX:"auto"}}>
                    <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                      <thead><tr style={{borderBottom:"2px solid #f1f5f9"}}>
                        {["Tanggal","Uraian","Jumlah",""].map(h=><th key={h} style={{textAlign:"left",padding:"6px 10px",color:"#94a3b8",fontWeight:700,fontSize:10,letterSpacing:.5}}>{h}</th>)}
                      </tr></thead>
                      <tbody>
                        {pi.map(x=>(
                          <tr key={x.id} className="tr">
                            <td style={{padding:"9px 10px",color:"#94a3b8",fontSize:11,whiteSpace:"nowrap"}}>{x.tanggal}</td>
                            <td style={{padding:"9px 10px",fontWeight:500}}>{x.uraian}</td>
                            <td style={{padding:"9px 10px",fontFamily:"'JetBrains Mono',monospace",color:"#16a34a",fontWeight:700,whiteSpace:"nowrap"}}>{fmt(x.jumlah)}</td>
                            <td style={{padding:"9px 10px"}}>
                              <button onClick={()=>delI(x.id)} style={{background:"#fff1f2",border:"1px solid #fecdd3",color:"#dc2626",padding:"3px 9px",borderRadius:6,cursor:"pointer",fontSize:11,fontFamily:"inherit",fontWeight:600}}>Hapus</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {!pi.length&&<div style={{textAlign:"center",padding:40,color:"#94a3b8",fontSize:13}}>Belum ada data</div>}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ══ PENGELUARAN ════════════════════════════════════════ */}
          {tab==="pengeluaran"&&(
            <div>
              <h1 style={{fontSize:22,fontWeight:800,color:"#0f172a",marginBottom:18}}>💸 Input Pengeluaran</h1>
              <div className="g32" style={{display:"grid",gridTemplateColumns:"340px 1fr",gap:18}}>
                <div className="card" style={{padding:20,alignSelf:"start"}}>
                  <div style={{fontSize:11,fontWeight:700,color:"#dc2626",letterSpacing:1,marginBottom:16}}>TAMBAH PENGELUARAN</div>
                  <div style={{display:"flex",flexDirection:"column",gap:12}}>
                    <div>
                      <label style={{fontSize:10,color:"#94a3b8",display:"block",marginBottom:5,fontWeight:700,letterSpacing:.5}}>TANGGAL</label>
                      <input type="date" className="inp" value={fE.tanggal} onChange={e=>setFE({...fE,tanggal:e.target.value})}/>
                    </div>
                    <div>
                      <label style={{fontSize:10,color:"#94a3b8",display:"block",marginBottom:5,fontWeight:700,letterSpacing:.5}}>KATEGORI</label>
                      <select className="inp" value={fE.kategori} onChange={e=>setFE({...fE,kategori:e.target.value})}>
                        <option>Operasional</option>
                        <option>Maintenance</option>
                        <option>Cicilan</option>
                      </select>
                    </div>
                    <div>
                      <label style={{fontSize:10,color:"#94a3b8",display:"block",marginBottom:5,fontWeight:700,letterSpacing:.5}}>URAIAN</label>
                      <input type="text" className="inp" placeholder="Contoh: BBM, servis, cicilan..." value={fE.uraian} onChange={e=>setFE({...fE,uraian:e.target.value})} onKeyDown={e=>e.key==="Enter"&&!saving&&submitExpense()}/>
                    </div>
                    <div>
                      <label style={{fontSize:10,color:"#94a3b8",display:"block",marginBottom:5,fontWeight:700,letterSpacing:.5}}>JUMLAH (Rp)</label>
                      <input type="text" inputMode="numeric" className="inp" style={{fontFamily:"'JetBrains Mono',monospace"}} placeholder="0" value={fE.jumlah} onChange={e=>setFE({...fE,jumlah:fmtInput(e.target.value)})} onKeyDown={e=>e.key==="Enter"&&!saving&&submitExpense()}/>
                    </div>
                    <button className="btn" disabled={saving} onClick={submitExpense} style={{padding:"12px",background:"linear-gradient(135deg,#ef4444,#f59e0b)",color:"#fff",marginTop:4}}>
                      {saving?"⏳ Menyimpan...":"+ Simpan Pengeluaran"}
                    </button>
                  </div>
                  <div style={{marginTop:16,padding:12,background:"#fff1f2",borderRadius:10,border:"1px solid #fecdd3"}}>
                    <div style={{fontSize:10,color:"#dc2626",fontWeight:700,marginBottom:4}}>TOTAL PENGELUARAN</div>
                    <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:20,fontWeight:800,color:"#dc2626"}}>{fmtShort(stats.tO)}</div>
                    <div style={{fontSize:10,color:"#94a3b8",marginTop:2}}>{po.length} transaksi</div>
                  </div>
                </div>
                <div className="card" style={{padding:20}}>
                  <div style={{fontSize:11,fontWeight:700,color:"#64748b",letterSpacing:1,marginBottom:14}}>RIWAYAT PENGELUARAN ({po.length})</div>
                  <div style={{overflowX:"auto"}}>
                    <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                      <thead><tr style={{borderBottom:"2px solid #f1f5f9"}}>
                        {["Tanggal","Kategori","Uraian","Jumlah",""].map(h=><th key={h} style={{textAlign:"left",padding:"6px 10px",color:"#94a3b8",fontWeight:700,fontSize:10,letterSpacing:.5}}>{h}</th>)}
                      </tr></thead>
                      <tbody>
                        {po.map(x=>(
                          <tr key={x.id} className="tr">
                            <td style={{padding:"9px 10px",color:"#94a3b8",fontSize:11,whiteSpace:"nowrap"}}>{x.tanggal}</td>
                            <td style={{padding:"9px 10px"}}><span className="badge" style={{background:`${KAT_COLOR[x.kategori]}18`,color:KAT_COLOR[x.kategori]}}>{x.kategori}</span></td>
                            <td style={{padding:"9px 10px",fontWeight:500}}>{x.uraian}</td>
                            <td style={{padding:"9px 10px",fontFamily:"'JetBrains Mono',monospace",color:"#dc2626",fontWeight:700,whiteSpace:"nowrap"}}>{fmt(x.jumlah)}</td>
                            <td style={{padding:"9px 10px"}}>
                              <button onClick={()=>delE(x.id)} style={{background:"#fff1f2",border:"1px solid #fecdd3",color:"#dc2626",padding:"3px 9px",borderRadius:6,cursor:"pointer",fontSize:11,fontFamily:"inherit",fontWeight:600}}>Hapus</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {!po.length&&<div style={{textAlign:"center",padding:40,color:"#94a3b8",fontSize:13}}>Belum ada data</div>}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ══ LAPORAN ════════════════════════════════════════════ */}
          {tab==="laporan"&&(
            <div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18,flexWrap:"wrap",gap:10}}>
                <h1 style={{fontSize:22,fontWeight:800,color:"#0f172a"}}>📋 Laporan Keuangan</h1>
                <button className="btn" onClick={exportExcel} style={{padding:"9px 16px",background:"linear-gradient(135deg,#16a34a,#0ea5e9)",color:"#fff",display:"flex",alignItems:"center",gap:7}}>
                  📥 Export Excel
                </button>
              </div>
              <div className="card" style={{padding:"12px 16px",marginBottom:16,display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                <span style={{fontSize:10,color:"#94a3b8",fontWeight:700,letterSpacing:.5}}>FILTER:</span>
                {["bulan","tahun","semua"].map(p=>(
                  <button key={p} onClick={()=>setFilterPeriod(p)} style={{padding:"5px 13px",borderRadius:8,border:`1px solid ${filterPeriod===p?"#0ea5e9":"#e2e8f0"}`,background:filterPeriod===p?"#eff6ff":"transparent",color:filterPeriod===p?"#0284c7":"#64748b",cursor:"pointer",fontSize:12,fontFamily:"inherit",fontWeight:700}}>
                    {p==="bulan"?"Per Bulan":p==="tahun"?"Per Tahun":"Semua"}
                  </button>
                ))}
                {filterPeriod!=="semua"&&(
                  <input type={filterPeriod==="tahun"?"number":"month"} className="inp" style={{width:140,padding:"5px 11px"}} value={filterPeriod==="tahun"?filterDate.slice(0,4):filterDate} onChange={e=>setFilterDate(filterPeriod==="tahun"?e.target.value+"-01":e.target.value)}/>
                )}
              </div>
              <div className="g3" style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:16}}>
                {[
                  {l:"Total Pemasukan",v:filtered.iT,c:"#16a34a"},
                  {l:"Total Pengeluaran",v:filtered.oT,c:"#dc2626"},
                  {l:"Laba Bersih",v:filtered.net,c:filtered.net>=0?"#16a34a":"#dc2626"},
                ].map((s,i)=>(
                  <div key={i} className="card" style={{padding:16,textAlign:"center"}}>
                    <div style={{fontSize:10,color:"#94a3b8",fontWeight:700,marginBottom:7,letterSpacing:.5}}>{s.l}</div>
                    <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:20,fontWeight:800,color:s.c}}>{fmtShort(s.v)}</div>
                    <div style={{fontSize:10,color:"#94a3b8",marginTop:3}}>{fmt(s.v)}</div>
                  </div>
                ))}
              </div>
              <div className="card" style={{padding:18,marginBottom:16}}>
                <div style={{fontSize:11,fontWeight:700,color:"#94a3b8",letterSpacing:1,marginBottom:12}}>GRAFIK BULANAN</div>
                <ResponsiveContainer width="100%" height={190}>
                  <BarChart data={chartMonthly}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
                    <XAxis dataKey="label" tick={{fill:"#94a3b8",fontSize:10}} axisLine={false}/>
                    <YAxis tickFormatter={fmtShort} tick={{fill:"#94a3b8",fontSize:9}} axisLine={false}/>
                    <Tooltip {...TT}/><Legend wrapperStyle={{fontSize:10}}/>
                    <Bar dataKey="pemasukan" name="Pemasukan" fill="#16a34a" radius={[4,4,0,0]}/>
                    <Bar dataKey="pengeluaran" name="Pengeluaran" fill="#dc2626" radius={[4,4,0,0]}/>
                    <Bar dataKey="net" name="Net Profit" fill="#0ea5e9" radius={[4,4,0,0]}/>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="g2" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
                {[
                  {title:"DETAIL PEMASUKAN",data:filtered.pI,color:"#16a34a"},
                  {title:"DETAIL PENGELUARAN",data:filtered.pO,color:"#dc2626"},
                ].map((t,ti)=>(
                  <div key={ti} className="card" style={{padding:18}}>
                    <div style={{fontSize:11,fontWeight:700,color:t.color,marginBottom:12,letterSpacing:.5}}>{t.title} ({t.data.length})</div>
                    <div style={{maxHeight:280,overflowY:"auto"}}>
                      {t.data.length?t.data.map(x=>(
                        <div key={x.id} style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",padding:"8px 0",borderBottom:"1px solid #f1f5f9",fontSize:12,gap:8}}>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{x.uraian}</div>
                            <div style={{fontSize:10,color:"#94a3b8",marginTop:2,display:"flex",alignItems:"center",gap:5}}>
                              {x.tanggal}
                              {x.kategori&&<span className="badge" style={{background:`${KAT_COLOR[x.kategori]}18`,color:KAT_COLOR[x.kategori],fontSize:9}}>{x.kategori}</span>}
                            </div>
                          </div>
                          <div style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:700,color:t.color,flexShrink:0,fontSize:11}}>{fmtShort(x.jumlah)}</div>
                        </div>
                      )):<div style={{color:"#94a3b8",textAlign:"center",padding:30,fontSize:12}}>Tidak ada data</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ══ ANALITIK ═══════════════════════════════════════════ */}
          {tab==="analitik"&&(
            <div>
              <h1 style={{fontSize:22,fontWeight:800,color:"#0f172a",marginBottom:18}}>📊 Analitik & Business Intelligence</h1>
              <div className="g2" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:14}}>
                <div className="card" style={{padding:18}}>
                  <div style={{fontSize:11,fontWeight:700,color:"#94a3b8",letterSpacing:1,marginBottom:12}}>NET PROFIT TREND</div>
                  <ResponsiveContainer width="100%" height={185}>
                    <LineChart data={chartMonthly}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
                      <XAxis dataKey="label" tick={{fill:"#94a3b8",fontSize:10}} axisLine={false}/>
                      <YAxis tickFormatter={fmtShort} tick={{fill:"#94a3b8",fontSize:9}} axisLine={false}/>
                      <Tooltip {...TT}/>
                      <Line type="monotone" dataKey="net" stroke="#0ea5e9" strokeWidth={2.5} dot={{fill:"#0ea5e9",r:4}} name="Net Profit"/>
                      <Line type="monotone" dataKey="pemasukan" stroke="#16a34a" strokeWidth={1.5} dot={false} strokeDasharray="4 4" name="Pemasukan"/>
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div className="card" style={{padding:18}}>
                  <div style={{fontSize:11,fontWeight:700,color:"#94a3b8",letterSpacing:1,marginBottom:12}}>ANALISIS HARI TERBAIK</div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:5}}>
                    {dayPred.map((d,i)=>(
                      <div key={i} style={{textAlign:"center",padding:"10px 4px",borderRadius:10,background:i===0?"#eff6ff":i===1?"#f5f3ff":"#f8fafc",border:`1px solid ${i===0?"#bfdbfe":i===1?"#ddd6fe":"#e2e8f0"}`}}>
                        <div style={{fontSize:9,fontWeight:700,color:i===0?"#1d4ed8":i===1?"#6d28d9":"#94a3b8"}}>{d.day}</div>
                        <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:10,fontWeight:700,color:i===0?"#1d4ed8":i===1?"#6d28d9":"#64748b",marginTop:4}}>{fmtShort(d.avg)}</div>
                        <div style={{fontSize:8,color:"#94a3b8",marginTop:2}}>{d.count}×</div>
                        {i===0&&<div style={{marginTop:4,fontSize:7,background:"#dbeafe",color:"#1d4ed8",borderRadius:3,padding:"1px 3px",fontWeight:700}}>RAMAI</div>}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="card" style={{padding:18}}>
                <div style={{fontSize:11,fontWeight:700,color:"#94a3b8",letterSpacing:1,marginBottom:14}}>KEY PERFORMANCE INDICATORS</div>
                <div className="g3" style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:11}}>
                  {[
                    {l:"Rata-rata Pemasukan/Bulan",v:chartMonthly.length?fmtShort(chartMonthly.reduce((s,m)=>s+m.pemasukan,0)/chartMonthly.length):"N/A",c:"#16a34a"},
                    {l:"Rata-rata Pengeluaran/Bulan",v:chartMonthly.length?fmtShort(chartMonthly.reduce((s,m)=>s+m.pengeluaran,0)/chartMonthly.length):"N/A",c:"#dc2626"},
                    {l:"Bulan Terbaik",v:chartMonthly.length?chartMonthly.reduce((b,m)=>m.pemasukan>b.pemasukan?m:b,chartMonthly[0]).label:"N/A",c:"#0ea5e9"},
                    {l:"Total Transaksi",v:`${pi.length+po.length} transaksi`,c:"#8b5cf6"},
                    {l:"Margin Keuntungan",v:stats.tI?`${((stats.net/stats.tI)*100).toFixed(1)}%`:"0%",c:stats.net>=0?"#16a34a":"#dc2626"},
                    {l:"Pengeluaran Terbesar",v:expPie.length?expPie.reduce((b,e)=>e.value>b.value?e:b,expPie[0]).name:"N/A",c:"#f59e0b"},
                  ].map((k,i)=>(
                    <div key={i} style={{padding:14,background:"#f8fafc",borderRadius:10,border:"1px solid #e2e8f0"}}>
                      <div style={{fontSize:9,color:"#94a3b8",fontWeight:700,marginBottom:6,letterSpacing:.5,textTransform:"uppercase"}}>{k.l}</div>
                      <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:18,fontWeight:800,color:k.c}}>{k.v}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          </>}
        </main>
      </div>

      {/* Bottom nav mobile */}
      <nav className="botNav" style={{justifyContent:"space-around"}}>
        {NAV.map(n=>(
          <div key={n.id} onClick={()=>setTab(n.id)} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3,padding:"6px 10px",cursor:"pointer",flex:1,color:tab===n.id?"#0284c7":"#94a3b8"}}>
            <span style={{fontSize:19}}>{n.em}</span>
            <span style={{fontSize:9,fontWeight:700}}>{n.label}</span>
          </div>
        ))}
      </nav>

      {/* Toast */}
      {toast&&(
        <div className="toast" style={{background:toast.type==="success"?"#f0fdf4":toast.type==="warn"?"#fffbeb":"#fff1f2",border:`1px solid ${toast.type==="success"?"#bbf7d0":toast.type==="warn"?"#fde68a":"#fecdd3"}`,color:toast.type==="success"?"#15803d":toast.type==="warn"?"#d97706":"#dc2626"}}>
          <span>{toast.msg}</span>
          <span onClick={()=>setToast(null)} style={{cursor:"pointer",opacity:.5,marginLeft:4}}>✕</span>
        </div>
      )}
    </div>
  );
}
