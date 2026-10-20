/* ARAM · Clínica de rehabilitación física — lógica de la aplicación */
(function(){
"use strict";
/* ---------- utilidades ---------- */
const $=s=>document.querySelector(s);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const pad=n=>String(n).padStart(2,"0");
const iso=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const parse=s=>{const[y,m,d]=String(s).split("-").map(Number);return new Date(y,(m||1)-1,d||1)};
const addDays=(d,n)=>{const x=new Date(d);x.setDate(x.getDate()+n);return x};
const startOfWeek=d=>addDays(d,-((d.getDay()+6)%7));
const TODAY=iso(new Date());
const fmt=(s,o)=>parse(s).toLocaleDateString("es-ES",o);
const fLong=s=>fmt(s,{weekday:"long",day:"numeric",month:"long"});
const fShort=s=>fmt(s,{day:"numeric",month:"short",year:"numeric"});
const toMin=h=>{const[a,b]=String(h).split(":").map(Number);return a*60+(b||0)};
const minToH=m=>`${pad(Math.floor(m/60))}:${pad(m%60)}`;
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,8);
const age=n=>{if(!n)return null;const b=parse(n),t=new Date();let a=t.getFullYear()-b.getFullYear();if(t.getMonth()<b.getMonth()||(t.getMonth()===b.getMonth()&&t.getDate()<b.getDate()))a--;return a};
const ESTADOS={programada:"Programada",confirmada:"Confirmada",completada:"Completada",cancelada:"Cancelada",no_asistio:"No asistió"};
const PAGOS={pendiente:"Por cobrar",pagado:"Pagado"};
const CATEGORIAS=["Mantenimiento","Renta","Servicios (luz, agua, internet)","Insumos y material","Equipo","Limpieza","Sueldos y honorarios","Impuestos y trámites","Publicidad","Otros"];
const pill=e=>`<span class="pill st-${esc(e)}">${esc(ESTADOS[e]||e)}</span>`;
const payPill=c=>(+c.monto>0||c.pago==="pagado")?`<span class="pill pay-${c.pago==="pagado"?"pagado":"pendiente"}">${PAGOS[c.pago==="pagado"?"pagado":"pendiente"]}</span>`:"";
const evaColor=v=>v>=7?"var(--bad)":v>=4?"var(--warn)":"var(--ok)";
const evaHTML=v=>{if(v===""||v==null||isNaN(v))return"";v=+v;let b="";for(let i=1;i<=10;i++)b+=`<i class="${i<=v?"on":""}"></i>`;return`<span class="eva" style="--eva-c:${evaColor(v)}" title="Dolor EVA ${v}/10">EVA <span class="eva-bar">${b}</span><b>${v}</b></span>`};
const nombre=p=>p?`${p.nombre||""} ${p.apellidos||""}`.trim():"Paciente eliminado";
const cur=()=>(S.config.moneda||"$");
const money=n=>{n=+n||0;const s=Math.abs(n).toLocaleString("es-MX",{minimumFractionDigits:2,maximumFractionDigits:2});return (n<0?"−":"")+cur()+s};
const cap=s=>s.charAt(0).toUpperCase()+s.slice(1);
let toastT;function toast(m){const t=$("#toast");t.textContent=m;t.hidden=false;clearTimeout(toastT);toastT=setTimeout(()=>t.hidden=true,2600)}

/* ---------- estado ---------- */
const COLS=["pacientes","citas","historial","gastos","ingresos"];
const CAT_ING=["Venta de pomada o medicamento","Venta de material (vendas, fajas, kinesiotape)","Evaluación o consulta a domicilio","Certificado o informe","Otro ingreso"];
const S={mode:"cargando",pacientes:{},citas:{},historial:{},gastos:{},ingresos:{},config:{},
  loaded:{pacientes:false,citas:false,historial:false,gastos:false,ingresos:false,config:false},
  tab:"hoy",sel:null,q:"",filtroPac:"activo",week:iso(startOfWeek(new Date())),fEstado:"todos",
  repP:"mes",repD:TODAY,finP:"mes",finD:TODAY,seeding:false};
let DL=null;

/* ---------- almacenamiento (Supabase) ---------- */
const CFG=window.ARAM_CONFIG||{};
const configurado=!!(CFG.SUPABASE_URL&&CFG.SUPABASE_ANON_KEY&&!/TU-PROYECTO|TU_CLAVE/i.test(CFG.SUPABASE_URL+CFG.SUPABASE_ANON_KEY));
const sb=(configurado&&window.supabase)?window.supabase.createClient(CFG.SUPABASE_URL,CFG.SUPABASE_ANON_KEY,{auth:{persistSession:true,autoRefreshToken:true}}):null;
const snake=k=>k.replace(/[A-Z]/g,m=>"_"+m.toLowerCase());
const camel=k=>k.replace(/_([a-z])/g,(_,c)=>c.toUpperCase());
const SKIP=new Set(["id","creado_en","actualizado_en"]);
function toDb(o){const r={};for(const k in o){if(k==="id")continue;const v=o[k];r[snake(k)]=(v===""||v===undefined)?null:v}return r}
function fromDb(row){const r={};for(const k in row){if(SKIP.has(k))continue;const v=row[k];r[camel(k)]=v===null?"":v}
  if(r.ejemplo==="")r.ejemplo=false;if(!r.ejemplo)delete r.ejemplo;return r}
function fail(e){console.error(e);throw e}
async function put(col,id,data){
  if(col==="config"){const {error}=await sb.from("config").upsert({id:"clinica",...toDb(data)});if(error)fail(error);S.config={...data};schedule();return}
  const {error}=await sb.from(col).upsert({id,...toDb(data)});if(error)fail(error);
  S[col][id]={...data,id};schedule();
}
async function del(col,id){
  const {error}=await sb.from(col).delete().eq("id",id);if(error)fail(error);
  delete S[col][id];schedule();
}
async function putMany(items){
  const order=["config","pacientes","citas","historial","gastos","ingresos"];
  for(const col of order){const rows=items.filter(x=>x.col===col);if(!rows.length)continue;
    if(col==="config"){await put("config","clinica",rows[rows.length-1].data);continue}
    for(let i=0;i<rows.length;i+=400){const chunk=rows.slice(i,i+400);
      const {error}=await sb.from(col).upsert(chunk.map(x=>({id:x.id,...toDb(x.data)})));if(error)fail(error);
      chunk.forEach(x=>{S[col][x.id]={...x.data,id:x.id}})}}
  schedule();
}
async function delMany(items){
  const order=["citas","historial","ingresos","gastos","pacientes"];
  for(const col of order){const ids=items.filter(x=>x.col===col).map(x=>x.id);
    for(let i=0;i<ids.length;i+=200){const chunk=ids.slice(i,i+200);
      const {error}=await sb.from(col).delete().in("id",chunk);if(error)fail(error);
      chunk.forEach(id=>delete S[col][id])}}
  schedule();
}
function writeErr(e){
  const c=e&&String(e.code||"");
  if(c==="42501"||/row-level security|permission/i.test(e&&e.message||""))toast("Tu usuario no tiene permiso. Revisa que tu correo esté en la tabla miembros.");
  else if(c==="23505")toast("Ya existe un registro con ese identificador.");
  else if(c==="23503")toast("El registro está ligado a un paciente que ya no existe.");
  else if(/JWT|session/i.test(e&&e.message||""))toast("Tu sesión expiró. Vuelve a iniciar sesión.");
  else toast("No se pudo guardar. Revisa tu conexión e inténtalo de nuevo.");
}
async function fetchAll(table){
  const out=[];const size=1000;
  for(let from=0;;from+=size){
    const {data,error}=await sb.from(table).select("*").order("id").range(from,from+size-1);
    if(error)throw error;out.push(...data);if(data.length<size)break}
  return out;
}
async function loadAll(){
  const res=await Promise.all(COLS.map(fetchAll));
  COLS.forEach((c,i)=>{const m={};res[i].forEach(row=>{m[row.id]={...fromDb(row),id:row.id}});S[c]=m});
  const {data:cfg,error}=await sb.from("config").select("*").eq("id","clinica").maybeSingle();if(error)throw error;
  S.config=cfg?fromDb(cfg):{};
  Object.keys(S.loaded).forEach(k=>S.loaded[k]=true);
  if(S.sel&&!S.pacientes[S.sel])S.sel=null;
}
let canal=null;
function suscribir(){
  if(canal)sb.removeChannel(canal);
  canal=sb.channel("aram-cambios");
  [...COLS,"config"].forEach(t=>{
    canal.on("postgres_changes",{event:"*",schema:"public",table:t},p=>{
      if(t==="config"){if(p.new&&p.new.id==="clinica")S.config=fromDb(p.new);schedule();return}
      if(p.eventType==="DELETE"){if(p.old&&p.old.id)delete S[t][p.old.id]}
      else if(p.new&&p.new.id)S[t][p.new.id]={...fromDb(p.new),id:p.new.id};
      if(S.sel&&!S.pacientes[S.sel])S.sel=null;schedule();
    });
  });
  canal.subscribe();
}

/* ---------- datos de ejemplo ---------- */
const SAMPLE_CFG={fisioterapeuta:"Lic. Andrea Morales",precioSesion:40,moneda:"$"};
function sampleData(){
  let seed=7;const rnd=()=>(seed=(seed*16807)%2147483647)/2147483647;const pick=a=>a[Math.floor(rnd()*a.length)];
  const ter=SAMPLE_CFG.fisioterapeuta,precio=SAMPLE_CFG.precioSesion;
  const base=[
    ["María Fernanda","López Ruiz","1987-03-14","Femenino","Docente","Lumbalgia mecánica crónica","Columna / lumbar",12,"Ninguna conocida","Hernia discal L4-L5 diagnosticada en 2022.","Ibuprofeno 400 mg según dolor"],
    ["Jorge","Castillo Peña","1979-11-02","Masculino","Ingeniero civil","Postoperatorio de reconstrucción de LCA rodilla derecha","Rehabilitación de rodilla",20,"Penicilina","Artroscopia de rodilla derecha (agosto 2026).","Paracetamol 500 mg"],
    ["Lucía","Herrera Soto","1994-06-21","Femenino","Diseñadora","Tendinopatía del manguito rotador, hombro derecho","Hombro",10,"Ninguna conocida","Sin antecedentes relevantes.",""],
    ["Roberto","Mendoza Díaz","1958-01-30","Masculino","Jubilado","Secuela de ACV con hemiparesia izquierda","Neurológica",24,"Sulfas","Hipertensión arterial, ACV isquémico (2025).","Losartán 50 mg, aspirina 100 mg"],
    ["Valentina","Ortiz Gómez","2009-09-12","Femenino","Estudiante","Esguince de tobillo izquierdo grado II","Deportiva",8,"Ninguna conocida","Esguinces previos del mismo tobillo.",""],
    ["Daniel","Rojas Fuentes","1990-04-08","Masculino","Repartidor","Cervicalgia con contractura del trapecio","Fisioterapia general",8,"Ninguna conocida","",""],
    ["Carmen","Silva Navarro","1965-12-17","Femenino","Contadora","Artrosis de cadera derecha","Hidroterapia",15,"AINEs","Diabetes tipo 2 controlada.","Metformina 850 mg"],
    ["Andrés","Paredes León","1983-07-25","Masculino","Chef","Epicondilitis lateral codo derecho","Electroterapia",10,"Ninguna conocida","",""]
  ];
  const pac={},citas={},hist={},gastos={};const busy={};
  const free=(f,s,e)=>!(busy[f]||[]).some(([a,b])=>s<b&&a<e);
  base.forEach((b,i)=>{
    const id="ej-p"+(i+1);const start=addDays(new Date(),-Math.floor(15+rnd()*120));
    pac[id]={nombre:b[0],apellidos:b[1],nacimiento:b[2],sexo:b[3],ocupacion:b[4],diagnostico:b[5],sesionesPrescritas:b[7],alergias:b[8],antecedentes:b[9],medicamentos:b[10],
      documento:String(10000000+Math.floor(rnd()*89999999)),telefono:"+1 206 555 0"+pad(10+i*7),email:b[0].split(" ")[0].toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"")+"@ejemplo.com",
      direccion:"",contactoEmergencia:"",telEmergencia:"",aseguradora:pick(["Particular","Seguro Salud Plus","MediSeguro"]),medicoReferente:pick(["Dr. Pablo Núñez (Traumatología)","Dra. Elena Ríos (Neurología)","Dr. Tomás Ibarra (Medicina general)"]),
      estado:"activo",creado:iso(start),notas:"Registro de ejemplo.",ejemplo:true};
    const tipo=b[6];let d=new Date(start);let n=0;let eva=6+Math.floor(rnd()*3);const dur=i===3?90:60;
    while(n<b[7]){
      const f=iso(d);let h=8+Math.floor(rnd()*10),tries=0;while(!free(f,h*60,h*60+dur)&&tries<12){h=h>=18?8:h+1;tries++}
      if(tries>=12){d=addDays(d,1);continue}
      (busy[f]=busy[f]||[]).push([h*60,h*60+dur]);
      const past=f<TODAY;const r=rnd();
      const estado=past?(r<.8?"completada":r<.9?"cancelada":"no_asistio"):(f===TODAY&&h<new Date().getHours()?"completada":(r<.5?"confirmada":"programada"));
      const pagado=estado==="completada"&&rnd()<.88;
      citas["ej-c"+(i+1)+"-"+n]={pacienteId:id,fecha:f,hora:pad(h)+":00",duracion:dur,terapeuta:ter,tipo,estado,
        monto:(estado==="cancelada"||estado==="no_asistio")?0:(dur===90?60:precio),pago:pagado?"pagado":"pendiente",metodo:pagado?pick(["Efectivo","Tarjeta","Transferencia","Efectivo"]):"",
        notas:estado==="cancelada"?"Canceló por motivos personales.":"",ejemplo:true};
      if(estado==="completada"&&(n===0||n%3===0)){
        hist["ej-h"+(i+1)+"-"+n]={pacienteId:id,fecha:f,terapeuta:ter,tipo:n===0?"Evaluación inicial":"Nota de sesión",eva,
          motivo:n===0?"Refiere dolor al realizar actividades de la vida diaria.":"Refiere mejoría progresiva.",
          hallazgos:n===0?"Limitación del rango de movimiento y debilidad muscular en la zona afectada.":"Mejora del rango de movimiento respecto a la sesión anterior.",
          tratamiento:pick(["Terapia manual, TENS 15 min, ejercicios de fortalecimiento.","Movilización articular, ultrasonido terapéutico, estiramientos.","Ejercicios propioceptivos, crioterapia, kinesiotape."]),
          plan:"Continuar con ejercicios en casa 2 veces al día.",ejemplo:true};
        eva=Math.max(1,eva-1-Math.floor(rnd()*2));
      }
      n++;d=addDays(d,n%2?3:4);if(iso(d)>iso(addDays(new Date(),21)))break;
    }
  });
  const now=new Date();let g=0;
  const addG=(f,concepto,categoria,monto,metodo,proveedor)=>{if(f>TODAY)return;gastos["ej-g"+(g++)]={fecha:f,concepto,categoria,monto:Math.round(monto*100)/100,metodo,proveedor:proveedor||"",notas:"",ejemplo:true}};
  for(let m=5;m>=0;m--){
    const y=now.getFullYear(),mo=now.getMonth()-m;const day=k=>iso(new Date(y,mo,k));
    addG(day(1),"Renta del local","Renta",650,"Transferencia","Inmobiliaria Centro");
    addG(day(5),"Recibo de luz","Servicios (luz, agua, internet)",55+rnd()*35,"Tarjeta","Compañía eléctrica");
    addG(day(7),"Internet y teléfono","Servicios (luz, agua, internet)",42,"Tarjeta","Proveedor de internet");
    addG(day(9),"Recibo de agua","Servicios (luz, agua, internet)",18+rnd()*10,"Efectivo","");
    addG(day(12),"Gel conductor, electrodos y vendas","Insumos y material",35+rnd()*45,"Efectivo","Distribuidora médica");
    addG(day(20),"Servicio de limpieza","Limpieza",60,"Efectivo","");
    if(m%2===0)addG(day(15),pick(["Mantenimiento del equipo de ultrasonido","Calibración de equipo de electroterapia","Revisión de compresas calientes"]),"Mantenimiento",90+rnd()*80,"Transferencia","Servicio técnico biomédico");
    if(m===3)addG(day(18),"Reparación de camilla hidráulica","Mantenimiento",75,"Efectivo","Taller de mobiliario");
    if(m===1)addG(day(22),"Juego de mancuernas y bandas elásticas","Equipo",120,"Tarjeta","Tienda deportiva");
    addG(day(25),"Honorarios contables","Impuestos y trámites",45,"Transferencia","Contador");
  }
  const ingresos={};let v=0;
  const prods=[["Pomada de diclofenaco 60 g","Venta de pomada o medicamento",9.5],["Gel de árnica 120 g","Venta de pomada o medicamento",8],["Crema analgésica con mentol","Venta de pomada o medicamento",7.5],["Rollo de kinesiotape","Venta de material (vendas, fajas, kinesiotape)",12],["Faja lumbar","Venta de material (vendas, fajas, kinesiotape)",28],["Rodillera elástica","Venta de material (vendas, fajas, kinesiotape)",18]];
  for(let k=150;k>=0;k-=4+Math.floor(rnd()*6)){const f=iso(addDays(now,-k));const pr=pick(prods);const q=rnd()<.2?2:1;
    ingresos["ej-i"+(v++)]={fecha:f,concepto:pr[0],categoria:pr[1],cantidad:q,precio:pr[2],monto:Math.round(pr[2]*q*100)/100,metodo:pick(["Efectivo","Efectivo","Tarjeta"]),pacienteId:rnd()<.6?"ej-p"+(1+Math.floor(rnd()*8)):"",notas:"",ejemplo:true}}
  [[60,"Evaluación a domicilio"],[35,"Informe de evolución para aseguradora"]].forEach(([m,c],j)=>{ingresos["ej-i"+(v++)]={fecha:iso(addDays(now,-20-j*30)),concepto:c,categoria:j?"Certificado o informe":"Evaluación o consulta a domicilio",cantidad:1,precio:m,monto:m,metodo:"Transferencia",pacienteId:"ej-p"+(4+j),notas:"",ejemplo:true}});
  return {pac,citas,hist,gastos,ingresos};
}
function loadSampleInMemory(){const s=sampleData();
  for(const k in s.pac)S.pacientes[k]={...s.pac[k],id:k};for(const k in s.citas)S.citas[k]={...s.citas[k],id:k};
  for(const k in s.hist)S.historial[k]={...s.hist[k],id:k};for(const k in s.gastos)S.gastos[k]={...s.gastos[k],id:k};for(const k in s.ingresos)S.ingresos[k]={...s.ingresos[k],id:k};
  S.config={...SAMPLE_CFG}}
async function seedExamples(){
  if(S.seeding)return;S.seeding=true;render();
  const s=sampleData();const items=[];
  for(const k in s.pac)items.push({col:"pacientes",id:k,data:s.pac[k]});
  for(const k in s.citas)items.push({col:"citas",id:k,data:s.citas[k]});
  for(const k in s.hist)items.push({col:"historial",id:k,data:s.hist[k]});
  for(const k in s.gastos)items.push({col:"gastos",id:k,data:s.gastos[k]});
  for(const k in s.ingresos)items.push({col:"ingresos",id:k,data:s.ingresos[k]});
  if(!S.config.fisioterapeuta&&!S.config.precioSesion)items.push({col:"config",id:"clinica",data:{...SAMPLE_CFG}});
  try{await putMany(items);toast("Datos de ejemplo cargados")}catch(e){writeErr(e)}
  S.seeding=false;render();
}
async function clearExamples(){
  const ok=await confirmDlg("Eliminar datos de ejemplo","Se borrarán todos los pacientes, citas, historiales, gastos y entradas marcados como ejemplo. Tus propios registros no se tocan.");
  if(!ok)return;const items=[];
  for(const col of COLS)for(const k in S[col])if(S[col][k].ejemplo)items.push({col,id:k});
  try{await delMany(items);if(S.sel&&!S.pacientes[S.sel])S.sel=null;toast("Datos de ejemplo eliminados")}catch(e){writeErr(e)}
}

/* ---------- derivados ---------- */
const pacList=()=>Object.values(S.pacientes).sort((a,b)=>nombre(a).localeCompare(nombre(b),"es"));
const citasList=()=>Object.values(S.citas).sort((a,b)=>(a.fecha+a.hora).localeCompare(b.fecha+b.hora));
const histOf=pid=>Object.values(S.historial).filter(h=>h.pacienteId===pid).sort((a,b)=>b.fecha.localeCompare(a.fecha));
const citasOf=pid=>citasList().filter(c=>c.pacienteId===pid);
const tipos=()=>[...new Set(["Fisioterapia general","Rehabilitación de rodilla","Columna / lumbar","Hombro","Neurológica","Deportiva","Electroterapia","Hidroterapia","Pediátrica","Respiratoria",...Object.values(S.citas).map(c=>c.tipo)].filter(Boolean))].sort();
const sesionesHechas=pid=>Object.values(S.citas).filter(c=>c.pacienteId===pid&&c.estado==="completada").length;
const hasExamples=()=>COLS.some(c=>Object.values(S[c]).some(x=>x.ejemplo));
const porCobrar=c=>c.estado==="completada"&&c.pago!=="pagado"&&+c.monto>0;

/* ---------- periodos ---------- */
function range(P,D){
  const d=parse(D);let a,b,label,buckets=[];
  if(P==="semana"){a=startOfWeek(d);b=addDays(a,6);label=`Semana del ${fmt(iso(a),{day:"numeric",month:"long"})} al ${fmt(iso(b),{day:"numeric",month:"long",year:"numeric"})}`;
    for(let i=0;i<7;i++){const x=iso(addDays(a,i));buckets.push({l:addDays(a,i).toLocaleDateString("es-ES",{weekday:"short"}).replace(".",""),test:f=>f===x})}}
  else if(P==="mes"){a=new Date(d.getFullYear(),d.getMonth(),1);b=new Date(d.getFullYear(),d.getMonth()+1,0);label=cap(a.toLocaleDateString("es-ES",{month:"long",year:"numeric"}));
    for(let i=1;i<=b.getDate();i++){const x=iso(new Date(a.getFullYear(),a.getMonth(),i));buckets.push({l:String(i),test:f=>f===x})}}
  else{a=new Date(d.getFullYear(),0,1);b=new Date(d.getFullYear(),11,31);label=`Año ${d.getFullYear()}`;
    for(let i=0;i<12;i++){const pre=`${d.getFullYear()}-${pad(i+1)}`;buckets.push({l:new Date(2000,i,1).toLocaleDateString("es-ES",{month:"short"}).replace(".",""),test:f=>f.startsWith(pre)})}}
  return {a:iso(a),b:iso(b),label,buckets,P};
}
function periodControls(pAct,dId,P,D,extra){
  return `<div class="row"><div class="seg" role="group" aria-label="Periodo">${[["semana","Semanal"],["mes","Mensual"],["anio","Anual"]].map(([k,l])=>`<button data-act="${pAct}" data-v="${k}" aria-pressed="${P===k}">${l}</button>`).join("")}</div>
    <input id="${dId}" type="date" value="${esc(D)}" style="width:auto" aria-label="Fecha de referencia">${extra||""}</div>`;
}

/* ---------- render ---------- */
let raf=0;function schedule(){if(!raf)raf=requestAnimationFrame(()=>{raf=0;render()})}
function render(){
  document.querySelectorAll("nav.tabs a").forEach(a=>a.setAttribute("aria-current",a.dataset.tab===S.tab?"page":"false"));
  const ban=$("#banner"),bi=$("#banner-inner");
  if(S.mode==="demo"){ban.hidden=false;bi.innerHTML=`<b>Modo demostración.</b> <span>Estás viendo datos de ejemplo.</span>`}
  else if((S.mode==="db"||S.mode==="local")&&hasExamples()){ban.hidden=false;bi.innerHTML=`<span>Hay datos de ejemplo cargados junto a tus registros.</span><button class="btn small" data-act="clear-examples">Eliminar datos de ejemplo</button>`}
  else ban.hidden=true;
  $("#dl-tipos").innerHTML=tipos().map(t=>`<option value="${esc(t)}">`).join("");
  const a=document.activeElement,aid=a&&a.id,selS=a&&a.selectionStart,selE=a&&a.selectionEnd;
  const m=$("#main");
  if(S.mode==="cargando"||(S.mode==="db"&&!Object.values(S.loaded).every(Boolean))){m.innerHTML=`<p class="muted">Cargando datos de la clínica…</p>`;return}
  m.innerHTML=({hoy:vHoy,pacientes:vPacientes,citas:vCitas,finanzas:vFinanzas,reportes:vReportes}[S.tab]||vHoy)();
  if(aid){const el=document.getElementById(aid);if(el&&el!==document.activeElement&&m.contains(el)){el.focus();try{el.setSelectionRange(selS,selE)}catch(_){}}}
}

function emptyClinic(){
  return `<div class="empty"><h3>Aún no hay pacientes registrados</h3><p>Registra tu primer paciente para empezar a llevar su historial y agendar citas.</p>
  <div class="row"><button class="btn primary" data-act="new-pac">Registrar paciente</button></div></div>`;
}
function setupNotice(){
  if(S.config.fisioterapeuta&&S.config.precioSesion!==""&&S.config.precioSesion!=null)return "";
  return `<div class="notice"><span>Indica el nombre del fisioterapeuta y el precio por sesión para que las citas nuevas se cobren automáticamente.</span><button class="btn small primary" data-act="ajustes">Abrir ajustes</button></div>`;
}

function apptRow(c,opts={}){
  const p=S.pacientes[c.pacienteId];const fin=minToH(toMin(c.hora)+(+c.duracion||60));
  let quick="";
  if(c.estado==="programada"||c.estado==="confirmada")quick=`<button class="btn small" data-act="st" data-id="${c.id}" data-st="completada">Asistió</button><button class="btn small" data-act="st" data-id="${c.id}" data-st="no_asistio">No asistió</button>`;
  else if(porCobrar(c))quick=`<button class="btn small" data-act="cobrar" data-id="${c.id}">Cobrar ${money(c.monto)}</button>`;
  return `<div class="appt is-${esc(c.estado)}">
    <div class="t">${esc(c.hora)}<small>${fin}</small></div>
    <div class="who"><b>${esc(nombre(p))}</b><span>${opts.showDate?esc(fShort(c.fecha))+" · ":""}${esc(c.tipo)}${+c.monto>0?" · "+money(c.monto):""}</span></div>
    <div class="acts">${pill(c.estado)}${c.estado==="completada"?payPill(c):""}${quick}<button class="btn small ghost" data-act="edit-cita" data-id="${c.id}">Editar</button></div></div>`;
}

/* Hoy */
function vHoy(){
  const head=`<div class="view-head"><div><h2 style="text-transform:capitalize">${esc(fLong(TODAY))}</h2>${S.config.fisioterapeuta?`<p class="muted">${esc(S.config.fisioterapeuta)}</p>`:""}</div>
    <div class="row"><button class="btn" data-act="new-pac">Nuevo paciente</button><button class="btn primary" data-act="new-cita" data-fecha="${TODAY}">Nueva cita</button></div></div>`;
  if(!Object.keys(S.pacientes).length)return head+setupNotice()+emptyClinic();
  const hoy=citasList().filter(c=>c.fecha===TODAY);
  const done=hoy.filter(c=>c.estado==="completada").length,pend=hoy.filter(c=>c.estado==="programada"||c.estado==="confirmada").length,canc=hoy.filter(c=>c.estado==="cancelada"||c.estado==="no_asistio").length;
  const cobradoHoy=hoy.filter(c=>c.pago==="pagado").reduce((s,c)=>s+(+c.monto||0),0);
  const deuda=Object.values(S.citas).filter(porCobrar);
  const lim=iso(addDays(new Date(),7));
  const prox=citasList().filter(c=>c.fecha>TODAY&&c.fecha<=lim&&c.estado!=="cancelada").slice(0,8);
  const activos=pacList().filter(p=>(p.estado||"activo")==="activo");
  const porTerminar=activos.filter(p=>+p.sesionesPrescritas&&sesionesHechas(p.id)>=+p.sesionesPrescritas-2).slice(0,6);
  return head+setupNotice()+`
  <div class="kpis">
    <div class="kpi"><div class="l">Citas hoy</div><div class="v">${hoy.length}</div><div class="d">${done} atendidas · ${pend} pendientes</div></div>
    <div class="kpi"><div class="l">Cobrado hoy</div><div class="v pos">${money(cobradoHoy)}</div></div>
    <div class="kpi"><div class="l">Por cobrar</div><div class="v" style="color:var(--warn)">${money(deuda.reduce((s,c)=>s+(+c.monto||0),0))}</div><div class="d">${deuda.length} sesiones sin pagar</div></div>
    <div class="kpi"><div class="l">Pacientes en tratamiento</div><div class="v">${activos.length}</div></div>
  </div>
  <div class="two">
    <section class="panel"><div class="panel-title"><h3>Agenda de hoy</h3>${canc?`<span class="muted">${canc} cancelada${canc>1?"s":""} o sin asistencia</span>`:""}</div>
      ${hoy.length?hoy.map(c=>apptRow(c)).join(""):`<div class="empty">No hay citas para hoy.</div>`}</section>
    <div class="stack">
      <section class="panel"><div class="panel-title"><h3>Próximos 7 días</h3><a href="#citas" data-act="go" data-v="citas" class="btn small">Ver agenda</a></div>
        ${prox.length?prox.map(c=>apptRow(c,{showDate:true})).join(""):`<div class="empty">Sin citas próximas.</div>`}</section>
      <section class="panel"><div class="panel-title"><h3>Cerca de completar su plan</h3></div>
        ${porTerminar.length?`<div class="tbl-wrap"><table><thead><tr><th>Paciente</th><th class="r">Sesiones</th></tr></thead><tbody>${porTerminar.map(p=>`<tr class="click" data-act="open-pac" data-id="${p.id}"><td>${esc(nombre(p))}</td><td class="r num">${sesionesHechas(p.id)} / ${p.sesionesPrescritas}</td></tr>`).join("")}</tbody></table></div><p class="muted" style="margin:10px 0 0;font-size:.85rem">Programa la reevaluación o el alta.</p>`:`<p class="muted" style="margin:0">Ningún paciente está por terminar sus sesiones prescritas.</p>`}</section>
    </div>
  </div>`;
}

/* Pacientes */
const norm=s=>String(s||"").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"");
function filteredPacs(){const q=norm(S.q.trim());
  return pacList().filter(p=>(S.filtroPac==="todos"||(p.estado||"activo")===S.filtroPac)&&(!q||norm([nombre(p),p.documento,p.diagnostico,p.telefono].join(" ")).includes(q)))}
function pacListHTML(){
  const l=filteredPacs();
  if(!l.length)return `<p class="muted" style="padding:10px">Ningún paciente coincide con la búsqueda.</p>`;
  return `<ul class="plist">${l.map(p=>`<li><button data-act="open-pac" data-id="${p.id}" aria-current="${p.id===S.sel}"><span class="n">${esc(nombre(p))}</span><span class="s">${esc(p.diagnostico||"Sin diagnóstico")}</span></button></li>`).join("")}</ul>`;
}
function vPacientes(){
  if(!Object.keys(S.pacientes).length)return `<div class="view-head"><div><h2>Pacientes</h2></div></div>`+emptyClinic();
  const p=S.sel&&S.pacientes[S.sel];
  return `<div class="split ${p?"has-sel":""}">
    <aside class="panel list-pane">
      <div class="panel-title"><h3>Pacientes <span class="muted num" style="font-weight:400;font-size:.85rem">${pacList().length}</span></h3><button class="btn primary small" data-act="new-pac">Nuevo</button></div>
      <div class="stack" style="gap:8px;margin-bottom:10px">
        <input id="pac-q" type="search" placeholder="Buscar por nombre, documento o diagnóstico" value="${esc(S.q)}" aria-label="Buscar paciente">
        <div class="seg" role="group" aria-label="Filtrar por estado">${[["activo","En tratamiento"],["alta","Alta"],["todos","Todos"]].map(([k,l])=>`<button data-act="fpac" data-v="${k}" aria-pressed="${S.filtroPac===k}">${l}</button>`).join("")}</div>
      </div>
      <div id="pac-list">${pacListHTML()}</div>
    </aside>
    <section class="detail-pane">${p?pacDetail(p):`<div class="empty"><h3>Selecciona un paciente</h3><p>Verás sus datos, historial clínico, citas y pagos.</p></div>`}</section>
  </div>`;
}
function pacDetail(p){
  const a=age(p.nacimiento);const hist=histOf(p.id);const cs=citasOf(p.id);
  const hechas=cs.filter(c=>c.estado==="completada").length;const presc=+p.sesionesPrescritas||0;
  const futuras=cs.filter(c=>c.fecha>=TODAY&&(c.estado==="programada"||c.estado==="confirmada"));
  const pasadas=cs.filter(c=>!(c.fecha>=TODAY&&(c.estado==="programada"||c.estado==="confirmada"))).reverse();
  const evas=hist.filter(h=>h.eva!==""&&h.eva!=null).slice().reverse();
  const pagado=cs.filter(c=>c.pago==="pagado").reduce((s,c)=>s+(+c.monto||0),0);
  const debe=cs.filter(porCobrar).reduce((s,c)=>s+(+c.monto||0),0);
  const estadoTxt={activo:"En tratamiento",alta:"Dado de alta",pausa:"En pausa"}[p.estado||"activo"];
  const kv=(l,v)=>`<div><dt>${l}</dt><dd>${v?esc(v):'<span class="muted">—</span>'}</dd></div>`;
  return `<div class="stack">
    <button class="btn small back-btn" data-act="back" style="justify-self:start">← Volver a la lista</button>
    <div class="panel">
      <div class="pat-head">
        <div style="min-width:0"><h2>${esc(nombre(p))}</h2>
          <div class="meta">${a!=null?a+" años · ":""}${esc(p.sexo||"")} ${p.documento?"· Doc. "+esc(p.documento):""} · <span class="tag">${estadoTxt}</span></div>
          <p style="margin:10px 0 0"><b>${esc(p.diagnostico||"")}</b></p>
          ${p.alergias&&!/^ninguna/i.test(p.alergias)?`<p style="margin:8px 0 0"><span class="alert-chip">Alergias: ${esc(p.alergias)}</span></p>`:""}
        </div>
        <div class="progress">
          ${presc?`<div class="row" style="justify-content:space-between"><span class="muted" style="font-size:.85rem;font-weight:700">Plan de sesiones</span><span class="num">${hechas} / ${presc}</span></div><div class="track"><span style="width:${Math.min(100,hechas/presc*100)}%"></span></div>`:""}
          ${evas.length>1?`<div class="muted" style="font-size:.85rem">Dolor: EVA ${evas[0].eva} → ${evas[evas.length-1].eva}</div>`:""}
          <div style="font-size:.85rem"><span class="muted">Pagado</span> <b class="num">${money(pagado)}</b>${debe?` · <span style="color:var(--warn)">Debe <b class="num">${money(debe)}</b></span>`:""}</div>
        </div>
      </div>
      <div class="row" style="margin-top:14px">
        <button class="btn primary small" data-act="new-cita" data-pac="${p.id}">Agendar cita</button>
        <button class="btn small" data-act="new-hist" data-pac="${p.id}">Agregar al historial</button>
        <button class="btn small" data-act="edit-pac" data-id="${p.id}">Editar datos</button>
        <button class="btn small ghost danger" data-act="del-pac" data-id="${p.id}" style="border-color:transparent">Eliminar</button>
      </div>
    </div>
    <div class="panel"><div class="panel-title"><h3>Historial clínico</h3><span class="muted num" style="font-size:.85rem">${hist.length} registros</span></div>
      ${hist.length?`<ol class="timeline">${hist.map(h=>`<li><div class="when">${esc(fShort(h.fecha))}</div><div class="body">
        <div class="row" style="justify-content:space-between"><div class="row"><b>${esc(h.tipo)}</b>${evaHTML(h.eva)}</div><button class="btn small ghost" data-act="edit-hist" data-id="${h.id}">Editar</button></div>
        ${h.motivo?`<p><span class="lbl">Subjetivo</span>${esc(h.motivo)}</p>`:""}
        ${h.hallazgos?`<p><span class="lbl">Hallazgos</span>${esc(h.hallazgos)}</p>`:""}
        ${h.tratamiento?`<p><span class="lbl">Tratamiento</span>${esc(h.tratamiento)}</p>`:""}
        ${h.plan?`<p><span class="lbl">Plan</span>${esc(h.plan)}</p>`:""}</div></li>`).join("")}</ol>`:`<div class="empty">Sin registros. Empieza con la evaluación inicial.</div>`}
    </div>
    <div class="panel"><h3 style="margin-bottom:12px">Datos del paciente</h3>
      <dl class="kv">${kv("Fecha de nacimiento",p.nacimiento?fShort(p.nacimiento):"")}${kv("Ocupación",p.ocupacion)}${kv("Teléfono",p.telefono)}${kv("Correo",p.email)}${kv("Dirección",p.direccion)}${kv("Contacto de emergencia",[p.contactoEmergencia,p.telEmergencia].filter(Boolean).join(" · "))}${kv("Aseguradora",p.aseguradora)}${kv("Médico que refiere",p.medicoReferente)}${kv("Fecha de ingreso",p.creado?fShort(p.creado):"")}</dl>
      <dl class="kv" style="margin-top:16px;grid-template-columns:1fr">${kv("Antecedentes",p.antecedentes)}${kv("Medicamentos",p.medicamentos)}${p.notas?kv("Notas",p.notas):""}</dl>
    </div>
    <div class="panel"><h3 style="margin-bottom:12px">Citas y pagos</h3>
      ${futuras.length?`<p class="muted" style="margin:0 0 8px;font-weight:700;font-size:.85rem">PRÓXIMAS</p>${futuras.map(c=>apptRow(c,{showDate:true})).join("")}`:`<p class="muted" style="margin:0 0 8px">No tiene citas próximas.</p>`}
      ${pasadas.length?`<p class="muted" style="margin:14px 0 8px;font-weight:700;font-size:.85rem">ANTERIORES</p><div class="tbl-wrap"><table><thead><tr><th>Fecha</th><th>Hora</th><th>Terapia</th><th>Estado</th><th class="r">Monto</th><th>Pago</th></tr></thead><tbody>${pasadas.slice(0,40).map(c=>`<tr class="click" data-act="edit-cita" data-id="${c.id}"><td class="num nowrap">${esc(fShort(c.fecha))}</td><td class="num">${esc(c.hora)}</td><td>${esc(c.tipo)}</td><td>${pill(c.estado)}</td><td class="r num">${+c.monto>0?money(c.monto):"—"}</td><td>${payPill(c)}</td></tr>`).join("")}</tbody></table></div>`:""}
    </div>
  </div>`;
}

/* Citas */
function vCitas(){
  if(!Object.keys(S.pacientes).length)return `<div class="view-head"><div><h2>Citas</h2></div></div>`+emptyClinic();
  const ws=parse(S.week),we=addDays(ws,6);const a=iso(ws),b=iso(we);
  const l=citasList().filter(c=>c.fecha>=a&&c.fecha<=b&&(S.fEstado==="todos"||(S.fEstado==="por_cobrar"?porCobrar(c):c.estado===S.fEstado)));
  let days="";for(let i=0;i<7;i++){const d=iso(addDays(ws,i));const dl=l.filter(c=>c.fecha===d);
    days+=`<div class="day ${d===TODAY?"today":""}"><h3>${esc(fLong(d))} <span class="count">${dl.length?dl.length+" cita"+(dl.length>1?"s":""):"sin citas"}</span>${d>=TODAY?`<button class="btn small ghost" style="margin-left:auto" data-act="new-cita" data-fecha="${d}">+ Cita</button>`:""}</h3>${dl.map(c=>apptRow(c)).join("")}</div>`}
  const rangeTxt=`${ws.getDate()} ${ws.toLocaleDateString("es-ES",{month:"short"})} – ${we.getDate()} ${we.toLocaleDateString("es-ES",{month:"short",year:"numeric"})}`;
  return `<div class="view-head"><div><h2>Agenda semanal</h2><p class="muted">${rangeTxt} · ${l.length} citas</p></div><button class="btn primary" data-act="new-cita">Nueva cita</button></div>
  <div class="panel" style="margin-bottom:16px"><div class="row" style="justify-content:space-between">
    <div class="row"><button class="btn small" data-act="wk" data-d="-7" aria-label="Semana anterior">←</button><button class="btn small" data-act="wk" data-d="0">Esta semana</button><button class="btn small" data-act="wk" data-d="7" aria-label="Semana siguiente">→</button>
      <input id="wk-date" type="date" value="${a}" style="width:auto" aria-label="Ir a fecha"></div>
    <select id="f-estado" style="width:auto" aria-label="Filtrar por estado"><option value="todos">Todos los estados</option>${Object.entries(ESTADOS).map(([k,v])=>`<option value="${k}" ${S.fEstado===k?"selected":""}>${v}</option>`).join("")}<option value="por_cobrar" ${S.fEstado==="por_cobrar"?"selected":""}>Por cobrar</option></select>
  </div></div>
  ${days}`;
}

/* Finanzas */
function computeFin(){
  const R=range(S.finP,S.finD);const inR=f=>f>=R.a&&f<=R.b;
  const ingresos=citasList().filter(c=>inR(c.fecha)&&c.pago==="pagado"&&+c.monto>0);
  const pendientes=citasList().filter(c=>inR(c.fecha)&&porCobrar(c));
  const gastos=Object.values(S.gastos).filter(g=>inR(g.fecha)).sort((a,b)=>b.fecha.localeCompare(a.fecha));
  const sum=(l,k="monto")=>l.reduce((s,x)=>s+(+x[k]||0),0);
  const otros=Object.values(S.ingresos).filter(x=>inR(x.fecha)).sort((a,b)=>b.fecha.localeCompare(a.fecha));
  const tSes=sum(ingresos),tOtros=sum(otros),tIn=tSes+tOtros,tPend=sum(pendientes),tOut=sum(gastos);
  const byCat={};gastos.forEach(g=>{const k=g.categoria||"Otros";byCat[k]=(byCat[k]||0)+(+g.monto||0)});
  const cats=Object.entries(byCat).sort((a,b)=>b[1]-a[1]);
  const byMet={};ingresos.concat(otros).forEach(c=>{const k=c.metodo||"Sin especificar";byMet[k]=(byMet[k]||0)+(+c.monto||0)});
  const mets=Object.entries(byMet).sort((a,b)=>b[1]-a[1]);
  const series=R.buckets.map(b=>({l:b.l,a:sum(ingresos.filter(c=>b.test(c.fecha)))+sum(otros.filter(c=>b.test(c.fecha))),b:sum(gastos.filter(g=>b.test(g.fecha)))}));
  const byIng={};otros.forEach(x=>{const k=x.categoria||"Otro ingreso";byIng[k]=(byIng[k]||0)+(+x.monto||0)});
  return {R,ingresos,otros,tSes,tOtros,ings:Object.entries(byIng).sort((a,b)=>b[1]-a[1]),pendientes,gastos,tIn,tPend,tOut,bal:tIn-tOut,cats,mets,series};
}
function pairChart(series){
  const W=760,H=230,L=58,B=26,T=10;const max=Math.max(1,...series.flatMap(s=>[s.a,s.b]));
  const raw=max/4,mag=Math.pow(10,Math.floor(Math.log10(raw))),step=[1,2,2.5,5,10].map(x=>x*mag).find(x=>x>=raw);const top=step*4;
  const n=series.length;const bw=(W-L-6)/n;const w=Math.max(2,Math.min(16,bw*.34));
  const y=v=>T+(H-T-B)*(1-v/top);let g="";
  for(let i=0;i<=4;i++){const v=step*i;g+=`<line x1="${L}" x2="${W}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)" stroke-width="1"/><text x="${L-6}" y="${y(v)+3}" text-anchor="end">${esc(cur())}${v>=1000?(v/1000).toLocaleString("es-MX",{maximumFractionDigits:1})+"k":v.toLocaleString("es-MX",{maximumFractionDigits:0})}</text>`}
  const every=n>16?Math.ceil(n/16):1;
  series.forEach((s,i)=>{const cx=L+bw*i+bw/2;
    if(s.a)g+=`<rect x="${cx-w-1}" y="${y(s.a)}" width="${w}" height="${y(0)-y(s.a)}" rx="2" fill="var(--ok)"><title>${esc(s.l)}: ingresos ${esc(money(s.a))}</title></rect>`;
    if(s.b)g+=`<rect x="${cx+1}" y="${y(s.b)}" width="${w}" height="${y(0)-y(s.b)}" rx="2" fill="var(--bad)"><title>${esc(s.l)}: gastos ${esc(money(s.b))}</title></rect>`;
    if(i%every===0)g+=`<text x="${cx}" y="${H-8}" text-anchor="middle">${esc(s.l)}</text>`});
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Ingresos y gastos por periodo">${g}</svg>`;
}
function vFinanzas(){
  const r=computeFin();const xl=canExport();
  const mxC=Math.max(1,...r.cats.map(x=>x[1])),mxM=Math.max(1,...r.mets.map(x=>x[1]));
  return `<div class="view-head"><div><h2>Finanzas</h2><p class="muted">${esc(r.R.label)} · ${esc(fShort(r.R.a))} – ${esc(fShort(r.R.b))}</p></div>
    ${periodControls("finP","fin-date",S.finP,S.finD,`<button class="btn" data-act="new-ingreso">Registrar entrada</button><button class="btn" data-act="new-gasto">Registrar gasto</button>${xl?`<button class="btn primary" data-act="xls-fin">Exportar a Excel</button>`:""}`)}</div>
  ${setupNotice()}
  <div class="kpis">
    <div class="kpi"><div class="l">Entradas (cobrado)</div><div class="v pos">${money(r.tIn)}</div><div class="d">Sesiones ${money(r.tSes)} · Otras ${money(r.tOtros)}</div></div>
    <div class="kpi"><div class="l">Salidas (gastos)</div><div class="v neg">${money(r.tOut)}</div><div class="d">${r.gastos.length} pagos registrados</div></div>
    <div class="kpi"><div class="l">Balance</div><div class="v ${r.bal>=0?"pos":"neg"}">${money(r.bal)}</div><div class="d">Entradas menos salidas</div></div>
    <div class="kpi"><div class="l">Por cobrar</div><div class="v" style="color:var(--warn)">${money(r.tPend)}</div><div class="d">${r.pendientes.length} sesiones atendidas sin pagar</div></div>
  </div>
  <section class="panel chart" style="margin-bottom:16px"><div class="panel-title"><h3>Entradas y salidas por ${S.finP==="anio"?"mes":"día"}</h3><div class="legend"><span><i style="background:var(--ok)"></i>Entradas</span><span><i style="background:var(--bad)"></i>Salidas</span></div></div>
    <div class="tbl-wrap">${pairChart(r.series)}</div></section>
  <div class="two" style="margin-bottom:16px">
    <section class="panel"><h3 style="margin-bottom:10px">Gastos por categoría</h3>
      ${r.cats.length?`<div class="tbl-wrap"><table><tbody>${r.cats.map(([k,v])=>`<tr><td>${esc(k)}</td><td style="width:30%"><div class="bar-inline bad"><span style="width:${v/mxC*100}%"></span></div></td><td class="r num">${money(v)}</td><td class="r num muted">${r.tOut?Math.round(v/r.tOut*100):0}%</td></tr>`).join("")}</tbody></table></div>`:`<p class="muted" style="margin:0">Sin gastos en este periodo.</p>`}</section>
    <section class="panel"><h3 style="margin-bottom:10px">Entradas por método de pago</h3>
      ${r.mets.length?`<div class="tbl-wrap"><table><tbody>${r.mets.map(([k,v])=>`<tr><td>${esc(k)}</td><td style="width:30%"><div class="bar-inline"><span style="width:${v/mxM*100}%;background:var(--ok)"></span></div></td><td class="r num">${money(v)}</td></tr>`).join("")}</tbody></table></div>`:`<p class="muted" style="margin:0">Sin cobros en este periodo.</p>`}</section>
  </div>
  <section class="panel" style="margin-bottom:16px"><div class="panel-title"><h3>Salidas: gastos y pagos</h3><button class="btn small" data-act="new-gasto">Registrar gasto</button></div>
    ${r.gastos.length?`<div class="tbl-wrap"><table><thead><tr><th>Fecha</th><th>Concepto</th><th>Categoría</th><th>Método</th><th class="r">Monto</th></tr></thead><tbody>${r.gastos.map(g=>`<tr class="click" data-act="edit-gasto" data-id="${g.id}"><td class="num nowrap">${esc(fShort(g.fecha))}</td><td>${esc(g.concepto)}${g.proveedor?`<div class="muted" style="font-size:.82rem">${esc(g.proveedor)}</div>`:""}</td><td><span class="tag">${esc(g.categoria||"Otros")}</span></td><td class="muted">${esc(g.metodo||"—")}</td><td class="r num">${money(g.monto)}</td></tr>`).join("")}</tbody><tfoot><tr><td colspan="4">Total de salidas</td><td class="r num">${money(r.tOut)}</td></tr></tfoot></table></div>`:`<div class="empty">No hay gastos registrados en este periodo.<div class="row"><button class="btn primary" data-act="new-gasto">Registrar gasto</button></div></div>`}</section>
  <section class="panel" style="margin-bottom:16px"><div class="panel-title"><h3>Otras entradas: ventas y servicios</h3><button class="btn small" data-act="new-ingreso">Registrar entrada</button></div>
    ${r.otros.length?`<div class="tbl-wrap"><table><thead><tr><th>Fecha</th><th>Concepto</th><th>Tipo</th><th class="r">Cant.</th><th>Método</th><th class="r">Total</th></tr></thead><tbody>${r.otros.map(x=>`<tr class="click" data-act="edit-ingreso" data-id="${x.id}"><td class="num nowrap">${esc(fShort(x.fecha))}</td><td>${esc(x.concepto)}${x.pacienteId&&S.pacientes[x.pacienteId]?`<div class="muted" style="font-size:.82rem">${esc(nombre(S.pacientes[x.pacienteId]))}</div>`:""}</td><td><span class="tag">${esc(x.categoria||"Otro ingreso")}</span></td><td class="r num">${esc(x.cantidad||1)}</td><td class="muted">${esc(x.metodo||"—")}</td><td class="r num">${money(x.monto)}</td></tr>`).join("")}</tbody><tfoot><tr><td colspan="5">Total de otras entradas</td><td class="r num">${money(r.tOtros)}</td></tr></tfoot></table></div>`:`<div class="empty">No hay ventas ni otras entradas en este periodo.<div class="row"><button class="btn primary" data-act="new-ingreso">Registrar entrada</button></div></div>`}</section>
  <section class="panel" style="margin-bottom:16px"><h3 style="margin-bottom:10px">Entradas: sesiones cobradas</h3>
    ${r.ingresos.length?`<div class="tbl-wrap"><table><thead><tr><th>Fecha</th><th>Paciente</th><th>Terapia</th><th>Método</th><th class="r">Monto</th></tr></thead><tbody>${r.ingresos.slice().reverse().map(c=>`<tr class="click" data-act="edit-cita" data-id="${c.id}"><td class="num nowrap">${esc(fShort(c.fecha))}</td><td>${esc(nombre(S.pacientes[c.pacienteId]))}</td><td>${esc(c.tipo)}</td><td class="muted">${esc(c.metodo||"—")}</td><td class="r num">${money(c.monto)}</td></tr>`).join("")}</tbody><tfoot><tr><td colspan="4">Total de sesiones cobradas</td><td class="r num">${money(r.tSes)}</td></tr></tfoot></table></div>`:`<p class="muted" style="margin:0">No hay sesiones cobradas en este periodo.</p>`}</section>
  ${r.pendientes.length?`<section class="panel"><h3 style="margin-bottom:10px">Sesiones por cobrar</h3><div class="tbl-wrap"><table><thead><tr><th>Fecha</th><th>Paciente</th><th class="r">Monto</th><th></th></tr></thead><tbody>${r.pendientes.map(c=>`<tr><td class="num nowrap">${esc(fShort(c.fecha))}</td><td>${esc(nombre(S.pacientes[c.pacienteId]))}</td><td class="r num">${money(c.monto)}</td><td class="r"><button class="btn small" data-act="cobrar" data-id="${c.id}">Registrar pago</button></td></tr>`).join("")}</tbody></table></div></section>`:""}`;
}

/* Reportes clínicos */
function computeReport(){
  const R=range(S.repP,S.repD);
  const cs=citasList().filter(c=>c.fecha>=R.a&&c.fecha<=R.b);
  const cnt=e=>cs.filter(c=>c.estado===e).length;
  const comp=cnt("completada"),canc=cnt("cancelada"),noa=cnt("no_asistio"),pend=cnt("programada")+cnt("confirmada");
  const asis=comp+noa?Math.round(comp/(comp+noa)*100):null;
  const horas=cs.filter(c=>c.estado==="completada").reduce((s,c)=>s+(+c.duracion||60),0)/60;
  const atendidos=new Set(cs.filter(c=>c.estado==="completada").map(c=>c.pacienteId));
  const nuevos=pacList().filter(p=>p.creado&&p.creado>=R.a&&p.creado<=R.b);
  const altas=Object.values(S.historial).filter(h=>h.tipo==="Alta"&&h.fecha>=R.a&&h.fecha<=R.b).length;
  const tipoM={};cs.forEach(c=>{const k=c.tipo||"Sin especificar";tipoM[k]=tipoM[k]||{k,total:0,comp:0,min:0};tipoM[k].total++;if(c.estado==="completada"){tipoM[k].comp++;tipoM[k].min+=(+c.duracion||60)}});
  const porTipo=Object.values(tipoM).sort((x,y)=>y.comp-x.comp||y.total-x.total);
  const horaM={};cs.filter(c=>c.estado!=="cancelada").forEach(c=>{const h=c.hora.slice(0,2);horaM[h]=(horaM[h]||0)+1});
  const porHora=Object.entries(horaM).sort((a,b)=>a[0].localeCompare(b[0]));
  const series=R.buckets.map(b=>{const x=cs.filter(c=>b.test(c.fecha));return{l:b.l,comp:x.filter(c=>c.estado==="completada").length,otras:x.filter(c=>c.estado!=="completada").length}});
  const pacs=[...atendidos].map(pid=>{const p=S.pacientes[pid];const ses=cs.filter(c=>c.pacienteId===pid&&c.estado==="completada").length;
    const hs=Object.values(S.historial).filter(h=>h.pacienteId===pid&&h.fecha>=R.a&&h.fecha<=R.b&&h.eva!==""&&h.eva!=null).sort((x,y)=>x.fecha.localeCompare(y.fecha));
    return{pid,n:nombre(p),dx:p?p.diagnostico:"",ses,e0:hs.length?hs[0].eva:null,e1:hs.length>1?hs[hs.length-1].eva:null}}).sort((x,y)=>y.ses-x.ses);
  return {R,cs,comp,canc,noa,pend,asis,horas,atendidos:atendidos.size,nuevos,altas,porTipo,porHora,series,pacs};
}
function barChart(series){
  const W=760,H=220,L=30,B=26,T=10;const max=Math.max(1,...series.map(s=>s.comp+s.otras));
  const step=Math.max(1,Math.ceil(max/4));const top=step*4;const n=series.length;const bw=(W-L-6)/n;const w=Math.max(3,Math.min(36,bw*.64));
  const y=v=>T+(H-T-B)*(1-v/top);let g="";
  for(let i=0;i<=4;i++){const v=step*i;g+=`<line x1="${L}" x2="${W}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)" stroke-width="1"/><text x="${L-6}" y="${y(v)+3}" text-anchor="end">${v}</text>`}
  const every=n>16?Math.ceil(n/16):1;
  series.forEach((s,i)=>{const x=L+bw*i+(bw-w)/2;const tot=s.comp+s.otras;
    if(tot)g+=`<rect x="${x}" y="${y(tot)}" width="${w}" height="${y(0)-y(tot)}" rx="2" fill="var(--accent-soft)"><title>${esc(s.l)}: ${tot} citas</title></rect>`;
    if(s.comp)g+=`<rect x="${x}" y="${y(s.comp)}" width="${w}" height="${y(0)-y(s.comp)}" rx="2" fill="var(--accent)"><title>${esc(s.l)}: ${s.comp} atendidas</title></rect>`;
    if(i%every===0)g+=`<text x="${x+w/2}" y="${H-8}" text-anchor="middle">${esc(s.l)}</text>`});
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Citas por periodo">${g}</svg>`;
}
function vReportes(){
  const r=computeReport();const xl=canExport();
  const mxT=Math.max(1,...r.porTipo.map(x=>x.comp)),mxH=Math.max(1,...r.porHora.map(x=>x[1]));
  return `<div class="view-head"><div><h2>Reportes de atención</h2><p class="muted">${esc(cap(r.R.label))} · ${esc(fShort(r.R.a))} – ${esc(fShort(r.R.b))}</p></div>
    ${periodControls("repP","rep-date",S.repP,S.repD,xl?`<button class="btn primary" data-act="xls-rep">Exportar a Excel</button>`:"")}</div>
  <div class="kpis">
    <div class="kpi"><div class="l">Sesiones atendidas</div><div class="v">${r.comp}</div><div class="d">${r.cs.length} citas agendadas${r.pend?` · ${r.pend} por realizar`:""}</div></div>
    <div class="kpi"><div class="l">Tasa de asistencia</div><div class="v">${r.asis==null?"—":r.asis+"%"}</div><div class="d">${r.noa} sin asistencia · ${r.canc} canceladas</div></div>
    <div class="kpi"><div class="l">Pacientes atendidos</div><div class="v">${r.atendidos}</div><div class="d">${r.nuevos.length} nuevos ingresos · ${r.altas} altas</div></div>
    <div class="kpi"><div class="l">Horas de terapia</div><div class="v">${r.horas.toFixed(1)}</div><div class="d">Sesiones completadas</div></div>
  </div>
  <section class="panel chart" style="margin-bottom:16px"><div class="panel-title"><h3>Citas por ${S.repP==="anio"?"mes":"día"}</h3><div class="legend"><span><i style="background:var(--accent)"></i>Atendidas</span><span><i style="background:var(--accent-soft)"></i>Canceladas, sin asistencia o pendientes</span></div></div>
    <div class="tbl-wrap">${barChart(r.series)}</div></section>
  <div class="two" style="margin-bottom:16px">
    <section class="panel"><h3 style="margin-bottom:10px">Por tipo de terapia</h3>${r.porTipo.length?`<div class="tbl-wrap"><table><thead><tr><th>Terapia</th><th class="r">Citas</th><th class="r">Atendidas</th><th class="r">Horas</th><th></th></tr></thead><tbody>${r.porTipo.map(x=>`<tr><td>${esc(x.k)}</td><td class="r num">${x.total}</td><td class="r num">${x.comp}</td><td class="r num">${(x.min/60).toFixed(1)}</td><td style="width:20%"><div class="bar-inline"><span style="width:${x.comp/mxT*100}%"></span></div></td></tr>`).join("")}</tbody></table></div>`:`<p class="muted" style="margin:0">Sin datos en este periodo.</p>`}</section>
    <section class="panel"><h3 style="margin-bottom:10px">Horarios más solicitados</h3>${r.porHora.length?`<div class="tbl-wrap"><table><tbody>${r.porHora.map(([h,v])=>`<tr><td class="num">${h}:00</td><td style="width:60%"><div class="bar-inline"><span style="width:${v/mxH*100}%"></span></div></td><td class="r num">${v}</td></tr>`).join("")}</tbody></table></div>`:`<p class="muted" style="margin:0">Sin datos en este periodo.</p>`}</section>
  </div>
  <section class="panel" style="margin-bottom:16px"><h3 style="margin-bottom:10px">Pacientes atendidos en el periodo</h3>
    ${r.pacs.length?`<div class="tbl-wrap"><table><thead><tr><th>Paciente</th><th>Diagnóstico</th><th class="r">Sesiones</th><th>Evolución del dolor (EVA)</th></tr></thead><tbody>${r.pacs.map(x=>`<tr class="click" data-act="open-pac" data-id="${x.pid}"><td>${esc(x.n)}</td><td class="muted">${esc(x.dx)}</td><td class="r num">${x.ses}</td><td class="num">${x.e0==null?'<span class="muted">—</span>':x.e1==null?x.e0:`${x.e0} → ${x.e1} <span style="color:${x.e1<x.e0?"var(--ok)":x.e1>x.e0?"var(--bad)":"var(--muted)"}">(${x.e1-x.e0>0?"+":""}${x.e1-x.e0})</span>`}</td></tr>`).join("")}</tbody></table></div>`:`<p class="muted" style="margin:0">Ningún paciente fue atendido en este periodo.</p>`}</section>
  ${r.nuevos.length?`<section class="panel"><h3 style="margin-bottom:10px">Nuevos ingresos</h3><div class="tbl-wrap"><table><thead><tr><th>Fecha</th><th>Paciente</th><th>Diagnóstico</th><th>Refiere</th></tr></thead><tbody>${r.nuevos.map(p=>`<tr class="click" data-act="open-pac" data-id="${p.id}"><td class="num nowrap">${esc(fShort(p.creado))}</td><td>${esc(nombre(p))}</td><td>${esc(p.diagnostico)}</td><td class="muted">${esc(p.medicoReferente||"")}</td></tr>`).join("")}</tbody></table></div></section>`:""}`;
}

/* ---------- Excel ---------- */
const xDate=s=>s?parse(s):"";
function sheet(rows,widths,moneyCols=[],dateCols=[]){
  const X=window.XLSX;const ws=X.utils.aoa_to_sheet(rows,{cellDates:true});
  ws["!cols"]=widths.map(w=>({wch:w}));
  const rg=X.utils.decode_range(ws["!ref"]);
  for(let R=1;R<=rg.e.r;R++){
    moneyCols.forEach(C=>{const c=ws[X.utils.encode_cell({r:R,c:C})];if(c&&c.t==="n")c.z='#,##0.00'});
    dateCols.forEach(C=>{const c=ws[X.utils.encode_cell({r:R,c:C})];if(c&&c.t==="d")c.z="dd/mm/yyyy"});
  }
  return ws;
}
const canExport=()=>!!window.XLSX;
async function saveBook(wb,filename){
  try{const buf=window.XLSX.write(wb,{bookType:"xlsx",type:"array"});
    const blob=new Blob([buf],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
    if(DL){await DL.save({filename,data:blob});return}
    const u=URL.createObjectURL(blob);const a=document.createElement("a");a.href=u;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),4000)}
  catch(e){if(e&&e.code&&!/declin|cancel|denied/i.test(e.code))toast("No se pudo generar el archivo de Excel.")}
}
function exportFin(){
  const r=computeFin();const X=window.XLSX;const wb=X.utils.book_new();const m=cur();
  const res=[["ARAM · Clínica de rehabilitación física"],["Reporte financiero",r.R.label],["Desde",xDate(r.R.a)],["Hasta",xDate(r.R.b)],[],
    ["Concepto",`Monto (${m})`],["Entradas: sesiones cobradas",r.tSes],["Entradas: ventas y otros",r.tOtros],["Total de entradas",r.tIn],["Salidas (gastos)",r.tOut],["Balance",r.bal],["Por cobrar",r.tPend],[],
    ["Gastos por categoría",`Monto (${m})`],...r.cats.map(([k,v])=>[k,v]),[],["Otras entradas por tipo",`Monto (${m})`],...r.ings.map(([k,v])=>[k,v]),[],["Entradas por método de pago",`Monto (${m})`],...r.mets.map(([k,v])=>[k,v])];
  const wsR=X.utils.aoa_to_sheet(res,{cellDates:true});wsR["!cols"]=[{wch:34},{wch:22}];
  Object.keys(wsR).forEach(k=>{if(k[0]!=="!"){const c=wsR[k];if(c.t==="n")c.z="#,##0.00";if(c.t==="d")c.z="dd/mm/yyyy"}});
  X.utils.book_append_sheet(wb,wsR,"Resumen");
  const entRows=r.ingresos.map(c=>[xDate(c.fecha),"Sesión",`${c.tipo} (${c.hora})`,nombre(S.pacientes[c.pacienteId]),1,+c.monto||0,c.metodo||"",+c.monto||0])
    .concat(r.otros.map(x=>[xDate(x.fecha),x.categoria||"Otro ingreso",x.concepto,x.pacienteId&&S.pacientes[x.pacienteId]?nombre(S.pacientes[x.pacienteId]):"",+x.cantidad||1,x.precio===""||x.precio==null?"":+x.precio,x.metodo||"",+x.monto||0]))
    .sort((a,b)=>a[0]-b[0]);
  X.utils.book_append_sheet(wb,sheet([["Fecha","Tipo","Concepto","Paciente","Cantidad","Precio unitario","Método de pago",`Monto (${m})`]].concat(entRows).concat([[],["","","","","","","Total",r.tIn]]),[12,30,34,28,10,14,16,14],[5,7],[0]),"Entradas");
  X.utils.book_append_sheet(wb,sheet([["Fecha","Concepto","Categoría","Proveedor","Método de pago","Notas",`Monto (${m})`]].concat(r.gastos.slice().reverse().map(g=>[xDate(g.fecha),g.concepto,g.categoria||"Otros",g.proveedor||"",g.metodo||"",g.notas||"",+g.monto||0])).concat([[],["","","","","","Total",r.tOut]]),[12,36,26,22,16,28,14],[6],[0]),"Salidas");
  X.utils.book_append_sheet(wb,sheet([["Fecha","Hora","Paciente","Teléfono","Terapia",`Monto (${m})`]].concat(r.pendientes.map(c=>{const p=S.pacientes[c.pacienteId]||{};return[xDate(c.fecha),c.hora,nombre(S.pacientes[c.pacienteId]),p.telefono||"",c.tipo,+c.monto||0]})),[12,8,28,18,24,14],[5],[0]),"Por cobrar");
  saveBook(wb,`ARAM-finanzas-${S.finP}-${r.R.a}_a_${r.R.b}.xlsx`);
}
function exportRep(){
  const r=computeReport();const X=window.XLSX;const wb=X.utils.book_new();
  const res=[["ARAM · Clínica de rehabilitación física"],["Reporte de atención",cap(r.R.label)],["Desde",xDate(r.R.a)],["Hasta",xDate(r.R.b)],[],
    ["Indicador","Valor"],["Citas agendadas",r.cs.length],["Sesiones atendidas",r.comp],["Canceladas",r.canc],["Sin asistencia",r.noa],["Pendientes",r.pend],
    ["Tasa de asistencia (%)",r.asis==null?"":r.asis],["Pacientes atendidos",r.atendidos],["Nuevos ingresos",r.nuevos.length],["Altas",r.altas],["Horas de terapia",+r.horas.toFixed(1)],[],
    ["Tipo de terapia","Citas","Atendidas","Horas"],...r.porTipo.map(x=>[x.k,x.total,x.comp,+(x.min/60).toFixed(1)])];
  const wsR=X.utils.aoa_to_sheet(res,{cellDates:true});wsR["!cols"]=[{wch:30},{wch:16},{wch:12},{wch:10}];
  Object.keys(wsR).forEach(k=>{if(k[0]!=="!"&&wsR[k].t==="d")wsR[k].z="dd/mm/yyyy"});
  X.utils.book_append_sheet(wb,wsR,"Resumen");
  X.utils.book_append_sheet(wb,sheet([["Fecha","Hora","Duración (min)","Paciente","Documento","Terapia","Estado","Monto","Pago","Método","Notas"]].concat(r.cs.map(c=>{const p=S.pacientes[c.pacienteId]||{};return[xDate(c.fecha),c.hora,+c.duracion||60,nombre(S.pacientes[c.pacienteId]),p.documento||"",c.tipo,ESTADOS[c.estado]||c.estado,+c.monto||0,c.estado==="completada"||c.pago==="pagado"?PAGOS[c.pago==="pagado"?"pagado":"pendiente"]:"",c.metodo||"",c.notas||""]})),[12,8,14,28,14,24,14,12,12,14,30],[7],[0]),"Citas");
  X.utils.book_append_sheet(wb,sheet([["Paciente","Diagnóstico","Sesiones en el periodo","EVA inicial","EVA final"]].concat(r.pacs.map(x=>[x.n,x.dx,x.ses,x.e0??"",x.e1??""])),[28,44,20,12,12]),"Pacientes");
  saveBook(wb,`ARAM-atencion-${S.repP}-${r.R.a}_a_${r.R.b}.xlsx`);
}

/* ---------- formularios ---------- */
const PFIELDS=["nombre","apellidos","documento","nacimiento","sexo","ocupacion","telefono","email","direccion","contactoEmergencia","telEmergencia","aseguradora","diagnostico","medicoReferente","sesionesPrescritas","estado","creado","alergias","antecedentes","medicamentos","notas"];
const CFIELDS=["pacienteId","fecha","hora","duracion","tipo","estado","monto","pago","metodo","notas"];
let editPac=null,editCita=null,editHist=null,histPac=null,editGasto=null;
const strip=o=>{const x={...o};delete x.id;return x};

function openPac(id){
  editPac=id||null;const f=$("#f-paciente");f.reset();$("#dp-err").textContent="";
  const p=id?S.pacientes[id]:{estado:"activo",creado:TODAY};
  PFIELDS.forEach(k=>{if(f.elements[k])f.elements[k].value=p[k]??""});
  $("#dp-title").textContent=id?"Editar paciente":"Nuevo paciente";$("#dlg-paciente").showModal();
}
$("#f-paciente").addEventListener("submit",async e=>{
  e.preventDefault();const f=e.target;const d={};PFIELDS.forEach(k=>d[k]=(f.elements[k].value||"").trim());
  if(!d.nombre||!d.apellidos||!d.diagnostico){$("#dp-err").textContent="Completa nombre, apellidos y diagnóstico.";return}
  d.sesionesPrescritas=d.sesionesPrescritas?Number(d.sesionesPrescritas):"";
  if(d.documento&&Object.values(S.pacientes).some(p=>p.id!==editPac&&p.documento===d.documento)){$("#dp-err").textContent="Ya existe un paciente con ese documento.";return}
  const id=editPac||uid();if(editPac&&S.pacientes[editPac].ejemplo)d.ejemplo=true;
  try{await put("pacientes",id,d);$("#dlg-paciente").close();S.sel=id;if(S.tab!=="pacientes")go("pacientes");else render();toast(editPac?"Paciente actualizado":"Paciente registrado")}catch(err){writeErr(err)}
});

function openCita(id,preset={}){
  if(!Object.keys(S.pacientes).length){toast("Registra un paciente antes de agendar citas.");return}
  editCita=id||null;const f=$("#f-cita");f.reset();$("#dc-err").textContent="";
  $("#c-paciente").innerHTML=`<option value="">Selecciona un paciente…</option>`+pacList().filter(p=>id||p.estado!=="alta"||p.id===preset.pac).map(p=>`<option value="${p.id}">${esc(nombre(p))}${p.documento?" · "+esc(p.documento):""}</option>`).join("");
  const c=id?{...S.citas[id]}:{pacienteId:preset.pac||"",fecha:preset.fecha||TODAY,hora:"09:00",duracion:60,estado:"programada",tipo:"",monto:S.config.precioSesion??"",pago:"pendiente",metodo:""};
  if(!id&&preset.pac){const last=citasOf(preset.pac).pop();if(last){c.tipo=last.tipo;c.duracion=last.duracion;c.hora=last.hora}}
  if(preset.cobrar){c.pago="pagado";if(!c.metodo)c.metodo="Efectivo"}
  CFIELDS.forEach(k=>f.elements[k].value=c[k]??"");if(!f.elements.pago.value)f.elements.pago.value="pendiente";
  $("#c-repetir-wrap").hidden=!!id;$("#dc-delete").hidden=!id;
  $("#dc-title").textContent=preset.cobrar?"Registrar pago":id?"Editar cita":"Nueva cita";$("#dlg-cita").showModal();
  if(preset.cobrar)setTimeout(()=>$("#c-metodo").focus(),30);
}
$("#c-paciente").addEventListener("change",e=>{if(editCita)return;const last=citasOf(e.target.value).pop();if(last){const f=$("#f-cita");if(!f.elements.tipo.value)f.elements.tipo.value=last.tipo}});
$("#c-pago").addEventListener("change",e=>{if(e.target.value==="pagado"&&!$("#c-metodo").value)$("#c-metodo").value="Efectivo"});
function conflict(c,ignore){
  if(c.estado==="cancelada")return null;const s=toMin(c.hora),e=s+(+c.duracion||60);
  for(const o of Object.values(S.citas)){if(o.id===ignore||o.fecha!==c.fecha||o.estado==="cancelada")continue;
    const os=toMin(o.hora),oe=os+(+o.duracion||60);
    if(s<oe&&os<e&&o.pacienteId===c.pacienteId)return `${nombre(S.pacientes[c.pacienteId])} ya tiene una cita de ${o.hora} a ${minToH(oe)} el ${fShort(c.fecha)}.`}
  return null;
}
$("#f-cita").addEventListener("submit",async e=>{
  e.preventDefault();const f=e.target;const d={};CFIELDS.forEach(k=>d[k]=(f.elements[k].value||"").trim());
  d.duracion=Number(d.duracion)||60;d.monto=d.monto===""?0:Math.max(0,Number(d.monto)||0);
  d.terapeuta=(editCita&&S.citas[editCita].terapeuta)||S.config.fisioterapeuta||"";
  if(!d.pacienteId||!d.fecha||!d.hora||!d.tipo){$("#dc-err").textContent="Completa paciente, fecha, hora y tipo de terapia.";return}
  if(d.pago==="pagado"&&!(d.monto>0)){$("#dc-err").textContent="Indica el monto cobrado.";return}
  const rep=editCita?0:Number(f.elements.repetir.value)||0;const items=[];const n=Math.max(1,rep);
  for(let i=0;i<n;i++){const x={...d,fecha:iso(addDays(parse(d.fecha),7*i))};
    if(i>0){if(x.estado!=="confirmada")x.estado="programada";x.pago="pendiente";x.metodo=""}
    const cf=conflict(x,editCita);if(cf){$("#dc-err").textContent=n>1?`Semana ${i+1}: ${cf}`:cf;return}
    items.push({col:"citas",id:editCita||uid()+i,data:x})}
  if(editCita&&S.citas[editCita].ejemplo)items[0].data.ejemplo=true;
  try{await putMany(items);$("#dlg-cita").close();toast(editCita?"Cita actualizada":n>1?`${n} citas agendadas`:"Cita agendada")}catch(err){writeErr(err)}
});
$("#dc-delete").addEventListener("click",async()=>{if(!editCita)return;const id=editCita;$("#dlg-cita").close();
  if(await confirmDlg("Eliminar cita","La cita se borrará de la agenda, de los reportes y de las finanzas. Si el paciente no asistirá, puedes marcarla como cancelada en su lugar.")){try{await del("citas",id);toast("Cita eliminada")}catch(e){writeErr(e)}}});

function buildEva(v){let h=`<label><input type="radio" name="eva" value="" ${v===""||v==null?"checked":""}><span>N/D</span></label>`;
  for(let i=0;i<=10;i++)h+=`<label style="--eva-c:${evaColor(i)}"><input type="radio" name="eva" value="${i}" ${String(v)===String(i)?"checked":""} aria-label="EVA ${i}"><span>${i}</span></label>`;$("#h-eva").innerHTML=h}
function openHist(id,pid){
  editHist=id||null;histPac=id?S.historial[id].pacienteId:pid;const f=$("#f-hist");f.reset();$("#dh-err").textContent="";
  const h=id?S.historial[id]:{fecha:TODAY,tipo:histOf(pid).length?"Nota de sesión":"Evaluación inicial",eva:""};
  ["fecha","tipo","motivo","hallazgos","tratamiento","plan"].forEach(k=>f.elements[k].value=h[k]??"");buildEva(h.eva);
  $("#dh-delete").hidden=!id;$("#dh-title").textContent=(id?"Editar registro · ":"Historial · ")+nombre(S.pacientes[histPac]);$("#dlg-hist").showModal();
}
$("#f-hist").addEventListener("submit",async e=>{
  e.preventDefault();const f=e.target;const d={pacienteId:histPac};["fecha","tipo","motivo","hallazgos","tratamiento","plan"].forEach(k=>d[k]=(f.elements[k].value||"").trim());
  const ev=(f.querySelector('input[name="eva"]:checked')||{}).value;d.eva=ev===""||ev==null?"":Number(ev);
  d.terapeuta=(editHist&&S.historial[editHist].terapeuta)||S.config.fisioterapeuta||"";
  if(!d.fecha){$("#dh-err").textContent="Indica la fecha del registro.";return}
  if(!d.motivo&&!d.hallazgos&&!d.tratamiento&&!d.plan&&d.eva===""){$("#dh-err").textContent="Escribe al menos un campo clínico.";return}
  if(editHist&&S.historial[editHist].ejemplo)d.ejemplo=true;
  try{await put("historial",editHist||uid(),d);
    if(d.tipo==="Alta"&&S.pacientes[histPac]&&S.pacientes[histPac].estado!=="alta"){await put("pacientes",histPac,{...strip(S.pacientes[histPac]),estado:"alta"})}
    $("#dlg-hist").close();toast(d.tipo==="Alta"?"Alta registrada":"Historial actualizado")}catch(err){writeErr(err)}
});
$("#dh-delete").addEventListener("click",async()=>{if(!editHist)return;const id=editHist;$("#dlg-hist").close();
  if(await confirmDlg("Eliminar registro","Esta entrada del historial clínico se borrará de forma permanente.")){try{await del("historial",id);toast("Registro eliminado")}catch(e){writeErr(e)}}});

$("#g-categoria").innerHTML=CATEGORIAS.map(c=>`<option>${esc(c)}</option>`).join("");
const GFIELDS=["concepto","fecha","monto","categoria","metodo","proveedor","notas"];
$("#i-categoria").innerHTML=CAT_ING.map(c=>`<option>${esc(c)}</option>`).join("");
const IFIELDS=["concepto","categoria","fecha","cantidad","precio","monto","metodo","pacienteId","notas"];
let editIng=null;
function openIngreso(id){
  editIng=id||null;const f=$("#f-ingreso");f.reset();$("#di-err").textContent="";
  $("#i-paciente").innerHTML=`<option value="">Sin paciente (venta al público)</option>`+pacList().map(p=>`<option value="${p.id}">${esc(nombre(p))}</option>`).join("");
  const x=id?S.ingresos[id]:{fecha:TODAY,categoria:CAT_ING[0],cantidad:1,metodo:"Efectivo"};
  if(x.categoria&&!CAT_ING.includes(x.categoria))$("#i-categoria").insertAdjacentHTML("beforeend",`<option>${esc(x.categoria)}</option>`);
  IFIELDS.forEach(k=>f.elements[k].value=x[k]??"");
  $("#di-delete").hidden=!id;$("#di-title").textContent=id?"Editar entrada":"Registrar entrada";$("#dlg-ingreso").showModal();
}
const recalc=()=>{const q=Number($("#i-cantidad").value)||0,pr=$("#i-precio").value;if(pr!==""&&q>0)$("#i-monto").value=(Math.round(q*Number(pr)*100)/100).toFixed(2)};
$("#i-cantidad").addEventListener("input",recalc);$("#i-precio").addEventListener("input",recalc);
$("#f-ingreso").addEventListener("submit",async e=>{
  e.preventDefault();const f=e.target;const d={};IFIELDS.forEach(k=>d[k]=(f.elements[k].value||"").trim());
  d.cantidad=Math.max(1,Number(d.cantidad)||1);d.precio=d.precio===""?"":Number(d.precio);d.monto=Number(d.monto);
  if(!d.concepto||!d.fecha||!(d.monto>0)){$("#di-err").textContent="Completa concepto, fecha y un total mayor que cero.";return}
  if(editIng&&S.ingresos[editIng].ejemplo)d.ejemplo=true;
  try{await put("ingresos",editIng||uid(),d);$("#dlg-ingreso").close();toast(editIng?"Entrada actualizada":"Entrada registrada")}catch(err){writeErr(err)}
});
$("#di-delete").addEventListener("click",async()=>{if(!editIng)return;const id=editIng;$("#dlg-ingreso").close();
  if(await confirmDlg("Eliminar entrada","Esta entrada se quitará de las finanzas y de los reportes exportados.")){try{await del("ingresos",id);toast("Entrada eliminada")}catch(e){writeErr(e)}}});
function openGasto(id){
  editGasto=id||null;const f=$("#f-gasto");f.reset();$("#dg-err").textContent="";
  const g=id?S.gastos[id]:{fecha:TODAY,categoria:"Mantenimiento"};
  if(g.categoria&&!CATEGORIAS.includes(g.categoria))$("#g-categoria").insertAdjacentHTML("beforeend",`<option>${esc(g.categoria)}</option>`);
  GFIELDS.forEach(k=>f.elements[k].value=g[k]??"");
  $("#dg-delete").hidden=!id;$("#dg-title").textContent=id?"Editar gasto":"Nuevo gasto";$("#dlg-gasto").showModal();
}
$("#f-gasto").addEventListener("submit",async e=>{
  e.preventDefault();const f=e.target;const d={};GFIELDS.forEach(k=>d[k]=(f.elements[k].value||"").trim());d.monto=Number(d.monto);
  if(!d.concepto||!d.fecha||!(d.monto>0)){$("#dg-err").textContent="Completa concepto, fecha y un monto mayor que cero.";return}
  if(editGasto&&S.gastos[editGasto].ejemplo)d.ejemplo=true;
  try{await put("gastos",editGasto||uid(),d);$("#dlg-gasto").close();toast(editGasto?"Gasto actualizado":"Gasto registrado")}catch(err){writeErr(err)}
});
$("#dg-delete").addEventListener("click",async()=>{if(!editGasto)return;const id=editGasto;$("#dlg-gasto").close();
  if(await confirmDlg("Eliminar gasto","Este gasto se quitará de las finanzas y de los reportes exportados.")){try{await del("gastos",id);toast("Gasto eliminado")}catch(e){writeErr(e)}}});

function openAjustes(){const f=$("#f-ajustes");f.reset();$("#da-err").textContent="";
  f.elements.fisioterapeuta.value=S.config.fisioterapeuta||"";f.elements.precioSesion.value=S.config.precioSesion??"";f.elements.moneda.value=S.config.moneda||"$";$("#a-usuario").textContent=S.usuario?"Sesión iniciada como "+S.usuario:"";$("#dlg-ajustes").showModal()}
$("#f-ajustes").addEventListener("submit",async e=>{
  e.preventDefault();const f=e.target;const d={fisioterapeuta:f.elements.fisioterapeuta.value.trim(),precioSesion:f.elements.precioSesion.value===""?"":Math.max(0,Number(f.elements.precioSesion.value)||0),moneda:f.elements.moneda.value.trim()||"$"};
  try{await put("config","clinica",d);$("#dlg-ajustes").close();toast("Ajustes guardados")}catch(err){writeErr(err)}
});

function confirmDlg(title,text){return new Promise(res=>{const d=$("#dlg-confirm");$("#cf-title").textContent=title;$("#cf-text").textContent=text;d.returnValue="";
  d.addEventListener("close",()=>res(d.returnValue==="si"),{once:true});d.showModal()})}
document.querySelectorAll("[data-close]").forEach(b=>b.addEventListener("click",()=>b.closest("dialog").close()));

/* ---------- eventos ---------- */
const TABS=["hoy","pacientes","citas","finanzas","reportes"];
function go(tab){S.tab=tab;try{if(location.hash!=="#"+tab)history.replaceState(null,"","#"+tab)}catch(_){}render();window.scrollTo(0,0)}
document.querySelectorAll("nav.tabs a").forEach(a=>a.addEventListener("click",e=>{e.preventDefault();go(a.dataset.tab)}));
document.addEventListener("click",async e=>{
  const t=e.target.closest("[data-act]");if(!t)return;const act=t.dataset.act,id=t.dataset.id;
  if(t.tagName==="A")e.preventDefault();
  switch(act){
    case "go":go(t.dataset.v);break;
    case "ajustes":openAjustes();break;
    case "logout":salir();break;
    case "reintentar":{iniciado=false;const {data:{session}}=await sb.auth.getSession();if(session)entrar(session);else pantalla("login");break}
    case "new-pac":openPac();break;
    case "edit-pac":openPac(id);break;
    case "open-pac":S.sel=id;if(S.tab!=="pacientes")go("pacientes");else render();break;
    case "back":S.sel=null;render();break;
    case "fpac":S.filtroPac=t.dataset.v;render();break;
    case "new-cita":openCita(null,{fecha:t.dataset.fecha,pac:t.dataset.pac});break;
    case "edit-cita":openCita(id);break;
    case "cobrar":openCita(id,{cobrar:true});break;
    case "new-hist":openHist(null,t.dataset.pac);break;
    case "edit-hist":openHist(id);break;
    case "new-gasto":openGasto();break;
    case "edit-gasto":openGasto(id);break;
    case "new-ingreso":openIngreso();break;
    case "edit-ingreso":openIngreso(id);break;
    case "st":{const c=S.citas[id];if(!c)break;const d={...strip(c),estado:t.dataset.st};
      if(t.dataset.st==="no_asistio"&&d.pago!=="pagado")d.monto=0;
      if(t.dataset.st==="completada"&&!(+d.monto>0)&&+S.config.precioSesion>0)d.monto=+S.config.precioSesion;
      try{await put("citas",id,d);toast(t.dataset.st==="completada"?"Asistencia registrada":"Marcada como no asistió")}catch(err){writeErr(err)}break}
    case "wk":{const d=+t.dataset.d;S.week=d?iso(addDays(parse(S.week),d)):iso(startOfWeek(new Date()));render();break}
    case "repP":S.repP=t.dataset.v;render();break;
    case "finP":S.finP=t.dataset.v;render();break;
    case "xls-fin":exportFin();break;
    case "xls-rep":exportRep();break;
    case "seed":seedExamples();break;
    case "clear-examples":clearExamples();break;
    case "del-pac":{const p=S.pacientes[id];const cs=Object.values(S.citas).filter(c=>c.pacienteId===id),hs=Object.values(S.historial).filter(h=>h.pacienteId===id);
      if(await confirmDlg("Eliminar paciente",`Se eliminará a ${nombre(p)} junto con ${cs.length} citas (incluidos sus pagos) y ${hs.length} registros de historial. Si terminó su tratamiento, considera registrar el alta en su lugar.`)){
        try{await delMany([...cs.map(c=>({col:"citas",id:c.id})),...hs.map(h=>({col:"historial",id:h.id}))]);await del("pacientes",id);S.sel=null;render();toast("Paciente eliminado")}catch(err){writeErr(err)}}
      break}
  }
});
document.addEventListener("input",e=>{if(e.target.id==="pac-q"){S.q=e.target.value;const l=$("#pac-list");if(l)l.innerHTML=pacListHTML()}});
document.addEventListener("change",e=>{const t=e.target;
  if(t.id==="wk-date"&&t.value){S.week=iso(startOfWeek(parse(t.value)));render()}
  if(t.id==="f-estado"){S.fEstado=t.value;render()}
  if(t.id==="rep-date"&&t.value){S.repD=t.value;render()}
  if(t.id==="fin-date"&&t.value){S.finD=t.value;render()}
});

/* ---------- arranque e inicio de sesión ---------- */
const h0=(location.hash||"").slice(1);if(TABS.includes(h0))S.tab=h0;
window.addEventListener("hashchange",()=>{const x=location.hash.slice(1);if(TABS.includes(x)&&x!==S.tab){S.tab=x;render()}});

function pantalla(cual){ // "setup" | "login" | "app"
  $("#setup").hidden=cual!=="setup";$("#auth").hidden=cual!=="login";
  document.body.classList.toggle("locked",cual!=="app");
}
function limpiar(){COLS.forEach(c=>S[c]={});S.config={};S.sel=null;Object.keys(S.loaded).forEach(k=>S.loaded[k]=false);S.mode="cargando"}
let iniciado=false;
async function entrar(session){
  if(iniciado)return;iniciado=true;
  S.usuario=session.user.email||"";pantalla("app");S.mode="cargando";render();
  try{
    const {data:ok,error}=await sb.rpc("es_miembro");
    if(error)throw error;
    if(!ok){iniciado=false;await sb.auth.signOut();$("#login-err").textContent=`El correo ${S.usuario} no está autorizado. Agrégalo a la tabla "miembros" en Supabase.`;pantalla("login");return}
    await loadAll();S.mode="db";render();suscribir();
  }catch(e){console.error(e);iniciado=false;
    $("#main").innerHTML=`<div class="empty"><h3>No se pudieron cargar los datos</h3><p>${esc(e.message||"Revisa tu conexión a internet y la configuración de Supabase.")}</p><div class="row"><button class="btn primary" data-act="reintentar">Reintentar</button></div></div>`}
}
$("#f-login").addEventListener("submit",async e=>{
  e.preventDefault();const f=e.target;const btn=f.querySelector("button[type=submit]");$("#login-err").textContent="";
  const email=f.elements.email.value.trim(),password=f.elements.password.value;
  if(!email||!password){$("#login-err").textContent="Escribe tu correo y tu contraseña.";return}
  btn.disabled=true;btn.textContent="Entrando…";
  const {data,error}=await sb.auth.signInWithPassword({email,password});
  btn.disabled=false;btn.textContent="Entrar";
  if(error){$("#login-err").textContent=/invalid/i.test(error.message)?"Correo o contraseña incorrectos.":error.message;return}
  f.reset();entrar(data.session);
});
async function salir(){if(canal){sb.removeChannel(canal);canal=null}await sb.auth.signOut();iniciado=false;limpiar();pantalla("login")}

(async()=>{
  if(!sb){pantalla("setup");return}
  sb.auth.onAuthStateChange((ev,session)=>{if(ev==="SIGNED_OUT"){iniciado=false;limpiar();pantalla("login")}});
  const {data:{session}}=await sb.auth.getSession();
  if(session)entrar(session);else pantalla("login");
  // Al volver a la app (por ejemplo, desde otra pestaña o al desbloquear el celular) se refrescan los datos
  document.addEventListener("visibilitychange",async()=>{
    if(document.visibilityState==="visible"&&S.mode==="db"){try{await loadAll();schedule()}catch(_){}}});
})();
})();
