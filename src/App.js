import { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";

const SCORE_OPTIONS = ["0","15","30","40","-","QB","DEU","R"];
const MIN_SAMPLE = 5;
const THRESHOLDS = { recomendado: 0.75, neutro: 0.60, oddMin: 1.40, oddMax1: 1.68, oddMax2: 1.80 };

// ─── Funções de cálculo ──────────────────────────────────────────────────────

function getRec(pct) {
  if (pct === null || pct === undefined) return null;
  if (pct >= THRESHOLDS.recomendado) return "RECOMENDADO";
  if (pct >= THRESHOLDS.neutro) return "NEUTRO";
  return "NÃO RECOMENDADO";
}

function getOddRec(odd) {
  const o = parseFloat(odd);
  if (isNaN(o)) return null;
  if (o >= THRESHOLDS.oddMin && o <= THRESHOLDS.oddMax1) return "RECOMENDADO";
  if (o > THRESHOLDS.oddMax1 && o <= THRESHOLDS.oddMax2) return "NEUTRO";
  return "NÃO RECOMENDADO";
}

function buildCenario1Key(quebrou, sac1, sac2) { return `${quebrou}${sac1}${sac2}`; }
function buildCenario2Key(set_, quebrador, sacador) { return `${set_}º${quebrador}${sacador}`; }

function calcResult(form, c1Entry, c2Entry) {
  const c1pct = c1Entry && c1Entry.total >= MIN_SAMPLE ? c1Entry.green / c1Entry.total : null;
  const c2pct = c2Entry && c2Entry.total >= MIN_SAMPLE ? c2Entry.green / c2Entry.total : null;
  const rec1 = getRec(c1pct);
  const rec2 = getRec(c2pct);
  const rec3 = getOddRec(form.odd);
  const recs = [rec1, rec2, rec3].filter(Boolean);
  const countRec = recs.filter(r => r === "RECOMENDADO").length;
  const countNao = recs.filter(r => r === "NÃO RECOMENDADO").length;
  let final = null;
  if (rec1 && rec2) {
    if (countRec >= 2) final = "RECOMENDADO";
    else if (countNao >= 2) final = "NÃO RECOMENDADO";
    else final = "NEUTRO";
  }
  return { c1pct, c2pct, rec1, rec2, rec3, final };
}

// ─── Componentes visuais ─────────────────────────────────────────────────────

const s = {
  card: { background:"#fff", border:"1px solid #e5e7eb", borderRadius:14, padding:20 },
  label: { fontSize:12, color:"#6b7280", display:"block", marginBottom:4 },
  grid3: { display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12 },
  grid2: { display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 },
  divider: { borderTop:"1px solid #f0f0f0", margin:"16px 0" },
  row: { display:"flex", alignItems:"center", gap:8 },
};

function RecBadge({ rec }) {
  if (!rec) return <span style={{fontSize:12,color:"#aaa"}}>—</span>;
  const styles = {
    "RECOMENDADO": { bg:"#d4f7e3", color:"#1a6640", border:"#5cb87a" },
    "NEUTRO": { bg:"#fef4d4", color:"#7a5a10", border:"#e4c24a" },
    "NÃO RECOMENDADO": { bg:"#fde8e8", color:"#8b2020", border:"#e47a7a" },
  };
  const st = styles[rec] || {};
  return (
    <span style={{
      display:"inline-block", fontSize:11, fontWeight:600, padding:"3px 9px",
      borderRadius:5, border:`1px solid ${st.border}`, background:st.bg, color:st.color
    }}>{rec}</span>
  );
}

function StatBar({ pct, total }) {
  if (total === undefined || total === null) return <span style={{fontSize:12,color:"#aaa"}}>sem dados</span>;
  const hasData = total >= MIN_SAMPLE;
  const color = !hasData ? "#ccc" : pct >= 0.75 ? "#1a9150" : pct >= 0.60 ? "#c47a10" : "#c02020";
  return (
    <div style={{display:"flex",alignItems:"center",gap:8}}>
      <div style={{flex:1,height:6,borderRadius:3,background:"#f0f0f0",overflow:"hidden"}}>
        <div style={{width:`${(pct||0)*100}%`,height:"100%",background:color,borderRadius:3}}/>
      </div>
      <span style={{fontSize:12,color,minWidth:80,textAlign:"right",fontVariantNumeric:"tabular-nums"}}>
        {!hasData ? `${total} (mín. ${MIN_SAMPLE})` : `${Math.round((pct||0)*100)}% (${total} jogos)`}
      </span>
    </div>
  );
}

// ─── App principal ───────────────────────────────────────────────────────────

export default function App() {
  const [user, setUser] = useState(null);
  const [tab, setTab] = useState("consulta");

  if (!user) return <LoginScreen onLogin={setUser} />;
  return (
    <div style={{maxWidth:700,margin:"0 auto",padding:"20px 16px"}}>
      <Header user={user} tab={tab} setTab={setTab} onLogout={() => setUser(null)} />
      {tab === "consulta" && <ConsultaTab user={user} />}
      {tab === "historico" && user.role === "admin" && <HistoricoTab />}
      {tab === "stats" && user.role === "admin" && <StatsTab />}
    </div>
  );
}

// ─── Login ───────────────────────────────────────────────────────────────────

function LoginScreen({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!username || !password) { setError("Preencha usuário e senha."); return; }
    setLoading(true);
    const { data, error: err } = await supabase
      .from("usuarios")
      .select("*")
      .eq("username", username.toLowerCase())
      .eq("password", password)
      .single();
    setLoading(false);
    if (err || !data) { setError("Usuário ou senha incorretos."); return; }
    onLogin(data);
  };

  return (
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
      <div style={{width:"100%",maxWidth:360}}>
        <div style={{textAlign:"center",marginBottom:28}}>
          <div style={{fontSize:40,marginBottom:8}}>🎾</div>
          <h1 style={{fontSize:22,fontWeight:700,color:"#1a1a1a"}}>Tennis Trader</h1>
          <p style={{fontSize:13,color:"#6b7280",marginTop:4}}>Sistema de recomendação esportiva</p>
        </div>
        <div style={{...s.card, display:"flex",flexDirection:"column",gap:14}}>
          <div>
            <label style={s.label}>Usuário</label>
            <input value={username} onChange={e=>setUsername(e.target.value)}
              placeholder="seu usuário" style={{width:"100%"}}
              onKeyDown={e=>e.key==="Enter"&&handleLogin()} />
          </div>
          <div>
            <label style={s.label}>Senha</label>
            <input type="password" value={password} onChange={e=>setPassword(e.target.value)}
              style={{width:"100%"}} onKeyDown={e=>e.key==="Enter"&&handleLogin()} />
          </div>
          {error && <p style={{margin:0,fontSize:12,color:"#c02020"}}>{error}</p>}
          <button onClick={handleLogin} disabled={loading} style={{padding:"10px 0",width:"100%",fontSize:14,fontWeight:500}}>
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Header ──────────────────────────────────────────────────────────────────

function Header({ user, tab, setTab, onLogout }) {
  const isAdmin = user.role === "admin";
  return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20,flexWrap:"wrap",gap:8}}>
      <div style={{display:"flex",alignItems:"center",gap:10}}>
        <span style={{fontSize:22}}>🎾</span>
        <div>
          <div style={{fontSize:15,fontWeight:600}}>Tennis Trader</div>
          <div style={{fontSize:11,color:"#6b7280"}}>{isAdmin ? "Administrador" : "Usuário"} · {user.username}</div>
        </div>
      </div>
      <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
        {isAdmin && ["consulta","historico","stats"].map(t => (
          <button key={t} onClick={()=>setTab(t)} style={{
            fontSize:12,padding:"5px 12px",
            background: tab===t ? "#2d6a4f" : "#fff",
            color: tab===t ? "#fff" : "#444",
            border: `1px solid ${tab===t ? "#2d6a4f" : "#ddd"}`
          }}>
            {t==="consulta"?"Consulta":t==="historico"?"Histórico":"Estatísticas"}
          </button>
        ))}
        <button onClick={onLogout} style={{fontSize:12,padding:"5px 12px",background:"#fff",color:"#6b7280",border:"1px solid #ddd"}}>
          Sair
        </button>
      </div>
    </div>
  );
}

// ─── Aba Consulta ─────────────────────────────────────────────────────────────

function ConsultaTab({ user }) {
  const isAdmin = user.role === "admin";
  const [form, setForm] = useState({ quebrou:"15",sac1:"0",sac2:"0",set_:"1",quebrador:"0",sacador:"0",odd:"" });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [statusInput, setStatusInput] = useState("GREEN");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const setF = (k, v) => setForm(f => ({...f, [k]: v}));

  const handleAnalyze = async () => {
    setLoading(true);
    setResult(null);
    setSaved(false);
    const c1key = buildCenario1Key(form.quebrou, form.sac1, form.sac2);
    const c2key = buildCenario2Key(form.set_, form.quebrador, form.sacador);
    const [r1, r2] = await Promise.all([
      supabase.from("cenario1").select("*").eq("chave", c1key).single(),
      supabase.from("cenario2").select("*").eq("chave", c2key).single(),
    ]);
    const c1Entry = r1.data || null;
    const c2Entry = r2.data || null;
    const calc = calcResult(form, c1Entry, c2Entry);
    setResult({ ...calc, c1key, c2key, c1Entry, c2Entry });
    setLoading(false);
  };

  const handleSave = async () => {
    if (!result || !isAdmin || saved) return;
    setSaving(true);
    const isGreen = statusInput === "GREEN";

    // Atualiza cenario1
    if (result.c1Entry) {
      await supabase.from("cenario1").update({
        total: result.c1Entry.total + 1,
        green: result.c1Entry.green + (isGreen ? 1 : 0),
        atualizado_em: new Date().toISOString()
      }).eq("chave", result.c1key);
    } else {
      await supabase.from("cenario1").insert({ chave: result.c1key, total: 1, green: isGreen ? 1 : 0 });
    }

    // Atualiza cenario2
    if (result.c2Entry) {
      await supabase.from("cenario2").update({
        total: result.c2Entry.total + 1,
        green: result.c2Entry.green + (isGreen ? 1 : 0),
        atualizado_em: new Date().toISOString()
      }).eq("chave", result.c2key);
    } else {
      await supabase.from("cenario2").insert({ chave: result.c2key, total: 1, green: isGreen ? 1 : 0 });
    }

    // Salva no histórico
    await supabase.from("historico").insert({
      quebrou: form.quebrou, sac1: form.sac1, sac2: form.sac2,
      set_: form.set_, quebrador: form.quebrador, sacador: form.sacador,
      odd: parseFloat(form.odd) || null,
      chave_c1: result.c1key, chave_c2: result.c2key,
      recomendacao: result.final, status: statusInput
    });

    setSaving(false);
    setSaved(true);
  };

  return (
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      <div style={s.card}>
        <h2 style={{margin:"0 0 16px",fontSize:15,fontWeight:600}}>Dados do jogo</h2>
        <div style={s.grid3}>
          <ScoreField label="Pontuação da quebra" value={form.quebrou} onChange={v=>setF("quebrou",v)} />
          <ScoreField label="Último game sacando" value={form.sac1} onChange={v=>setF("sac1",v)} />
          <ScoreField label="Penúltimo game sacando" value={form.sac2} onChange={v=>setF("sac2",v)} />
        </div>

        <div style={s.divider}/>
        <p style={{fontSize:12,color:"#6b7280",marginBottom:12}}>Placar do set atual</p>
        <div style={s.grid3}>
          <div>
            <label style={s.label}>Set</label>
            <select value={form.set_} onChange={e=>setF("set_",e.target.value)} style={{width:"100%"}}>
              {["1","2","3"].map(v=><option key={v}>{v}</option>)}
            </select>
          </div>
          <div>
            <label style={s.label}>Games do Quebrador</label>
            <select value={form.quebrador} onChange={e=>setF("quebrador",e.target.value)} style={{width:"100%"}}>
              {[0,1,2,3,4,5,6,7].map(v=><option key={v}>{v}</option>)}
            </select>
          </div>
          <div>
            <label style={s.label}>Games do Sacador</label>
            <select value={form.sacador} onChange={e=>setF("sacador",e.target.value)} style={{width:"100%"}}>
              {[0,1,2,3,4,5,6,7].map(v=><option key={v}>{v}</option>)}
            </select>
          </div>
        </div>

        <div style={s.divider}/>
        <div style={{maxWidth:200}}>
          <label style={s.label}>Odd do mercado</label>
          <input type="number" step="0.01" min="1" value={form.odd}
            onChange={e=>setF("odd",e.target.value)} placeholder="ex: 1.55" style={{width:"100%"}} />
        </div>

        <button onClick={handleAnalyze} disabled={loading} style={{marginTop:16,width:"100%",padding:"10px 0",fontSize:14,fontWeight:500}}>
          {loading ? "Analisando..." : "Analisar jogo"}
        </button>
      </div>

      {result && (
        <>
          <ResultCard result={result} />

          <div style={s.card}>
            <h3 style={{margin:"0 0 14px",fontSize:13,fontWeight:600,color:"#6b7280"}}>ANÁLISE DAS 3 REGRAS</h3>
            <RuleRow num={1} label={`Quebra: ${form.quebrou} · Sac1: ${form.sac1} · Sac2: ${form.sac2}`}
              chave={result.c1key} entry={result.c1Entry} pct={result.c1pct} rec={result.rec1} />
            <RuleRow num={2} label={`${form.set_}º set · Quebrador: ${form.quebrador} · Sacador: ${form.sacador}`}
              chave={result.c2key} entry={result.c2Entry} pct={result.c2pct} rec={result.rec2} />
            <div style={{display:"flex",alignItems:"flex-start",gap:12,paddingTop:12}}>
              <NumCircle n={3} />
              <div style={{flex:1}}>
                <p style={{fontSize:13,margin:"0 0 6px"}}>Faixa da odd: <strong>{form.odd || "—"}</strong>
                  <span style={{fontSize:11,color:"#9ca3af",marginLeft:8}}>
                    1.40–1.68 = REC · 1.69–1.80 = NEUTRO · fora = NÃO REC
                  </span>
                </p>
                <RecBadge rec={result.rec3} />
              </div>
            </div>
          </div>

          {isAdmin && (
            <div style={s.card}>
              <h3 style={{margin:"0 0 12px",fontSize:13,fontWeight:600,color:"#6b7280"}}>SALVAR RESULTADO (Admin)</h3>
              <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                <span style={{fontSize:13,color:"#444"}}>O jogo foi:</span>
                {["GREEN","RED"].map(v => (
                  <button key={v} onClick={()=>setStatusInput(v)} style={{
                    padding:"6px 16px", fontSize:13, fontWeight:500,
                    background: statusInput===v ? (v==="GREEN"?"#d4f7e3":"#fde8e8") : "#fff",
                    color: statusInput===v ? (v==="GREEN"?"#1a6640":"#8b2020") : "#666",
                    border: `1px solid ${statusInput===v ? (v==="GREEN"?"#5cb87a":"#e47a7a") : "#ddd"}`
                  }}>{v==="GREEN"?"✅ GREEN":"❌ RED"}</button>
                ))}
                <button onClick={handleSave} disabled={saved||saving} style={{
                  marginLeft:"auto",padding:"6px 18px",fontSize:13,fontWeight:500,
                  background: saved ? "#d4f7e3" : "#2d6a4f",
                  color: saved ? "#1a6640" : "#fff",
                }}>
                  {saving ? "Salvando..." : saved ? "Salvo ✓" : "Salvar na base →"}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ScoreField({ label, value, onChange }) {
  return (
    <div>
      <label style={s.label}>{label}</label>
      <select value={value} onChange={e=>onChange(e.target.value)} style={{width:"100%"}}>
        {SCORE_OPTIONS.map(v=><option key={v}>{v}</option>)}
      </select>
    </div>
  );
}

function ResultCard({ result }) {
  const configs = {
    "RECOMENDADO": { bg:"#e8f9ef", border:"#2d7d4f", color:"#1a5c38", emoji:"✅", texto:"RECOMENDADO" },
    "NEUTRO": { bg:"#fffbeb", border:"#d97706", color:"#7a5a10", emoji:"⚠️", texto:"NEUTRO" },
    "NÃO RECOMENDADO": { bg:"#fef2f2", border:"#dc2626", color:"#8b2020", emoji:"❌", texto:"NÃO RECOMENDADO" },
  };
  const c = configs[result.final] || { bg:"#f9fafb", border:"#ddd", color:"#6b7280", emoji:"❓", texto:"DADOS INSUFICIENTES" };
  return (
    <div style={{background:c.bg,border:`2px solid ${c.border}`,borderRadius:14,padding:24,textAlign:"center"}}>
      <div style={{fontSize:36,marginBottom:6}}>{c.emoji}</div>
      <div style={{fontSize:24,fontWeight:700,color:c.color}}>{c.texto}</div>
      {!result.rec1 && <div style={{fontSize:12,color:"#9ca3af",marginTop:6}}>Cenário 1 sem histórico suficiente (mín. {MIN_SAMPLE} registros)</div>}
      {!result.rec2 && <div style={{fontSize:12,color:"#9ca3af",marginTop:2}}>Cenário 2 sem histórico suficiente</div>}
    </div>
  );
}

function NumCircle({ n }) {
  return (
    <span style={{
      minWidth:24,height:24,borderRadius:"50%",background:"#f3f4f6",
      display:"inline-flex",alignItems:"center",justifyContent:"center",
      fontSize:12,fontWeight:600,color:"#6b7280",flexShrink:0,marginTop:2
    }}>{n}</span>
  );
}

function RuleRow({ num, label, chave, entry, pct, rec }) {
  return (
    <div style={{display:"flex",alignItems:"flex-start",gap:12,paddingBottom:12,marginBottom:12,borderBottom:"1px solid #f0f0f0"}}>
      <NumCircle n={num} />
      <div style={{flex:1}}>
        <p style={{fontSize:13,margin:"0 0 6px"}}>{label}
          <span style={{fontSize:11,color:"#9ca3af",marginLeft:8}}>chave: <code>{chave}</code></span>
        </p>
        <StatBar pct={pct} total={entry?.total} />
        <div style={{marginTop:6}}><RecBadge rec={rec} /></div>
      </div>
    </div>
  );
}

// ─── Aba Histórico ────────────────────────────────────────────────────────────

function HistoricoTab() {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from("historico").select("*").order("salvo_em",{ascending:false}).limit(100)
      .then(({data}) => { setHistory(data||[]); setLoading(false); });
  }, []);

  if (loading) return <div style={{textAlign:"center",padding:40,color:"#6b7280"}}>Carregando...</div>;
  if (!history.length) return <div style={{textAlign:"center",padding:40,color:"#6b7280"}}>Nenhum jogo salvo ainda.</div>;

  const greens = history.filter(h=>h.status==="GREEN").length;

  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <h2 style={{fontSize:15,fontWeight:600}}>Histórico de jogos</h2>
        <span style={{fontSize:13,color:"#6b7280"}}>{greens}/{history.length} greens ({Math.round(greens/history.length*100)}%)</span>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {history.map(h => (
          <div key={h.id} style={{...s.card,padding:14,display:"flex",gap:12,alignItems:"center"}}>
            <span style={{fontSize:20}}>{h.status==="GREEN"?"✅":"❌"}</span>
            <div style={{flex:1}}>
              <div style={{fontSize:13,fontWeight:500}}>
                Quebra {h.quebrou}-{h.sac1}-{h.sac2} · {h.set_}º{h.quebrador}×{h.sacador} · odd {h.odd||"—"}
              </div>
              <div style={{fontSize:11,color:"#9ca3af",marginTop:2}}>
                {new Date(h.salvo_em).toLocaleString("pt-BR")}
              </div>
            </div>
            <RecBadge rec={h.recomendacao} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Aba Estatísticas ─────────────────────────────────────────────────────────

function StatsTab() {
  const [c1, setC1] = useState([]);
  const [c2, setC2] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      supabase.from("cenario1").select("*").gte("total", MIN_SAMPLE).order("total",{ascending:false}).limit(20),
      supabase.from("cenario2").select("*").gte("total", MIN_SAMPLE).order("total",{ascending:false}).limit(20),
    ]).then(([r1, r2]) => {
      setC1(r1.data||[]);
      setC2(r2.data||[]);
      setLoading(false);
    });
  }, []);

  if (loading) return <div style={{textAlign:"center",padding:40,color:"#6b7280"}}>Carregando estatísticas...</div>;

  return (
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      <div style={s.grid2}>
        <StatsTable title="Top Cenário 1 (padrão de quebra)" rows={c1} />
        <StatsTable title="Top Cenário 2 (placar do set)" rows={c2} />
      </div>
    </div>
  );
}

function StatsTable({ title, rows }) {
  return (
    <div style={s.card}>
      <h3 style={{margin:"0 0 12px",fontSize:13,fontWeight:600}}>{title}</h3>
      {rows.map(r => {
        const pct = r.green / r.total;
        const color = pct>=0.75?"#1a9150":pct>=0.60?"#c47a10":"#c02020";
        return (
          <div key={r.chave} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 0",borderBottom:"1px solid #f5f5f5"}}>
            <code style={{fontSize:11,minWidth:70,color:"#6b7280"}}>{r.chave}</code>
            <div style={{flex:1,height:5,borderRadius:3,background:"#f0f0f0",overflow:"hidden"}}>
              <div style={{width:`${pct*100}%`,height:"100%",background:color,borderRadius:3}}/>
            </div>
            <span style={{fontSize:11,color,minWidth:36,textAlign:"right"}}>{Math.round(pct*100)}%</span>
            <span style={{fontSize:10,color:"#aaa",minWidth:28,textAlign:"right"}}>{r.total}</span>
          </div>
        );
      })}
    </div>
  );
}
