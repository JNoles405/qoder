import { useState, useEffect, useRef, useCallback } from "react";

// ── Storage shim ──────────────────────────────────────────────────────────────
const store = {
  async get(k) { if (typeof window.storage?.get==="function") return window.storage.get(k); const v=localStorage.getItem(k); return v?{value:v}:null; },
  async set(k,v) { if (typeof window.storage?.set==="function") return window.storage.set(k,v); localStorage.setItem(k,v); },
};

function useIsMobile() {
  const [v,setV]=useState(window.innerWidth<768);
  useEffect(()=>{const h=()=>setV(window.innerWidth<768);window.addEventListener("resize",h);return()=>window.removeEventListener("resize",h);},[]);
  return v;
}

// ── Constants ─────────────────────────────────────────────────────────────────
const CFG_KEY    = "qoder-cfg-v2";
const APP_VER    = "v0.1.0";
const POLL_MS    = 10000;
const STORAGE_BUCKET = "qoder-files";

const STATUS_CONFIG = {
  planning: {label:"Planning",       color:"#8B8FA8",bg:"rgba(139,143,168,0.12)"},
  "in-dev": {label:"In Development", color:"#00D4FF",bg:"rgba(0,212,255,0.10)" },
  beta:     {label:"Beta",           color:"#FFB347",bg:"rgba(255,179,71,0.10)" },
  released: {label:"Released",       color:"#4ADE80",bg:"rgba(74,222,128,0.10)"},
  archived: {label:"Archived",       color:"#4B5268",bg:"rgba(75,82,104,0.10)" },
};
const TECH_TAGS=[
  "React","React Native","Capacitor","Electron","Node.js","Supabase","Firebase",
  "TypeScript","JavaScript","Python","Swift","Kotlin","Flutter","Vue","Next.js",
  "Expo","HTML/CSS","SQLite","PostgreSQL","MongoDB","Tailwind","Vite","Express",
];
const ASSET_TYPES=["Link","Icon","Splash Screen","Screenshot","Document","APK / Build","Other"];
const ASSET_ICONS={Link:"🔗",Icon:"🖼","Splash Screen":"📱",Screenshot:"🖥",Document:"📄","APK / Build":"📦",Other:"📎"};
const CONCEPT_TYPES=["text","color","image","code","audio","link"];
const CONCEPT_ICONS={text:"📝",color:"🎨",image:"🖼",code:"💻",audio:"🎙",link:"🔗"};
const FEED_META={
  version:     {icon:"⟳",label:"Version",      color:"#00D4FF"},
  milestone:   {icon:"◎",label:"Milestone Done",color:"#4ADE80"},
  todo:        {icon:"✓",label:"Task Done",     color:"#4ADE80"},
  note:        {icon:"⬝",label:"Note",          color:"#FFB347"},
  "issue-fixed":{icon:"🐛",label:"Issue Fixed", color:"#B47FFF"},
};
const TIME_PERIODS=[
  {key:"24h",label:"24h",ms:86400000},
  {key:"7d", label:"7d", ms:604800000},
  {key:"30d",label:"30d",ms:2592000000},
  {key:"90d",label:"90d",ms:7776000000},
  {key:"1y", label:"1y", ms:31536000000},
  {key:"all",label:"All",ms:null},
];
const DEFAULT_TABS=[
  {key:"overview",  label:"Overview"  },
  {key:"versions",  label:"Versions"  },
  {key:"milestones",label:"Milestones"},
  {key:"todos",     label:"To-Do"     },
  {key:"notes",     label:"Notes"     },
  {key:"assets",    label:"Assets"    },
  {key:"issues",    label:"Issues"    },
  {key:"ideas",     label:"Ideas"     },
  {key:"concepts",  label:"Concepts"  },
];

// ── Styled confirm dialog (replaces native confirm()) ─────────────────────────
// Module-level slot — root component sets this on mount
let _confirmResolver = null;
async function qConfirm(msg) {
  if (!_confirmResolver) return window.confirm(msg);
  return new Promise(resolve => _confirmResolver({ msg, resolve }));
}

function FolderIcon({size=13}){return(<svg width={size} height={size} viewBox="0 0 20 16" fill="none"><path d="M1 2.5C1 1.67 1.67 1 2.5 1H7.5L9.5 3.5H17.5C18.33 3.5 19 4.17 19 5V13.5C19 14.33 18.33 15 17.5 15H2.5C1.67 15 1 14.33 1 13.5V2.5Z" fill="#00d3fe" fillOpacity="0.18" stroke="#00d3fe" strokeWidth="1.4" strokeLinejoin="round"/></svg>);}

// ── Supabase client ───────────────────────────────────────────────────────────
const sb = {
  h(k,t){return{apikey:k,Authorization:`Bearer ${t||k}`,"Content-Type":"application/json",Prefer:"return=representation"};},
  async signIn(u,k,e,p){const r=await fetch(`${u}/auth/v1/token?grant_type=password`,{method:"POST",headers:{"Content-Type":"application/json",apikey:k},body:JSON.stringify({email:e,password:p})});return r.json();},
  async signUp(u,k,e,p){const r=await fetch(`${u}/auth/v1/signup`,{method:"POST",headers:{"Content-Type":"application/json",apikey:k},body:JSON.stringify({email:e,password:p})});return r.json();},
  async refresh(u,k,rt){const r=await fetch(`${u}/auth/v1/token?grant_type=refresh_token`,{method:"POST",headers:{"Content-Type":"application/json",apikey:k},body:JSON.stringify({refresh_token:rt})});return r.json();},
  async signOut(u,k,t){try{await fetch(`${u}/auth/v1/logout`,{method:"POST",headers:this.h(k,t)});}catch{}},
  async get(u,k,t,table,q=""){const r=await fetch(`${u}/rest/v1/${table}${q}`,{headers:this.h(k,t)});const d=await r.json();if(!r.ok)throw new Error(d.message||"Failed");return d;},
  async post(u,k,t,table,body){const r=await fetch(`${u}/rest/v1/${table}`,{method:"POST",headers:this.h(k,t),body:JSON.stringify(body)});const d=await r.json();if(!r.ok)throw new Error(d.message||"Insert failed");return Array.isArray(d)?d[0]:d;},
  async patch(u,k,t,table,id,body){const r=await fetch(`${u}/rest/v1/${table}?id=eq.${id}`,{method:"PATCH",headers:this.h(k,t),body:JSON.stringify(body)});const d=await r.json();return Array.isArray(d)?d[0]:d;},
  async del(u,k,t,table,id){await fetch(`${u}/rest/v1/${table}?id=eq.${id}`,{method:"DELETE",headers:this.h(k,t)});},
  async upsertSettings(u,k,t,userId,settings){
    const r=await fetch(`${u}/rest/v1/user_settings`,{method:"POST",headers:{...this.h(k,t),Prefer:"resolution=merge-duplicates,return=representation"},body:JSON.stringify({user_id:userId,...settings})});
    return r.json();
  },
  async uploadFile(u,k,t,userId,projectId,file){
    const ext=file.name.split(".").pop();
    const path=`${userId}/${projectId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const r=await fetch(`${u}/storage/v1/object/${STORAGE_BUCKET}/${path}`,{method:"POST",headers:{apikey:k,Authorization:`Bearer ${t}`,"Content-Type":file.type,"x-upsert":"true"},body:file});
    if(!r.ok){const d=await r.json();throw new Error(d.message||"Upload failed");}
    return `${u}/storage/v1/object/public/${STORAGE_BUCKET}/${path}`;
  },
};

// ── Data loader ───────────────────────────────────────────────────────────────
async function loadProjects(url,key,token,userId){
  const rows=await sb.get(url,key,token,"projects",`?user_id=eq.${userId}&order=position.asc`);
  if(!rows.length)return[];
  const ids=rows.map(p=>p.id).join(",");
  const [vers,miles,notes,todos,assets,issues,ideas,concepts]=await Promise.all([
    sb.get(url,key,token,"versions",  `?project_id=in.(${ids})&order=date.desc`),
    sb.get(url,key,token,"milestones",`?project_id=in.(${ids})&order=created_at.asc`),
    sb.get(url,key,token,"notes",     `?project_id=in.(${ids})&order=position.asc`),
    sb.get(url,key,token,"todos",     `?project_id=in.(${ids})&order=position.asc`),
    sb.get(url,key,token,"assets",    `?project_id=in.(${ids})&order=created_at.asc`),
    sb.get(url,key,token,"issues",    `?project_id=in.(${ids})&order=created_at.desc`),
    sb.get(url,key,token,"ideas",     `?project_id=in.(${ids})&order=position.asc`),
    sb.get(url,key,token,"concepts",  `?project_id=in.(${ids})&order=created_at.desc`),
  ]);
  return rows.map(p=>({
    id:p.id,name:p.name,description:p.description,status:p.status,
    techStack:p.tech_stack||[],localFolder:p.local_folder||null,
    gitUrl:p.git_url||"",supabaseUrl:p.supabase_url||"",vercelUrl:p.vercel_url||"",
    position:p.position,createdAt:p.created_at,
    versions:   vers.filter(v=>v.project_id===p.id).map(v=>({id:v.id,version:v.version,releaseNotes:v.release_notes,date:v.date,fileLinks:v.file_links||[]})),
    milestones: miles.filter(m=>m.project_id===p.id).map(m=>({id:m.id,title:m.title,description:m.description,date:m.date,completed:m.completed,completedAt:m.completed_at,createdAt:m.created_at})),
    notes:      notes.filter(n=>n.project_id===p.id).map(n=>({id:n.id,content:n.content,position:n.position,createdAt:n.created_at})),
    todos:      todos.filter(t=>t.project_id===p.id).map(t=>({id:t.id,text:t.text,completed:t.completed,completedAt:t.completed_at,position:t.position,createdAt:t.created_at})),
    assets:     assets.filter(a=>a.project_id===p.id).map(a=>({id:a.id,name:a.name,url:a.url,type:a.type,createdAt:a.created_at})),
    issues:     issues.filter(i=>i.project_id===p.id).map(i=>({id:i.id,title:i.title,description:i.description,status:i.status,fixDescription:i.fix_description,fixedAt:i.fixed_at,createdAt:i.created_at})),
    ideas:      ideas.filter(d=>d.project_id===p.id).map(d=>({id:d.id,content:d.content,pinned:d.pinned,position:d.position,createdAt:d.created_at})),
    concepts:   concepts.filter(c=>c.project_id===p.id).map(c=>({id:c.id,type:c.type,label:c.label,content:c.content,createdAt:c.created_at})),
  }));
}

// ── Root App ──────────────────────────────────────────────────────────────────
export default function QoderApp() {
  const [screen,      setScreen]      = useState("loading");
  const [cfg,         setCfg]         = useState(null);
  const [session,     setSession]     = useState(null);
  const [projects,    setProjects]    = useState([]);
  const [busy,        setBusy]        = useState(false);
  const [toast,       setToast]       = useState(null);
  const [view,        setView]        = useState("dashboard");
  const [selProj,     setSelProj]     = useState(null);
  const [projTab,     setProjTab]     = useState("overview");
  const [modal,       setModal]       = useState(null);
  const [form,        setForm]        = useState({});
  const [search,      setSearch]      = useState("");
  const [filter,      setFilter]      = useState("all");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [tabOrder,    setTabOrder]    = useState(DEFAULT_TABS);
  const [lightbox,    setLightbox]    = useState(null); // {url, name}
  const [confirmState,setConfirmState]= useState(null); // {msg, resolve}
  const isMobile = useIsMobile();
  const projRef  = useRef(projects);
  projRef.current = projects;

  const showToast = (msg,type="ok") => { setToast({msg,type}); setTimeout(()=>setToast(null),3500); };

  // Register the styled confirm dialog
  useEffect(() => {
    _confirmResolver = ({msg, resolve}) => setConfirmState({msg, resolve});
    return () => { _confirmResolver = null; };
  }, []);

  // ── Boot ────────────────────────────────────────────────────────────────────
  useEffect(()=>{
    (async()=>{
      try{
        const r=await store.get(CFG_KEY);
        if(!r){setScreen("setup");return;}
        const saved=JSON.parse(r.value);
        setCfg({url:saved.url,key:saved.key});
        if(saved.session?.refresh_token){
          const res=await sb.refresh(saved.url,saved.key,saved.session.refresh_token);
          if(res.access_token){
            const sess={access_token:res.access_token,refresh_token:res.refresh_token,user:res.user};
            setSession(sess);
            await persistCfg({url:saved.url,key:saved.key},sess);
            const pjs=await loadProjects(saved.url,saved.key,res.access_token,res.user.id);
            setProjects(pjs);
            // Load synced tab order
            try{
              const sett=await sb.get(saved.url,saved.key,res.access_token,"user_settings",`?user_id=eq.${res.user.id}`);
              if(sett?.[0]?.tab_order){
                const saved_tabs=sett[0].tab_order;
                const merged=mergeTabOrder(saved_tabs);
                setTabOrder(merged);
              }
            }catch{}
            setScreen("app");return;
          }
        }
        setScreen("auth");
      }catch{setScreen("setup");}
    })();
  },[]);

  const persistCfg=async(c,s)=>store.set(CFG_KEY,JSON.stringify({url:c.url,key:c.key,session:s||null}));

  const mergeTabOrder=(saved)=>{
    const existing=saved.filter(s=>DEFAULT_TABS.find(d=>d.key===s.key));
    const added=DEFAULT_TABS.filter(d=>!existing.find(e=>e.key===d.key));
    return[...existing,...added];
  };

  const saveTabOrderSync=async(order)=>{
    setTabOrder(order);
    if(!session||!cfg)return;
    try{await sb.upsertSettings(cfg.url,cfg.key,session.access_token,session.user.id,{tab_order:order});}catch{}
  };

  // ── Background sync ──────────────────────────────────────────────────────────
  useEffect(()=>{
    if(screen!=="app"||!cfg||!session)return;
    const refresh=async()=>{
      try{
        const pjs=await loadProjects(cfg.url,cfg.key,session.access_token,session.user.id);
        setProjects(pjs);
      }catch{}
    };
    const onFocus=()=>refresh();
    const onVisible=()=>{if(!document.hidden)refresh();};
    window.addEventListener("focus",onFocus);
    document.addEventListener("visibilitychange",onVisible);
    const iv=setInterval(refresh,POLL_MS);
    return()=>{window.removeEventListener("focus",onFocus);document.removeEventListener("visibilitychange",onVisible);clearInterval(iv);};
  },[screen,cfg,session]);

  // ── Keyboard shortcuts ───────────────────────────────────────────────────────
  useEffect(()=>{
    if(screen!=="app")return;
    const handler=(e)=>{
      // Ctrl+Enter — submit open modal
      if(e.ctrlKey&&e.key==="Enter"){
        const btn=document.querySelector(".q-modal-submit");
        if(btn){e.preventDefault();btn.click();}
        return;
      }
      // F5 — force refresh
      if(e.key==="F5"&&!e.ctrlKey){
        e.preventDefault();
        (async()=>{
          try{const pjs=await loadProjects(cfg.url,cfg.key,session.access_token,session.user.id);setProjects(pjs);showToast("Refreshed","ok");}catch{}
        })();
        return;
      }
      // Skip if typing in an input
      if(["INPUT","TEXTAREA","SELECT"].includes(document.activeElement?.tagName))return;
      // Ctrl+Up / Ctrl+PgUp — previous project
      if(e.ctrlKey&&(e.key==="ArrowUp"||e.key==="PageUp")){
        e.preventDefault();
        const pjs=projRef.current;
        if(!pjs.length)return;
        const idx=pjs.findIndex(p=>p.id===selProj?.id);
        const next=pjs[Math.max(0,idx-1)];
        if(next)openProject(next);
        return;
      }
      // Ctrl+Down / Ctrl+PgDn — next project
      if(e.ctrlKey&&(e.key==="ArrowDown"||e.key==="PageDown")){
        e.preventDefault();
        const pjs=projRef.current;
        if(!pjs.length)return;
        const idx=pjs.findIndex(p=>p.id===selProj?.id);
        const next=pjs[Math.min(pjs.length-1,idx+1)];
        if(next)openProject(next);
        return;
      }
      // Ctrl+Left — previous tab
      if(e.ctrlKey&&e.key==="ArrowLeft"&&view==="project"){
        e.preventDefault();
        const idx=tabOrder.findIndex(t=>t.key===projTab);
        if(idx>0)setProjTab(tabOrder[idx-1].key);
        return;
      }
      // Ctrl+Right — next tab
      if(e.ctrlKey&&e.key==="ArrowRight"&&view==="project"){
        e.preventDefault();
        const idx=tabOrder.findIndex(t=>t.key===projTab);
        if(idx<tabOrder.length-1)setProjTab(tabOrder[idx+1].key);
        return;
      }
    };
    window.addEventListener("keydown",handler);
    return()=>window.removeEventListener("keydown",handler);
  },[screen,cfg,session,selProj,view,projTab,tabOrder]);

  // ── Auth ────────────────────────────────────────────────────────────────────
  const handleSetup=async(url,key)=>{const c={url:url.replace(/\/$/,""),key};await store.set(CFG_KEY,JSON.stringify(c));setCfg(c);setScreen("auth");};
  const handleAuth=async(email,pw,isSignUp)=>{
    setBusy(true);
    try{
      const res=isSignUp?await sb.signUp(cfg.url,cfg.key,email,pw):await sb.signIn(cfg.url,cfg.key,email,pw);
      if(res.access_token){
        const sess={access_token:res.access_token,refresh_token:res.refresh_token,user:res.user};
        setSession(sess);await persistCfg(cfg,sess);
        const pjs=await loadProjects(cfg.url,cfg.key,res.access_token,res.user.id);
        setProjects(pjs);
        try{const sett=await sb.get(cfg.url,cfg.key,res.access_token,"user_settings",`?user_id=eq.${res.user.id}`);if(sett?.[0]?.tab_order){setTabOrder(mergeTabOrder(sett[0].tab_order));}}catch{}
        setScreen("app");
      }else if(isSignUp&&res.id){showToast("Check your email to confirm your account.","info");}
      else{showToast(res.error_description||res.msg||res.message||"Authentication failed","err");}
    }catch(e){showToast(e.message,"err");}
    setBusy(false);
  };
  const handleSignOut=async()=>{await sb.signOut(cfg.url,cfg.key,session.access_token);await store.set(CFG_KEY,JSON.stringify({url:cfg.url,key:cfg.key}));setSession(null);setProjects([]);setScreen("auth");};

  const T=()=>session.access_token;
  const mutate=(pid,fn)=>{const next=projects.map(p=>p.id===pid?fn(p):p);setProjects(next);setSelProj(next.find(p=>p.id===pid)||null);};

  // ── Project order sync ───────────────────────────────────────────────────────
  const reorderProjects=async(reordered)=>{
    setProjects(reordered);
    try{await Promise.all(reordered.map((p,i)=>sb.patch(cfg.url,cfg.key,T(),"projects",p.id,{position:i})));}catch{}
  };

  // ── Project CRUD ─────────────────────────────────────────────────────────────
  const addProject=async(p)=>{
    const position=projects.length;
    try{
      const row=await sb.post(cfg.url,cfg.key,T(),"projects",{user_id:session.user.id,name:p.name,description:p.description||null,status:p.status||"planning",tech_stack:p.techStack||[],local_folder:p.localFolder||null,git_url:p.gitUrl||null,supabase_url:p.supabaseUrl||null,vercel_url:p.vercelUrl||null,position});
      const proj={id:row.id,name:row.name,description:row.description,status:row.status,techStack:row.tech_stack||[],localFolder:row.local_folder||null,gitUrl:row.git_url||"",supabaseUrl:row.supabase_url||"",vercelUrl:row.vercel_url||"",position:row.position,createdAt:row.created_at,versions:[],milestones:[],notes:[],todos:[],assets:[],issues:[],ideas:[],concepts:[]};
      setProjects(ps=>[...ps,proj]);showToast("Project created");
    }catch(e){showToast(e.message,"err");}
  };
  const updateProject=async(id,p)=>{
    try{await sb.patch(cfg.url,cfg.key,T(),"projects",id,{name:p.name,description:p.description||null,status:p.status,tech_stack:p.techStack||[],local_folder:p.localFolder||null,git_url:p.gitUrl||null,supabase_url:p.supabaseUrl||null,vercel_url:p.vercelUrl||null});mutate(id,x=>({...x,...p}));showToast("Project updated");}
    catch(e){showToast(e.message,"err");}
  };
  const deleteProject=async(id)=>{
    try{await sb.del(cfg.url,cfg.key,T(),"projects",id);setProjects(ps=>ps.filter(p=>p.id!==id));setView("dashboard");setSelProj(null);showToast("Project deleted");}
    catch(e){showToast(e.message,"err");}
  };

  // ── Versions ─────────────────────────────────────────────────────────────────
  const addVersion=async(pid,v)=>{try{const row=await sb.post(cfg.url,cfg.key,T(),"versions",{project_id:pid,version:v.version,release_notes:v.releaseNotes||null,date:v.date||new Date().toISOString(),file_links:(v.fileLinks||[]).filter(Boolean)});mutate(pid,p=>({...p,versions:[{id:row.id,version:row.version,releaseNotes:row.release_notes,date:row.date,fileLinks:row.file_links||[]},...p.versions]}));showToast("Version logged");}catch(e){showToast(e.message,"err");}};
  const deleteVersion=async(pid,vid)=>{try{await sb.del(cfg.url,cfg.key,T(),"versions",vid);mutate(pid,p=>({...p,versions:p.versions.filter(v=>v.id!==vid)}));showToast("Version removed");}catch(e){showToast(e.message,"err");}};

  // ── Milestones ────────────────────────────────────────────────────────────────
  const addMilestone=async(pid,m)=>{try{const row=await sb.post(cfg.url,cfg.key,T(),"milestones",{project_id:pid,title:m.title,description:m.description||null,date:m.date||null,completed:false});mutate(pid,p=>({...p,milestones:[...p.milestones,{id:row.id,title:row.title,description:row.description,date:row.date,completed:false,completedAt:null,createdAt:row.created_at}]}));showToast("Milestone added");}catch(e){showToast(e.message,"err");}};
  const toggleMilestone=async(pid,mid)=>{const ms=projects.find(p=>p.id===pid)?.milestones.find(m=>m.id===mid);if(!ms)return;const completed=!ms.completed;const completedAt=completed?new Date().toISOString():null;try{await sb.patch(cfg.url,cfg.key,T(),"milestones",mid,{completed,completed_at:completedAt});mutate(pid,p=>({...p,milestones:p.milestones.map(m=>m.id===mid?{...m,completed,completedAt}:m)}));}catch(e){showToast(e.message,"err");}};
  const deleteMilestone=async(pid,mid)=>{try{await sb.del(cfg.url,cfg.key,T(),"milestones",mid);mutate(pid,p=>({...p,milestones:p.milestones.filter(m=>m.id!==mid)}));showToast("Milestone removed");}catch(e){showToast(e.message,"err");}};

  // ── Notes ─────────────────────────────────────────────────────────────────────
  const addNote=async(pid,content)=>{const position=projects.find(p=>p.id===pid)?.notes?.length||0;try{const row=await sb.post(cfg.url,cfg.key,T(),"notes",{project_id:pid,content,position});mutate(pid,p=>({...p,notes:[...p.notes,{id:row.id,content:row.content,position:row.position,createdAt:row.created_at}]}));showToast("Note added");}catch(e){showToast(e.message,"err");}};
  const updateNote=async(pid,nid,content)=>{try{await sb.patch(cfg.url,cfg.key,T(),"notes",nid,{content});mutate(pid,p=>({...p,notes:p.notes.map(n=>n.id===nid?{...n,content}:n)}));showToast("Note updated");}catch(e){showToast(e.message,"err");}};
  const deleteNote=async(pid,nid)=>{try{await sb.del(cfg.url,cfg.key,T(),"notes",nid);mutate(pid,p=>({...p,notes:p.notes.filter(n=>n.id!==nid)}));showToast("Note deleted");}catch(e){showToast(e.message,"err");}};
  const reorderNotes=async(pid,reordered)=>{mutate(pid,p=>({...p,notes:reordered}));try{await Promise.all(reordered.map((n,i)=>sb.patch(cfg.url,cfg.key,T(),"notes",n.id,{position:i})));}catch{}};

  // ── Todos ─────────────────────────────────────────────────────────────────────
  const addTodo=async(pid,text)=>{const position=projects.find(p=>p.id===pid)?.todos?.length||0;try{const row=await sb.post(cfg.url,cfg.key,T(),"todos",{project_id:pid,text,completed:false,position});mutate(pid,p=>({...p,todos:[...p.todos,{id:row.id,text:row.text,completed:false,completedAt:null,position:row.position,createdAt:row.created_at}]}));}catch(e){showToast(e.message,"err");}};
  const toggleTodo=async(pid,tid)=>{const todo=projects.find(p=>p.id===pid)?.todos.find(t=>t.id===tid);if(!todo)return;const completed=!todo.completed;const completedAt=completed?new Date().toISOString():null;try{await sb.patch(cfg.url,cfg.key,T(),"todos",tid,{completed,completed_at:completedAt});mutate(pid,p=>({...p,todos:p.todos.map(t=>t.id===tid?{...t,completed,completedAt}:t)}));}catch(e){showToast(e.message,"err");}};
  const deleteTodo=async(pid,tid)=>{try{await sb.del(cfg.url,cfg.key,T(),"todos",tid);mutate(pid,p=>({...p,todos:p.todos.filter(t=>t.id!==tid)}));}catch(e){showToast(e.message,"err");}};
  const reorderTodos=async(pid,reordered)=>{mutate(pid,p=>({...p,todos:reordered}));try{await Promise.all(reordered.map((t,i)=>sb.patch(cfg.url,cfg.key,T(),"todos",t.id,{position:i})));}catch{}};

  // ── Assets ────────────────────────────────────────────────────────────────────
  const addAsset=async(pid,a)=>{try{const row=await sb.post(cfg.url,cfg.key,T(),"assets",{project_id:pid,name:a.name,url:a.url,type:a.type||"Link"});mutate(pid,p=>({...p,assets:[...p.assets,{id:row.id,name:row.name,url:row.url,type:row.type,createdAt:row.created_at}]}));showToast("Asset added");}catch(e){showToast(e.message,"err");}};
  const deleteAsset=async(pid,aid)=>{try{await sb.del(cfg.url,cfg.key,T(),"assets",aid);mutate(pid,p=>({...p,assets:p.assets.filter(a=>a.id!==aid)}));showToast("Asset removed");}catch(e){showToast(e.message,"err");}};
  const uploadAssetFile=async(pid,file,name,type)=>{try{showToast("Uploading…","info");const url=await sb.uploadFile(cfg.url,cfg.key,T(),session.user.id,pid,file);await addAsset(pid,{name:name||file.name,url,type:type||"Screenshot"});}catch(e){showToast(e.message,"err");}};

  // ── Issues ────────────────────────────────────────────────────────────────────
  const addIssue=async(pid,iss)=>{try{const row=await sb.post(cfg.url,cfg.key,T(),"issues",{project_id:pid,title:iss.title,description:iss.description||null,status:"open"});mutate(pid,p=>({...p,issues:[{id:row.id,title:row.title,description:row.description,status:"open",fixDescription:null,fixedAt:null,createdAt:row.created_at},...p.issues]}));showToast("Issue logged");}catch(e){showToast(e.message,"err");}};
  const fixIssue=async(pid,iid,fixDescription)=>{
    const fixedAt=new Date().toISOString();
    try{
      await sb.patch(cfg.url,cfg.key,T(),"issues",iid,{status:"fixed",fix_description:fixDescription,fixed_at:fixedAt});
      const iss=projects.find(p=>p.id===pid)?.issues.find(i=>i.id===iid);
      const noteContent=`🐛 Fixed: ${iss?.title||"Issue"}\n\n${fixDescription}\n\nFixed: ${new Date(fixedAt).toLocaleString()}`;
      const position=projects.find(p=>p.id===pid)?.notes?.length||0;
      const noteRow=await sb.post(cfg.url,cfg.key,T(),"notes",{project_id:pid,content:noteContent,position});
      mutate(pid,p=>({...p,issues:p.issues.map(i=>i.id===iid?{...i,status:"fixed",fixDescription,fixedAt}:i),notes:[...p.notes,{id:noteRow.id,content:noteRow.content,position:noteRow.position,createdAt:noteRow.created_at}]}));
      showToast("Issue fixed — note created");
    }catch(e){showToast(e.message,"err");}
  };
  const deleteIssue=async(pid,iid)=>{try{await sb.del(cfg.url,cfg.key,T(),"issues",iid);mutate(pid,p=>({...p,issues:p.issues.filter(i=>i.id!==iid)}));showToast("Issue removed");}catch(e){showToast(e.message,"err");}};

  // ── Ideas ─────────────────────────────────────────────────────────────────────
  const addIdea=async(pid,content)=>{const position=projects.find(p=>p.id===pid)?.ideas?.length||0;try{const row=await sb.post(cfg.url,cfg.key,T(),"ideas",{project_id:pid,content,pinned:false,position});mutate(pid,p=>({...p,ideas:[...p.ideas,{id:row.id,content:row.content,pinned:false,position:row.position,createdAt:row.created_at}]}));showToast("Idea saved");}catch(e){showToast(e.message,"err");}};
  const updateIdea=async(pid,did,content)=>{try{await sb.patch(cfg.url,cfg.key,T(),"ideas",did,{content});mutate(pid,p=>({...p,ideas:p.ideas.map(d=>d.id===did?{...d,content}:d)}));showToast("Idea updated");}catch(e){showToast(e.message,"err");}};
  const toggleIdeaPin=async(pid,did)=>{const idea=projects.find(p=>p.id===pid)?.ideas.find(d=>d.id===did);if(!idea)return;try{await sb.patch(cfg.url,cfg.key,T(),"ideas",did,{pinned:!idea.pinned});mutate(pid,p=>({...p,ideas:p.ideas.map(d=>d.id===did?{...d,pinned:!d.pinned}:d)}));}catch(e){showToast(e.message,"err");}};
  const deleteIdea=async(pid,did)=>{try{await sb.del(cfg.url,cfg.key,T(),"ideas",did);mutate(pid,p=>({...p,ideas:p.ideas.filter(d=>d.id!==did)}));showToast("Idea removed");}catch(e){showToast(e.message,"err");}};
  const reorderIdeas=async(pid,reordered)=>{mutate(pid,p=>({...p,ideas:reordered}));try{await Promise.all(reordered.map((d,i)=>sb.patch(cfg.url,cfg.key,T(),"ideas",d.id,{position:i})));}catch{}};

  // ── Concepts ──────────────────────────────────────────────────────────────────
  const addConcept=async(pid,c)=>{try{const row=await sb.post(cfg.url,cfg.key,T(),"concepts",{project_id:pid,type:c.type||"text",label:c.label||null,content:c.content});mutate(pid,p=>({...p,concepts:[{id:row.id,type:row.type,label:row.label,content:row.content,createdAt:row.created_at},...p.concepts]}));showToast("Concept added");}catch(e){showToast(e.message,"err");}};
  const deleteConcept=async(pid,cid)=>{try{await sb.del(cfg.url,cfg.key,T(),"concepts",cid);mutate(pid,p=>({...p,concepts:p.concepts.filter(c=>c.id!==cid)}));showToast("Concept removed");}catch(e){showToast(e.message,"err");}};
  const uploadConceptFile=async(pid,file,label,type)=>{try{showToast("Uploading…","info");const url=await sb.uploadFile(cfg.url,cfg.key,T(),session.user.id,pid,file);await addConcept(pid,{type,label:label||file.name,content:url});}catch(e){showToast(e.message,"err");}};

  // ── Nav ───────────────────────────────────────────────────────────────────────
  const openProject=useCallback((proj)=>{
    const live=projRef.current.find(p=>p.id===proj.id)||proj;
    setSelProj(live);setProjTab(tab=>tab||"overview");setView("project");
    if(isMobile)setSidebarOpen(false);
  },[isMobile]);

  const openModal=(type,defaults={})=>{setForm(defaults);setModal(type);};
  const closeModal=()=>setModal(null);

  const filtered=projects
    .filter(p=>filter==="all"||p.status===filter)
    .filter(p=>p.name.toLowerCase().includes(search.toLowerCase())||(p.description||"").toLowerCase().includes(search.toLowerCase()));

  if(screen==="loading")return<Splash msg="Loading…"/>;
  if(screen==="setup")  return<SetupScreen onSubmit={handleSetup}/>;
  if(screen==="auth")   return<AuthScreen onAuth={handleAuth} busy={busy} onReset={()=>setScreen("setup")}/>;

  const liveProj=selProj?(projects.find(p=>p.id===selProj.id)||selProj):null;

  return(
    <div style={s.root} onKeyDown={e=>{/* captured globally */}}>
      <style>{css}</style>
      {toast&&<Toast {...toast}/>}
      {lightbox&&<Lightbox url={lightbox.url} name={lightbox.name} onClose={()=>setLightbox(null)}/>}
      {confirmState&&<ConfirmDialog msg={confirmState.msg} onYes={()=>{confirmState.resolve(true);setConfirmState(null);}} onNo={()=>{confirmState.resolve(false);setConfirmState(null);}}/>}
      {isMobile&&sidebarOpen&&<div style={s.mobileOverlay} onClick={()=>setSidebarOpen(false)}/>}

      {/* Sidebar */}
      <aside style={{...s.sidebar,transform:isMobile?(sidebarOpen?"translateX(0)":"translateX(-100%)"):"translateX(0)",transition:"transform .25s ease",position:isMobile?"fixed":"sticky",zIndex:isMobile?200:1}}>
        <div style={s.logo}>
          <span style={s.logoQ}>Q</span><span style={s.logoText}>oder</span>
          <span style={s.logoBeta}>{APP_VER}</span>
          {isMobile&&<button style={s.closeSidebar} onClick={()=>setSidebarOpen(false)}>✕</button>}
        </div>
        <nav style={s.nav}>
          <NavBtn active={view==="dashboard"} onClick={()=>{setView("dashboard");if(isMobile)setSidebarOpen(false);}} icon="◈" label="Dashboard"/>
          {projects.length>0&&<>
            <div style={s.navSection}>Projects</div>
            <DraggableSidebarList items={projects} onReorder={reorderProjects}>
              {p=><NavBtn active={selProj?.id===p.id&&view==="project"} onClick={()=>openProject(p)} icon={<span style={{color:STATUS_CONFIG[p.status]?.color,fontSize:9}}>●</span>} label={p.name} folder={p.localFolder} small/>}
            </DraggableSidebarList>
          </>}
        </nav>
        <div style={s.sidebarFoot}>
          <button className="q-btn-new" onClick={()=>{openModal("add-project",{status:"planning",techStack:[]});if(isMobile)setSidebarOpen(false);}}>+ New Project</button>
          <div style={s.userRow}>
            <span style={s.userEmail}>{session.user.email}</span>
            <button className="q-icon-btn" title="Settings" onClick={()=>openModal("settings",{})}>⚙</button>
            <button className="q-sign-out" onClick={handleSignOut} title="Sign out">⎋</button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main style={s.main}>
        {isMobile&&<div style={s.mobileHeader}><button style={s.hamburger} onClick={()=>setSidebarOpen(v=>!v)}>☰</button><div style={{display:"flex",alignItems:"baseline",gap:2}}><span style={{fontFamily:"'Syne'",fontSize:18,fontWeight:800,color:"#00D4FF"}}>Q</span><span style={{fontFamily:"'Syne'",fontSize:15,fontWeight:700,color:"#E8EAF6"}}>oder</span></div><button className="q-btn-primary" style={{padding:"6px 12px",fontSize:12}} onClick={()=>{openModal("add-project",{status:"planning",techStack:[]});setSidebarOpen(false);}}>+</button></div>}

        {view==="dashboard"&&<Dashboard projects={filtered} allProjects={projects} isMobile={isMobile} search={search} setSearch={setSearch} filter={filter} setFilter={setFilter} onOpen={openProject} onNew={()=>openModal("add-project",{status:"planning",techStack:[]})}/>}
        {view==="project"&&liveProj&&(
          <ProjectView project={liveProj} tab={projTab} setTab={setProjTab} isMobile={isMobile} tabOrder={tabOrder}
            onAddVersion={()=>openModal("add-version",{fileLinks:[""]})}
            onAddMilestone={()=>openModal("add-milestone",{})}
            onToggleMilestone={mid=>toggleMilestone(liveProj.id,mid)}
            onDeleteMilestone={mid=>deleteMilestone(liveProj.id,mid)}
            onDeleteVersion={vid=>deleteVersion(liveProj.id,vid)}
            onAddNote={()=>openModal("add-note",{})}
            onEditNote={n=>openModal("edit-note",{...n})}
            onDeleteNote={nid=>deleteNote(liveProj.id,nid)}
            onReorderNotes={r=>reorderNotes(liveProj.id,r)}
            onAddTodo={text=>addTodo(liveProj.id,text)}
            onToggleTodo={tid=>toggleTodo(liveProj.id,tid)}
            onDeleteTodo={tid=>deleteTodo(liveProj.id,tid)}
            onReorderTodos={r=>reorderTodos(liveProj.id,r)}
            onAddAsset={()=>openModal("add-asset",{type:"Link"})}
            onDeleteAsset={aid=>deleteAsset(liveProj.id,aid)}
            onUploadAssetFile={(file,name,type)=>uploadAssetFile(liveProj.id,file,name,type)}
            onAddIssue={()=>openModal("add-issue",{})}
            onFixIssue={iss=>openModal("fix-issue",{...iss})}
            onDeleteIssue={iid=>deleteIssue(liveProj.id,iid)}
            onAddIdea={()=>openModal("add-idea",{})}
            onEditIdea={idea=>openModal("edit-idea",{...idea})}
            onToggleIdeaPin={did=>toggleIdeaPin(liveProj.id,did)}
            onDeleteIdea={did=>deleteIdea(liveProj.id,did)}
            onReorderIdeas={r=>reorderIdeas(liveProj.id,r)}
            onAddConcept={()=>openModal("add-concept",{type:"text"})}
            onDeleteConcept={cid=>deleteConcept(liveProj.id,cid)}
            onUploadConceptFile={(file,label,type)=>uploadConceptFile(liveProj.id,file,label,type)}
            onLightbox={(url,name)=>setLightbox({url,name})}
            onEdit={()=>openModal("edit-project",{...liveProj})}
            onDelete={async()=>{if(await qConfirm("Delete this project? This cannot be undone."))deleteProject(liveProj.id);}}/>
        )}
      </main>

      {/* Modals */}
      {modal&&<ModalWrap onClose={closeModal}>
        {modal==="add-project"  &&<ProjectForm   data={form} setData={setForm} title="New Project"  onSubmit={d=>{addProject(d);closeModal();}}                          onCancel={closeModal}/>}
        {modal==="edit-project" &&<ProjectForm   data={form} setData={setForm} title="Edit Project" onSubmit={d=>{updateProject(selProj.id,d);closeModal();}}             onCancel={closeModal}/>}
        {modal==="add-version"  &&<VersionForm   data={form} setData={setForm} onSubmit={d=>{addVersion(selProj.id,d);closeModal();}}                                     onCancel={closeModal}/>}
        {modal==="add-milestone"&&<MilestoneForm data={form} setData={setForm} onSubmit={d=>{addMilestone(selProj.id,d);closeModal();}}                                   onCancel={closeModal}/>}
        {modal==="add-note"     &&<NoteForm      data={form} setData={setForm} title="Add Note"  onSubmit={d=>{addNote(selProj.id,d.content);closeModal();}}              onCancel={closeModal}/>}
        {modal==="edit-note"    &&<NoteForm      data={form} setData={setForm} title="Edit Note" onSubmit={d=>{updateNote(selProj.id,d.id,d.content);closeModal();}}      onCancel={closeModal}/>}
        {modal==="add-asset"    &&<AssetForm     data={form} setData={setForm} onSubmit={d=>{addAsset(selProj.id,d);closeModal();}}                                       onCancel={closeModal}/>}
        {modal==="add-issue"    &&<IssueForm     data={form} setData={setForm} onSubmit={d=>{addIssue(selProj.id,d);closeModal();}}                                       onCancel={closeModal}/>}
        {modal==="fix-issue"    &&<FixIssueModal data={form} setData={setForm} onSubmit={d=>{fixIssue(selProj.id,d.id,d.fixDescription);closeModal();}}                  onCancel={closeModal}/>}
        {modal==="add-idea"     &&<IdeaForm      data={form} setData={setForm} title="Add Idea"  onSubmit={d=>{addIdea(selProj.id,d.content);closeModal();}}              onCancel={closeModal}/>}
        {modal==="edit-idea"    &&<IdeaForm      data={form} setData={setForm} title="Edit Idea" onSubmit={d=>{updateIdea(selProj.id,d.id,d.content);closeModal();}}      onCancel={closeModal}/>}
        {modal==="add-concept"  &&<ConceptForm   data={form} setData={setForm} cfg={cfg} session={session} projectId={selProj?.id} onSubmit={d=>{addConcept(selProj.id,d);closeModal();}} onUploadFile={(file,label,type)=>{uploadConceptFile(selProj.id,file,label,type);closeModal();}} onCancel={closeModal}/>}
        {modal==="settings"     &&<SettingsModal tabOrder={tabOrder} onSave={order=>{saveTabOrderSync(order);closeModal();}} onCancel={closeModal}/>}
      </ModalWrap>}
    </div>
  );
}

// ── Lightbox ──────────────────────────────────────────────────────────────────
function Lightbox({url,name,onClose}){
  const download=()=>{const a=document.createElement("a");a.href=url;a.download=name||"download";a.target="_blank";a.click();};
  useEffect(()=>{const h=e=>{if(e.key==="Escape")onClose();};window.addEventListener("keydown",h);return()=>window.removeEventListener("keydown",h);},[]);
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.92)",zIndex:9000,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}} onClick={onClose}>
      <div style={{display:"flex",gap:12,marginBottom:16}} onClick={e=>e.stopPropagation()}>
        <button onClick={download} style={{padding:"8px 18px",background:"#00D4FF",color:"#06090F",border:"none",borderRadius:8,fontFamily:"'Syne'",fontWeight:700,fontSize:13,cursor:"pointer"}}>⬇ Download</button>
        <button onClick={onClose} style={{padding:"8px 14px",background:"rgba(255,255,255,.08)",border:"1px solid rgba(255,255,255,.15)",borderRadius:8,color:"#E8EAF6",fontFamily:"'Syne'",fontSize:13,cursor:"pointer"}}>✕ Close</button>
      </div>
      <img src={url} alt={name} onClick={e=>e.stopPropagation()} style={{maxWidth:"92vw",maxHeight:"80vh",objectFit:"contain",borderRadius:10,boxShadow:"0 16px 64px rgba(0,0,0,.8)"}}/>
      {name&&<div style={{fontFamily:"'JetBrains Mono'",fontSize:11,color:"#6B7290",marginTop:12}}>{name}</div>}
    </div>
  );
}

// ── Auth screens ──────────────────────────────────────────────────────────────
function SetupScreen({onSubmit}){
  const [url,setUrl]=useState("");const[key,setKey]=useState("");
  return(<div style={s.authWrap}><style>{css}</style><div style={s.authBox}>
    <div style={{textAlign:"center",marginBottom:28}}><div style={{fontFamily:"'Syne'",fontSize:48,fontWeight:800,color:"#00D4FF",lineHeight:1,marginBottom:4}}>Q</div><div style={{fontFamily:"'Syne'",fontSize:20,fontWeight:800,color:"#E8EAF6"}}>Connect Supabase</div></div>
    <Field label="Project URL"><input className="q-input" value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://xxxx.supabase.co"/></Field>
    <Field label="Anon / Public Key"><input className="q-input" value={key} onChange={e=>setKey(e.target.value)} placeholder="eyJhbGciOiJ…" style={{fontFamily:"'JetBrains Mono'",fontSize:12}}/></Field>
    <button className="q-btn-primary" style={{width:"100%",marginTop:8}} onClick={()=>url.trim()&&key.trim()&&onSubmit(url.trim(),key.trim())}>Connect →</button>
  </div></div>);
}
function AuthScreen({onAuth,busy,onReset}){
  const [isSignUp,setIsSignUp]=useState(false);const[email,setEmail]=useState("");const[pw,setPw]=useState("");const[showPw,setShowPw]=useState(false);
  return(<div style={s.authWrap}><style>{css}</style><div style={s.authBox}>
    <div style={{textAlign:"center",marginBottom:28}}><div style={{display:"flex",justifyContent:"center",alignItems:"baseline",gap:2,marginBottom:6}}><span style={{fontFamily:"'Syne'",fontSize:40,fontWeight:800,color:"#00D4FF"}}>Q</span><span style={{fontFamily:"'Syne'",fontSize:30,fontWeight:700,color:"#E8EAF6",letterSpacing:"-.5px"}}>oder</span></div><p style={{color:"#6B7290",fontSize:13}}>{isSignUp?"Create your account":"Sign in to your workspace"}</p></div>
    <Field label="Email"><input className="q-input" type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" onKeyDown={e=>e.key==="Enter"&&onAuth(email,pw,isSignUp)}/></Field>
    <Field label="Password"><div style={{position:"relative"}}><input className="q-input" type={showPw?"text":"password"} value={pw} onChange={e=>setPw(e.target.value)} placeholder="••••••••" style={{paddingRight:44}} onKeyDown={e=>e.key==="Enter"&&onAuth(email,pw,isSignUp)}/><button onClick={()=>setShowPw(v=>!v)} style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",color:"#6B7290",fontSize:12,background:"none",border:"none",cursor:"pointer"}}>{showPw?"hide":"show"}</button></div></Field>
    <button className="q-btn-primary" style={{width:"100%",marginTop:8,opacity:busy?.6:1}} disabled={busy} onClick={()=>onAuth(email,pw,isSignUp)}>{busy?"…":isSignUp?"Create Account":"Sign In →"}</button>
    <div style={{display:"flex",justifyContent:"space-between",marginTop:16,fontSize:13}}><button onClick={()=>setIsSignUp(v=>!v)} style={{color:"#00D4FF",background:"none",border:"none",cursor:"pointer"}}>{isSignUp?"Already have an account?":"Create an account"}</button><button onClick={onReset} style={{color:"#4B5268",background:"none",border:"none",cursor:"pointer",fontSize:12}}>Change project</button></div>
  </div></div>);
}

// ── NavBtn ────────────────────────────────────────────────────────────────────
function NavBtn({active,onClick,icon,label,small,folder}){
  const hasFolder=!!window.electronAPI?.openFolder&&!!folder;
  return(
    <div className={`q-nav${active?" q-nav-active":""}`} onClick={onClick} style={{fontSize:small?14:13,paddingLeft:small?22:14,display:"flex",alignItems:"center"}}>
      <span style={{fontSize:small?9:13,marginRight:7,display:"flex",alignItems:"center",flexShrink:0}}>{icon}</span>
      <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1,color:active?"#00D4FF":small?"#C8CBDF":"inherit",fontWeight:small?600:500}}>{label}</span>
      {hasFolder&&<button className="q-folder-btn" onClick={e=>{e.stopPropagation();window.electronAPI.openFolder(folder);}} title={folder}><FolderIcon size={13}/></button>}
    </div>
  );
}

// ── DraggableSidebarList ──────────────────────────────────────────────────────
function DraggableSidebarList({items,onReorder,children}){
  const [list,setList]=useState(items);const[dragIdx,setDragIdx]=useState(null);
  useEffect(()=>setList(items),[items]);
  const onDragStart=i=>setDragIdx(i);
  const onDragOver=(e,i)=>{e.preventDefault();if(dragIdx===null||dragIdx===i)return;const n=[...list];const[m]=n.splice(dragIdx,1);n.splice(i,0,m);setList(n);setDragIdx(i);};
  const onDrop=()=>{onReorder(list);setDragIdx(null);};
  return<>{list.map((item,i)=><div key={item.id} draggable onDragStart={()=>onDragStart(i)} onDragOver={e=>onDragOver(e,i)} onDrop={onDrop} onDragEnd={onDrop} style={{opacity:dragIdx===i?.35:1,transition:"opacity .1s",cursor:"grab"}}>{children(item,i)}</div>)}</>;
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
function Dashboard({projects,allProjects,isMobile,search,setSearch,filter,setFilter,onOpen,onNew}){
  const stats={total:allProjects.length,inDev:allProjects.filter(p=>p.status==="in-dev").length,released:allProjects.filter(p=>p.status==="released").length,open:allProjects.reduce((a,p)=>a+(p.milestones?.filter(m=>!m.completed).length||0),0)};
  return(
    <div style={{...s.page,padding:isMobile?"16px 14px":"36px 40px"}}>
      <div style={{...s.pageHead,marginBottom:isMobile?16:26}}>
        <div><h1 style={{...s.pageTitle,fontSize:isMobile?20:27}}>Dashboard</h1><p style={s.pageSub}>Cloud-synced across all devices</p></div>
        {!isMobile&&<button className="q-btn-primary" onClick={onNew}>+ New Project</button>}
      </div>
      <div style={{display:"grid",gridTemplateColumns:isMobile?"repeat(2,1fr)":"repeat(4,1fr)",gap:isMobile?8:12,marginBottom:isMobile?14:20}}>
        {[{label:isMobile?"Total":"Total Projects",value:stats.total,color:"#00D4FF"},{label:isMobile?"In Dev":"In Development",value:stats.inDev,color:"#FFB347"},{label:"Released",value:stats.released,color:"#4ADE80"},{label:isMobile?"Open":"Open Milestones",value:stats.open,color:"#FF6B9D"}].map(st=>(
          <div key={st.label} style={s.statCard}><div style={{...s.statVal,color:st.color,fontSize:isMobile?20:26}}>{st.value}</div><div style={s.statLbl}>{st.label}</div></div>
        ))}
      </div>
      <div style={{display:"flex",flexDirection:isMobile?"column":"row",gap:8,marginBottom:14}}>
        <input className="q-input" style={{maxWidth:isMobile?"100%":300,width:"100%",marginTop:0}} placeholder="Search projects…" value={search} onChange={e=>setSearch(e.target.value)}/>
        <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>{["all",...Object.keys(STATUS_CONFIG)].map(k=><button key={k} className={`q-chip${filter===k?" q-chip-on":""}`} onClick={()=>setFilter(k)}>{k==="all"?"All":STATUS_CONFIG[k].label}</button>)}</div>
      </div>
      {projects.length===0?(<div style={s.empty}><div style={s.emptyIcon}>⬡</div><p>{allProjects.length===0?"No projects yet.":"No projects match filters."}</p><button className="q-btn-primary" onClick={onNew}>+ New Project</button></div>):(
        <>{isMobile&&<button className="q-btn-primary" style={{width:"100%",marginBottom:12}} onClick={onNew}>+ New Project</button>}
        <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"repeat(auto-fill,minmax(270px,1fr))",gap:isMobile?10:13}}>{projects.map(p=><ProjectCard key={p.id} project={p} onClick={()=>onOpen(p)}/>)}</div></>
      )}
    </div>
  );
}

function ProjectCard({project,onClick}){
  const cfg=STATUS_CONFIG[project.status]||STATUS_CONFIG.planning;
  const latVer=project.versions?.[0]?.version||"—";
  const msTotal=project.milestones?.length||0;const msDone=project.milestones?.filter(m=>m.completed).length||0;
  const pct=msTotal>0?Math.round((msDone/msTotal)*100):null;
  return(
    <div className="q-card" onClick={onClick}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}><span style={{...s.badge,color:cfg.color,background:cfg.bg}}>{cfg.label}</span><span style={s.mono12}>{latVer}</span></div>
      <h3 style={s.cardTitle}>{project.name}</h3>
      {project.description&&<p style={s.cardDesc}>{project.description}</p>}
      {project.techStack?.length>0&&<div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:12}}>{project.techStack.slice(0,4).map(t=><span key={t} style={s.techChip}>{t}</span>)}{project.techStack.length>4&&<span style={s.techChip}>+{project.techStack.length-4}</span>}</div>}
      {pct!==null&&<div style={{display:"flex",alignItems:"center",gap:8}}><div style={s.bar}><div style={{...s.barFill,width:`${pct}%`}}/></div><span style={s.mono10}>{msDone}/{msTotal}</span></div>}
    </div>
  );
}

// ── ProjectView ───────────────────────────────────────────────────────────────
function ProjectView({project,tab,setTab,isMobile,tabOrder,onAddVersion,onAddMilestone,onToggleMilestone,onDeleteMilestone,onDeleteVersion,onAddNote,onEditNote,onDeleteNote,onReorderNotes,onAddTodo,onToggleTodo,onDeleteTodo,onReorderTodos,onAddAsset,onDeleteAsset,onUploadAssetFile,onAddIssue,onFixIssue,onDeleteIssue,onAddIdea,onEditIdea,onToggleIdeaPin,onDeleteIdea,onReorderIdeas,onAddConcept,onDeleteConcept,onUploadConceptFile,onLightbox,onEdit,onDelete}){
  const cfg=STATUS_CONFIG[project.status]||STATUS_CONFIG.planning;
  const latVer=project.versions?.[0]?.version||"—";
  const tabCounts={overview:null,versions:project.versions?.length||0,milestones:project.milestones?.length||0,todos:project.todos?.filter(t=>!t.completed).length||0,notes:project.notes?.length||0,assets:project.assets?.length||0,issues:project.issues?.filter(i=>i.status==="open").length||0,ideas:project.ideas?.length||0,concepts:project.concepts?.length||0};
  return(
    <div style={{...s.page,padding:isMobile?"14px":"36px 40px"}}>
      <div style={{...s.projHead,marginBottom:isMobile?14:22}}>
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6,flexWrap:"wrap"}}>
            <h1 style={{...s.pageTitle,fontSize:isMobile?18:27}}>{project.name}</h1>
            <span style={{...s.badge,color:cfg.color,background:cfg.bg,fontSize:11,padding:"3px 8px"}}>{cfg.label}</span>
          </div>
          {project.description&&<p style={s.pageSub}>{project.description}</p>}
          {/* Project links */}
          {(project.gitUrl||project.supabaseUrl||project.vercelUrl)&&(
            <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:10}}>
              {project.gitUrl&&<a href={project.gitUrl} target="_blank" rel="noreferrer" className="q-proj-link"><span>⎇</span> Git</a>}
              {project.supabaseUrl&&<a href={project.supabaseUrl} target="_blank" rel="noreferrer" className="q-proj-link"><span>⚡</span> Supabase</a>}
              {project.vercelUrl&&<a href={project.vercelUrl} target="_blank" rel="noreferrer" className="q-proj-link"><span>▲</span> Vercel</a>}
            </div>
          )}
        </div>
        <div style={{display:"flex",gap:6,flexShrink:0}}>
          <button className="q-btn-ghost" style={{padding:isMobile?"6px 10px":"9px 14px",fontSize:isMobile?12:13}} onClick={onEdit}>Edit</button>
          <button className="q-btn-danger" style={{padding:isMobile?"6px 10px":"9px 14px",fontSize:isMobile?12:13}} onClick={onDelete}>Delete</button>
        </div>
      </div>
      <div className="q-tab-bar">
        {tabOrder.map(t=>(
          <button key={t.key} className={`q-tab${tab===t.key?" q-tab-on":""}`} style={{padding:isMobile?"8px 11px":"10px 18px",fontSize:isMobile?12:13}} onClick={()=>setTab(t.key)}>
            {t.label}{tabCounts[t.key]>0&&<span style={s.tabPill}>{tabCounts[t.key]}</span>}
          </button>
        ))}
      </div>
      {tab==="overview"   &&<OverviewTab   project={project} latestVer={latVer}/>}
      {tab==="versions"   &&<VersionsTab   project={project} onAdd={onAddVersion}   onDelete={onDeleteVersion}/>}
      {tab==="milestones" &&<MilestonesTab project={project} onAdd={onAddMilestone} onToggle={onToggleMilestone} onDelete={onDeleteMilestone}/>}
      {tab==="todos"      &&<TodoTab       project={project} onAdd={onAddTodo}      onToggle={onToggleTodo}     onDelete={onDeleteTodo}     onReorder={onReorderTodos}/>}
      {tab==="notes"      &&<NotesTab      project={project} onAdd={onAddNote}      onEdit={onEditNote}         onDelete={onDeleteNote}     onReorder={onReorderNotes}/>}
      {tab==="assets"     &&<AssetsTab     project={project} onAdd={onAddAsset}     onDelete={onDeleteAsset}    onUploadFile={onUploadAssetFile} onLightbox={onLightbox}/>}
      {tab==="issues"     &&<IssuesTab     project={project} onAdd={onAddIssue}     onFix={onFixIssue}         onDelete={onDeleteIssue}/>}
      {tab==="ideas"      &&<IdeasTab      project={project} onAdd={onAddIdea}      onEdit={onEditIdea}        onPin={onToggleIdeaPin}    onDelete={onDeleteIdea}    onReorder={onReorderIdeas}/>}
      {tab==="concepts"   &&<ConceptsTab   project={project} onAdd={onAddConcept}   onDelete={onDeleteConcept} onUploadFile={onUploadConceptFile} onLightbox={onLightbox}/>}
    </div>
  );
}

// ── Overview Tab ──────────────────────────────────────────────────────────────
function OverviewTab({project,latestVer}){
  const [sortDir,setSortDir]=useState("desc");
  const [period,setPeriod]=useState("all");
  const [search,setSearch]=useState("");
  const msTotal=project.milestones?.length||0;const msDone=project.milestones?.filter(m=>m.completed).length||0;
  const pct=msTotal>0?Math.round((msDone/msTotal)*100):0;
  const rawItems=[];
  project.versions?.forEach(v=>rawItems.push({type:"version",id:v.id,date:new Date(v.date),title:v.version,content:v.releaseNotes}));
  project.milestones?.filter(m=>m.completed).forEach(m=>rawItems.push({type:"milestone",id:m.id,date:new Date(m.completedAt||m.date||m.createdAt),title:m.title,content:m.description}));
  project.todos?.filter(t=>t.completed&&t.completedAt).forEach(t=>rawItems.push({type:"todo",id:t.id,date:new Date(t.completedAt),title:t.text,content:null}));
  project.notes?.forEach(n=>rawItems.push({type:"note",id:n.id,date:new Date(n.createdAt),title:null,content:n.content}));
  project.issues?.filter(i=>i.status==="fixed").forEach(i=>rawItems.push({type:"issue-fixed",id:i.id,date:new Date(i.fixedAt||i.createdAt),title:i.title,content:i.fixDescription}));
  const cutoffMs=TIME_PERIODS.find(p=>p.key===period)?.ms||null;
  const now=Date.now();
  let items=cutoffMs?rawItems.filter(i=>now-i.date.getTime()<=cutoffMs):rawItems;
  if(search.trim()){const q=search.toLowerCase();items=items.filter(i=>(i.title||"").toLowerCase().includes(q)||(i.content||"").toLowerCase().includes(q));}
  items=[...items].sort((a,b)=>sortDir==="desc"?b.date-a.date:a.date-b.date);
  return(
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      <div style={s.statsGrid}>
        {[{label:"Current Version",value:latestVer,color:"#00D4FF"},{label:"Total Releases",value:project.versions?.length||0,color:"#fff"},{label:"Milestones",value:`${msDone}/${msTotal}`,color:"#fff"},{label:"Progress",value:`${pct}%`,color:"#4ADE80"}].map(st=>(
          <div key={st.label} style={s.statCard}><div style={{fontFamily:"'JetBrains Mono'",fontSize:20,fontWeight:700,color:st.color,lineHeight:1}}>{st.value}</div><div style={s.statLbl}>{st.label}</div></div>
        ))}
      </div>
      {msTotal>0&&<div style={s.infoCard}><div style={s.infoLbl}>Milestone Progress</div><div style={{...s.bar,height:8,marginTop:10}}><div style={{...s.barFill,width:`${pct}%`,height:8,transition:"width .6s"}}/></div><div style={{...s.mono10,marginTop:5,color:"#8B8FA8"}}>{msDone} of {msTotal} complete</div></div>}
      <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
        <input className="q-input" style={{flex:1,minWidth:140,maxWidth:260,marginTop:0}} placeholder="Search feed…" value={search} onChange={e=>setSearch(e.target.value)}/>
        <button className="q-chip" style={{fontFamily:"'JetBrains Mono'",fontSize:11}} onClick={()=>setSortDir(d=>d==="desc"?"asc":"desc")}>{sortDir==="desc"?"↓ Newest":"↑ Oldest"}</button>
        <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>{TIME_PERIODS.map(p=><button key={p.key} className={`q-chip${period===p.key?" q-chip-on":""}`} style={{fontSize:11,padding:"3px 9px"}} onClick={()=>setPeriod(p.key)}>{p.label}</button>)}</div>
      </div>
      {items.length===0?<div style={s.empty}><p>No activity for this period.</p></div>:(
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          {items.map(item=>{const meta=FEED_META[item.type]||FEED_META.note;return(
            <div key={`${item.type}-${item.id}`} style={{display:"flex",gap:12,padding:"12px 14px",background:"#111627",border:"1px solid #1A2040",borderRadius:10,alignItems:"flex-start"}}>
              <div style={{width:28,height:28,borderRadius:6,background:`${meta.color}14`,border:`1px solid ${meta.color}28`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,flexShrink:0,marginTop:1}}>{meta.icon}</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4,flexWrap:"wrap"}}>
                  <span style={{fontSize:10,fontFamily:"'JetBrains Mono'",color:meta.color,fontWeight:700,letterSpacing:.5}}>{meta.label.toUpperCase()}</span>
                  {item.title&&<span style={{color:"#E8EAF6",fontWeight:600,fontSize:14}}>{item.title}</span>}
                </div>
                {item.content&&<p style={{color:"#8B8FA8",fontSize:13,lineHeight:1.6,whiteSpace:"pre-wrap",wordBreak:"break-word"}}>{item.content.length>200?item.content.slice(0,200)+"…":item.content}</p>}
              </div>
              <div style={{...s.mono10,whiteSpace:"nowrap",flexShrink:0,marginTop:4}}>{item.date.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}</div>
            </div>
          );})}
        </div>
      )}
    </div>
  );
}

// ── Versions Tab ──────────────────────────────────────────────────────────────
function VersionsTab({project,onAdd,onDelete}){
  return(
    <div>
      <div style={s.tabBar}><span style={s.mono12}>{project.versions?.length||0} releases</span><button className="q-btn-primary" onClick={onAdd}>+ Log Version</button></div>
      {!project.versions?.length?<div style={s.empty}><p>No versions logged yet.</p></div>:(
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {project.versions.map((v,i)=>(
            <div key={v.id} className="q-ver-card">
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                <div style={{display:"flex",alignItems:"center",gap:10}}><span style={{fontFamily:"'JetBrains Mono'",color:"#00D4FF",fontWeight:700,fontSize:16}}>{v.version}</span>{i===0&&<span style={{...s.badge,color:"#4ADE80",background:"rgba(74,222,128,0.1)",fontSize:10}}>Latest</span>}</div>
                <div style={{display:"flex",alignItems:"center",gap:10}}><span style={s.mono10}>{new Date(v.date).toLocaleDateString()}</span><button className="q-del" onClick={async()=>{if(await qConfirm("Remove this version?"))onDelete(v.id);}}>✕</button></div>
              </div>
              {v.releaseNotes&&<p style={{color:"#B8BDD4",fontSize:14,lineHeight:1.65,marginBottom:10}}>{v.releaseNotes}</p>}
              {v.fileLinks?.filter(l=>l).length>0&&<div style={{display:"flex",flexWrap:"wrap",gap:7}}>{v.fileLinks.filter(l=>l).map((link,j)=><a key={j} href={link} target="_blank" rel="noreferrer" style={s.fileLink}>↗ {decodeURIComponent(link.split("/").pop()?.split("?")[0]||`File ${j+1}`).slice(0,42)}</a>)}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Milestones Tab ────────────────────────────────────────────────────────────
function MilestonesTab({project,onAdd,onToggle,onDelete}){
  const sorted=[...(project.milestones||[])].sort((a,b)=>new Date(a.date||0)-new Date(b.date||0));
  const all=[...sorted.filter(m=>!m.completed),...sorted.filter(m=>m.completed)];
  return(
    <div>
      <div style={s.tabBar}><span style={s.mono12}>{all.filter(m=>m.completed).length}/{all.length} completed</span><button className="q-btn-primary" onClick={onAdd}>+ Add Milestone</button></div>
      {all.length===0?<div style={s.empty}><p>No milestones yet.</p></div>:(
        <div style={{display:"flex",flexDirection:"column",gap:3}}>
          {all.map(m=>(
            <div key={m.id} className="q-ms-row" style={{opacity:m.completed?.55:1}}>
              <button className={`q-check${m.completed?" q-check-done":""}`} onClick={()=>onToggle(m.id)}>{m.completed&&"✓"}</button>
              <div style={{flex:1}}><span style={{color:"#E8EAF6",fontWeight:500,textDecoration:m.completed?"line-through":"none",fontSize:14}}>{m.title}</span>{m.description&&<p style={{color:"#8B8FA8",fontSize:12,marginTop:2}}>{m.description}</p>}</div>
              {m.date&&<span style={{...s.mono10,whiteSpace:"nowrap",color:new Date(m.date)<new Date()&&!m.completed?"#FF6B9D":"#8B8FA8"}}>{new Date(m.date).toLocaleDateString()}</span>}
              <button className="q-del" onClick={async()=>{if(await qConfirm("Remove this milestone?"))onDelete(m.id);}}>✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Todo Tab ──────────────────────────────────────────────────────────────────
function TodoTab({project,onAdd,onToggle,onDelete,onReorder}){
  const [newText,setNewText]=useState("");
  const todos=project.todos||[];const pending=todos.filter(t=>!t.completed);const done=todos.filter(t=>t.completed);
  const handleAdd=()=>{const t=newText.trim();if(!t)return;onAdd(t);setNewText("");};
  return(
    <div>
      <div style={s.tabBar}><span style={s.mono12}>{done.length}/{todos.length} completed</span></div>
      <div style={{display:"flex",gap:8,marginBottom:18}}><input className="q-input" style={{flex:1,marginTop:0}} value={newText} onChange={e=>setNewText(e.target.value)} placeholder="Add a to-do…" onKeyDown={e=>e.key==="Enter"&&handleAdd()}/><button className="q-btn-primary" style={{flexShrink:0,padding:"0 16px"}} onClick={handleAdd}>Add</button></div>
      {todos.length===0&&<div style={s.empty}><p>No to-do items yet.</p></div>}
      {pending.length>0&&<DraggableList items={pending} onReorder={r=>onReorder([...r,...done])}>{todo=><TodoRow todo={todo} onToggle={()=>onToggle(todo.id)} onDelete={async()=>{if(await qConfirm("Remove this item?"))onDelete(todo.id);}}/>}</DraggableList>}
      {done.length>0&&<><div style={{fontFamily:"'JetBrains Mono'",fontSize:10,color:"#4B5268",letterSpacing:1.2,textTransform:"uppercase",padding:"14px 0 6px",fontWeight:700}}>Completed ({done.length})</div>{done.map(todo=><TodoRow key={todo.id} todo={todo} onToggle={()=>onToggle(todo.id)} onDelete={async()=>{if(await qConfirm("Remove this item?"))onDelete(todo.id);}}/>)}</>}
    </div>
  );
}
function TodoRow({todo,onToggle,onDelete}){return(<div className="q-ms-row" style={{opacity:todo.completed?.5:1}}><span style={{color:"#3A4060",fontSize:16,cursor:"grab",userSelect:"none",flexShrink:0}}>⠿</span><button className={`q-check${todo.completed?" q-check-done":""}`} onClick={onToggle}>{todo.completed&&"✓"}</button><div style={{flex:1}}><span style={{color:"#E8EAF6",fontWeight:500,textDecoration:todo.completed?"line-through":"none",fontSize:14}}>{todo.text}</span>{todo.completed&&todo.completedAt&&<p style={{fontFamily:"'JetBrains Mono'",fontSize:10,color:"#4ADE80",marginTop:3,opacity:.75}}>✓ {new Date(todo.completedAt).toLocaleDateString()} at {new Date(todo.completedAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</p>}</div><button className="q-del" onClick={onDelete}>✕</button></div>);}

// ── Notes Tab ─────────────────────────────────────────────────────────────────
function NotesTab({project,onAdd,onEdit,onDelete,onReorder}){
  const notes=project.notes||[];
  return(<div><div style={s.tabBar}><span style={s.mono12}>{notes.length} {notes.length===1?"note":"notes"}</span><button className="q-btn-primary" onClick={onAdd}>+ Add Note</button></div>{notes.length===0?<div style={s.empty}><p>No notes yet.</p></div>:(<DraggableList items={notes} onReorder={onReorder}>{note=><div className="q-ver-card" style={{marginBottom:10}}><div style={{display:"flex",gap:10,alignItems:"flex-start"}}><span style={{color:"#3A4060",fontSize:18,cursor:"grab",userSelect:"none",flexShrink:0,marginTop:2}}>⠿</span><p style={{color:"#B8BDD4",fontSize:14,lineHeight:1.75,whiteSpace:"pre-wrap",flex:1}}>{note.content}</p><div style={{display:"flex",gap:6,flexShrink:0}}><button className="q-btn-ghost" style={{padding:"4px 10px",fontSize:12}} onClick={()=>onEdit(note)}>Edit</button><button className="q-del" onClick={async()=>{if(await qConfirm("Delete this note?"))onDelete(note.id);}}>✕</button></div></div><div style={{...s.mono10,marginTop:8,color:"#2E3558"}}>{new Date(note.createdAt).toLocaleDateString("en-US",{year:"numeric",month:"short",day:"numeric"})}</div></div>}</DraggableList>)}</div>);
}

// ── Assets Tab ────────────────────────────────────────────────────────────────
function AssetsTab({project,onAdd,onDelete,onUploadFile,onLightbox}){
  const assets=project.assets||[];
  const fileInput=useRef(null);
  const grouped=ASSET_TYPES.reduce((acc,type)=>{const items=assets.filter(a=>a.type===type);if(items.length)acc[type]=items;return acc;},{});
  const handleFilePick=e=>{const file=e.target.files?.[0];if(file){const type=file.type.startsWith("image/")?"Screenshot":"Document";onUploadFile(file,file.name,type);}e.target.value="";};
  const isImg=(url)=>/\.(jpg|jpeg|png|gif|webp|svg)(\?|$)/i.test(url)||(url||"").includes("/storage/v1/object/");
  return(
    <div>
      <div style={s.tabBar}>
        <span style={s.mono12}>{assets.length} {assets.length===1?"asset":"assets"}</span>
        <div style={{display:"flex",gap:8}}>
          <button className="q-btn-ghost" style={{fontSize:12,padding:"7px 12px"}} onClick={()=>fileInput.current?.click()}>⬆ Upload File</button>
          <button className="q-btn-primary" onClick={onAdd}>+ Add Link</button>
        </div>
      </div>
      <input ref={fileInput} type="file" accept="image/*,audio/*" style={{display:"none"}} onChange={handleFilePick}/>
      {assets.length===0?<div style={s.empty}><p>No assets yet.</p></div>:(
        <div style={{display:"flex",flexDirection:"column",gap:20}}>
          {Object.entries(grouped).map(([type,items])=>(
            <div key={type}>
              <div style={{fontFamily:"'JetBrains Mono'",fontSize:10,color:"#6B7290",letterSpacing:1.2,textTransform:"uppercase",fontWeight:700,marginBottom:8}}>{ASSET_ICONS[type]||"📎"} {type}</div>
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                {items.map(asset=>(
                  <div key={asset.id} className="q-ms-row">
                    {isImg(asset.url)&&<img src={asset.url} alt={asset.name} onClick={()=>onLightbox(asset.url,asset.name)} style={{width:48,height:48,objectFit:"cover",borderRadius:6,cursor:"pointer",flexShrink:0,border:"1px solid #1A2040"}}/>}
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{color:"#E8EAF6",fontWeight:500,fontSize:14}}>{asset.name}</div>
                      <a href={asset.url} target="_blank" rel="noreferrer" style={{...s.fileLink,marginTop:4,display:"inline-block",maxWidth:"100%",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>↗ {asset.url.length>60?asset.url.slice(0,60)+"…":asset.url}</a>
                    </div>
                    <button className="q-del" onClick={async()=>{if(await qConfirm("Remove this asset?"))onDelete(asset.id);}}>✕</button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Issues Tab ────────────────────────────────────────────────────────────────
function IssuesTab({project,onAdd,onFix,onDelete}){
  const issues=project.issues||[];const open=issues.filter(i=>i.status==="open");const fixed=issues.filter(i=>i.status==="fixed");
  return(
    <div>
      <div style={s.tabBar}><span style={s.mono12}>{open.length} open · {fixed.length} fixed</span><button className="q-btn-primary" onClick={onAdd}>+ Log Issue</button></div>
      {issues.length===0&&<div style={s.empty}><p>No issues logged. 🎉</p></div>}
      {open.length>0&&<div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:24}}>{open.map(iss=>(
        <div key={iss.id} className="q-ver-card">
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:10}}>
            <div style={{flex:1}}><div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}><span style={{width:8,height:8,borderRadius:"50%",background:"#FF6B9D",flexShrink:0,display:"inline-block"}}/><span style={{color:"#E8EAF6",fontWeight:600,fontSize:14}}>{iss.title}</span></div>{iss.description&&<p style={{color:"#8B8FA8",fontSize:13,lineHeight:1.6,marginLeft:16}}>{iss.description}</p>}<div style={{...s.mono10,marginTop:8,color:"#2E3558"}}>Logged {new Date(iss.createdAt).toLocaleDateString()}</div></div>
            <div style={{display:"flex",gap:6,flexShrink:0}}><button className="q-btn-ghost" style={{padding:"5px 12px",fontSize:12,borderColor:"rgba(74,222,128,.25)",color:"#4ADE80"}} onClick={()=>onFix(iss)}>Mark Fixed</button><button className="q-del" onClick={async()=>{if(await qConfirm("Remove this issue?"))onDelete(iss.id);}}>✕</button></div>
          </div>
        </div>
      ))}</div>}
      {fixed.length>0&&<><div style={{fontFamily:"'JetBrains Mono'",fontSize:10,color:"#4B5268",letterSpacing:1.2,textTransform:"uppercase",fontWeight:700,marginBottom:10}}>Fixed ({fixed.length})</div><div style={{display:"flex",flexDirection:"column",gap:6}}>{fixed.map(iss=>(<div key={iss.id} className="q-ms-row" style={{opacity:.55}}><span style={{width:8,height:8,borderRadius:"50%",background:"#4ADE80",flexShrink:0,marginTop:5}}/><div style={{flex:1}}><span style={{color:"#E8EAF6",fontSize:13,fontWeight:500,textDecoration:"line-through"}}>{iss.title}</span>{iss.fixDescription&&<p style={{color:"#6B7290",fontSize:12,marginTop:2}}>{iss.fixDescription}</p>}<div style={{...s.mono10,marginTop:3,color:"#2E3558"}}>{iss.fixedAt?new Date(iss.fixedAt).toLocaleDateString():""}</div></div><button className="q-del" onClick={async()=>{if(await qConfirm("Remove this issue?"))onDelete(iss.id);}}>✕</button></div>))}</div></>}
    </div>
  );
}

// ── Ideas Tab ─────────────────────────────────────────────────────────────────
function IdeasTab({project,onAdd,onEdit,onPin,onDelete,onReorder}){
  const ideas=project.ideas||[];const pinned=ideas.filter(d=>d.pinned);const rest=ideas.filter(d=>!d.pinned);
  return(
    <div>
      <div style={s.tabBar}><span style={s.mono12}>{ideas.length} {ideas.length===1?"idea":"ideas"} · {pinned.length} pinned</span><button className="q-btn-primary" onClick={onAdd}>+ Add Idea</button></div>
      {ideas.length===0&&<div style={s.empty}><p>No ideas yet.</p></div>}
      {pinned.length>0&&<><div style={{fontFamily:"'JetBrains Mono'",fontSize:10,color:"#FFB347",letterSpacing:1.2,textTransform:"uppercase",fontWeight:700,marginBottom:8}}>⭐ Pinned</div>{pinned.map(idea=><IdeaRow key={idea.id} idea={idea} onPin={()=>onPin(idea.id)} onEdit={()=>onEdit(idea)} onDelete={async()=>{if(await qConfirm("Remove this idea?"))onDelete(idea.id);}}/>)}{rest.length>0&&<div style={{height:1,background:"#1A2040",margin:"16px 0"}}/>}</>}
      {rest.length>0&&<DraggableList items={rest} onReorder={r=>onReorder([...pinned,...r])}>{idea=><IdeaRow idea={idea} onPin={()=>onPin(idea.id)} onEdit={()=>onEdit(idea)} onDelete={async()=>{if(await qConfirm("Remove this idea?"))onDelete(idea.id);}}/>}</DraggableList>}
    </div>
  );
}
function IdeaRow({idea,onPin,onEdit,onDelete}){
  return(<div className="q-ver-card" style={{marginBottom:8}}><div style={{display:"flex",gap:10,alignItems:"flex-start"}}><span style={{color:"#3A4060",fontSize:18,cursor:"grab",userSelect:"none",flexShrink:0,marginTop:2}}>⠿</span><p style={{color:"#B8BDD4",fontSize:14,lineHeight:1.7,whiteSpace:"pre-wrap",flex:1}}>{idea.content}</p><div style={{display:"flex",gap:4,flexShrink:0}}><button onClick={onPin} title={idea.pinned?"Unpin":"Pin"} style={{fontSize:15,padding:"2px 4px",opacity:idea.pinned?1:.4,transition:"opacity .15s",background:"none",border:"none",cursor:"pointer"}}>⭐</button><button className="q-btn-ghost" style={{padding:"4px 8px",fontSize:12}} onClick={onEdit}>Edit</button><button className="q-del" onClick={onDelete}>✕</button></div></div><div style={{...s.mono10,marginTop:8,color:"#2E3558"}}>{new Date(idea.createdAt).toLocaleDateString("en-US",{year:"numeric",month:"short",day:"numeric"})}</div></div>);
}

// ── Concepts Tab ──────────────────────────────────────────────────────────────
function ConceptsTab({project,onAdd,onDelete,onUploadFile,onLightbox}){
  const concepts=project.concepts||[];
  const fileInput=useRef(null);
  const handleFilePick=e=>{const file=e.target.files?.[0];if(file){const type=file.type.startsWith("audio/")?"audio":"image";onUploadFile(file,file.name,type);}e.target.value="";};
  const byType=CONCEPT_TYPES.reduce((acc,t)=>{const items=concepts.filter(c=>c.type===t);if(items.length)acc[t]=items;return acc;},{});
  return(
    <div>
      <div style={s.tabBar}>
        <span style={s.mono12}>{concepts.length} {concepts.length===1?"concept":"concepts"}</span>
        <div style={{display:"flex",gap:8}}>
          <button className="q-btn-ghost" style={{fontSize:12,padding:"7px 12px"}} onClick={()=>fileInput.current?.click()}>⬆ Upload</button>
          <button className="q-btn-primary" onClick={onAdd}>+ Add Concept</button>
        </div>
      </div>
      <input ref={fileInput} type="file" accept="image/*,audio/*" style={{display:"none"}} onChange={handleFilePick}/>
      {concepts.length===0?<div style={s.empty}><p>No concepts yet. Add colors, images, code, audio…</p></div>:(
        <div style={{display:"flex",flexDirection:"column",gap:24}}>
          {Object.entries(byType).map(([type,items])=>(
            <div key={type}>
              <div style={{fontFamily:"'JetBrains Mono'",fontSize:10,color:"#6B7290",letterSpacing:1.2,textTransform:"uppercase",fontWeight:700,marginBottom:10}}>{CONCEPT_ICONS[type]} {type}</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:10}}>
                {items.map(c=><ConceptCard key={c.id} concept={c} onDelete={async()=>{if(await qConfirm("Remove this concept?"))onDelete(c.id);}} onLightbox={onLightbox}/>)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
function ConceptCard({concept,onDelete,onLightbox}){
  const isColor=concept.type==="color";const isImage=concept.type==="image";const isAudio=concept.type==="audio";const isCode=concept.type==="code";const isLink=concept.type==="link";
  return(
    <div style={{background:"#111627",border:"1px solid #1A2040",borderRadius:10,padding:14,position:"relative"}} className="q-ver-card">
      <button className="q-del" onClick={onDelete} style={{position:"absolute",top:8,right:8}}>✕</button>
      {concept.label&&<div style={{fontSize:11,color:"#6B7290",marginBottom:8,paddingRight:20,fontWeight:600}}>{concept.label}</div>}
      {isColor&&<><div style={{width:"100%",height:72,borderRadius:6,background:concept.content,marginBottom:8,boxShadow:"inset 0 0 0 1px rgba(255,255,255,.08)"}}/><div style={{fontFamily:"'JetBrains Mono'",fontSize:12,color:"#E8EAF6"}}>{concept.content}</div></>}
      {isImage&&<img src={concept.content} alt={concept.label||"concept"} onClick={()=>onLightbox(concept.content,concept.label)} style={{width:"100%",borderRadius:6,objectFit:"cover",maxHeight:180,display:"block",cursor:"pointer"}} onError={e=>e.target.style.display="none"}/>}
      {isAudio&&<audio src={concept.content} controls style={{width:"100%",marginTop:4}}/>}
      {isCode&&<pre style={{fontFamily:"'JetBrains Mono'",fontSize:11,color:"#B8BDD4",whiteSpace:"pre-wrap",wordBreak:"break-all",background:"#0A0E1A",padding:10,borderRadius:6,maxHeight:160,overflow:"auto",margin:0}}>{concept.content}</pre>}
      {isLink&&<a href={concept.content} target="_blank" rel="noreferrer" style={{...s.fileLink,display:"block",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>↗ {concept.content}</a>}
      {!isColor&&!isImage&&!isAudio&&!isCode&&!isLink&&<p style={{color:"#B8BDD4",fontSize:13,lineHeight:1.65,whiteSpace:"pre-wrap"}}>{concept.content}</p>}
    </div>
  );
}

// ── DraggableList ─────────────────────────────────────────────────────────────
function DraggableList({items,onReorder,children}){
  const [list,setList]=useState(items);const[dragIdx,setDragIdx]=useState(null);
  useEffect(()=>setList(items),[items]);
  const onDragStart=i=>setDragIdx(i);
  const onDragOver=(e,i)=>{e.preventDefault();if(dragIdx===null||dragIdx===i)return;const n=[...list];const[m]=n.splice(dragIdx,1);n.splice(i,0,m);setList(n);setDragIdx(i);};
  const onDrop=()=>{onReorder(list);setDragIdx(null);};
  return<div>{list.map((item,i)=><div key={item.id} draggable onDragStart={()=>onDragStart(i)} onDragOver={e=>onDragOver(e,i)} onDrop={onDrop} onDragEnd={onDrop} style={{opacity:dragIdx===i?.35:1,transition:"opacity .1s"}}>{children(item,i)}</div>)}</div>;
}

// ── Settings Modal ────────────────────────────────────────────────────────────
function SettingsModal({tabOrder,onSave,onCancel}){
  const [order,setOrder]=useState(tabOrder);const[dragIdx,setDragIdx]=useState(null);
  const onDragStart=i=>setDragIdx(i);
  const onDragOver=(e,i)=>{e.preventDefault();if(dragIdx===null||dragIdx===i)return;const n=[...order];const[m]=n.splice(dragIdx,1);n.splice(i,0,m);setOrder(n);setDragIdx(i);};
  const onDrop=()=>setDragIdx(null);
  return(
    <div>
      <h2 style={s.modalTitle}>Settings</h2>
      <div style={{fontFamily:"'JetBrains Mono'",fontSize:10,color:"#6B7290",letterSpacing:".8px",textTransform:"uppercase",fontWeight:700,marginBottom:12}}>Tab Order — drag to rearrange</div>
      <div style={{display:"flex",flexDirection:"column",gap:4,marginBottom:14}}>
        {order.map((tab,i)=>(
          <div key={tab.key} draggable onDragStart={()=>onDragStart(i)} onDragOver={e=>onDragOver(e,i)} onDrop={onDrop} onDragEnd={onDrop}
            style={{display:"flex",alignItems:"center",gap:12,padding:"10px 14px",background:dragIdx===i?"rgba(0,212,255,.04)":"#0D1120",border:"1px solid #1E2540",borderRadius:8,cursor:"grab",opacity:dragIdx===i?.4:1}}>
            <span style={{color:"#3A4060",fontSize:16,userSelect:"none"}}>⠿</span>
            <span style={{color:"#C0C6E0",fontFamily:"'Syne'",fontWeight:600,fontSize:14,flex:1}}>{tab.label}</span>
            <span style={{fontFamily:"'JetBrains Mono'",fontSize:10,color:"#4B5268"}}>{tab.key}</span>
          </div>
        ))}
      </div>
      <div style={{padding:"10px 14px",background:"rgba(0,212,255,.04)",borderRadius:8,border:"1px solid rgba(0,212,255,.08)",marginBottom:4}}>
        <p style={{fontSize:12,color:"#6B7290",lineHeight:1.6}}>Tab order syncs across all your devices via Supabase.<br/>Keyboard shortcuts: <span style={{fontFamily:"'JetBrains Mono'",color:"#8B8FA8"}}>Ctrl+← / Ctrl+→</span> cycle tabs · <span style={{fontFamily:"'JetBrains Mono'",color:"#8B8FA8"}}>Ctrl+↑↓</span> cycle projects · <span style={{fontFamily:"'JetBrains Mono'",color:"#8B8FA8"}}>Ctrl+Enter</span> submit · <span style={{fontFamily:"'JetBrains Mono'",color:"#8B8FA8"}}>F5</span> refresh</p>
      </div>
      <FormActions onCancel={onCancel} onSubmit={()=>onSave(order)} submitLabel="Save Settings"/>
    </div>
  );
}

// ── Forms ─────────────────────────────────────────────────────────────────────
function ProjectForm({data,setData,title,onSubmit,onCancel}){
  const set=(k,v)=>setData(d=>({...d,[k]:v}));
  const tog=t=>set("techStack",(data.techStack||[]).includes(t)?(data.techStack||[]).filter(x=>x!==t):[...(data.techStack||[]),t]);
  const isElectron=!!window.electronAPI?.selectFolder;
  const browseFolder=async()=>{const p=await window.electronAPI.selectFolder();if(p)set("localFolder",p);};
  return(
    <div>
      <h2 style={s.modalTitle}>{title}</h2>
      <Field label="Project Name *"><input className="q-input" value={data.name||""} onChange={e=>set("name",e.target.value)} placeholder="e.g., CarKeep"/></Field>
      <Field label="Description"><textarea className="q-input" style={{height:72,resize:"vertical"}} value={data.description||""} onChange={e=>set("description",e.target.value)} placeholder="What does this project do?"/></Field>
      <Field label="Status"><select className="q-input" value={data.status||"planning"} onChange={e=>set("status",e.target.value)}>{Object.entries(STATUS_CONFIG).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select></Field>
      <Field label="Git Repository URL"><input className="q-input" value={data.gitUrl||""} onChange={e=>set("gitUrl",e.target.value)} placeholder="https://github.com/…"/></Field>
      <Field label="Supabase Project URL"><input className="q-input" value={data.supabaseUrl||""} onChange={e=>set("supabaseUrl",e.target.value)} placeholder="https://supabase.com/dashboard/project/…"/></Field>
      <Field label="Vercel Project URL"><input className="q-input" value={data.vercelUrl||""} onChange={e=>set("vercelUrl",e.target.value)} placeholder="https://vercel.com/…"/></Field>
      <Field label="Local Folder">
        <div style={{display:"flex",gap:8}}><input className="q-input" style={{flex:1,fontFamily:"'JetBrains Mono'",fontSize:12}} value={data.localFolder||""} onChange={e=>set("localFolder",e.target.value)} placeholder="Folder path…"/>{isElectron&&<button className="q-btn-ghost" style={{flexShrink:0,marginTop:6}} onClick={browseFolder}>Browse</button>}</div>
      </Field>
      <Field label="Tech Stack"><div style={{display:"flex",flexWrap:"wrap",gap:6,marginTop:8}}>{TECH_TAGS.map(t=><button key={t} className={`q-chip${(data.techStack||[]).includes(t)?" q-chip-on":""}`} onClick={()=>tog(t)}>{t}</button>)}</div></Field>
      <FormActions onCancel={onCancel} onSubmit={()=>data.name?.trim()&&onSubmit(data)} submitLabel={title==="Edit Project"?"Save Changes":"Create Project"}/>
    </div>
  );
}
function VersionForm({data,setData,onSubmit,onCancel}){
  const set=(k,v)=>setData(d=>({...d,[k]:v}));
  const updLink=(i,v)=>setData(d=>({...d,fileLinks:d.fileLinks.map((l,j)=>j===i?v:l)}));
  const addLink=()=>setData(d=>({...d,fileLinks:[...(d.fileLinks||[]),""]  }));
  const rmLink=i=>setData(d=>({...d,fileLinks:d.fileLinks.filter((_,j)=>j!==i)}));
  const today=new Date().toISOString().split("T")[0];
  return(<div><h2 style={s.modalTitle}>Log New Version</h2><Field label="Version Number *"><input className="q-input q-mono" value={data.version||""} onChange={e=>set("version",e.target.value)} placeholder="e.g., v1.2.0"/></Field><Field label="Release Date"><input type="date" className="q-input" value={data.date?.split("T")[0]||today} onChange={e=>set("date",e.target.value)}/></Field><Field label="Release Notes"><textarea className="q-input" style={{height:90,resize:"vertical"}} value={data.releaseNotes||""} onChange={e=>set("releaseNotes",e.target.value)} placeholder="What changed?"/></Field><Field label="File / Download Links">{(data.fileLinks||[]).map((link,i)=><div key={i} style={{display:"flex",gap:8,marginTop:8}}><input className="q-input" style={{flex:1}} value={link} onChange={e=>updLink(i,e.target.value)} placeholder="https://…"/><button className="q-btn-ghost" style={{padding:"0 12px"}} onClick={()=>rmLink(i)}>✕</button></div>)}<button className="q-btn-ghost" style={{marginTop:8,fontSize:12}} onClick={addLink}>+ Add Link</button></Field><FormActions onCancel={onCancel} onSubmit={()=>data.version?.trim()&&onSubmit(data)} submitLabel="Log Version"/></div>);
}
function MilestoneForm({data,setData,onSubmit,onCancel}){const set=(k,v)=>setData(d=>({...d,[k]:v}));return(<div><h2 style={s.modalTitle}>Add Milestone</h2><Field label="Title *"><input className="q-input" value={data.title||""} onChange={e=>set("title",e.target.value)} placeholder="e.g., Submit to Play Store"/></Field><Field label="Target Date"><input type="date" className="q-input" value={data.date||""} onChange={e=>set("date",e.target.value)}/></Field><Field label="Description"><textarea className="q-input" style={{height:72,resize:"vertical"}} value={data.description||""} onChange={e=>set("description",e.target.value)} placeholder="Optional…"/></Field><FormActions onCancel={onCancel} onSubmit={()=>data.title?.trim()&&onSubmit(data)} submitLabel="Add Milestone"/></div>);}
function NoteForm({data,setData,title,onSubmit,onCancel}){const set=(k,v)=>setData(d=>({...d,[k]:v}));return(<div><h2 style={s.modalTitle}>{title}</h2><Field label="Content *"><textarea className="q-input" style={{height:160,resize:"vertical"}} autoFocus value={data.content||""} onChange={e=>set("content",e.target.value)} placeholder="Write your note…"/></Field><FormActions onCancel={onCancel} onSubmit={()=>data.content?.trim()&&onSubmit(data)} submitLabel="Save Note"/></div>);}
function AssetForm({data,setData,onSubmit,onCancel}){const set=(k,v)=>setData(d=>({...d,[k]:v}));return(<div><h2 style={s.modalTitle}>Add Asset Link</h2><Field label="Name *"><input className="q-input" value={data.name||""} onChange={e=>set("name",e.target.value)} placeholder="e.g., Play Store Icon"/></Field><Field label="URL *"><input className="q-input" value={data.url||""} onChange={e=>set("url",e.target.value)} placeholder="https://…"/></Field><Field label="Type"><select className="q-input" value={data.type||"Link"} onChange={e=>set("type",e.target.value)}>{ASSET_TYPES.map(t=><option key={t} value={t}>{t}</option>)}</select></Field><FormActions onCancel={onCancel} onSubmit={()=>data.name?.trim()&&data.url?.trim()&&onSubmit(data)} submitLabel="Add Asset"/></div>);}
function IssueForm({data,setData,onSubmit,onCancel}){const set=(k,v)=>setData(d=>({...d,[k]:v}));return(<div><h2 style={s.modalTitle}>Log Issue</h2><Field label="Title *"><input className="q-input" value={data.title||""} onChange={e=>set("title",e.target.value)} placeholder="e.g., App crashes on login"/></Field><Field label="Description"><textarea className="q-input" style={{height:100,resize:"vertical"}} value={data.description||""} onChange={e=>set("description",e.target.value)} placeholder="Steps to reproduce…"/></Field><FormActions onCancel={onCancel} onSubmit={()=>data.title?.trim()&&onSubmit(data)} submitLabel="Log Issue"/></div>);}
function FixIssueModal({data,setData,onSubmit,onCancel}){const set=(k,v)=>setData(d=>({...d,[k]:v}));return(<div><h2 style={s.modalTitle}>Mark Issue Fixed</h2><div style={{background:"rgba(74,222,128,.06)",border:"1px solid rgba(74,222,128,.15)",borderRadius:8,padding:"10px 14px",marginBottom:16}}><p style={{color:"#4ADE80",fontSize:13,fontWeight:600}}>{data.title}</p>{data.description&&<p style={{color:"#8B8FA8",fontSize:12,marginTop:4}}>{data.description}</p>}</div><Field label="How was it fixed? *"><textarea className="q-input" style={{height:120,resize:"vertical"}} autoFocus value={data.fixDescription||""} onChange={e=>set("fixDescription",e.target.value)} placeholder="Describe the fix…"/></Field><p style={{fontSize:12,color:"#6B7290",marginTop:6}}>A note will be automatically created with this fix.</p><FormActions onCancel={onCancel} onSubmit={()=>data.fixDescription?.trim()&&onSubmit(data)} submitLabel="Mark Fixed"/></div>);}
function IdeaForm({data,setData,title,onSubmit,onCancel}){const set=(k,v)=>setData(d=>({...d,[k]:v}));return(<div><h2 style={s.modalTitle}>{title}</h2><Field label="Idea *"><textarea className="q-input" style={{height:140,resize:"vertical"}} autoFocus value={data.content||""} onChange={e=>set("content",e.target.value)} placeholder="Your idea…"/></Field><p style={{fontSize:12,color:"#6B7290",marginTop:4}}>Ideas don't appear on Overview.</p><FormActions onCancel={onCancel} onSubmit={()=>data.content?.trim()&&onSubmit(data)} submitLabel="Save Idea"/></div>);}
function ConceptForm({data,setData,cfg,session,projectId,onSubmit,onUploadFile,onCancel}){
  const set=(k,v)=>setData(d=>({...d,[k]:v}));
  const fileRef=useRef(null);
  const [recording,setRecording]=useState(false);const mrRef=useRef(null);
  const handleFileChange=e=>{const file=e.target.files?.[0];if(file&&onUploadFile){const type=file.type.startsWith("audio/")?"audio":"image";onUploadFile(file,data.label||file.name,type);}};
  const startRec=async()=>{try{const stream=await navigator.mediaDevices.getUserMedia({audio:true});const chunks=[];const mr=new MediaRecorder(stream);mr.ondataavailable=e=>chunks.push(e.data);mr.onstop=()=>{const blob=new Blob(chunks,{type:"audio/webm"});const reader=new FileReader();reader.onload=()=>set("content",reader.result);reader.readAsDataURL(blob);stream.getTracks().forEach(t=>t.stop());};mr.start();mrRef.current=mr;setRecording(true);}catch{alert("Mic access denied");}};
  const stopRec=()=>{mrRef.current?.stop();setRecording(false);};
  const renderInput=()=>{switch(data.type){
    case "color":return<div style={{display:"flex",gap:10,alignItems:"center",marginTop:8}}><input type="color" value={data.content||"#00D4FF"} onChange={e=>set("content",e.target.value)} style={{width:48,height:40,padding:2,background:"#0D1120",border:"1px solid #1E2540",borderRadius:6,cursor:"pointer"}}/><input className="q-input" style={{flex:1,marginTop:0,fontFamily:"'JetBrains Mono'"}} value={data.content||""} onChange={e=>set("content",e.target.value)} placeholder="#hex, rgb(), hsl()"/></div>;
    case "image":return<div><input className="q-input" value={data.content||""} onChange={e=>set("content",e.target.value)} placeholder="https://image-url.com/..."/><button className="q-btn-ghost" style={{marginTop:8,width:"100%"}} onClick={()=>fileRef.current?.click()}>⬆ Upload image from device</button><input ref={fileRef} type="file" accept="image/*" style={{display:"none"}} onChange={handleFileChange}/></div>;
    case "audio":return<div style={{marginTop:8}}>{recording?<button className="q-btn-danger" style={{width:"100%",padding:10}} onClick={stopRec}>⏹ Stop Recording</button>:<button className="q-btn-ghost" style={{width:"100%",padding:10}} onClick={startRec}>🎙 Start Recording</button>}<button className="q-btn-ghost" style={{marginTop:8,width:"100%"}} onClick={()=>fileRef.current?.click()}>⬆ Upload audio from device</button><input ref={fileRef} type="file" accept="audio/*" style={{display:"none"}} onChange={handleFileChange}/>{data.content&&<audio src={data.content} controls style={{width:"100%",marginTop:10}}/>}</div>;
    case "code": return<textarea className="q-input q-mono" style={{height:130,resize:"vertical"}} value={data.content||""} onChange={e=>set("content",e.target.value)} placeholder="// paste code here"/>;
    case "link": return<input className="q-input" value={data.content||""} onChange={e=>set("content",e.target.value)} placeholder="https://..."/>;
    default:     return<textarea className="q-input" style={{height:100,resize:"vertical"}} value={data.content||""} onChange={e=>set("content",e.target.value)} placeholder="Enter text…"/>;
  }};
  return(<div><h2 style={s.modalTitle}>Add Concept</h2><Field label="Type"><div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:8}}>{CONCEPT_TYPES.map(t=><button key={t} className={`q-chip${data.type===t?" q-chip-on":""}`} onClick={()=>set("type",t)}>{CONCEPT_ICONS[t]} {t}</button>)}</div></Field><Field label="Label (optional)"><input className="q-input" value={data.label||""} onChange={e=>set("label",e.target.value)} placeholder="Name this concept…"/></Field><Field label="Content">{renderInput()}</Field><p style={{fontSize:12,color:"#6B7290",marginTop:4}}>Concepts don't appear on Overview.</p><FormActions onCancel={onCancel} onSubmit={()=>data.content?.trim()&&onSubmit(data)} submitLabel="Add Concept"/></div>);
}

function Field({label,children}){return<div style={{marginBottom:14}}><label style={s.fieldLbl}>{label}</label>{children}</div>;}
function FormActions({onCancel,onSubmit,submitLabel}){
  return(
    <div style={{display:"flex",justifyContent:"flex-end",gap:10,marginTop:22}}>
      <button className="q-btn-ghost" onClick={onCancel}>Cancel</button>
      <button className="q-btn-primary q-modal-submit" onClick={onSubmit}>{submitLabel}</button>
    </div>
  );
}
function ModalWrap({children,onClose}){
  const ref=useRef(null);
  // Only close when clicking directly on the backdrop — never intercept events on content
  return(
    <div ref={ref} style={s.overlayBackdrop} onClick={e=>{if(e.target===ref.current)onClose();}}>
      <div style={s.modal}>
        {children}
      </div>
    </div>
  );
}

// ── Styled confirm dialog ─────────────────────────────────────────────────────
function ConfirmDialog({msg,onYes,onNo}){
  useEffect(()=>{const h=e=>{if(e.key==="Enter")onYes();if(e.key==="Escape")onNo();};window.addEventListener("keydown",h);return()=>window.removeEventListener("keydown",h);},[]);
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(4,6,14,.88)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1100}}>
      <div style={{background:"#111627",border:"1px solid #1E2540",borderRadius:14,padding:"28px 32px",maxWidth:380,width:"90%",boxShadow:"0 16px 48px rgba(0,0,0,.6)"}}>
        <p style={{fontFamily:"'Syne'",fontSize:15,fontWeight:600,color:"#E8EAF6",lineHeight:1.5,marginBottom:24}}>{msg}</p>
        <div style={{display:"flex",justifyContent:"flex-end",gap:10}}>
          <button className="q-btn-ghost" onClick={onNo} autoFocus>Cancel</button>
          <button className="q-btn-danger" style={{borderColor:"#FF4466",color:"#FF7090"}} onClick={onYes}>Delete</button>
        </div>
      </div>
    </div>
  );
}
function Toast({msg,type}){const c={ok:{bg:"#0F2A1A",border:"#4ADE80",text:"#4ADE80",icon:"✓"},err:{bg:"#2A0F18",border:"#FF4466",text:"#FF7090",icon:"✕"},info:{bg:"#0F1A2A",border:"#00D4FF",text:"#00D4FF",icon:"ℹ"}}[type]||{bg:"#0F2A1A",border:"#4ADE80",text:"#4ADE80",icon:"✓"};return<div style={{position:"fixed",bottom:24,right:24,zIndex:9999,background:c.bg,border:`1px solid ${c.border}`,color:c.text,padding:"10px 18px",borderRadius:9,fontSize:13,maxWidth:320,fontFamily:"'Syne'",fontWeight:600,boxShadow:"0 4px 24px rgba(0,0,0,.5)",lineHeight:1.5}}>{c.icon} {msg}</div>;}
function Splash({msg}){return<div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:"#0A0E1A",color:"#00D4FF",fontFamily:"'JetBrains Mono'",fontSize:13}}>{msg}</div>;}

// ── CSS ───────────────────────────────────────────────────────────────────────
const css=`
  @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=JetBrains+Mono:wght@300;400;500;700&display=swap');
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
  ::-webkit-scrollbar{width:4px;height:4px;}::-webkit-scrollbar-track{background:#0A0E1A;}::-webkit-scrollbar-thumb{background:#1E2540;border-radius:2px;}
  input,textarea,select{outline:none;-webkit-user-select:text!important;user-select:text!important;-webkit-touch-callout:default;}
  button{cursor:pointer;border:none;background:none;font-family:'Syne',sans-serif;}a{text-decoration:none;}
  audio{accent-color:#00D4FF;}

  .q-tab-bar{display:flex;border-bottom:1px solid #1A2040;margin-bottom:22px;overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none;}
  .q-tab-bar::-webkit-scrollbar{display:none;}

  .q-nav{display:flex;align-items:center;padding:8px 14px;color:#8B8FA8;font-family:'Syne',sans-serif;font-weight:500;width:calc(100% - 16px);margin:1px 8px;border-radius:7px;cursor:pointer;transition:all .15s;user-select:none;}
  .q-nav:hover{background:rgba(0,212,255,.06);color:#D0D3E8;}
  .q-nav-active{background:rgba(0,212,255,.09)!important;color:#00D4FF!important;}
  .q-folder-btn{margin-left:4px;opacity:0;transition:opacity .15s;padding:3px 4px;border-radius:4px;flex-shrink:0;display:flex;align-items:center;background:none;border:none;cursor:pointer;}
  .q-nav:hover .q-folder-btn,.q-nav-active .q-folder-btn{opacity:1;}

  .q-proj-link{display:inline-flex;align-items:center;gap:5px;padding:4px 10px;background:rgba(0,212,255,.06);border:1px solid rgba(0,212,255,.18);border-radius:6px;color:#00D4FF;font-size:12px;font-family:'Syne';font-weight:600;transition:all .15s;}
  .q-proj-link:hover{background:rgba(0,212,255,.12);border-color:rgba(0,212,255,.35);}

  .q-btn-primary{padding:9px 18px;background:#00D4FF;color:#06090F;border-radius:8px;font-size:13px;font-weight:700;font-family:'Syne',sans-serif;transition:opacity .15s;}.q-btn-primary:hover{opacity:.88;}
  .q-btn-ghost{padding:9px 14px;border:1px solid #1E2540;border-radius:8px;color:#8B8FA8;font-size:13px;font-family:'Syne',sans-serif;background:transparent;transition:all .15s;}.q-btn-ghost:hover{border-color:#2E3560;color:#C0C6E0;}
  .q-btn-danger{padding:9px 14px;border:1px solid #1E2540;border-radius:8px;color:#8B8FA8;font-size:13px;font-family:'Syne',sans-serif;background:transparent;transition:all .15s;}.q-btn-danger:hover{border-color:#FF4466;color:#FF4466;}
  .q-btn-new{width:100%;padding:10px;background:rgba(0,212,255,.08);border:1px solid rgba(0,212,255,.2);border-radius:8px;color:#00D4FF;font-size:13px;font-weight:600;font-family:'Syne',sans-serif;transition:all .15s;}.q-btn-new:hover{background:rgba(0,212,255,.14);border-color:rgba(0,212,255,.35);}
  .q-sign-out{color:#4B5268;font-size:15px;padding:2px 5px;transition:color .15s;}.q-sign-out:hover{color:#FF6B9D;}
  .q-icon-btn{color:#4B5268;font-size:14px;padding:2px 5px;transition:color .15s;}.q-icon-btn:hover{color:#C0C6E0;}
  .q-input{width:100%;background:#0D1120;border:1px solid #1E2540;border-radius:8px;padding:10px 13px;color:#E8EAF6;font-size:14px;font-family:'Syne',sans-serif;transition:border-color .15s;margin-top:6px;}.q-input:focus{border-color:rgba(0,212,255,.4);}
  .q-mono{font-family:'JetBrains Mono',monospace!important;}
  .q-chip{padding:4px 10px;background:#111627;border:1px solid #1E2540;border-radius:20px;color:#6B7290;font-size:12px;font-family:'Syne',sans-serif;transition:all .15s;}.q-chip:hover{border-color:rgba(0,212,255,.3);color:#C0C6E0;}.q-chip-on{background:rgba(0,212,255,.1)!important;border-color:rgba(0,212,255,.35)!important;color:#00D4FF!important;}
  .q-card{background:#111627;border:1px solid #1A2040;border-radius:12px;padding:20px;cursor:pointer;transition:all .2s;}.q-card:hover{border-color:rgba(0,212,255,.28);transform:translateY(-2px);background:#131929;}
  .q-ver-card{background:#111627;border:1px solid #1A2040;border-radius:10px;padding:18px 20px;transition:border-color .2s;}.q-ver-card:hover{border-color:rgba(0,212,255,.2);}
  .q-ms-row{display:flex;align-items:flex-start;gap:12px;padding:10px 8px;border-radius:8px;transition:background .15s;}.q-ms-row:hover{background:rgba(255,255,255,.025);}
  .q-check{width:20px;height:20px;min-width:20px;border:2px solid #2A3050;border-radius:5px;display:flex;align-items:center;justify-content:center;font-size:11px;color:#4ADE80;margin-top:1px;transition:all .15s;flex-shrink:0;}.q-check:hover{border-color:#4ADE80;}.q-check-done{background:rgba(74,222,128,.1);border-color:#4ADE80;}
  .q-del{color:#3A3F58;font-size:12px;padding:2px 4px;transition:color .15s;flex-shrink:0;}.q-del:hover{color:#FF4466;}
  .q-tab{padding:10px 18px;color:#6B7290;font-size:13px;font-weight:500;font-family:'Syne',sans-serif;border-bottom:2px solid transparent;border-top:none;border-left:none;border-right:none;background:none;margin-bottom:-1px;display:inline-flex;align-items:center;gap:5px;transition:all .15s;white-space:nowrap;}.q-tab:hover{color:#C0C6E0;}.q-tab-on{color:#00D4FF!important;border-bottom-color:#00D4FF!important;}
  .q-modal-submit{}
`;

const s={
  root:{display:"flex",minHeight:"100vh",background:"#0A0E1A",fontFamily:"'Syne',sans-serif",color:"#E8EAF6"},
  sidebar:{width:228,minWidth:228,background:"#0C1020",borderRight:"1px solid #151C32",display:"flex",flexDirection:"column",top:0,height:"100vh",overflowY:"auto"},
  logo:{padding:"20px 20px 16px",borderBottom:"1px solid #151C32",display:"flex",alignItems:"baseline",gap:3,marginBottom:8},
  logoQ:{fontFamily:"'Syne'",fontSize:26,fontWeight:800,color:"#00D4FF",lineHeight:1},
  logoText:{fontFamily:"'Syne'",fontSize:20,fontWeight:700,color:"#E8EAF6",letterSpacing:"-.5px"},
  logoBeta:{fontFamily:"'JetBrains Mono'",fontSize:9,color:"#3A4060",marginLeft:4,letterSpacing:1.5,fontWeight:700},
  closeSidebar:{marginLeft:"auto",color:"#4B5268",fontSize:16,padding:"0 4px",background:"none",border:"none",cursor:"pointer"},
  nav:{flex:1,padding:"4px 0",overflowY:"auto"},
  navSection:{fontSize:10,fontWeight:700,letterSpacing:"1.5px",color:"#2E3558",padding:"14px 20px 5px",textTransform:"uppercase"},
  sidebarFoot:{padding:14,borderTop:"1px solid #151C32"},
  userRow:{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:10,gap:4},
  userEmail:{fontFamily:"'JetBrains Mono'",fontSize:10,color:"#2A304A",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1},
  mobileOverlay:{position:"fixed",inset:0,background:"rgba(0,0,0,.55)",zIndex:199},
  mobileHeader:{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 16px",background:"#0C1020",borderBottom:"1px solid #151C32",position:"sticky",top:0,zIndex:10},
  hamburger:{fontSize:20,color:"#8B8FA8",padding:"0 6px",width:32,background:"none",border:"none",cursor:"pointer"},
  main:{flex:1,overflowY:"auto",maxHeight:"100vh"},
  page:{padding:"36px 40px",maxWidth:1000},
  pageHead:{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:26},
  pageTitle:{fontFamily:"'Syne'",fontSize:27,fontWeight:800,color:"#E8EAF6",letterSpacing:"-.5px"},
  pageSub:{color:"#8B8FA8",fontSize:13,marginTop:3},
  projHead:{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:16},
  statsGrid:{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:14},
  statCard:{background:"#111627",border:"1px solid #1A2040",borderRadius:10,padding:"14px 16px"},
  statVal:{fontFamily:"'JetBrains Mono'",fontSize:26,fontWeight:700,lineHeight:1},
  statLbl:{color:"#6B7290",fontSize:11,marginTop:5,fontWeight:500,letterSpacing:".3px"},
  grid:{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(270px,1fr))",gap:13},
  empty:{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:14,padding:"48px 20px",color:"#6B7290",fontSize:14},
  emptyIcon:{fontSize:44,opacity:.18},
  badge:{fontSize:11,fontWeight:600,padding:"3px 8px",borderRadius:4,fontFamily:"'JetBrains Mono'",letterSpacing:".3px"},
  mono12:{fontFamily:"'JetBrains Mono'",fontSize:12,color:"#6B7290"},
  mono10:{fontFamily:"'JetBrains Mono'",fontSize:11,color:"#6B7290"},
  techChip:{fontSize:11,padding:"3px 7px",background:"rgba(0,212,255,.05)",border:"1px solid rgba(0,212,255,.13)",borderRadius:4,color:"#6EB8D0",fontFamily:"'JetBrains Mono'"},
  bar:{flex:1,height:4,background:"#1A2040",borderRadius:2,overflow:"hidden"},
  barFill:{height:4,background:"linear-gradient(90deg,#00D4FF,#4ADE80)",borderRadius:2},
  cardTitle:{fontFamily:"'Syne'",fontSize:16,fontWeight:700,marginBottom:6,color:"#E8EAF6"},
  cardDesc:{fontSize:13,color:"#8B8FA8",lineHeight:1.5,marginBottom:12,display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden"},
  tabPill:{fontSize:10,background:"rgba(0,212,255,.09)",color:"#00D4FF",padding:"1px 6px",borderRadius:10,fontFamily:"'JetBrains Mono'"},
  tabBar:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16},
  infoCard:{background:"#111627",border:"1px solid #1A2040",borderRadius:10,padding:"15px 17px"},
  infoLbl:{fontSize:10,color:"#6B7290",fontWeight:700,letterSpacing:".8px",textTransform:"uppercase"},
  fileLink:{fontFamily:"'JetBrains Mono'",fontSize:12,color:"#00D4FF",background:"rgba(0,212,255,.06)",border:"1px solid rgba(0,212,255,.14)",borderRadius:4,padding:"4px 8px",display:"inline-block"},
  overlayBackdrop:{position:"fixed",inset:0,background:"rgba(4,6,14,.88)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000},
  modal:{background:"#111627",border:"1px solid #1E2540",borderRadius:14,padding:26,width:"90%",maxWidth:540,maxHeight:"90vh",overflowY:"auto"},
  modalTitle:{fontFamily:"'Syne'",fontSize:19,fontWeight:700,marginBottom:18,color:"#E8EAF6"},
  fieldLbl:{display:"block",fontSize:11,fontWeight:700,color:"#6B7290",letterSpacing:".7px",textTransform:"uppercase",marginBottom:0},
  authWrap:{display:"flex",alignItems:"center",justifyContent:"center",minHeight:"100vh",background:"#0A0E1A",padding:20},
  authBox:{width:"100%",maxWidth:420,background:"#0C1020",border:"1px solid #1A2040",borderRadius:16,padding:30},
};