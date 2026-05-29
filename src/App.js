import { useState, useEffect, useCallback } from "react";
import { supabase } from "./supabaseClient";

const SCORE_OPTIONS = ["0","15","30","40","-","QB"];
const SET_OPTIONS = ["1","2","3","4","5"];
const GAME_OPTIONS = ["0","1","2","3","4","5","6","7"];
const MIN_SAMPLE = 5;
const DIAS_MENSALIDADE = 30;
const THRESHOLDS = { recomendado: 0.75, neutro: 0.60, oddMin: 1.40, oddMax1: 1.68, oddMax2: 1.80 };

function getRec(pct, total) {
  if (pct===null||pct===undefined||total===null||total===undefined) return null;
  if (total < MIN_SAMPLE) return null;
  // Usa percentual bruto para recomendação (Wilson é só informativo)
  if (pct >= THRESHOLDS.recomendado) return "RECOMENDADO";
  if (pct >= THRESHOLDS.neutro) return "NEUTRO";
  return "NÃO RECOMENDADO";
}
function getOddRec(odd) {
  const o=parseFloat(odd); if(isNaN(o)) return null;
  if(o>=THRESHOLDS.oddMin&&o<=THRESHOLDS.oddMax1) return "RECOMENDADO";
  if(o>THRESHOLDS.oddMax1&&o<=THRESHOLDS.oddMax2) return "NEUTRO";
  return "NÃO RECOMENDADO";
}
function getOddProb(odd) {
  const o=parseFloat(odd); if(isNaN(o)) return null;
  return 1/o;
}
function buildC1Key(q,s1,s2){return `${q}${s1}${s2}`;}
function buildC2Key(s,q,sc){return `${s}º${q}${sc}`;}
function diasRestantes(dv){
  if(!dv)return null;
  return Math.ceil((new Date(dv)-new Date())/(1000*60*60*24));
}

// Probabilidade combinada ponderada (c1 40%, c2 40%, odd 20%)
function calcProbCombinada(c1pct, c2pct, oddProb) {
  const valores = [];
  const pesos = [];
  if (c1pct !== null) { valores.push(c1pct); pesos.push(0.4); }
  if (c2pct !== null) { valores.push(c2pct); pesos.push(0.4); }
  if (oddProb !== null) { valores.push(oddProb); pesos.push(0.2); }
  if (valores.length === 0) return null;
  const totalPeso = pesos.reduce((a,b)=>a+b,0);
  const soma = valores.reduce((acc,v,i)=>acc+v*pesos[i],0);
  return soma/totalPeso;
}

// EV = (prob_green × lucro) - (prob_red × stake)
// Usando prob combinada e odd do mercado
function calcEV(probCombinada, odd) {
  const o = parseFloat(odd);
  if (isNaN(o) || probCombinada === null) return null;
  const lucro = o - 1; // lucro por unidade apostada
  const ev = (probCombinada * lucro) - ((1 - probCombinada) * 1);
  return ev;
}

// Intervalo de confiança Wilson para exibição
function wilsonLower(pct, total) {
  if (!total || total < MIN_SAMPLE) return null;
  const z=1.96, n=total, p=pct;
  return (p + z*z/(2*n) - z*Math.sqrt((p*(1-p)+z*z/(4*n))/n)) / (1 + z*z/n);
}

function calcResult(form, c1Entry, c2Entry) {
  const c1pct = c1Entry&&c1Entry.total>=MIN_SAMPLE ? c1Entry.green/c1Entry.total : null;
  const c2pct = c2Entry&&c2Entry.total>=MIN_SAMPLE ? c2Entry.green/c2Entry.total : null;
  const oddProb = getOddProb(form.odd);
  const rec1=getRec(c1pct, c1Entry?.total);
  const rec2=getRec(c2pct, c2Entry?.total);
  const rec3=getOddRec(form.odd);
  const recs=[rec1,rec2,rec3].filter(Boolean);
  const countRec=recs.filter(r=>r==="RECOMENDADO").length;
  const countNao=recs.filter(r=>r==="NÃO RECOMENDADO").length;
  let final=null;
  if(rec1&&rec2){if(countRec>=2)final="RECOMENDADO";else if(countNao>=2)final="NÃO RECOMENDADO";else final="NEUTRO";}
  const probCombinada = calcProbCombinada(c1pct, c2pct, oddProb);
  const ev = calcEV(probCombinada, form.odd);
  return {c1pct,c2pct,oddProb,rec1,rec2,rec3,final,probCombinada,ev};
}

const s={
  card:{background:"#fff",border:"1px solid #e5e7eb",borderRadius:14,padding:20},
  label:{fontSize:11,color:"#6b7280",display:"block",marginBottom:6,fontWeight:600,textTransform:"uppercase",letterSpacing:0.5},
  divider:{borderTop:"1px solid #f0f0f0",margin:"16px 0"},
  grid2:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12},
};

function QuickSelect({label,options,value,onChange,color="#2d6a4f"}){
  return(
    <div>
      <label style={s.label}>{label}</label>
      <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
        {options.map(o=>{
          const selected=value===o;
          return(
            <button key={o} onClick={()=>onChange(o)} style={{
              padding:"8px 12px",fontSize:14,fontWeight:600,cursor:"pointer",
              borderRadius:8,border:`2px solid ${selected?color:"#e5e7eb"}`,
              background:selected?color:"#fff",color:selected?"#fff":"#374151",
              minWidth:44,transition:"all 0.1s"
            }}>{o}</button>
          );
        })}
      </div>
    </div>
  );
}

function RecBadge({rec}){
  if(!rec)return<span style={{fontSize:12,color:"#aaa"}}>—</span>;
  const st={"RECOMENDADO":{bg:"#d4f7e3",color:"#1a6640",border:"#5cb87a"},"NEUTRO":{bg:"#fef4d4",color:"#7a5a10",border:"#e4c24a"},"NÃO RECOMENDADO":{bg:"#fde8e8",color:"#8b2020",border:"#e47a7a"}}[rec]||{};
  return<span style={{display:"inline-block",fontSize:11,fontWeight:600,padding:"3px 9px",borderRadius:5,border:`1px solid ${st.border}`,background:st.bg,color:st.color}}>{rec}</span>;
}

function StatBar({pct, total}){
  if(total===undefined||total===null)return<span style={{fontSize:12,color:"#aaa"}}>sem dados</span>;
  const hasData=total>=MIN_SAMPLE;
  const lower = wilsonLower(pct, total);
  const color=!hasData?"#ccc":lower>=0.75?"#1a9150":lower>=0.60?"#c47a10":"#c02020";
  return(
    <div style={{display:"flex",alignItems:"center",gap:8}}>
      <div style={{flex:1,height:6,borderRadius:3,background:"#f0f0f0",overflow:"hidden",position:"relative"}}>
        <div style={{width:`${(pct||0)*100}%`,height:"100%",background:color,borderRadius:3,opacity:0.3}}/>
        {lower!==null&&<div style={{position:"absolute",top:0,left:0,width:`${lower*100}%`,height:"100%",background:color,borderRadius:3}}/>}
      </div>
      <span style={{fontSize:12,color,minWidth:120,textAlign:"right"}}>
        {!hasData?`${total} (mín. ${MIN_SAMPLE})`:`${Math.round((pct||0)*100)}% bruto · ${Math.round((lower||0)*100)}% conf. (${total}j)`}
      </span>
    </div>
  );
}

// ─── APP ROOT ────────────────────────────────────────────────────────────────
export default function App(){
  const[user,setUser]=useState(null);
  const[screen,setScreen]=useState("login");
  if(!user){
    if(screen==="cadastro")return<CadastroScreen onBack={()=>setScreen("login")}/>;
    return<LoginScreen onLogin={setUser} onCadastro={()=>setScreen("cadastro")}/>;
  }
  return<MainApp user={user} onLogout={()=>{setUser(null);setScreen("login");}}/>;
}

// ─── LOGIN ───────────────────────────────────────────────────────────────────
function LoginScreen({onLogin,onCadastro}){
  const[username,setUsername]=useState("");
  const[password,setPassword]=useState("");
  const[error,setError]=useState("");
  const[loading,setLoading]=useState(false);
  const handleLogin=async()=>{
    if(!username||!password){setError("Preencha usuário e senha.");return;}
    setLoading(true);
    const{data,error:err}=await supabase.from("usuarios").select("*").eq("username",username.toLowerCase()).eq("password",password).single();
    setLoading(false);
    if(err||!data){setError("Usuário ou senha incorretos.");return;}
    if(data.status==="ativo"&&data.data_vencimento&&diasRestantes(data.data_vencimento)<=0){
      await supabase.from("usuarios").update({status:"vencido"}).eq("id",data.id);
      data.status="vencido";
    }
    if(data.status==="pendente"){setError("Cadastro aguardando aprovação do administrador.");return;}
    if(data.status==="inativo"){setError("Acesso suspenso. Entre em contato com o administrador.");return;}
    if(data.status==="vencido"){setError("⚠️ Seu acesso venceu! Realize o pagamento e entre em contato com o administrador para liberar.");return;}
    onLogin(data);
  };
  return(
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",padding:24,background:"#f5f5f5"}}>
      <div style={{width:"100%",maxWidth:380}}>
        <div style={{textAlign:"center",marginBottom:28}}>
          <div style={{fontSize:44,marginBottom:8}}>🎾</div>
          <h1 style={{fontSize:24,fontWeight:700,color:"#1a1a1a",margin:0}}>Tennis Trader</h1>
          <p style={{fontSize:13,color:"#6b7280",marginTop:6}}>Sistema de recomendação esportiva</p>
        </div>
        <div style={{...s.card,display:"flex",flexDirection:"column",gap:14}}>
          <div><label style={s.label}>Usuário</label>
            <input value={username} onChange={e=>setUsername(e.target.value)} placeholder="seu usuário"
              style={{width:"100%",boxSizing:"border-box"}} onKeyDown={e=>e.key==="Enter"&&handleLogin()}/></div>
          <div><label style={s.label}>Senha</label>
            <input type="password" value={password} onChange={e=>setPassword(e.target.value)}
              style={{width:"100%",boxSizing:"border-box"}} onKeyDown={e=>e.key==="Enter"&&handleLogin()}/></div>
          {error&&<div style={{fontSize:13,color:error.includes("venceu")?"#7a5a10":"#c02020",background:error.includes("venceu")?"#fef9c3":"#fef2f2",padding:"10px 12px",borderRadius:8,lineHeight:1.5}}>{error}</div>}
          <button onClick={handleLogin} disabled={loading} style={{padding:"10px 0",width:"100%",fontSize:14,fontWeight:500,cursor:"pointer"}}>
            {loading?"Entrando...":"Entrar"}</button>
          <div style={{textAlign:"center",borderTop:"1px solid #f0f0f0",paddingTop:14}}>
            <span style={{fontSize:13,color:"#6b7280"}}>Não tem conta? </span>
            <button onClick={onCadastro} style={{background:"none",border:"none",color:"#2d6a4f",fontSize:13,fontWeight:600,cursor:"pointer",padding:0}}>Cadastre-se</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── CADASTRO ────────────────────────────────────────────────────────────────
function CadastroScreen({onBack}){
  const[form,setForm]=useState({nome:"",telefone:"",email:"",username:"",password:"",confirm:""});
  const[error,setError]=useState("");
  const[success,setSuccess]=useState(false);
  const[loading,setLoading]=useState(false);
  const setF=(k,v)=>setForm(f=>({...f,[k]:v}));
  const handleCadastro=async()=>{
    if(!form.nome||!form.telefone||!form.email||!form.username||!form.password){setError("Preencha todos os campos.");return;}
    if(form.password!==form.confirm){setError("As senhas não coincidem.");return;}
    if(form.password.length<6){setError("A senha deve ter pelo menos 6 caracteres.");return;}
    setLoading(true);
    const{data:existing}=await supabase.from("usuarios").select("id").eq("username",form.username.toLowerCase()).single();
    if(existing){setError("Esse nome de usuário já está em uso.");setLoading(false);return;}
    const{error:err}=await supabase.from("usuarios").insert({
      username:form.username.toLowerCase(),password:form.password,
      email:form.email,telefone:form.telefone,role:"user",status:"pendente",
      data_cadastro:new Date().toISOString(),observacao:form.nome
    });
    setLoading(false);
    if(err){setError("Erro ao cadastrar. Tente novamente.");return;}
    setSuccess(true);
  };
  if(success)return(
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",padding:24,background:"#f5f5f5"}}>
      <div style={{...s.card,maxWidth:400,width:"100%",textAlign:"center",padding:36}}>
        <div style={{fontSize:52,marginBottom:12}}>✅</div>
        <h2 style={{margin:"0 0 10px",color:"#1a5c38",fontSize:20}}>Cadastro realizado!</h2>
        <p style={{color:"#6b7280",fontSize:14,lineHeight:1.6,margin:"0 0 24px"}}>Seu cadastro foi enviado e está aguardando aprovação.<br/>Você receberá acesso assim que o pagamento for confirmado.</p>
        <button onClick={onBack} style={{padding:"10px 24px",cursor:"pointer",fontWeight:500}}>Voltar ao login</button>
      </div>
    </div>
  );
  return(
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",padding:24,background:"#f5f5f5"}}>
      <div style={{width:"100%",maxWidth:400}}>
        <div style={{textAlign:"center",marginBottom:24}}>
          <div style={{fontSize:40,marginBottom:6}}>🎾</div>
          <h1 style={{fontSize:22,fontWeight:700,margin:0}}>Criar conta</h1>
          <p style={{fontSize:13,color:"#6b7280",marginTop:4}}>Tennis Trader</p>
        </div>
        <div style={{...s.card,display:"flex",flexDirection:"column",gap:12}}>
          <div style={s.grid2}>
            <div><label style={s.label}>Nome completo</label><input value={form.nome} onChange={e=>setF("nome",e.target.value)} placeholder="Seu nome" style={{width:"100%",boxSizing:"border-box"}}/></div>
            <div><label style={s.label}>Telefone / WhatsApp</label><input value={form.telefone} onChange={e=>setF("telefone",e.target.value)} placeholder="(21) 99999-9999" style={{width:"100%",boxSizing:"border-box"}}/></div>
          </div>
          <div><label style={s.label}>Email</label><input type="email" value={form.email} onChange={e=>setF("email",e.target.value)} placeholder="seu@email.com" style={{width:"100%",boxSizing:"border-box"}}/></div>
          <div><label style={s.label}>Usuário (para login)</label><input value={form.username} onChange={e=>setF("username",e.target.value)} placeholder="sem espaços" style={{width:"100%",boxSizing:"border-box"}}/></div>
          <div style={s.grid2}>
            <div><label style={s.label}>Senha</label><input type="password" value={form.password} onChange={e=>setF("password",e.target.value)} placeholder="mín. 6 caracteres" style={{width:"100%",boxSizing:"border-box"}}/></div>
            <div><label style={s.label}>Confirmar senha</label><input type="password" value={form.confirm} onChange={e=>setF("confirm",e.target.value)} placeholder="repita" style={{width:"100%",boxSizing:"border-box"}}/></div>
          </div>
          {error&&<p style={{margin:0,fontSize:12,color:"#c02020",background:"#fef2f2",padding:"8px 12px",borderRadius:8}}>{error}</p>}
          <button onClick={handleCadastro} disabled={loading} style={{padding:"10px 0",width:"100%",fontSize:14,fontWeight:500,cursor:"pointer",marginTop:4}}>{loading?"Cadastrando...":"Criar conta"}</button>
          <div style={{textAlign:"center"}}><button onClick={onBack} style={{background:"none",border:"none",color:"#6b7280",fontSize:13,cursor:"pointer"}}>← Voltar ao login</button></div>
        </div>
      </div>
    </div>
  );
}

// ─── MAIN APP ────────────────────────────────────────────────────────────────
function MainApp({user,onLogout}){
  const isAdmin=user.role==="admin";
  const[tab,setTab]=useState("consulta");
  const tabs=isAdmin?["consulta","historico","usuarios","stats"]:["consulta"];
  const dias=diasRestantes(user.data_vencimento);
  return(
    <div style={{maxWidth:720,margin:"0 auto",padding:"20px 16px",background:"#f5f5f5",minHeight:"100vh"}}>
      {!isAdmin&&dias!==null&&dias<=5&&dias>0&&(
        <div style={{background:"#fef9c3",border:"1px solid #e4c24a",borderRadius:10,padding:"10px 16px",marginBottom:14,fontSize:13,color:"#7a5a10"}}>
          ⚠️ Seu acesso vence em <strong>{dias} dia{dias!==1?"s":""}</strong>. Realize o pagamento para não perder o acesso.
        </div>
      )}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20,flexWrap:"wrap",gap:8}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:22}}>🎾</span>
          <div>
            <div style={{fontSize:15,fontWeight:600}}>{isAdmin?"Tennis Trader — Admin":"Tennis Trader"}</div>
            <div style={{fontSize:11,color:"#6b7280"}}>{user.observacao||user.username}</div>
          </div>
        </div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          {tabs.map(t=>(
            <button key={t} onClick={()=>setTab(t)} style={{fontSize:12,padding:"5px 12px",cursor:"pointer",background:tab===t?"#2d6a4f":"#fff",color:tab===t?"#fff":"#444",border:`1px solid ${tab===t?"#2d6a4f":"#ddd"}`}}>
              {t==="consulta"?"Consulta":t==="historico"?"Histórico":t==="usuarios"?"Usuários":"Stats"}
            </button>
          ))}
          <button onClick={onLogout} style={{fontSize:12,padding:"5px 12px",background:"#fff",color:"#6b7280",border:"1px solid #ddd",cursor:"pointer"}}>Sair</button>
        </div>
      </div>
      {tab==="consulta"&&<ConsultaTab user={user}/>}
      {tab==="historico"&&isAdmin&&<HistoricoTab/>}
      {tab==="usuarios"&&isAdmin&&<UsuariosTab/>}
      {tab==="stats"&&isAdmin&&<StatsTab/>}
    </div>
  );
}

// ─── CONSULTA ────────────────────────────────────────────────────────────────
function ConsultaTab({user}){
  const isAdmin=user.role==="admin";
  const[form,setForm]=useState({quebrou:"15",sac1:"0",sac2:"0",set_:"1",quebrador:"0",sacador:"0",odd:""});
  const[result,setResult]=useState(null);
  const[loading,setLoading]=useState(false);
  const[statusInput,setStatusInput]=useState("GREEN");
  const[saved,setSaved]=useState(false);
  const[saving,setSaving]=useState(false);
  const setF=useCallback((k,v)=>setForm(f=>({...f,[k]:v})),[]);

  const handleAnalyze=useCallback(async()=>{
    setLoading(true);setResult(null);setSaved(false);
    const c1key=buildC1Key(form.quebrou,form.sac1,form.sac2);
    const c2key=buildC2Key(form.set_,form.quebrador,form.sacador);
    const[r1,r2]=await Promise.all([
      supabase.from("cenario1").select("*").eq("chave",c1key).single(),
      supabase.from("cenario2").select("*").eq("chave",c2key).single(),
    ]);
    const calc=calcResult(form,r1.data||null,r2.data||null);
    setResult({...calc,c1key,c2key,c1Entry:r1.data||null,c2Entry:r2.data||null});
    setLoading(false);
  },[form]);

  useEffect(()=>{
    const handler=(e)=>{if(e.key==="Enter"&&!loading)handleAnalyze();};
    window.addEventListener("keydown",handler);
    return()=>window.removeEventListener("keydown",handler);
  },[handleAnalyze,loading]);

  const handleSave=async()=>{
    if(!result||!isAdmin||saved)return;
    setSaving(true);
    const isGreen=statusInput==="GREEN";
    if(result.c1Entry){await supabase.from("cenario1").update({total:result.c1Entry.total+1,green:result.c1Entry.green+(isGreen?1:0)}).eq("chave",result.c1key);}
    else{await supabase.from("cenario1").insert({chave:result.c1key,total:1,green:isGreen?1:0});}
    if(result.c2Entry){await supabase.from("cenario2").update({total:result.c2Entry.total+1,green:result.c2Entry.green+(isGreen?1:0)}).eq("chave",result.c2key);}
    else{await supabase.from("cenario2").insert({chave:result.c2key,total:1,green:isGreen?1:0});}
    await supabase.from("historico").insert({
      quebrou:form.quebrou,sac1:form.sac1,sac2:form.sac2,set_:form.set_,
      quebrador:form.quebrador,sacador:form.sacador,odd:parseFloat(form.odd)||null,
      chave_c1:result.c1key,chave_c2:result.c2key,recomendacao:result.final,status:statusInput
    });
    setSaving(false);setSaved(true);
  };

  return(
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      <div style={s.card}>
        <div style={{background:"#f8fafc",borderRadius:10,padding:16,marginBottom:12}}>
          <div style={{fontSize:12,fontWeight:700,color:"#374151",marginBottom:12,textTransform:"uppercase",letterSpacing:0.5}}>🎯 Padrão de quebra</div>
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <QuickSelect label="Pontuação da quebra" options={SCORE_OPTIONS} value={form.quebrou} onChange={v=>setF("quebrou",v)} color="#b45309"/>
            <QuickSelect label="Último game sacando" options={SCORE_OPTIONS} value={form.sac1} onChange={v=>setF("sac1",v)} color="#2d6a4f"/>
            <QuickSelect label="Penúltimo game sacando" options={SCORE_OPTIONS} value={form.sac2} onChange={v=>setF("sac2",v)} color="#2d6a4f"/>
          </div>
        </div>
        <div style={{background:"#f8fafc",borderRadius:10,padding:16,marginBottom:12}}>
          <div style={{fontSize:12,fontWeight:700,color:"#374151",marginBottom:12,textTransform:"uppercase",letterSpacing:0.5}}>📊 Placar atual</div>
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <QuickSelect label="Set" options={SET_OPTIONS} value={form.set_} onChange={v=>setF("set_",v)} color="#6d28d9"/>
            <div style={{display:"flex",gap:16,flexWrap:"wrap"}}>
              <div style={{flex:1}}><QuickSelect label="Games do Quebrador" options={GAME_OPTIONS} value={form.quebrador} onChange={v=>setF("quebrador",v)} color="#b45309"/></div>
              <div style={{flex:1}}><QuickSelect label="Games do Sacador" options={GAME_OPTIONS} value={form.sacador} onChange={v=>setF("sacador",v)} color="#1e40af"/></div>
            </div>
          </div>
        </div>
        <div style={{background:"#f8fafc",borderRadius:10,padding:16,marginBottom:16}}>
          <div style={{fontSize:12,fontWeight:700,color:"#374151",marginBottom:8,textTransform:"uppercase",letterSpacing:0.5}}>💰 Odd do mercado</div>
          <input type="number" step="0.01" min="1" value={form.odd} onChange={e=>setF("odd",e.target.value)}
            placeholder="ex: 1.55  (pressione Enter para analisar)"
            style={{width:"100%",boxSizing:"border-box",fontSize:16,padding:"10px 14px",borderRadius:8,border:"2px solid #e5e7eb"}}/>
          <div style={{fontSize:11,color:"#9ca3af",marginTop:6}}>💡 Pressione <strong>Enter</strong> para analisar rapidamente</div>
        </div>
        <button onClick={handleAnalyze} disabled={loading} style={{width:"100%",padding:"12px 0",fontSize:15,fontWeight:600,cursor:"pointer",borderRadius:10,background:"#2d6a4f",color:"#fff",border:"none"}}>
          {loading?"Analisando...":"⚡ Analisar jogo (Enter)"}
        </button>
      </div>

      {result&&<>
        <ResultCard result={result} odd={form.odd}/>
        <div style={s.card}>
          <h3 style={{margin:"0 0 14px",fontSize:13,fontWeight:600,color:"#6b7280"}}>ANÁLISE DAS 3 REGRAS</h3>
          <RuleRow num={1} label={`Quebra: ${form.quebrou} · Sac1: ${form.sac1} · Sac2: ${form.sac2}`} chave={result.c1key} entry={result.c1Entry} pct={result.c1pct} rec={result.rec1}/>
          <RuleRow num={2} label={`${form.set_}º set · Quebrador: ${form.quebrador} · Sacador: ${form.sacador}`} chave={result.c2key} entry={result.c2Entry} pct={result.c2pct} rec={result.rec2}/>
          <div style={{display:"flex",alignItems:"flex-start",gap:12,paddingTop:12}}>
            <NumCircle n={3}/>
            <div style={{flex:1}}>
              <p style={{fontSize:13,margin:"0 0 4px"}}>
                Faixa da odd: <strong>{form.odd||"—"}</strong>
                {result.oddProb&&<span style={{marginLeft:8,fontSize:12,color:"#6b7280"}}>→ prob. implícita: <strong style={{color:"#1e40af"}}>{Math.round(result.oddProb*100)}%</strong></span>}
              </p>
              <p style={{fontSize:11,color:"#9ca3af",margin:"0 0 6px"}}>1.40–1.68=REC · 1.69–1.80=NEUTRO · fora=NÃO REC</p>
              <RecBadge rec={result.rec3}/>
            </div>
          </div>
        </div>
        {isAdmin&&(
          <div style={s.card}>
            <h3 style={{margin:"0 0 12px",fontSize:13,fontWeight:600,color:"#6b7280"}}>SALVAR RESULTADO (Admin)</h3>
            <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
              <span style={{fontSize:13}}>O jogo foi:</span>
              {["GREEN","RED"].map(v=>(
                <button key={v} onClick={()=>setStatusInput(v)} style={{
                  padding:"6px 16px",fontSize:13,fontWeight:500,cursor:"pointer",
                  background:statusInput===v?(v==="GREEN"?"#d4f7e3":"#fde8e8"):"#fff",
                  color:statusInput===v?(v==="GREEN"?"#1a6640":"#8b2020"):"#666",
                  border:`1px solid ${statusInput===v?(v==="GREEN"?"#5cb87a":"#e47a7a"):"#ddd"}`
                }}>{v==="GREEN"?"✅ GREEN":"❌ RED"}</button>
              ))}
              <button onClick={handleSave} disabled={saved||saving} style={{marginLeft:"auto",padding:"6px 18px",fontSize:13,fontWeight:500,cursor:saved?"default":"pointer",background:saved?"#d4f7e3":"#2d6a4f",color:saved?"#1a6640":"#fff",border:"none",borderRadius:7}}>
                {saving?"Salvando...":saved?"Salvo ✓":"Salvar na base →"}
              </button>
            </div>
          </div>
        )}
      </>}
    </div>
  );
}

function ResultCard({result, odd}){
  const c={
    "RECOMENDADO":{bg:"#e8f9ef",border:"#2d7d4f",color:"#1a5c38",emoji:"✅"},
    "NEUTRO":{bg:"#fffbeb",border:"#d97706",color:"#7a5a10",emoji:"⚠️"},
    "NÃO RECOMENDADO":{bg:"#fef2f2",border:"#dc2626",color:"#8b2020",emoji:"❌"},
  }[result.final]||{bg:"#f9fafb",border:"#ddd",color:"#6b7280",emoji:"❓"};

  const ev = result.ev;
  const prob = result.probCombinada;
  const evColor = ev===null?null:ev>0?"#1a6640":"#8b2020";
  const evBg = ev===null?null:ev>0?"#d4f7e3":"#fde8e8";

  return(
    <div style={{background:c.bg,border:`2px solid ${c.border}`,borderRadius:14,padding:24}}>
      <div style={{textAlign:"center",marginBottom:16}}>
        <div style={{fontSize:40,marginBottom:6}}>{c.emoji}</div>
        <div style={{fontSize:26,fontWeight:700,color:c.color}}>{result.final||"DADOS INSUFICIENTES"}</div>
        {!result.rec1&&<div style={{fontSize:12,color:"#9ca3af",marginTop:4}}>Cenário 1 sem histórico suficiente (mín. {MIN_SAMPLE})</div>}
        {!result.rec2&&<div style={{fontSize:12,color:"#9ca3af",marginTop:2}}>Cenário 2 sem histórico suficiente</div>}
      </div>

      {(prob!==null||ev!==null)&&(
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,borderTop:`1px solid ${c.border}`,paddingTop:14}}>
          {prob!==null&&(
            <div style={{background:"rgba(255,255,255,0.7)",borderRadius:10,padding:"12px 14px",textAlign:"center"}}>
              <div style={{fontSize:11,color:"#6b7280",marginBottom:4,fontWeight:600,textTransform:"uppercase"}}>📊 Prob. combinada</div>
              <div style={{fontSize:28,fontWeight:700,color:c.color}}>{Math.round(prob*100)}%</div>
              <div style={{fontSize:11,color:"#9ca3af",marginTop:2}}>C1 40% + C2 40% + Odd 20%</div>
            </div>
          )}
          {ev!==null&&(
            <div style={{background:evBg||"rgba(255,255,255,0.7)",borderRadius:10,padding:"12px 14px",textAlign:"center"}}>
              <div style={{fontSize:11,color:"#6b7280",marginBottom:4,fontWeight:600,textTransform:"uppercase"}}>💹 Valor Esperado (EV)</div>
              <div style={{fontSize:28,fontWeight:700,color:evColor||c.color}}>{ev>0?"+":""}{(ev*100).toFixed(1)}%</div>
              <div style={{fontSize:11,color:"#9ca3af",marginTop:2}}>{ev>0?"✅ EV Positivo — entrada com valor":"❌ EV Negativo — sem vantagem"}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function NumCircle({n}){
  return<span style={{minWidth:24,height:24,borderRadius:"50%",background:"#f3f4f6",display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:600,color:"#6b7280",flexShrink:0,marginTop:2}}>{n}</span>;
}
function RuleRow({num,label,chave,entry,pct,rec}){
  return(
    <div style={{display:"flex",alignItems:"flex-start",gap:12,paddingBottom:12,marginBottom:12,borderBottom:"1px solid #f0f0f0"}}>
      <NumCircle n={num}/>
      <div style={{flex:1}}>
        <p style={{fontSize:13,margin:"0 0 6px"}}>{label}<span style={{fontSize:11,color:"#9ca3af",marginLeft:8}}>chave: <code>{chave}</code></span></p>
        <StatBar pct={pct} total={entry?.total}/>
        <div style={{marginTop:6}}><RecBadge rec={rec}/></div>
      </div>
    </div>
  );
}

// ─── USUÁRIOS ────────────────────────────────────────────────────────────────
function UsuariosTab(){
  const[users,setUsers]=useState([]);
  const[loading,setLoading]=useState(true);
  const[filter,setFilter]=useState("todos");
  const loadUsers=async()=>{
    const{data}=await supabase.from("usuarios").select("*").neq("role","admin").order("data_cadastro",{ascending:false});
    const now=new Date();
    const toUpdate=(data||[]).filter(u=>u.status==="ativo"&&u.data_vencimento&&new Date(u.data_vencimento)<now);
    for(const u of toUpdate){await supabase.from("usuarios").update({status:"vencido"}).eq("id",u.id);u.status="vencido";}
    setUsers(data||[]);setLoading(false);
  };
  useEffect(()=>{loadUsers();},[]);
  const liberarAcesso=async(id)=>{
    const agora=new Date();const vencimento=new Date(agora);vencimento.setDate(vencimento.getDate()+DIAS_MENSALIDADE);
    await supabase.from("usuarios").update({status:"ativo",data_pagamento:agora.toISOString(),data_vencimento:vencimento.toISOString()}).eq("id",id);
    loadUsers();
  };
  const suspender=async(id)=>{await supabase.from("usuarios").update({status:"inativo"}).eq("id",id);loadUsers();};
  const statusConfig={"pendente":{bg:"#fef9c3",color:"#7a5a10",label:"⏳ Pendente"},"ativo":{bg:"#d4f7e3",color:"#1a6640",label:"✅ Ativo"},"vencido":{bg:"#fde8e8",color:"#8b2020",label:"🔴 Vencido"},"inativo":{bg:"#f3f4f6",color:"#6b7280",label:"⛔ Inativo"}};
  const counts={pendente:users.filter(u=>u.status==="pendente").length,ativo:users.filter(u=>u.status==="ativo").length,vencido:users.filter(u=>u.status==="vencido").length,inativo:users.filter(u=>u.status==="inativo").length};
  const filtered=filter==="todos"?users:users.filter(u=>u.status===filter);
  if(loading)return<div style={{textAlign:"center",padding:40,color:"#6b7280"}}>Carregando...</div>;
  return(
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:10}}>
        {[["⏳","Pendentes",counts.pendente,"#fef9c3","#7a5a10"],["✅","Ativos",counts.ativo,"#d4f7e3","#1a6640"],["🔴","Vencidos",counts.vencido,"#fde8e8","#8b2020"],["⛔","Inativos",counts.inativo,"#f3f4f6","#6b7280"]].map(([e,l,v,bg,c])=>(
          <div key={l} style={{background:bg,borderRadius:10,padding:"12px 14px"}}>
            <div style={{fontSize:11,color:c,marginBottom:2}}>{e} {l}</div>
            <div style={{fontSize:22,fontWeight:700,color:c}}>{v}</div>
          </div>
        ))}
      </div>
      <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
        {["todos","pendente","ativo","vencido","inativo"].map(f=>(
          <button key={f} onClick={()=>setFilter(f)} style={{fontSize:12,padding:"5px 12px",cursor:"pointer",background:filter===f?"#2d6a4f":"#fff",color:filter===f?"#fff":"#444",border:`1px solid ${filter===f?"#2d6a4f":"#ddd"}`}}>
            {f.charAt(0).toUpperCase()+f.slice(1)}{f!=="todos"?` (${counts[f]||0})`:""}
          </button>
        ))}
      </div>
      {filtered.length===0&&<div style={{textAlign:"center",padding:30,color:"#9ca3af",background:"#fff",borderRadius:12}}>Nenhum usuário nessa categoria.</div>}
      {filtered.map(u=>{
        const sc=statusConfig[u.status]||{};const dias=diasRestantes(u.data_vencimento);
        return(
          <div key={u.id} style={s.card}>
            <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
              <div style={{flex:1,minWidth:200}}>
                <div style={{fontWeight:600,fontSize:15}}>{u.observacao||u.username}</div>
                <div style={{fontSize:12,color:"#6b7280",marginTop:3,display:"flex",gap:12,flexWrap:"wrap"}}>
                  <span>👤 @{u.username}</span>{u.email&&<span>✉️ {u.email}</span>}{u.telefone&&<span>📱 {u.telefone}</span>}
                </div>
                <div style={{fontSize:11,color:"#9ca3af",marginTop:4,display:"flex",gap:12,flexWrap:"wrap"}}>
                  <span>Cadastro: {u.data_cadastro?new Date(u.data_cadastro).toLocaleDateString("pt-BR"):"—"}</span>
                  {u.data_pagamento&&<span>Último pagto: {new Date(u.data_pagamento).toLocaleDateString("pt-BR")}</span>}
                  {u.data_vencimento&&<span style={{color:dias!==null&&dias<=5?"#c02020":"#9ca3af",fontWeight:dias!==null&&dias<=3?600:400}}>
                    Vence: {new Date(u.data_vencimento).toLocaleDateString("pt-BR")}
                    {dias!==null&&dias>0&&` (${dias}d)`}{dias!==null&&dias<=0&&" ⚠️ VENCIDO"}
                  </span>}
                </div>
              </div>
              <span style={{fontSize:12,fontWeight:600,padding:"4px 10px",borderRadius:6,background:sc.bg,color:sc.color,whiteSpace:"nowrap"}}>{sc.label}</span>
            </div>
            <div style={{display:"flex",gap:8,marginTop:12,flexWrap:"wrap"}}>
              <button onClick={()=>liberarAcesso(u.id)} style={{fontSize:12,padding:"6px 14px",cursor:"pointer",background:"#d4f7e3",color:"#1a6640",border:"1px solid #5cb87a",borderRadius:7,fontWeight:500}}>✅ {u.status==="ativo"?"Renovar 30 dias":"Liberar acesso"}</button>
              {u.status!=="inativo"&&<button onClick={()=>suspender(u.id)} style={{fontSize:12,padding:"6px 14px",cursor:"pointer",background:"#fde8e8",color:"#8b2020",border:"1px solid #e47a7a",borderRadius:7,fontWeight:500}}>⛔ Suspender</button>}
              {u.status==="inativo"&&<button onClick={()=>liberarAcesso(u.id)} style={{fontSize:12,padding:"6px 14px",cursor:"pointer",background:"#f3f4f6",color:"#374151",border:"1px solid #ddd",borderRadius:7,fontWeight:500}}>🔄 Reativar</button>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── HISTÓRICO ────────────────────────────────────────────────────────────────
function HistoricoTab(){
  const[history,setHistory]=useState([]);const[loading,setLoading]=useState(true);
  useEffect(()=>{supabase.from("historico").select("*").order("salvo_em",{ascending:false}).limit(100).then(({data})=>{setHistory(data||[]);setLoading(false);});},[]);
  if(loading)return<div style={{textAlign:"center",padding:40,color:"#6b7280"}}>Carregando...</div>;
  if(!history.length)return<div style={{textAlign:"center",padding:40,color:"#6b7280"}}>Nenhum jogo salvo ainda.</div>;
  const greens=history.filter(h=>h.status==="GREEN").length;
  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:14}}>
        <h2 style={{fontSize:15,fontWeight:600,margin:0}}>Histórico</h2>
        <span style={{fontSize:13,color:"#6b7280"}}>{greens}/{history.length} greens ({Math.round(greens/history.length*100)}%)</span>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {history.map(h=>(
          <div key={h.id} style={{...s.card,padding:14,display:"flex",gap:12,alignItems:"center"}}>
            <span style={{fontSize:20}}>{h.status==="GREEN"?"✅":"❌"}</span>
            <div style={{flex:1}}>
              <div style={{fontSize:13,fontWeight:500}}>Quebra {h.quebrou}-{h.sac1}-{h.sac2} · {h.set_}º{h.quebrador}×{h.sacador} · odd {h.odd||"—"}</div>
              <div style={{fontSize:11,color:"#9ca3af",marginTop:2}}>{new Date(h.salvo_em).toLocaleString("pt-BR")}</div>
            </div>
            <RecBadge rec={h.recomendacao}/>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── STATS ────────────────────────────────────────────────────────────────────
function StatsTab(){
  const[c1,setC1]=useState([]);const[c2,setC2]=useState([]);const[loading,setLoading]=useState(true);
  useEffect(()=>{
    Promise.all([
      supabase.from("cenario1").select("*").gte("total",MIN_SAMPLE).order("total",{ascending:false}).limit(20),
      supabase.from("cenario2").select("*").gte("total",MIN_SAMPLE).order("total",{ascending:false}).limit(20),
    ]).then(([r1,r2])=>{setC1(r1.data||[]);setC2(r2.data||[]);setLoading(false);});
  },[]);
  if(loading)return<div style={{textAlign:"center",padding:40,color:"#6b7280"}}>Carregando...</div>;
  return(
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
      <StatsTable title="Top Cenário 1" rows={c1}/>
      <StatsTable title="Top Cenário 2" rows={c2}/>
    </div>
  );
}
function StatsTable({title,rows}){
  return(
    <div style={s.card}>
      <h3 style={{margin:"0 0 12px",fontSize:13,fontWeight:600}}>{title}</h3>
      {rows.map(r=>{
        const pct=r.green/r.total;const lower=wilsonLower(pct,r.total);
        const color=lower>=0.75?"#1a9150":lower>=0.60?"#c47a10":"#c02020";
        return(
          <div key={r.chave} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 0",borderBottom:"1px solid #f5f5f5"}}>
            <code style={{fontSize:11,minWidth:70,color:"#6b7280"}}>{r.chave}</code>
            <div style={{flex:1,height:5,borderRadius:3,background:"#f0f0f0",overflow:"hidden"}}>
              <div style={{width:`${lower*100}%`,height:"100%",background:color,borderRadius:3}}/>
            </div>
            <span style={{fontSize:11,color,minWidth:36,textAlign:"right"}}>{Math.round(lower*100)}%</span>
            <span style={{fontSize:10,color:"#aaa",minWidth:28,textAlign:"right"}}>{r.total}</span>
          </div>
        );
      })}
    </div>
  );
}
