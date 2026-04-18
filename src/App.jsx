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

// Pull-to-refresh for mobile (Capacitor WebView)
function usePullToRefresh(onRefresh){
  // Disabled — replaced by refresh icon in mobile header
  void onRefresh;
}
function _usePullToRefreshDisabled(onRefresh){
  // Pull-to-refresh: only fires when at the very top, requires deliberate downward pull
  // with minimal horizontal movement. The refresh FAB is the primary mobile refresh method.
  useEffect(()=>{
    let startY=0,startX=0,pulling=false,indicator=null,refreshing=false;
    const THRESHOLD=100;
    const MAX_HORIZ=15; // very tight — must be nearly vertical

    const createIndicator=()=>{
      const el=document.createElement("div");
      el.id="ptr-indicator";
      el.style.cssText="position:fixed;top:0;left:50%;transform:translateX(-50%);z-index:9998;background:#0C1020;border:1px solid #1A2040;border-top:none;border-radius:0 0 20px 20px;padding:6px 18px 8px;font-family:'Syne',sans-serif;font-size:12px;color:#00D4FF;font-weight:600;pointer-events:none;transition:opacity .2s;opacity:0;";
      el.textContent="↓ Pull to refresh";
      document.body.appendChild(el);
      return el;
    };

    const onTouchStart=e=>{
      if(refreshing)return;
      const atTop=window.scrollY===0||document.documentElement.scrollTop===0;
      if(!atTop)return;
      startY=e.touches[0].clientY;
      startX=e.touches[0].clientX;
      pulling=true;
    };
    const onTouchMove=e=>{
      if(!pulling||refreshing)return;
      const dy=e.touches[0].clientY-startY;
      const dx=Math.abs(e.touches[0].clientX-startX);
      if(dx>MAX_HORIZ||dy<=0){pulling=false;return;} // cancel on any noticeable horizontal
      if(dy<20)return;
      if(!indicator)indicator=createIndicator();
      const pct=Math.min(dy/THRESHOLD,1);
      indicator.style.opacity=String(pct);
      indicator.textContent=pct>=1?"↑ Release to refresh":"↓ Pull to refresh";
    };
    const onTouchEnd=e=>{
      if(!pulling)return;
      pulling=false;
      if(!indicator)return;
      const dy=e.changedTouches[0].clientY-startY;
      if(dy>=THRESHOLD){
        refreshing=true;
        indicator.textContent="Refreshing…";
        indicator.style.opacity="1";
        onRefresh().then(()=>{
          indicator&&(indicator.style.opacity="0");
          setTimeout(()=>{indicator?.remove();indicator=null;refreshing=false;},300);
        });
      } else {
        indicator.style.opacity="0";
        setTimeout(()=>{indicator?.remove();indicator=null;},200);
      }
      startY=0;startX=0;
    };

    document.addEventListener("touchstart",onTouchStart,{passive:true});
    document.addEventListener("touchmove",onTouchMove,{passive:true});
    document.addEventListener("touchend",onTouchEnd,{passive:true});
    return()=>{document.removeEventListener("touchstart",onTouchStart);document.removeEventListener("touchmove",onTouchMove);document.removeEventListener("touchend",onTouchEnd);indicator?.remove();};
  },[onRefresh]);
}

// ── Constants ─────────────────────────────────────────────────────────────────
const CFG_KEY    = "qoder-cfg-v2";
const APP_VER    = "v0.9.15";
const POLL_MS    = 3000;
const STORAGE_BUCKET = "qoder-files";

const STATUS_CONFIG = {
  planning: {label:"Planning",       color:"var(--txt-muted)",bg:"rgba(139,143,168,0.12)"},
  "in-dev": {label:"In Development", color:"#00D4FF",bg:"rgba(0,212,255,0.10)" },
  beta:     {label:"Beta",           color:"#FFB347",bg:"rgba(255,179,71,0.10)" },
  released: {label:"Released",       color:"#4ADE80",bg:"rgba(74,222,128,0.10)"},
  archived: {label:"Archived",       color:"var(--txt-faint)",bg:"rgba(75,82,104,0.10)" },
};
const TECH_TAGS=[
  // Web & Mobile
  "React","React Native","Capacitor","Electron","Node.js","Next.js","Vue","Expo",
  "TypeScript","JavaScript","HTML/CSS","Tailwind","Vite","Express",
  // Backend & Data
  "Supabase","Firebase","PostgreSQL","MongoDB","SQLite","Python","Swift","Kotlin","Flutter",
  // Game Development
  "Unity","Unreal Engine","Godot","Pygame","MonoGame","LibGDX","Phaser","Three.js",
  "WebGL","OpenGL","Vulkan","DirectX","SFML","SDL2","Box2D","Bullet Physics",
  "C#","C++","GDScript","Lua","HLSL","GLSL",
];
const ASSET_TYPES=["Link","Image","Document","Code","APK / Build","Icon","Splash Screen","Screenshot","Audio","Color","Other"];
const ASSET_ICONS={Link:"🔗",Image:"🖼",Document:"📄",Code:"💻","APK / Build":"📦",Icon:"🎨","Splash Screen":"📱",Screenshot:"🖥",Audio:"🎙",Color:"🎨",Other:"📎"};
const CONCEPT_TYPES=["text","color","image","code","audio","link"];
const CONCEPT_ICONS={text:"📝",color:"🎨",image:"🖼",code:"💻",audio:"🎙",link:"🔗"};

const PRIORITY_CONFIG = {
  critical: { label:"Critical", color:"#FF4466", bg:"rgba(255,68,102,0.12)",  icon:"🔴" },
  high:     { label:"High",     color:"#FFB347", bg:"rgba(255,179,71,0.12)",  icon:"🟠" },
  medium:   { label:"Medium",   color:"#00D4FF", bg:"rgba(0,212,255,0.10)",   icon:"🔵" },
  low:      { label:"Low",      color:"var(--txt-muted)", bg:"rgba(139,143,168,0.10)", icon:"⚪" },
};
const PRIORITY_KEYS = ["critical","high","medium","low"];

const DEP_TYPES    = ["npm","pip","gradle","cocoapods","cargo","gem","other"];
const DEP_STATUSES = {
  ok:         { label:"Up to date",  color:"#4ADE80", icon:"✓" },
  outdated:   { label:"Outdated",    color:"#FFB347", icon:"↑" },
  deprecated: { label:"Deprecated",  color:"#FF6B9D", icon:"⚠" },
  conflict:   { label:"Conflict",    color:"#FF4466", icon:"✕" },
};

const BUILD_PLATFORMS = ["android","ios","windows","web","macos","linux"];
const BUILD_STATUSES  = {
  building:  { label:"Building",   color:"var(--txt-muted)", icon:"⟳" },
  signed:    { label:"Signed",     color:"#00D4FF", icon:"✍" },
  submitted: { label:"Submitted",  color:"#FFB347", icon:"↑" },
  rejected:  { label:"Rejected",   color:"#FF4466", icon:"✕" },
  live:      { label:"Live",       color:"#4ADE80", icon:"✓" },
};

const ENV_PRESET_COLORS = ["#4ADE80","#00D4FF","#FFB347","#FF6B9D","#B47FFF","#8B8FA8"];
const PROJECT_COLORS    = ["","#00D4FF","#4ADE80","#FFB347","#FF6B9D","#B47FFF","#FF4466","#6EB8D0","#F97316","#A78BFA","#34D399","#FB923C"];

// ── Theme palette ─────────────────────────────────────────────────────────────
const THEMES = {
  dark: {
    bg:       "#0A0E1A", bgSide:   "#0C1020", bgCard:   "#111627", bgCardHover: "#1A2240",
    bgInput:  "#0D1120", bgModal:  "#111627",
    border:   "#1A2040", borderMd: "#1E2540", borderLg: "#151C32",
    txt:      "#E8EAF6", txtSub:   "#8B8FA8", txtMuted: "#6B7290",
    txtFaint: "#4B5268", txtDim:   "#2E3558", txtGhost: "#2A304A",
  },
  light: {
    bg:       "#D4D8E4", bgSide:   "#C8CCDA", bgCard:   "#DCE0EC", bgCardHover: "#E8ECF6",
    bgInput:  "#CDD1DE", bgModal:  "#DCE0EC",
    border:   "#9AA4BC", borderMd: "#8E98B4", borderLg: "#A8B2C8",
    txt:      "#080E1C", txtSub:   "#1E2C48", txtMuted: "#3A4A68",
    txtFaint: "#506080", txtDim:   "#6878A0", txtGhost: "#8898B8",
  },
};

function buildThemeCSS(themeName, accent="#00D4FF"){
  const t=THEMES[themeName]||THEMES.dark;
  const isLight=themeName==="light";
  // In light mode, bright accents (cyan, yellow) need darkening for text legibility
  // We compute a CSS filter trick by mapping to the accent but forcing dark text in light theme
  const accentText=isLight?"var(--txt-sub)":accent; // light mode: use readable dark text instead
  return `
:root {
  --bg:${t.bg}; --bg-side:${t.bgSide}; --bg-card:${t.bgCard}; --bg-card-hover:${t.bgCardHover};
  --bg-input:${t.bgInput}; --bg-modal:${t.bgModal};
  --border:${t.border}; --border-md:${t.borderMd}; --border-lg:${t.borderLg};
  --txt:${t.txt}; --txt-sub:${t.txtSub}; --txt-muted:${t.txtMuted};
  --txt-faint:${t.txtFaint}; --txt-dim:${t.txtDim}; --txt-ghost:${t.txtGhost};
  --accent:${accent}; --accent-dim:${accent}18; --accent-border:${accent}35;
  --accent-text:${accentText};
  --scrollbar:${isLight?"#A8B4CC":"#1E2540"};
  --shadow:${isLight?"0 1px 4px rgba(0,0,0,.10)":"none"};
  --overlay:${isLight?"rgba(30,40,70,.65)":"rgba(4,6,14,.88)"};
  --toast-ok-bg:${isLight?"#E8FAF0":"#0F2A1A"};
  --toast-err-bg:${isLight?"#FEE8EE":"#2A0F18"};
  --toast-info-bg:${isLight?"#E8F4FF":"#0F1A2A"};
  --update-ok-bg:${isLight?"#E8FAF0":"#0F2A1A"};
  --update-info-bg:${isLight?"#E8F4FF":"#0F1A2A"};
}
body{background:var(--bg);color:var(--txt);}html{scrollbar-gutter:stable;}
::-webkit-scrollbar-track{background:var(--bg)!important;}
::-webkit-scrollbar-thumb{background:var(--scrollbar)!important;}
${isLight?`.q-ver-card,.q-card{box-shadow:var(--shadow);}
.q-ms-row:hover{background:rgba(0,0,0,.05)!important;}
.q-check{border-color:#A0AACC!important;}
input[type=color]{filter:brightness(0.97);}`:``}
`;
}

const RECURRENCE_TYPES = {
  daily:       { label:"Daily",       icon:"↺", days:1   },
  weekly:      { label:"Weekly",      icon:"↻", days:7   },
  "per-release":{ label:"Per Release",icon:"⟳", days:null },
};
function getNextDueDate(recurrenceType){
  const rt=RECURRENCE_TYPES[recurrenceType];
  if(!rt||!rt.days)return null; // per-release has no fixed date
  const d=new Date();
  d.setDate(d.getDate()+rt.days);
  d.setHours(0,0,0,0);
  return d.toISOString();
}

function fmtDuration(seconds){
  if(!seconds||seconds<0)return"0m";
  const h=Math.floor(seconds/3600);
  const m=Math.floor((seconds%3600)/60);
  if(h>0)return`${h}h ${m}m`;
  return`${m}m`;
}

function fmtDurationLong(seconds){
  const h=Math.floor(seconds/3600);
  const m=Math.floor((seconds%3600)/60);
  const s=seconds%60;
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
}
const FEED_META={
  version:      {icon:"⟳",label:"Version",       color:"#00D4FF"},
  milestone:    {icon:"◎",label:"Milestone Done", color:"#4ADE80"},
  todo:         {icon:"✓",label:"Task Done",      color:"#4ADE80"},
  note:         {icon:"⬝",label:"Note",           color:"#FFB347"},
  "issue-fixed":{icon:"🐛",label:"Issue Fixed",   color:"#B47FFF"},
  sprint:       {icon:"◈",label:"Sprint Done",    color:"#B47FFF"},
  time:         {icon:"⏱",label:"Time Logged",    color:"var(--txt-muted)"},
  "daily-log":  {icon:"📓",label:"Daily Log",     color:"#00D4FF"},
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
  {key:"overview",     label:"Overview"     },
  {key:"versions",     label:"Versions"     },
  {key:"milestones",   label:"Milestones"   },
  {key:"sprints",      label:"Sprints"      },
  {key:"todos",        label:"To-Do"        },
  {key:"notes",        label:"Notes"        },
  {key:"daily-log",    label:"Daily Log"    },
  {key:"assets",       label:"Assets"       },
  {key:"issues",       label:"Issues"       },
  {key:"build-log",    label:"Build Log"    },
  {key:"environments", label:"Environments" },
  {key:"dependencies", label:"Dependencies" },
  {key:"snippets",     label:"Snippets"     },
  {key:"time",         label:"Time"         },
  {key:"ideas",        label:"Ideas"        },
  {key:"concepts",     label:"Concepts"     },
  {key:"github",       label:"GitHub"       },
];

// ── Styled confirm dialog (replaces native confirm()) ─────────────────────────
// Module-level slot — root component sets this on mount
let _confirmResolver = null;
async function qConfirm(msg) {
  if (!_confirmResolver) return window.confirm(msg);
  return new Promise(resolve => _confirmResolver({ msg, resolve }));
}

// ── QInput — drop-in for <QInput className="q-input"> that adds Android IME attrs ─
// Swype, autocorrect, and autocomplete require these HTML attributes in Capacitor WebView
function QInput({type="text",className="q-input",style,value,onChange,onKeyDown,placeholder,autoFocus,readOnly,...rest}){
  return(
    <input
      type={type}
      className={className}
      style={style}
      value={value}
      onChange={onChange}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
      autoFocus={autoFocus}
      readOnly={readOnly}
      autoCorrect="on"
      autoComplete="on"
      autoCapitalize="sentences"
      spellCheck={true}
      {...rest}
    />
  );
}
function QTextarea({className="q-input",style,value,onChange,onKeyDown,placeholder,rows,...rest}){
  return(
    <textarea
      className={className}
      style={style}
      value={value}
      onChange={onChange}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
      rows={rows}
      autoCorrect="on"
      autoComplete="on"
      autoCapitalize="sentences"
      spellCheck={true}
      {...rest}
    />
  );
}

function RefreshIcon({size=16}){
  return(
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{color:"currentColor",flexShrink:0}}>
      {/* Bottom arc — counterclockwise left side */}
      <path d="M4.5 15.5A8 8 0 0 0 12 20a8 8 0 0 0 7.5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      {/* Arrow head bottom-left */}
      <polyline points="2,13 4.5,15.5 7,13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      {/* Top arc — clockwise right side */}
      <path d="M19.5 8.5A8 8 0 0 0 12 4a8 8 0 0 0-7.5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      {/* Arrow head top-right */}
      <polyline points="22,11 19.5,8.5 17,11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    </svg>
  );
}
function SearchIcon({size=14}){
  return(
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" style={{color:"currentColor",flexShrink:0}}>
      <circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" strokeWidth="1.5" fill="none"/>
      <line x1="12.5" y1="12.5" x2="18" y2="18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}
function PinIcon({size=13,active=false}){
  return(
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" style={{color:active?"#FFB347":"var(--txt-dim)",transition:"color .15s"}}>
      <path d="M12 2L18 8L13.5 12.5L15 18L10 15.5L5 18L6.5 12.5L2 8L8 2L10 5L12 2Z" fill="currentColor" fillOpacity={active?0.9:0.25} stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
      <line x1="10" y1="5" x2="10" y2="9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  );
}
function FolderIcon({size=13}){return(<svg width={size} height={size} viewBox="0 0 20 16" fill="none" style={{color:"var(--accent-text)"}}><path d="M1 2.5C1 1.67 1.67 1 2.5 1H7.5L9.5 3.5H17.5C18.33 3.5 19 4.17 19 5V13.5C19 14.33 18.33 15 17.5 15H2.5C1.67 15 1 14.33 1 13.5V2.5Z" fill="currentColor" fillOpacity="0.18" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/></svg>);}

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
  const [vers,miles,notes,todos,assets,issues,ideas,concepts,builds,envs,deps,ptRows,sprints,timeSess,iComments,snippets,dLogs]=await Promise.all([
    sb.get(url,key,token,"versions",       `?project_id=in.(${ids})&order=date.desc`),
    sb.get(url,key,token,"milestones",     `?project_id=in.(${ids})&order=created_at.asc`),
    sb.get(url,key,token,"notes",          `?project_id=in.(${ids})&order=position.asc`),
    sb.get(url,key,token,"todos",          `?project_id=in.(${ids})&order=position.asc`),
    sb.get(url,key,token,"assets",         `?project_id=in.(${ids})&order=created_at.asc`),
    sb.get(url,key,token,"issues",         `?project_id=in.(${ids})&order=created_at.desc`),
    sb.get(url,key,token,"ideas",          `?project_id=in.(${ids})&order=position.asc`),
    sb.get(url,key,token,"concepts",       `?project_id=in.(${ids})&order=created_at.desc`),
    sb.get(url,key,token,"build_logs",     `?project_id=in.(${ids})&order=built_at.desc`),
    sb.get(url,key,token,"environments",   `?project_id=in.(${ids})&order=position.asc`),
    sb.get(url,key,token,"dependencies",   `?project_id=in.(${ids})&order=created_at.asc`),
    sb.get(url,key,token,"project_tags",   `?project_id=in.(${ids})`),
    sb.get(url,key,token,"sprints",        `?project_id=in.(${ids})&order=position.asc`),
    sb.get(url,key,token,"time_sessions",  `?project_id=in.(${ids})&order=started_at.desc`),
    sb.get(url,key,token,"issue_comments", `?project_id=in.(${ids})&order=created_at.asc`),
    sb.get(url,key,token,"snippets",       `?project_id=in.(${ids})&order=created_at.desc`),
    sb.get(url,key,token,"daily_logs",     `?project_id=in.(${ids})&order=log_date.desc`).catch(()=>[]),
  ]);
  return rows.map(p=>({
    id:p.id,name:p.name,description:p.description,status:p.status,
    techStack:p.tech_stack||[],localFolder:p.local_folder||null,
    gitUrl:p.git_url||"",supabaseUrl:p.supabase_url||"",vercelUrl:p.vercel_url||"",groupId:p.group_id||null,dependsOn:p.depends_on||[],tabOrderOverride:p.tab_order_override||null,
    isPublic:p.is_public||false,publicSlug:p.public_slug||null,
    color:p.color||null,
    position:p.position,createdAt:p.created_at,
    tagIds:      ptRows.filter(pt=>pt.project_id===p.id).map(pt=>pt.tag_id),
    versions:    vers.filter(v=>v.project_id===p.id).map(v=>({id:v.id,version:v.version,releaseNotes:v.release_notes,date:v.date,fileLinks:v.file_links||[]})),
    milestones:  miles.filter(m=>m.project_id===p.id).map(m=>({id:m.id,title:m.title,description:m.description,date:m.date,completed:m.completed,completedAt:m.completed_at,createdAt:m.created_at})),
    notes:       notes.filter(n=>n.project_id===p.id).map(n=>({id:n.id,content:n.content,position:n.position,pinned:n.pinned||false,createdAt:n.created_at})),
    todos:       todos.filter(t=>t.project_id===p.id).map(t=>({id:t.id,text:t.text,completed:t.completed,completedAt:t.completed_at,priority:t.priority||"medium",recurring:t.recurring||false,recurrenceType:t.recurrence_type||null,sprintId:t.sprint_id||null,position:t.position,createdAt:t.created_at,nextDueAt:t.next_due_at||null})),
    sprints:     sprints.filter(sp=>sp.project_id===p.id).map(sp=>({id:sp.id,name:sp.name,goal:sp.goal,startDate:sp.start_date,endDate:sp.end_date,status:sp.status||"active",position:sp.position,createdAt:sp.created_at})),
    timeSessions:timeSess.filter(ts=>ts.project_id===p.id).map(ts=>({id:ts.id,startedAt:ts.started_at,endedAt:ts.ended_at,durationSeconds:ts.duration_seconds,note:ts.note,createdAt:ts.created_at})),
    assets:      assets.filter(a=>a.project_id===p.id).map(a=>({id:a.id,name:a.name,url:a.url,type:a.type,createdAt:a.created_at})),
    issues:      issues.filter(i=>i.project_id===p.id).map(i=>({id:i.id,title:i.title,description:i.description,status:i.status,priority:i.priority||"medium",screenshotUrls:i.screenshot_urls||[],fixDescription:i.fix_description,fixedAt:i.fixed_at,createdAt:i.created_at,comments:(iComments||[]).filter(c=>c.issue_id===i.id).map(c=>({id:c.id,content:c.content,createdAt:c.created_at}))})),
    ideas:       ideas.filter(d=>d.project_id===p.id).map(d=>({id:d.id,content:d.content,pinned:d.pinned,position:d.position,createdAt:d.created_at})),
    concepts:    concepts.filter(c=>c.project_id===p.id).map(c=>({id:c.id,type:c.type,label:c.label,content:c.content,createdAt:c.created_at})),
    buildLogs:   builds.filter(b=>b.project_id===p.id).map(b=>({id:b.id,versionId:b.version_id,platform:b.platform,buildNumber:b.build_number,buildSize:b.build_size,status:b.status,store:b.store,notes:b.notes,builtAt:b.built_at,createdAt:b.created_at})),
    environments:envs.filter(e=>e.project_id===p.id).map(e=>({id:e.id,name:e.name,url:e.url,color:e.color,variables:e.variables||[],notes:e.notes,position:e.position,createdAt:e.created_at})),
    dependencies:deps.filter(d=>d.project_id===p.id).map(d=>({id:d.id,name:d.name,currentVersion:d.current_version,latestVersion:d.latest_version,type:d.type,status:d.status,notes:d.notes,createdAt:d.created_at})),
    snippets:    (snippets||[]).filter(s=>s.project_id===p.id).map(s=>({id:s.id,title:s.title,language:s.language,content:s.content,tags:s.tags||[],createdAt:s.created_at})),
    dailyLogs:   (dLogs||[]).filter(d=>d.project_id===p.id).map(d=>({id:d.id,content:d.content,logDate:d.log_date,mood:d.mood||null,createdAt:d.created_at})),
  }));
}

async function loadUserTags(url,key,token,userId){
  try{ return await sb.get(url,key,token,"tags",`?user_id=eq.${userId}&order=name.asc`); }catch{ return []; }
}
async function loadUserGroups(url,key,token,userId){
  try{ return await sb.get(url,key,token,"project_groups",`?user_id=eq.${userId}&order=position.asc`); }catch{ return []; }
}

// ── Activity feed builder (cross-project) ─────────────────────────────────────
function buildActivityFeed(projects){
  const items=[];
  projects.forEach(p=>{
    p.versions?.forEach(v=>items.push({type:"version",projectId:p.id,projectName:p.name,date:new Date(v.date),title:v.version,content:v.releaseNotes}));
    p.milestones?.filter(m=>m.completed).forEach(m=>items.push({type:"milestone",projectId:p.id,projectName:p.name,date:new Date(m.completedAt||m.date||m.createdAt),title:m.title,content:null}));
    p.todos?.filter(t=>t.completed&&t.completedAt).forEach(t=>items.push({type:"todo",projectId:p.id,projectName:p.name,date:new Date(t.completedAt),title:t.text,content:null}));
    p.issues?.filter(i=>i.status==="fixed").forEach(i=>items.push({type:"issue-fixed",projectId:p.id,projectName:p.name,date:new Date(i.fixedAt||i.createdAt),title:i.title,content:i.fixDescription}));
    p.dailyLogs?.forEach(d=>items.push({type:"daily-log",projectId:p.id,projectName:p.name,date:new Date(d.createdAt),title:null,content:d.content?.slice(0,120)}));
    p.sprints?.filter(sp=>sp.status==="completed").forEach(sp=>items.push({type:"sprint",projectId:p.id,projectName:p.name,date:new Date(sp.createdAt),title:sp.name,content:sp.goal}));
    p.timeSessions?.filter(s=>s.durationSeconds).forEach(s=>items.push({type:"time",projectId:p.id,projectName:p.name,date:new Date(s.startedAt),title:fmtDuration(s.durationSeconds),content:s.note}));
  });
  return items.sort((a,b)=>b.date-a.date);
}

// ── Cross-project content search ──────────────────────────────────────────────
function searchAllContent(projects,query){
  if(!query.trim())return[];
  const q=query.toLowerCase();
  const results=[];
  projects.forEach(p=>{
    // Notes
    p.notes?.forEach(n=>{if(n.content?.toLowerCase().includes(q))results.push({projectId:p.id,projectName:p.name,type:"note",label:"Note",excerpt:n.content,createdAt:n.createdAt,tab:"notes"});});
    // Todos
    p.todos?.forEach(t=>{if(t.text?.toLowerCase().includes(q))results.push({projectId:p.id,projectName:p.name,type:"todo",label:t.completed?"Done Task":"To-Do",excerpt:t.text,createdAt:t.createdAt,tab:"todos"});});
    // Issues
    p.issues?.forEach(i=>{if(i.title?.toLowerCase().includes(q)||i.description?.toLowerCase().includes(q))results.push({projectId:p.id,projectName:p.name,type:"issue",label:"Issue",excerpt:i.title,createdAt:i.createdAt,tab:"issues"});});
    // Versions
    p.versions?.forEach(v=>{if(v.version?.toLowerCase().includes(q)||v.releaseNotes?.toLowerCase().includes(q))results.push({projectId:p.id,projectName:p.name,type:"version",label:"Version",excerpt:v.version+(v.releaseNotes?` — ${v.releaseNotes}`:""),createdAt:v.date,tab:"versions"});});
    // Ideas
    p.ideas?.forEach(d=>{if(d.content?.toLowerCase().includes(q))results.push({projectId:p.id,projectName:p.name,type:"idea",label:"Idea",excerpt:d.content,createdAt:d.createdAt,tab:"ideas"});});
    // Dependencies
    p.dependencies?.forEach(d=>{if(d.name?.toLowerCase().includes(q))results.push({projectId:p.id,projectName:p.name,type:"dep",label:"Dependency",excerpt:d.name,createdAt:d.createdAt,tab:"dependencies"});});
    // Milestones
    p.milestones?.forEach(m=>{if(m.title?.toLowerCase().includes(q)||m.description?.toLowerCase().includes(q))results.push({projectId:p.id,projectName:p.name,type:"milestone",label:"Milestone",excerpt:m.title,createdAt:m.createdAt,tab:"milestones"});});
    // Snippets
    p.snippets?.forEach(s=>{if(s.title?.toLowerCase().includes(q)||s.content?.toLowerCase().includes(q)||(s.tags||[]).some(t=>t.toLowerCase().includes(q)))results.push({projectId:p.id,projectName:p.name,type:"snippet",label:"Snippet",excerpt:s.title,createdAt:s.createdAt,tab:"snippets"});});
    // Build logs
    p.buildLogs?.forEach(b=>{if(b.platform?.toLowerCase().includes(q)||b.notes?.toLowerCase().includes(q))results.push({projectId:p.id,projectName:p.name,type:"build",label:"Build Log",excerpt:`${b.platform} ${b.buildNumber||""}`.trim(),createdAt:b.builtAt,tab:"build-log"});});
    // Environments
    p.environments?.forEach(e=>{if(e.name?.toLowerCase().includes(q)||e.url?.toLowerCase().includes(q))results.push({projectId:p.id,projectName:p.name,type:"env",label:"Environment",excerpt:e.name,createdAt:e.createdAt,tab:"environments"});});
  });
  return results.slice(0,60);
}

// ── Export all projects to master JSON backup ────────────────────────────────
function exportAllProjectsJSON(projects){
  const data={
    exportedAt:new Date().toISOString(),
    version:"qoder-backup-v1",
    projectCount:projects.length,
    projects:projects.map(p=>({
      ...p,
      // Exclude derived/transient fields
      _exported:new Date().toISOString(),
    })),
  };
  const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url;
  a.download=`qoder-full-backup-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Project health score ──────────────────────────────────────────────────────
function getProjectHealth(project){
  let score=100;const issues=[];
  const openIssues=(project.issues||[]).filter(i=>i.status==="open");
  const criticalIssues=openIssues.filter(i=>i.priority==="critical");
  const msTotal=project.milestones?.length||0;
  const msDone=(project.milestones||[]).filter(m=>m.completed).length;
  const overdueMilestones=(project.milestones||[]).filter(m=>{
    if(m.completed||!m.date)return false;
    return new Date(m.date)<new Date();
  });
  const pendingTodos=(project.todos||[]).filter(t=>!t.completed).length;

  if(criticalIssues.length){score-=criticalIssues.length*20;issues.push(`${criticalIssues.length} critical issue${criticalIssues.length>1?"s":""}`);}
  if(openIssues.length>5){score-=10;issues.push(`${openIssues.length} open issues`);}
  if(overdueMilestones.length){score-=overdueMilestones.length*15;issues.push(`${overdueMilestones.length} overdue milestone${overdueMilestones.length>1?"s":""}`);}
  if(msTotal>0&&msDone/msTotal<0.25&&project.status==="in-dev"){score-=10;issues.push("Low milestone progress");}
  if(pendingTodos>20){score-=5;issues.push(`${pendingTodos} open todos`);}

  score=Math.max(0,Math.min(100,score));
  const label=score>=80?"Healthy":score>=50?"Fair":score>=25?"At Risk":"Critical";
  const color=score>=80?"#4ADE80":score>=50?"#FFB347":score>=25?"#FF6B9D":"#FF4466";
  return{score,label,color,issues};
}

// ── Issues CSV export ────────────────────────────────────────────────────────
function exportIssuesCSV(project){
  const rows=[["Title","Priority","Status","Description","Fixed In","Fixed At","Created"]];
  (project.issues||[]).forEach(i=>{
    const ver=i.fixedInVersionId?(project.versions||[]).find(v=>v.id===i.fixedInVersionId)?.version||"":"";
    rows.push([`"${i.title}"`,i.priority,i.status,`"${(i.description||"").replace(/"/g,"'")}"`,ver,i.fixedAt?new Date(i.fixedAt).toLocaleDateString():"",new Date(i.createdAt).toLocaleDateString()]);
  });
  const csv=rows.map(r=>r.join(",")).join("\n");
  const blob=new Blob([csv],{type:"text/csv"});
  const u=URL.createObjectURL(blob);const a=document.createElement("a");
  a.href=u;a.download=`${project.name}-issues-${new Date().toISOString().slice(0,10)}.csv`;a.click();URL.revokeObjectURL(u);
}

// ── Milestones CSV export ─────────────────────────────────────────────────────
function exportMilestonesCSV(project){
  const rows=[["Title","Status","Due Date","Completed At","Description"]];
  (project.milestones||[]).forEach(m=>{
    rows.push([`"${m.title}"`,m.completed?"Complete":"Open",m.date?new Date(m.date).toLocaleDateString():"",m.completedAt?new Date(m.completedAt).toLocaleDateString():"",`"${(m.description||"").replace(/"/g,"'")}"`]);
  });
  const csv=rows.map(r=>r.join(",")).join("\n");
  const blob=new Blob([csv],{type:"text/csv"});
  const u=URL.createObjectURL(blob);const a=document.createElement("a");
  a.href=u;a.download=`${project.name}-milestones-${new Date().toISOString().slice(0,10)}.csv`;a.click();URL.revokeObjectURL(u);
}

// ── Time report CSV export ───────────────────────────────────────────────────
function exportTimeReportCSV(projects){
  const rows=[["Project","Date","Start","End","Duration (min)","Duration (h)","Note"]];
  projects.forEach(p=>{
    (p.timeSessions||[]).filter(s=>s.endedAt).forEach(s=>{
      const start=new Date(s.startedAt);
      const end=new Date(s.endedAt);
      const mins=Math.round((s.durationSeconds||0)/60);
      const hrs=(mins/60).toFixed(2);
      rows.push([
        `"${p.name}"`,
        start.toLocaleDateString(),
        start.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}),
        end.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}),
        mins,
        hrs,
        `"${(s.note||"").replace(/"/g,"'")}"`,
      ]);
    });
  });
  // Add summary rows
  rows.push([]);
  rows.push(["PROJECT TOTALS","","","","Minutes","Hours",""]);
  projects.forEach(p=>{
    const totalMins=Math.round((p.timeSessions||[]).filter(s=>s.durationSeconds).reduce((a,s)=>a+s.durationSeconds,0)/60);
    if(totalMins>0)rows.push([`"${p.name}"`,,,,,totalMins,(totalMins/60).toFixed(2)]);
  });
  const csv=rows.map(r=>r.join(",")).join("\n");

  const blob=new Blob([csv],{type:"text/csv"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url;
  a.download=`qoder-time-report-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Changelog generator ───────────────────────────────────────────────────────
function generateChangelog(project){
  if(!project.versions?.length)return"# No versions logged yet.";
  const sorted=[...project.versions].sort((a,b)=>new Date(b.date)-new Date(a.date));
  const fixedIssues=[...(project.issues||[])].filter(i=>i.status==="fixed"&&i.fixedAt);
  let md=`# Changelog — ${project.name}\n\n`;
  sorted.forEach(v=>{
    const vDate=new Date(v.date);
    const dateStr=vDate.toLocaleDateString("en-US",{year:"numeric",month:"long",day:"numeric"});
    md+=`## ${v.version} — ${dateStr}\n`;
    if(v.releaseNotes)md+=`\n${v.releaseNotes}\n`;
    // Find issues fixed within 30 days before this version date
    const related=fixedIssues.filter(i=>{
      const fd=new Date(i.fixedAt); const diff=(vDate-fd)/(1000*60*60*24);
      return diff>=0&&diff<=30;
    });
    if(related.length){
      md+=`\n### Issues Fixed\n`;
      related.forEach(i=>{
        const pc=PRIORITY_CONFIG[i.priority||"medium"];
        md+=`- [${pc.label.toUpperCase()}] ${i.title}`;
        if(i.fixDescription)md+=`\n  > ${i.fixDescription}`;
        md+="\n";
      });
    }
    md+="\n---\n\n";
  });
  return md.trim();
}

// ── Snippet languages ─────────────────────────────────────────────────────────
const SNIPPET_LANGUAGES=[
  "bash","c","cpp","csharp","css","gdscript","glsl","go","hlsl","html",
  "java","javascript","json","jsx","kotlin","lua","markdown","python",
  "rust","sql","swift","tsx","typescript","wgsl","yaml","other",
].sort();

// ── README generator ──────────────────────────────────────────────────────────
function generateReadme(project){
  const statusEmoji={planning:"📋","in-dev":"🚧",beta:"🧪",released:"✅",archived:"📦"};
  const latVer=project.versions?.[0];
  const openIssues=(project.issues||[]).filter(i=>i.status==="open");
  const msTotal=project.milestones?.length||0;
  const msDone=(project.milestones||[]).filter(m=>m.completed).length;
  const links=[];
  if(project.gitUrl)links.push(`[Repository](${project.gitUrl})`);
  if(project.vercelUrl)links.push(`[Live Demo](${project.vercelUrl})`);
  if(project.supabaseUrl)links.push(`[Database Dashboard](${project.supabaseUrl})`);

  let md=`# ${project.name}\n\n`;
  md+=`${statusEmoji[project.status]||"📋"} **${STATUS_CONFIG[project.status]?.label||project.status}**`;
  if(latVer) md+=` · \`v${latVer.version}\``;
  md+="\n\n";
  if(project.description) md+=`> ${project.description}\n\n`;
  if(links.length) md+=links.join("  ·  ")+"\n\n";

  if(project.techStack?.length){
    md+="## Tech Stack\n\n";
    md+=project.techStack.map(t=>`- **${t}**`).join("\n")+"\n\n";
  }

  if(latVer){
    md+="## Current Version\n\n";
    md+=`**v${latVer.version}** — ${new Date(latVer.date).toLocaleDateString("en-US",{year:"numeric",month:"long",day:"numeric"})}\n`;
    if(latVer.releaseNotes) md+=`\n${latVer.releaseNotes}\n`;
    md+="\n";
  }

  if(msTotal>0){
    md+="## Progress\n\n";
    md+=`${msDone} of ${msTotal} milestones complete`;
    if(msTotal>0) md+=` (${Math.round(msDone/msTotal*100)}%)`;
    md+="\n\n";
    const pending=(project.milestones||[]).filter(m=>!m.completed).slice(0,5);
    if(pending.length){
      md+="**Upcoming milestones:**\n";
      md+=pending.map(m=>`- ${m.title}${m.date?` *(${new Date(m.date).toLocaleDateString()})*`:""}`).join("\n")+"\n\n";
    }
  }

  // Pull any note with setup/install keywords as a Getting Started section
  const setupNote=(project.notes||[]).find(n=>/(setup|install|usage|getting started|how to run)/i.test(n.content));
  if(setupNote){
    md+="## Getting Started\n\n";
    md+=setupNote.content.slice(0,1000)+(setupNote.content.length>1000?"\n\n*(continued in project notes)*":"")+"\n\n";
  }

  if(openIssues.length){
    md+="## Known Issues\n\n";
    md+=openIssues.slice(0,8).map(i=>`- **[${(i.priority||"medium").toUpperCase()}]** ${i.title}${i.description?` — ${i.description.slice(0,80)}`:""}`).join("\n")+"\n\n";
  }

  if(project.versions?.length>1){
    md+="## Version History\n\n";
    project.versions.slice(0,6).forEach(v=>{
      md+=`### v${v.version} — ${new Date(v.date).toLocaleDateString()}\n`;
      if(v.releaseNotes)md+=`${v.releaseNotes.slice(0,300)}\n`;
      md+="\n";
    });
  }

  md+="---\n\n*Generated by [Qoder](https://qoder.dev) "+new Date().toLocaleDateString()+"*\n";
  return md;
}

function downloadReadme(project){
  const md=generateReadme(project);
  const blob=new Blob([md],{type:"text/markdown"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url;a.download=`${project.name.toLowerCase().replace(/\s+/g,"-")}-README.md`;
  a.click();URL.revokeObjectURL(url);
}

// ── Lightweight markdown renderer ─────────────────────────────────────────────
// Supports: # headings, **bold**, *italic*, `code`, ```blocks```, - lists, > quotes, ---
function renderMarkdown(text){
  if(!text)return null;
  const lines=text.split("\n");
  const out=[];let i=0;
  while(i<lines.length){
    const l=lines[i];
    // Fenced code block
    if(l.startsWith("```")){
      const lang=l.slice(3).trim();
      const block=[];i++;
      while(i<lines.length&&!lines[i].startsWith("```")){block.push(lines[i]);i++;}
      out.push(<pre key={i} style={{fontFamily:"'JetBrains Mono'",fontSize:12,background:"var(--bg)",border:"1px solid var(--border)",borderRadius:8,padding:"12px 14px",overflowX:"auto",margin:"10px 0",color:"var(--txt-sub)",lineHeight:1.7}}><code>{block.join("\n")}</code></pre>);
      i++;continue;
    }
    // HR
    if(/^---+$/.test(l.trim())){out.push(<hr key={i} style={{border:"none",borderTop:"1px solid var(--border)",margin:"16px 0"}}/>);i++;continue;}
    // Headings
    const hm=l.match(/^(#{1,3})\s+(.+)/);
    if(hm){const sz=[20,17,15][hm[1].length-1];out.push(<div key={i} style={{fontFamily:"'Syne'",fontWeight:700,fontSize:sz,color:"var(--txt)",margin:`${hm[1].length===1?"18px":"12px"} 0 6px`}}>{inlinesMd(hm[2])}</div>);i++;continue;}
    // Blockquote
    if(l.startsWith("> ")){out.push(<div key={i} style={{borderLeft:"3px solid var(--border-md)",paddingLeft:12,margin:"4px 0",color:"var(--txt-sub)",fontSize:13,lineHeight:1.6}}>{inlinesMd(l.slice(2))}</div>);i++;continue;}
    // Unordered list
    if(/^[-*]\s/.test(l)){out.push(<div key={i} style={{display:"flex",gap:8,margin:"2px 0"}}><span style={{color:"var(--txt-muted)",flexShrink:0,marginTop:2}}>•</span><span style={{color:"var(--txt-sub)",fontSize:14,lineHeight:1.6}}>{inlinesMd(l.slice(2))}</span></div>);i++;continue;}
    // Numbered list
    const nm=l.match(/^(\d+)\.\s+(.+)/);
    if(nm){out.push(<div key={i} style={{display:"flex",gap:8,margin:"2px 0"}}><span style={{color:"var(--txt-muted)",flexShrink:0,fontFamily:"'JetBrains Mono'",fontSize:12,marginTop:2}}>{nm[1]}.</span><span style={{color:"var(--txt-sub)",fontSize:14,lineHeight:1.6}}>{inlinesMd(nm[2])}</span></div>);i++;continue;}
    // Empty line → spacer
    if(!l.trim()){out.push(<div key={i} style={{height:8}}/>);i++;continue;}
    // Normal paragraph
    out.push(<p key={i} style={{color:"var(--txt-sub)",fontSize:14,lineHeight:1.75,margin:"2px 0"}}>{inlinesMd(l)}</p>);
    i++;
  }
  return<>{out}</>;
}

function inlinesMd(text){
  // Split on inline patterns: **bold**, *italic*, `code`, [link](url)
  const parts=[];let remaining=text;let key=0;
  while(remaining){
    // Bold
    const bm=remaining.match(/\*\*(.+?)\*\*/);
    // Italic
    const im=remaining.match(/\*([^*]+?)\*/);
    // Code
    const cm=remaining.match(/`([^`]+?)`/);
    // Link
    const lm=remaining.match(/\[(.+?)\]\((.+?)\)/);
    // Find earliest match
    const candidates=[bm&&{m:bm,type:"b"},im&&{m:im,type:"i"},cm&&{m:cm,type:"c"},lm&&{m:lm,type:"l"}].filter(Boolean);
    if(!candidates.length){parts.push(<span key={key++}>{remaining}</span>);break;}
    const earliest=candidates.reduce((a,b)=>b.m.index<a.m.index?b:a);
    const {m,type}=earliest;
    if(m.index>0)parts.push(<span key={key++}>{remaining.slice(0,m.index)}</span>);
    if(type==="b")parts.push(<strong key={key++} style={{color:"var(--txt)"}}>{m[1]}</strong>);
    else if(type==="i")parts.push(<em key={key++} style={{color:"var(--txt-sub)",fontStyle:"italic"}}>{m[1]}</em>);
    else if(type==="c")parts.push(<code key={key++} style={{fontFamily:"'JetBrains Mono'",fontSize:12,background:"var(--accent-dim)",color:"var(--accent)",padding:"1px 5px",borderRadius:4}}>{m[1]}</code>);
    else if(type==="l")parts.push(<a key={key++} href={m[2]} target="_blank" rel="noreferrer" style={{color:"#00D4FF",textDecoration:"underline"}}>{m[1]}</a>);
    remaining=remaining.slice(m.index+m[0].length);
  }
  return parts.length?parts:text;
}

// ── GitHub Release publisher ───────────────────────────────────────────────────
async function publishGitHubRelease(owner,repo,token,tagName,name,body,draft=false){
  const res=await fetch(`https://api.github.com/repos/${owner}/${repo}/releases`,{
    method:"POST",
    headers:{"Authorization":`token ${token}`,"Content-Type":"application/json","Accept":"application/vnd.github+json"},
    body:JSON.stringify({tag_name:tagName,name,body,draft,generate_release_notes:false}),
  });
  const data=await res.json();
  if(!res.ok)throw new Error(data.message||"GitHub Release failed");
  return data; // {html_url, ...}
}

function parseGitHubRepo(gitUrl){
  if(!gitUrl)return null;
  const m=gitUrl.match(/github\.com[/:]([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:\/|$)/i);
  return m?{owner:m[1],repo:m[2]}:null;
}

async function fetchGitHubAPI(owner,repo,token){
  const h=token?{Authorization:`token ${token}`}:{};
  try{
    const [commits,issues,prs]=await Promise.all([
      fetch(`https://api.github.com/repos/${owner}/${repo}/commits?per_page=15`,{headers:h}).then(r=>r.ok?r.json():[]).catch(()=>[]),
      fetch(`https://api.github.com/repos/${owner}/${repo}/issues?state=open&per_page=15&labels=`,{headers:h}).then(r=>r.ok?r.json():[]).catch(()=>[]),
      fetch(`https://api.github.com/repos/${owner}/${repo}/pulls?state=open&per_page=10`,{headers:h}).then(r=>r.ok?r.json():[]).catch(()=>[]),
    ]);
    return{
      commits:(Array.isArray(commits)?commits:[]).filter(c=>c.sha).map(c=>({sha:c.sha?.slice(0,7),message:c.commit?.message?.split("\n")[0]||"",author:c.commit?.author?.name||"",date:c.commit?.author?.date,url:c.html_url})),
      issues:(Array.isArray(issues)?issues:[]).filter(i=>!i.pull_request).map(i=>({id:i.number,title:i.title,state:i.state,labels:(i.labels||[]).map(l=>l.name),url:i.html_url,date:i.created_at})),
      prs:(Array.isArray(prs)?prs:[]).map(p=>({id:p.number,title:p.title,draft:p.draft,url:p.html_url,date:p.created_at,base:p.base?.ref})),
      fetchedAt:new Date().toISOString(),owner,repo,
    };
  }catch(e){return{error:e.message,commits:[],issues:[],prs:[],fetchedAt:new Date().toISOString(),owner,repo};}
}

// ── Slug & export helpers ─────────────────────────────────────────────────────
function generateSlug(name){
  return name.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,40)+"-"+Math.random().toString(36).slice(2,6);
}

function exportProjectJSON(project){
  const data=JSON.stringify({exportedAt:new Date().toISOString(),version:"qoder-v0.3",project},null,2);
  const blob=new Blob([data],{type:"application/json"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");a.href=url;a.download=`${project.name.replace(/\s+/g,"-")}-export.json`;a.click();
  setTimeout(()=>URL.revokeObjectURL(url),5000);
}

function exportProjectPDF(project){
  const scfg={"planning":"Planning","in-dev":"In Development","beta":"Beta","released":"Released","archived":"Archived"};
  const msTotal=project.milestones?.length||0,msDone=project.milestones?.filter(m=>m.completed).length||0;
  const openIssues=(project.issues||[]).filter(i=>i.status==="open");
  const openTodos=(project.todos||[]).filter(t=>!t.completed);
  const priorityBadge=p=>p==="critical"?"crit":p==="high"?"high":"ok";
  const html=`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${project.name} — Qoder Report</title>
<style>*{box-sizing:border-box;margin:0;padding:0;}body{font-family:'Segoe UI',system-ui,sans-serif;color:#1a1a2e;padding:40px;max-width:900px;margin:0 auto;font-size:14px;line-height:1.6;}h1{font-size:28px;font-weight:800;letter-spacing:-1px;margin-bottom:6px;}h2{font-size:16px;font-weight:700;margin:28px 0 10px;padding-bottom:6px;border-bottom:2px solid #e8eaf6;}
.meta{color:#6b7290;font-size:13px;margin-bottom:16px;}.status{display:inline-block;padding:3px 10px;border-radius:4px;font-size:11px;font-weight:700;font-family:monospace;background:#e8f8ff;color:#0098b8;margin-bottom:14px;}
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:16px 0;}.stat{background:#f8f9ff;border:1px solid #e8eaf6;border-radius:8px;padding:14px;text-align:center;}.stat-val{font-size:24px;font-weight:800;color:#00a8c8;font-family:monospace;}.stat-lbl{font-size:11px;color:#8b8fa8;margin-top:4px;text-transform:uppercase;letter-spacing:.5px;}
.tag{display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-family:monospace;background:#f0f0ff;color:#4b5268;margin:2px;}.item{padding:9px 0;border-bottom:1px solid #f0f0f8;}.item:last-child{border-bottom:none;}.item-title{font-weight:600;}.item-meta{font-size:12px;color:#8b8fa8;margin-top:2px;}
.badge{display:inline-block;padding:2px 7px;border-radius:4px;font-size:10px;font-weight:700;margin-right:6px;}.badge-ok{background:#e8fff0;color:#16a34a;}.badge-high{background:#fff3e0;color:#ea580c;}.badge-crit{background:#fee2e2;color:#dc2626;}
.done{text-decoration:line-through;color:#9ca3af;}.progress{height:7px;background:#e8eaf6;border-radius:4px;margin:6px 0;}.progress-fill{height:7px;background:linear-gradient(90deg,#00c8ff,#00e896);border-radius:4px;}
.note{background:#f8f9ff;border-left:3px solid #00c8ff;padding:10px 14px;border-radius:0 6px 6px 0;font-size:13px;white-space:pre-wrap;margin-bottom:10px;}
footer{margin-top:40px;padding-top:14px;border-top:1px solid #e8eaf6;font-size:11px;color:#9ca3af;text-align:center;}
@media print{body{padding:20px;}h2{break-after:avoid;}@page{margin:.8in;}}</style></head><body>
<h1>${project.name}</h1><div class="status">${scfg[project.status]||project.status}</div>
<div class="meta">${project.description||""}</div>
${project.techStack?.length?`<div style="margin-bottom:14px">${project.techStack.map(t=>`<span class="tag">${t}</span>`).join("")}</div>`:""}
<div class="stats">
  <div class="stat"><div class="stat-val">${project.versions?.length||0}</div><div class="stat-lbl">Releases</div></div>
  <div class="stat"><div class="stat-val">${msDone}/${msTotal}</div><div class="stat-lbl">Milestones</div></div>
  <div class="stat"><div class="stat-val">${openIssues.length}</div><div class="stat-lbl">Open Issues</div></div>
  <div class="stat"><div class="stat-val">${openTodos.length}</div><div class="stat-lbl">Open Tasks</div></div>
</div>
${msTotal>0?`<div class="progress"><div class="progress-fill" style="width:${Math.round(msDone/msTotal*100)}%"></div></div><div style="font-size:12px;color:#8b8fa8;margin-bottom:18px">${msDone}/${msTotal} milestones complete (${Math.round(msDone/msTotal*100)}%)</div>`:""}
${project.versions?.length?`<h2>Version History</h2>${project.versions.slice(0,10).map(v=>`<div class="item"><div class="item-title">${v.version}</div><div class="item-meta">${new Date(v.date).toLocaleDateString("en-US",{year:"numeric",month:"long",day:"numeric"})}${v.releaseNotes?` — ${v.releaseNotes.slice(0,100)}`:""}</div></div>`).join("")}`:""}
${openIssues.length?`<h2>Open Issues (${openIssues.length})</h2>${openIssues.map(i=>`<div class="item"><span class="badge badge-${priorityBadge(i.priority)}">${(i.priority||"medium").toUpperCase()}</span><span class="item-title">${i.title}</span>${i.description?`<div class="item-meta">${i.description.slice(0,100)}</div>`:""}</div>`).join("")}`:""}
${openTodos.length?`<h2>Open Tasks (${openTodos.length})</h2>${openTodos.map(t=>`<div class="item"><span class="badge badge-${priorityBadge(t.priority)}">${(t.priority||"medium").toUpperCase()}</span>${t.text}</div>`).join("")}`:""}
${project.milestones?.length?`<h2>Milestones</h2>${project.milestones.map(m=>`<div class="item"><span class="${m.completed?"done":""}">${m.completed?"☑":"☐"} <strong>${m.title}</strong>${m.date?` — ${new Date(m.date).toLocaleDateString()}`:""}</span></div>`).join("")}`:""}
${project.notes?.length?`<h2>Notes (${project.notes.length})</h2>${project.notes.slice(0,5).map(n=>`<div class="note">${n.content.slice(0,300)}${n.content.length>300?"…":""}</div>`).join("")}`:""}
<footer>Generated by Qoder ${APP_VER} · ${new Date().toLocaleString()} · ${project.name}</footer>
</body></html>`;
  // Electron: write to temp file and open with default browser via IPC
  if (window.electronAPI?.openHTMLInBrowser) {
    window.electronAPI.openHTMLInBrowser(html);
    return;
  }
  // Browser / Capacitor: blob URL (no pop-up needed)
  try {
    const blob=new Blob([html],{type:"text/html"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=url; a.target="_blank"; a.click();
    setTimeout(()=>URL.revokeObjectURL(url),10000);
  } catch {
    alert("PDF export not supported in this environment.");
  }
}

export default function QoderApp() {
  const [screen,      setScreen]      = useState("loading");
  const [cfg,         setCfg]         = useState(null);
  const [session,     setSession]     = useState(null);
  const [projects,    setProjects]    = useState([]);
  const [busy,        setBusy]        = useState(false);
  const [toast,       setToast]       = useState(null);
  const [view,        setView]        = useState("dashboard"); // dashboard|project|workspace
  const [selProj,     setSelProj]     = useState(null);
  const [projTab,     setProjTab]     = useState("overview");

  // ── Pomodoro state lifted to App level so tab switching doesn't reset it ────
  const POM_WORK=25*60,POM_BREAK=5*60,POM_LONG_BREAK=15*60;
  const [pomMode,setPomMode]=useState("work");
  const [pomSecs,setPomSecs]=useState(25*60);
  const [pomActive,setPomActive]=useState(false);
  const [pomSession,setPomSession]=useState(null);
  const [pomCycles,setPomCycles]=useState(0);
  const pomEndTimeRef=useRef(null);
  const [modal,       setModal]       = useState(null);
  const [form,        setForm]        = useState({});
  const [search,      setSearch]      = useState("");
  const [filter,      setFilter]      = useState("all");
  const [sidebarOpen,     setSidebarOpen]     = useState(false);
  const [sidebarWidth,    setSidebarWidth]    = useState(()=>{ try{return parseInt(localStorage.getItem("q-sidebar-w")||"240",10);}catch{return 240;} });
  const [sidebarCollapsed,setSidebarCollapsed]= useState(()=>{ try{return localStorage.getItem("q-sidebar-c")==="1";}catch{return false;} });
  const [updateStatus,    setUpdateStatus]    = useState(null); // null | "available" | "downloading" | "ready" | "current" | "error"
  const [updateError,     setUpdateError]     = useState("");
  const [downloadPct,     setDownloadPct]     = useState(0);
  const [cmdPalette,      setCmdPalette]      = useState(false);
  const [draggedTodo,     setDraggedTodo]     = useState(null); // {todo, sourcePid}
  const [dragOverPid,     setDragOverPid]     = useState(null);
  const dragGroupIdxRef   = useRef(null); // App-level ref for group drag index
  const draggingGroupsRef = useRef(null); // Holds the optimistic reordered array during drag
  const [jotPad,          setJotPad]          = useState(false);
  const [compareModal,    setCompareModal]    = useState(false);
  const [jotText,         setJotText]         = useState("");
  const [checklistTemplates, setChecklistTemplates] = useState([]);
  const [tabOrder,        setTabOrder]        = useState(DEFAULT_TABS);
  const [tagFilter,       setTagFilter]       = useState(null);
  const [lightbox,        setLightbox]        = useState(null);
  const [confirmState,    setConfirmState]    = useState(null);
  const [userTags,        setUserTags]        = useState([]);
  const [groups,          setGroups]          = useState([]);
  const [templates,       setTemplates]       = useState([]);
  const [ghCache,         setGhCache]         = useState({});
  const [theme,           setTheme]           = useState(()=>{try{return localStorage.getItem("q-theme")||"dark";}catch{return"dark";}});
  const [accentColor,     setAccentColor]     = useState(()=>{try{return localStorage.getItem("q-accent")||"#00D4FF";}catch{return"#00D4FF";}});
  const [customStatuses,  setCustomStatuses]  = useState({});
  const isMobile = useIsMobile();
  const projRef    = useRef(projects);
  const sessionRef = useRef(null);
  const cfgRef     = useRef(null);
  const groupsRef  = useRef([]);
  const sidebarDragRef = useRef(null);
  projRef.current    = projects;
  sessionRef.current = session;
  cfgRef.current     = cfg;
  groupsRef.current  = groups;

  // JWT-aware API call wrapper — retries once after refresh on token expiry
  const apiCall=useCallback(async(fn)=>{
    try{ return await fn(); }
    catch(e){
      if(e.message&&(e.message.toLowerCase().includes("jwt")||e.message.toLowerCase().includes("expired")||e.message.toLowerCase().includes("401"))){
        try{
          const stored=await store.get(CFG_KEY);
          if(stored){
            const saved=JSON.parse(stored.value);
            const res=await sb.refresh(cfg.url,cfg.key,saved.session?.refresh_token||session.refresh_token||"");
            if(res.access_token){
              const newSess={access_token:res.access_token,refresh_token:res.refresh_token,user:res.user};
              setSession(newSess);await persistCfg(cfg,newSess);
              return await fn(); // retry
            }
          }
        }catch{}
      }
      throw e;
    }
  },[cfg,session]);

  // Pull-to-refresh on mobile
  const doRefresh=useCallback(async()=>{
    try{
      const pjs=await loadProjects(cfg.url,cfg.key,session.access_token,session.user.id);
      setProjects(pjs);showToast("Refreshed","ok");
    }catch{}
  },[cfg,session]);
  // Pull-to-refresh removed — refresh icon in mobile header handles this

  const saveTheme=(t)=>{
    setTheme(t);
    try{localStorage.setItem("q-theme",t);}catch{}
    syncTitlebar(t,accentColor);
  };
  const saveAccent=(c)=>{
    setAccentColor(c);
    try{localStorage.setItem("q-accent",c);}catch{}
    syncTitlebar(theme,c);
  };

  // Sync Windows titlebar overlay colors with current theme
  function syncTitlebar(themeName, accent){
    if(!window.electronAPI?.setTitlebarOverlay)return;
    const isLight=themeName==="light";
    window.electronAPI.setTitlebarOverlay({
      color:      isLight?"#C8CCDA":"#0c1020",
      symbolColor:isLight?"#1E2C48":"#8B8FA8",
      height: 32,
    });
  }

  // Sync titlebar on first render
  useEffect(()=>{ syncTitlebar(theme,accentColor); },[]);
  const applyCustomStatus=(key,label)=>setCustomStatuses(prev=>({...prev,[key]:label}));
  const resetCustomStatus=(key)=>setCustomStatuses(prev=>{const n={...prev};delete n[key];return n;});

  // Merge custom labels into STATUS_CONFIG at runtime
  const effectiveStatuses=Object.fromEntries(
    Object.entries(STATUS_CONFIG).map(([k,v])=>([k,{...v,label:customStatuses[k]||v.label}]))
  );

  const showToast = (msg,type="ok") => { setToast({msg,type}); setTimeout(()=>setToast(null),3500); };

  const handleCheckForUpdates = async () => {
    setUpdateStatus("checking");
    try {
      const result = await window.electronAPI?.checkForUpdates?.();
      if (!result) { setUpdateStatus(null); return; }
      if (result.status === "available")     { setUpdateStatus("available");  showToast(`Update v${result.version} available`, "info"); }
      else if (result.status === "not-available") { setUpdateStatus("current"); setTimeout(()=>setUpdateStatus(s=>s==="current"?null:s), 4000); }
      else if (result.status === "error")    { setUpdateError(result.message||"Update check failed"); setUpdateStatus("error"); setTimeout(()=>setUpdateStatus(null),8000); }
    } catch(e) {
      setUpdateStatus("error");
      showToast(e.message||"Update check failed", "err");
      setTimeout(()=>setUpdateStatus(null), 5000);
    }
  };

  // Sidebar resize drag
  const startSidebarDrag = (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = sidebarWidth;
    const onMove = (ev) => {
      const newW = Math.min(420, Math.max(180, startW + ev.clientX - startX));
      setSidebarWidth(newW);
      try { localStorage.setItem("q-sidebar-w", newW); } catch {}
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const toggleSidebarCollapse = () => {
    const next = !sidebarCollapsed;
    setSidebarCollapsed(next);
    try { localStorage.setItem("q-sidebar-c", next ? "1" : "0"); } catch {}
  };

  // ── Global Workspace (localStorage) ──────────────────────────────────────────
  const [workspace,setWorkspace]=useState({notes:[],ideas:[],snippets:[]});
  // Save workspace to Supabase user_settings (syncs across devices) + localStorage fallback
  const saveWorkspace=(next)=>{
    setWorkspace(next);
    try{localStorage.setItem("q-workspace",JSON.stringify(next));}catch{}
    // Use refs to avoid stale closure — reads latest session/cfg at call time
    const sess=sessionRef?.current;
    const c=cfgRef?.current;
    if(sess?.access_token&&c?.url){
      sb.upsertSettings(c.url,c.key,sess.access_token,sess.user.id,{workspace_data:next}).catch(()=>{});
    }
  };
  const addWorkspaceNote=(content)=>saveWorkspace({...workspace,notes:[{id:Date.now()+"",content,pinned:false,createdAt:new Date().toISOString()},...workspace.notes]});
  const pinWorkspaceNote=(id)=>saveWorkspace({...workspace,notes:workspace.notes.map(n=>n.id===id?{...n,pinned:!n.pinned}:n)});
  const editWorkspaceNote=(id,content)=>saveWorkspace({...workspace,notes:workspace.notes.map(n=>n.id===id?{...n,content}:n)});
  const deleteWorkspaceNote=(id)=>saveWorkspace({...workspace,notes:workspace.notes.filter(n=>n.id!==id)});
  const addWorkspaceIdea=(content)=>saveWorkspace({...workspace,ideas:[{id:Date.now()+"",content,pinned:false,createdAt:new Date().toISOString()},...workspace.ideas]});
  const pinWorkspaceIdea=(id)=>saveWorkspace({...workspace,ideas:workspace.ideas.map(i=>i.id===id?{...i,pinned:!i.pinned}:i)});
  const deleteWorkspaceIdea=(id)=>saveWorkspace({...workspace,ideas:workspace.ideas.filter(i=>i.id!==id)});
  const addWorkspaceSnippet=(title,content,language)=>saveWorkspace({...workspace,snippets:[{id:Date.now()+"",title,content,language:language||"javascript",pinned:false,createdAt:new Date().toISOString()},...workspace.snippets]});
  const pinWorkspaceSnippet=(id)=>saveWorkspace({...workspace,snippets:workspace.snippets.map(s=>s.id===id?{...s,pinned:!s.pinned}:s)});
  const deleteWorkspaceSnippet=(id)=>saveWorkspace({...workspace,snippets:workspace.snippets.filter(s=>s.id!==id)});

  // Register the styled confirm dialog
  useEffect(() => {
    _confirmResolver = ({msg, resolve}) => setConfirmState({msg, resolve});
    return () => { _confirmResolver = null; };
  }, []);

  // Auto-update listeners (Electron only)
  useEffect(() => {
    if (!window.electronAPI?.onUpdateAvailable) return;
    const cleanA  = window.electronAPI.onUpdateAvailable((_,v)=>setUpdateStatus("available"));
    const cleanP  = window.electronAPI.onUpdateProgress?.((_,pct)=>{setUpdateStatus("downloading");setDownloadPct(pct||0);});
    const cleanR  = window.electronAPI.onUpdateReady((_,v)=>{console.log("[updater] ready",v);setUpdateStatus("ready");});
    const cleanN  = window.electronAPI.onUpdateNotAvailable?.(()=>setUpdateStatus(s=>s==="downloading"||s==="ready"?s:"current"));
    const cleanE  = window.electronAPI.onUpdateError?.((_,msg)=>{setUpdateError(msg||"Update error");setUpdateStatus(s=>s==="downloading"||s==="ready"?s:"error");});
    const cleanM  = window.electronAPI.onMenuCheckUpdates?.(()=>handleCheckForUpdates());
    return () => { cleanA?.(); cleanP?.(); cleanR?.(); cleanN?.(); cleanE?.(); cleanM?.(); };
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
            const tags=await loadUserTags(saved.url,saved.key,res.access_token,res.user.id);
            setUserTags(tags);
            const grps1=await loadUserGroups(saved.url,saved.key,res.access_token,res.user.id);
            setGroups(grps1);
            try{
              const trows=await sb.get(saved.url,saved.key,res.access_token,"project_templates",`?user_id=eq.${res.user.id}&order=created_at.desc`);
              setChecklistTemplates((trows||[]).filter(t=>t.template_type==="checklist"));
              setTemplates(trows.map(r=>({id:r.id,name:r.name,description:r.description,templateData:r.template_data,createdAt:r.created_at})));
            }catch{}
            try{
              const sett=await sb.get(saved.url,saved.key,res.access_token,"user_settings",`?user_id=eq.${res.user.id}`);
              if(sett?.[0]?.tab_order){const merged=mergeTabOrder(sett[0].tab_order);setTabOrder(merged);}
              if(sett?.[0]?.custom_statuses)setCustomStatuses(sett[0].custom_statuses||{});
              if(sett?.[0]?.theme&&sett[0].theme!=="dark"){saveTheme(sett[0].theme);}
              if(sett?.[0]?.accent_color&&sett[0].accent_color!=="#00D4FF"){saveAccent(sett[0].accent_color);}
              if(sett?.[0]?.workspace_data){const wd=sett[0].workspace_data;setWorkspace({notes:wd.notes||[],ideas:wd.ideas||[],snippets:wd.snippets||[]});}
              else{try{const d=JSON.parse(localStorage.getItem("q-workspace")||"{}");if(d.notes||d.ideas||d.snippets)setWorkspace({notes:d.notes||[],ideas:d.ideas||[],snippets:d.snippets||[]});}catch{}}
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

  const saveProjectTabOrder=async(pid,order)=>{
    try{
      await sb.patch(cfg.url,cfg.key,T(),"projects",pid,{tab_order_override:order});
      mutate(pid,p=>({...p,tabOrderOverride:order}));
      showToast("Tab order saved for this project");
    }catch(e){showToast(e.message,"err");}
  };
  const saveTabOrderSync=async(order)=>{
    setTabOrder(order);
    if(!session||!cfg)return;
    try{await sb.upsertSettings(cfg.url,cfg.key,session.access_token,session.user.id,{tab_order:order});}catch{}
  };

  const savePreferences=async(prefs)=>{
    if(prefs.theme!==undefined){saveTheme(prefs.theme);}
    if(prefs.accentColor!==undefined){saveAccent(prefs.accentColor);}
    if(prefs.customStatuses!==undefined){setCustomStatuses(prefs.customStatuses);}
    syncTitlebar(prefs.theme??theme, prefs.accentColor??accentColor);
    if(!session||!cfg)return;
    // Always write all three fields together so nothing gets stale on sync
    try{
      await sb.upsertSettings(cfg.url,cfg.key,session.access_token,session.user.id,{
        theme:           prefs.theme          ??theme,
        accent_color:    prefs.accentColor    ??accentColor,
        custom_statuses: prefs.customStatuses ??customStatuses,
      });
    }catch(e){showToast("Settings saved locally — sync failed","info");}
  };

  // ── App-level Pomodoro countdown (survives tab switches) ────────────────────
  useEffect(()=>{
    if(!pomActive){pomEndTimeRef.current=null;return;}
    if(!pomEndTimeRef.current) pomEndTimeRef.current=Date.now()+(pomSecs*1000);
    const iv=setInterval(()=>{
      const remaining=Math.round((pomEndTimeRef.current-Date.now())/1000);
      if(remaining<=0){
        clearInterval(iv);pomEndTimeRef.current=null;
        if(pomMode==="work"){
          const newCycles=pomCycles+1;setPomCycles(newCycles);
          const breakLen=newCycles%4===0?POM_LONG_BREAK:POM_BREAK;
          setPomMode("break");setPomSecs(breakLen);
          if(pomSession&&selProj){stopTimer(selProj.id,pomSession,`Pomodoro #${newCycles} completed`);setPomSession(null);}
          try{new Audio("data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAA").play();}catch{}
        } else {setPomMode("work");setPomSecs(POM_WORK);}
        setPomActive(false);
      } else {setPomSecs(remaining);}
    },500);
    return()=>clearInterval(iv);
  },[pomActive]);

  // ── Milestone due date reminders ─────────────────────────────────────────────
  useEffect(()=>{
    if(!projects.length)return;
    const today=new Date();today.setHours(0,0,0,0);
    const soon=new Date(today);soon.setDate(today.getDate()+3);
    const overdue=[];const dueSoon=[];
    projects.filter(p=>p.status!=="archived").forEach(p=>{
      (p.milestones||[]).filter(m=>!m.completed&&m.date).forEach(m=>{
        const d=new Date(m.date);d.setHours(0,0,0,0);
        if(d<today)overdue.push({project:p.name,title:m.title,date:m.date});
        else if(d<=soon)dueSoon.push({project:p.name,title:m.title,date:m.date});
      });
    });
    if(overdue.length){
      showToast(`${overdue.length} overdue milestone${overdue.length>1?"s":""}: ${overdue[0].title}`,"err");
    } else if(dueSoon.length){
      showToast(`${dueSoon.length} milestone${dueSoon.length>1?"s":""} due within 3 days`,"info");
    }
  // Only fire when milestone dates or completion status actually change
  },[JSON.stringify(projects.flatMap(p=>(p.milestones||[]).filter(m=>!m.completed&&m.date).map(m=>m.id+m.date)).sort())]);
  useEffect(()=>{
    if(screen!=="app"||!cfg||!session)return;
    const refresh=async()=>{
      try{
        const pjs=await loadProjects(cfg.url,cfg.key,session.access_token,session.user.id);
        // Spawn new copies of recurring todos whose nextDueAt has passed
        const now=new Date();
        for(const p of pjs){
          for(const t of (p.todos||[])){
            if(t.completed&&t.recurring&&t.nextDueAt&&new Date(t.nextDueAt)<=now){
              const position=(p.todos||[]).length;
              try{
                await sb.post(cfg.url,cfg.key,session.access_token,"todos",{project_id:p.id,text:t.text,completed:false,priority:t.priority,recurring:true,recurrence_type:t.recurrenceType,position});
                await sb.patch(cfg.url,cfg.key,session.access_token,"todos",t.id,{next_due_at:null});
              }catch{}
            }
          }
        }
        setProjects(pjs);
        const tags=await loadUserTags(cfg.url,cfg.key,session.access_token,session.user.id);
        setUserTags(tags);
        try{const grps2=await loadUserGroups(cfg.url,cfg.key,session.access_token,session.user.id);setGroups(grps2);}catch{}
        // Sync workspace data from Supabase on every poll
        try{
          const sett=await sb.get(cfg.url,cfg.key,session.access_token,"user_settings",`?user_id=eq.${session.user.id}`);
          if(sett?.[0]?.workspace_data){
            const wd=sett[0].workspace_data;
            setWorkspace(prev=>{
              // Only update if data actually changed to avoid unnecessary re-renders
              const next={notes:wd.notes||[],ideas:wd.ideas||[],snippets:wd.snippets||[]};
              const prevStr=JSON.stringify({notes:prev.notes,ideas:prev.ideas,snippets:prev.snippets});
              const nextStr=JSON.stringify(next);
              return prevStr===nextStr?prev:next;
            });
          }
        }catch{}
      }catch{}
    };
    // JWT token refresh every 45 minutes to prevent expiry
    const refreshJWT=async()=>{
      try{
        const stored=await store.get(CFG_KEY);
        if(!stored)return;
        const saved=JSON.parse(stored.value);
        if(!saved.session?.refresh_token)return;
        const res=await sb.refresh(cfg.url,cfg.key,saved.session.refresh_token);
        if(res.access_token){
          const newSess={access_token:res.access_token,refresh_token:res.refresh_token,user:res.user};
          setSession(newSess);
          await persistCfg(cfg,newSess);
        }
      }catch{}
    };
    const onFocus=()=>refresh();
    const onVisible=()=>{if(!document.hidden)refresh();};
    window.addEventListener("focus",onFocus);
    document.addEventListener("visibilitychange",onVisible);
    const pollIv=setInterval(refresh,POLL_MS);
    const jwtIv=setInterval(refreshJWT,45*60*1000); // 45 min
    return()=>{window.removeEventListener("focus",onFocus);document.removeEventListener("visibilitychange",onVisible);clearInterval(pollIv);clearInterval(jwtIv);};
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
      // Ctrl+K — command palette
      if(e.ctrlKey&&e.key==="k"){e.preventDefault();setCmdPalette(v=>!v);return;}
      // Ctrl+J — quick note jot pad
      if(e.ctrlKey&&e.key==="j"){e.preventDefault();setJotPad(v=>!v);return;}
      // ? — keyboard shortcuts help
      if(e.key==="?"&&!e.ctrlKey&&!e.altKey&&!["INPUT","TEXTAREA","SELECT"].includes(document.activeElement?.tagName)){
        openModal("shortcuts",{});return;
      }
      // Skip if typing in an input
      if(["INPUT","TEXTAREA","SELECT"].includes(document.activeElement?.tagName))return;
      // Ctrl+Up / Ctrl+PgUp — previous project (sidebar order)
      if(e.ctrlKey&&(e.key==="ArrowUp"||e.key==="PageUp")){
        e.preventDefault();
        // Build ordered list matching sidebar: grouped (by group order) then ungrouped, no archived
        const all=projRef.current.filter(p=>p.status!=="archived");
        const grpOrder=groupsRef.current||[];
        const grouped=grpOrder.flatMap(g=>all.filter(p=>p.groupId===g.id));
        const ungrouped=all.filter(p=>!p.groupId);
        const ordered=[...grouped,...ungrouped];
        if(!ordered.length)return;
        const idx=ordered.findIndex(p=>p.id===selProj?.id);
        const next=ordered[Math.max(0,idx-1)];
        if(next)openProject(next);
        return;
      }
      // Ctrl+Down / Ctrl+PgDn — next project (sidebar order)
      if(e.ctrlKey&&(e.key==="ArrowDown"||e.key==="PageDown")){
        e.preventDefault();
        const all=projRef.current.filter(p=>p.status!=="archived");
        const grpOrder=groupsRef.current||[];
        const grouped=grpOrder.flatMap(g=>all.filter(p=>p.groupId===g.id));
        const ungrouped=all.filter(p=>!p.groupId);
        const ordered=[...grouped,...ungrouped];
        if(!ordered.length)return;
        const idx=ordered.findIndex(p=>p.id===selProj?.id);
        const next=ordered[Math.min(ordered.length-1,idx+1)];
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
        const tags=await loadUserTags(cfg.url,cfg.key,res.access_token,res.user.id);
        setUserTags(tags);
        try{const grps3=await loadUserGroups(cfg.url,cfg.key,res.access_token,res.user.id);setGroups(grps3);}catch{}
        try{
          const sett=await sb.get(cfg.url,cfg.key,res.access_token,"user_settings",`?user_id=eq.${res.user.id}`);
          if(sett?.[0]?.tab_order){setTabOrder(mergeTabOrder(sett[0].tab_order));}
          if(sett?.[0]?.custom_statuses)setCustomStatuses(sett[0].custom_statuses||{});
          if(sett?.[0]?.theme&&sett[0].theme!=="dark"){saveTheme(sett[0].theme);}
          if(sett?.[0]?.accent_color&&sett[0].accent_color!=="#00D4FF"){saveAccent(sett[0].accent_color);}
          // Load workspace data from Supabase (overrides localStorage if present)
          if(sett?.[0]?.workspace_data){
            const wd=sett[0].workspace_data;
            const ws={notes:wd.notes||[],ideas:wd.ideas||[],snippets:wd.snippets||[]};
            setWorkspace(ws);
            try{localStorage.setItem("q-workspace",JSON.stringify(ws));}catch{}
          } else {
            // Fall back to localStorage for first-time or offline
            try{const d=JSON.parse(localStorage.getItem("q-workspace")||"{}");if(d.notes||d.ideas||d.snippets)setWorkspace({notes:d.notes||[],ideas:d.ideas||[],snippets:d.snippets||[]});}catch{}
          }
        }catch{}
        setScreen("app");
      }else if(isSignUp&&res.id){
        showToast("Check your email to confirm your account.","info");
      }else{
        // Throw so AuthScreen can display it inline — never silently swallow
        const msg=res.error_description||res.error||res.msg||res.message||"Authentication failed";
        throw new Error(msg);
      }
    }catch(e){
      // Re-throw so AuthScreen's local catch can display it inline
      throw e;
    }finally{
      setBusy(false);
    }
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
  const addProjectAndReturn=async(p)=>{
    const position=projects.length;
    try{
      const row=await sb.post(cfg.url,cfg.key,T(),"projects",{user_id:session.user.id,name:p.name,description:p.description||null,status:p.status||"planning",tech_stack:p.techStack||[],local_folder:p.localFolder||null,git_url:p.gitUrl||null,supabase_url:p.supabaseUrl||null,vercel_url:p.vercelUrl||null,color:p.color||null,position,is_public:false});
      const proj={id:row.id,name:row.name,description:row.description,status:row.status,techStack:row.tech_stack||[],localFolder:row.local_folder||null,gitUrl:row.git_url||"",supabaseUrl:row.supabase_url||"",vercelUrl:row.vercel_url||"",isPublic:false,publicSlug:null,color:row.color||null,position:row.position,createdAt:row.created_at,versions:[],milestones:[],notes:[],todos:[],assets:[],issues:[],ideas:[],concepts:[],buildLogs:[],environments:[],dependencies:[],tagIds:[],sprints:[],timeSessions:[],snippets:[],dailyLogs:[]};
      setProjects(ps=>[...ps,proj]);
      showToast("Project created");
      // If created from template, apply template data
      if(p._templateId){
        const tpl=templates.find(t=>t.id===p._templateId);
        if(tpl){
          const td=tpl.templateData||{};
          await Promise.all([
            ...(td.milestones||[]).map(m=>addMilestone(proj.id,m)),
            ...(td.todos||[]).map(t=>addTodo(proj.id,t.text,t.priority||"medium")),
            ...(td.environments||[]).map(e=>addEnvironment(proj.id,e)),
          ]);
        }
      }
      return proj;
    }catch(e){showToast(e.message,"err");return null;}
  };
  const updateProject=async(id,p)=>{
    try{await sb.patch(cfg.url,cfg.key,T(),"projects",id,{name:p.name,description:p.description||null,status:p.status,tech_stack:p.techStack||[],local_folder:p.localFolder||null,git_url:p.gitUrl||null,supabase_url:p.supabaseUrl||null,vercel_url:p.vercelUrl||null,color:p.color||null,group_id:p.groupId||null,depends_on:p.dependsOn||[]});mutate(id,x=>({...x,...p}));showToast("Project updated");}
    catch(e){showToast(e.message,"err");}
  };
  const deleteProject=async(id)=>{
    try{await sb.del(cfg.url,cfg.key,T(),"projects",id);setProjects(ps=>ps.filter(p=>p.id!==id));setView("dashboard");setSelProj(null);showToast("Project deleted");}
    catch(e){showToast(e.message,"err");}
  };
  const archiveProject=async(pid)=>{
    const proj=projects.find(p=>p.id===pid);
    if(!proj)return;
    exportProjectJSON(proj);
    try{
      await sb.patch(cfg.url,cfg.key,T(),"projects",pid,{status:"archived"});
      mutate(pid,p=>({...p,status:"archived"}));
      showToast("Project archived — export downloaded");
    }catch(e){showToast(e.message,"err");}
  };

  const duplicateProject=async(pid)=>{
    const proj=projects.find(p=>p.id===pid);
    if(!proj)return;
    showToast("Duplicating project…","info");
    try{
      const position=projects.filter(p=>p.status!=="archived").length;
      const row=await sb.post(cfg.url,cfg.key,T(),"projects",{
        user_id:session.user.id,
        name:`${proj.name} (copy)`,
        description:proj.description||null,
        status:"planning",
        tech_stack:proj.techStack||[],
        color:proj.color||null,
        git_url:proj.gitUrl||null,
        supabase_url:proj.supabaseUrl||null,
        vercel_url:proj.vercelUrl||null,
        position,
        is_public:false,
      });
      const newId=row.id;
      // Clone todos (incomplete only)
      for(const t of (proj.todos||[]).filter(t=>!t.completed)){
        await sb.post(cfg.url,cfg.key,T(),"todos",{project_id:newId,text:t.text,completed:false,priority:t.priority,recurring:t.recurring||false,recurrence_type:t.recurrenceType||null,position:t.position});
      }
      // Clone milestones (incomplete only)
      for(const m of (proj.milestones||[]).filter(m=>!m.completed)){
        await sb.post(cfg.url,cfg.key,T(),"milestones",{project_id:newId,title:m.title,description:m.description||null,date:m.date||null,completed:false});
      }
      // Clone environments (without variable values for safety)
      for(const e of (proj.environments||[])){
        const safeVars=(e.variables||[]).map(v=>({...v,value:""}));
        await sb.post(cfg.url,cfg.key,T(),"environments",{project_id:newId,name:e.name,url:e.url||null,color:e.color||null,variables:safeVars,notes:e.notes||null,position:e.position});
      }
      // Reload projects to get the new one
      const pjs=await loadProjects(cfg.url,cfg.key,session.access_token,session.user.id);
      setProjects(pjs);
      showToast(`"${proj.name} (copy)" created`);
    }catch(e){showToast(e.message,"err");}
  };

  const unarchiveProject=async(pid)=>{
    try{
      await sb.patch(cfg.url,cfg.key,T(),"projects",pid,{status:"planning"});
      mutate(pid,p=>({...p,status:"planning"}));
      showToast("Project restored to Planning");
    }catch(e){showToast(e.message,"err");}
  };

  const handleTodoDrop=async(targetPid)=>{
    if(!draggedTodo||draggedTodo.sourcePid===targetPid)return;
    setDragOverPid(null);
    const {todo,sourcePid}=draggedTodo;
    setDraggedTodo(null);
    try{
      // Move: add to target, delete from source
      const position=(projects.find(p=>p.id===targetPid)?.todos?.length||0);
      const row=await sb.post(cfg.url,cfg.key,T(),"todos",{project_id:targetPid,text:todo.text,completed:false,priority:todo.priority,recurring:todo.recurring||false,recurrence_type:todo.recurrenceType||null,position});
      mutate(targetPid,p=>({...p,todos:[...p.todos,{id:row.id,text:row.text,completed:false,completedAt:null,priority:row.priority||"medium",recurring:row.recurring||false,recurrenceType:row.recurrence_type||null,sprintId:null,position:row.position,createdAt:row.created_at}]}));
      await sb.del(cfg.url,cfg.key,T(),"todos",todo.id);
      mutate(sourcePid,p=>({...p,todos:p.todos.filter(t=>t.id!==todo.id)}));
      const targetName=projects.find(p=>p.id===targetPid)?.name||"project";
      showToast(`Todo moved to "${targetName}"`);
    }catch(e){showToast(e.message,"err");}
  };
  const cloneTodosToProject=async(sourcePid,targetPid,todoIds)=>{
    const sourceTodos=projects.find(p=>p.id===sourcePid)?.todos||[];
    const todosToClone=todoIds.length>0?sourceTodos.filter(t=>todoIds.includes(t.id)):sourceTodos.filter(t=>!t.completed);
    if(!todosToClone.length)return showToast("No todos to clone","err");
    try{
      let cloned=0;
      for(const t of todosToClone){
        const position=(projects.find(p=>p.id===targetPid)?.todos?.length||0)+cloned;
        const row=await sb.post(cfg.url,cfg.key,T(),"todos",{project_id:targetPid,text:t.text,completed:false,priority:t.priority,recurring:t.recurring||false,recurrence_type:t.recurrenceType||null,position});
        mutate(targetPid,p=>({...p,todos:[...p.todos,{id:row.id,text:row.text,completed:false,completedAt:null,priority:row.priority||"medium",recurring:row.recurring||false,recurrenceType:row.recurrence_type||null,sprintId:null,position:row.position,createdAt:row.created_at}]}));
        cloned++;
      }
      showToast(`${cloned} todo${cloned!==1?"s":""} cloned`);
    }catch(e){showToast(e.message,"err");}
  };

  // ── Versions ─────────────────────────────────────────────────────────────────
  const updateVersion=async(pid,vid,v)=>{
    try{
      await sb.patch(cfg.url,cfg.key,T(),"versions",vid,{version:v.version,release_notes:v.releaseNotes||null,date:v.date,file_links:v.fileLinks||[]});
      mutate(pid,p=>({...p,versions:p.versions.map(x=>x.id===vid?{...x,version:v.version,releaseNotes:v.releaseNotes,date:v.date,fileLinks:v.fileLinks||[]}:x)}));
      showToast("Version updated");
    }catch(e){showToast(e.message,"err");}
  };
  const addVersion=async(pid,v)=>{
    try{
      const row=await sb.post(cfg.url,cfg.key,T(),"versions",{project_id:pid,version:v.version,release_notes:v.releaseNotes||null,date:v.date||new Date().toISOString(),file_links:(v.fileLinks||[]).filter(Boolean)});
      mutate(pid,p=>({...p,versions:[{id:row.id,version:row.version,releaseNotes:row.release_notes,date:row.date,fileLinks:row.file_links||[]},...p.versions]}));
      showToast("Version logged");
      // ── Workflow rule: auto-set "Released" when version logged + no critical open issues
      const proj=projects.find(p=>p.id===pid);
      if(proj&&proj.status==="beta"){
        const critOpen=(proj.issues||[]).filter(i=>i.status==="open"&&i.priority==="critical");
        if(critOpen.length===0){
          await sb.patch(cfg.url,cfg.key,T(),"projects",pid,{status:"released"});
          mutate(pid,p=>({...p,status:"released"}));
          showToast("🎉 Status auto-set to Released","ok");
        }
      }
      // Workflow rule: auto-set "Beta" when first version is logged in "in-dev"
      if(proj&&proj.status==="in-dev"&&!proj.versions?.length){
        await sb.patch(cfg.url,cfg.key,T(),"projects",pid,{status:"beta"});
        mutate(pid,p=>({...p,status:"beta"}));
        showToast("Status auto-set to Beta","info");
      }
    }catch(e){showToast(e.message,"err");}
  };
  const deleteVersion=async(pid,vid)=>{try{await sb.del(cfg.url,cfg.key,T(),"versions",vid);mutate(pid,p=>({...p,versions:p.versions.filter(v=>v.id!==vid)}));showToast("Version removed");}catch(e){showToast(e.message,"err");}};

  // ── Milestones ────────────────────────────────────────────────────────────────
  const addMilestone=async(pid,m)=>{try{const row=await sb.post(cfg.url,cfg.key,T(),"milestones",{project_id:pid,title:m.title,description:m.description||null,date:m.date||null,completed:false});mutate(pid,p=>({...p,milestones:[...p.milestones,{id:row.id,title:row.title,description:row.description,date:row.date,completed:false,completedAt:null,createdAt:row.created_at}]}));showToast("Milestone added");}catch(e){showToast(e.message,"err");}};
  const toggleMilestone=async(pid,mid)=>{const ms=projects.find(p=>p.id===pid)?.milestones.find(m=>m.id===mid);if(!ms)return;const completed=!ms.completed;const completedAt=completed?new Date().toISOString():null;try{await sb.patch(cfg.url,cfg.key,T(),"milestones",mid,{completed,completed_at:completedAt});mutate(pid,p=>({...p,milestones:p.milestones.map(m=>m.id===mid?{...m,completed,completedAt}:m)}));}catch(e){showToast(e.message,"err");}};
  const deleteMilestone=async(pid,mid)=>{try{await sb.del(cfg.url,cfg.key,T(),"milestones",mid);mutate(pid,p=>({...p,milestones:p.milestones.filter(m=>m.id!==mid)}));showToast("Milestone removed");}catch(e){showToast(e.message,"err");}};

  // ── Notes ─────────────────────────────────────────────────────────────────────
  const addNote=async(pid,content)=>{const position=projects.find(p=>p.id===pid)?.notes?.length||0;try{const row=await sb.post(cfg.url,cfg.key,T(),"notes",{project_id:pid,content,position});mutate(pid,p=>({...p,notes:[...p.notes,{id:row.id,content:row.content,position:row.position,createdAt:row.created_at}]}));showToast("Note added");}catch(e){showToast(e.message,"err");}};
  const updateNote=async(pid,nid,content)=>{try{await sb.patch(cfg.url,cfg.key,T(),"notes",nid,{content});mutate(pid,p=>({...p,notes:p.notes.map(n=>n.id===nid?{...n,content}:n)}));showToast("Note updated");}catch(e){showToast(e.message,"err");}};
  const deleteNote=async(pid,nid)=>{try{await sb.del(cfg.url,cfg.key,T(),"notes",nid);mutate(pid,p=>({...p,notes:p.notes.filter(n=>n.id!==nid)}));showToast("Note deleted");}catch(e){showToast(e.message,"err");}};
  const linkIssueToVersion=async(pid,iid,vid)=>{
    try{await sb.patch(cfg.url,cfg.key,T(),"issues",iid,{fixed_in_version_id:vid||null});
    mutate(pid,p=>({...p,issues:p.issues.map(i=>i.id===iid?{...i,fixedInVersionId:vid||null}:i)}));}
    catch(e){showToast(e.message,"err");}
  };
  const reorderNotes=async(pid,reordered)=>{mutate(pid,p=>({...p,notes:reordered}));try{await Promise.all(reordered.map((n,i)=>sb.patch(cfg.url,cfg.key,T(),"notes",n.id,{position:i})));}catch{}};
  const pinNote=async(pid,nid)=>{
    const note=projects.find(p=>p.id===pid)?.notes?.find(n=>n.id===nid);
    if(!note)return;
    const pinned=!note.pinned;
    try{await sb.patch(cfg.url,cfg.key,T(),"notes",nid,{pinned});
    mutate(pid,p=>({...p,notes:p.notes.map(n=>n.id===nid?{...n,pinned}:n)}));}
    catch(e){showToast(e.message,"err");}
  };

  // ── Todos — addTodo and toggleTodo defined later with recurring support ────────
  const deleteTodo=async(pid,tid)=>{try{await sb.del(cfg.url,cfg.key,T(),"todos",tid);mutate(pid,p=>({...p,todos:p.todos.filter(t=>t.id!==tid)}));}catch(e){showToast(e.message,"err");}};
  const clearDoneTodos=async(pid,ids)=>{
    // Optimistically remove all from UI immediately
    mutate(pid,p=>({...p,todos:p.todos.filter(t=>!ids.includes(t.id))}));
    // Fire all DB deletes in parallel (no await, UI already updated)
    ids.forEach(id=>sb.del(cfg.url,cfg.key,T(),"todos",id).catch(()=>{}));
  };
  const reorderTodos=async(pid,reordered)=>{mutate(pid,p=>({...p,todos:reordered}));try{await Promise.all(reordered.map((t,i)=>sb.patch(cfg.url,cfg.key,T(),"todos",t.id,{position:i})));}catch{}};

  // ── Assets ────────────────────────────────────────────────────────────────────
  const updateAsset=async(pid,aid,a)=>{try{await sb.patch(cfg.url,cfg.key,T(),"assets",aid,{name:a.name,url:a.url,type:a.type});mutate(pid,p=>({...p,assets:p.assets.map(x=>x.id===aid?{...x,name:a.name,url:a.url,type:a.type}:x)}));showToast("Asset updated");}catch(e){showToast(e.message,"err");}};
  const addAsset=async(pid,a)=>{try{const row=await sb.post(cfg.url,cfg.key,T(),"assets",{project_id:pid,name:a.name,url:a.url,type:a.type||"Link"});mutate(pid,p=>({...p,assets:[...p.assets,{id:row.id,name:row.name,url:row.url,type:row.type,createdAt:row.created_at}]}));showToast("Asset added");}catch(e){showToast(e.message,"err");}};
  const deleteAsset=async(pid,aid)=>{try{await sb.del(cfg.url,cfg.key,T(),"assets",aid);mutate(pid,p=>({...p,assets:p.assets.filter(a=>a.id!==aid)}));showToast("Asset removed");}catch(e){showToast(e.message,"err");}};
  const uploadAssetFile=async(pid,file,name,type)=>{try{showToast("Uploading…","info");const url=await sb.uploadFile(cfg.url,cfg.key,T(),session.user.id,pid,file);await addAsset(pid,{name:name||file.name,url,type:type||"Screenshot"});}catch(e){showToast(e.message,"err");}};

  // ── Issues ────────────────────────────────────────────────────────────────────
  const addIssue=async(pid,iss)=>{try{const row=await sb.post(cfg.url,cfg.key,T(),"issues",{project_id:pid,title:iss.title,description:iss.description||null,status:"open",priority:iss.priority||"medium",screenshot_urls:iss.screenshotUrls||[]});mutate(pid,p=>({...p,issues:[{id:row.id,title:row.title,description:row.description,status:"open",priority:row.priority||"medium",screenshotUrls:row.screenshot_urls||[],fixDescription:null,fixedAt:null,createdAt:row.created_at},...p.issues]}));showToast("Issue logged");}catch(e){showToast(e.message,"err");}};
  const uploadIssueScreenshot=async(pid,iid,file)=>{
    try{
      showToast("Uploading screenshot…","info");
      const url=await sb.uploadFile(cfg.url,cfg.key,T(),session.user.id,pid,file);
      const issue=projects.find(p=>p.id===pid)?.issues.find(i=>i.id===iid);
      const newUrls=[...(issue?.screenshotUrls||[]),url];
      await sb.patch(cfg.url,cfg.key,T(),"issues",iid,{screenshot_urls:newUrls});
      mutate(pid,p=>({...p,issues:p.issues.map(i=>i.id===iid?{...i,screenshotUrls:newUrls}:i)}));
      showToast("Screenshot added");
    }catch(e){showToast(e.message,"err");}
  };
  const removeIssueScreenshot=async(pid,iid,url)=>{
    const issue=projects.find(p=>p.id===pid)?.issues.find(i=>i.id===iid);
    const newUrls=(issue?.screenshotUrls||[]).filter(u=>u!==url);
    try{
      await sb.patch(cfg.url,cfg.key,T(),"issues",iid,{screenshot_urls:newUrls});
      mutate(pid,p=>({...p,issues:p.issues.map(i=>i.id===iid?{...i,screenshotUrls:newUrls}:i)}));
    }catch(e){showToast(e.message,"err");}
  };

  // ── Snippets ──────────────────────────────────────────────────────────────────
  const addSnippet=async(pid,sn)=>{
    try{
      const row=await sb.post(cfg.url,cfg.key,T(),"snippets",{project_id:pid,title:sn.title,language:sn.language||"javascript",content:sn.content,tags:sn.tags||[]});
      mutate(pid,p=>({...p,snippets:[{id:row.id,title:row.title,language:row.language,content:row.content,tags:row.tags||[],createdAt:row.created_at},...(p.snippets||[])]}));
      showToast("Snippet saved");
    }catch(e){showToast(e.message,"err");}
  };
  const updateSnippet=async(pid,sid,sn)=>{
    try{
      await sb.patch(cfg.url,cfg.key,T(),"snippets",sid,{title:sn.title,language:sn.language,content:sn.content,tags:sn.tags||[]});
      mutate(pid,p=>({...p,snippets:p.snippets.map(s=>s.id===sid?{...s,...sn}:s)}));
      showToast("Snippet updated");
    }catch(e){showToast(e.message,"err");}
  };
  // ── Daily Logs ───────────────────────────────────────────────────────────────
  const addDailyLog=async(pid,content,mood=null)=>{
    const logDate=new Date().toISOString().slice(0,10);
    try{
      const row=await sb.post(cfg.url,cfg.key,T(),"daily_logs",{project_id:pid,content,mood,log_date:logDate});
      mutate(pid,p=>({...p,dailyLogs:[{id:row.id,content:row.content,logDate:row.log_date,mood:row.mood,createdAt:row.created_at},...(p.dailyLogs||[])]}));
      showToast("Log entry added");
    }catch(e){showToast(e.message,"err");}
  };
  const editDailyLog=async(pid,lid,content,mood=null)=>{
    try{
      await sb.patch(cfg.url,cfg.key,T(),"daily_logs",lid,{content,mood});
      mutate(pid,p=>({...p,dailyLogs:(p.dailyLogs||[]).map(d=>d.id===lid?{...d,content,mood}:d)}));
      showToast("Log updated");
    }catch(e){showToast(e.message,"err");}
  };
  const deleteDailyLog=async(pid,lid)=>{
    try{
      await sb.del(cfg.url,cfg.key,T(),"daily_logs",lid);
      mutate(pid,p=>({...p,dailyLogs:(p.dailyLogs||[]).filter(d=>d.id!==lid)}));
    }catch(e){showToast(e.message,"err");}
  };
  const deleteSnippet=async(pid,sid)=>{
    try{
      await sb.del(cfg.url,cfg.key,T(),"snippets",sid);
      mutate(pid,p=>({...p,snippets:p.snippets.filter(s=>s.id!==sid)}));
      showToast("Snippet deleted");
    }catch(e){showToast(e.message,"err");}
  };
  const addIssueComment=async(pid,iid,content)=>{
    try{
      const row=await sb.post(cfg.url,cfg.key,T(),"issue_comments",{issue_id:iid,project_id:pid,content});
      const comment={id:row.id,content:row.content,createdAt:row.created_at};
      mutate(pid,p=>({...p,issues:p.issues.map(i=>i.id===iid?{...i,comments:[...(i.comments||[]),comment]}:i)}));
    }catch(e){showToast(e.message,"err");}
  };
  const deleteIssueComment=async(pid,iid,cid)=>{
    try{
      await sb.del(cfg.url,cfg.key,T(),"issue_comments",cid);
      mutate(pid,p=>({...p,issues:p.issues.map(i=>i.id===iid?{...i,comments:(i.comments||[]).filter(c=>c.id!==cid)}:i)}));
    }catch(e){showToast(e.message,"err");}
  };

  // ── GitHub Release ────────────────────────────────────────────────────────────
  const publishRelease=async(pid,tagName,releaseName,body,token,draft)=>{
    const proj=projects.find(p=>p.id===pid);
    const repo=parseGitHubRepo(proj?.gitUrl);
    if(!repo)return showToast("No GitHub URL on this project","err");
    if(!token)return showToast("GitHub token required to publish releases","err");
    try{
      showToast("Publishing to GitHub…","info");
      const rel=await publishGitHubRelease(repo.owner,repo.repo,token,tagName,releaseName,body,draft);
      showToast(draft?"Draft release created — review on GitHub":"Release published on GitHub","ok");
      return rel.html_url;
    }catch(e){showToast(e.message,"err");return null;}
  };
  const fixIssue=async(pid,iid,fixDescription,fixedInVersionId=null)=>{
    const fixedAt=new Date().toISOString();
    try{
      await sb.patch(cfg.url,cfg.key,T(),"issues",iid,{status:"fixed",fix_description:fixDescription,fixed_at:fixedAt,fixed_in_version_id:fixedInVersionId||null});
      mutate(pid,p=>({...p,issues:p.issues.map(i=>i.id===iid?{...i,status:"fixed",fixDescription,fixedAt,fixedInVersionId:fixedInVersionId||null}:i)}));
      showToast("Issue marked as fixed");
    }catch(e){showToast(e.message,"err");}
  };
  const deleteIssue=async(pid,iid)=>{try{await sb.del(cfg.url,cfg.key,T(),"issues",iid);mutate(pid,p=>({...p,issues:p.issues.filter(i=>i.id!==iid)}));showToast("Issue removed");}catch(e){showToast(e.message,"err");}};

  // ── Ideas ─────────────────────────────────────────────────────────────────────
  const addIdea=async(pid,content)=>{const position=projects.find(p=>p.id===pid)?.ideas?.length||0;try{const row=await sb.post(cfg.url,cfg.key,T(),"ideas",{project_id:pid,content,pinned:false,position});mutate(pid,p=>({...p,ideas:[...p.ideas,{id:row.id,content:row.content,pinned:false,position:row.position,createdAt:row.created_at}]}));showToast("Idea saved");}catch(e){showToast(e.message,"err");}};
  const updateIdea=async(pid,did,content)=>{try{await sb.patch(cfg.url,cfg.key,T(),"ideas",did,{content});mutate(pid,p=>({...p,ideas:p.ideas.map(d=>d.id===did?{...d,content}:d)}));showToast("Idea updated");}catch(e){showToast(e.message,"err");}};
  const toggleIdeaPin=async(pid,did)=>{const idea=projects.find(p=>p.id===pid)?.ideas.find(d=>d.id===did);if(!idea)return;try{await sb.patch(cfg.url,cfg.key,T(),"ideas",did,{pinned:!idea.pinned});mutate(pid,p=>({...p,ideas:p.ideas.map(d=>d.id===did?{...d,pinned:!d.pinned}:d)}));}catch(e){showToast(e.message,"err");}};
  const deleteIdea=async(pid,did)=>{try{await sb.del(cfg.url,cfg.key,T(),"ideas",did);mutate(pid,p=>({...p,ideas:p.ideas.filter(d=>d.id!==did)}));showToast("Idea removed");}catch(e){showToast(e.message,"err");}};
  const reorderIdeas=async(pid,reordered)=>{mutate(pid,p=>({...p,ideas:reordered}));try{await Promise.all(reordered.map((d,i)=>sb.patch(cfg.url,cfg.key,T(),"ideas",d.id,{position:i})));}catch{}};

  // ── Issue / Todo priority ─────────────────────────────────────────────────────
  const updateIssuePriority=async(pid,iid,priority)=>{try{await sb.patch(cfg.url,cfg.key,T(),"issues",iid,{priority});mutate(pid,p=>({...p,issues:p.issues.map(i=>i.id===iid?{...i,priority}:i)}));}catch(e){showToast(e.message,"err");}};
  const updateTodoPriority=async(pid,tid,priority)=>{try{await sb.patch(cfg.url,cfg.key,T(),"todos",tid,{priority});mutate(pid,p=>({...p,todos:p.todos.map(t=>t.id===tid?{...t,priority}:t)}));}catch(e){showToast(e.message,"err");}};

  // ── Build Logs ────────────────────────────────────────────────────────────────
  const addBuildLog=async(pid,b)=>{
    try{
      const row=await sb.post(cfg.url,cfg.key,T(),"build_logs",{project_id:pid,version_id:b.versionId||null,platform:b.platform||"android",build_number:b.buildNumber||null,build_size:b.buildSize||null,status:b.status||"building",store:b.store||null,notes:b.notes||null,built_at:b.builtAt||new Date().toISOString()});
      mutate(pid,p=>({...p,buildLogs:[{id:row.id,versionId:row.version_id,platform:row.platform,buildNumber:row.build_number,buildSize:row.build_size,status:row.status,store:row.store,notes:row.notes,builtAt:row.built_at,createdAt:row.created_at},...p.buildLogs]}));
      showToast("Build logged");
    }catch(e){showToast(e.message,"err");}
  };
  const updateBuildLog=async(pid,bid,b)=>{
    try{
      await sb.patch(cfg.url,cfg.key,T(),"build_logs",bid,{platform:b.platform||"android",build_number:b.buildNumber||null,build_size:b.buildSize||null,status:b.status||"building",store:b.store||null,notes:b.notes||null,version_id:b.versionId||null});
      mutate(pid,p=>({...p,buildLogs:p.buildLogs.map(x=>x.id===bid?{...x,platform:b.platform,buildNumber:b.buildNumber,buildSize:b.buildSize,status:b.status,store:b.store,notes:b.notes,versionId:b.versionId}:x)}));
      showToast("Build updated");
    }catch(e){showToast(e.message,"err");}
  };
  const updateBuildStatus=async(pid,bid,status)=>{try{await sb.patch(cfg.url,cfg.key,T(),"build_logs",bid,{status});mutate(pid,p=>({...p,buildLogs:p.buildLogs.map(b=>b.id===bid?{...b,status}:b)}));}catch(e){showToast(e.message,"err");}};
  const deleteBuildLog=async(pid,bid)=>{try{await sb.del(cfg.url,cfg.key,T(),"build_logs",bid);mutate(pid,p=>({...p,buildLogs:p.buildLogs.filter(b=>b.id!==bid)}));showToast("Build removed");}catch(e){showToast(e.message,"err");}};

  // ── Environments ──────────────────────────────────────────────────────────────
  const addEnvironment=async(pid,env)=>{
    const position=projects.find(p=>p.id===pid)?.environments?.length||0;
    try{
      const row=await sb.post(cfg.url,cfg.key,T(),"environments",{project_id:pid,name:env.name,url:env.url||null,color:env.color||"#8B8FA8",variables:env.variables||[],notes:env.notes||null,position});
      mutate(pid,p=>({...p,environments:[...p.environments,{id:row.id,name:row.name,url:row.url,color:row.color,variables:row.variables||[],notes:row.notes,position:row.position,createdAt:row.created_at}]}));
      showToast("Environment added");
    }catch(e){showToast(e.message,"err");}
  };
  const updateEnvironment=async(pid,eid,env)=>{
    try{await sb.patch(cfg.url,cfg.key,T(),"environments",eid,{name:env.name,url:env.url||null,color:env.color,variables:env.variables||[],notes:env.notes||null});mutate(pid,p=>({...p,environments:p.environments.map(e=>e.id===eid?{...e,...env}:e)}));showToast("Environment updated");}
    catch(e){showToast(e.message,"err");}
  };
  const deleteEnvironment=async(pid,eid)=>{try{await sb.del(cfg.url,cfg.key,T(),"environments",eid);mutate(pid,p=>({...p,environments:p.environments.filter(e=>e.id!==eid)}));showToast("Environment removed");}catch(e){showToast(e.message,"err");}};

  // ── Dependencies ──────────────────────────────────────────────────────────────
  const addDependency=async(pid,d)=>{
    try{
      const row=await sb.post(cfg.url,cfg.key,T(),"dependencies",{project_id:pid,name:d.name,current_version:d.currentVersion||null,latest_version:d.latestVersion||null,type:d.type||"npm",status:d.status||"ok",notes:d.notes||null});
      mutate(pid,p=>({...p,dependencies:[...p.dependencies,{id:row.id,name:row.name,currentVersion:row.current_version,latestVersion:row.latest_version,type:row.type,status:row.status,notes:row.notes,createdAt:row.created_at}]}));
      showToast("Dependency added");
    }catch(e){showToast(e.message,"err");}
  };
  const updateDepStatus=async(pid,did,status)=>{try{await sb.patch(cfg.url,cfg.key,T(),"dependencies",did,{status});mutate(pid,p=>({...p,dependencies:p.dependencies.map(d=>d.id===did?{...d,status}:d)}));}catch(e){showToast(e.message,"err");}};
  const deleteDependency=async(pid,did)=>{try{await sb.del(cfg.url,cfg.key,T(),"dependencies",did);mutate(pid,p=>({...p,dependencies:p.dependencies.filter(d=>d.id!==did)}));showToast("Dependency removed");}catch(e){showToast(e.message,"err");}};

  // ── Tags ──────────────────────────────────────────────────────────────────────
  const addTag=async(name,color)=>{
    try{
      const row=await sb.post(cfg.url,cfg.key,T(),"tags",{user_id:session.user.id,name,color});
      setUserTags(ts=>[...ts,{id:row.id,name:row.name,color:row.color}].sort((a,b)=>a.name.localeCompare(b.name)));
      showToast("Tag created");
      return row;
    }catch(e){showToast(e.message,"err");return null;}
  };
  // ── Checklist Templates ──────────────────────────────────────────────────────
  const saveChecklistTemplate=async(name,items)=>{
    try{
      const row=await sb.post(cfg.url,cfg.key,T(),"project_templates",{user_id:session.user.id,name,template_type:"checklist",template_data:{items},created_at:new Date().toISOString()});
      setChecklistTemplates(ct=>[...ct,{id:row.id,name:row.name,template_type:"checklist",template_data:row.template_data}]);
      showToast("Checklist template saved");
    }catch(e){showToast(e.message,"err");}
  };
  const deleteChecklistTemplate=async(id)=>{
    try{await sb.del(cfg.url,cfg.key,T(),"project_templates",id);
    setChecklistTemplates(ct=>ct.filter(t=>t.id!==id));}
    catch(e){showToast(e.message,"err");}
  };
  const applyChecklistTemplate=async(pid,templateId)=>{
    const tmpl=checklistTemplates.find(t=>t.id===templateId);
    if(!tmpl)return;
    const items=tmpl.template_data?.items||[];
    showToast(`Applying "${tmpl.name}"…`,"info");
    try{
      for(const item of items){
        const position=(projects.find(p=>p.id===pid)?.todos?.length||0);
        const row=await sb.post(cfg.url,cfg.key,T(),"todos",{project_id:pid,text:item.text,completed:false,priority:item.priority||"medium",recurring:false,position});
        mutate(pid,p=>({...p,todos:[...p.todos,{id:row.id,text:row.text,completed:false,completedAt:null,priority:row.priority||"medium",recurring:false,recurrenceType:null,sprintId:null,position:row.position,createdAt:row.created_at}]}));
      }
      showToast(`${items.length} todos added from "${tmpl.name}"`);
    }catch(e){showToast(e.message,"err");}
  };

  // ── Project Groups ────────────────────────────────────────────────────────────
  const updateGroup=async(gid,name,color)=>{
    try{
      await sb.patch(cfg.url,cfg.key,T(),"project_groups",gid,{name,color:color||null});
      setGroups(gs=>gs.map(g=>g.id===gid?{...g,name,color:color||null}:g));
      showToast("Group updated");
    }catch(e){showToast(e.message,"err");}
  };
  const addGroup=async(name,color)=>{
    const position=groups.length;
    try{const row=await sb.post(cfg.url,cfg.key,T(),"project_groups",{user_id:session.user.id,name,color:color||null,position});
    setGroups(g=>[...g,{id:row.id,name:row.name,color:row.color,position:row.position}]);showToast("Group created");}
    catch(e){showToast(e.message,"err");}
  };
  const deleteGroup=async(gid)=>{
    try{await sb.del(cfg.url,cfg.key,T(),"project_groups",gid);
    setGroups(g=>g.filter(x=>x.id!==gid));
    projects.filter(p=>p.groupId===gid).forEach(p=>sb.patch(cfg.url,cfg.key,T(),"projects",p.id,{group_id:null}).catch(()=>{}));
    setProjects(ps=>ps.map(p=>p.groupId===gid?{...p,groupId:null}:p));
    showToast("Group removed");}
    catch(e){showToast(e.message,"err");}
  };
  const assignProjectToGroup=async(pid,gid)=>{
    try{await sb.patch(cfg.url,cfg.key,T(),"projects",pid,{group_id:gid||null});
    setProjects(ps=>ps.map(p=>p.id===pid?{...p,groupId:gid||null}:p));}
    catch(e){showToast(e.message,"err");}
  };
  const setProjectDependency=async(pid,depPid,add)=>{
    const proj=projects.find(p=>p.id===pid);
    if(!proj)return;
    const current=proj.dependsOn||[];
    const updated=add?[...new Set([...current,depPid])]:current.filter(id=>id!==depPid);
    try{await sb.patch(cfg.url,cfg.key,T(),"projects",pid,{depends_on:updated});
    mutate(pid,p=>({...p,dependsOn:updated}));}
    catch(e){showToast(e.message,"err");}
  };
  const reorderGroups=async(reordered)=>{
    setGroups(reordered);
    try{await Promise.all(reordered.map((g,i)=>sb.patch(cfg.url,cfg.key,T(),"project_groups",g.id,{position:i})));}catch{}
  };

  const deleteTag=async(tid)=>{
    try{
      await sb.del(cfg.url,cfg.key,T(),"tags",tid);
      setUserTags(ts=>ts.filter(t=>t.id!==tid));
      // Remove from all projects locally
      setProjects(ps=>ps.map(p=>({...p,tagIds:(p.tagIds||[]).filter(id=>id!==tid)})));
      showToast("Tag deleted");
    }catch(e){showToast(e.message,"err");}
  };
  const assignTag=async(pid,tagId)=>{
    try{
      await sb.post(cfg.url,cfg.key,T(),"project_tags",{project_id:pid,tag_id:tagId});
      mutate(pid,p=>({...p,tagIds:[...(p.tagIds||[]),tagId]}));
    }catch(e){showToast(e.message,"err");}
  };
  const unassignTag=async(pid,tagId)=>{
    try{
      await fetch(`${cfg.url}/rest/v1/project_tags?project_id=eq.${pid}&tag_id=eq.${tagId}`,{method:"DELETE",headers:sb.h(cfg.key,T())});
      mutate(pid,p=>({...p,tagIds:(p.tagIds||[]).filter(id=>id!==tagId)}));
    }catch(e){showToast(e.message,"err");}
  };

  // ── Concepts ──────────────────────────────────────────────────────────────────
  const addConcept=async(pid,c)=>{try{const row=await sb.post(cfg.url,cfg.key,T(),"concepts",{project_id:pid,type:c.type||"text",label:c.label||null,content:c.content});mutate(pid,p=>({...p,concepts:[{id:row.id,type:row.type,label:row.label,content:row.content,createdAt:row.created_at},...p.concepts]}));showToast("Concept added");}catch(e){showToast(e.message,"err");}};
  const deleteConcept=async(pid,cid)=>{try{await sb.del(cfg.url,cfg.key,T(),"concepts",cid);mutate(pid,p=>({...p,concepts:p.concepts.filter(c=>c.id!==cid)}));showToast("Concept removed");}catch(e){showToast(e.message,"err");}};
  const uploadConceptFile=async(pid,file,label,type)=>{try{showToast("Uploading…","info");const url=await sb.uploadFile(cfg.url,cfg.key,T(),session.user.id,pid,file);await addConcept(pid,{type,label:label||file.name,content:url});}catch(e){showToast(e.message,"err");}};

  // ── Sprints ───────────────────────────────────────────────────────────────────
  const addSprint=async(pid,sp)=>{
    const position=projects.find(p=>p.id===pid)?.sprints?.length||0;
    try{
      const row=await sb.post(cfg.url,cfg.key,T(),"sprints",{project_id:pid,name:sp.name,goal:sp.goal||null,start_date:sp.startDate||null,end_date:sp.endDate||null,status:"active",position});
      mutate(pid,p=>({...p,sprints:[...p.sprints,{id:row.id,name:row.name,goal:row.goal,startDate:row.start_date,endDate:row.end_date,status:"active",position:row.position,createdAt:row.created_at}]}));
      showToast("Sprint created");
    }catch(e){showToast(e.message,"err");}
  };
  const updateSprintStatus=async(pid,sid,status)=>{
    try{await sb.patch(cfg.url,cfg.key,T(),"sprints",sid,{status});mutate(pid,p=>({...p,sprints:p.sprints.map(sp=>sp.id===sid?{...sp,status}:sp)}));}
    catch(e){showToast(e.message,"err");}
  };
  const deleteSprint=async(pid,sid)=>{
    try{await sb.del(cfg.url,cfg.key,T(),"sprints",sid);mutate(pid,p=>({...p,sprints:p.sprints.filter(sp=>sp.id!==sid),todos:p.todos.map(t=>t.sprintId===sid?{...t,sprintId:null}:t)}));showToast("Sprint removed");}
    catch(e){showToast(e.message,"err");}
  };
  const assignTodoToSprint=async(pid,tid,sprintId)=>{
    try{await sb.patch(cfg.url,cfg.key,T(),"todos",tid,{sprint_id:sprintId||null});mutate(pid,p=>({...p,todos:p.todos.map(t=>t.id===tid?{...t,sprintId:sprintId||null}:t)}));}
    catch(e){showToast(e.message,"err");}
  };

  // ── Time tracker ──────────────────────────────────────────────────────────────
  const startTimer=async(pid)=>{
    try{
      const row=await sb.post(cfg.url,cfg.key,T(),"time_sessions",{project_id:pid,started_at:new Date().toISOString()});
      const sess={id:row.id,startedAt:row.started_at,endedAt:null,durationSeconds:null,note:null,createdAt:row.created_at};
      mutate(pid,p=>({...p,timeSessions:[sess,...p.timeSessions]}));
      showToast("Timer started","ok");
      return sess;
    }catch(e){showToast(e.message,"err");return null;}
  };
  const stopTimer=async(pid,sessionId,note="")=>{
    const sess=projects.find(p=>p.id===pid)?.timeSessions.find(s=>s.id===sessionId);
    if(!sess)return;
    const endedAt=new Date().toISOString();
    const durationSeconds=Math.round((new Date(endedAt)-new Date(sess.startedAt))/1000);
    try{
      await sb.patch(cfg.url,cfg.key,T(),"time_sessions",sessionId,{ended_at:endedAt,duration_seconds:durationSeconds,note:note||null});
      mutate(pid,p=>({...p,timeSessions:p.timeSessions.map(s=>s.id===sessionId?{...s,endedAt,durationSeconds,note}:s)}));
      showToast(`Logged ${fmtDuration(durationSeconds)}`,"ok");
    }catch(e){showToast(e.message,"err");}
  };
  const deleteTimeSession=async(pid,sid)=>{
    try{await sb.del(cfg.url,cfg.key,T(),"time_sessions",sid);mutate(pid,p=>({...p,timeSessions:p.timeSessions.filter(s=>s.id!==sid)}));}
    catch(e){showToast(e.message,"err");}
  };

  // ── Recurring todos ───────────────────────────────────────────────────────────
  const addTodo=async(pid,text,priority="medium",recurring=false,recurrenceType=null)=>{
    const position=projects.find(p=>p.id===pid)?.todos?.length||0;
    try{
      const row=await sb.post(cfg.url,cfg.key,T(),"todos",{project_id:pid,text,completed:false,priority,recurring,recurrence_type:recurrenceType||null,position});
      mutate(pid,p=>({...p,todos:[...p.todos,{id:row.id,text:row.text,completed:false,completedAt:null,priority:row.priority||"medium",recurring:row.recurring||false,recurrenceType:row.recurrence_type||null,sprintId:null,position:row.position,createdAt:row.created_at}]}));
    }catch(e){showToast(e.message,"err");}
  };
  const toggleTodo=async(pid,tid)=>{
    const todo=projects.find(p=>p.id===pid)?.todos.find(t=>t.id===tid);if(!todo)return;
    const completed=!todo.completed;
    const completedAt=completed?new Date().toISOString():null;
    try{
      await sb.patch(cfg.url,cfg.key,T(),"todos",tid,{completed,completed_at:completedAt});
      mutate(pid,p=>({...p,todos:p.todos.map(t=>t.id===tid?{...t,completed,completedAt}:t)}));
      // For recurring todos: store nextDueAt but don't regenerate immediately
      // The background sync will create the new copy when the date arrives
      if(completed&&todo.recurring&&todo.recurrenceType){
        const nextDueAt=getNextDueDate(todo.recurrenceType);
        if(nextDueAt){
          await sb.patch(cfg.url,cfg.key,T(),"todos",tid,{next_due_at:nextDueAt});
          mutate(pid,p=>({...p,todos:p.todos.map(t=>t.id===tid?{...t,nextDueAt}:t)}));
          const rt=RECURRENCE_TYPES[todo.recurrenceType];
          showToast(`Will recur in ${rt?.days} day${rt?.days===1?"":'s'}${nextDueAt?' ('+new Date(nextDueAt).toLocaleDateString()+')':""}`, "info");
        } else {
          // per-release: regenerate immediately (no calendar date)
          const position=projects.find(p=>p.id===pid)?.todos?.length||0;
          const row=await sb.post(cfg.url,cfg.key,T(),"todos",{project_id:pid,text:todo.text,completed:false,priority:todo.priority,recurring:true,recurrence_type:todo.recurrenceType,position});
          mutate(pid,p=>({...p,todos:[...p.todos,{id:row.id,text:row.text,completed:false,completedAt:null,priority:row.priority||"medium",recurring:true,recurrenceType:row.recurrence_type,sprintId:null,position:row.position,createdAt:row.created_at}]}));
          showToast("Recurring task ready for next release","info");
        }
      }
    }catch(e){showToast(e.message,"err");}
  };

  // ── Templates ─────────────────────────────────────────────────────────────────
  const loadTemplates=async()=>{
    try{
      const rows=await sb.get(cfg.url,cfg.key,T(),"project_templates",`?user_id=eq.${session.user.id}&order=created_at.desc`);
      setChecklistTemplates((rows||[]).filter(t=>t.template_type==="checklist"));
      setTemplates(rows.map(r=>({id:r.id,name:r.name,description:r.description,templateData:r.template_data,createdAt:r.created_at})));
    }catch{}
  };
  const saveTemplate=async(pid,templateName)=>{
    const proj=projects.find(p=>p.id===pid);if(!proj)return;
    const templateData={status:proj.status,techStack:proj.techStack,gitUrl:proj.gitUrl,supabaseUrl:proj.supabaseUrl,vercelUrl:proj.vercelUrl,milestones:(proj.milestones||[]).map(m=>({title:m.title,description:m.description})),todos:(proj.todos||[]).filter(t=>!t.completed).map(t=>({text:t.text,priority:t.priority})),environments:(proj.environments||[]).map(e=>({name:e.name,color:e.color,url:"",variables:(e.variables||[]).filter(v=>!v.masked)}))};
    try{
      const row=await sb.post(cfg.url,cfg.key,T(),"project_templates",{user_id:session.user.id,name:templateName,description:proj.description,template_data:templateData});
      setTemplates(ts=>[{id:row.id,name:row.name,description:row.description,templateData:row.template_data,createdAt:row.created_at},...ts]);
      showToast("Template saved");
    }catch(e){showToast(e.message,"err");}
  };
  const deleteTemplate=async(tid)=>{try{await sb.del(cfg.url,cfg.key,T(),"project_templates",tid);setTemplates(ts=>ts.filter(t=>t.id!==tid));showToast("Template deleted");}catch(e){showToast(e.message,"err");}};
  const applyTemplate=async(pid,tid)=>{
    const tpl=templates.find(t=>t.id===tid);if(!tpl)return;
    const td=tpl.templateData||{};
    try{
      await Promise.all([
        ...(td.milestones||[]).map(m=>addMilestone(pid,m)),
        ...(td.todos||[]).map(t=>addTodo(pid,t.text,t.priority||"medium")),
        ...(td.environments||[]).map(e=>addEnvironment(pid,e)),
      ]);
      showToast("Template applied");
    }catch(e){showToast(e.message,"err");}
  };

  // ── GitHub ────────────────────────────────────────────────────────────────────
  const refreshGitHub=async(pid)=>{
    const proj=projects.find(p=>p.id===pid);if(!proj)return;
    const repo=parseGitHubRepo(proj.gitUrl);
    if(!repo){showToast("No valid GitHub URL on this project","err");return;}
    showToast("Fetching GitHub data…","info");
    try{
      const data=await fetchGitHubAPI(repo.owner,repo.repo,null);
      setGhCache(c=>({...c,[pid]:data}));
      try{
        const ex=await sb.get(cfg.url,cfg.key,T(),"github_cache",`?project_id=eq.${pid}`);
        if(ex.length){await fetch(`${cfg.url}/rest/v1/github_cache?project_id=eq.${pid}`,{method:"PATCH",headers:sb.h(cfg.key,T()),body:JSON.stringify({data,fetched_at:data.fetchedAt})});}
        else{await sb.post(cfg.url,cfg.key,T(),"github_cache",{project_id:pid,data,fetched_at:data.fetchedAt});}
      }catch{}
      if(data.error)showToast("GitHub rate limited. Add a token for higher limits.","info");
      else showToast(`Loaded ${data.commits?.length||0} commits, ${data.issues?.length||0} issues, ${data.prs?.length||0} PRs`);
    }catch(e){showToast(e.message,"err");}
  };
  const loadGitHubCache=async(pid)=>{
    if(ghCache[pid])return;
    try{const rows=await sb.get(cfg.url,cfg.key,T(),"github_cache",`?project_id=eq.${pid}`);if(rows?.[0])setGhCache(c=>({...c,[pid]:{...rows[0].data,fetchedAt:rows[0].fetched_at}}));}catch{}
  };

  // ── Public sharing ────────────────────────────────────────────────────────────
  const togglePublic=async(pid)=>{
    const proj=projects.find(p=>p.id===pid);if(!proj)return;
    const makePublic=!proj.isPublic;
    const slug=makePublic&&!proj.publicSlug?generateSlug(proj.name):proj.publicSlug;
    try{
      await sb.patch(cfg.url,cfg.key,T(),"projects",pid,{is_public:makePublic,public_slug:makePublic?slug:proj.publicSlug});
      mutate(pid,p=>({...p,isPublic:makePublic,publicSlug:slug}));
      showToast(makePublic?"Project is now public — share the link from the project header":"Project is now private");
    }catch(e){showToast(e.message,"err");}
  };
  const openProject=useCallback((proj,jumpTab=null)=>{
    const live=projRef.current.find(p=>p.id===proj.id)||proj;
    setSelProj(live);
    if(jumpTab)setProjTab(jumpTab);
    else setProjTab(t=>t||"overview");
    setView("project");
    if(isMobile)setSidebarOpen(false);
  },[isMobile]);

  const openModal=(type,defaults={})=>{setForm(defaults);setModal(type);};
  const closeModal=()=>setModal(null);

  const filtered=projects
    .filter(p=>filter==="all"||p.status===filter)
    .filter(p=>!tagFilter||(p.tagIds||[]).includes(tagFilter))
    .filter(p=>p.name.toLowerCase().includes(search.toLowerCase())||(p.description||"").toLowerCase().includes(search.toLowerCase()));

  if(screen==="loading")return<Splash msg="Loading…"/>;
  if(screen==="setup")  return<SetupScreen onSubmit={handleSetup}/>;
  if(screen==="auth")   return<AuthScreen onAuth={handleAuth} busy={busy} onReset={()=>setScreen("setup")}/>;

  const liveProj=selProj?(projects.find(p=>p.id===selProj.id)||selProj):null;

  return(
    <div style={{...s.root,paddingTop:(updateStatus==="available"||updateStatus==="downloading"||updateStatus==="ready")?44:0,transition:"padding-top .2s",boxSizing:"border-box"}}>
      <style>{css}</style>
      <style>{buildThemeCSS(theme,accentColor)}</style>
      {toast&&<Toast {...toast}/>}
      {lightbox&&<Lightbox url={lightbox.url} name={lightbox.name} onClose={()=>setLightbox(null)}/>}
      {confirmState&&<ConfirmDialog msg={confirmState.msg} onYes={()=>{confirmState.resolve(true);setConfirmState(null);}} onNo={()=>{confirmState.resolve(false);setConfirmState(null);}}/>}
      {compareModal&&selProj&&selProj.versions?.length>=2&&<VersionCompareModal versions={selProj.versions} onClose={()=>setCompareModal(false)}/>}
      {jotPad&&selProj&&<JotPad projectName={selProj.name} onSave={async(txt)=>{if(txt.trim()){await addNote(selProj.id,txt.trim());setJotText("");}setJotPad(false);}} onClose={()=>setJotPad(false)} value={jotText} onChange={setJotText}/>}
      {cmdPalette&&<CommandPalette projects={projects} onClose={()=>setCmdPalette(false)} onOpen={(proj,tab)=>{setCmdPalette(false);openProject(proj,tab);}} onNewProject={()=>{setCmdPalette(false);openModal("add-project",{status:"planning",techStack:[],tagIds:[],allProjects:projects,dependsOn:[]});}} onNewNote={()=>{if(selProj){setCmdPalette(false);openModal("add-note",{});}}} onNewTodo={()=>{if(selProj){setCmdPalette(false);openModal("add-todo",{});}}} onDashboard={()=>{setCmdPalette(false);setView("dashboard");}} onSettings={()=>{setCmdPalette(false);openModal("settings",{});}} onExportAll={()=>{setCmdPalette(false);exportAllProjectsJSON(projects);}} onTimeReport={()=>{setCmdPalette(false);exportTimeReportCSV(projects);}}/>}

      {/* Update banner — unified with progress bar */}
      {(updateStatus==="available"||updateStatus==="downloading"||updateStatus==="ready")&&(
        <div style={{position:"fixed",top:0,left:0,right:0,zIndex:9999,background:updateStatus==="ready"?"rgba(6,20,15,.97)":"rgba(8,14,30,.97)",borderBottom:`1px solid ${updateStatus==="ready"?"#4ADE80":"var(--accent)"}`,padding:"0",display:"flex",flexDirection:"column",height:32,WebkitAppRegion:"no-drag"}}>
          {/* Progress bar — animates while downloading */}
          {(updateStatus==="available"||updateStatus==="downloading")&&(
            <div style={{height:3,background:"var(--border)",width:"100%"}}>
              <div style={{height:3,background:"var(--accent)",borderRadius:0,animation:"qoder-progress 2s ease-in-out infinite",width:"60%"}}/>
            </div>
          )}
          {(updateStatus==="downloading"||updateStatus==="ready")&&(
            <div style={{position:"absolute",bottom:0,left:0,right:0,height:2,background:"var(--border)"}}>
              <div style={{height:2,background:updateStatus==="ready"?"#4ADE80":"var(--accent)",width:updateStatus==="ready"?"100%":`${downloadPct}%`,transition:"width .4s ease"}}/>
            </div>
          )}
          <div style={{padding:"0 12px",display:"flex",alignItems:"center",gap:10,height:32,position:"relative"}}>
            {updateStatus==="ready"?(
  <>
                <button className="q-btn-ghost" style={{padding:"4px 10px",fontSize:11,flexShrink:0}} onClick={()=>setUpdateStatus(null)}>Later</button>
                <button className="q-btn-primary" style={{padding:"4px 14px",fontSize:12,background:"#4ADE80",color:"#06090F",flexShrink:0}} onClick={()=>window.electronAPI?.installUpdate?.()}>Restart & Update</button>
                <span style={{color:"#4ADE80",fontFamily:"'Syne'",fontWeight:600,fontSize:12}}>✓ Ready to install</span>
              </>
            ):updateStatus==="available"?(
              <>
                <button className="q-btn-ghost" style={{padding:"4px 10px",fontSize:11,flexShrink:0}} onClick={()=>setUpdateStatus(null)}>Later</button>
                <button className="q-btn-primary" style={{padding:"4px 14px",fontSize:12,flexShrink:0}} onClick={()=>{setUpdateStatus("downloading");setDownloadPct(0);window.electronAPI?.startDownload?.();}}>Download Now</button>
                <span style={{color:"var(--accent)",fontFamily:"'Syne'",fontWeight:600,fontSize:12}}>↓ Update available</span>
              </>
            ):(
              <>
                <button className="q-btn-ghost" style={{padding:"4px 10px",fontSize:11,flexShrink:0}} onClick={()=>setUpdateStatus(null)}>Hide</button>
                <span style={{color:"var(--accent)",fontFamily:"'Syne'",fontWeight:600,fontSize:12}}>↓ Downloading… {downloadPct<10?"Starting…":downloadPct<99?`${downloadPct}%`:"Finalizing…"}</span>
              </>
            )}
          </div>
        </div>
      )}

      {isMobile&&sidebarOpen&&<div style={s.mobileOverlay} onClick={()=>setSidebarOpen(false)}/>}

      {/* Collapsed sidebar — slim expand strip */}
      {!isMobile&&sidebarCollapsed&&(
        <div style={{width:36,flexShrink:0,background:"var(--bg-side)",borderRight:"1px solid var(--border-lg)",display:"flex",flexDirection:"column",alignItems:"center",paddingTop:16,gap:12,position:"sticky",top:0,height:"100vh",zIndex:1}}>
          <div style={{fontFamily:"'Syne'",fontSize:16,fontWeight:800,color:"#00D4FF",lineHeight:1}}>Q</div>
          <button onClick={toggleSidebarCollapse} title="Expand sidebar" style={{color:"var(--txt-muted)",fontSize:18,background:"none",border:"none",cursor:"pointer",marginTop:4}}>›</button>
        </div>
      )}

      {/* Sidebar */}
      {(!sidebarCollapsed||isMobile)&&(
        <aside style={{
          ...s.sidebar,
          width: isMobile ? 240 : sidebarWidth,
          minWidth: isMobile ? 240 : sidebarWidth,
          transform: isMobile?(sidebarOpen?"translateX(0)":"translateX(-100%)"):"translateX(0)",
          transition: isMobile ? "transform .25s ease" : "none",
          position: isMobile ? "fixed" : "sticky",
          zIndex: isMobile ? 200 : 1,
        }}>
          <div style={s.logo}>
            <span style={s.logoQ}>Q</span><span style={s.logoText}>oder</span>
            <span style={s.logoBeta}>{APP_VER}</span>
            {isMobile
              ? <button style={s.closeSidebar} onClick={()=>setSidebarOpen(false)}>✕</button>
              : <button onClick={toggleSidebarCollapse} title="Collapse sidebar" style={{marginLeft:"auto",color:"var(--txt-faint)",fontSize:16,padding:"0 4px",background:"none",border:"none",cursor:"pointer",lineHeight:1}}>‹</button>
            }
          </div>
          <nav style={s.nav}>
            <NavBtn active={view==="dashboard"} onClick={()=>{setView("dashboard");if(isMobile)setSidebarOpen(false);}} icon="◈" label="Dashboard"/>
            <NavBtn active={view==="workspace"} onClick={()=>{setView("workspace");if(isMobile)setSidebarOpen(false);}} icon="✦" label="Workspace"/>
            {projects.length>0&&(()=>{
              const active=projects.filter(p=>p.status!=="archived");
              const archived=projects.filter(p=>p.status==="archived");
              const ungrouped=active.filter(p=>!p.groupId);
              const grouped=groups.map(g=>({...g,items:active.filter(p=>p.groupId===g.id)})).filter(g=>g.items.length>0||true);
              return(<>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div style={s.navSection}>Projects</div>
                  <button onClick={()=>openModal("add-group",{})} title="New group" style={{background:"none",border:"none",cursor:"pointer",color:"var(--txt-dim)",fontSize:14,padding:"14px 12px 5px",lineHeight:1}}>+⊟</button>
                </div>
                {/* Grouped projects — group headings draggable for reorder, projects draggable within group */}
                {(()=>{
                  const onGroupDragStart=(e,gi)=>{
                    dragGroupIdxRef.current=gi;
                    draggingGroupsRef.current=[...groups];
                    e.dataTransfer.setData("groupDrag","1");
                    e.dataTransfer.effectAllowed="move";
                  };
                  const onGroupDragOver=(e,gi)=>{
                    if(dragGroupIdxRef.current===null||dragGroupIdxRef.current===gi)return;
                    if(!e.dataTransfer.types.includes("groupdrag"))return;
                    e.preventDefault();e.stopPropagation();
                    // Reorder the working copy without calling setGroups on every event
                    const n=[...(draggingGroupsRef.current||groups)];
                    const[m]=n.splice(dragGroupIdxRef.current,1);
                    n.splice(gi,0,m);
                    draggingGroupsRef.current=n;
                    dragGroupIdxRef.current=gi;
                    setGroups(n); // update display optimistically
                  };
                  const onGroupDragEnd=()=>{
                    // Persist the final order to DB only on drop
                    if(draggingGroupsRef.current){
                      reorderGroups(draggingGroupsRef.current);
                    }
                    dragGroupIdxRef.current=null;
                    draggingGroupsRef.current=null;
                  };
                  return grouped.map((g,gi)=>(
                    <div key={g.id}
                      onDragOver={e=>onGroupDragOver(e,gi)}
                      onDragEnd={onGroupDragEnd}
                      style={{marginTop:gi>0?6:0,paddingTop:gi>0?6:0,borderTop:gi>0?"1px solid var(--border-lg)":"none"}}>
                      {/* Group heading — ⠿ handle is the ONLY drag source for group reorder */}
                      <div
                        onDragOver={e=>{if(e.dataTransfer.types.includes("groupdrag")){/* handled by parent */}else if(!e.dataTransfer.types.includes("projectid")&&e.dataTransfer.types[0]==="Files"){/* ignore */}else{e.preventDefault();e.currentTarget.style.background="var(--accent-dim)";e.currentTarget.style.outline="1px dashed var(--accent)";}}}
                        onDragLeave={e=>{e.currentTarget.style.background="";e.currentTarget.style.outline="";}}
                        onDrop={e=>{e.currentTarget.style.background="";e.currentTarget.style.outline="";const pid=e.dataTransfer.getData("projectId");if(pid){e.preventDefault();e.stopPropagation();assignProjectToGroup(pid,g.id);}}}
                        title="Drop a project here to assign it to this group"
                        style={{display:"flex",alignItems:"center",padding:"4px 12px 4px 6px",gap:6,
                          borderLeft:g.color?`2px solid ${g.color}60`:"2px solid var(--border)",
                          marginLeft:4,borderRadius:"0 4px 4px 0",transition:"background .1s"}}>
                        {/* Drag handle — ONLY this span is draggable for group reorder */}
                        <span draggable
                          onDragStart={e=>{e.stopPropagation();onGroupDragStart(e,gi);}}
                          style={{color:"var(--txt-dim)",fontSize:10,userSelect:"none",flexShrink:0,cursor:"grab",padding:"2px 0"}}>⠿</span>
                        {g.color&&<span style={{width:7,height:7,borderRadius:"50%",background:g.color,flexShrink:0}}/>}
                        <span onContextMenu={e=>{e.preventDefault();openModal("edit-group",{...g});}} onClick={isMobile?undefined:undefined} onPointerDown={isMobile?(()=>{const t=setTimeout(()=>openModal("edit-group",{...g}),600);return()=>clearTimeout(t);}):undefined} style={{fontSize:10,fontWeight:700,letterSpacing:"1.2px",color:g.color||"var(--txt-faint)",textTransform:"uppercase",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",opacity:g.color?0.9:1,cursor:isMobile?"pointer":"default"}} title={isMobile?"Hold to edit group":""}>{g.name}</span>
                        {isMobile?null:<button onClick={e=>{e.stopPropagation();openModal("edit-group",{...g});}} style={{background:"none",border:"none",cursor:"pointer",color:"var(--txt-dim)",fontSize:11,padding:"0 3px",lineHeight:1}} title="Edit group">✎</button>}
                        {isMobile&&gi>0&&<button onClick={e=>{e.stopPropagation();const n=[...groups];[n[gi-1],n[gi]]=[n[gi],n[gi-1]];reorderGroups(n);}} style={{background:"none",border:"none",cursor:"pointer",color:"var(--txt-dim)",fontSize:12,padding:"0 2px",lineHeight:1}} title="Move up">▲</button>}
                        {isMobile&&gi<grouped.length-1&&<button onClick={e=>{e.stopPropagation();const n=[...groups];[n[gi],n[gi+1]]=[n[gi+1],n[gi]];reorderGroups(n);}} style={{background:"none",border:"none",cursor:"pointer",color:"var(--txt-dim)",fontSize:12,padding:"0 2px",lineHeight:1}} title="Move down">▼</button>}
                        <button onClick={async e=>{e.stopPropagation();if(await qConfirm(`Delete group "${g.name}"? Projects will be ungrouped.`))deleteGroup(g.id);}} style={{background:"none",border:"none",cursor:"pointer",color:"var(--txt-dim)",fontSize:11,padding:"0 2px",lineHeight:1}} className="q-group-del">✕</button>
                      </div>
                      {/* Projects within group — use DraggableSidebarList for reordering */}
                      <DraggableSidebarList
                        items={g.items}
                        onReorder={reordered=>{
                          // Replace only the items belonging to this group, keep everything else
                          setProjects(prev=>{
                            const without=prev.filter(p=>p.groupId!==g.id);
                            return [...without,...reordered];
                          });
                          reordered.forEach((p,i)=>sb.patch(cfg.url,cfg.key,T(),"projects",p.id,{position:i}).catch(()=>{}));
                        }}>
                        {p=>{
  const today=new Date();today.setHours(0,0,0,0);
  const badge=(p.milestones||[]).filter(m=>!m.completed&&m.date&&new Date(m.date)<today).length+(p.issues||[]).filter(i=>i.status==="open"&&i.priority==="critical").length;
  return<div onDragOver={e=>{if(draggedTodo){e.preventDefault();setDragOverPid(p.id);}}} onDragLeave={()=>setDragOverPid(null)} onDrop={e=>{if(draggedTodo)handleTodoDrop(p.id);}} style={{position:"relative",borderRadius:7,outline:draggedTodo&&dragOverPid===p.id?"2px dashed var(--accent)":"2px dashed transparent",transition:"outline .1s"}}>
    <NavBtn active={selProj?.id===p.id&&view==="project"} onClick={()=>openProject(p)} icon={<span style={{color:STATUS_CONFIG[p.status]?.color,fontSize:9}}>●</span>} label={p.name} folder={p.localFolder} projectColor={p.color||null} small/>
    {badge>0&&<span style={{position:"absolute",top:4,right:6,minWidth:14,height:14,borderRadius:7,background:"#FF4466",color:"#fff",fontSize:9,fontFamily:"'JetBrains Mono'",fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 3px",pointerEvents:"none"}}>{badge>9?"9+":badge}</span>}
  </div>;}}
                      </DraggableSidebarList>
                    </div>
                  ));
                })()}
                {/* Ungrouped projects */}
                {ungrouped.length>0&&<>
                  {grouped.some(g=>g.items.length>0)&&<div onDragOver={e=>e.preventDefault()} onDrop={e=>{const pid=e.dataTransfer.getData("projectId");if(pid)assignProjectToGroup(pid,null);}} style={{...s.navSection,marginTop:4,opacity:.5}} title="Drop here to ungroup">Other</div>}
                  <DraggableSidebarList items={ungrouped} onReorder={reorderProjects}>
                    {p=>{
  const today=new Date();today.setHours(0,0,0,0);
  const overdue=(p.milestones||[]).filter(m=>!m.completed&&m.date&&new Date(m.date)<today).length;
  const critical=(p.issues||[]).filter(i=>i.status==="open"&&i.priority==="critical").length;
  const badge=overdue+critical;
  return<div onDragOver={e=>{if(draggedTodo){e.preventDefault();setDragOverPid(p.id);}}} onDragLeave={()=>setDragOverPid(null)} onDrop={()=>{if(draggedTodo)handleTodoDrop(p.id);}} style={{position:"relative",borderRadius:7,outline:draggedTodo&&dragOverPid===p.id?"2px dashed var(--accent)":"2px dashed transparent",transition:"outline .1s"}}>
    <NavBtn active={selProj?.id===p.id&&view==="project"} onClick={()=>openProject(p)} icon={<span style={{color:STATUS_CONFIG[p.status]?.color,fontSize:9}}>●</span>} label={p.name} folder={p.localFolder} projectColor={p.color||null} small/>
    {badge>0&&<span style={{position:"absolute",top:4,right:6,minWidth:14,height:14,borderRadius:7,background:"#FF4466",color:"#fff",fontSize:9,fontFamily:"'JetBrains Mono'",fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 3px",pointerEvents:"none"}}>{badge>9?"9+":badge}</span>}
  </div>;}}
                  </DraggableSidebarList>
                </>}
                {archived.length>0&&<>
                  <div style={{...s.navSection,marginTop:8,opacity:.5}}>Archived</div>
                  {archived.map(p=>(
                    <div key={p.id} style={{opacity:.45,fontStyle:"italic"}}>
                      <NavBtn active={selProj?.id===p.id&&view==="project"} onClick={()=>openProject(p)} icon={<span style={{color:"var(--txt-dim)",fontSize:9}}>▣</span>} label={p.name} folder={p.localFolder} projectColor={null} small/>
                    </div>
                  ))}
                </>}
              </>);
            })()}
          </nav>
          <div style={s.sidebarFoot}>
            <button className="q-btn-new" onClick={()=>{openModal("add-project",{status:"planning",techStack:[],tagIds:[],allProjects:projects,dependsOn:[]});if(isMobile)setSidebarOpen(false);}}>+ New Project</button>
            <div style={{marginTop:10,display:"flex",gap:8,justifyContent:"space-between",alignItems:"center"}}>
              <span style={s.userEmail}>{session.user.email}</span>
            </div>
            <div style={{display:"flex",gap:6,marginTop:8}}>
              <button className="q-icon-btn" style={{flex:1,textAlign:"center"}} title="Settings" onClick={()=>openModal("settings",{})}>⚙ Settings</button>
              <button className="q-sign-out" title="Sign out" onClick={handleSignOut}>⎋</button>
            </div>
          </div>
          {/* Drag handle — desktop only */}
          {!isMobile&&(
            <div onMouseDown={startSidebarDrag} style={{position:"absolute",top:0,right:0,width:5,height:"100%",cursor:"col-resize",background:"transparent",zIndex:10}}
              onMouseEnter={e=>e.currentTarget.style.background="rgba(0,212,255,.15)"}
              onMouseLeave={e=>e.currentTarget.style.background="transparent"}/>
          )}
        </aside>
      )}

      {/* Main */}
      <main style={s.main}>
        {isMobile&&<div style={s.mobileHeader}><button style={s.hamburger} onClick={()=>setSidebarOpen(v=>!v)}>☰</button><div style={{display:"flex",alignItems:"baseline",gap:2}}><span style={{fontFamily:"'Syne'",fontSize:18,fontWeight:800,color:"#00D4FF"}}>Q</span><span style={{fontFamily:"'Syne'",fontSize:15,fontWeight:700,color:"var(--txt)"}}>oder</span></div><div style={{display:"flex",gap:8,alignItems:"center"}}><RefreshBtn onRefresh={doRefresh}/><button className="q-btn-primary" style={{padding:"6px 12px",fontSize:12}} onClick={()=>{openModal("add-project",{status:"planning",techStack:[]});setSidebarOpen(false);}}>+</button></div></div>}

        {view==="workspace"&&<WorkspaceView
            workspace={workspace}
            onAddNote={addWorkspaceNote}
            onEditNote={editWorkspaceNote}
            onDeleteNote={deleteWorkspaceNote}
            onPinNote={pinWorkspaceNote}
            onAddIdea={addWorkspaceIdea}
            onDeleteIdea={deleteWorkspaceIdea}
            onPinIdea={pinWorkspaceIdea}
            onAddSnippet={addWorkspaceSnippet}
            onDeleteSnippet={deleteWorkspaceSnippet}
            onPinSnippet={pinWorkspaceSnippet}
            onToast={(m,t)=>showToast(m,t)}
            isMobile={isMobile}
          />}
        {view==="dashboard"&&<Dashboard projects={(()=>{
              const groupedIds=groups.flatMap(g=>filtered.filter(p=>p.groupId===g.id).map(p=>p.id));
              const ungroupedIds=filtered.filter(p=>!p.groupId&&p.status!=="archived").map(p=>p.id);
              const archivedIds=filtered.filter(p=>p.status==="archived").map(p=>p.id);
              return [...groupedIds,...ungroupedIds,...archivedIds].map(id=>filtered.find(p=>p.id===id)).filter(Boolean);
            })()} allProjects={projects} isMobile={isMobile} search={search} setSearch={setSearch} filter={filter} setFilter={setFilter} userTags={userTags} tagFilter={tagFilter} setTagFilter={setTagFilter} onOpen={openProject} onNew={()=>openModal("add-project",{status:"planning",techStack:[],tagIds:[],allProjects:projects,dependsOn:[]})} onExportAll={()=>exportAllProjectsJSON(projects)} onCmdPalette={()=>setCmdPalette(true)} onWeeklySummary={()=>{const md=generateWeeklySummary(projects);const blob=new Blob([md],{type:"text/markdown"});const u=URL.createObjectURL(blob);const a=document.createElement("a");a.href=u;a.download=`qoder-weekly-${new Date().toISOString().slice(0,10)}.md`;a.click();URL.revokeObjectURL(u);showToast("Weekly summary downloaded");}}/>}
        {view==="project"&&liveProj&&(
          <ProjectView project={liveProj} tab={projTab} setTab={setProjTab} isMobile={isMobile} tabOrder={tabOrder}
            onAddVersion={()=>openModal("add-version",{fileLinks:[""]})}
            onEditVersion={v=>openModal("edit-version",{...v})}
            onAddMilestone={()=>openModal("add-milestone",{})}
            onToggleMilestone={mid=>toggleMilestone(liveProj.id,mid)}
            onDeleteMilestone={mid=>deleteMilestone(liveProj.id,mid)}
            onDeleteVersion={vid=>deleteVersion(liveProj.id,vid)}
            onAddNote={()=>openModal("add-note",{})}
            onEditNote={n=>openModal("edit-note",{...n})}
            onDeleteNote={nid=>deleteNote(liveProj.id,nid)}
            onReorderNotes={r=>reorderNotes(liveProj.id,r)}
            onPinNote={(nid)=>pinNote(liveProj.id,nid)}
            onAddTodo={(text,priority,recurring,recurrenceType)=>addTodo(liveProj.id,text,priority,recurring,recurrenceType)}
            onToggleTodo={tid=>toggleTodo(liveProj.id,tid)}
            onDeleteTodo={tid=>deleteTodo(liveProj.id,tid)}
            onClearDone={ids=>clearDoneTodos(liveProj.id,ids)}
            onReorderTodos={r=>reorderTodos(liveProj.id,r)}
            onAddSprint={()=>openModal("add-sprint",{})}
            onUpdateSprintStatus={(sid,st)=>updateSprintStatus(liveProj.id,sid,st)}
            onDeleteSprint={sid=>deleteSprint(liveProj.id,sid)}
            onAssignTodoToSprint={(tid,sid)=>assignTodoToSprint(liveProj.id,tid,sid)}
            onStartTimer={()=>startTimer(liveProj.id)}
            onStopTimer={(sid,note)=>stopTimer(liveProj.id,sid,note)}
            pomMode={pomMode} setPomMode={setPomMode}
            pomSecs={pomSecs} setPomSecs={setPomSecs}
            pomActive={pomActive} setPomActive={setPomActive}
            pomSession={pomSession} setPomSession={setPomSession}
            pomCycles={pomCycles} setPomCycles={setPomCycles}
            onDeleteTimeSession={sid=>deleteTimeSession(liveProj.id,sid)}
            onAddAsset={()=>openModal("add-asset",{type:"Link"})}
            onEditAsset={asset=>openModal("edit-asset",{...asset})}
            onDeleteAsset={aid=>deleteAsset(liveProj.id,aid)}
            onUploadAssetFile={(file,name,type)=>uploadAssetFile(liveProj.id,file,name,type)}
            onAddIssue={()=>openModal("add-issue",{priority:"medium",screenshotUrls:[]})}
            onFixIssue={iss=>openModal("fix-issue",{...iss,projectVersions:selProj?.versions||[]})}
            onDeleteIssue={iid=>deleteIssue(liveProj.id,iid)}
            onUpdateIssuePriority={(iid,p)=>updateIssuePriority(liveProj.id,iid,p)}
            onUploadIssueScreenshot={(iid,file)=>uploadIssueScreenshot(liveProj.id,iid,file)}
            onRemoveIssueScreenshot={(iid,url)=>removeIssueScreenshot(liveProj.id,iid,url)}
            onAddIssueComment={(iid,content)=>addIssueComment(liveProj.id,iid,content)}
            onDeleteIssueComment={(iid,cid)=>deleteIssueComment(liveProj.id,iid,cid)}
            onPublishRelease={(tag,name,body,token,draft)=>publishRelease(liveProj.id,tag,name,body,token,draft)}
            onAddBuildLog={()=>openModal("add-build",{platform:"android",status:"building",versionId:liveProj.versions?.[0]?.id||""})}
            onEditBuildLog={b=>openModal("edit-build",{...b,id:b.id})}
            onUpdateBuildStatus={(bid,st)=>updateBuildStatus(liveProj.id,bid,st)}
            onDeleteBuildLog={bid=>deleteBuildLog(liveProj.id,bid)}
            onAddEnvironment={()=>openModal("add-env",{color:"#4ADE80",variables:[]})}
            onEditEnvironment={env=>openModal("edit-env",{...env})}
            onDeleteEnvironment={eid=>deleteEnvironment(liveProj.id,eid)}
            onAddDependency={()=>openModal("add-dep",{type:"npm",status:"ok"})}
            onUpdateDepStatus={(did,st)=>updateDepStatus(liveProj.id,did,st)}
            onDeleteDependency={did=>deleteDependency(liveProj.id,did)}
            onAddIdea={()=>openModal("add-idea",{})}
            onEditIdea={idea=>openModal("edit-idea",{...idea})}
            onToggleIdeaPin={did=>toggleIdeaPin(liveProj.id,did)}
            onDeleteIdea={did=>deleteIdea(liveProj.id,did)}
            onReorderIdeas={r=>reorderIdeas(liveProj.id,r)}
            onAddConcept={()=>openModal("add-concept",{type:"text"})}
            onDeleteConcept={cid=>deleteConcept(liveProj.id,cid)}
            onUploadConceptFile={(file,label,type)=>uploadConceptFile(liveProj.id,file,label,type)}
            onLightbox={(url,name)=>setLightbox({url,name})}
            onEdit={()=>openModal("edit-project",{...liveProj,tagIds:liveProj.tagIds||[],color:liveProj.color||null})}
            onDelete={async()=>{if(await qConfirm("Delete this project? This cannot be undone."))deleteProject(liveProj.id);}}
            onArchive={async()=>{if(await qConfirm("Archive this project? A JSON export will be downloaded first."))archiveProject(liveProj.id);}}
            onUnarchive={async()=>{if(await qConfirm("Restore this project to Planning?"))unarchiveProject(liveProj.id);}}
            onDuplicate={()=>duplicateProject(liveProj.id)}
            onCloneTodos={(targetPid,ids)=>cloneTodosToProject(liveProj.id,targetPid,ids)}
            checklistTemplates={checklistTemplates}
            onApplyChecklist={(tid)=>applyChecklistTemplate(liveProj.id,tid)}
            onSaveAsTemplate={(name,items)=>saveChecklistTemplate(name,items)}
            onDeleteChecklist={(id)=>deleteChecklistTemplate(id)}
            onDragTodo={(todo)=>setDraggedTodo({todo,sourcePid:liveProj.id})}
            allProjects={projects}
            onChangelog={()=>openModal("changelog",{})}
            userTags={userTags}
            githubData={ghCache[liveProj.id]||null}
            onRefreshGitHub={()=>refreshGitHub(liveProj.id)}
            onLoadGitHubCache={()=>loadGitHubCache(liveProj.id)}
            templates={templates}
            onSaveTemplate={name=>saveTemplate(liveProj.id,name)}
            onApplyTemplate={tid=>applyTemplate(liveProj.id,tid)}
            onOpenSaveTemplate={()=>openModal("save-template",{name:`${liveProj.name} Template`})}
            onExportJSON={()=>exportProjectJSON(liveProj)}
            onExportPDF={()=>exportProjectPDF(liveProj)}
            onExportReadme={()=>downloadReadme(liveProj)}
            onExportTimeReport={()=>exportTimeReportCSV(projects)}
            onCompare={()=>setCompareModal(true)}
            onAddDailyLog={(content,mood)=>addDailyLog(liveProj.id,content,mood)}
            onEditDailyLog={(lid,content,mood)=>editDailyLog(liveProj.id,lid,content,mood)}
            onDeleteDailyLog={(lid)=>deleteDailyLog(liveProj.id,lid)}
            onAddSnippet={()=>openModal("add-snippet",{language:"javascript",tags:[]})}
            onEditSnippet={sn=>openModal("edit-snippet",{...sn})}
            onDeleteSnippet={sid=>deleteSnippet(liveProj.id,sid)}
            onSaveSnippet={(sn)=>{addSnippet(liveProj.id,sn);closeModal();}}
            onTogglePublic={()=>togglePublic(liveProj.id)}
            onCopyPublicLink={()=>{
              // In Electron, location.origin is file:// — use a placeholder or cfg URL
              const isElectron=!!window.electronAPI;
              const base=isElectron?"https://app.qoder.dev":window.location.origin+window.location.pathname.replace(/\/$/,"");
              const url=`${base}?public=${liveProj.publicSlug}`;
              navigator.clipboard.writeText(url)
                .then(()=>showToast("Public link copied","ok"))
                .catch(()=>showToast(`Share this slug: ${liveProj.publicSlug}`,"info"));
            }}/>
        )}
      </main>

      {/* Modals */}
      {modal&&<ModalWrap onClose={closeModal}>
        {modal==="add-project"  &&<ProjectForm   data={form} setData={setForm} title="New Project"  userTags={userTags} templates={templates} groups={groups} onSubmit={async d=>{const proj=await addProjectAndReturn(d);if(proj&&d.tagIds?.length)await Promise.all(d.tagIds.map(tid=>assignTag(proj.id,tid)));closeModal();}} onCancel={closeModal}/>}
        {modal==="edit-project" &&<ProjectForm   data={form} setData={setForm} title="Edit Project" userTags={userTags} templates={templates} groups={groups} onSubmit={async d=>{await updateProject(selProj.id,d);const cur=selProj.tagIds||[];const add=(d.tagIds||[]).filter(id=>!cur.includes(id));const rem=cur.filter(id=>!(d.tagIds||[]).includes(id));await Promise.all([...add.map(id=>assignTag(selProj.id,id)),...rem.map(id=>unassignTag(selProj.id,id))]);closeModal();}} onCancel={closeModal}/>}
        {modal==="changelog"    &&<ChangelogModal project={liveProj||selProj} onClose={closeModal} onPublishRelease={(tag,name,body,token,draft)=>publishRelease(liveProj?.id||selProj?.id,tag,name,body,token,draft)}/>}
        {modal==="add-version"  &&<VersionForm   data={form} setData={setForm} onSubmit={d=>{addVersion(selProj.id,d);closeModal();}}                                     onCancel={closeModal}/>}
        {modal==="edit-version" &&<VersionForm   data={form} setData={setForm} title="Edit Version" onSubmit={d=>{updateVersion(selProj.id,d.id,d);closeModal();}}            onCancel={closeModal}/>}
        {modal==="add-milestone"&&<MilestoneForm data={form} setData={setForm} onSubmit={d=>{addMilestone(selProj.id,d);closeModal();}}                                   onCancel={closeModal}/>}
        {modal==="add-note"     &&<NoteForm      data={form} setData={setForm} title="Add Note"  onSubmit={d=>{addNote(selProj.id,d.content);closeModal();}}              onCancel={closeModal}/>}
        {modal==="edit-note"    &&<NoteForm      data={form} setData={setForm} title="Edit Note" onSubmit={d=>{updateNote(selProj.id,d.id,d.content);closeModal();}}      onCancel={closeModal}/>}
        {modal==="add-asset"    &&<AssetForm     data={form} setData={setForm} onSubmit={d=>{addAsset(selProj.id,d);closeModal();}}                                       onCancel={closeModal}/>}
        {modal==="edit-asset"   &&<AssetForm     data={form} setData={setForm} title="Edit Asset" onSubmit={d=>{updateAsset(selProj.id,d.id,d);closeModal();}}                   onCancel={closeModal}/>}
        {modal==="add-issue"    &&<IssueForm     data={form} setData={setForm} onSubmit={d=>{addIssue(selProj.id,d);closeModal();}}                                       onCancel={closeModal}/>}
        {modal==="fix-issue"    &&<FixIssueModal data={form} setData={setForm} onSubmit={d=>{fixIssue(selProj.id,d.id,d.fixDescription,d.fixedInVersionId);closeModal();}}                  onCancel={closeModal}/>}
        {modal==="shortcuts"    &&<ShortcutsModal onCancel={closeModal}/>}
        {modal==="add-group"    &&<GroupForm     data={form} setData={setForm} onSubmit={d=>{addGroup(d.name,d.color);closeModal();}} onCancel={closeModal}/>}
        {modal==="edit-group"   &&<GroupForm     data={form} setData={setForm} title="Edit Group" onSubmit={d=>{updateGroup(d.id,d.name,d.color);closeModal();}} onCancel={closeModal}/>}
        {modal==="add-sprint"   &&<SprintForm    data={form} setData={setForm} onSubmit={d=>{addSprint(selProj.id,d);closeModal();}}                             onCancel={closeModal}/>}
        {modal==="add-build"    &&<BuildLogForm  data={form} setData={setForm} versions={selProj?.versions||[]} onSubmit={d=>{addBuildLog(selProj.id,d);closeModal();}}         onCancel={closeModal}/>}
        {modal==="edit-build"   &&<BuildLogForm  data={form} setData={setForm} versions={selProj?.versions||[]} title="Edit Build" onSubmit={d=>{updateBuildLog(selProj.id,d.id,d);closeModal();}} onCancel={closeModal}/>}
        {modal==="add-snippet"   &&<SnippetForm   data={form} setData={setForm} onSubmit={d=>{addSnippet(selProj.id,d);closeModal();}}                          onCancel={closeModal}/>}
        {modal==="edit-snippet"  &&<SnippetForm   data={form} setData={setForm} isEdit onSubmit={d=>{updateSnippet(selProj.id,d.id,d);closeModal();}}             onCancel={closeModal}/>}
        {modal==="add-env"      &&<EnvironmentForm data={form} setData={setForm} title="Add Environment" onSubmit={d=>{addEnvironment(selProj.id,d);closeModal();}}      onCancel={closeModal}/>}
        {modal==="edit-env"     &&<EnvironmentForm data={form} setData={setForm} title="Edit Environment" onSubmit={d=>{updateEnvironment(selProj.id,d.id,d);closeModal();}} onCancel={closeModal}/>}
        {modal==="add-dep"      &&<DependencyForm data={form} setData={setForm} onSubmit={d=>{addDependency(selProj.id,d);closeModal();}}                                  onCancel={closeModal}/>}
        {modal==="add-idea"     &&<IdeaForm      data={form} setData={setForm} title="Add Idea"  onSubmit={d=>{addIdea(selProj.id,d.content);closeModal();}}              onCancel={closeModal}/>}
        {modal==="edit-idea"    &&<IdeaForm      data={form} setData={setForm} title="Edit Idea" onSubmit={d=>{updateIdea(selProj.id,d.id,d.content);closeModal();}}      onCancel={closeModal}/>}
        {modal==="add-concept"  &&<ConceptForm   data={form} setData={setForm} cfg={cfg} session={session} projectId={selProj?.id} onSubmit={d=>{addConcept(selProj.id,d);closeModal();}} onUploadFile={(file,label,type)=>{uploadConceptFile(selProj.id,file,label,type);closeModal();}} onCancel={closeModal}/>}
        {modal==="save-template" &&<SaveTemplateModal data={form} setData={setForm} onSubmit={d=>{saveTemplate(selProj.id,d.name);closeModal();}} onCancel={closeModal}/>}
        {modal==="manage-templates"&&<ManageTemplatesModal templates={templates} onDelete={deleteTemplate} onApply={tid=>{if(selProj){applyTemplate(selProj.id,tid);}closeModal();}} onCancel={closeModal}/>}
        {modal==="settings"     &&<SettingsModal tabOrder={tabOrder} userTags={userTags} templates={templates} updateStatus={updateStatus} updateError={updateError} theme={theme} accentColor={accentColor} customStatuses={customStatuses} onCheckForUpdates={handleCheckForUpdates} onSave={order=>saveTabOrderSync(order)} onSavePreferences={prefs=>{savePreferences(prefs);closeModal();}} onAddTag={addTag} onDeleteTag={deleteTag} onOpenTemplates={()=>openModal("manage-templates",{})} onCancel={closeModal} currentProject={view==="project"?selProj:null} onSaveProjectTabOrder={(pid,order)=>saveProjectTabOrder(pid,order)}/>}
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
        <button onClick={download} style={{padding:"8px 18px",background:"#00D4FF",color:"#06090F",border:"none",borderRadius:8,fontFamily:"'Syne'",fontWeight:700,fontSize:13,cursor:"pointer"}}>Download</button>
        <button onClick={onClose} style={{padding:"8px 14px",background:"rgba(255,255,255,.08)",border:"1px solid rgba(255,255,255,.15)",borderRadius:8,color:"var(--txt)",fontFamily:"'Syne'",fontSize:13,cursor:"pointer"}}>✕ Close</button>
      </div>
      <img src={url} alt={name} onClick={e=>e.stopPropagation()} style={{maxWidth:"92vw",maxHeight:"80vh",objectFit:"contain",borderRadius:10,boxShadow:"0 16px 64px rgba(0,0,0,.8)"}}/>
      {name&&<div style={{fontFamily:"'JetBrains Mono'",fontSize:11,color:"var(--txt-muted)",marginTop:12}}>{name}</div>}
    </div>
  );
}

// ── Auth screens ──────────────────────────────────────────────────────────────
function SetupScreen({onSubmit}){
  const [url,setUrl]=useState("");const[key,setKey]=useState("");
  return(<div style={s.authWrap}><style>{css}</style><style>{buildThemeCSS("dark","#00D4FF")}</style><div style={s.authBox}>
    <div style={{textAlign:"center",marginBottom:28}}><img src="qoder-icon.png" style={{width:52,height:52,marginBottom:8}} onError={e=>e.target.style.display="none"}/><div style={{fontFamily:"'Syne'",fontSize:20,fontWeight:800,color:"#E8EAF6",marginBottom:4}}>Connect Supabase</div></div>
    <Field label="Project URL"><QInput className="q-input" value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://xxxx.supabase.co"/></Field>
    <Field label="Anon / Public Key"><QInput className="q-input" value={key} onChange={e=>setKey(e.target.value)} placeholder="eyJhbGciOiJ…" style={{fontFamily:"'JetBrains Mono'",fontSize:12}}/></Field>
    <button className="q-btn-primary" style={{width:"100%",marginTop:8}} onClick={()=>url.trim()&&key.trim()&&onSubmit(url.trim(),key.trim())}>Connect →</button>
  </div></div>);
}
function AuthScreen({onAuth,busy,onReset}){
  const [isSignUp,setIsSignUp]=useState(false);
  const [email,setEmail]=useState("");
  const [pw,setPw]=useState("");
  const [showPw,setShowPw]=useState(false);
  const [errMsg,setErrMsg]=useState("");
  const [localBusy,setLocalBusy]=useState(false);

  const doAuth=async()=>{
    setErrMsg("");
    setLocalBusy(true);
    try{
      await onAuth(email,pw,isSignUp);
    }catch(e){
      setErrMsg(e.message||"Unknown error");
    }finally{
      setLocalBusy(false);
    }
  };

  const isDisabled=busy||localBusy||!email.trim()||!pw.trim();

  return(<div style={s.authWrap}><style>{css}</style><style>{buildThemeCSS("dark","#00D4FF")}</style><div style={s.authBox}>
    <div style={{textAlign:"center",marginBottom:28}}>
      <div style={{display:"flex",justifyContent:"center",alignItems:"baseline",gap:2,marginBottom:6}}>
        <span style={{fontFamily:"'Syne'",fontSize:40,fontWeight:800,color:"#00D4FF"}}>Q</span>
        <span style={{fontFamily:"'Syne'",fontSize:30,fontWeight:700,color:"#E8EAF6",letterSpacing:"-.5px"}}>oder</span>
      </div>
      <p style={{color:"#8B8FA8",fontSize:13}}>{isSignUp?"Create your account":"Sign in to your workspace"}</p>
    </div>
    <Field label="Email">
      <QInput className="q-input" type="email" value={email} onChange={e=>{setEmail(e.target.value);setErrMsg("");}} placeholder="you@example.com" onKeyDown={e=>e.key==="Enter"&&doAuth()}/>
    </Field>
    <Field label="Password">
      <div style={{position:"relative"}}>
        <QInput className="q-input" type={showPw?"text":"password"} value={pw} onChange={e=>{setPw(e.target.value);setErrMsg("");}} placeholder="••••••••" style={{paddingRight:44}} onKeyDown={e=>e.key==="Enter"&&doAuth()}/>
        <button onClick={()=>setShowPw(v=>!v)} style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",color:"#8B8FA8",fontSize:12,background:"none",border:"none",cursor:"pointer"}}>{showPw?"hide":"show"}</button>
      </div>
    </Field>
    {errMsg&&<div style={{marginTop:8,padding:"9px 12px",background:"rgba(255,70,102,.12)",border:"1px solid rgba(255,70,102,.35)",borderRadius:8,color:"#FF4466",fontSize:13,fontFamily:"'JetBrains Mono'"}}>{errMsg}</div>}
    <button className="q-btn-primary" style={{width:"100%",marginTop:12,opacity:isDisabled?.6:1}} disabled={isDisabled} onClick={doAuth}>
      {(busy||localBusy)?"Signing in…":isSignUp?"Create Account":"Sign In →"}
    </button>
    <div style={{display:"flex",justifyContent:"space-between",marginTop:16,fontSize:13}}>
      <button onClick={()=>{setIsSignUp(v=>!v);setErrMsg("");}} style={{color:"#00D4FF",background:"none",border:"none",cursor:"pointer"}}>{isSignUp?"Already have an account?":"Create an account"}</button>
      <button onClick={onReset} style={{color:"#8B8FA8",background:"none",border:"none",cursor:"pointer",fontSize:12}}>Change project</button>
    </div>
  </div></div>);
}

// ── RefreshBtn ───────────────────────────────────────────────────────────────
function RefreshBtn({onRefresh}){
  const [spinning,setSpinning]=useState(false);
  const handle=()=>{
    if(spinning)return;
    setSpinning(true);
    Promise.resolve(onRefresh()).finally(()=>setTimeout(()=>setSpinning(false),700));
  };
  return(
    <button onClick={handle} style={{background:"none",border:"none",cursor:"pointer",color:spinning?"var(--accent-text)":"var(--txt-muted)",padding:"4px 6px",display:"flex",alignItems:"center",transition:"color .2s"}} title="Refresh">
      <span style={{display:"flex",animation:spinning?"q-spin .7s linear 1":"none",transformOrigin:"center"}}><RefreshIcon size={18}/></span>
    </button>
  );
}

// ── NavBtn ────────────────────────────────────────────────────────────────────
function NavBtn({active,onClick,icon,label,small,folder,projectColor}){
  const hasFolder=!!window.electronAPI?.openFolder&&!!folder;
  const dot=projectColor
    ?<span style={{width:8,height:8,borderRadius:"50%",background:projectColor,flexShrink:0,display:"inline-block"}}/>
    :icon;
  return(
    <div className={`q-nav${active?" q-nav-active":""}`} onClick={onClick} style={{fontSize:small?14:13,paddingLeft:small?22:14,display:"flex",alignItems:"center"}}>
      <span style={{fontSize:small?9:13,marginRight:7,display:"flex",alignItems:"center",flexShrink:0}}>{dot}</span>
      <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1,color:active?"var(--accent-text)":small?"var(--txt-sub)":"inherit",fontWeight:small?600:500}}>{label}</span>
      {hasFolder&&<button className="q-folder-btn" onClick={e=>{e.stopPropagation();window.electronAPI.openFolder(folder);}} title={folder}><FolderIcon size={13}/></button>}
    </div>
  );
}

// ── DraggableSidebarList ──────────────────────────────────────────────────────
function DraggableSidebarList({items,onReorder,children}){
  const [list,setList]=useState(items);
  const [dragIdx,setDragIdx]=useState(null);
  const dragItem=useRef(null);
  const lastSwapIdx=useRef(null);
  const workingList=useRef(null); // keep mutable copy so closures see latest
  useEffect(()=>{setList(items);workingList.current=null;},[JSON.stringify(items.map(i=>({id:i.id,m:(i.milestones||[]).map(m=>m.id+m.completed).join(),iss:(i.issues||[]).map(i=>i.id+i.status+i.priority).join()})))]);
  const onDragStart=(e,i)=>{
    const cur=workingList.current||items;
    setDragIdx(i);dragItem.current=cur[i];
    workingList.current=[...cur];
    e.dataTransfer.setData("projectId",cur[i].id);
    e.dataTransfer.effectAllowed="move";
  };
  const onDragOver=(e,i)=>{
    e.preventDefault();e.stopPropagation();
    if(!dragItem.current||lastSwapIdx.current===i)return; // skip if same slot
    const cur=workingList.current||list;
    const from=cur.findIndex(x=>x.id===dragItem.current.id);
    if(from===-1||from===i)return;
    const n=[...cur];const[m]=n.splice(from,1);n.splice(i,0,m);
    workingList.current=n;
    lastSwapIdx.current=i;
    setList(n);setDragIdx(i);
  };
  const onDrop=(e)=>{
    e.stopPropagation();
    onReorder(workingList.current||list);
    setDragIdx(null);dragItem.current=null;lastSwapIdx.current=null;workingList.current=null;
  };
  const onDragEnd=()=>{
    setDragIdx(null);dragItem.current=null;lastSwapIdx.current=null;workingList.current=null;
  };
  return<>{list.map((item,i)=>(
    <div key={item.id} draggable onDragStart={e=>onDragStart(e,i)} onDragOver={e=>onDragOver(e,i)} onDrop={onDrop} onDragEnd={onDragEnd}
      style={{opacity:dragIdx===i?.35:1,transform:dragIdx===i?"scale(0.97)":"scale(1)",transition:"opacity .1s,transform .1s",cursor:"grab"}}>
      {children(item,i)}
    </div>
  ))}</>;
}

// ── Workspace View (global scratch — not tied to any project) ─────────────────
function WorkspaceView({workspace,onAddNote,onEditNote,onDeleteNote,onPinNote,onAddIdea,onDeleteIdea,onPinIdea,onAddSnippet,onDeleteSnippet,onPinSnippet,onToast,isMobile}){
  const [tab,setTab]=useState("notes"); // notes|ideas|snippets
  const [noteText,setNoteText]=useState("");
  const [editingNote,setEditingNote]=useState(null);
  const [editText,setEditText]=useState("");
  const [ideaText,setIdeaText]=useState("");
  const [snippetTitle,setSnippetTitle]=useState("");
  const [snippetContent,setSnippetContent]=useState("");
  const [snippetLang,setSnippetLang]=useState("javascript");
  const [showSnippetForm,setShowSnippetForm]=useState(false);

  // Use same sorted language list as project snippets

  return(
    <div style={{...s.page,padding:isMobile?"16px 14px":"36px 40px"}}>
      <div style={{...s.pageHead,marginBottom:24}}>
        <div>
          <h1 style={{...s.pageTitle,fontSize:isMobile?20:27}}>Workspace</h1>
          <p style={s.pageSub}>Personal scratch pad — notes, ideas, and snippets not tied to any project</p>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{display:"flex",gap:4,marginBottom:24,borderBottom:"1px solid var(--border)",paddingBottom:0}}>
        {[{key:"notes",label:"Notes",count:workspace.notes.length},{key:"ideas",label:"Ideas",count:workspace.ideas.length},{key:"snippets",label:"Snippets",count:workspace.snippets.length}].map(t=>(
          <button key={t.key} onClick={()=>setTab(t.key)} style={{padding:"9px 18px",fontSize:13,background:"none",border:"none",borderBottom:tab===t.key?"2px solid var(--accent)":"2px solid transparent",color:tab===t.key?"var(--accent-text)":"var(--txt-muted)",cursor:"pointer",fontFamily:"'Syne'",fontWeight:500,transition:"all .15s",marginBottom:-1}}>
            {t.label}{t.count>0&&<span style={{...s.tabPill,marginLeft:6}}>{t.count}</span>}
          </button>
        ))}
      </div>

      {/* Notes */}
      {tab==="notes"&&(
        <div>
          {/* Composer */}
          <div style={{background:"var(--bg-card)",border:"1px solid var(--border-md)",borderRadius:10,padding:14,marginBottom:20}}>
            <QTextarea className="q-input" style={{minHeight:80,resize:"vertical",marginBottom:8}} value={noteText} onChange={e=>setNoteText(e.target.value)} placeholder="Jot something down…" onKeyDown={e=>{if(e.key==="Enter"&&e.ctrlKey&&noteText.trim()){onAddNote(noteText.trim());setNoteText("");}}}/>
            <div style={{display:"flex",justifyContent:"flex-end",gap:8}}>
              <span style={{...s.mono10,color:"var(--txt-faint)",alignSelf:"center"}}>Ctrl+Enter to save</span>
              <button className="q-btn-primary" style={{padding:"7px 20px"}} onClick={()=>{if(noteText.trim()){onAddNote(noteText.trim());setNoteText("");}}} disabled={!noteText.trim()}>Add Note</button>
            </div>
          </div>
          {workspace.notes.length===0&&<div style={s.empty}><p>No notes yet. Write anything — thoughts, references, reminders.</p></div>}
          {(()=>{
            const pinned=workspace.notes.filter(n=>n.pinned);
            const unpinned=workspace.notes.filter(n=>!n.pinned);
            const renderNote=(n)=>(
              <div key={n.id} style={{background:"var(--bg-card)",border:`1px solid ${n.pinned?"#FFB347":"var(--border)"}`,borderLeft:`3px solid ${n.pinned?"#FFB347":"var(--accent)"}`,borderRadius:10,padding:14}}>
                {editingNote===n.id?(
                  <>
                    <QTextarea className="q-input" style={{minHeight:70,resize:"vertical",marginBottom:8}} value={editText} onChange={e=>setEditText(e.target.value)} autoFocus/>
                    <div style={{display:"flex",gap:6,justifyContent:"flex-end"}}>
                      <button className="q-btn-ghost" style={{padding:"5px 12px",fontSize:12}} onClick={()=>setEditingNote(null)}>Cancel</button>
                      <button className="q-btn-primary" style={{padding:"5px 14px",fontSize:12}} onClick={()=>{onEditNote(n.id,editText.trim());setEditingNote(null);}}>Save</button>
                    </div>
                  </>
                ):(
                  <>
                    <div style={{lineHeight:1.75,whiteSpace:"pre-wrap",color:"var(--txt-sub)",fontSize:14,marginBottom:10}}>{n.content}</div>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <span style={{...s.mono10,color:"var(--txt-dim)"}}>{new Date(n.createdAt).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}</span>
                      <div style={{display:"flex",gap:4}}>
                        <button title={n.pinned?"Unpin":"Pin"} onClick={()=>onPinNote&&onPinNote(n.id)} style={{background:"none",border:"none",cursor:"pointer",fontSize:13,opacity:n.pinned?1:.4,padding:"2px 4px",transition:"opacity .15s"}} onMouseEnter={e=>e.currentTarget.style.opacity=1} onMouseLeave={e=>e.currentTarget.style.opacity=n.pinned?1:.4}><PinIcon size={13} active={n.pinned}/></button>
                        <button className="q-btn-ghost" style={{padding:"3px 9px",fontSize:11}} onClick={()=>{setEditingNote(n.id);setEditText(n.content);}}>Edit</button>
                        <button className="q-del" onClick={async()=>{if(await qConfirm("Delete this note?"))onDeleteNote(n.id);}}>✕</button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            );
            return(
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {pinned.length>0&&<><div style={{fontFamily:"'JetBrains Mono'",fontSize:10,color:"#FFB347",fontWeight:700,letterSpacing:1,textTransform:"uppercase"}}>📌 Pinned</div>{pinned.map(renderNote)}<div style={{height:1,background:"var(--border)",margin:"4px 0"}}/></>}
                {unpinned.map(renderNote)}
              </div>
            );
          })()}
        </div>
      )}

      {/* Ideas */}
      {tab==="ideas"&&(
        <div>
          <div style={{background:"var(--bg-card)",border:"1px solid var(--border-md)",borderRadius:10,padding:14,marginBottom:20}}>
            <QTextarea className="q-input" style={{minHeight:80,resize:"vertical",marginBottom:8}} value={ideaText} onChange={e=>setIdeaText(e.target.value)} placeholder="Capture an idea — app concept, feature, or anything worth remembering…" onKeyDown={e=>{if(e.key==="Enter"&&e.ctrlKey&&ideaText.trim()){onAddIdea(ideaText.trim());setIdeaText("");}}}/>
            <div style={{display:"flex",justifyContent:"flex-end",gap:8}}>
              <span style={{...s.mono10,color:"var(--txt-faint)",alignSelf:"center"}}>Ctrl+Enter to save</span>
              <button className="q-btn-primary" style={{padding:"7px 20px"}} onClick={()=>{if(ideaText.trim()){onAddIdea(ideaText.trim());setIdeaText("");}}} disabled={!ideaText.trim()}>Capture Idea</button>
            </div>
          </div>
          {workspace.ideas.length===0&&<div style={s.empty}><p>No ideas yet. This is your free-form idea dump — no project required.</p></div>}
          {(()=>{
            const pinnedI=workspace.ideas.filter(i=>i.pinned);
            const unpinnedI=workspace.ideas.filter(i=>!i.pinned);
            const renderIdea=(idea)=>(
              <div key={idea.id} style={{background:"var(--bg-card)",border:`1px solid ${idea.pinned?"#FFB347":"var(--border)"}`,borderLeft:`3px solid ${idea.pinned?"#FFB347":"#B47FFF"}`,borderRadius:10,padding:14,position:"relative"}}>
                <div style={{position:"absolute",top:8,right:8,display:"flex",gap:3}}>
                  <button title={idea.pinned?"Unpin":"Pin"} onClick={()=>onPinIdea&&onPinIdea(idea.id)} style={{background:"none",border:"none",cursor:"pointer",fontSize:13,opacity:idea.pinned?1:.4,padding:"2px 4px",transition:"opacity .15s"}} onMouseEnter={e=>e.currentTarget.style.opacity=1} onMouseLeave={e=>e.currentTarget.style.opacity=idea.pinned?1:.4}><PinIcon size={13} active={idea.pinned}/></button>
                  <button className="q-del" onClick={async()=>{if(await qConfirm("Delete this idea?"))onDeleteIdea(idea.id);}}>✕</button>
                </div>
                <p style={{color:"var(--txt-sub)",fontSize:13,lineHeight:1.7,whiteSpace:"pre-wrap",paddingRight:52}}>{idea.content}</p>
                <div style={{...s.mono10,color:"var(--txt-dim)",marginTop:8}}>{new Date(idea.createdAt).toLocaleDateString("en-US",{month:"short",day:"numeric"})}</div>
              </div>
            );
            return(<>
              {pinnedI.length>0&&<><div style={{fontFamily:"'JetBrains Mono'",fontSize:10,color:"#FFB347",fontWeight:700,letterSpacing:1,textTransform:"uppercase",marginBottom:8}}>📌 Pinned</div><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:10,marginBottom:12}}>{pinnedI.map(renderIdea)}</div><div style={{height:1,background:"var(--border)",marginBottom:12}}/></>}
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:10}}>{unpinnedI.map(renderIdea)}</div>
            </>);
          })()}
        </div>
      )}

      {/* Snippets */}
      {tab==="snippets"&&(
        <div>
          {!showSnippetForm&&(
            <div style={{display:"flex",justifyContent:"flex-end",marginBottom:20}}>
              <button className="q-btn-primary" onClick={()=>setShowSnippetForm(true)}>+ Add Snippet</button>
            </div>
          )}
          {showSnippetForm&&(
            <div style={{background:"var(--bg-card)",border:"1px solid var(--border-md)",borderRadius:10,padding:16,marginBottom:20}}>
              <div style={{display:"flex",gap:10,marginBottom:10,flexWrap:"wrap"}}>
                <QInput className="q-input" style={{flex:1,minWidth:200,marginTop:0}} value={snippetTitle} onChange={e=>setSnippetTitle(e.target.value)} placeholder="Snippet title…"/>
                <select className="q-input" style={{width:140,marginTop:0}} value={snippetLang} onChange={e=>setSnippetLang(e.target.value)}>
                  {SNIPPET_LANGUAGES.map(l=><option key={l} value={l}>{l}</option>)}
                </select>
              </div>
              <QTextarea className="q-input" style={{minHeight:120,resize:"vertical",fontFamily:"'JetBrains Mono'",fontSize:12,marginBottom:10}} value={snippetContent} onChange={e=>setSnippetContent(e.target.value)} placeholder="Paste your code here…"/>
              <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
                <button className="q-btn-ghost" style={{padding:"7px 14px",fontSize:12}} onClick={()=>{setShowSnippetForm(false);setSnippetTitle("");setSnippetContent("");}}>Cancel</button>
                <button className="q-btn-primary" style={{padding:"7px 18px"}} onClick={()=>{if(snippetContent.trim()){onAddSnippet(snippetTitle.trim()||"Untitled",snippetContent.trim(),snippetLang);setSnippetTitle("");setSnippetContent("");setShowSnippetForm(false);}}} disabled={!snippetContent.trim()}>Save Snippet</button>
              </div>
            </div>
          )}
          {workspace.snippets.length===0&&<div style={s.empty}><p>No snippets yet. Save reusable code, commands, or templates here.</p></div>}
          {(()=>{
            const pinnedS=workspace.snippets.filter(s=>s.pinned);
            const unpinnedS=workspace.snippets.filter(s=>!s.pinned);
            const renderSnippet=(sn)=>(
              <div key={sn.id} style={{background:"var(--bg-card)",border:`1px solid ${sn.pinned?"#FFB347":"var(--border)"}`,borderRadius:10,padding:14}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                  <div>
                    <span style={{fontFamily:"'Syne'",fontWeight:700,fontSize:15,color:"var(--txt)"}}>{sn.title}</span>
                    <span style={{marginLeft:10,fontFamily:"'JetBrains Mono'",fontSize:10,color:"var(--accent-text)",padding:"1px 6px",borderRadius:4,background:"var(--accent-dim)"}}>{sn.language}</span>
                  </div>
                  <div style={{display:"flex",gap:4,alignItems:"center"}}>
                    <button title={sn.pinned?"Unpin":"Pin"} onClick={()=>onPinSnippet&&onPinSnippet(sn.id)} style={{background:"none",border:"none",cursor:"pointer",fontSize:13,opacity:sn.pinned?1:.4,padding:"2px 4px",transition:"opacity .15s"}} onMouseEnter={e=>e.currentTarget.style.opacity=1} onMouseLeave={e=>e.currentTarget.style.opacity=sn.pinned?1:.4}><PinIcon size={13} active={sn.pinned}/></button>
                    <button className="q-btn-ghost" style={{padding:"3px 9px",fontSize:11}} onClick={()=>navigator.clipboard.writeText(sn.content).then(()=>onToast&&onToast("Copied","ok"))}>Copy</button>
                    <button className="q-del" onClick={async()=>{if(await qConfirm("Delete this snippet?"))onDeleteSnippet(sn.id);}}>✕</button>
                  </div>
                </div>
                <pre style={{fontFamily:"'JetBrains Mono'",fontSize:12,color:"var(--txt-sub)",whiteSpace:"pre-wrap",wordBreak:"break-all",background:"var(--bg)",padding:12,borderRadius:8,maxHeight:200,overflow:"auto",margin:0}}>{sn.content}</pre>
                <div style={{...s.mono10,color:"var(--txt-dim)",marginTop:8}}>{new Date(sn.createdAt).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}</div>
              </div>
            );
            return(
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                {pinnedS.length>0&&<><div style={{fontFamily:"'JetBrains Mono'",fontSize:10,color:"#FFB347",fontWeight:700,letterSpacing:1,textTransform:"uppercase",marginBottom:6}}>📌 Pinned</div>{pinnedS.map(renderSnippet)}<div style={{height:1,background:"var(--border)",margin:"8px 0"}}/></>}
                {unpinnedS.map(renderSnippet)}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}


// ── Dashboard ─────────────────────────────────────────────────────────────────
function Dashboard({projects,allProjects,isMobile,search,setSearch,filter,setFilter,userTags,tagFilter,setTagFilter,onOpen,onNew,onExportAll,onCmdPalette,onWeeklySummary}){
  const [feedPeriod,setFeedPeriod]=useState("7d");
  const [showFeed,setShowFeed]=useState(true);
  const stats={total:allProjects.length,inDev:allProjects.filter(p=>p.status==="in-dev").length,released:allProjects.filter(p=>p.status==="released").length,open:allProjects.reduce((a,p)=>a+(p.milestones?.filter(m=>!m.completed).length||0),0)};
  const contentResults=search.length>=2?searchAllContent(allProjects,search):[];
  const showContentResults=contentResults.length>0;

  // Activity feed across all projects
  const cutoffMs=TIME_PERIODS.find(p=>p.key===feedPeriod)?.ms||null;
  const allActivity=buildActivityFeed(allProjects);
  const feedItems=cutoffMs?allActivity.filter(i=>Date.now()-i.date.getTime()<=cutoffMs):allActivity;

  return(
    <div style={{...s.page,padding:isMobile?"16px 14px":"36px 40px"}}>
      <div style={{...s.pageHead,marginBottom:isMobile?16:24}}>
        <div><h1 style={{...s.pageTitle,fontSize:isMobile?20:27}}>Dashboard</h1><p style={s.pageSub}>Cloud-synced across all devices</p></div>
        <div style={{display:"flex",gap:6,flexShrink:0,flexWrap:"wrap",justifyContent:"flex-end",maxWidth:isMobile?"50%":"none"}}>
          <button className="q-btn-ghost" style={{padding:"8px 10px",fontSize:12,display:"flex",alignItems:"center",gap:isMobile?0:5}} onClick={onCmdPalette} title="Quick Search">{isMobile?<SearchIcon size={16}/>:<><SearchIcon size={13}/> Quick Search</>}</button>
          {!isMobile&&<button className="q-btn-ghost" style={{padding:"8px 12px",fontSize:12}} onClick={onExportAll}>Backup All</button>}
          {!isMobile&&<button className="q-btn-ghost" style={{padding:"8px 12px",fontSize:12}} onClick={onWeeklySummary}>Week Summary</button>}
          {!isMobile&&<button className="q-btn-primary" style={{padding:"9px 18px",fontSize:14}} onClick={onNew}>+ New Project</button>}
        </div>
      </div>

      {/* Daily Log quick-view — today's entries across all projects */}
      {(()=>{
        const today=new Date().toISOString().slice(0,10);
        const todayLogs=allProjects.flatMap(p=>(p.dailyLogs||[]).filter(d=>d.logDate===today).map(d=>({...d,projectName:p.name,projectId:p.id})));
        if(!todayLogs.length)return null;
        const moodColors={"great":"#4ADE80","good":"#00D4FF","okay":"#FFB347","tough":"#FF6B9D"};
        return(
          <div style={{marginBottom:isMobile?14:20,padding:"14px 16px",background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:12}}>
            <div style={{fontFamily:"'Syne'",fontWeight:700,fontSize:13,color:"var(--txt)",marginBottom:10}}>
              📓 Today's Log <span style={{fontFamily:"'JetBrains Mono'",fontSize:10,color:"var(--txt-faint)",fontWeight:400,marginLeft:8}}>{new Date().toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"})}</span>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {todayLogs.slice(0,5).map((d,i)=>(
                <div key={i} style={{display:"flex",gap:10,alignItems:"flex-start"}}>
                  <div style={{width:3,borderRadius:2,background:moodColors[d.mood]||"var(--accent)",alignSelf:"stretch",flexShrink:0}}/>
                  <div style={{flex:1,minWidth:0}}>
                    <span style={{fontSize:11,color:"var(--txt-muted)",fontFamily:"'Syne'",fontWeight:600}}>{d.projectName} · </span>
                    <span style={{fontSize:13,color:"var(--txt-sub)",whiteSpace:"pre-wrap"}}>{d.content.length>120?d.content.slice(0,120)+"…":d.content}</span>
                  </div>
                </div>
              ))}
              {todayLogs.length>5&&<p style={{...s.mono10,color:"var(--txt-faint)"}}>+{todayLogs.length-5} more entries today</p>}
            </div>
          </div>
        );
      })()}
      {/* Stats */}
      <div style={{display:"grid",gridTemplateColumns:isMobile?"repeat(2,1fr)":"repeat(4,1fr)",gap:isMobile?8:12,marginBottom:isMobile?14:20}}>
        {[{label:isMobile?"Total":"Total Projects",value:stats.total,color:"#00D4FF"},{label:isMobile?"In Dev":"In Development",value:stats.inDev,color:"#FFB347"},{label:"Released",value:stats.released,color:"#4ADE80"},{label:isMobile?"Open":"Open Milestones",value:stats.open,color:"#FF6B9D"}].map(st=>(
          <div key={st.label} style={s.statCard}><div style={{...s.statVal,color:st.color,fontSize:isMobile?20:26}}>{st.value}</div><div style={s.statLbl}>{st.label}</div></div>
        ))}
      </div>

      {/* Search + status filters */}
      <div style={{display:"flex",flexDirection:isMobile?"column":"row",gap:8,marginBottom:10}}>
        <QInput className="q-input" style={{maxWidth:isMobile?"100%":320,width:"100%",marginTop:0}} placeholder="Search projects & content…" value={search} onChange={e=>setSearch(e.target.value)}/>
        <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
          {["all",...Object.keys(STATUS_CONFIG)].map(k=><button key={k} className={`q-chip${filter===k?" q-chip-on":""}`} onClick={()=>setFilter(k)}>{k==="all"?"All":STATUS_CONFIG[k].label}</button>)}
        </div>
      </div>

      {/* Tag filter */}
      {userTags?.length>0&&(
        <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:14}}>
          <button className={`q-chip${!tagFilter?" q-chip-on":""}`} onClick={()=>setTagFilter(null)} style={{fontSize:11}}>All Tags</button>
          {userTags.map(t=><button key={t.id} className={`q-chip${tagFilter===t.id?" q-chip-on":""}`} onClick={()=>setTagFilter(tagFilter===t.id?null:t.id)} style={{fontSize:11,borderColor:tagFilter===t.id?t.color:undefined,color:tagFilter===t.id?t.color:undefined}}><span style={{width:7,height:7,borderRadius:"50%",background:t.color,display:"inline-block",marginRight:5}}/>{t.name}</button>)}
        </div>
      )}

      {/* Cross-project content search results */}
      {showContentResults&&(
        <div style={{marginBottom:20}}>
          <div style={{fontFamily:"'JetBrains Mono'",fontSize:10,color:"var(--txt-muted)",letterSpacing:1.2,textTransform:"uppercase",fontWeight:700,marginBottom:10}}>
            Content matches ({contentResults.length})
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:5}}>
            {contentResults.slice(0,12).map((r,i)=>{const meta=FEED_META[r.type]||FEED_META.note;return(
              <div key={i} onClick={()=>onOpen(allProjects.find(p=>p.id===r.projectId)||{},r.tab)} style={{display:"flex",gap:10,padding:"10px 14px",border:"1px solid var(--border)",borderRadius:9,cursor:"pointer",alignItems:"flex-start"}} className="q-card">
                <span style={{fontSize:11,color:meta.color,flexShrink:0,marginTop:1}}>{meta.icon}</span>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:3,flexWrap:"wrap"}}>
                    <span style={{fontFamily:"'JetBrains Mono'",fontSize:10,color:meta.color,fontWeight:700}}>{r.label.toUpperCase()}</span>
                    <span style={{fontSize:12,color:"var(--txt-muted)",fontFamily:"'Syne'",fontWeight:600}}>{r.projectName}</span>
                    {r.tab&&<span style={{fontFamily:"'JetBrains Mono'",fontSize:9,color:"var(--txt-dim)",padding:"1px 5px",border:"1px solid var(--border-md)",borderRadius:3}}>{r.tab}</span>}
                  </div>
                  <p style={{color:"var(--txt-sub)",fontSize:13,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.excerpt}</p>
                </div>
              </div>
            );})}
            {contentResults.length>12&&<p style={{...s.mono10,textAlign:"center",color:"var(--txt-faint)"}}>+{contentResults.length-12} more results — narrow your search</p>}
          </div>
        </div>
      )}

      {/* Project cards */}
      {isMobile&&<button className="q-btn-primary" style={{width:"100%",marginBottom:12}} onClick={onNew}>+ New Project</button>}
      {projects.length===0?(
        <div style={s.empty}><div style={s.emptyIcon}>⬡</div><p>{allProjects.length===0?"No projects yet.":"No projects match filters."}</p>{allProjects.length===0&&<button className="q-btn-primary" onClick={onNew}>+ New Project</button>}</div>
      ):(
        <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"repeat(auto-fill,minmax(270px,1fr))",gap:isMobile?10:13,marginBottom:32}}>
          {projects.map(p=><ProjectCard key={p.id} project={p} userTags={userTags} onClick={()=>onOpen(p)}/>)}
        </div>
      )}

      {/* Activity Feed */}
      {allProjects.length>0&&(
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <button onClick={()=>setShowFeed(v=>!v)} style={{display:"flex",alignItems:"center",gap:8,background:"none",border:"none",cursor:"pointer",color:"var(--txt)",fontFamily:"'Syne'",fontWeight:700,fontSize:15}}>
              <span style={{color:"#00D4FF"}}>{showFeed?"▾":"▸"}</span> Activity Feed
              <span style={{...s.mono10,color:"var(--txt-faint)",marginLeft:4}}>across all projects</span>
            </button>
            {showFeed&&<div style={{display:"flex",gap:4}}>
              {TIME_PERIODS.map(p=><button key={p.key} className={`q-chip${feedPeriod===p.key?" q-chip-on":""}`} style={{fontSize:11,padding:"3px 9px"}} onClick={()=>setFeedPeriod(p.key)}>{p.label}</button>)}
            </div>}
          </div>
          {showFeed&&(
            feedItems.length===0?<div style={{...s.empty,padding:"28px 0"}}><p>No activity in this period.</p></div>:(
              <div style={{display:"flex",flexDirection:"column",gap:5}}>
                {feedItems.slice(0,30).map((item,i)=>{const meta=FEED_META[item.type]||FEED_META.note;return(
                  <div key={i} onClick={()=>onOpen(allProjects.find(p=>p.id===item.projectId)||{})} style={{display:"flex",gap:12,padding:"11px 14px",border:"1px solid var(--border)",borderRadius:10,cursor:"pointer",alignItems:"flex-start"}} className="q-card">
                    <div style={{width:26,height:26,borderRadius:6,background:`${meta.color}14`,border:`1px solid ${meta.color}28`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,flexShrink:0}}>{meta.icon}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3,flexWrap:"wrap"}}>
                        <span style={{fontSize:10,fontFamily:"'JetBrains Mono'",color:meta.color,fontWeight:700}}>{meta.label.toUpperCase()}</span>
                        <span style={{fontSize:12,color:"var(--txt-muted)",fontFamily:"'Syne'",fontWeight:600}}>{item.projectName}</span>
                        {item.title&&<span style={{color:"var(--txt-sub)",fontSize:13,fontWeight:500}}>{item.title}</span>}
                      </div>
                      {item.content&&<p style={{color:"var(--txt-muted)",fontSize:12,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.content}</p>}
                    </div>
                    <span style={{...s.mono10,flexShrink:0,marginTop:3}}>{item.date.toLocaleDateString("en-US",{month:"short",day:"numeric"})}</span>
                  </div>
                );})}
                {feedItems.length>30&&<p style={{...s.mono10,textAlign:"center",color:"var(--txt-faint)",marginTop:4}}>+{feedItems.length-30} older items</p>}
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}

function ProjectCard({project,userTags,onClick}){
  const cfg=STATUS_CONFIG[project.status]||STATUS_CONFIG.planning;
  const latVer=project.versions?.[0]?.version||"—";
  const msTotal=project.milestones?.length||0;const msDone=project.milestones?.filter(m=>m.completed).length||0;
  const pct=msTotal>0?Math.round((msDone/msTotal)*100):null;
  const tags=(userTags||[]).filter(t=>(project.tagIds||[]).includes(t.id));
  const health=project.status==="archived"?null:getProjectHealth(project);
  return(
    <div className="q-card" onClick={onClick} style={project.color?{borderLeft:`3px solid ${project.color}`}:{}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
        <span style={{...s.badge,color:cfg.color,background:cfg.bg}}>{cfg.label}</span>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          {health&&health.score<80&&(
            <span title={health.issues.join(" · ")} style={{fontSize:10,fontFamily:"'JetBrains Mono'",fontWeight:700,color:health.color,padding:"1px 6px",borderRadius:4,background:`${health.color}18`,border:`1px solid ${health.color}40`,cursor:"help"}}>{health.label}</span>
          )}
          <span style={s.mono12}>{latVer}</span>
        </div>
      </div>
      <h3 style={s.cardTitle}>{project.name}</h3>
      {project.description&&<p style={s.cardDesc}>{project.description}</p>}
      {tags.length>0&&(
        <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:9}}>
          {tags.map(t=><span key={t.id} style={{fontSize:10,padding:"2px 8px",borderRadius:10,background:`${t.color}18`,border:`1px solid ${t.color}40`,color:t.color,fontFamily:"'Syne'",fontWeight:600}}>{t.name}</span>)}
        </div>
      )}
      {project.techStack?.length>0&&<div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:10}}>{project.techStack.slice(0,4).map(t=><span key={t} style={s.techChip}>{t}</span>)}{project.techStack.length>4&&<span style={s.techChip}>+{project.techStack.length-4}</span>}</div>}
      {pct!==null&&<div style={{display:"flex",alignItems:"center",gap:8}}><div style={s.bar}><div style={{...s.barFill,width:`${pct}%`}}/></div><span style={s.mono10}>{msDone}/{msTotal}</span></div>}
    </div>
  );
}

// ── Scrollable Tab Bar ────────────────────────────────────────────────────────
function ScrollableTabBar({children,isMobile}){
  const ref=useRef(null);
  const [showLeft,setShowLeft]=useState(false);
  const [showRight,setShowRight]=useState(false);

  const check=()=>{
    const el=ref.current;if(!el)return;
    setShowLeft(el.scrollLeft>4);
    setShowRight(el.scrollLeft+el.clientWidth<el.scrollWidth-4);
  };

  useEffect(()=>{
    check();
    const el=ref.current;if(!el)return;
    el.addEventListener("scroll",check,{passive:true});
    const ro=new ResizeObserver(check);ro.observe(el);
    return()=>{el.removeEventListener("scroll",check);ro.disconnect();};
  },[]);

  const scroll=dir=>{const el=ref.current;if(el)el.scrollBy({left:dir*140,behavior:"smooth"});};

  return(
    <div className="q-tab-bar-wrap">
      {showLeft&&<button className="q-tab-arrow q-tab-arrow-left" onClick={()=>scroll(-1)}>‹</button>}
      <div ref={ref} className="q-tab-bar">{children}</div>
      {showRight&&<button className="q-tab-arrow q-tab-arrow-right" onClick={()=>scroll(1)}>›</button>}
    </div>
  );
}

// ── ProjectView ───────────────────────────────────────────────────────────────
function ProjectView({project,tab,setTab,isMobile,tabOrder,userTags,githubData,onRefreshGitHub,onLoadGitHubCache,templates,onSaveTemplate,onApplyTemplate,onOpenSaveTemplate,onExportJSON,onExportPDF,onExportReadme,onTogglePublic,onCopyPublicLink,onAddVersion,onEditVersion,onAddMilestone,onToggleMilestone,onDeleteMilestone,onDeleteVersion,onAddNote,onEditNote,onDeleteNote,onReorderNotes,onPinNote,onAddTodo,onToggleTodo,onDeleteTodo,onClearDone,onReorderTodos,onAddSprint,onUpdateSprintStatus,onDeleteSprint,onAssignTodoToSprint,onStartTimer,onStopTimer,onDeleteTimeSession,pomMode,setPomMode,pomSecs,setPomSecs,pomActive,setPomActive,pomSession,setPomSession,pomCycles,setPomCycles,onAddAsset,onDeleteAsset,onUploadAssetFile,onEditAsset,onAddIssue,onFixIssue,onDeleteIssue,onUpdateIssuePriority,onUploadIssueScreenshot,onRemoveIssueScreenshot,onAddIssueComment,onDeleteIssueComment,onAddDailyLog,onEditDailyLog,onDeleteDailyLog,onAddSnippet,onEditSnippet,onDeleteSnippet,onSaveSnippet,onAddBuildLog,onEditBuildLog,onUpdateBuildStatus,onDeleteBuildLog,onAddEnvironment,onEditEnvironment,onDeleteEnvironment,onAddDependency,onUpdateDepStatus,onDeleteDependency,onAddIdea,onEditIdea,onToggleIdeaPin,onDeleteIdea,onReorderIdeas,onAddConcept,onDeleteConcept,onUploadConceptFile,onLightbox,onChangelog,onPublishRelease,onEdit,onArchive,onUnarchive,onDuplicate,onCloneTodos,onDelete,allProjects,onExportTimeReport,onCompare,checklistTemplates,onApplyChecklist,onSaveAsTemplate,onDragTodo,onDeleteChecklist}){
  const cfg=STATUS_CONFIG[project.status]||STATUS_CONFIG.planning;
  const latVer=project.versions?.[0]?.version||"—";
  const projTags=(userTags||[]).filter(t=>(project.tagIds||[]).includes(t.id));
  const [projSearch,setProjSearch]=useState("");
  const [showProjSearch,setShowProjSearch]=useState(false);
  const tabCounts={
    overview:null,
    versions:project.versions?.length||0,
    milestones:project.milestones?.length||0,
    sprints:project.sprints?.filter(sp=>sp.status==="active").length||0,
    todos:project.todos?.filter(t=>!t.completed).length||0,
    notes:project.notes?.length||0,
    assets:project.assets?.length||0,
    issues:project.issues?.filter(i=>i.status==="open").length||0,
    "build-log":project.buildLogs?.length||0,
    environments:project.environments?.length||0,
    dependencies:project.dependencies?.filter(d=>d.status!=="ok").length||0,
    snippets:project.snippets?.length||0,
    time:project.timeSessions?.length||0,
    ideas:project.ideas?.length||0,
    concepts:project.concepts?.length||0,
    github:parseGitHubRepo(project.gitUrl)?githubData?.commits?.length||0:0,
  };
  return(
    <div style={{...s.page,padding:isMobile?"14px":"36px 40px"}}>

      {/* ── Project header ── */}
      <div style={{marginBottom:isMobile?14:22}}>

        {/* Title + badge row — always full width */}
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6,flexWrap:"wrap"}}>
          <h1 style={{...s.pageTitle,fontSize:isMobile?20:27}}>{project.name}</h1>
          <span style={{...s.badge,color:cfg.color,background:cfg.bg,fontSize:11,padding:"3px 8px"}}>{cfg.label}</span>
          {project.isPublic&&<span style={{fontSize:10,padding:"2px 8px",borderRadius:4,background:"rgba(74,222,128,.1)",color:"#4ADE80",fontFamily:"'JetBrains Mono'",fontWeight:700,letterSpacing:.5}}>PUBLIC</span>}
        </div>

        {/* Description — always full width */}
        {project.description&&<p style={{...s.pageSub,marginBottom:8}}>{project.description}</p>}

        {/* Tags */}
        {projTags.length>0&&(
          <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>
            {projTags.map(t=><span key={t.id} style={{fontSize:11,padding:"3px 10px",borderRadius:12,background:`${t.color}18`,border:`1px solid ${t.color}40`,color:t.color,fontFamily:"'Syne'",fontWeight:600}}>{t.name}</span>)}
          </div>
        )}

        {/* Project links — inline row, no icons */}
        {(project.gitUrl||project.supabaseUrl||project.vercelUrl)&&(
          <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:12}}>
            {project.gitUrl&&<a href={project.gitUrl} target="_blank" rel="noreferrer" className="q-proj-link">Git</a>}
            {project.supabaseUrl&&<a href={project.supabaseUrl} target="_blank" rel="noreferrer" className="q-proj-link">Supabase</a>}
            {project.vercelUrl&&<a href={project.vercelUrl} target="_blank" rel="noreferrer" className="q-proj-link">Vercel</a>}
          </div>
        )}

        {/* Action buttons — their own full-width row, no emoji icons */}
        <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
          {/* Desktop-only extras */}
          {!isMobile&&<>
            <button className="q-btn-ghost" style={{padding:"7px 11px",fontSize:12}} onClick={onExportPDF}>PDF</button>
            <button className="q-btn-ghost" style={{padding:"7px 11px",fontSize:12}} onClick={onExportTimeReport}>Time CSV</button>
            <button className="q-btn-ghost" style={{padding:"7px 11px",fontSize:12,display:"flex",alignItems:"center",gap:4}} onClick={()=>setShowProjSearch(v=>!v)} title="Search project (Ctrl+F)"><SearchIcon size={13}/> Search</button>
            <button className="q-btn-ghost" style={{padding:"7px 11px",fontSize:12}} onClick={onDuplicate}>Duplicate</button>
            <button className="q-btn-ghost" style={{padding:"7px 11px",fontSize:12}} onClick={onExportJSON}>Export JSON</button>
            <button className="q-btn-ghost" style={{padding:"7px 11px",fontSize:12}} onClick={onExportReadme} title="Download README.md">README</button>
            <button className="q-btn-ghost" style={{padding:"7px 11px",fontSize:12,color:project.isPublic?"#4ADE80":undefined}} onClick={onTogglePublic}>{project.isPublic?"Public":"Private"}</button>
            <button className="q-btn-ghost" style={{padding:"7px 11px",fontSize:12}} onClick={onOpenSaveTemplate}>Save Template</button>
          </>}
          {/* Copy Link — shown on all screen sizes when public */}
          {project.isPublic&&project.publicSlug&&(
            <button className="q-btn-ghost" style={{padding:isMobile?"7px 11px":"7px 11px",fontSize:12,color:"#4ADE80"}} onClick={onCopyPublicLink}>Copy Link</button>
          )}
          <button className="q-btn-ghost" style={{padding:isMobile?"7px 11px":"7px 11px",fontSize:12}} onClick={onChangelog}>Changelog</button>
          <button className="q-btn-ghost" style={{padding:isMobile?"7px 11px":"7px 11px",fontSize:12}} onClick={onEdit}>Edit</button>
          {project.status!=="archived"&&<button className="q-btn-ghost" style={{padding:isMobile?"7px 11px":"7px 11px",fontSize:12,color:"var(--txt-muted)"}} onClick={onArchive}>Archive</button>}
          {project.status==="archived"&&<button className="q-btn-ghost" style={{padding:isMobile?"7px 11px":"7px 11px",fontSize:12,color:"#4ADE80",borderColor:"rgba(74,222,128,.3)"}} onClick={onUnarchive}>Restore</button>}
          <button className="q-btn-danger" style={{padding:isMobile?"7px 11px":"7px 11px",fontSize:12}} onClick={onDelete}>Delete</button>
        </div>
      </div>
      <ScrollableTabBar isMobile={isMobile}>
        {(project.tabOrderOverride||tabOrder).map(t=>(
          <button key={t.key} className={`q-tab${tab===t.key?" q-tab-on":""}`} style={{padding:isMobile?"8px 11px":"10px 18px",fontSize:isMobile?12:13}} onClick={()=>setTab(t.key)}>
            {t.label}{tabCounts[t.key]>0&&<span style={s.tabPill}>{tabCounts[t.key]}</span>}
          </button>
        ))}
      </ScrollableTabBar>
      {/* Per-project search */}
      {showProjSearch&&<div style={{marginBottom:16,padding:"10px 14px",background:"var(--bg-input)",border:"1px solid var(--accent)",borderRadius:10}}>
        <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:8}}>
          <span style={{color:"var(--accent-text)",fontFamily:"'Syne'",fontWeight:700,fontSize:13}}>🔍 Search — {project.name}</span>
          <button className="q-del" style={{marginLeft:"auto"}} onClick={()=>{setProjSearch("");setShowProjSearch(false);}}>✕</button>
        </div>
        <QInput className="q-input" autoFocus style={{marginTop:0,marginBottom:8}} placeholder="Search notes, todos, issues, snippets…" value={projSearch} onChange={e=>setProjSearch(e.target.value)}/>
        {projSearch.trim().length>=2&&(()=>{
          const q=projSearch.toLowerCase();
          const results=[];
          (project.notes||[]).forEach(n=>{if(n.content?.toLowerCase().includes(q))results.push({tab:"notes",label:"Note",icon:"📝",excerpt:n.content.slice(0,80)});});
          (project.todos||[]).forEach(t=>{if(t.text?.toLowerCase().includes(q))results.push({tab:"todos",label:"To-Do",icon:"✓",excerpt:t.text});});
          (project.issues||[]).forEach(i=>{if(i.title?.toLowerCase().includes(q))results.push({tab:"issues",label:"Issue",icon:"🐛",excerpt:i.title});});
          (project.versions||[]).forEach(v=>{if(v.version?.toLowerCase().includes(q)||v.releaseNotes?.toLowerCase().includes(q))results.push({tab:"versions",label:"Version",icon:"📦",excerpt:v.version});});
          (project.snippets||[]).forEach(s=>{if(s.title?.toLowerCase().includes(q)||s.content?.toLowerCase().includes(q))results.push({tab:"snippets",label:"Snippet",icon:"💻",excerpt:s.title});});
          (project.milestones||[]).forEach(m=>{if(m.title?.toLowerCase().includes(q))results.push({tab:"milestones",label:"Milestone",icon:"🎯",excerpt:m.title});});
          (project.ideas||[]).forEach(d=>{if(d.content?.toLowerCase().includes(q))results.push({tab:"ideas",label:"Idea",icon:"💡",excerpt:d.content.slice(0,80)});});
          if(!results.length)return(<p style={{...s.mono10,color:"var(--txt-faint)",padding:"4px 0"}}>No results in this project</p>);
          return(<div style={{display:"flex",flexDirection:"column",gap:4,maxHeight:240,overflowY:"auto"}}>{results.slice(0,20).map((r,i)=>(
            <div key={i} onClick={()=>{setTab(r.tab);setProjSearch("");setShowProjSearch(false);}} style={{display:"flex",gap:10,padding:"8px 10px",borderRadius:7,cursor:"pointer",background:"var(--bg-card)",border:"1px solid var(--border)",alignItems:"center"}} className="q-card">
              <span style={{fontSize:12,flexShrink:0}}>{r.icon}</span>
              <span style={{fontFamily:"'JetBrains Mono'",fontSize:9,color:"var(--accent-text)",textTransform:"uppercase",flexShrink:0}}>{r.label}</span>
              <span style={{fontSize:12,color:"var(--txt)",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.excerpt}</span>
              <span style={{...s.mono10,color:"var(--txt-faint)",flexShrink:0}}>{r.tab} →</span>
            </div>
          ))}</div>);
        })()}
      </div>}
      {tab==="overview"   &&<OverviewTab   project={project} latestVer={latVer}/>}
      {tab==="versions"   &&<VersionsTab   project={project} onAdd={onAddVersion} onDelete={onDeleteVersion} onEdit={onEditVersion} onChangelog={onChangelog} onCompare={onCompare}/>}
      {tab==="milestones" &&<MilestonesTab project={project} onAdd={onAddMilestone} onToggle={onToggleMilestone} onDelete={onDeleteMilestone}/>}
      {tab==="sprints"    &&<SprintsTab    project={project} onAdd={onAddSprint} onUpdateStatus={onUpdateSprintStatus} onDelete={onDeleteSprint} onAssignTodo={onAssignTodoToSprint}/>}
      {tab==="todos"      &&<TodoTab       isMobile={isMobile} project={project} onAdd={onAddTodo}      onToggle={onToggleTodo}     onDelete={onDeleteTodo}     onClearDone={onClearDone} onReorder={onReorderTodos} sprints={project.sprints||[]} onAssignSprint={onAssignTodoToSprint} allProjects={allProjects||[]} onCloneTodos={onCloneTodos} checklistTemplates={checklistTemplates||[]} onApplyChecklist={onApplyChecklist} onSaveAsTemplate={onSaveAsTemplate} onDragTodo={onDragTodo} onDeleteChecklist={onDeleteChecklist}/>}
      {tab==="snippets"   &&<SnippetsTab   project={project} onAdd={onAddSnippet} onEdit={onEditSnippet} onDelete={onDeleteSnippet}/>}
      {tab==="time"       &&<TimeTab       project={project} onStart={onStartTimer} onStop={onStopTimer} onDelete={onDeleteTimeSession} pomMode={pomMode} setPomMode={setPomMode} pomSecs={pomSecs} setPomSecs={setPomSecs} pomActive={pomActive} setPomActive={setPomActive} pomSession={pomSession} setPomSession={setPomSession} pomCycles={pomCycles} setPomCycles={setPomCycles}/>}
      {tab==="notes"      &&<NotesTab      project={project} onAdd={onAddNote}      onEdit={onEditNote}         onDelete={onDeleteNote}     onReorder={onReorderNotes} onPin={onPinNote}/>}
      {tab==="daily-log"  &&<DailyLogTab    project={project} onAdd={onAddDailyLog}  onEdit={onEditDailyLog}     onDelete={onDeleteDailyLog}/>}
      {tab==="assets"     &&<AssetsTab     project={project} onAdd={onAddAsset}     onDelete={onDeleteAsset}    onUploadFile={onUploadAssetFile} onEdit={onEditAsset} onLightbox={onLightbox}/>}
      {tab==="issues"     &&<IssuesTab     isMobile={isMobile} project={project} onAdd={onAddIssue}     onFix={onFixIssue}         onDelete={onDeleteIssue}  onUpdatePriority={onUpdateIssuePriority} onUploadScreenshot={onUploadIssueScreenshot} onRemoveScreenshot={onRemoveIssueScreenshot} onAddComment={onAddIssueComment} onDeleteComment={onDeleteIssueComment} onLightbox={onLightbox}/>}
      {tab==="build-log"  &&<BuildLogTab   project={project} onAdd={onAddBuildLog}   onEdit={onEditBuildLog} onUpdateStatus={onUpdateBuildStatus} onDelete={onDeleteBuildLog}/>}
      {tab==="environments"&&<EnvironmentsTab project={project} onAdd={onAddEnvironment} onEdit={onEditEnvironment} onDelete={onDeleteEnvironment}/>}
      {tab==="dependencies"&&<DependenciesTab project={project} onAdd={onAddDependency} onUpdateStatus={onUpdateDepStatus} onDelete={onDeleteDependency}/>}
      {tab==="ideas"      &&<IdeasTab      project={project} onAdd={onAddIdea}      onEdit={onEditIdea}        onPin={onToggleIdeaPin}    onDelete={onDeleteIdea}    onReorder={onReorderIdeas}/>}
      {tab==="concepts"   &&<ConceptsTab   project={project} onAdd={onAddConcept}   onDelete={onDeleteConcept} onUploadFile={onUploadConceptFile} onLightbox={onLightbox}/>}
      {tab==="github"     &&<GitHubTab     project={project} data={githubData}      onRefresh={onRefreshGitHub} onLoadCache={onLoadGitHubCache}/>}
    </div>
  );
}

// ── Overview Tab ──────────────────────────────────────────────────────────────
function OverviewTab({project,latestVer,allProjectsList}){
  const isMobile=useIsMobile();
  const [sortDir,setSortDir]=useState("desc");
  const [period,setPeriod]=useState("all");
  const [search,setSearch]=useState("");
  const msTotal=project.milestones?.length||0;const msDone=project.milestones?.filter(m=>m.completed).length||0;
  const pct=msTotal>0?Math.round((msDone/msTotal)*100):0;
  const rawItems=[];
  project.versions?.forEach(v=>rawItems.push({type:"version",id:v.id,date:new Date(v.date),title:v.version,content:v.releaseNotes}));
  project.milestones?.filter(m=>m.completed).forEach(m=>rawItems.push({type:"milestone",id:m.id,date:new Date(m.completedAt||m.date||m.createdAt),title:m.title,content:m.description}));
  project.todos?.filter(t=>t.completed&&t.completedAt).forEach(t=>rawItems.push({type:"todo",id:t.id,date:new Date(t.completedAt),title:t.text,content:null}));
  project.issues?.filter(i=>i.status==="fixed").forEach(i=>rawItems.push({type:"issue-fixed",id:i.id,date:new Date(i.fixedAt||i.createdAt),title:i.title,content:i.fixDescription}));
  const cutoffMs=TIME_PERIODS.find(p=>p.key===period)?.ms||null;
  const now=Date.now();
  let items=cutoffMs?rawItems.filter(i=>now-i.date.getTime()<=cutoffMs):rawItems;
  if(search.trim()){const q=search.toLowerCase();items=items.filter(i=>(i.title||"").toLowerCase().includes(q)||(i.content||"").toLowerCase().includes(q));}
  items=[...items].sort((a,b)=>sortDir==="desc"?b.date-a.date:a.date-b.date);
  return(
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      <div style={s.statsGrid}>
        {[{label:"Current Version",value:latestVer,color:"var(--accent-text)"},{label:"Total Releases",value:project.versions?.length||0,color:"var(--txt)"},{label:"Milestones",value:`${msDone}/${msTotal}`,color:"var(--txt)"},{label:"Progress",value:`${pct}%`,color:"#4ADE80"}].map(st=>(
          <div key={st.label} style={{...s.statCard,padding:isMobile?"10px 12px":"14px 16px"}}><div style={{fontFamily:"'JetBrains Mono'",fontSize:isMobile?14:20,fontWeight:700,color:st.color,lineHeight:1}}>{st.value}</div><div style={{...s.statLbl,fontSize:isMobile?9:11,marginTop:isMobile?4:6}}>{st.label}</div></div>
        ))}
      </div>
      {(project.dependsOn||[]).length>0&&(()=>{
        const deps=allProjectsList.filter(p=>(project.dependsOn||[]).includes(p.id));
        if(!deps.length)return null;
        return(
          <div style={{...s.infoCard,borderColor:"#FFB347",background:"rgba(255,179,71,.04)"}}>
            <div style={{...s.infoLbl,color:"#FFB347"}}>⛓ Depends On</div>
            <div style={{display:"flex",gap:8,marginTop:8,flexWrap:"wrap"}}>
              {deps.map(d=>(
                <span key={d.id} style={{fontSize:12,padding:"3px 10px",borderRadius:6,background:`${STATUS_CONFIG[d.status]?.color||"#888"}18`,border:`1px solid ${STATUS_CONFIG[d.status]?.color||"#888"}40`,color:STATUS_CONFIG[d.status]?.color||"var(--txt-muted)",fontFamily:"'Syne'",fontWeight:600}}>
                  {d.name} <span style={{opacity:.7,fontWeight:400}}>{STATUS_CONFIG[d.status]?.label}</span>
                </span>
              ))}
            </div>
          </div>
        );
      })()}
      {msTotal>0&&<div style={s.infoCard}><div style={s.infoLbl}>Milestone Progress</div><div style={{...s.bar,height:8,marginTop:10}}><div style={{...s.barFill,width:`${pct}%`,height:8,transition:"width .6s"}}/></div><div style={{...s.mono10,marginTop:5,color:"var(--txt-muted)"}}>{msDone} of {msTotal} complete</div></div>}
      <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
        <QInput className="q-input" style={{flex:1,minWidth:140,maxWidth:260,marginTop:0}} placeholder="Search feed…" value={search} onChange={e=>setSearch(e.target.value)}/>
        <button className="q-chip" style={{fontFamily:"'JetBrains Mono'",fontSize:11}} onClick={()=>setSortDir(d=>d==="desc"?"asc":"desc")}>{sortDir==="desc"?"↓ Newest":"↑ Oldest"}</button>
        <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>{TIME_PERIODS.map(p=><button key={p.key} className={`q-chip${period===p.key?" q-chip-on":""}`} style={{fontSize:11,padding:"3px 9px"}} onClick={()=>setPeriod(p.key)}>{p.label}</button>)}</div>
      </div>
      {items.length===0?<div style={s.empty}><p>No activity for this period.</p></div>:(
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          {items.map(item=>{const meta=FEED_META[item.type]||FEED_META.note;return(
            <div key={`${item.type}-${item.id}`} className="q-card" style={{display:"flex",gap:12,padding:"12px 14px",border:"1px solid var(--border)",borderRadius:10,alignItems:"flex-start"}}>
              <div style={{width:28,height:28,borderRadius:6,background:`${meta.color}14`,border:`1px solid ${meta.color}28`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,flexShrink:0,marginTop:1}}>{meta.icon}</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4,flexWrap:"wrap"}}>
                  <span style={{fontSize:10,fontFamily:"'JetBrains Mono'",color:meta.color,fontWeight:700,letterSpacing:.5}}>{meta.label.toUpperCase()}</span>
                  {item.title&&<span style={{color:"var(--txt)",fontWeight:600,fontSize:14}}>{item.title}</span>}
                </div>
                {item.content&&<p style={{color:"var(--txt-muted)",fontSize:13,lineHeight:1.6,whiteSpace:"pre-wrap",wordBreak:"break-word"}}>{item.content.length>200?item.content.slice(0,200)+"…":item.content}</p>}
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
function VersionsTab({project,onAdd,onDelete,onEdit,onChangelog,onCompare}){
  return(
    <div>
      <div style={s.tabBar}>
        <span style={s.mono12}>{project.versions?.length||0} releases</span>
        <div style={{display:"flex",gap:8}}>
          {project.versions?.length>0&&<button className="q-btn-ghost" style={{fontSize:12,padding:"7px 12px"}} onClick={onChangelog}>Changelog</button>}
          {(project.versions?.length||0)>=2&&<button className="q-btn-ghost" style={{fontSize:12,padding:"7px 12px"}} onClick={onCompare}>Compare</button>}
          <button className="q-btn-primary" onClick={onAdd}>+ Log Version</button>
        </div>
      </div>
      {!project.versions?.length?<div style={s.empty}><p>No versions logged yet.</p></div>:(
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {project.versions.map((v,i)=>(
            <div key={v.id} className="q-ver-card">
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                <div style={{display:"flex",alignItems:"center",gap:10}}><span style={{fontFamily:"'JetBrains Mono'",color:"#00D4FF",fontWeight:700,fontSize:16}}>{v.version}</span>{i===0&&<span style={{...s.badge,color:"#4ADE80",background:"rgba(74,222,128,0.1)",fontSize:10}}>Latest</span>}</div>
                <div style={{display:"flex",alignItems:"center",gap:8}}><span style={s.mono10}>{new Date(v.date).toLocaleDateString()}</span><button className="q-btn-ghost" style={{padding:"3px 9px",fontSize:11}} onClick={()=>onEdit&&onEdit(v)}>Edit</button><button className="q-del" onClick={async()=>{if(await qConfirm("Remove this version?"))onDelete(v.id);}}>✕</button></div>
              </div>
              {v.releaseNotes&&<p style={{color:"var(--txt-sub)",fontSize:14,lineHeight:1.65,marginBottom:10}}>{v.releaseNotes}</p>}
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
      <div style={s.tabBar}><span style={s.mono12}>{all.filter(m=>m.completed).length}/{all.length} completed</span><div style={{display:"flex",gap:8}}><button className="q-btn-ghost" style={{padding:"7px 11px",fontSize:12}} onClick={()=>exportMilestonesCSV(project)}>Export CSV</button><button className="q-btn-primary" onClick={onAdd}>+ Add Milestone</button></div></div>
      {all.length===0?<div style={s.empty}><p>No milestones yet.</p></div>:(
        <div style={{display:"flex",flexDirection:"column",gap:3}}>
          {all.map(m=>(
            <div key={m.id} className="q-ms-row" style={{opacity:m.completed?.55:1}}>
              <button className={`q-check${m.completed?" q-check-done":""}`} onClick={()=>onToggle(m.id)}>{m.completed&&"✓"}</button>
              <div style={{flex:1}}><span style={{color:"var(--txt)",fontWeight:500,textDecoration:m.completed?"line-through":"none",fontSize:14}}>{m.title}</span>{m.description&&<p style={{color:"var(--txt-muted)",fontSize:12,marginTop:2}}>{m.description}</p>}</div>
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
function TodoTab({isMobile,project,onAdd,onToggle,onDelete,onClearDone,onReorder,sprints,onAssignSprint,allProjects,onCloneTodos,checklistTemplates,onApplyChecklist,onSaveAsTemplate,onDragTodo,onDeleteChecklist}){
  const [newText,setNewText]=useState("");
  const [newPriority,setNewPriority]=useState("medium");
  const [newRecurring,setNewRecurring]=useState(false);
  const [newRecType,setNewRecType]=useState("weekly");
  const [showClone,setShowClone]=useState(false);
  const [showSaveTemplate,setShowSaveTemplate]=useState(false);
  const [templateName,setTemplateName]=useState("");
  const [cloneTarget,setCloneTarget]=useState("");
  const [cloneMode,setCloneMode]=useState("open"); // "open"|"select"
  const [cloneSelected,setCloneSelected]=useState(new Set());
  const todos=project.todos||[];
  const pending=todos.filter(t=>!t.completed).sort((a,b)=>{const o=["critical","high","medium","low"];return o.indexOf(a.priority||"medium")-o.indexOf(b.priority||"medium");});
  const done=todos.filter(t=>t.completed);
  const activeSprints=(sprints||[]).filter(sp=>sp.status==="active");
  const otherProjects=(allProjects||[]).filter(p=>p.id!==project.id&&p.status!=="archived");
  const handleAdd=()=>{const t=newText.trim();if(!t)return;onAdd(t,newPriority,newRecurring,newRecurring?newRecType:null);setNewText("");};
  const toggleCloneSelect=(id)=>setCloneSelected(prev=>{const n=new Set(prev);n.has(id)?n.delete(id):n.add(id);return n;});
  const handleClone=async()=>{
    if(!cloneTarget)return;
    const ids=cloneMode==="select"?[...cloneSelected]:[];
    await onCloneTodos(cloneTarget,ids);
    setShowClone(false);setCloneTarget("");setCloneMode("open");setCloneSelected(new Set());
  };
  return(
    <div>
      <div style={s.tabBar}>
        <span style={s.mono12}>{done.length}/{todos.length} completed</span>
        <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
          {checklistTemplates?.length>0&&<div style={{display:"flex",gap:4,alignItems:"center"}}>
            <select className="q-input" style={{width:150,marginTop:0,fontSize:11,padding:"5px 8px"}} value="" onChange={e=>{if(e.target.value)onApplyChecklist(e.target.value);}}>
              <option value="">+ Checklist…</option>
              {checklistTemplates.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            {onDeleteChecklist&&<div style={{position:"relative"}} className="q-checklist-del-wrap">
              <button className="q-btn-ghost" style={{padding:"5px 8px",fontSize:11,color:"var(--txt-muted)"}} title="Manage checklists" onClick={e=>{e.currentTarget.nextSibling.style.display=e.currentTarget.nextSibling.style.display==="block"?"none":"block";}}>⚙</button>
              <div style={{display:"none",position:"absolute",top:"100%",right:0,zIndex:200,background:"var(--bg-modal)",border:"1px solid var(--border-md)",borderRadius:8,padding:"6px 0",minWidth:180,boxShadow:"0 4px 20px rgba(0,0,0,.3)"}}>
                {checklistTemplates.map(t=>(
                  <div key={t.id} style={{display:"flex",alignItems:"center",padding:"6px 12px",gap:8}}>
                    <span style={{flex:1,fontSize:12,color:"var(--txt)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.name}</span>
                    <button onClick={async()=>{if(await qConfirm(`Delete checklist "${t.name}"?`))onDeleteChecklist(t.id);}} style={{background:"none",border:"none",cursor:"pointer",color:"#FF6B9D",fontSize:12,padding:"0 2px",flexShrink:0}}>✕</button>
                  </div>
                ))}
              </div>
            </div>}
          </div>}
          {done.length>0&&<button className="q-btn-ghost" style={{padding:"5px 10px",fontSize:11,color:"#FF6B9D"}} onClick={async()=>{if(await qConfirm(`Delete all ${done.length} completed todos?`)){if(onClearDone)onClearDone(done.map(t=>t.id));else done.forEach(t=>onDelete(t.id));}}}>Clear Done</button>}
          {pending.length>0&&<button className="q-btn-ghost" style={{padding:"5px 10px",fontSize:11}} onClick={async()=>{if(await qConfirm(`Mark all ${pending.length} open todos as complete?`))pending.forEach(t=>onToggle(t.id));}}>Complete All</button>}
          {pending.length>0&&onApplyChecklist&&<button className="q-btn-ghost" style={{padding:"5px 10px",fontSize:11}} title="Save open todos as reusable checklist" onClick={()=>{setTemplateName("");setShowSaveTemplate(true);}}>Save as Checklist</button>}
          {otherProjects.length>0&&<button className="q-btn-ghost" style={{padding:"5px 12px",fontSize:12}} onClick={()=>setShowClone(v=>!v)}>Clone to Project…</button>}
        </div>
      </div>
      {isMobile&&(done.length>0||pending.length>0||otherProjects.length>0)&&<div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:8}}>
        {done.length>0&&<button className="q-btn-ghost" style={{padding:"5px 10px",fontSize:11,color:"#FF6B9D"}} onClick={async()=>{if(await qConfirm(`Delete all ${done.length} completed todos?`)){if(onClearDone)onClearDone(done.map(t=>t.id));else done.forEach(t=>onDelete(t.id));}}}>Clear Done</button>}
        {pending.length>0&&<button className="q-btn-ghost" style={{padding:"5px 10px",fontSize:11}} onClick={async()=>{if(await qConfirm(`Mark all ${pending.length} open todos as complete?`))pending.forEach(t=>onToggle(t.id));}}>Complete All</button>}
        {pending.length>0&&onApplyChecklist&&<button className="q-btn-ghost" style={{padding:"5px 10px",fontSize:11}} onClick={()=>{setTemplateName("");setShowSaveTemplate(true);}}>Save as Checklist</button>}
        {otherProjects.length>0&&<button className="q-btn-ghost" style={{padding:"5px 10px",fontSize:11}} onClick={()=>setShowClone(v=>!v)}>Clone to Project…</button>}
      </div>}
      {showSaveTemplate&&(
        <div style={{display:"flex",gap:8,marginBottom:14,padding:"10px 14px",background:"var(--bg-input)",border:"1px solid var(--border-md)",borderRadius:8,alignItems:"center",flexWrap:"wrap"}}>
          <span style={{fontSize:13,color:"var(--accent-text)",fontFamily:"'Syne'",fontWeight:700,flexShrink:0}}>💾 Save checklist:</span>
          <QInput className="q-input" style={{flex:1,minWidth:140,marginTop:0,fontSize:13}} value={templateName} onChange={e=>setTemplateName(e.target.value)} placeholder="Template name…" autoFocus onKeyDown={e=>{if(e.key==="Enter"&&templateName.trim()){onApplyChecklist&&onSaveTemplate&&onSaveTemplate(templateName.trim(),pending);setShowSaveTemplate(false);}if(e.key==="Escape")setShowSaveTemplate(false);}}/>
          <button className="q-btn-primary" style={{padding:"7px 14px",fontSize:12,flexShrink:0}} disabled={!templateName.trim()} onClick={()=>{if(onSaveAsTemplate)onSaveAsTemplate(templateName.trim(),pending);setShowSaveTemplate(false);}}>Save</button>
          <button className="q-btn-ghost" style={{padding:"7px 10px",fontSize:12,flexShrink:0}} onClick={()=>setShowSaveTemplate(false)}>Cancel</button>
        </div>
      )}
      {showClone&&(
        <div style={{marginBottom:14,padding:"14px",background:"var(--bg-input)",border:"1px solid var(--border-md)",borderRadius:8}}>
          <div style={{display:"flex",gap:8,marginBottom:10,flexWrap:"wrap",alignItems:"center"}}>
            <select className="q-input" style={{flex:1,minWidth:160,marginTop:0,fontSize:13}} value={cloneTarget} onChange={e=>setCloneTarget(e.target.value)}>
              <option value="">Select destination project…</option>
              {otherProjects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <button className="q-btn-primary" style={{padding:"8px 16px",fontSize:12,flexShrink:0}} disabled={!cloneTarget||(cloneMode==="select"&&cloneSelected.size===0)} onClick={handleClone}>
              Clone {cloneMode==="select"?`${cloneSelected.size} selected`:"all open"}
            </button>
            <button className="q-btn-ghost" style={{padding:"8px 12px",fontSize:12,flexShrink:0}} onClick={()=>{setShowClone(false);setCloneTarget("");setCloneMode("open");setCloneSelected(new Set());}}>Cancel</button>
          </div>
          <div style={{display:"flex",gap:6,marginBottom:cloneMode==="select"?10:0}}>
            {["open","select"].map(m=><button key={m} className={`q-chip${cloneMode===m?" q-chip-on":""}`} style={{fontSize:11}} onClick={()=>{setCloneMode(m);setCloneSelected(new Set());}}>{m==="open"?"All open todos":"Pick specific todos"}</button>)}
          </div>
          {cloneMode==="select"&&(
            <div style={{display:"flex",flexDirection:"column",gap:4,maxHeight:200,overflowY:"auto"}}>
              {pending.map(t=>(
                <label key={t.id} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 8px",borderRadius:6,cursor:"pointer",background:cloneSelected.has(t.id)?"var(--accent-dim)":"transparent",transition:"background .1s"}}>
                  <input type="checkbox" checked={cloneSelected.has(t.id)} onChange={()=>toggleCloneSelect(t.id)} style={{accentColor:"var(--accent)",flexShrink:0}}/>
                  <span style={{fontSize:13,color:"var(--txt)",flex:1}}>{t.text}</span>
                  <span style={{fontSize:10,color:PRIORITY_CONFIG[t.priority||"medium"].color}}>{PRIORITY_CONFIG[t.priority||"medium"].icon}</span>
                </label>
              ))}
              {pending.length===0&&<p style={{...s.mono10,color:"var(--txt-faint)",textAlign:"center",padding:"8px 0"}}>No open todos to select</p>}
            </div>
          )}
        </div>
      )}
      <div style={{display:"flex",gap:8,marginBottom:6,flexWrap:"wrap"}}>
        <QInput className="q-input" style={{flex:1,minWidth:180,marginTop:0}} value={newText} onChange={e=>setNewText(e.target.value)} placeholder="Add a to-do…" onKeyDown={e=>e.key==="Enter"&&handleAdd()}/>
        <select className="q-input" style={{width:130,marginTop:0}} value={newPriority} onChange={e=>setNewPriority(e.target.value)}>
          {PRIORITY_KEYS.map(k=><option key={k} value={k}>{PRIORITY_CONFIG[k].icon} {PRIORITY_CONFIG[k].label}</option>)}
        </select>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16,justifyContent:"space-between"}}>
        <label style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer",fontSize:13,color:"var(--txt-muted)"}}>
          <input type="checkbox" checked={newRecurring} onChange={e=>setNewRecurring(e.target.checked)} style={{accentColor:"#00D4FF"}}/>
          Recurring
          {newRecurring&&<select className="q-input" style={{width:130,marginTop:0,fontSize:12,marginLeft:6}} value={newRecType} onChange={e=>setNewRecType(e.target.value)}>
            {Object.entries(RECURRENCE_TYPES).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
          </select>}
        </label>
        <button className="q-btn-primary" style={{flexShrink:0,padding:"7px 20px"}} onClick={handleAdd}>Add To-Do</button>
      </div>
      {todos.length===0&&<div style={s.empty}><p>No to-do items yet.</p></div>}
      {pending.length>0&&<DraggableList items={pending} onReorder={r=>onReorder([...r,...done])}>{todo=><TodoRow todo={todo} activeSprints={activeSprints} onToggle={()=>onToggle(todo.id)} onDelete={async()=>{if(await qConfirm("Remove this item?"))onDelete(todo.id);}} onAssignSprint={sid=>onAssignSprint(todo.id,sid)} onDragTodo={onDragTodo}/>}</DraggableList>}
      {done.length>0&&<><div style={{fontFamily:"'JetBrains Mono'",fontSize:10,color:"var(--txt-faint)",letterSpacing:1.2,textTransform:"uppercase",padding:"14px 0 6px",fontWeight:700}}>Completed ({done.length})</div>{done.map(todo=><TodoRow key={todo.id} todo={todo} activeSprints={activeSprints} onToggle={()=>onToggle(todo.id)} onDelete={async()=>{if(await qConfirm("Remove this item?"))onDelete(todo.id);}} onAssignSprint={sid=>onAssignSprint(todo.id,sid)}/>)}</>}
    </div>
  );
}
function TodoRow({todo,onToggle,onDelete,activeSprints,onAssignSprint,onDragTodo}){
  const pc=PRIORITY_CONFIG[todo.priority||"medium"];
  const sprint=activeSprints?.find(sp=>sp.id===todo.sprintId);
  return(
    <div className="q-ms-row" style={{opacity:todo.completed?.5:1}}>
      <span style={{color:"var(--txt-dim)",fontSize:16,cursor:"grab",userSelect:"none",flexShrink:0}} draggable onDragStart={()=>onDragTodo&&onDragTodo(todo)} onDragEnd={()=>{}}>⠿</span>
      <button className={`q-check${todo.completed?" q-check-done":""}`} onClick={onToggle}>{todo.completed&&"✓"}</button>
      <span style={{fontSize:11,flexShrink:0,marginTop:1}} title={pc.label}>{pc.icon}</span>
      <div style={{flex:1}}>
        <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
          <span style={{color:"var(--txt)",fontWeight:500,textDecoration:todo.completed?"line-through":"none",fontSize:14}}>{todo.text}</span>
          {todo.recurring&&<span style={{fontSize:10,padding:"1px 6px",borderRadius:8,background:todo.nextDueAt?"rgba(74,222,128,.08)":"rgba(0,212,255,.08)",color:todo.nextDueAt?"#4ADE80":"#00D4FF",fontFamily:"'JetBrains Mono'"}} title={todo.nextDueAt?"Next: "+new Date(todo.nextDueAt).toLocaleDateString():undefined}>{RECURRENCE_TYPES[todo.recurrenceType]?.icon||"↺"} {todo.nextDueAt?"Next: "+new Date(todo.nextDueAt).toLocaleDateString():RECURRENCE_TYPES[todo.recurrenceType]?.label||"Recurring"}</span>}
          {sprint&&<span style={{fontSize:10,padding:"1px 6px",borderRadius:8,background:"rgba(180,127,255,.1)",color:"#B47FFF",fontFamily:"'Syne'",fontWeight:600}}>{sprint.name}</span>}
        </div>
        {todo.completed&&todo.completedAt&&<p style={{fontFamily:"'JetBrains Mono'",fontSize:10,color:"#4ADE80",marginTop:3,opacity:.75}}>✓ {new Date(todo.completedAt).toLocaleDateString()} at {new Date(todo.completedAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</p>}
      </div>
      {activeSprints?.length>0&&!todo.completed&&(
        <select value={todo.sprintId||""} onChange={e=>onAssignSprint(e.target.value||null)} style={{fontFamily:"'Syne'",fontSize:11,background:"var(--bg-input)",border:"1px solid var(--border-md)",borderRadius:6,color:"var(--txt-muted)",padding:"2px 6px",cursor:"pointer"}}>
          <option value="">No Sprint</option>
          {activeSprints.map(sp=><option key={sp.id} value={sp.id}>{sp.name}</option>)}
        </select>
      )}
      <button className="q-del" onClick={onDelete}>✕</button>
    </div>
  );
}

// ── Notes Tab ─────────────────────────────────────────────────────────────────
function NotesTab({project,onAdd,onEdit,onDelete,onReorder,onPin}){
  const [search,setSearch]=useState("");
  const [mdMode,setMdMode]=useState(true);
  const notes=project.notes||[];
  const pinned=notes.filter(n=>n.pinned);
  const unpinned=notes.filter(n=>!n.pinned);
  const filtered=search.trim()?notes.filter(n=>n.content.toLowerCase().includes(search.toLowerCase())):null;
  const isSearching=!!search.trim();
  // Render function (not a component) — avoids React reconciliation crash from inner component definitions
  const renderNote=(note,draggable=false)=>(
    <div key={note.id} className="q-ver-card" style={{marginBottom:10,borderLeft:note.pinned?"2px solid #FFB347":"1px solid var(--border)",paddingLeft:14}}>
      <div style={{display:"flex",gap:10,alignItems:"flex-start",flexWrap:"wrap"}}>
        {draggable&&!isSearching&&<span style={{color:"var(--txt-dim)",fontSize:18,cursor:"grab",userSelect:"none",flexShrink:0,marginTop:2}}>⠿</span>}
        <div style={{flex:1,minWidth:"100%"}}>
          {mdMode
            ?<div style={{lineHeight:1.7}}>{renderMarkdown(note.content)}</div>
            :<p style={{color:"var(--txt-sub)",fontSize:14,lineHeight:1.75,whiteSpace:"pre-wrap"}}>{note.content}</p>
          }
        </div>
        <div style={{display:"flex",gap:4,flexShrink:0,marginLeft:"auto",flexWrap:"nowrap"}}>
          <button title={note.pinned?"Unpin":"Pin note"} onClick={()=>onPin&&onPin(note.id)} style={{background:"none",border:"none",cursor:"pointer",padding:"2px 4px",display:"flex",alignItems:"center"}}><PinIcon size={14} active={note.pinned}/></button>
          <button className="q-btn-ghost" style={{padding:"4px 10px",fontSize:12}} onClick={()=>{const blob=new Blob([note.content],{type:"text/markdown"});const u=URL.createObjectURL(blob);const a=document.createElement("a");a.href=u;a.download=`note-${new Date(note.createdAt).toISOString().slice(0,10)}.md`;a.click();URL.revokeObjectURL(u);}} title="Export as Markdown">↓ md</button>
          <button className="q-btn-ghost" style={{padding:"4px 10px",fontSize:12}} onClick={()=>onEdit(note)}>Edit</button>
          <button className="q-del" onClick={async()=>{if(await qConfirm("Delete this note?"))onDelete(note.id);}}>✕</button>
        </div>
      </div>
      <div style={{...s.mono10,marginTop:8,color:"var(--txt-dim)"}}>{new Date(note.createdAt).toLocaleDateString("en-US",{year:"numeric",month:"short",day:"numeric"})}</div>
    </div>
  );
  return(
    <div>
      <div style={s.tabBar}>
        <span style={s.mono12}>{notes.length} {notes.length===1?"note":"notes"}{isSearching?` · ${(filtered||[]).length} matching`:""}</span>
        <div style={{display:"flex",gap:8}}>
          <button className={`q-chip${mdMode?" q-chip-on":""}`} style={{fontSize:11}} onClick={()=>setMdMode(v=>!v)}>{mdMode?"Markdown On":"Plain Text"}</button>
          <button className="q-btn-primary" onClick={onAdd}>+ Add Note</button>
        </div>
      </div>
      <QInput className="q-input" style={{marginBottom:14,marginTop:0}} placeholder="Search notes…" value={search} onChange={e=>setSearch(e.target.value)}/>
      {notes.length===0&&<div style={s.empty}><p>No notes yet.</p></div>}
      {isSearching?(
        filtered.length===0
          ?<div style={s.empty}><p>No notes match "{search}"</p></div>
          :filtered.map(note=>renderNote(note))
      ):(
        <>
          {pinned.length>0&&<>
            <div style={{fontFamily:"'JetBrains Mono'",fontSize:10,color:"#FFB347",letterSpacing:1.2,textTransform:"uppercase",fontWeight:700,marginBottom:8}}>📌 Pinned</div>
            {pinned.map(note=>renderNote(note))}
            {unpinned.length>0&&<div style={{height:1,background:"var(--border)",margin:"12px 0"}}/>}
          </>}
          {unpinned.length>0&&<DraggableList items={unpinned} onReorder={r=>onReorder([...pinned,...r])}>{note=>renderNote(note,true)}</DraggableList>}
        </>
      )}
      {mdMode&&notes.length>0&&<p style={{...s.mono10,color:"var(--txt-faint)",marginTop:12,textAlign:"center"}}>Markdown on · **bold** *italic* `code` # Heading · toggle above for plain text</p>}
    </div>
  );
}

// ── Assets Tab ────────────────────────────────────────────────────────────────
function AssetCard({asset,onEdit,onDelete,onLightbox}){
  const isImg=(url)=>/\.(jpg|jpeg|png|gif|webp|svg)(\?|$)/i.test(url)||(url||"").includes("/storage/v1/object/");
  const isColor=asset.type==="Color"&&/^#[0-9a-fA-F]{3,8}$/.test(asset.url);
  const isImage=asset.type==="Image"||asset.type==="Screenshot"||asset.type==="Icon"||asset.type==="Splash Screen";
  const isAudio=asset.type==="Audio";
  const isCode=asset.type==="Code";
  return(
    <div style={{background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:10,padding:14,position:"relative"}} className="q-ver-card">
      <div style={{position:"absolute",top:8,right:8,display:"flex",gap:4}}>
        <button className="q-btn-ghost" style={{padding:"2px 8px",fontSize:11}} onClick={()=>onEdit&&onEdit(asset)}>Edit</button>
        <button className="q-del" onClick={async()=>{if(await qConfirm("Remove this asset?"))onDelete(asset.id);}}>✕</button>
      </div>
      <div style={{fontSize:11,color:"var(--txt-muted)",marginBottom:8,paddingRight:60,fontWeight:600}}>{asset.name}</div>
      {isColor&&<><div style={{width:"100%",height:72,borderRadius:6,background:asset.url,marginBottom:8,boxShadow:"inset 0 0 0 1px rgba(255,255,255,.08)"}}/><div style={{fontFamily:"'JetBrains Mono'",fontSize:12,color:"var(--txt)"}}>{asset.url}</div></>}
      {isImg(asset.url)&&!isColor&&<img src={asset.url} alt={asset.name} onClick={()=>onLightbox(asset.url,asset.name)} style={{width:"100%",borderRadius:6,objectFit:"cover",maxHeight:160,display:"block",cursor:"pointer",marginBottom:6}} onError={e=>e.target.style.display="none"}/>}
      {isAudio&&<audio src={asset.url} controls style={{width:"100%",marginTop:4}}/>}
      {isCode&&<pre style={{fontFamily:"'JetBrains Mono'",fontSize:11,color:"var(--txt-sub)",whiteSpace:"pre-wrap",wordBreak:"break-all",background:"var(--bg)",padding:10,borderRadius:6,maxHeight:120,overflow:"auto",margin:0}}>{asset.url}</pre>}
      {!isColor&&!isAudio&&!isCode&&<a href={asset.url} target="_blank" rel="noreferrer" style={{...s.fileLink,display:"block",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginTop:isImg(asset.url)?4:0}}>↗ {asset.url.length>50?asset.url.slice(0,50)+"…":asset.url}</a>}
    </div>
  );
}
function AssetsTab({project,onAdd,onDelete,onUploadFile,onEdit,onLightbox}){
  const assets=project.assets||[];
  const fileInput=useRef(null);
  const byType=ASSET_TYPES.reduce((acc,type)=>{const items=assets.filter(a=>a.type===type);if(items.length)acc[type]=items;return acc;},{});
  const handleFilePick=e=>{const file=e.target.files?.[0];if(file){const type=file.type.startsWith("image/")?"Image":file.type.startsWith("audio/")?"Audio":"Document";onUploadFile(file,file.name,type);}e.target.value="";};
  return(
    <div>
      <div style={s.tabBar}>
        <span style={s.mono12}>{assets.length} {assets.length===1?"asset":"assets"}</span>
        <div style={{display:"flex",gap:8}}>
          <button className="q-btn-ghost" style={{fontSize:12,padding:"7px 12px"}} onClick={()=>fileInput.current?.click()}>Upload File</button>
          <button className="q-btn-primary" onClick={onAdd}>+ Add Asset</button>
        </div>
      </div>
      <input ref={fileInput} type="file" accept="image/*,audio/*" style={{display:"none"}} onChange={handleFilePick}/>
      {assets.length===0?<div style={s.empty}><p>No assets yet. Add links, images, colors, code snippets…</p></div>:(
        <div style={{display:"flex",flexDirection:"column",gap:24}}>
          {Object.entries(byType).map(([type,items])=>(
            <div key={type}>
              <div style={{fontFamily:"'JetBrains Mono'",fontSize:10,color:"var(--txt-muted)",letterSpacing:1.2,textTransform:"uppercase",fontWeight:700,marginBottom:10}}>{ASSET_ICONS[type]||"📎"} {type}</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:10}}>
                {items.map(asset=><AssetCard key={asset.id} asset={asset} onEdit={onEdit} onDelete={onDelete} onLightbox={onLightbox}/>)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Issues Tab ────────────────────────────────────────────────────────────────
function IssuesTab({isMobile,project,onAdd,onFix,onDelete,onUpdatePriority,onUploadScreenshot,onRemoveScreenshot,onAddComment,onDeleteComment,onLightbox,onLinkVersion}){
  const [viewMode,setViewMode]=useState("list"); // "list"|"kanban"
  const issues=project.issues||[];
  const open=issues.filter(i=>i.status==="open").sort((a,b)=>{const o=["critical","high","medium","low"];return o.indexOf(a.priority)-o.indexOf(b.priority);});
  const fixed=issues.filter(i=>i.status==="fixed");
  const fileRefs=useRef({});
  const [commentText,setCommentText]=useState({}); // keyed by issue id
  const [expandedComments,setExpandedComments]=useState({});

  const setComment=(iid,val)=>setCommentText(prev=>({...prev,[iid]:val}));
  const toggleComments=(iid)=>setExpandedComments(prev=>({...prev,[iid]:!prev[iid]}));
  const submitComment=async(iid)=>{
    const text=(commentText[iid]||"").trim();
    if(!text)return;
    await onAddComment(iid,text);
    setCommentText(prev=>({...prev,[iid]:""}));
  };

  return(
    <div>
      {!isMobile&&<div style={s.tabBar}>
        <span style={s.mono12}>{open.length} open · {fixed.length} fixed</span>
        <div style={{display:"flex",gap:8}}>
          <div style={{display:"flex",borderRadius:6,overflow:"hidden",border:"1px solid var(--border-md)"}}>
            {["list","kanban"].map(m=><button key={m} onClick={()=>setViewMode(m)} style={{padding:"5px 12px",fontSize:11,background:viewMode===m?"var(--accent-dim)":"transparent",color:viewMode===m?"var(--accent-text)":"var(--txt-muted)",border:"none",cursor:"pointer",fontFamily:"'Syne'",fontWeight:600,textTransform:"capitalize"}}>{m==="list"?"≡ List":"⊞ Board"}</button>)}
          </div>
          <button className="q-btn-ghost" style={{padding:"7px 11px",fontSize:12}} onClick={()=>exportIssuesCSV(project)}>Export CSV</button>
          <button className="q-btn-primary" onClick={onAdd}>+ Log Issue</button>
        </div>
      </div>}
      {isMobile&&<div style={{padding:"10px 0 6px",display:"flex",flexDirection:"column",gap:6}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
          <span style={s.mono12}>{open.length} open · {fixed.length} fixed</span>
          <div style={{display:"flex",gap:6,alignItems:"center"}}>
            <button className="q-btn-ghost" style={{padding:"5px 10px",fontSize:12,whiteSpace:"nowrap"}} onClick={()=>exportIssuesCSV(project)}>Export CSV</button>
            <button className="q-btn-primary" style={{whiteSpace:"nowrap"}} onClick={onAdd}>+ Log Issue</button>
          </div>
        </div>
        <div style={{display:"flex",justifyContent:"flex-end"}}>
          <div style={{display:"flex",borderRadius:6,overflow:"hidden",border:"1px solid var(--border-md)"}}>
            {["list","kanban"].map(m=><button key={m} onClick={()=>setViewMode(m)} style={{padding:"5px 10px",fontSize:13,background:viewMode===m?"var(--accent-dim)":"transparent",color:viewMode===m?"var(--accent-text)":"var(--txt-muted)",border:"none",cursor:"pointer"}} title={m==="list"?"List":"Board"}>{m==="list"?"≡":"⊞"}</button>)}
          </div>
        </div>
      </div>}
      {issues.length===0&&<div style={s.empty}><p>No issues logged. 🎉</p></div>}
      {issues.length>0&&viewMode==="kanban"&&(
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:12,marginTop:8}}>
          {[{key:"open",label:"Open",color:"#FF6B9D",items:open},{key:"fixed",label:"Fixed",color:"#4ADE80",items:fixed}].map(col=>(
            <div key={col.key} style={{background:"var(--bg-input)",borderRadius:10,padding:12,border:`1px solid ${col.color}30`}}>
              <div style={{fontFamily:"'JetBrains Mono'",fontSize:10,fontWeight:700,letterSpacing:1,color:col.color,textTransform:"uppercase",marginBottom:10}}>{col.label} · {col.items.length}</div>
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {col.items.map(iss=>(
                  <div key={iss.id} style={{background:"var(--bg-card)",borderRadius:8,padding:"10px 12px",border:"1px solid var(--border)",borderLeft:`3px solid ${PRIORITY_CONFIG[iss.priority||"medium"].color}`}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:6}}>
                      <span style={{fontSize:13,fontWeight:600,color:"var(--txt)",flex:1,lineHeight:1.3,textDecoration:iss.status==="fixed"?"line-through":""}}>{iss.title}</span>
                      <button className="q-del" style={{flexShrink:0}} onClick={async()=>{if(await qConfirm("Remove this issue?"))onDelete(iss.id);}}>✕</button>
                    </div>
                    {iss.description&&<p style={{fontSize:11,color:"var(--txt-muted)",marginTop:4,lineHeight:1.4}}>{iss.description.slice(0,80)}{iss.description.length>80?"…":""}</p>}
                    <div style={{display:"flex",gap:6,marginTop:8,flexWrap:"wrap",alignItems:"center"}}>
                      <span style={{fontSize:10,padding:"1px 6px",borderRadius:4,background:PRIORITY_CONFIG[iss.priority||"medium"].bg,color:PRIORITY_CONFIG[iss.priority||"medium"].color,fontFamily:"'JetBrains Mono'"}}>{PRIORITY_CONFIG[iss.priority||"medium"].icon} {PRIORITY_CONFIG[iss.priority||"medium"].label}</span>
                      {iss.status==="open"&&<button style={{fontSize:10,padding:"2px 8px",borderRadius:4,background:"rgba(74,222,128,.1)",color:"#4ADE80",border:"1px solid rgba(74,222,128,.3)",cursor:"pointer",fontFamily:"'Syne'",fontWeight:700}} onClick={()=>onFix(iss)}>Fix →</button>}
                    </div>
                  </div>
                ))}
                {col.items.length===0&&<p style={{...s.mono10,color:"var(--txt-faint)",textAlign:"center",padding:"8px 0"}}>None</p>}
              </div>
            </div>
          ))}
        </div>
      )}
      {viewMode==="kanban"&&<div/>}
      {viewMode==="list"&&open.length>0&&<div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:24}}>{open.map(iss=>{
        const pc=PRIORITY_CONFIG[iss.priority||"medium"];
        const commentCount=(iss.comments||[]).length;
        const isExpanded=expandedComments[iss.id];
        return(
          <div key={iss.id} className="q-ver-card" style={{borderLeft:`3px solid ${pc.color}`}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:10,marginBottom:10}}>
              <div style={{flex:1}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6,flexWrap:"wrap"}}>
                  <span style={{...s.badge,color:pc.color,background:pc.bg,fontSize:10}}>{pc.icon} {pc.label}</span>
                  <span style={{color:"var(--txt)",fontWeight:600,fontSize:14}}>{iss.title}</span>
                </div>
                {iss.description&&<p style={{color:"var(--txt-muted)",fontSize:13,lineHeight:1.6,marginBottom:8}}>{iss.description}</p>}
                <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:8}}>
                  {PRIORITY_KEYS.map(pk=><button key={pk} onClick={()=>onUpdatePriority(iss.id,pk)} style={{fontSize:10,padding:"2px 8px",background:iss.priority===pk?PRIORITY_CONFIG[pk].bg:"transparent",border:`1px solid ${iss.priority===pk?PRIORITY_CONFIG[pk].color:"var(--border-md)"}`,borderRadius:12,color:iss.priority===pk?PRIORITY_CONFIG[pk].color:"var(--txt-muted)",cursor:"pointer",fontFamily:"'Syne'",transition:"all .15s"}}>{PRIORITY_CONFIG[pk].label}</button>)}
                </div>
                {/* Screenshots */}
                {(iss.screenshotUrls||[]).length>0&&(
                  <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:8}}>
                    {iss.screenshotUrls.map((url,i)=>(
                      <div key={i} style={{position:"relative",display:"inline-block"}}>
                        <img src={url} alt={`Screenshot ${i+1}`} onClick={()=>onLightbox(url,`${iss.title} — screenshot ${i+1}`)} style={{width:80,height:80,objectFit:"cover",borderRadius:6,cursor:"pointer",border:"1px solid var(--border)"}}/>
                        <button onClick={()=>onRemoveScreenshot(iss.id,url)} style={{position:"absolute",top:-6,right:-6,width:18,height:18,borderRadius:"50%",background:"#FF4466",border:"none",color:"#fff",fontSize:10,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                  <div style={{...s.mono10,color:"var(--txt-dim)"}}>Logged {new Date(iss.createdAt).toLocaleDateString()}</div>
                  <button onClick={()=>fileRefs.current[iss.id]?.click()} className="q-btn-ghost" style={{fontSize:11,padding:"2px 10px"}}>Add Screenshot</button>
                  <input ref={el=>fileRefs.current[iss.id]=el} type="file" accept="image/*" style={{display:"none"}} onChange={e=>{const f=e.target.files?.[0];if(f)onUploadScreenshot(iss.id,f);e.target.value="";}}/>
                  <button onClick={()=>toggleComments(iss.id)} style={{fontSize:11,padding:"2px 10px",background:"transparent",border:"1px solid var(--border-md)",borderRadius:6,color:commentCount>0?"var(--accent-text)":"var(--txt-muted)",cursor:"pointer",fontFamily:"'Syne'",transition:"all .15s"}}>
                    {commentCount>0?`${commentCount} comment${commentCount!==1?"s":""}   ${isExpanded?"▲":"▼"}`:"Add Comment"}
                  </button>
                </div>
                {/* Comment thread */}
                {isExpanded&&(
                  <div style={{marginTop:12,borderTop:"1px solid var(--border)",paddingTop:12}}>
                    {(iss.comments||[]).map(c=>(
                      <div key={c.id} style={{display:"flex",gap:10,marginBottom:10,alignItems:"flex-start"}}>
                        <div style={{width:28,height:28,borderRadius:"50%",background:"rgba(0,212,255,.1)",border:"1px solid rgba(0,212,255,.2)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,color:"#00D4FF",flexShrink:0,fontFamily:"'Syne'",fontWeight:700}}>U</div>
                        <div style={{flex:1,background:"var(--bg-input)",borderRadius:8,padding:"8px 12px"}}>
                          <p style={{color:"var(--txt-sub)",fontSize:13,lineHeight:1.6,whiteSpace:"pre-wrap"}}>{c.content}</p>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:6}}>
                            <span style={{...s.mono10,color:"var(--txt-faint)"}}>{new Date(c.createdAt).toLocaleString()}</span>
                            <button className="q-del" onClick={async()=>{if(await qConfirm("Delete comment?"))onDeleteComment(iss.id,c.id);}}>✕</button>
                          </div>
                        </div>
                      </div>
                    ))}
                    <div style={{display:"flex",gap:8,marginTop:4}}>
                      <QTextarea className="q-input" style={{flex:1,marginTop:0,height:60,resize:"vertical",fontSize:13}} value={commentText[iss.id]||""} onChange={e=>setComment(iss.id,e.target.value)} placeholder="Add a comment…" onKeyDown={e=>{if(e.ctrlKey&&e.key==="Enter"){e.preventDefault();submitComment(iss.id);}}}/>
                      <button className="q-btn-primary" style={{alignSelf:"flex-end",padding:"8px 14px",fontSize:12}} onClick={()=>submitComment(iss.id)}>Post</button>
                    </div>
                    <p style={{...s.mono10,color:"var(--txt-faint)",marginTop:4}}>Ctrl+Enter to post</p>
                  </div>
                )}
              </div>
              <div style={{display:"flex",gap:6,flexShrink:0}}>
                <button className="q-btn-ghost" style={{padding:"5px 12px",fontSize:12,borderColor:"rgba(74,222,128,.25)",color:"#4ADE80"}} onClick={()=>onFix(iss)}>Mark Fixed</button>
                <button className="q-del" onClick={async()=>{if(await qConfirm("Remove this issue?"))onDelete(iss.id);}}>✕</button>
              </div>
            </div>
          </div>
        );
      })}</div>}
      {viewMode==="list"&&fixed.length>0&&<><div style={{fontFamily:"'JetBrains Mono'",fontSize:10,color:"var(--txt-faint)",letterSpacing:1.2,textTransform:"uppercase",fontWeight:700,marginBottom:10}}>Fixed ({fixed.length})</div><div style={{display:"flex",flexDirection:"column",gap:6}}>{fixed.map(iss=>(<div key={iss.id} className="q-ms-row" style={{opacity:.55}}><span style={{width:8,height:8,borderRadius:"50%",background:"#4ADE80",flexShrink:0,marginTop:5}}/><div style={{flex:1}}><span style={{color:"var(--txt)",fontSize:13,fontWeight:500,textDecoration:"line-through"}}>{iss.title}</span>{iss.fixDescription&&<p style={{color:"var(--txt-muted)",fontSize:12,marginTop:2}}>{iss.fixDescription}</p>}<div style={{...s.mono10,marginTop:3,color:"var(--txt-dim)"}}>{iss.fixedAt?new Date(iss.fixedAt).toLocaleDateString():""}{iss.fixedInVersionId&&project.versions&&" · "+("fixed in "+(project.versions.find(v=>v.id===iss.fixedInVersionId)?.version||""))}</div></div><button className="q-del" onClick={async()=>{if(await qConfirm("Remove this issue?"))onDelete(iss.id);}}>✕</button></div>))}</div></>}
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
      {pinned.length>0&&<><div style={{fontFamily:"'JetBrains Mono'",fontSize:10,color:"#FFB347",letterSpacing:1.2,textTransform:"uppercase",fontWeight:700,marginBottom:8}}>⭐ Pinned</div>{pinned.map(idea=><IdeaRow key={idea.id} idea={idea} onPin={()=>onPin(idea.id)} onEdit={()=>onEdit(idea)} onDelete={async()=>{if(await qConfirm("Remove this idea?"))onDelete(idea.id);}}/>)}{rest.length>0&&<div style={{height:1,background:"var(--border)",margin:"16px 0"}}/>}</>}
      {rest.length>0&&<DraggableList items={rest} onReorder={r=>onReorder([...pinned,...r])}>{idea=><IdeaRow idea={idea} onPin={()=>onPin(idea.id)} onEdit={()=>onEdit(idea)} onDelete={async()=>{if(await qConfirm("Remove this idea?"))onDelete(idea.id);}}/>}</DraggableList>}
    </div>
  );
}
function IdeaRow({idea,onPin,onEdit,onDelete}){
  return(<div className="q-ver-card" style={{marginBottom:8}}><div style={{display:"flex",gap:10,alignItems:"flex-start"}}><span style={{color:"var(--txt-dim)",fontSize:18,cursor:"grab",userSelect:"none",flexShrink:0,marginTop:2}}>⠿</span><p style={{color:"var(--txt-sub)",fontSize:14,lineHeight:1.7,whiteSpace:"pre-wrap",flex:1}}>{idea.content}</p><div style={{display:"flex",gap:4,flexShrink:0}}><button onClick={onPin} title={idea.pinned?"Unpin":"Pin"} style={{fontSize:15,padding:"2px 4px",opacity:idea.pinned?1:.4,transition:"opacity .15s",background:"none",border:"none",cursor:"pointer"}}>⭐</button><button className="q-btn-ghost" style={{padding:"4px 8px",fontSize:12}} onClick={onEdit}>Edit</button><button className="q-del" onClick={onDelete}>✕</button></div></div><div style={{...s.mono10,marginTop:8,color:"var(--txt-dim)"}}>{new Date(idea.createdAt).toLocaleDateString("en-US",{year:"numeric",month:"short",day:"numeric"})}</div></div>);
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
          <button className="q-btn-ghost" style={{fontSize:12,padding:"7px 12px"}} onClick={()=>fileInput.current?.click()}>Upload</button>
          <button className="q-btn-primary" onClick={onAdd}>+ Add Concept</button>
        </div>
      </div>
      <input ref={fileInput} type="file" accept="image/*,audio/*" style={{display:"none"}} onChange={handleFilePick}/>
      {concepts.length===0?<div style={s.empty}><p>No concepts yet. Add colors, images, code, audio…</p></div>:(
        <div style={{display:"flex",flexDirection:"column",gap:24}}>
          {Object.entries(byType).map(([type,items])=>(
            <div key={type}>
              <div style={{fontFamily:"'JetBrains Mono'",fontSize:10,color:"var(--txt-muted)",letterSpacing:1.2,textTransform:"uppercase",fontWeight:700,marginBottom:10}}>{CONCEPT_ICONS[type]} {type}</div>
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
    <div style={{background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:10,padding:14,position:"relative"}} className="q-ver-card">
      <button className="q-del" onClick={onDelete} style={{position:"absolute",top:8,right:8}}>✕</button>
      {concept.label&&<div style={{fontSize:11,color:"var(--txt-muted)",marginBottom:8,paddingRight:20,fontWeight:600}}>{concept.label}</div>}
      {isColor&&<><div style={{width:"100%",height:72,borderRadius:6,background:concept.content,marginBottom:8,boxShadow:"inset 0 0 0 1px rgba(255,255,255,.08)"}}/><div style={{fontFamily:"'JetBrains Mono'",fontSize:12,color:"var(--txt)"}}>{concept.content}</div></>}
      {isImage&&<img src={concept.content} alt={concept.label||"concept"} onClick={()=>onLightbox(concept.content,concept.label)} style={{width:"100%",borderRadius:6,objectFit:"cover",maxHeight:180,display:"block",cursor:"pointer"}} onError={e=>e.target.style.display="none"}/>}
      {isAudio&&<audio src={concept.content} controls style={{width:"100%",marginTop:4}}/>}
      {isCode&&<pre style={{fontFamily:"'JetBrains Mono'",fontSize:11,color:"var(--txt-sub)",whiteSpace:"pre-wrap",wordBreak:"break-all",background:"var(--bg)",padding:10,borderRadius:6,maxHeight:160,overflow:"auto",margin:0}}>{concept.content}</pre>}
      {isLink&&<a href={concept.content} target="_blank" rel="noreferrer" style={{...s.fileLink,display:"block",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>↗ {concept.content}</a>}
      {!isColor&&!isImage&&!isAudio&&!isCode&&!isLink&&<p style={{color:"var(--txt-sub)",fontSize:13,lineHeight:1.65,whiteSpace:"pre-wrap"}}>{concept.content}</p>}
    </div>
  );
}

// ── Sprints Tab ───────────────────────────────────────────────────────────────
function SprintsTab({project,onAdd,onUpdateStatus,onDelete,onAssignTodo}){
  const sprints=project.sprints||[];
  const todos=project.todos||[];
  const active=sprints.filter(sp=>sp.status==="active");
  const completed=sprints.filter(sp=>sp.status==="completed");

  return(
    <div>
      <div style={s.tabBar}>
        <span style={s.mono12}>{active.length} active · {completed.length} completed</span>
        <button className="q-btn-primary" onClick={onAdd}>+ New Sprint</button>
      </div>
      {sprints.length===0&&<div style={s.empty}><p>No sprints yet. Create one to group todos into focused cycles.</p></div>}
      {active.length>0&&<div style={{display:"flex",flexDirection:"column",gap:12,marginBottom:24}}>
        {active.map(sp=>{
          const spTodos=todos.filter(t=>t.sprintId===sp.id);
          const done=spTodos.filter(t=>t.completed).length;
          const pct=spTodos.length?Math.round(done/spTodos.length*100):0;
          const daysLeft=sp.endDate?Math.ceil((new Date(sp.endDate)-new Date())/(1000*60*60*24)):null;
          return(
            <div key={sp.id} className="q-ver-card" style={{borderLeft:"3px solid #B47FFF"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
                <div>
                  <span style={{fontFamily:"'Syne'",fontSize:16,fontWeight:700,color:"var(--txt)"}}>{sp.name}</span>
                  {sp.goal&&<p style={{color:"var(--txt-muted)",fontSize:13,marginTop:3}}>{sp.goal}</p>}
                  {(sp.startDate||sp.endDate)&&<div style={{display:"flex",gap:12,marginTop:6}}>
                    {sp.startDate&&<span style={s.mono10}>{new Date(sp.startDate).toLocaleDateString()}</span>}
                    {sp.endDate&&<span style={s.mono10}>→ {new Date(sp.endDate).toLocaleDateString()}</span>}
                    {daysLeft!==null&&<span style={{...s.mono10,color:daysLeft<3?"#FF6B9D":daysLeft<7?"#FFB347":"#6B7290"}}>{daysLeft>0?`${daysLeft}d left`:"Past due"}</span>}
                  </div>}
                </div>
                <div style={{display:"flex",gap:6}}>
                  <button className="q-btn-ghost" style={{padding:"5px 12px",fontSize:12,color:"#4ADE80",borderColor:"rgba(74,222,128,.25)"}} onClick={()=>onUpdateStatus(sp.id,"completed")}>Complete</button>
                  <button className="q-del" onClick={async()=>{if(await qConfirm(`Delete sprint "${sp.name}"?`))onDelete(sp.id);}}>✕</button>
                </div>
              </div>
              {spTodos.length>0&&<>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
                  <div style={s.bar}><div style={{...s.barFill,width:`${pct}%`}}/></div>
                  <span style={s.mono10}>{done}/{spTodos.length}</span>
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:3}}>
                  {spTodos.slice(0,6).map(t=>(
                    <div key={t.id} style={{display:"flex",alignItems:"center",gap:8,padding:"4px 0"}}>
                      <span style={{width:14,height:14,borderRadius:3,border:`1.5px solid ${t.completed?"#4ADE80":"#2A3050"}`,background:t.completed?"rgba(74,222,128,.1)":"transparent",display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,color:"#4ADE80",flexShrink:0}}>{t.completed&&"✓"}</span>
                      <span style={{fontSize:13,color:t.completed?"var(--txt-faint)":"var(--txt-sub)",textDecoration:t.completed?"line-through":"none",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.text}</span>
                      <span style={{fontSize:10,color:PRIORITY_CONFIG[t.priority||"medium"].color}}>{PRIORITY_CONFIG[t.priority||"medium"].icon}</span>
                    </div>
                  ))}
                  {spTodos.length>6&&<p style={{...s.mono10,color:"var(--txt-faint)",marginTop:4}}>+{spTodos.length-6} more — see To-Do tab</p>}
                </div>
              </>}
              {spTodos.length===0&&<p style={{...s.mono10,color:"var(--txt-faint)"}}>No tasks assigned. Add tasks in the To-Do tab.</p>}
            </div>
          );
        })}
      </div>}
      {completed.length>0&&<>
        <div style={{fontFamily:"'JetBrains Mono'",fontSize:10,color:"var(--txt-faint)",letterSpacing:1.2,textTransform:"uppercase",fontWeight:700,marginBottom:10}}>Completed ({completed.length})</div>
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          {completed.map(sp=>{
            const spTodos=todos.filter(t=>t.sprintId===sp.id);
            const done=spTodos.filter(t=>t.completed).length;
            return(
              <div key={sp.id} className="q-ms-row" style={{opacity:.55}}>
                <div style={{flex:1}}><span style={{color:"var(--txt)",fontWeight:500}}>{sp.name}</span><span style={{...s.mono10,marginLeft:10}}>{done}/{spTodos.length} tasks</span></div>
                <button className="q-btn-ghost" style={{padding:"3px 10px",fontSize:11}} onClick={()=>onUpdateStatus(sp.id,"active")}>Reopen</button>
                <button className="q-del" onClick={async()=>{if(await qConfirm(`Delete sprint "${sp.name}"?`))onDelete(sp.id);}}>✕</button>
              </div>
            );
          })}
        </div>
      </>}
    </div>
  );
}

// ── Time Tab ──────────────────────────────────────────────────────────────────
function TimeTab({project,onStart,onStop,onDelete,pomMode,setPomMode,pomSecs,setPomSecs,pomActive,setPomActive,pomSession,setPomSession,pomCycles,setPomCycles}){
  const POM_WORK=25*60,POM_BREAK=5*60,POM_LONG_BREAK=15*60;
  const sessions=project.timeSessions||[];
  const [running,setRunning]=useState(null);
  const [elapsed,setElapsed]=useState(0);
  const [stopNote,setStopNote]=useState("");
  const [view,setView]=useState("timer"); // "timer"|"pomodoro"

  const openSession=sessions.find(s=>!s.endedAt);
  useEffect(()=>{if(openSession){setRunning({id:openSession.id,startedAt:openSession.startedAt});}else{setRunning(null);setElapsed(0);};},[openSession?.id]);
  useEffect(()=>{if(!running)return;const iv=setInterval(()=>setElapsed(Math.round((Date.now()-new Date(running.startedAt))/1000)),500);return()=>clearInterval(iv);},[running]);

  const startPomodoro=async()=>{
    // If there's already a regular timer running, let it keep running — start pomodoro as a separate session
    if(pomMode==="work"){
      const sess=await onStart();
      if(sess)setPomSession(sess.id);
    }
    setPomActive(true);
  };
  const pausePomodoro=()=>{setPomActive(false);};
  const resetPomodoro=()=>{setPomActive(false);setPomMode("work");setPomSecs(POM_WORK);if(pomSession){onStop(pomSession,"Pomodoro cancelled");setPomSession(null);}};

  const totalSeconds=sessions.filter(s=>s.durationSeconds).reduce((a,s)=>a+s.durationSeconds,0);
  const today=new Date().toDateString();
  const todaySeconds=sessions.filter(s=>s.durationSeconds&&new Date(s.startedAt).toDateString()===today).reduce((a,s)=>a+s.durationSeconds,0);
  const handleStop=async()=>{if(!running)return;await onStop(running.id,stopNote);setStopNote("");setRunning(null);setElapsed(0);};

  const grouped=sessions.filter(s=>s.endedAt).reduce((acc,s)=>{
    const d=new Date(s.startedAt).toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"});
    if(!acc[d])acc[d]=[];acc[d].push(s);return acc;
  },{});

  const pomPct=pomMode==="work"?((POM_WORK-pomSecs)/POM_WORK*100):(pomMode==="break"&&pomSecs>POM_BREAK)?(((POM_LONG_BREAK-pomSecs)/POM_LONG_BREAK)*100):(((POM_BREAK-pomSecs)/POM_BREAK)*100);
  const pomColor=pomMode==="work"?"#00D4FF":"#4ADE80";

  return(
    <div>
      <div style={s.tabBar}>
        <span style={s.mono12}>Total: {fmtDurationLong(totalSeconds)} · Today: {fmtDurationLong(todaySeconds)}</span>
        <div style={{display:"flex",gap:6}}>
          <button className={`q-chip${view==="timer"?" q-chip-on":""}`} onClick={()=>setView("timer")}>Stopwatch</button>
          <button className={`q-chip${view==="pomodoro"?" q-chip-on":""}`} onClick={()=>setView("pomodoro")}>Pomodoro</button>
        </div>
      </div>

      {running&&pomActive&&pomMode==="work"&&(
        <div style={{padding:"8px 14px",marginBottom:8,background:"rgba(0,212,255,.06)",border:"1px solid rgba(0,212,255,.2)",borderRadius:8,display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontFamily:"'JetBrains Mono'",fontSize:11,color:"var(--accent)"}}>⏱ Both timers running simultaneously</span>
          <span style={{fontFamily:"'JetBrains Mono'",fontSize:12,color:"var(--txt-sub)",marginLeft:"auto"}}>{Math.floor(elapsed/3600)>0?Math.floor(elapsed/3600)+"h ":""}{Math.floor((elapsed%3600)/60)}m {elapsed%60}s</span>
        </div>
      )}
      {view==="timer"&&(
        <div className="q-ver-card" style={{marginBottom:20,borderLeft:`3px solid ${running?"#4ADE80":"var(--border-md)"}`}}>
          <div style={{display:"flex",alignItems:"center",gap:16,flexWrap:"wrap"}}>
            <div style={{fontFamily:"'JetBrains Mono'",fontSize:28,fontWeight:700,color:running?"#4ADE80":"var(--txt-muted)",letterSpacing:2,minWidth:90}}>{running?fmtDurationLong(elapsed):"00:00:00"}</div>
            {!running
              ?<button className="q-btn-primary" style={{padding:"10px 24px",fontSize:14}} onClick={onStart}>Start Timer</button>
              :<div style={{display:"flex",gap:8,flex:1,flexWrap:"wrap"}}>
                <QInput className="q-input" style={{flex:1,minWidth:160,marginTop:0,fontSize:13}} value={stopNote} onChange={e=>setStopNote(e.target.value)} placeholder="What did you work on? (optional)"/>
                <button className="q-btn-danger" style={{padding:"10px 18px",fontSize:13,borderColor:"#FF4466",color:"#FF7090"}} onClick={handleStop}>Stop</button>
              </div>
            }
          </div>
          {running&&<p style={{...s.mono10,marginTop:10,color:"var(--txt-faint)"}}>Started {new Date(running.startedAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</p>}
        </div>
      )}

      {view==="pomodoro"&&(
        <div className="q-ver-card" style={{marginBottom:20,textAlign:"center",padding:"24px 20px"}}>
          <div style={{display:"flex",gap:12,justifyContent:"center",marginBottom:16}}>
            <span style={{fontSize:11,fontWeight:700,padding:"3px 10px",borderRadius:12,background:pomMode==="work"?"var(--accent-dim)":"transparent",border:`1px solid ${pomMode==="work"?"var(--accent)":"var(--border-md)"}`,color:pomMode==="work"?"var(--accent)":"var(--txt-muted)",cursor:"pointer",fontFamily:"'Syne'"}} onClick={()=>{if(!pomActive){setPomMode("work");setPomSecs(POM_WORK);}}}>Work 25m</span>
            <span style={{fontSize:11,fontWeight:700,padding:"3px 10px",borderRadius:12,background:pomMode==="break"?"rgba(74,222,128,.1)":"transparent",border:`1px solid ${pomMode==="break"?"#4ADE80":"var(--border-md)"}`,color:pomMode==="break"?"#4ADE80":"var(--txt-muted)",cursor:"pointer",fontFamily:"'Syne'"}} onClick={()=>{if(!pomActive){setPomMode("break");setPomSecs(POM_BREAK);}}}>Break 5m</span>
          </div>
          {/* Circular progress */}
          <svg width={120} height={120} style={{display:"block",margin:"0 auto 16px"}}>
            <circle cx={60} cy={60} r={52} fill="none" stroke="var(--border)" strokeWidth={8}/>
            <circle cx={60} cy={60} r={52} fill="none" stroke={pomColor} strokeWidth={8} strokeLinecap="round"
              strokeDasharray={`${2*Math.PI*52}`} strokeDashoffset={`${2*Math.PI*52*(1-pomPct/100)}`}
              transform="rotate(-90 60 60)" style={{transition:"stroke-dashoffset .5s"}}/>
            <text x={60} y={55} textAnchor="middle" fontFamily="'JetBrains Mono'" fontWeight={700} fontSize={18} fill={pomColor}>
              {String(Math.floor(pomSecs/60)).padStart(2,"0")}:{String(pomSecs%60).padStart(2,"0")}
            </text>
            <text x={60} y={73} textAnchor="middle" fontFamily="'Syne'" fontSize={10} fill="var(--txt-muted)">
              {pomMode==="work"?"FOCUS":"BREAK"}
            </text>
          </svg>
          <div style={{display:"flex",gap:10,justifyContent:"center",flexWrap:"wrap"}}>
            {!pomActive
              ?<button className="q-btn-primary" style={{padding:"9px 24px"}} onClick={startPomodoro}>{pomSecs<(pomMode==="work"?POM_WORK:POM_BREAK)?"Resume":"Start"}</button>
              :<button className="q-btn-ghost" style={{padding:"9px 20px"}} onClick={pausePomodoro}>Pause</button>
            }
            <button className="q-btn-ghost" style={{padding:"9px 16px"}} onClick={resetPomodoro}>Reset</button>
          </div>
          {pomCycles>0&&<p style={{...s.mono10,marginTop:14,color:"var(--txt-muted)"}}>{pomCycles} pomodoro{pomCycles!==1?"s":""} completed today · {fmtDuration(pomCycles*25*60)} focused</p>}
          <p style={{...s.mono10,marginTop:6,color:"var(--txt-faint)"}}>Work sessions auto-log to your time tracker</p>
        </div>
      )}

      {Object.keys(grouped).length===0?<div style={s.empty}><p>No sessions logged yet.</p></div>:(
        <div style={{display:"flex",flexDirection:"column",gap:16}}>
          {Object.entries(grouped).map(([date,daySessions])=>{
            const dayTotal=daySessions.reduce((a,s)=>a+(s.durationSeconds||0),0);
            return(
              <div key={date}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                  <span style={{fontFamily:"'Syne'",fontWeight:700,color:"var(--txt)",fontSize:13}}>{date}</span>
                  <span style={{...s.mono10,color:"var(--txt-muted)"}}>{fmtDurationLong(dayTotal)}</span>
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:4}}>
                  {daySessions.map(se=>(
                    <div key={se.id} className="q-ms-row" style={{padding:"8px 10px"}}>
                      <div style={{flex:1}}>
                        <div style={{display:"flex",gap:10,alignItems:"center"}}>
                          <span style={{fontFamily:"'JetBrains Mono'",fontSize:13,fontWeight:700,color:"var(--accent)"}}>{fmtDurationLong(se.durationSeconds)}</span>
                          {se.note&&<span style={{fontSize:13,color:"var(--txt-sub)"}}>{se.note}</span>}
                        </div>
                        <p style={{...s.mono10,marginTop:3,color:"var(--txt-faint)"}}>{new Date(se.startedAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})} → {new Date(se.endedAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</p>
                      </div>
                      <button className="q-del" onClick={async()=>{if(await qConfirm("Remove this session?"))onDelete(se.id);}}>✕</button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Group Form ───────────────────────────────────────────────────────────────
function GroupForm({data,setData,onSubmit,onCancel,title="New Group"}){
  const set=(k,v)=>setData(d=>({...d,[k]:v}));
  const GROUP_COLORS=["#00D4FF","#4ADE80","#FFB347","#FF6B9D","#B47FFF","#FF4466","#6EB8D0","#F97316"];
  return(
    <div>
      <h2 style={s.modalTitle}>New Project Group</h2>
      <Field label="Group Name *"><QInput className="q-input" value={data.name||""} onChange={e=>set("name",e.target.value)} placeholder="e.g., Client Work, Side Projects…" autoFocus/></Field>
      <Field label="Color">
        <div style={{display:"flex",gap:8,marginTop:8,alignItems:"center",flexWrap:"wrap"}}>
          <button onClick={()=>set("color",null)} style={{width:24,height:24,borderRadius:"50%",background:"var(--bg-card)",border:!data.color?"2px solid var(--accent)":"2px solid var(--border-md)",cursor:"pointer",fontSize:11,display:"flex",alignItems:"center",justifyContent:"center",color:"var(--txt-muted)"}}>×</button>
          {GROUP_COLORS.map(c=><button key={c} onClick={()=>set("color",c)} style={{width:24,height:24,borderRadius:"50%",background:c,border:data.color===c?"3px solid var(--txt)":"2px solid transparent",cursor:"pointer"}}/>)}
        </div>
      </Field>
      <FormActions onCancel={onCancel} onSubmit={()=>data.name?.trim()&&onSubmit(data)} submitLabel="Create Group"/>
    </div>
  );
}

// ── Daily Log Tab ─────────────────────────────────────────────────────────────
const MOOD_OPTIONS=[
  {key:"great",  label:"Great",  icon:"😄", color:"#4ADE80"},
  {key:"good",   label:"Good",   icon:"🙂", color:"#00D4FF"},
  {key:"okay",   label:"Okay",   icon:"😐", color:"#FFB347"},
  {key:"tough",  label:"Tough",  icon:"😓", color:"#FF6B9D"},
];
function DailyLogTab({project,onAdd,onEdit,onDelete}){
  const [text,setText]=useState("");
  const [mood,setMood]=useState("good");
  const [editing,setEditing]=useState(null); // {id, content, mood}
  const [editText,setEditText]=useState("");
  const [editMood,setEditMood]=useState("good");
  const logs=project.dailyLogs||[];

  // Group by date
  const byDate=logs.reduce((acc,d)=>{const k=d.logDate||d.createdAt?.slice(0,10)||"Unknown";if(!acc[k])acc[k]=[];acc[k].push(d);return acc;},{});
  const sortedDates=Object.keys(byDate).sort((a,b)=>b.localeCompare(a));
  const today=new Date().toISOString().slice(0,10);

  const handleAdd=async()=>{const t=text.trim();if(!t)return;await onAdd(t,mood);setText("");};

  const startEdit=(log)=>{setEditing(log.id);setEditText(log.content);setEditMood(log.mood||"good");};
  const saveEdit=async(lid)=>{await onEdit(lid,editText.trim(),editMood);setEditing(null);};

  return(
    <div>
      <div style={s.tabBar}>
        <span style={s.mono12}>{logs.length} {logs.length===1?"entry":"entries"}</span>
      </div>

      {/* Today's entry composer */}
      <div style={{background:"var(--bg-input)",border:"1px solid var(--border-md)",borderRadius:10,padding:14,marginBottom:20}}>
        <div style={{display:"flex",gap:8,marginBottom:10,alignItems:"center"}}>
          <span style={{fontFamily:"'JetBrains Mono'",fontSize:10,color:"var(--accent-text)",fontWeight:700,textTransform:"uppercase",letterSpacing:1}}>
            {new Date().toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"})}
          </span>
        </div>
        <div style={{display:"flex",gap:8,marginBottom:10,flexWrap:"wrap"}}>
          {MOOD_OPTIONS.map(m=>(
            <button key={m.key} onClick={()=>setMood(m.key)} style={{padding:"4px 12px",borderRadius:20,fontSize:12,cursor:"pointer",fontFamily:"'Syne'",fontWeight:600,border:`1px solid ${mood===m.key?m.color:"var(--border-md)"}`,background:mood===m.key?`${m.color}18`:"transparent",color:mood===m.key?m.color:"var(--txt-muted)",transition:"all .15s"}}>
              {m.icon} {m.label}
            </button>
          ))}
        </div>
        <QTextarea className="q-input" style={{minHeight:80,resize:"vertical",marginBottom:8}} value={text} onChange={e=>setText(e.target.value)} placeholder="What happened today? What did you build, fix, or learn?" onKeyDown={e=>{if(e.key==="Enter"&&e.ctrlKey){e.preventDefault();handleAdd();}}}/>
        <div style={{display:"flex",justifyContent:"flex-end",gap:8}}>
          <span style={{...s.mono10,color:"var(--txt-faint)",alignSelf:"center"}}>Ctrl+Enter to save</span>
          <button className="q-btn-primary" style={{padding:"7px 20px"}} onClick={handleAdd} disabled={!text.trim()}>Add Entry</button>
        </div>
      </div>

      {/* Past entries */}
      {logs.length===0&&<div style={s.empty}><p>No log entries yet. Start your daily log to track progress over time.</p></div>}
      <div style={{display:"flex",flexDirection:"column",gap:20}}>
        {sortedDates.map(date=>(
          <div key={date}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
              <div style={{fontFamily:"'JetBrains Mono'",fontSize:10,color:"var(--accent-text)",fontWeight:700,textTransform:"uppercase",letterSpacing:1}}>
                {date===today?"Today":new Date(date+"T12:00:00").toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"})}
              </div>
              <div style={{flex:1,height:1,background:"var(--border)"}}/>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {byDate[date].map(log=>{
                const moodCfg=MOOD_OPTIONS.find(m=>m.key===log.mood)||MOOD_OPTIONS[1];
                const isEditing=editing===log.id;
                return(
                  <div key={log.id} style={{background:"var(--bg-card)",border:`1px solid var(--border)`,borderLeft:`3px solid ${moodCfg.color}`,borderRadius:10,padding:14}}>
                    {isEditing?(
                      <>
                        <div style={{display:"flex",gap:6,marginBottom:8,flexWrap:"wrap"}}>
                          {MOOD_OPTIONS.map(m=>(
                            <button key={m.key} onClick={()=>setEditMood(m.key)} style={{padding:"3px 10px",borderRadius:20,fontSize:11,cursor:"pointer",fontFamily:"'Syne'",fontWeight:600,border:`1px solid ${editMood===m.key?m.color:"var(--border-md)"}`,background:editMood===m.key?`${m.color}18`:"transparent",color:editMood===m.key?m.color:"var(--txt-muted)"}}>
                              {m.icon} {m.label}
                            </button>
                          ))}
                        </div>
                        <QTextarea className="q-input" style={{minHeight:70,resize:"vertical",marginBottom:8}} value={editText} onChange={e=>setEditText(e.target.value)} autoFocus/>
                        <div style={{display:"flex",gap:6,justifyContent:"flex-end"}}>
                          <button className="q-btn-ghost" style={{padding:"5px 12px",fontSize:12}} onClick={()=>setEditing(null)}>Cancel</button>
                          <button className="q-btn-primary" style={{padding:"5px 14px",fontSize:12}} onClick={()=>saveEdit(log.id)}>Save</button>
                        </div>
                      </>
                    ):(
                      <>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:10,marginBottom:8}}>
                          <span style={{fontSize:12,padding:"2px 8px",borderRadius:12,background:`${moodCfg.color}18`,color:moodCfg.color,fontFamily:"'Syne'",fontWeight:600}}>{moodCfg.icon} {moodCfg.label}</span>
                          <div style={{display:"flex",gap:4,flexShrink:0}}>
                            <button className="q-btn-ghost" style={{padding:"3px 9px",fontSize:11}} onClick={()=>startEdit(log)}>Edit</button>
                            <button className="q-del" onClick={async()=>{if(await qConfirm("Delete this log entry?"))onDelete(log.id);}}>✕</button>
                          </div>
                        </div>
                        <div style={{lineHeight:1.75,whiteSpace:"pre-wrap",color:"var(--txt-sub)",fontSize:14}}>{log.content}</div>
                        <div style={{...s.mono10,color:"var(--txt-dim)",marginTop:8}}>
                          {new Date(log.createdAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Snippets Tab ──────────────────────────────────────────────────────────────
function SnippetsTab({project,onAdd,onEdit,onDelete}){
  const [search,setSearch]=useState("");
  const [langFilter,setLangFilter]=useState("all");
  const snippets=project.snippets||[];

  const langs=["all",...new Set(snippets.map(s=>s.language))];
  const filtered=snippets.filter(s=>{
    const matchLang=langFilter==="all"||s.language===langFilter;
    const matchSearch=!search.trim()||(s.title+s.content+(s.tags||[]).join(" ")).toLowerCase().includes(search.toLowerCase());
    return matchLang&&matchSearch;
  });

  return(
    <div>
      <div style={s.tabBar}>
        <span style={s.mono12}>{snippets.length} snippet{snippets.length!==1?"s":""}</span>
        <button className="q-btn-primary" onClick={onAdd}>+ Add Snippet</button>
      </div>
      <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>
        <QInput className="q-input" style={{flex:1,minWidth:160,marginTop:0}} placeholder="Search snippets…" value={search} onChange={e=>setSearch(e.target.value)}/>
        <select className="q-input" style={{width:150,marginTop:0,fontSize:13}} value={langFilter} onChange={e=>setLangFilter(e.target.value)}>
          {langs.map(l=><option key={l} value={l}>{l==="all"?"All Languages":l}</option>)}
        </select>
      </div>
      {snippets.length===0&&<div style={s.empty}><p>No snippets yet. Add reusable code blocks here.</p></div>}
      {filtered.length===0&&snippets.length>0&&<div style={s.empty}><p>No snippets match your search.</p></div>}
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        {filtered.map(sn=><SnippetCard key={sn.id} snippet={sn} onEdit={()=>onEdit(sn)} onDelete={async()=>{if(await qConfirm(`Delete snippet "${sn.title}"?`))onDelete(sn.id);}}/>)}
      </div>
    </div>
  );
}

function SnippetCard({snippet,onEdit,onDelete}){
  const [copied,setCopied]=useState(false);
  const copy=()=>{navigator.clipboard.writeText(snippet.content).then(()=>{setCopied(true);setTimeout(()=>setCopied(false),2000);}).catch(()=>{});};
  const LANG_COLORS={javascript:"#F7DF1E",typescript:"#3178C6",python:"#3776AB",kotlin:"#7F52FF",swift:"#F05138",html:"#E34F26",css:"#1572B6",sql:"#4479A1",bash:"#4EAA25",rust:"#CE422B",go:"#00ADD8",java:"#ED8B00",jsx:"#61DAFB",tsx:"#3178C6"};
  const langColor=LANG_COLORS[snippet.language]||"var(--txt-muted)";
  return(
    <div className="q-ver-card">
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
        <div style={{flex:1}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4,flexWrap:"wrap"}}>
            <span style={{fontFamily:"'Syne'",fontWeight:700,fontSize:14,color:"var(--txt)"}}>{snippet.title}</span>
            <span style={{fontFamily:"'JetBrains Mono'",fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:4,background:`${langColor}18`,border:`1px solid ${langColor}40`,color:langColor}}>{snippet.language}</span>
          </div>
          {(snippet.tags||[]).length>0&&(
            <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
              {snippet.tags.map((t,i)=><span key={i} style={{fontSize:10,padding:"1px 7px",borderRadius:10,background:"var(--accent-dim)",border:"1px solid var(--accent-border)",color:"var(--accent-text)",fontFamily:"'JetBrains Mono'"}}>{t}</span>)}
            </div>
          )}
        </div>
        <div style={{display:"flex",gap:6,flexShrink:0}}>
          <button className="q-btn-ghost" style={{padding:"4px 10px",fontSize:12}} onClick={copy}>{copied?"✓ Copied":"Copy"}</button>
          <button className="q-btn-ghost" style={{padding:"4px 10px",fontSize:12}} onClick={onEdit}>Edit</button>
          <button className="q-del" onClick={onDelete}>✕</button>
        </div>
      </div>
      <pre style={{fontFamily:"'JetBrains Mono'",fontSize:12,background:"var(--bg)",border:"1px solid var(--border)",borderRadius:8,padding:"10px 14px",overflowX:"auto",margin:0,color:"var(--txt-sub)",lineHeight:1.6,maxHeight:200,overflowY:"auto",whiteSpace:"pre"}}>{snippet.content}</pre>
      <div style={{...s.mono10,marginTop:6,color:"var(--txt-faint)"}}>{new Date(snippet.createdAt).toLocaleDateString()}</div>
    </div>
  );
}

function SnippetForm({data,setData,isEdit,onSubmit,onCancel}){
  const set=(k,v)=>setData(d=>({...d,[k]:v}));
  const [tagInput,setTagInput]=useState("");
  const addTag=()=>{const t=tagInput.trim();if(t&&!(data.tags||[]).includes(t)){set("tags",[...(data.tags||[]),t]);}setTagInput("");};
  const removeTag=(t)=>set("tags",(data.tags||[]).filter(x=>x!==t));
  return(
    <div>
      <h2 style={s.modalTitle}>{isEdit?"Edit Snippet":"New Snippet"}</h2>
      <Field label="Title *"><QInput className="q-input" value={data.title||""} onChange={e=>set("title",e.target.value)} placeholder="e.g., Auth middleware" autoFocus/></Field>
      <Field label="Language">
        <select className="q-input" value={data.language||"javascript"} onChange={e=>set("language",e.target.value)}>
          {SNIPPET_LANGUAGES.map(l=><option key={l} value={l}>{l}</option>)}
        </select>
      </Field>
      <Field label="Code *"><textarea className="q-input q-mono" style={{height:200,resize:"vertical",fontSize:13}} value={data.content||""} onChange={e=>set("content",e.target.value)} placeholder="// paste your code here…" spellCheck={false}/></Field>
      <Field label="Tags">
        <div style={{display:"flex",gap:8,marginTop:6}}>
          <QInput className="q-input" style={{flex:1,marginTop:0}} value={tagInput} onChange={e=>setTagInput(e.target.value)} placeholder="Add tag…" onKeyDown={e=>{if(e.key==="Enter"||e.key===","){e.preventDefault();addTag();}}}/>
          <button className="q-btn-ghost" style={{padding:"0 14px"}} onClick={addTag}>Add</button>
        </div>
        {(data.tags||[]).length>0&&(
          <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:8}}>
            {(data.tags||[]).map((t,i)=><span key={i} style={{display:"flex",alignItems:"center",gap:5,padding:"2px 8px",borderRadius:10,background:"var(--accent-dim)",border:"1px solid var(--accent-border)",color:"var(--accent-text)",fontSize:11,fontFamily:"'JetBrains Mono'"}}>{t}<button onClick={()=>removeTag(t)} style={{background:"none",border:"none",color:"var(--accent)",cursor:"pointer",fontSize:12,lineHeight:1,padding:0}}>✕</button></span>)}
          </div>
        )}
      </Field>
      <FormActions onCancel={onCancel} onSubmit={()=>data.title?.trim()&&data.content?.trim()&&onSubmit(data)} submitLabel={isEdit?"Save Changes":"Add Snippet"}/>
    </div>
  );
}

// ── Sprint Form ───────────────────────────────────────────────────────────────
function SprintForm({data,setData,onSubmit,onCancel}){
  const set=(k,v)=>setData(d=>({...d,[k]:v}));
  return(
    <div>
      <h2 style={s.modalTitle}>New Sprint</h2>
      <Field label="Sprint Name *"><QInput className="q-input" value={data.name||""} onChange={e=>set("name",e.target.value)} placeholder="e.g., Sprint 1 — Auth & Onboarding" autoFocus/></Field>
      <Field label="Goal"><QTextarea className="q-input" style={{height:72,resize:"vertical"}} value={data.goal||""} onChange={e=>set("goal",e.target.value)} placeholder="What does this sprint accomplish?"/></Field>
      <Field label="Start Date"><input type="date" className="q-input" value={data.startDate||""} onChange={e=>set("startDate",e.target.value)}/></Field>
      <Field label="End Date"><input type="date" className="q-input" value={data.endDate||""} onChange={e=>set("endDate",e.target.value)}/></Field>
      <FormActions onCancel={onCancel} onSubmit={()=>data.name?.trim()&&onSubmit(data)} submitLabel="Create Sprint"/>
    </div>
  );
}

// ── Build Log Tab ─────────────────────────────────────────────────────────────
function BuildLogTab({project,onAdd,onEdit,onUpdateStatus,onDelete}){
  const builds=project.buildLogs||[];
  const verMap=Object.fromEntries((project.versions||[]).map(v=>[v.id,v.version]));
  return(
    <div>
      <div style={s.tabBar}><span style={s.mono12}>{builds.length} builds</span><button className="q-btn-primary" onClick={onAdd}>+ Log Build</button></div>
      {builds.length===0?<div style={s.empty}><p>No builds logged yet.</p></div>:(
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {builds.map(b=>{const bs=BUILD_STATUSES[b.status]||BUILD_STATUSES.building;return(
            <div key={b.id} className="q-ver-card">
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:10,marginBottom:10}}>
                <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                  <span style={{fontFamily:"'JetBrains Mono'",fontSize:13,fontWeight:700,color:"var(--txt-sub)",textTransform:"capitalize"}}>{b.platform}</span>
                  {b.buildNumber&&<span style={{...s.badge,color:"#00D4FF",background:"rgba(0,212,255,.1)",fontSize:10}}>#{b.buildNumber}</span>}
                  {b.buildSize&&<span style={s.mono10}>{b.buildSize}</span>}
                  {verMap[b.versionId]&&<span style={s.mono10}>→ {verMap[b.versionId]}</span>}
                </div>
                <button className="q-btn-ghost" style={{padding:"4px 10px",fontSize:12}} onClick={()=>onEdit&&onEdit({...b})}>Edit</button>
              <button className="q-del" onClick={async()=>{if(await qConfirm("Remove this build log?"))onDelete(b.id);}}>✕</button>
              </div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:b.notes?10:0}}>
                {Object.entries(BUILD_STATUSES).map(([k,v])=>(
                  <button key={k} onClick={()=>onUpdateStatus(b.id,k)} style={{fontSize:11,padding:"3px 10px",background:b.status===k?v.color+"22":"transparent",border:`1px solid ${b.status===k?v.color:"var(--border-md)"}`,borderRadius:12,color:b.status===k?v.color:"var(--txt-muted)",cursor:"pointer",fontFamily:"'Syne'",transition:"all .15s"}}>
                    {v.icon} {v.label}
                  </button>
                ))}
              </div>
              {b.notes&&<p style={{color:"var(--txt-muted)",fontSize:13,lineHeight:1.6,marginTop:8}}>{b.notes}</p>}
              <div style={{...s.mono10,marginTop:8,color:"var(--txt-dim)"}}>{new Date(b.builtAt).toLocaleString()}</div>
            </div>
          );})}
        </div>
      )}
      <BuildSizeTrendChart buildLogs={builds}/>
    </div>
  );
}

// ── Environments Tab ──────────────────────────────────────────────────────────
function EnvironmentsTab({project,onAdd,onEdit,onDelete}){
  const envs=project.environments||[];
  const [revealed,setRevealed]=useState({});
  const toggle=(eid,key)=>setRevealed(r=>({...r,[`${eid}-${key}`]:!r[`${eid}-${key}`]}));
  return(
    <div>
      <div style={s.tabBar}><span style={s.mono12}>{envs.length} {envs.length===1?"environment":"environments"}</span><button className="q-btn-primary" onClick={onAdd}>+ Add Environment</button></div>
      {envs.length===0?<div style={s.empty}><p>No environments yet. Add dev, staging, production…</p></div>:(
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          {envs.map(env=>(
            <div key={env.id} className="q-ver-card" style={{borderLeft:`3px solid ${env.color||"#8B8FA8"}`}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
                <div>
                  <span style={{fontFamily:"'Syne'",fontSize:16,fontWeight:700,color:"var(--txt)"}}>{env.name}</span>
                  {env.url&&<a href={env.url} target="_blank" rel="noreferrer" style={{...s.fileLink,marginLeft:10,fontSize:11}}>↗ {env.url.replace(/https?:\/\//,"")}</a>}
                </div>
                <div style={{display:"flex",gap:6}}>
                  <button className="q-btn-ghost" style={{padding:"4px 10px",fontSize:12}} onClick={()=>onEdit(env)}>Edit</button>
                  <button className="q-del" onClick={async()=>{if(await qConfirm(`Delete ${env.name} environment?`))onDelete(env.id);}}>✕</button>
                </div>
              </div>
              {env.notes&&<p style={{color:"var(--txt-muted)",fontSize:13,marginBottom:10}}>{env.notes}</p>}
              {env.variables?.length>0&&(
                <div style={{display:"flex",flexDirection:"column",gap:4}}>
                  <div style={{fontFamily:"'JetBrains Mono'",fontSize:10,color:"var(--txt-muted)",letterSpacing:1,textTransform:"uppercase",fontWeight:700,marginBottom:4}}>Variables ({env.variables.length})</div>
                  {env.variables.map((v,i)=>(
                    <div key={i} style={{display:"flex",gap:8,alignItems:"center",padding:"5px 10px",background:"var(--bg-input)",borderRadius:6}}>
                      <span style={{fontFamily:"'JetBrains Mono'",fontSize:12,color:"#00D4FF",minWidth:100,flexShrink:0}}>{v.key}</span>
                      <span style={{fontFamily:"'JetBrains Mono'",fontSize:12,color:"var(--txt-sub)",flex:1,wordBreak:"break-all"}}>
                        {v.masked&&!revealed[`${env.id}-${i}`] ? "••••••••••••" : v.value}
                      </span>
                      {v.masked&&<button onClick={()=>toggle(env.id,i)} style={{fontFamily:"'JetBrains Mono'",fontSize:10,color:"var(--txt-muted)",background:"none",border:"none",cursor:"pointer"}}>{revealed[`${env.id}-${i}`]?"hide":"show"}</button>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Dependencies Tab ──────────────────────────────────────────────────────────
function DependenciesTab({project,onAdd,onUpdateStatus,onDelete}){
  const deps=project.dependencies||[];
  const grouped=DEP_TYPES.reduce((acc,t)=>{const items=deps.filter(d=>d.type===t);if(items.length)acc[t]=items;return acc;},{});
  const outdatedCount=deps.filter(d=>d.status!=="ok").length;
  return(
    <div>
      <div style={s.tabBar}>
        <span style={s.mono12}>{deps.length} dependencies{outdatedCount>0&&<span style={{color:"#FFB347",marginLeft:8}}>· {outdatedCount} need attention</span>}</span>
        <button className="q-btn-primary" onClick={onAdd}>+ Add Dependency</button>
      </div>
      {deps.length===0?<div style={s.empty}><p>No dependencies tracked yet.</p></div>:(
        <div style={{display:"flex",flexDirection:"column",gap:20}}>
          {Object.entries(grouped).map(([type,items])=>(
            <div key={type}>
              <div style={{fontFamily:"'JetBrains Mono'",fontSize:10,color:"var(--txt-muted)",letterSpacing:1.2,textTransform:"uppercase",fontWeight:700,marginBottom:8}}>{type}</div>
              <div style={{display:"flex",flexDirection:"column",gap:4}}>
                {items.map(dep=>{const ds=DEP_STATUSES[dep.status]||DEP_STATUSES.ok;return(
                  <div key={dep.id} className="q-ms-row" style={{padding:"10px 12px"}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                        <span style={{color:"var(--txt)",fontWeight:600,fontSize:14,fontFamily:"'JetBrains Mono'"}}>{dep.name}</span>
                        {dep.currentVersion&&<span style={{...s.mono10,color:"var(--txt-muted)"}}>{dep.currentVersion}</span>}
                        {dep.latestVersion&&dep.latestVersion!==dep.currentVersion&&<span style={{...s.mono10,color:"#FFB347"}}>→ {dep.latestVersion}</span>}
                        <span style={{fontSize:10,fontWeight:700,color:ds.color,background:`${ds.color}18`,border:`1px solid ${ds.color}30`,padding:"2px 7px",borderRadius:12,fontFamily:"'Syne'"}}>{ds.icon} {ds.label}</span>
                      </div>
                      {dep.notes&&<p style={{color:"var(--txt-muted)",fontSize:12,marginTop:3}}>{dep.notes}</p>}
                    </div>
                    <div style={{display:"flex",gap:5,flexShrink:0}}>
                      {Object.entries(DEP_STATUSES).map(([k,v])=>(
                        <button key={k} onClick={()=>onUpdateStatus(dep.id,k)} title={v.label} style={{fontSize:14,padding:"2px 4px",opacity:dep.status===k?1:.3,transition:"opacity .15s",background:"none",border:"none",cursor:"pointer",color:v.color}}>{v.icon}</button>
                      ))}
                      <button className="q-del" onClick={async()=>{if(await qConfirm(`Remove ${dep.name}?`))onDelete(dep.id);}}>✕</button>
                    </div>
                  </div>
                );})}
              </div>
            </div>
          ))}
        </div>
      )}
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
function SettingsModal({tabOrder,userTags,onSave,onAddTag,onDeleteTag,onCancel,templates,onDeleteTemplate,onOpenTemplates,onCheckForUpdates,updateStatus,updateError,theme,accentColor,customStatuses,onSavePreferences,currentProject,onSaveProjectTabOrder}){
  const [order,setOrder]=useState(tabOrder);const[dragIdx,setDragIdx]=useState(null);
  const [newTagName,setNewTagName]=useState("");const[newTagColor,setNewTagColor]=useState("#00D4FF");
  const [checking,setChecking]=useState(false);
  const [localTheme,setLocalTheme]=useState(theme||"dark");
  const [localAccent,setLocalAccent]=useState(accentColor||"#00D4FF");
  const [localStatuses,setLocalStatuses]=useState({...customStatuses});

  // Live preview — inject theme CSS as user adjusts, before hitting Save
  useEffect(()=>{
    let el=document.getElementById("q-preview-theme");
    if(!el){el=document.createElement("style");el.id="q-preview-theme";document.head.appendChild(el);}
    el.textContent=buildThemeCSS(localTheme,localAccent);
    return()=>{ /* keep preview while modal is open */ };
  },[localTheme,localAccent]);

  // On cancel — revert to saved theme
  const handleCancel=()=>{
    const el=document.getElementById("q-preview-theme");
    if(el)el.textContent=buildThemeCSS(theme,accentColor);
    onCancel();
  };
  const TAG_PRESET_COLORS=["#00D4FF","#4ADE80","#FFB347","#FF6B9D","#B47FFF","#FF4466","#8B8FA8","#6EB8D0"];
  const ACCENT_PRESETS=["#00D4FF","#4ADE80","#FFB347","#FF6B9D","#B47FFF","#F97316","#34D399","#60A5FA"];
  const onDragStart=i=>setDragIdx(i);
  const onDragOver=(e,i)=>{e.preventDefault();if(dragIdx===null||dragIdx===i)return;const n=[...order];const[m]=n.splice(dragIdx,1);n.splice(i,0,m);setOrder(n);setDragIdx(i);};
  const onDrop=()=>setDragIdx(null);
  const handleAddTag=async()=>{const name=newTagName.trim();if(!name)return;await onAddTag(name,newTagColor);setNewTagName("");};
  const handleCheckUpdates=async()=>{setChecking(true);await onCheckForUpdates?.();setTimeout(()=>setChecking(false),3000);};
  const isElectron=!!window.electronAPI?.checkForUpdates;

  const handleSave=()=>{
    const el=document.getElementById('q-preview-theme');
    if(el)el.remove();
    onSavePreferences({theme:localTheme,accentColor:localAccent,customStatuses:localStatuses});
    onSave(order);
  };

  return(
    <div>
      <h2 style={s.modalTitle}>Settings</h2>

      {/* Appearance */}
      <div style={{fontFamily:"'JetBrains Mono'",fontSize:10,color:"var(--txt-muted)",letterSpacing:".8px",textTransform:"uppercase",fontWeight:700,marginBottom:10}}>Appearance</div>
      <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
        {["dark","light"].map(t=>(
          <button key={t} onClick={()=>setLocalTheme(t)} style={{padding:"8px 16px",borderRadius:8,border:`1px solid ${localTheme===t?"var(--accent)":"var(--border-md)"}`,background:localTheme===t?"var(--accent-dim)":"transparent",color:localTheme===t?"var(--accent)":"var(--txt-muted)",fontFamily:"'Syne'",fontWeight:600,fontSize:13,cursor:"pointer",transition:"all .15s",textTransform:"capitalize"}}>
            {t==="dark"?"Dark Mode":"Light Mode"}
          </button>
        ))}
      </div>
      <div style={{marginBottom:20}}>
        <div style={{fontSize:11,color:"var(--txt-muted)",fontWeight:700,letterSpacing:".5px",textTransform:"uppercase",marginBottom:8}}>Accent Color</div>
        <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
          {ACCENT_PRESETS.map(c=><button key={c} onClick={()=>setLocalAccent(c)} style={{width:26,height:26,borderRadius:"50%",background:c,border:localAccent===c?"3px solid var(--txt)":"2px solid transparent",cursor:"pointer"}}/>)}
          <input type="color" value={localAccent} onChange={e=>setLocalAccent(e.target.value)} style={{width:36,height:30,padding:2,background:"var(--bg-input)",border:"1px solid var(--border-md)",borderRadius:6,cursor:"pointer"}}/>
          <span style={{...s.mono10,color:"var(--txt-faint)"}}>{localAccent}</span>
        </div>
      </div>

      {/* Custom status labels */}
      <div style={{fontFamily:"'JetBrains Mono'",fontSize:10,color:"var(--txt-muted)",letterSpacing:".8px",textTransform:"uppercase",fontWeight:700,marginBottom:10}}>Status Labels</div>
      <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:20}}>
        {Object.entries(STATUS_CONFIG).map(([key,val])=>(
          <div key={key} style={{display:"flex",gap:8,alignItems:"center"}}>
            <span style={{...s.badge,color:val.color,background:val.bg,minWidth:80,textAlign:"center"}}>{val.label}</span>
            <span style={{...s.mono10,color:"var(--txt-faint)",width:14}}>→</span>
            <QInput className="q-input" style={{flex:1,marginTop:0,fontSize:13}} value={localStatuses[key]||""} onChange={e=>setLocalStatuses(prev=>({...prev,[key]:e.target.value}))} placeholder={val.label}/>
            {localStatuses[key]&&<button className="q-del" onClick={()=>setLocalStatuses(prev=>{const n={...prev};delete n[key];return n;})}>✕</button>}
          </div>
        ))}
        <p style={{...s.mono10,color:"var(--txt-faint)",marginTop:4}}>Leave blank to use the default label. Syncs across devices.</p>
      </div>

      {/* Tab order */}
      <div style={{fontFamily:"'JetBrains Mono'",fontSize:10,color:"var(--txt-muted)",letterSpacing:".8px",textTransform:"uppercase",fontWeight:700,marginBottom:10}}>Tab Order — drag to rearrange</div>
      <div style={{display:"flex",flexDirection:"column",gap:4,marginBottom:currentProject?8:20}}>
        {order.map((tab,i)=>(
          <div key={tab.key} draggable onDragStart={()=>onDragStart(i)} onDragOver={e=>onDragOver(e,i)} onDrop={onDrop} onDragEnd={onDrop}
            style={{display:"flex",alignItems:"center",gap:12,padding:"9px 14px",background:dragIdx===i?"var(--accent-dim)":"var(--bg-input)",border:"1px solid var(--border-md)",borderRadius:8,cursor:"grab",opacity:dragIdx===i?.4:1}}>
            <span style={{color:"var(--txt-dim)",fontSize:16,userSelect:"none"}}>⠿</span>
            <span style={{color:"var(--txt)",fontFamily:"'Syne'",fontWeight:600,fontSize:14,flex:1}}>{tab.label}</span>
            <span style={{fontFamily:"'JetBrains Mono'",fontSize:10,color:"var(--txt-faint)"}}>{tab.key}</span>
          </div>
        ))}
      </div>
      {currentProject&&(
        <div style={{marginBottom:20,padding:"10px 14px",background:"rgba(255,179,71,.06)",border:"1px solid rgba(255,179,71,.25)",borderRadius:8}}>
          <p style={{fontSize:12,color:"#FFB347",fontFamily:"'Syne'",fontWeight:600,marginBottom:6}}>⇅ Project-specific order for: {currentProject.name}</p>
          <p style={{fontSize:11,color:"var(--txt-muted)",marginBottom:10}}>Save this arrangement as the default for this project only. Overrides your global setting just for this project.</p>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            <button className="q-btn-ghost" style={{padding:"6px 14px",fontSize:12,color:"#FFB347",borderColor:"rgba(255,179,71,.4)"}} onClick={()=>onSaveProjectTabOrder&&onSaveProjectTabOrder(currentProject.id,order)}>Save for {currentProject.name}</button>
            {currentProject.tabOrderOverride&&<button className="q-btn-ghost" style={{padding:"6px 14px",fontSize:12}} onClick={()=>onSaveProjectTabOrder&&onSaveProjectTabOrder(currentProject.id,null)}>← Use global order</button>}
          </div>
        </div>
      )}

      {/* Tag management */}
      <div style={{fontFamily:"'JetBrains Mono'",fontSize:10,color:"var(--txt-muted)",letterSpacing:".8px",textTransform:"uppercase",fontWeight:700,marginBottom:10}}>Tags</div>
      <div style={{display:"flex",gap:8,marginBottom:10}}>
        <input className="q-input" style={{flex:1,marginTop:0}} value={newTagName} onChange={e=>setNewTagName(e.target.value)} placeholder="New tag name…" onKeyDown={e=>e.key==="Enter"&&handleAddTag()}/>
        <input type="color" value={newTagColor} onChange={e=>setNewTagColor(e.target.value)} style={{width:42,height:40,padding:2,background:"var(--bg-input)",border:"1px solid var(--border-md)",borderRadius:8,cursor:"pointer",flexShrink:0}}/>
        <button className="q-btn-primary" style={{padding:"0 14px",flexShrink:0}} onClick={handleAddTag}>Add</button>
      </div>
      <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:6}}>
        {TAG_PRESET_COLORS.map(c=><button key={c} onClick={()=>setNewTagColor(c)} style={{width:20,height:20,borderRadius:"50%",background:c,border:newTagColor===c?"2px solid var(--txt)":"2px solid transparent",cursor:"pointer"}}/>)}
      </div>
      {(userTags||[]).length>0&&(
        <div style={{display:"flex",flexDirection:"column",gap:5,marginBottom:16,marginTop:10}}>
          {(userTags||[]).map(t=>(
            <div key={t.id} style={{display:"flex",alignItems:"center",gap:10,padding:"7px 12px",background:"var(--bg-input)",border:"1px solid var(--border-md)",borderRadius:8}}>
              <span style={{width:12,height:12,borderRadius:"50%",background:t.color,flexShrink:0}}/>
              <span style={{color:"var(--txt)",fontFamily:"'Syne'",fontWeight:600,fontSize:13,flex:1}}>{t.name}</span>
              <button className="q-del" onClick={async()=>{if(await qConfirm(`Delete tag "${t.name}"?`))onDeleteTag(t.id);}}>✕</button>
            </div>
          ))}
        </div>
      )}

      {/* Templates */}
      <div style={{fontFamily:"'JetBrains Mono'",fontSize:10,color:"var(--txt-muted)",letterSpacing:".8px",textTransform:"uppercase",fontWeight:700,marginBottom:10}}>Project Templates</div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 14px",background:"var(--bg-input)",border:"1px solid var(--border-md)",borderRadius:8,marginBottom:20}}>
        <span style={{color:"var(--txt)",fontSize:13}}>{templates?.length||0} saved {templates?.length===1?"template":"templates"}</span>
        <button className="q-btn-ghost" style={{padding:"6px 12px",fontSize:12}} onClick={()=>{onCancel();onOpenTemplates&&onOpenTemplates();}}>Manage →</button>
      </div>

      {/* Updates */}
      {isElectron&&(
        <div style={{marginBottom:20}}>
          <div style={{fontFamily:"'JetBrains Mono'",fontSize:10,color:"var(--txt-muted)",letterSpacing:".8px",textTransform:"uppercase",fontWeight:700,marginBottom:10}}>Updates</div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 14px",background:"var(--bg-input)",border:`1px solid ${updateStatus==="ready"?"#4ADE80":updateStatus==="available"?"var(--accent)":"var(--border-md)"}`,borderRadius:8}}>
            <div>
              <span style={{color:"var(--txt)",fontSize:13,fontFamily:"'Syne'",fontWeight:600}}>
                {updateStatus==="ready"?"Update ready to install"
                :updateStatus==="available"||updateStatus==="downloading"?"Downloading update…"
                :updateStatus==="checking"?"Checking for updates…"
                :updateStatus==="current"?"✓ You're up to date"
                :updateStatus==="error"?"Update check failed — see GitHub for latest"
                :"Qoder "+APP_VER}
              </span>
              <p style={{fontFamily:"'JetBrains Mono'",fontSize:10,color:updateStatus==="current"?"#4ADE80":updateStatus==="error"?"#FF6B9D":"var(--txt-faint)",marginTop:3}}>
                {updateStatus==="current"?"Already on the latest version":
                 updateStatus==="error"?(updateError||"Check github.com/JNoles405/qoder/releases"):
                 updateStatus?"":"Up to date"}
              </p>
            </div>
            {updateStatus==="ready"
              ?<button className="q-btn-primary" style={{padding:"7px 14px",fontSize:12}} onClick={()=>window.electronAPI.installUpdate()}>Restart & Install</button>
              :<button className="q-btn-ghost" style={{padding:"7px 14px",fontSize:12,opacity:checking||updateStatus==="available"||updateStatus==="downloading"?.5:1}} disabled={checking||updateStatus==="available"||updateStatus==="downloading"} onClick={handleCheckUpdates}>{checking?"Checking…":"Check for Updates"}</button>
            }
          </div>
        </div>
      )}

      <div style={{padding:"10px 14px",background:"var(--accent-dim)",borderRadius:8,border:"1px solid var(--accent-border)",marginBottom:4}}>
        <p style={{fontSize:12,color:"var(--txt-muted)",lineHeight:1.6}}>All settings sync across devices.<br/>Shortcuts: <span style={{fontFamily:"'JetBrains Mono'",color:"var(--txt-sub)"}}>Ctrl+←/→</span> tabs · <span style={{fontFamily:"'JetBrains Mono'",color:"var(--txt-sub)"}}>Ctrl+↑↓</span> projects · <span style={{fontFamily:"'JetBrains Mono'",color:"var(--txt-sub)"}}>Ctrl+Enter</span> submit · <span style={{fontFamily:"'JetBrains Mono'",color:"var(--txt-sub)"}}>F5</span> refresh</p>
      </div>
      <FormActions onCancel={handleCancel} onSubmit={handleSave} submitLabel="Save Settings"/>
      <div style={{marginTop:12,textAlign:"center"}}>
        <p style={{fontFamily:"'JetBrains Mono'",fontSize:10,color:"var(--txt-faint)",margin:0}}>© 2026 Midnight Skies Dev · Made by Benjamin J Noles</p>
      </div>
    </div>
  );
}

// ── Forms ─────────────────────────────────────────────────────────────────────
function ProjectForm({data,setData,title,userTags,templates,groups,onSubmit,onCancel}){
  const set=(k,v)=>setData(d=>({...d,[k]:v}));
  const tog=t=>set("techStack",(data.techStack||[]).includes(t)?(data.techStack||[]).filter(x=>x!==t):[...(data.techStack||[]),t]);
  const togTag=id=>set("tagIds",(data.tagIds||[]).includes(id)?(data.tagIds||[]).filter(x=>x!==id):[...(data.tagIds||[]),id]);
  const isElectron=!!window.electronAPI?.selectFolder;
  const browseFolder=async()=>{const p=await window.electronAPI.selectFolder();if(p)set("localFolder",p);};

  const applyTplToForm=(tpl)=>{
    const td=tpl.templateData||{};
    setData(d=>({...d,status:td.status||d.status,techStack:td.techStack||d.techStack,gitUrl:td.gitUrl||d.gitUrl,supabaseUrl:td.supabaseUrl||d.supabaseUrl,vercelUrl:td.vercelUrl||d.vercelUrl,_templateId:tpl.id}));
  };

  return(
    <div>
      <h2 style={s.modalTitle}>{title}</h2>

      {/* Template selector — only in New Project */}
      {title==="New Project"&&templates?.length>0&&(
        <div style={{marginBottom:16,padding:"12px 14px",background:"rgba(0,212,255,.04)",border:"1px solid rgba(0,212,255,.12)",borderRadius:8}}>
          <div style={{fontFamily:"'JetBrains Mono'",fontSize:10,color:"#00D4FF",letterSpacing:".8px",textTransform:"uppercase",fontWeight:700,marginBottom:8}}>Start from Template</div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            {templates.map(t=><button key={t.id} className={`q-chip${data._templateId===t.id?" q-chip-on":""}`} onClick={()=>applyTplToForm(t)} style={{fontSize:12}}>{t.name}</button>)}
          </div>
        </div>
      )}

      <Field label="Project Name *"><QInput className="q-input" value={data.name||""} onChange={e=>set("name",e.target.value)} placeholder="e.g., CarKeep"/></Field>
      <Field label="Description"><QTextarea className="q-input" style={{height:72,resize:"vertical"}} value={data.description||""} onChange={e=>set("description",e.target.value)} placeholder="What does this project do?"/></Field>
      <Field label="Status"><select className="q-input" value={data.status||"planning"} onChange={e=>set("status",e.target.value)}>{Object.entries(STATUS_CONFIG).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select></Field>
      {userTags?.length>0&&<Field label="Tags"><div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:8}}>{userTags.map(t=>{const on=(data.tagIds||[]).includes(t.id);return<button key={t.id} onClick={()=>togTag(t.id)} style={{fontSize:12,padding:"4px 11px",borderRadius:12,background:on?`${t.color}20`:"var(--bg-card)",border:`1px solid ${on?t.color:"var(--border-md)"}`,color:on?t.color:"var(--txt-muted)",cursor:"pointer",fontFamily:"'Syne'",fontWeight:600,transition:"all .15s"}}>{t.name}</button>;})} </div></Field>}
      <Field label="Git Repository URL"><QInput className="q-input" value={data.gitUrl||""} onChange={e=>set("gitUrl",e.target.value)} placeholder="https://github.com/…"/></Field>
      <Field label="Supabase Project URL"><QInput className="q-input" value={data.supabaseUrl||""} onChange={e=>set("supabaseUrl",e.target.value)} placeholder="https://supabase.com/dashboard/project/…"/></Field>
      <Field label="Vercel Project URL"><QInput className="q-input" value={data.vercelUrl||""} onChange={e=>set("vercelUrl",e.target.value)} placeholder="https://vercel.com/…"/></Field>
      {groups&&groups.length>0&&<Field label="Group">
        <select className="q-input" value={data.groupId||""} onChange={e=>set("groupId",e.target.value||null)}>
          <option value="">No Group</option>
          {groups.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
      </Field>}
      <Field label="Local Folder">
        <div style={{display:"flex",gap:8}}><QInput className="q-input" style={{flex:1,fontFamily:"'JetBrains Mono'",fontSize:12}} value={data.localFolder||""} onChange={e=>set("localFolder",e.target.value)} placeholder="Folder path…"/>{isElectron&&<button className="q-btn-ghost" style={{flexShrink:0,marginTop:6}} onClick={browseFolder}>Browse</button>}</div>
      </Field>
      <Field label="Tech Stack"><div style={{display:"flex",flexWrap:"wrap",gap:6,marginTop:8}}>{TECH_TAGS.map(t=><button key={t} className={`q-chip${(data.techStack||[]).includes(t)?" q-chip-on":""}`} onClick={()=>tog(t)}>{t}</button>)}</div></Field>
      <Field label="Project Color">
        <div style={{display:"flex",gap:8,marginTop:8,alignItems:"center",flexWrap:"wrap"}}>
          <button onClick={()=>set("color",null)} style={{width:24,height:24,borderRadius:"50%",background:"var(--bg-card)",border:!data.color?"2px solid var(--accent)":"2px solid var(--border-md)",cursor:"pointer",fontSize:12,display:"flex",alignItems:"center",justifyContent:"center",color:"var(--txt-muted)"}}>×</button>
          {PROJECT_COLORS.filter(c=>c).map(c=>(
            <button key={c} onClick={()=>set("color",c)} style={{width:24,height:24,borderRadius:"50%",background:c,border:data.color===c?"3px solid var(--txt)":"2px solid transparent",cursor:"pointer"}}/>
          ))}
          <input type="color" value={data.color||"#00D4FF"} onChange={e=>set("color",e.target.value)} style={{width:36,height:30,padding:2,background:"var(--bg-input)",border:"1px solid var(--border-md)",borderRadius:6,cursor:"pointer"}}/>
        </div>
        <p style={{...s.mono10,marginTop:6,color:"var(--txt-faint)"}}>Shows as colored dot in the sidebar</p>
      </Field>
      {/* Depends on other projects */}
      {groups!==undefined&&<Field label="Depends On">
        <p style={{...s.mono10,color:"var(--txt-faint)",marginBottom:6}}>Mark projects this one requires to be released first</p>
        <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
          {(data.allProjects||[]).filter(p=>p.id!==data.id&&p.status!=="archived").map(p=>{
            const on=(data.dependsOn||[]).includes(p.id);
            return<button key={p.id} onClick={()=>{const cur=data.dependsOn||[];set("dependsOn",on?cur.filter(x=>x!==p.id):[...cur,p.id]);}} style={{fontSize:12,padding:"4px 10px",borderRadius:10,background:on?"rgba(255,179,71,.15)":"var(--bg-card)",border:`1px solid ${on?"#FFB347":"var(--border-md)"}`,color:on?"#FFB347":"var(--txt-muted)",cursor:"pointer",fontFamily:"'Syne'",fontWeight:600,transition:"all .15s"}}>{p.name}</button>;
          })}
          {!(data.allProjects||[]).filter(p=>p.id!==data.id&&p.status!=="archived").length&&<span style={{...s.mono10,color:"var(--txt-faint)"}}>No other projects yet</span>}
        </div>
      </Field>}
      <FormActions onCancel={onCancel} onSubmit={()=>data.name?.trim()&&onSubmit(data)} submitLabel={title==="Edit Project"?"Save Changes":"Create Project"}/>
    </div>
  );
}
function VersionForm({data,setData,onSubmit,onCancel,title}){
  const set=(k,v)=>setData(d=>({...d,[k]:v}));
  const updLink=(i,v)=>setData(d=>({...d,fileLinks:d.fileLinks.map((l,j)=>j===i?v:l)}));
  const addLink=()=>setData(d=>({...d,fileLinks:[...(d.fileLinks||[]),""]  }));
  const rmLink=i=>setData(d=>({...d,fileLinks:d.fileLinks.filter((_,j)=>j!==i)}));
  // Use local date to avoid UTC off-by-one issue for users west of UTC
  const today=(()=>{const d=new Date();const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,"0"),dd=String(d.getDate()).padStart(2,"0");return`${y}-${m}-${dd}`;})();
  return(<div><h2 style={s.modalTitle}>{title||"Log New Version"}</h2><Field label="Version Number *"><input className="q-input q-mono" value={data.version||""} onChange={e=>set("version",e.target.value)} placeholder="e.g., v1.2.0"/></Field><Field label="Release Date"><input type="date" className="q-input" value={data.date?.split("T")[0]||today} onChange={e=>set("date",e.target.value)}/></Field><Field label="Release Notes"><QTextarea className="q-input" style={{height:90,resize:"vertical"}} value={data.releaseNotes||""} onChange={e=>set("releaseNotes",e.target.value)} placeholder="What changed?"/></Field><Field label="File / Download Links">{(data.fileLinks||[]).map((link,i)=><div key={i} style={{display:"flex",gap:8,marginTop:8}}><QInput className="q-input" style={{flex:1}} value={link} onChange={e=>updLink(i,e.target.value)} placeholder="https://…"/><button className="q-btn-ghost" style={{padding:"0 12px"}} onClick={()=>rmLink(i)}>✕</button></div>)}<button className="q-btn-ghost" style={{marginTop:8,fontSize:12}} onClick={addLink}>+ Add Link</button></Field><FormActions onCancel={onCancel} onSubmit={()=>data.version?.trim()&&onSubmit(data)} submitLabel="Log Version"/></div>);
}
function MilestoneForm({data,setData,onSubmit,onCancel}){const set=(k,v)=>setData(d=>({...d,[k]:v}));return(<div><h2 style={s.modalTitle}>Add Milestone</h2><Field label="Title *"><input className="q-input" value={data.title||""} onChange={e=>set("title",e.target.value)} placeholder="e.g., Submit to Play Store"/></Field><Field label="Target Date"><input type="date" className="q-input" value={data.date||""} onChange={e=>set("date",e.target.value)}/></Field><Field label="Description"><QTextarea className="q-input" style={{height:72,resize:"vertical"}} value={data.description||""} onChange={e=>set("description",e.target.value)} placeholder="Optional…"/></Field><FormActions onCancel={onCancel} onSubmit={()=>data.title?.trim()&&onSubmit(data)} submitLabel="Add Milestone"/></div>);}
function NoteForm({data,setData,title,onSubmit,onCancel}){const set=(k,v)=>setData(d=>({...d,[k]:v}));return(<div><h2 style={s.modalTitle}>{title}</h2><Field label="Content *"><QTextarea className="q-input" style={{height:160,resize:"vertical"}} autoFocus value={data.content||""} onChange={e=>set("content",e.target.value)} placeholder="Write your note…"/></Field><FormActions onCancel={onCancel} onSubmit={()=>data.content?.trim()&&onSubmit(data)} submitLabel="Save Note"/></div>);}
function AssetForm({data,setData,onSubmit,onCancel,title="Add Asset"}){
  const set=(k,v)=>setData(d=>({...d,[k]:v}));
  return(
    <div>
      <h2 style={s.modalTitle}>{title}</h2>
      <Field label="Type">
        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:8}}>
          {ASSET_TYPES.map(t=><button key={t} className={`q-chip${(data.type||"Link")===t?" q-chip-on":""}`} onClick={()=>set("type",t)} style={{fontSize:12}}>{ASSET_ICONS[t]} {t}</button>)}
        </div>
      </Field>
      <Field label="Name *"><QInput className="q-input" value={data.name||""} onChange={e=>set("name",e.target.value)} placeholder="e.g., App Icon, Play Store Listing…"/></Field>
      <Field label="URL / Value *"><QInput className="q-input" value={data.url||""} onChange={e=>set("url",e.target.value)} placeholder="https://… or #hex color or description"/></Field>
      <FormActions onCancel={onCancel} onSubmit={()=>data.name?.trim()&&data.url?.trim()&&onSubmit(data)} submitLabel="Add Asset"/>
    </div>
  );
}
function IssueForm({data,setData,onSubmit,onCancel}){
  const set=(k,v)=>setData(d=>({...d,[k]:v}));
  return(
    <div>
      <h2 style={s.modalTitle}>Log Issue</h2>
      <Field label="Title *"><QInput className="q-input" value={data.title||""} onChange={e=>set("title",e.target.value)} placeholder="e.g., App crashes on login"/></Field>
      <Field label="Priority">
        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:8}}>
          {PRIORITY_KEYS.map(k=>{const pc=PRIORITY_CONFIG[k];return<button key={k} className={`q-chip${(data.priority||"medium")===k?" q-chip-on":""}`} onClick={()=>set("priority",k)} style={{borderColor:(data.priority||"medium")===k?pc.color:undefined,color:(data.priority||"medium")===k?pc.color:undefined}}>{pc.icon} {pc.label}</button>;})}
        </div>
      </Field>
      <Field label="Description"><QTextarea className="q-input" style={{height:100,resize:"vertical"}} value={data.description||""} onChange={e=>set("description",e.target.value)} placeholder="Steps to reproduce…"/></Field>
      <FormActions onCancel={onCancel} onSubmit={()=>data.title?.trim()&&onSubmit(data)} submitLabel="Log Issue"/>
    </div>
  );
}
function FixIssueModal({data,setData,onSubmit,onCancel}){
  const set=(k,v)=>setData(d=>({...d,[k]:v}));
  const versions=data.projectVersions||[];
  return(
    <div>
      <h2 style={s.modalTitle}>Mark Issue Fixed</h2>
      <div style={{background:"rgba(74,222,128,.06)",border:"1px solid rgba(74,222,128,.15)",borderRadius:8,padding:"10px 14px",marginBottom:16}}>
        <p style={{color:"#4ADE80",fontSize:13,fontWeight:600}}>{data.title}</p>
        {data.description&&<p style={{color:"var(--txt-muted)",fontSize:12,marginTop:4}}>{data.description}</p>}
      </div>
      <Field label="How was it fixed? *">
        <QTextarea className="q-input" style={{height:100,resize:"vertical"}} autoFocus value={data.fixDescription||""} onChange={e=>set("fixDescription",e.target.value)} placeholder="Describe the fix…"/>
      </Field>
      {versions.length>0&&<Field label="Fixed in version (optional)">
        <select className="q-input" value={data.fixedInVersionId||""} onChange={e=>set("fixedInVersionId",e.target.value||null)}>
          <option value="">Not linked to a version</option>
          {versions.map(v=><option key={v.id} value={v.id}>{v.version}</option>)}
        </select>
      </Field>}
      <p style={{fontSize:12,color:"var(--txt-muted)",marginTop:6}}>A note will be automatically created with this fix.</p>
      <FormActions onCancel={onCancel} onSubmit={()=>data.fixDescription?.trim()&&onSubmit(data)} submitLabel="Mark Fixed"/>
    </div>
  );
}
function IdeaForm({data,setData,title,onSubmit,onCancel}){const set=(k,v)=>setData(d=>({...d,[k]:v}));return(<div><h2 style={s.modalTitle}>{title}</h2><Field label="Idea *"><QTextarea className="q-input" style={{height:140,resize:"vertical"}} autoFocus value={data.content||""} onChange={e=>set("content",e.target.value)} placeholder="Your idea…"/></Field><p style={{fontSize:12,color:"var(--txt-muted)",marginTop:4}}>Ideas don't appear on Overview.</p><FormActions onCancel={onCancel} onSubmit={()=>data.content?.trim()&&onSubmit(data)} submitLabel="Save Idea"/></div>);}
function ConceptForm({data,setData,cfg,session,projectId,onSubmit,onUploadFile,onCancel}){
  const set=(k,v)=>setData(d=>({...d,[k]:v}));
  const fileRef=useRef(null);
  const [recording,setRecording]=useState(false);const mrRef=useRef(null);
  const handleFileChange=e=>{const file=e.target.files?.[0];if(file&&onUploadFile){const type=file.type.startsWith("audio/")?"audio":"image";onUploadFile(file,data.label||file.name,type);}};
  const startRec=async()=>{try{const stream=await navigator.mediaDevices.getUserMedia({audio:true});const chunks=[];const mr=new MediaRecorder(stream);mr.ondataavailable=e=>chunks.push(e.data);mr.onstop=()=>{const blob=new Blob(chunks,{type:"audio/webm"});const reader=new FileReader();reader.onload=()=>set("content",reader.result);reader.readAsDataURL(blob);stream.getTracks().forEach(t=>t.stop());};mr.start();mrRef.current=mr;setRecording(true);}catch{alert("Mic access denied");}};
  const stopRec=()=>{mrRef.current?.stop();setRecording(false);};
  const renderInput=()=>{switch(data.type){
    case "color":return<div style={{display:"flex",gap:10,alignItems:"center",marginTop:8}}><input type="color" value={data.content||"#00D4FF"} onChange={e=>set("content",e.target.value)} style={{width:48,height:40,padding:2,background:"var(--bg-input)",border:"1px solid var(--border-md)",borderRadius:6,cursor:"pointer"}}/><QInput className="q-input" style={{flex:1,marginTop:0,fontFamily:"'JetBrains Mono'"}} value={data.content||""} onChange={e=>set("content",e.target.value)} placeholder="#hex, rgb(), hsl()"/></div>;
    case "image":return<div><input className="q-input" value={data.content||""} onChange={e=>set("content",e.target.value)} placeholder="https://image-url.com/..."/><button className="q-btn-ghost" style={{marginTop:8,width:"100%"}} onClick={()=>fileRef.current?.click()}>Upload Image</button><input ref={fileRef} type="file" accept="image/*" style={{display:"none"}} onChange={handleFileChange}/></div>;
    case "audio":return<div style={{marginTop:8}}>{recording?<button className="q-btn-danger" style={{width:"100%",padding:10}} onClick={stopRec}>Stop Recording</button>:<button className="q-btn-ghost" style={{width:"100%",padding:10}} onClick={startRec}>Start Recording</button>}<button className="q-btn-ghost" style={{marginTop:8,width:"100%"}} onClick={()=>fileRef.current?.click()}>Upload Audio</button><input ref={fileRef} type="file" accept="audio/*" style={{display:"none"}} onChange={handleFileChange}/>{data.content&&<audio src={data.content} controls style={{width:"100%",marginTop:10}}/>}</div>;
    case "code": return<textarea className="q-input q-mono" style={{height:130,resize:"vertical"}} value={data.content||""} onChange={e=>set("content",e.target.value)} placeholder="// paste code here"/>;
    case "link": return<QInput className="q-input" value={data.content||""} onChange={e=>set("content",e.target.value)} placeholder="https://..."/>;
    default:     return<QTextarea className="q-input" style={{height:100,resize:"vertical"}} value={data.content||""} onChange={e=>set("content",e.target.value)} placeholder="Enter text…"/>;
  }};
  return(<div><h2 style={s.modalTitle}>Add Concept</h2><Field label="Type"><div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:8}}>{CONCEPT_TYPES.map(t=><button key={t} className={`q-chip${data.type===t?" q-chip-on":""}`} onClick={()=>set("type",t)}>{CONCEPT_ICONS[t]} {t}</button>)}</div></Field><Field label="Label (optional)"><QInput className="q-input" value={data.label||""} onChange={e=>set("label",e.target.value)} placeholder="Name this concept…"/></Field><Field label="Content">{renderInput()}</Field><p style={{fontSize:12,color:"var(--txt-muted)",marginTop:4}}>Concepts don't appear on Overview.</p><FormActions onCancel={onCancel} onSubmit={()=>data.content?.trim()&&onSubmit(data)} submitLabel="Add Concept"/></div>);
}

function BuildLogForm({data,setData,versions,onSubmit,onCancel,title="Log Build"}){
  const set=(k,v)=>setData(d=>({...d,[k]:v}));
  const today=new Date().toISOString();
  return(
    <div>
      <h2 style={s.modalTitle}>{title}</h2>
      <Field label="Platform">
        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:8}}>
          {BUILD_PLATFORMS.map(p=><button key={p} className={`q-chip${data.platform===p?" q-chip-on":""}`} onClick={()=>set("platform",p)} style={{textTransform:"capitalize"}}>{p}</button>)}
        </div>
      </Field>
      <Field label="Linked Version">
        <select className="q-input" value={data.versionId||""} onChange={e=>set("versionId",e.target.value)}>
          <option value="">— None —</option>
          {versions.map(v=><option key={v.id} value={v.id}>{v.version}</option>)}
        </select>
      </Field>
      <Field label="Build Number"><input className="q-input q-mono" value={data.buildNumber||""} onChange={e=>set("buildNumber",e.target.value)} placeholder="e.g. 42"/></Field>
      <Field label="Build Size"><QInput className="q-input" value={data.buildSize||""} onChange={e=>set("buildSize",e.target.value)} placeholder="e.g. 24.3 MB"/></Field>
      <Field label="Status">
        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:8}}>
          {Object.entries(BUILD_STATUSES).map(([k,v])=><button key={k} className={`q-chip${data.status===k?" q-chip-on":""}`} onClick={()=>set("status",k)}>{v.icon} {v.label}</button>)}
        </div>
      </Field>
      <Field label="Store / Distribution"><QInput className="q-input" value={data.store||""} onChange={e=>set("store",e.target.value)} placeholder="e.g. Google Play, App Store, Direct"/></Field>
      <Field label="Notes"><QTextarea className="q-input" style={{height:72,resize:"vertical"}} value={data.notes||""} onChange={e=>set("notes",e.target.value)} placeholder="Optional…"/></Field>
      <FormActions onCancel={onCancel} onSubmit={()=>onSubmit({...data,builtAt:today})} submitLabel="Log Build"/>
    </div>
  );
}

function EnvironmentForm({data,setData,title,onSubmit,onCancel}){
  const set=(k,v)=>setData(d=>({...d,[k]:v}));
  const addVar=()=>setData(d=>({...d,variables:[...(d.variables||[]),{key:"",value:"",masked:false}]}));
  const setVar=(i,field,val)=>setData(d=>({...d,variables:d.variables.map((v,j)=>j===i?{...v,[field]:val}:v)}));
  const rmVar=i=>setData(d=>({...d,variables:d.variables.filter((_,j)=>j!==i)}));
  return(
    <div>
      <h2 style={s.modalTitle}>{title}</h2>
      <Field label="Name *"><QInput className="q-input" value={data.name||""} onChange={e=>set("name",e.target.value)} placeholder="e.g. Production"/></Field>
      <Field label="URL"><input className="q-input" value={data.url||""} onChange={e=>set("url",e.target.value)} placeholder="https://…"/></Field>
      <Field label="Color">
        <div style={{display:"flex",gap:8,marginTop:8,alignItems:"center"}}>
          <input type="color" value={data.color||"#4ADE80"} onChange={e=>set("color",e.target.value)} style={{width:40,height:36,padding:2,background:"var(--bg-input)",border:"1px solid var(--border-md)",borderRadius:6,cursor:"pointer"}}/>
          {ENV_PRESET_COLORS.map(c=><button key={c} onClick={()=>set("color",c)} style={{width:22,height:22,borderRadius:"50%",background:c,border:data.color===c?"2px solid #fff":"2px solid transparent",cursor:"pointer"}}/>)}
        </div>
      </Field>
      <Field label="Notes"><QTextarea className="q-input" style={{height:60,resize:"vertical"}} value={data.notes||""} onChange={e=>set("notes",e.target.value)} placeholder="Optional…"/></Field>
      <Field label="Environment Variables">
        <div style={{display:"flex",flexDirection:"column",gap:6,marginTop:8}}>
          {(data.variables||[]).map((v,i)=>(
            <div key={i} style={{display:"flex",gap:6,alignItems:"center"}}>
              <input className="q-input q-mono" style={{flex:1,marginTop:0}} value={v.key} onChange={e=>setVar(i,"key",e.target.value)} placeholder="KEY"/>
              <QInput className="q-input" style={{flex:2,marginTop:0,fontFamily:v.masked?"monospace":"inherit"}} value={v.value} onChange={e=>setVar(i,"value",e.target.value)} placeholder="value" type={v.masked?"password":"text"}/>
              <button onClick={()=>setVar(i,"masked",!v.masked)} title="Mask value" style={{padding:"0 8px",color:v.masked?"#00D4FF":"#4B5268",fontFamily:"'JetBrains Mono'",fontSize:12,background:"none",border:"none",cursor:"pointer"}}>🔒</button>
              <button className="q-del" onClick={()=>rmVar(i)}>✕</button>
            </div>
          ))}
          <button className="q-btn-ghost" style={{fontSize:12,marginTop:4}} onClick={addVar}>+ Add Variable</button>
        </div>
      </Field>
      <FormActions onCancel={onCancel} onSubmit={()=>data.name?.trim()&&onSubmit(data)} submitLabel={title.includes("Edit")?"Save Changes":"Add Environment"}/>
    </div>
  );
}

function DependencyForm({data,setData,onSubmit,onCancel}){
  const set=(k,v)=>setData(d=>({...d,[k]:v}));
  return(
    <div>
      <h2 style={s.modalTitle}>Add Dependency</h2>
      <Field label="Package Name *"><input className="q-input q-mono" value={data.name||""} onChange={e=>set("name",e.target.value)} placeholder="e.g. react-native, supabase-js"/></Field>
      <Field label="Type">
        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:8}}>
          {DEP_TYPES.map(t=><button key={t} className={`q-chip${data.type===t?" q-chip-on":""}`} onClick={()=>set("type",t)}>{t}</button>)}
        </div>
      </Field>
      <Field label="Current Version"><input className="q-input q-mono" value={data.currentVersion||""} onChange={e=>set("currentVersion",e.target.value)} placeholder="e.g. 2.3.1"/></Field>
      <Field label="Latest Version"><input className="q-input q-mono" value={data.latestVersion||""} onChange={e=>set("latestVersion",e.target.value)} placeholder="Leave blank if unknown"/></Field>
      <Field label="Status">
        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:8}}>
          {Object.entries(DEP_STATUSES).map(([k,v])=><button key={k} className={`q-chip${data.status===k?" q-chip-on":""}`} onClick={()=>set("status",k)}>{v.icon} {v.label}</button>)}
        </div>
      </Field>
      <Field label="Notes"><QTextarea className="q-input" style={{height:60,resize:"vertical"}} value={data.notes||""} onChange={e=>set("notes",e.target.value)} placeholder="Optional notes…"/></Field>
      <FormActions onCancel={onCancel} onSubmit={()=>data.name?.trim()&&onSubmit(data)} submitLabel="Add Dependency"/>
    </div>
  );
}

// ── GitHub Tab ────────────────────────────────────────────────────────────────
function GitHubTab({project,data,onRefresh,onLoadCache}){
  useEffect(()=>{onLoadCache&&onLoadCache();},[]);
  const repo=parseGitHubRepo(project.gitUrl);
  if(!repo){
    return(
      <div style={s.empty}>
        <p>No GitHub repository linked.</p>
        <p style={{fontSize:13,color:"var(--txt-faint)",marginTop:4}}>Add a GitHub URL in Edit Project to enable this tab.</p>
      </div>
    );
  }
  const ghUrl=`https://github.com/${repo.owner}/${repo.repo}`;
  return(
    <div>
      <div style={s.tabBar}>
        <div>
          <a href={ghUrl} target="_blank" rel="noreferrer" style={{...s.fileLink,fontSize:13}}>{repo.owner}/{repo.repo}</a>
          {data?.fetchedAt&&<span style={{...s.mono10,marginLeft:10,color:"var(--txt-faint)"}}>Updated {new Date(data.fetchedAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</span>}
        </div>
        <button className="q-btn-primary" onClick={onRefresh}>⟳ Refresh</button>
      </div>

      {!data&&(
        <div style={s.empty}><p>Click Refresh to load GitHub data.</p><p style={{...s.mono10,marginTop:6,color:"var(--txt-faint)"}}>Public repos: 60 req/hr · Private: add GitHub token in Settings</p></div>
      )}

      {data?.error&&<div style={{padding:"10px 14px",background:"rgba(255,100,100,.08)",border:"1px solid rgba(255,100,100,.2)",borderRadius:8,color:"#FF7090",fontSize:13,marginBottom:16}}>{data.error}</div>}

      {data&&<>
        {/* Commits */}
        {data.commits?.length>0&&(
          <div style={{marginBottom:24}}>
            <div style={{fontFamily:"'JetBrains Mono'",fontSize:10,color:"var(--txt-muted)",letterSpacing:1.2,textTransform:"uppercase",fontWeight:700,marginBottom:10}}>Recent Commits ({data.commits.length})</div>
            <div style={{display:"flex",flexDirection:"column",gap:4}}>
              {data.commits.map(c=>(
                <div key={c.sha} style={{display:"flex",gap:10,padding:"9px 12px",background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:8,alignItems:"flex-start"}}>
                  <a href={c.url} target="_blank" rel="noreferrer" style={{fontFamily:"'JetBrains Mono'",fontSize:11,color:"#00D4FF",flexShrink:0,marginTop:2,minWidth:50}}>{c.sha}</a>
                  <div style={{flex:1,minWidth:0}}>
                    <p style={{color:"var(--txt-sub)",fontSize:13,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.message}</p>
                    <p style={{...s.mono10,color:"var(--txt-faint)",marginTop:2}}>{c.author} · {c.date?new Date(c.date).toLocaleDateString():""}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Open Issues */}
        {data.issues?.length>0&&(
          <div style={{marginBottom:24}}>
            <div style={{fontFamily:"'JetBrains Mono'",fontSize:10,color:"#FF6B9D",letterSpacing:1.2,textTransform:"uppercase",fontWeight:700,marginBottom:10}}>Open Issues ({data.issues.length})</div>
            <div style={{display:"flex",flexDirection:"column",gap:4}}>
              {data.issues.map(i=>(
                <div key={i.id} style={{display:"flex",gap:10,padding:"9px 12px",background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:8,alignItems:"center"}}>
                  <span style={{...s.mono10,color:"var(--txt-faint)",flexShrink:0}}>#{i.id}</span>
                  <a href={i.url} target="_blank" rel="noreferrer" style={{color:"var(--txt-sub)",fontSize:13,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",textDecoration:"none"}}>{i.title}</a>
                  <div style={{display:"flex",gap:4,flexShrink:0}}>{i.labels?.slice(0,2).map(l=><span key={l} style={{fontSize:10,padding:"2px 6px",borderRadius:8,background:"rgba(0,212,255,.08)",color:"#6EB8D0",fontFamily:"'JetBrains Mono'"}}>{l}</span>)}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Open PRs */}
        {data.prs?.length>0&&(
          <div>
            <div style={{fontFamily:"'JetBrains Mono'",fontSize:10,color:"#4ADE80",letterSpacing:1.2,textTransform:"uppercase",fontWeight:700,marginBottom:10}}>Open Pull Requests ({data.prs.length})</div>
            <div style={{display:"flex",flexDirection:"column",gap:4}}>
              {data.prs.map(pr=>(
                <div key={pr.id} style={{display:"flex",gap:10,padding:"9px 12px",background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:8,alignItems:"center"}}>
                  <span style={{...s.mono10,color:"var(--txt-faint)",flexShrink:0}}>#{pr.id}</span>
                  {pr.draft&&<span style={{fontSize:10,padding:"2px 6px",borderRadius:6,background:"rgba(139,143,168,.12)",color:"var(--txt-muted)",flexShrink:0}}>Draft</span>}
                  <a href={pr.url} target="_blank" rel="noreferrer" style={{color:"var(--txt-sub)",fontSize:13,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",textDecoration:"none"}}>{pr.title}</a>
                  {pr.base&&<span style={{...s.mono10,color:"var(--txt-faint)",flexShrink:0}}>→ {pr.base}</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {data.commits?.length===0&&data.issues?.length===0&&data.prs?.length===0&&(
          <div style={s.empty}><p>No data found. The repo may be empty or private.</p></div>
        )}
      </>}
    </div>
  );
}

// ── Save Template Modal ────────────────────────────────────────────────────────
function SaveTemplateModal({data,setData,onSubmit,onCancel}){
  const set=(k,v)=>setData(d=>({...d,[k]:v}));
  return(
    <div>
      <h2 style={s.modalTitle}>Save as Template</h2>
      <p style={{color:"var(--txt-muted)",fontSize:13,marginBottom:16,lineHeight:1.6}}>Saves this project's status, tech stack, links, milestones, open todos, and environments as a reusable template. Masked environment variables are excluded.</p>
      <Field label="Template Name *"><QInput className="q-input" value={data.name||""} onChange={e=>set("name",e.target.value)} placeholder="e.g., React Native App Starter" autoFocus/></Field>
      <FormActions onCancel={onCancel} onSubmit={()=>data.name?.trim()&&onSubmit(data)} submitLabel="Save Template"/>
    </div>
  );
}

// ── Manage Templates Modal ────────────────────────────────────────────────────
function ManageTemplatesModal({templates,onDelete,onApply,onCancel}){
  return(
    <div>
      <h2 style={s.modalTitle}>Project Templates</h2>
      {(!templates||templates.length===0)?(
        <div style={s.empty}><p>No templates yet.</p><p style={{fontSize:13,color:"var(--txt-faint)",marginTop:4}}>Save a project as a template using the Save Template button.</p></div>
      ):(
        <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:16}}>
          {templates.map(t=>(
            <div key={t.id} style={{display:"flex",gap:12,padding:"13px 16px",background:"var(--bg-input)",border:"1px solid var(--border-md)",borderRadius:10,alignItems:"center"}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{color:"var(--txt)",fontWeight:600,fontSize:14}}>{t.name}</div>
                {t.description&&<div style={{color:"var(--txt-muted)",fontSize:12,marginTop:2}}>{t.description}</div>}
                <div style={{...s.mono10,color:"var(--txt-faint)",marginTop:4}}>
                  {t.templateData?.milestones?.length||0} milestones · {t.templateData?.todos?.length||0} todos · {t.templateData?.techStack?.length||0} stack items
                </div>
              </div>
              <div style={{display:"flex",gap:6,flexShrink:0}}>
                <button className="q-btn-ghost" style={{padding:"6px 12px",fontSize:12}} onClick={()=>onApply(t.id)}>Apply</button>
                <button className="q-del" onClick={async()=>{if(await qConfirm(`Delete template "${t.name}"?`))onDelete(t.id);}}>✕</button>
              </div>
            </div>
          ))}
        </div>
      )}
      <button className="q-btn-ghost" style={{width:"100%"}} onClick={onCancel}>Close</button>
    </div>
  );
}

// ── Changelog Modal ───────────────────────────────────────────────────────────
function ChangelogModal({project,onClose,onPublishRelease}){
  const [copied,setCopied]=useState(false);
  const [ghToken,setGhToken]=useState(()=>{try{return localStorage.getItem("q-gh-token")||"";}catch{return "";}});
  const [publishing,setPublishing]=useState(false);
  const [publishedUrl,setPublishedUrl]=useState(null);
  const [draft,setDraft]=useState(false);
  const [showToken,setShowToken]=useState(false);
  const md=generateChangelog(project);
  const latestVer=project.versions?.[0];
  const repo=parseGitHubRepo(project.gitUrl);

  const copy=()=>{navigator.clipboard.writeText(md).then(()=>{setCopied(true);setTimeout(()=>setCopied(false),2000);}).catch(()=>{});};

  const saveToken=(val)=>{setGhToken(val);try{if(val)localStorage.setItem("q-gh-token",val);else localStorage.removeItem("q-gh-token");}catch{}};

  const handlePublish=async()=>{
    if(!latestVer){return;}
    setPublishing(true);
    const tagName=`v${latestVer.version}`.replace(/^vv/,"v");
    const releaseName=`${project.name} ${tagName}`;
    const url=await onPublishRelease(tagName,releaseName,md,ghToken,draft);
    if(url)setPublishedUrl(url);
    setPublishing(false);
  };

  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
        <h2 style={s.modalTitle}>Changelog</h2>
        <div style={{display:"flex",gap:8}}>
          <button className="q-btn-ghost" style={{padding:"7px 14px",fontSize:12}} onClick={copy}>{copied?"✓ Copied!":"Copy Markdown"}</button>
          <button className="q-btn-ghost" style={{padding:"7px 12px",fontSize:12}} onClick={onClose}>✕</button>
        </div>
      </div>

      {/* Generated changelog */}
      <div style={{background:"var(--bg-input)",border:"1px solid var(--border-md)",borderRadius:10,padding:18,maxHeight:"40vh",overflowY:"auto",marginBottom:16}}>
        <pre style={{fontFamily:"'JetBrains Mono'",fontSize:12,color:"var(--txt-sub)",whiteSpace:"pre-wrap",lineHeight:1.7,margin:0}}>{md}</pre>
      </div>

      {/* GitHub Release publisher */}
      {repo?(
        <div style={{background:"rgba(0,212,255,.04)",border:"1px solid rgba(0,212,255,.12)",borderRadius:10,padding:16}}>
          <div style={{fontFamily:"'JetBrains Mono'",fontSize:10,color:"#00D4FF",letterSpacing:1,textTransform:"uppercase",fontWeight:700,marginBottom:12}}>Publish to GitHub Release</div>

          {publishedUrl?(
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <span style={{color:"#4ADE80",fontSize:13,fontWeight:600}}>✓ Release published!</span>
              <a href={publishedUrl} target="_blank" rel="noreferrer" style={{...s.fileLink,fontSize:12}}>View on GitHub →</a>
              <button className="q-btn-ghost" style={{padding:"4px 10px",fontSize:12}} onClick={()=>setPublishedUrl(null)}>Publish Another</button>
            </div>
          ):(
            <>
              <div style={{marginBottom:10}}>
                <label style={{display:"block",fontSize:11,color:"var(--txt-muted)",fontWeight:700,letterSpacing:".5px",textTransform:"uppercase",marginBottom:6}}>GitHub Token (with Contents: Write)</label>
                <div style={{display:"flex",gap:8}}>
                  <QInput className="q-input" type={showToken?"text":"password"} style={{flex:1,marginTop:0,fontFamily:"'JetBrains Mono'",fontSize:12}} value={ghToken} onChange={e=>saveToken(e.target.value)} placeholder="ghp_xxxxxxxxxxxx"/>
                  <button className="q-btn-ghost" style={{padding:"0 12px",fontSize:12}} onClick={()=>setShowToken(v=>!v)}>{showToken?"Hide":"Show"}</button>
                </div>
                <p style={{...s.mono10,marginTop:5,color:"var(--txt-faint)"}}>Saved locally on this device. Tag: {latestVer?`v${latestVer.version}`:"no versions yet"} · Repo: {repo.owner}/{repo.repo}</p>
              </div>
              <div style={{display:"flex",gap:10,alignItems:"center"}}>
                <label style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer",fontSize:13,color:"var(--txt-muted)"}}>
                  <input type="checkbox" checked={draft} onChange={e=>setDraft(e.target.checked)} style={{accentColor:"#00D4FF"}}/>
                  Save as draft
                </label>
                <button className="q-btn-primary" style={{padding:"8px 18px",fontSize:13,opacity:publishing||!latestVer||!ghToken?.trim()?.length?.5:1}} disabled={publishing||!latestVer||!ghToken?.trim()} onClick={handlePublish}>
                  {publishing?"Publishing…":draft?"Create Draft Release":"Publish Release"}
                </button>
                {!latestVer&&<span style={{...s.mono10,color:"#FF6B9D"}}>Log a version first</span>}
              </div>
            </>
          )}
        </div>
      ):(
        <div style={{padding:"10px 14px",background:"rgba(255,107,157,.05)",border:"1px solid rgba(255,107,157,.15)",borderRadius:8}}>
          <p style={{fontSize:12,color:"#FF6B9D"}}>Add a GitHub URL in Edit Project to enable one-click release publishing.</p>
        </div>
      )}

      <p style={{...s.mono10,color:"var(--txt-faint)",marginTop:12}}>
        {project.versions?.length||0} versions · {project.issues?.filter(i=>i.status==="fixed").length||0} fixed issues
      </p>
    </div>
  );
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
  // Backdrop and modal are SIBLINGS — backdrop never wraps modal.
  // This eliminates all Electron Windows keyboard/focus routing issues.
  useEffect(()=>{
    const h=e=>{if(e.key==="Escape")onClose();};
    window.addEventListener("keydown",h);
    return()=>window.removeEventListener("keydown",h);
  },[]);
  return(
    <>
      <div style={s.overlayBackdrop} onClick={onClose}/>
      <div style={s.modalCentered} onClick={e=>e.stopPropagation()}>
        {children}
      </div>
    </>
  );
}

// ── Styled confirm dialog ─────────────────────────────────────────────────────
// ── Command Palette ───────────────────────────────────────────────────────────
function CommandPalette({projects,onClose,onOpen,onNewProject,onNewNote,onNewTodo,onDashboard,onSettings,onExportAll,onTimeReport}){
  const [q,setQ]=useState("");
  const [idx,setIdx]=useState(0);
  const inputRef=useRef(null);
  const listRef=useRef(null);
  useEffect(()=>{inputRef.current?.focus();},[]);

  const staticCmds=[
    {icon:"◈",label:"Go to Dashboard",        action:onDashboard,   hint:"dashboard"},
    {icon:"＋",label:"New Project",             action:onNewProject,  hint:"create"},
    {icon:"☰",label:"Open Settings",           action:onSettings,    hint:"settings theme"},
    {icon:"⬇",label:"Backup All Projects",     action:onExportAll,   hint:"export json"},
    {icon:"⏱",label:"Export Time Report (CSV)",action:onTimeReport,  hint:"time csv"},
  ];
  const matchedCmds=q.trim()?staticCmds.filter(c=>(c.label+" "+c.hint).toLowerCase().includes(q.toLowerCase())):staticCmds;
  const matchedProjs=q.trim()?projects.filter(p=>p.name.toLowerCase().includes(q.toLowerCase())).slice(0,6):projects.filter(p=>p.status!=="archived").slice(0,5);
  const allItems=[
    ...matchedProjs.map(p=>({type:"proj",data:p,action:()=>onOpen(p,"overview")})),
    ...matchedCmds.map(c=>({type:"cmd",data:c,action:c.action})),
  ];
  const safeIdx=Math.min(idx,Math.max(0,allItems.length-1));

  useEffect(()=>setIdx(0),[q]);
  useEffect(()=>{
    const h=e=>{
      if(e.key==="Escape"){onClose();return;}
      if(e.key==="ArrowDown"){e.preventDefault();setIdx(i=>Math.min(i+1,allItems.length-1));return;}
      if(e.key==="ArrowUp"){e.preventDefault();setIdx(i=>Math.max(i-1,0));return;}
      if(e.key==="Enter"&&allItems[safeIdx]){e.preventDefault();allItems[safeIdx].action();return;}
    };
    window.addEventListener("keydown",h);return()=>window.removeEventListener("keydown",h);
  },[allItems,safeIdx,onClose]);

  // Scroll selected item into view
  useEffect(()=>{
    const el=listRef.current?.querySelector(`[data-idx="${safeIdx}"]`);
    el?.scrollIntoView({block:"nearest"});
  },[safeIdx]);

  return(
    <>
      <div style={{position:"fixed",inset:0,background:"var(--overlay)",zIndex:2000}} onClick={onClose}/>
      <div style={{position:"fixed",top:"15%",left:"50%",transform:"translateX(-50%)",zIndex:2001,width:"min(580px,92vw)",background:"var(--bg-modal)",border:"1px solid var(--border-md)",borderRadius:14,boxShadow:"0 16px 64px rgba(0,0,0,.4)",overflow:"hidden"}}>
        <div style={{display:"flex",alignItems:"center",gap:10,padding:"14px 16px",borderBottom:"1px solid var(--border)"}}>
          <span style={{color:"var(--txt-muted)",fontSize:16}}>⌘</span>
          <input ref={inputRef} value={q} onChange={e=>setQ(e.target.value)} placeholder="Search projects, commands…" style={{flex:1,background:"none",border:"none",outline:"none",fontSize:15,color:"var(--txt)",fontFamily:"'Syne'",fontWeight:500}} autoCorrect="off" autoCapitalize="none" spellCheck={false}/>
          <kbd style={{fontFamily:"'JetBrains Mono'",fontSize:10,padding:"2px 6px",border:"1px solid var(--border-md)",borderRadius:4,color:"var(--txt-faint)"}}>ESC</kbd>
        </div>
        <div ref={listRef} style={{maxHeight:"60vh",overflowY:"auto"}}>
          {matchedProjs.length>0&&<>
            <div style={{padding:"8px 16px 4px",fontFamily:"'JetBrains Mono'",fontSize:10,color:"var(--txt-faint)",textTransform:"uppercase",letterSpacing:1}}>Projects</div>
            {matchedProjs.map((p,i)=>(
              <div key={p.id} data-idx={i} onClick={()=>onOpen(p,"overview")} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 16px",cursor:"pointer",background:safeIdx===i?"var(--accent-dim)":"transparent",transition:"background .1s"}}>
                <span style={{color:STATUS_CONFIG[p.status]?.color||"var(--txt-muted)",fontSize:9}}>●</span>
                <span style={{flex:1,fontSize:14,color:"var(--txt)",fontFamily:"'Syne'",fontWeight:600}}>{p.name}</span>
                <span style={{...s.mono10,color:"var(--txt-faint)"}}>{STATUS_CONFIG[p.status]?.label}</span>
              </div>
            ))}
          </>}
          {matchedCmds.length>0&&<>
            <div style={{padding:"8px 16px 4px",fontFamily:"'JetBrains Mono'",fontSize:10,color:"var(--txt-faint)",textTransform:"uppercase",letterSpacing:1}}>Commands</div>
            {matchedCmds.map((c,i)=>{const gi=matchedProjs.length+i;return(
              <div key={i} data-idx={gi} onClick={c.action} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 16px",cursor:"pointer",background:safeIdx===gi?"var(--accent-dim)":"transparent",transition:"background .1s"}}>
                <span style={{color:"var(--accent)",fontSize:13,width:16,textAlign:"center",flexShrink:0}}>{c.icon}</span>
                <span style={{flex:1,fontSize:14,color:"var(--txt)",fontFamily:"'Syne'",fontWeight:500}}>{c.label}</span>
              </div>
            );})}
          </>}
          {allItems.length===0&&(
            <div style={{padding:"24px 16px",textAlign:"center",color:"var(--txt-faint)",fontSize:13,fontFamily:"'Syne'"}}>No results for "{q}"</div>
          )}
        </div>
        <div style={{padding:"8px 16px",borderTop:"1px solid var(--border)",display:"flex",gap:16,alignItems:"center"}}>
          <span style={{...s.mono10,color:"var(--txt-faint)"}}>↑↓ navigate</span>
          <span style={{...s.mono10,color:"var(--txt-faint)"}}>↵ select</span>
          <span style={{...s.mono10,color:"var(--txt-faint)"}}>ESC close</span>
        </div>
      </div>
    </>
  );
}

// ── Keyboard Shortcuts Modal ──────────────────────────────────────────────────
// ── JotPad — floating quick note capture ─────────────────────────────────────
function JotPad({projectName,onSave,onClose,value,onChange}){
  const ref=useRef(null);
  useEffect(()=>{ref.current?.focus();},[]);
  return(
    <>
      <div style={{position:"fixed",inset:0,zIndex:3000}} onClick={onClose}/>
      <div style={{position:"fixed",bottom:80,right:24,zIndex:3001,width:"min(400px,90vw)",background:"var(--bg-modal)",border:"1px solid var(--accent)",borderRadius:12,boxShadow:"0 8px 32px rgba(0,0,0,.4)",overflow:"hidden"}}>
        <div style={{padding:"10px 14px 0",display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:12,color:"var(--accent-text)",fontFamily:"'Syne'",fontWeight:700,flex:1}}>📝 Note → {projectName}</span>
          <kbd style={{fontFamily:"'JetBrains Mono'",fontSize:10,padding:"1px 5px",border:"1px solid var(--border-md)",borderRadius:3,color:"var(--txt-faint)"}}>Ctrl+J</kbd>
        </div>
        <QTextarea ref={ref} className="q-input" style={{border:"none",borderRadius:0,resize:"none",minHeight:100,margin:"8px 0 0",borderTop:"1px solid var(--border)"}} value={value} onChange={e=>onChange(e.target.value)} placeholder="Jot something down…" onKeyDown={e=>{if(e.key==="Enter"&&e.ctrlKey){e.preventDefault();onSave(value);}if(e.key==="Escape")onClose();}}/>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 14px",borderTop:"1px solid var(--border)"}}>
          <span style={{...s.mono10,color:"var(--txt-faint)"}}>Ctrl+Enter to save · Esc to close</span>
          <div style={{display:"flex",gap:6}}>
            <button className="q-btn-ghost" style={{padding:"5px 10px",fontSize:12}} onClick={onClose}>Discard</button>
            <button className="q-btn-primary" style={{padding:"5px 12px",fontSize:12}} onClick={()=>onSave(value)} disabled={!value.trim()}>Save Note</button>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Version Comparison Modal ──────────────────────────────────────────────────
function VersionCompareModal({versions,onClose}){
  const sorted=[...versions].sort((a,b)=>new Date(b.date)-new Date(a.date));
  const [aId,setAId]=useState(sorted[0]?.id||"");
  const [bId,setBId]=useState(sorted[1]?.id||"");
  const vA=versions.find(v=>v.id===aId);
  const vB=versions.find(v=>v.id===bId);
  const diffLines=(a,b)=>{
    if(!a&&!b)return[];
    const aLines=(a||"").split("\n");
    const bLines=(b||"").split("\n");
    const all=new Set([...aLines,...bLines]);
    return [...aLines.map(l=>({text:l,in:"a"})),...bLines.filter(l=>!aLines.includes(l)).map(l=>({text:l,in:"b"}))];
  };
  return(
    <>
      <div style={{position:"fixed",inset:0,background:"var(--overlay)",zIndex:1200}} onClick={onClose}/>
      <div style={{...s.modalCentered,maxWidth:720,zIndex:1201}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <h2 style={s.modalTitle}>Version Comparison</h2>
          <button className="q-btn-ghost" style={{padding:"6px 12px",fontSize:12}} onClick={onClose}>✕</button>
        </div>
        <div style={{display:"flex",gap:10,marginBottom:16}}>
          <select className="q-input" style={{flex:1,marginTop:0}} value={aId} onChange={e=>setAId(e.target.value)}>
            {sorted.map(v=><option key={v.id} value={v.id}>{v.version} — {new Date(v.date).toLocaleDateString()}</option>)}
          </select>
          <span style={{alignSelf:"center",color:"var(--txt-muted)",fontWeight:700}}>vs</span>
          <select className="q-input" style={{flex:1,marginTop:0}} value={bId} onChange={e=>setBId(e.target.value)}>
            {sorted.map(v=><option key={v.id} value={v.id}>{v.version} — {new Date(v.date).toLocaleDateString()}</option>)}
          </select>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          {[{v:vA,label:"A"},{v:vB,label:"B"}].map(({v,label})=>(
            <div key={label} style={{background:"var(--bg-input)",border:"1px solid var(--border-md)",borderRadius:8,padding:14}}>
              <div style={{fontFamily:"'Syne'",fontWeight:700,fontSize:14,color:"var(--accent-text)",marginBottom:6}}>{v?.version||"—"} <span style={{fontSize:11,color:"var(--txt-muted)",fontWeight:400}}>{v?new Date(v.date).toLocaleDateString():""}</span></div>
              <div style={{fontFamily:"'JetBrains Mono'",fontSize:12,color:"var(--txt-sub)",lineHeight:1.7,whiteSpace:"pre-wrap",minHeight:80}}>{v?.releaseNotes||<span style={{color:"var(--txt-faint)",fontStyle:"italic"}}>No release notes</span>}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

// ── Weekly Summary Generator ──────────────────────────────────────────────────
function generateWeeklySummary(projects){
  const now=new Date();
  const weekAgo=new Date(now-7*24*60*60*1000);
  const fmt=d=>new Date(d).toLocaleDateString("en-US",{month:"short",day:"numeric"});
  let md=`# Weekly Summary\n${fmt(weekAgo)} – ${fmt(now)}\n\n`;
  let totalTodos=0,totalNotes=0,totalIssues=0,totalVersions=0;
  projects.filter(p=>p.status!=="archived").forEach(p=>{
    const todos=(p.todos||[]).filter(t=>t.completed&&t.completedAt&&new Date(t.completedAt)>=weekAgo);
    const notes=(p.notes||[]).filter(n=>new Date(n.createdAt)>=weekAgo);
    const issues=(p.issues||[]).filter(i=>i.status==="fixed"&&i.fixedAt&&new Date(i.fixedAt)>=weekAgo);
    const versions=(p.versions||[]).filter(v=>new Date(v.date)>=weekAgo);
    if(!todos.length&&!notes.length&&!issues.length&&!versions.length)return;
    md+=`## ${p.name}\n`;
    if(versions.length){md+=`**Releases:** ${versions.map(v=>v.version).join(", ")}\n`;}
    if(todos.length){md+=`**Completed (${todos.length}):**\n`;todos.forEach(t=>{md+=`- ${t.text}\n`;});totalTodos+=todos.length;}
    if(issues.length){md+=`**Fixed Issues (${issues.length}):**\n`;issues.forEach(i=>{md+=`- ${i.title}\n`;});totalIssues+=issues.length;}
    if(notes.length){md+=`**Notes added:** ${notes.length}\n`;totalNotes+=notes.length;}
    md+="\n";
  });
  md+=`---\n**Totals:** ${totalTodos} todos · ${totalIssues} issues fixed · ${totalVersions} releases · ${totalNotes} notes\n`;
  return md;
}

// ── Build Size Trend Chart (SVG) ──────────────────────────────────────────────
function BuildSizeTrendChart({buildLogs}){
  const logs=[...buildLogs].filter(b=>b.buildSize&&b.builtAt)
    .sort((a,b)=>new Date(a.builtAt)-new Date(b.builtAt))
    .slice(-12);
  if(logs.length<2)return<div style={{...s.empty,padding:"20px 0"}}><p>Need at least 2 builds with size data to show trend.</p></div>;
  const sizes=logs.map(b=>{const m=b.buildSize.match(/[\d.]+/);return m?parseFloat(m[0]):0;});
  const max=Math.max(...sizes);const min=Math.min(...sizes);
  const W=420,H=120,pad=30;
  const x=i=>pad+(i/(logs.length-1))*(W-pad*2);
  const y=v=>H-pad-((v-min)/(max-min||1))*(H-pad*2);
  const path=sizes.map((v,i)=>`${i===0?"M":"L"}${x(i)},${y(v)}`).join(" ");
  return(
    <div style={{marginTop:16}}>
      <div style={{fontFamily:"'JetBrains Mono'",fontSize:10,color:"var(--txt-faint)",marginBottom:6,textTransform:"uppercase",letterSpacing:1}}>Build Size Trend</div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{overflow:"visible"}}>
        <path d={path} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round"/>
        {sizes.map((v,i)=>(
          <g key={i}>
            <circle cx={x(i)} cy={y(v)} r="4" fill="var(--accent)"/>
            <text x={x(i)} y={y(v)-8} textAnchor="middle" fontSize="9" fill="var(--txt-muted)">{logs[i].buildSize}</text>
            <text x={x(i)} y={H-4} textAnchor="middle" fontSize="8" fill="var(--txt-dim)">{new Date(logs[i].builtAt).toLocaleDateString([],{month:"numeric",day:"numeric"})}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

// ── Burndown Chart (SVG) ──────────────────────────────────────────────────────
function BurndownChart({project}){
  const todos=project.todos||[];
  const milestones=project.milestones||[];
  if(!todos.length)return null;
  // Build completion history from completedAt timestamps
  const completedWithDate=todos.filter(t=>t.completed&&t.completedAt).sort((a,b)=>new Date(a.completedAt)-new Date(b.completedAt));
  if(completedWithDate.length<2)return null;
  const start=new Date(completedWithDate[0].completedAt);
  const end=new Date(completedWithDate[completedWithDate.length-1].completedAt);
  const total=todos.length;
  // Sample 10 points across the date range
  const points=[];
  for(let i=0;i<=9;i++){
    const t=new Date(start.getTime()+(end.getTime()-start.getTime())*(i/9));
    const done=todos.filter(td=>td.completed&&td.completedAt&&new Date(td.completedAt)<=t).length;
    points.push({date:t,done,remaining:total-done});
  }
  const W=420,H=110,pad=30;
  const x=i=>pad+(i/9)*(W-pad*2);
  const y=v=>H-pad-(v/total)*(H-pad*2);
  const actualPath=points.map((p,i)=>`${i===0?"M":"L"}${x(i)},${y(p.done)}`).join(" ");
  const idealPath=`M${x(0)},${y(0)} L${x(9)},${y(total)}`;
  return(
    <div style={{marginTop:16}}>
      <div style={{fontFamily:"'JetBrains Mono'",fontSize:10,color:"var(--txt-faint)",marginBottom:6,textTransform:"uppercase",letterSpacing:1}}>Burndown — {completedWithDate.length} of {total} complete</div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{overflow:"visible"}}>
        <path d={idealPath} fill="none" stroke="var(--border-md)" strokeWidth="1" strokeDasharray="4,3"/>
        <path d={actualPath} fill="none" stroke="#4ADE80" strokeWidth="2" strokeLinejoin="round"/>
        {points.map((p,i)=><circle key={i} cx={x(i)} cy={y(p.done)} r="3" fill="#4ADE80"/>)}
        <text x={W-pad} y={pad-6} fontSize="9" fill="var(--txt-muted)" textAnchor="end">Ideal</text>
        <text x={W-pad} y={y(points[9].done)-6} fontSize="9" fill="#4ADE80" textAnchor="end">Actual</text>
      </svg>
    </div>
  );
}

function ShortcutsModal({onCancel}){
  const shortcuts=[
    {key:"Ctrl+K",        desc:"Open command palette"},
    {key:"Ctrl+J",        desc:"Quick note jot pad (current project)"},
    {key:"?",             desc:"Show this shortcuts panel"},
    {key:"F5",            desc:"Force refresh data"},
    {key:"Ctrl+Enter",    desc:"Submit open modal / post comment"},
    {key:"Escape",        desc:"Close modal or palette"},
    {key:"Ctrl+↑ / PgUp", desc:"Previous project"},
    {key:"Ctrl+↓ / PgDn", desc:"Next project"},
    {key:"Ctrl+←",        desc:"Previous tab"},
    {key:"Ctrl+→",        desc:"Next tab"},
  ];
  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
        <h2 style={s.modalTitle}>Keyboard Shortcuts</h2>
        <button className="q-btn-ghost" style={{padding:"6px 12px",fontSize:12}} onClick={onCancel}>✕ Close</button>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:4}}>
        {shortcuts.map(sc=>(
          <div key={sc.key} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 14px",background:"var(--bg-input)",borderRadius:8,gap:16}}>
            <span style={{fontSize:13,color:"var(--txt-sub)"}}>{sc.desc}</span>
            <kbd style={{fontFamily:"'JetBrains Mono'",fontSize:11,padding:"3px 8px",border:"1px solid var(--border-md)",borderRadius:5,color:"var(--accent-text)",background:"var(--bg-card)",whiteSpace:"nowrap",flexShrink:0}}>{sc.key}</kbd>
          </div>
        ))}
      </div>
      <p style={{...s.mono10,color:"var(--txt-faint)",marginTop:16,textAlign:"center"}}>Shortcuts are active when not typing in a text field</p>
    </div>
  );
}

// ── ConfirmDialog ─────────────────────────────────────────────────────────────
function ConfirmDialog({msg,onYes,onNo}){
  useEffect(()=>{const h=e=>{if(e.key==="Enter")onYes();if(e.key==="Escape")onNo();};window.addEventListener("keydown",h);return()=>window.removeEventListener("keydown",h);},[]);
  const isDelete=/delete|remove|cannot be undone/i.test(msg);
  const isRestore=/restore|unarchive/i.test(msg);
  const isArchive=/^archive/i.test(msg);
  const btnLabel=isRestore?"Restore":isArchive?"Archive":isDelete?"Delete":"Confirm";
  const btnStyle=isDelete
    ?{borderColor:"#FF4466",color:"#FF7090"}
    :isRestore
    ?{borderColor:"#4ADE80",color:"#4ADE80"}
    :isArchive
    ?{borderColor:"#FFB347",color:"#FFB347"}
    :{};
  const btnClass=isDelete?"q-btn-danger":"q-btn-ghost";
  return(
    <>
      <div style={{position:"fixed",inset:0,background:"var(--overlay)",zIndex:1100}}/>
      <div style={{position:"fixed",top:"50%",left:"50%",transform:"translate(-50%,-50%)",zIndex:1101,background:"var(--bg-modal)",border:"1px solid var(--border-md)",borderRadius:14,padding:"28px 32px",maxWidth:380,width:"90%",boxShadow:"0 8px 40px rgba(0,0,0,.3)"}}>
        <p style={{fontFamily:"'Syne'",fontSize:15,fontWeight:600,color:"var(--txt)",lineHeight:1.5,marginBottom:24}}>{msg}</p>
        <div style={{display:"flex",justifyContent:"flex-end",gap:10}}>
          <button className="q-btn-ghost" onClick={onNo} autoFocus>Cancel</button>
          <button className={btnClass} style={btnStyle} onClick={onYes}>{btnLabel}</button>
        </div>
      </div>
    </>
  );
}
function Toast({msg,type}){const c={ok:{bg:"var(--toast-ok-bg)",border:"#4ADE80",text:"#4ADE80",icon:"✓"},err:{bg:"var(--toast-err-bg)",border:"#FF4466",text:"#FF7090",icon:"✕"},info:{bg:"var(--toast-info-bg)",border:"var(--accent)",text:"var(--accent)",icon:"ℹ"}}[type]||{bg:"var(--toast-ok-bg)",border:"#4ADE80",text:"#4ADE80",icon:"✓"};return<div style={{position:"fixed",bottom:24,right:24,zIndex:9999,background:c.bg,border:`1px solid ${c.border}`,color:c.text,padding:"10px 18px",borderRadius:9,fontSize:13,maxWidth:320,fontFamily:"'Syne'",fontWeight:600,boxShadow:"0 4px 24px rgba(0,0,0,.3)",lineHeight:1.5}}>{c.icon} {msg}</div>;}
function Splash({msg}){return<div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:"var(--bg)",overflow:"hidden"}}><span style={{color:"#00D4FF",fontFamily:"'Syne',sans-serif",fontSize:16,fontWeight:700,letterSpacing:.5}}>{msg}</span></div>;}

// ── CSS ───────────────────────────────────────────────────────────────────────
const css=`
  @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=JetBrains+Mono:wght@300;400;500;700&display=swap');
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}

  /* ── Android IME / Swype fix ──────────────────────────────────────────────────
     CRITICAL: Do NOT set user-select:none on html/body/root.
     Android's IME compositor checks the root node's selectability before
     enabling gesture typing (Swype). A global none blocks it even when
     inputs override it. Instead we apply none only to specific UI elements. */
  html,body,#root{
    -webkit-tap-highlight-color:transparent;
  }
  .q-loading-screen{overflow:hidden;height:100vh;}

  /* Inputs must be fully editable — no overrides, no !important battles */
  input,textarea,select{
    outline:none;
    -webkit-user-select:text;
    user-select:text;
    touch-action:manipulation;
  }

  /* Block selection only on interactive chrome, not the whole document */
  button,nav,.q-nav,.q-tab,.q-chip,.q-check,.q-del,
  .q-tab-bar,.q-btn-ghost,.q-btn-primary,.q-btn-danger,.q-btn-new{
    -webkit-user-select:none;
    user-select:none;
  }

  /* Milestone/date input — make calendar icon visible in dark mode */
  input[type="date"]::-webkit-calendar-picker-indicator{
    filter: invert(0.6) sepia(1) saturate(5) hue-rotate(175deg) brightness(1.2);
    cursor:pointer;
    opacity:0.8;
  }
  @keyframes q-spin{from{transform:rotate(0deg);}to{transform:rotate(360deg);}}
  ::-webkit-scrollbar{width:4px;height:4px;}::-webkit-scrollbar-track{background:var(--bg,#0A0E1A);}::-webkit-scrollbar-thumb{background:var(--scrollbar,#1E2540);border-radius:2px;}
  button{cursor:pointer;border:none;background:none;font-family:'Syne',sans-serif;}a{text-decoration:none;}
  audio{accent-color:#00D4FF;}

  /* Tab bar with scroll arrows */
  /* Update download progress bar animation */
  @keyframes qoder-progress {
    0%{width:5%;margin-left:0}
    50%{width:40%;margin-left:30%}
    100%{width:5%;margin-left:95%}
  }
  .q-tab-bar-wrap{position:relative;margin-bottom:22px;}
  .q-tab-bar{display:flex;border-bottom:1px solid var(--border);overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none;}
  .q-tab-bar::-webkit-scrollbar{display:none;}
  .q-tab-arrow{position:absolute;top:0;bottom:1px;width:30px;display:flex;align-items:center;justify-content:center;border:none;cursor:pointer;font-size:14px;z-index:2;transition:all .15s;}
  .q-tab-arrow:hover{color:var(--accent-text);}
  .q-tab-arrow-left{left:0;color:var(--txt-muted);background:linear-gradient(to right,var(--bg) 55%,transparent);}
  .q-tab-arrow-right{right:0;color:var(--txt-muted);background:linear-gradient(to left,var(--bg) 55%,transparent);}

  .q-nav{display:flex;align-items:center;padding:8px 14px;color:var(--txt-muted);font-family:'Syne',sans-serif;font-weight:500;width:calc(100% - 16px);margin:1px 8px;border-radius:7px;cursor:pointer;transition:all .15s;font-size:14px;}
  .q-nav:hover{background:var(--accent-dim);color:var(--txt);}
  .q-group-del{opacity:0!important;transition:opacity .15s;}
  div:hover>.q-group-del,.q-group-del:hover{opacity:1!important;}
  .q-nav-active{background:var(--accent-dim)!important;color:var(--accent-text)!important;}
  .q-folder-btn{margin-left:4px;opacity:0;transition:opacity .15s;padding:3px 4px;border-radius:4px;flex-shrink:0;display:flex;align-items:center;background:none;border:none;cursor:pointer;}
  .q-nav:hover .q-folder-btn,.q-nav-active .q-folder-btn{opacity:1;}

  .q-proj-link{display:inline-flex;align-items:center;gap:5px;padding:4px 10px;background:var(--accent-dim);border:1px solid var(--accent-border);border-radius:6px;color:var(--accent-text);font-size:12px;font-family:'Syne';font-weight:600;transition:all .15s;}
  .q-proj-link:hover{background:rgba(0,212,255,.12);border-color:rgba(0,212,255,.35);}

  .q-btn-primary{padding:9px 18px;background:var(--accent);color:#06090F;border-radius:8px;font-size:14px;font-weight:700;font-family:'Syne',sans-serif;transition:opacity .15s;}.q-btn-primary:hover{opacity:.88;}
  .q-btn-ghost{padding:9px 14px;border:1px solid var(--border-md);box-shadow:var(--shadow);border-radius:8px;color:var(--txt-muted);font-size:14px;font-family:'Syne',sans-serif;background:transparent;transition:all .15s;}.q-btn-ghost:hover{border-color:var(--txt-dim);color:var(--txt);}
  .q-btn-danger{padding:9px 14px;border:1px solid var(--border-md);border-radius:8px;color:var(--txt-muted);font-size:14px;font-family:'Syne',sans-serif;background:transparent;transition:all .15s;}.q-btn-danger:hover{border-color:#FF4466;color:#FF4466;}
  .q-btn-new{width:100%;padding:10px;background:var(--accent-dim);border:1px solid var(--accent-border);border-radius:8px;color:var(--accent-text);font-size:14px;font-weight:600;font-family:'Syne',sans-serif;transition:all .15s;}.q-btn-new:hover{background:rgba(0,212,255,.14);border-color:rgba(0,212,255,.35);}
  .q-sign-out{color:var(--txt-faint);font-size:16px;padding:7px 10px;border:1px solid var(--border);border-radius:8px;transition:all .15s;}.q-sign-out:hover{color:#FF6B9D;border-color:#FF4466;}
  .q-icon-btn{color:var(--txt-sub);font-size:14px;padding:7px 10px;border:1px solid var(--border);border-radius:8px;transition:all .15s;font-family:'Syne';font-weight:600;}.q-icon-btn:hover{color:#E8EAF6;border-color:#2E3560;background:rgba(255,255,255,.03);}
  .q-input{width:100%;background:var(--bg-input);border:1px solid var(--border-md);border-radius:8px;padding:10px 13px;color:var(--txt);font-size:14px;font-family:'Syne',sans-serif;transition:border-color .15s;margin-top:6px;}.q-input:focus{border-color:var(--accent);}
  .q-mono{font-family:'JetBrains Mono',monospace!important;}
  .q-chip{padding:5px 11px;background:var(--bg-card);border:1px solid var(--border-md);border-radius:20px;color:var(--txt-muted);font-size:12px;font-family:'Syne',sans-serif;transition:all .15s;}.q-chip:hover{border-color:var(--accent-border);color:var(--txt);}.q-chip-on{background:var(--accent-dim)!important;border-color:var(--accent)!important;color:var(--accent-text)!important;}
  .q-card{background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:20px;cursor:pointer;transition:border-color .18s,background .18s;}.q-card:hover{border-color:var(--accent-border);background:var(--bg-card-hover);}
  .q-ver-card{background:var(--bg-card);border:1px solid var(--border);border-radius:10px;padding:18px 20px;transition:border-color .2s;}.q-ver-card:hover{border-color:var(--accent-border);}
  .q-ms-row{display:flex;align-items:flex-start;gap:12px;padding:10px 8px;border-radius:8px;transition:background .15s;}.q-ms-row:hover{background:rgba(0,0,0,.04);}
  .q-check{width:22px;height:22px;min-width:22px;border:2px solid #2A3050;border-radius:5px;display:flex;align-items:center;justify-content:center;font-size:12px;color:#4ADE80;margin-top:1px;transition:all .15s;flex-shrink:0;}.q-check:hover{border-color:#4ADE80;}.q-check-done{background:rgba(74,222,128,.1);border-color:#4ADE80;}
  .q-del{color:#3A3F58;font-size:13px;padding:3px 5px;transition:color .15s;flex-shrink:0;}.q-del:hover{color:#FF4466;}
  .q-tab{padding:10px 18px;color:var(--txt-muted);font-size:13px;font-weight:500;font-family:'Syne',sans-serif;border-bottom:2px solid transparent;border-top:none;border-left:none;border-right:none;background:none;margin-bottom:-1px;display:inline-flex;align-items:center;gap:5px;transition:all .15s;white-space:nowrap;}.q-tab:hover{color:var(--txt);}.q-tab-on{color:var(--accent-text)!important;border-bottom-color:var(--accent)!important;}
  .q-modal-submit{}
`;

const s={
  root:{display:"flex",minHeight:"100vh",background:"var(--bg)",fontFamily:"'Syne',sans-serif",color:"var(--txt)"},
  sidebar:{background:"var(--bg-side)",borderRight:"1px solid var(--border-lg)",display:"flex",flexDirection:"column",top:0,height:"100vh",overflowY:"auto",position:"relative",flexShrink:0},
  logo:{padding:"20px 16px 16px",borderBottom:"1px solid var(--border-lg)",display:"flex",alignItems:"baseline",gap:3,marginBottom:8},
  logoQ:{fontFamily:"'Syne'",fontSize:26,fontWeight:800,color:"var(--accent)",lineHeight:1},
  logoText:{fontFamily:"'Syne'",fontSize:20,fontWeight:700,color:"var(--txt)",letterSpacing:"-.5px"},
  logoBeta:{fontFamily:"'JetBrains Mono'",fontSize:9,color:"var(--txt-dim)",marginLeft:4,letterSpacing:1.5,fontWeight:700},
  closeSidebar:{marginLeft:"auto",color:"var(--txt-faint)",fontSize:16,padding:"0 4px",background:"none",border:"none",cursor:"pointer"},
  nav:{flex:1,padding:"4px 0",overflowY:"auto"},
  navSection:{fontSize:11,fontWeight:700,letterSpacing:"1.5px",color:"var(--txt-dim)",padding:"14px 20px 5px",textTransform:"uppercase"},
  sidebarFoot:{padding:14,borderTop:"1px solid var(--border-lg)"},
  userRow:{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:10,gap:4},
  userEmail:{fontFamily:"'JetBrains Mono'",fontSize:10,color:"var(--txt-ghost)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1},
  mobileOverlay:{position:"fixed",inset:0,background:"rgba(0,0,0,.55)",zIndex:199},
  mobileHeader:{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 16px",background:"var(--bg-side)",borderBottom:"1px solid var(--border-lg)",position:"sticky",top:0,zIndex:10,width:"100%",boxSizing:"border-box"},
  hamburger:{fontSize:20,color:"var(--txt-sub)",padding:"0 6px",width:32,background:"none",border:"none",cursor:"pointer"},
  main:{flex:1,overflowY:"auto",maxHeight:"100vh",minWidth:0},
  page:{padding:"32px 40px"},
  pageHead:{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:26},
  pageTitle:{fontFamily:"'Syne'",fontSize:28,fontWeight:800,color:"var(--txt)",letterSpacing:"-.5px"},
  pageSub:{color:"var(--txt-sub)",fontSize:14,marginTop:3},
  projHead:{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:16},
  statsGrid:{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:14},
  statCard:{background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:10,padding:"14px 16px"},
  statVal:{fontFamily:"'JetBrains Mono'",fontSize:28,fontWeight:700,lineHeight:1},
  statLbl:{color:"var(--txt-muted)",fontSize:12,marginTop:5,fontWeight:500,letterSpacing:".3px"},
  grid:{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:13},
  empty:{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:14,padding:"48px 20px",color:"var(--txt-muted)",fontSize:15},
  emptyIcon:{fontSize:44,opacity:.18},
  badge:{fontSize:11,fontWeight:600,padding:"3px 8px",borderRadius:4,fontFamily:"'JetBrains Mono'",letterSpacing:".3px"},
  mono12:{fontFamily:"'JetBrains Mono'",fontSize:12,color:"var(--txt-muted)"},
  mono10:{fontFamily:"'JetBrains Mono'",fontSize:11,color:"var(--txt-muted)"},
  techChip:{fontSize:11,padding:"3px 7px",background:"var(--accent-dim)",border:"1px solid var(--accent-border)",borderRadius:4,color:"var(--accent-text)",fontFamily:"'JetBrains Mono'"},
  bar:{flex:1,height:4,background:"var(--border)",borderRadius:2,overflow:"hidden"},
  barFill:{height:4,background:"linear-gradient(90deg,var(--accent),#4ADE80)",borderRadius:2},
  cardTitle:{fontFamily:"'Syne'",fontSize:16,fontWeight:700,marginBottom:6,color:"var(--txt)"},
  cardDesc:{fontSize:14,color:"var(--txt-sub)",lineHeight:1.5,marginBottom:12,display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden"},
  tabPill:{fontSize:10,background:"var(--accent-dim)",color:"var(--accent-text)",padding:"1px 6px",borderRadius:10,fontFamily:"'JetBrains Mono'"},
  tabBar:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16},
  infoCard:{background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:10,padding:"15px 17px"},
  infoLbl:{fontSize:11,color:"var(--txt-muted)",fontWeight:700,letterSpacing:".8px",textTransform:"uppercase"},
  fileLink:{fontFamily:"'JetBrains Mono'",fontSize:12,color:"var(--accent-text)",background:"var(--accent-dim)",border:"1px solid var(--accent-border)",borderRadius:4,padding:"4px 8px",display:"inline-block"},
  overlayBackdrop:{position:"fixed",inset:0,background:"var(--overlay)",zIndex:1000},
  modalCentered:{position:"fixed",top:"50%",left:"50%",transform:"translate(-50%,-50%)",zIndex:1001,background:"var(--bg-modal)",border:"1px solid var(--border-md)",borderRadius:14,padding:26,width:"90%",maxWidth:560,maxHeight:"90vh",overflowY:"auto",boxShadow:"0 8px 48px rgba(0,0,0,.25)"},
  modalTitle:{fontFamily:"'Syne'",fontSize:20,fontWeight:700,marginBottom:18,color:"var(--txt)"},
  fieldLbl:{display:"block",fontSize:11,fontWeight:700,color:"var(--txt-muted)",letterSpacing:".7px",textTransform:"uppercase",marginBottom:0},
  authWrap:{display:"flex",alignItems:"center",justifyContent:"center",minHeight:"100vh",background:"#0A0E1A",padding:20},
  authBox:{width:"100%",maxWidth:420,background:"#0F1525",border:"1px solid #1E2540",borderRadius:16,padding:30,boxShadow:"0 8px 40px rgba(0,0,0,.5)"},
};