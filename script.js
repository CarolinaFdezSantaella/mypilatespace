(() => {
  // ---------- UTILIDADES ----------
  const $ = (sel, ctx=document) => ctx.querySelector(sel);
  const $$ = (sel, ctx=document) => Array.from(ctx.querySelectorAll(sel));
  const fmtDate = (d) => new Date(d).toLocaleDateString(undefined, { day:"2-digit", month:"short" });
  const clamp = (n,min,max)=>Math.min(max,Math.max(min,n));
  const escapeHtml = (s)=> s.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const store = {
    get(){ try{ return JSON.parse(localStorage.getItem("psuave-data")||"{}"); }catch{ return {}; } },
    set(v){ localStorage.setItem("psuave-data", JSON.stringify(v)); }
  };
  const toast = (msg)=>{
    const t = document.createElement("div");
    t.textContent = msg; t.style.position="fixed"; t.style.bottom="16px"; t.style.right="16px";
    t.style.background="#00000080"; t.style.color="#fff"; t.style.padding="8px 12px"; t.style.borderRadius="12px";
    t.style.zIndex="9999"; document.body.appendChild(t); setTimeout(()=>t.remove(), 1800);
  };
  const cryptoId = ()=> (crypto.randomUUID?.() || Math.random().toString(36).slice(2));
  const getCSS = (v)=> getComputedStyle(document.body).getPropertyValue(v).trim();

  // ---------- ESTADO ----------
  const state = {
    level: "Principiante",
    routine: null,
    flow: { stepIndex: 0, playing:false, left:0, timer:null },
    logs: [],
    favs: [],
    theme: "light"
  };
  Object.assign(state, { ...state, ...store.get() });
  state.logs ??= []; state.favs ??= [];

  // ---------- NAVEGACIÓN ----------
  const views = $$(".view");
  $$(".nav-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const route = btn.dataset.route;
      views.forEach(v => v.classList.toggle("active", v.dataset.view === route));
      $$(".nav-btn").forEach(b => b.removeAttribute("aria-current"));
      btn.setAttribute("aria-current","page");
      if(route === "progreso"){ drawCharts(); renderLog(); renderFavs(); }
      if(route === "centros"){ fetchCentersIfNeeded(); }
      if(route === "comunidad"){ loadPosts(); }
      save();
    });
  });

  // ---------- TEMA ----------
  const themeToggle = $("#themeToggle");
  if(state.theme === "dark") document.body.classList.add("dark");
  themeToggle.setAttribute("aria-pressed", document.body.classList.contains("dark"));
  themeToggle.addEventListener("click", () => {
    document.body.classList.toggle("dark");
    themeToggle.setAttribute("aria-pressed", document.body.classList.contains("dark"));
    state.theme = document.body.classList.contains("dark") ? "dark" : "light";
    save();
  });

  // ---------- RUTINAS ----------
  const LIB = {
    Principiante: [
      { name:"Respiración lateral + imprint", secs:60 },
      { name:"Pelvic curl", secs:90 },
      { name:"Spine twist supino", secs:60 },
      { name:"Cat-Cow suave", secs:60 },
      { name:"Puente de hombros", secs:90 }
    ],
    Intermedio: [
      { name:"Hundred (mod.)", secs:90 },
      { name:"Roll up (asistencia)", secs:90 },
      { name:"Leg circles", secs:120 },
      { name:"Side kicks", secs:120 },
      { name:"Swan prep", secs:90 }
    ],
    Avanzado: [
      { name:"Teaser prep", secs:120 },
      { name:"Shoulder bridge", secs:120 },
      { name:"Single leg stretch", secs:90 },
      { name:"Double leg stretch", secs:90 },
      { name:"Swimming", secs:120 }
    ]
  };

  const routineBox = $("#routineBox");
  const flowSteps = $("#flow-steps");
  const flowTitle = $("#flow-title");
  const flowLevel = $("#flow-level");
  const flowDur = $("#flow-duration");
  const stepTimer = $("#stepTimer");
  const btnStart = $("#startFlow");
  const btnSaveRoutine = $("#saveRoutine");
  const btnPrev = $("#prevStep");
  const btnPlay = $("#playPause");
  const btnNext = $("#nextStep");

  function genRoutine(level){
    const lib = LIB[level] || LIB.Principiante;
    const total = Math.round(lib.reduce((a,s)=>a+s.secs,0)/60);
    state.level = level;
    state.routine = { level, total, steps: lib.map((s,i)=>({ ...s, id:i })) };
    renderRoutine();
    save();
  }
  function renderRoutine(){
    const r = state.routine || genRoutine(state.level);
    routineBox.innerHTML = "";
    r.steps.forEach(s => {
      const row = document.createElement("div");
      row.className = "routine-item";
      row.innerHTML = `<span>${s.name}</span><span class="badge">${Math.round(s.secs/60)} min</span>`;
      routineBox.appendChild(row);
    });
    flowTitle.textContent = `Sesión — ${r.level}`;
    flowLevel.textContent = r.level;
    flowDur.textContent = `${r.total} min aprox`;

    flowSteps.innerHTML = "";
    r.steps.forEach((s,idx)=>{
      const el = document.createElement("div");
      el.className = "flow-step" + (idx===0 ? " active":"");
      el.dataset.idx = idx;
      el.innerHTML = `<span>🪷</span><div>
        <div><strong>${s.name}</strong></div>
        <small class="muted">Respira: 4-4 • Control • Centro activo</small>
      </div><span>${Math.round(s.secs/60)} min</span>`;
      flowSteps.appendChild(el);
    });
    state.flow.stepIndex = 0; state.flow.left = r.steps[0].secs; updateFlowButtons();
  }
  $$(".pill").forEach(p => p.addEventListener("click", () => genRoutine(p.dataset.lvl)));
  btnSaveRoutine.addEventListener("click", () => {
    if(!state.routine) genRoutine(state.level);
    if(!state.favs.some(f => f.level === state.routine.level)){
      state.favs.push({ ...state.routine, savedAt: Date.now() });
      toast("Rutina guardada en Favoritas");
      renderFavs(); save();
    } else toast("Esa rutina ya está en Favoritas");
  });
  btnStart.addEventListener("click", () => {
    if(!state.routine) genRoutine(state.level);
    btnPlay.removeAttribute("disabled"); btnNext.removeAttribute("disabled");
    toast("Sesión lista. Pulsa ▶️ para comenzar.");
  });
  btnPlay.addEventListener("click", () => { if(state.flow.playing){ pause(); } else { play(); } });
  btnPrev.addEventListener("click", () => goStep(-1));
  btnNext.addEventListener("click", () => goStep(1));
  function play(){ const r = state.routine; if(!r) return; state.flow.playing = true; btnPlay.textContent = "⏸️ Pausar"; tick(); state.flow.timer = setInterval(tick, 1000); }
  function pause(){ state.flow.playing = false; btnPlay.textContent = "▶️ Reanudar"; clearInterval(state.flow.timer); }
  function tick(){ const r = state.routine; if(!r) return; state.flow.left = clamp(state.flow.left-1,0,86400); stepTimer.textContent = formatTime(state.flow.left); if(state.flow.left===0){ pause(); goStep(1, true); } }
  function goStep(dir, auto=false){ const r = state.routine; if(!r) return; const i = clamp(state.flow.stepIndex + dir, 0, r.steps.length-1); state.flow.stepIndex = i; state.flow.left = r.steps[i].secs; $$(".flow-step").forEach((el,idx)=> el.classList.toggle("active", idx===i)); updateFlowButtons(); if(auto) play(); }
  function updateFlowButtons(){ const r = state.routine; btnPrev.disabled = state.flow.stepIndex===0; btnNext.disabled = !r || state.flow.stepIndex===r.steps.length-1; }
  function formatTime(s){ const m = Math.floor(s/60), ss = s%60; return `${String(m).padStart(2,"0")}:${String(ss).padStart(2,"0")}`; }

  // ---------- PROGRESO ----------
  const logForm = $("#logForm");
  const logList = $("#logList");
  const totalMonth = $("#totalMonth");
  const weekCount = $("#weekCount");
  const streakEl = $("#streak");
  const favList = $("#favList");
  $("#logDate").value = new Date().toISOString().slice(0,10);

  logForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const entry = {
      id: cryptoId(),
      date: $("#logDate").value,
      minutes: Number($("#logMinutes").value),
      intensity: $("#logIntensity").value,
      mood: $("#logMood").value,
      notes: $("#logNotes").value.trim()
    };
    state.logs.push(entry);
    save(); renderLog(); drawCharts();
    logForm.reset(); $("#logDate").value = new Date().toISOString().slice(0,10);
  });

  function renderLog(){
    logList.innerHTML = "";
    const sorted = [...state.logs].sort((a,b)=> b.date.localeCompare(a.date));
    if(sorted.length === 0){ logList.innerHTML = `<li class="muted">Aún no hay registros. Añade tu primera sesión arriba.</li>`; updateCounters(); return; }
    sorted.forEach(e => {
      const li = document.createElement("li");
      li.className = "log-item";
      li.innerHTML = `
        <span>🪷</span>
        <div>
          <div><strong>${fmtDate(e.date)}</strong> — ${e.minutes} min • <span class="tag">${e.intensity}</span> • <span class="tag">${e.mood}</span></div>
          ${e.notes ? `<small class="muted">${escapeHtml(e.notes)}</small>` : ``}
        </div>
        <div class="item-actions">
          <button class="icon-btn" title="Duplicar">📝</button>
          <button class="icon-btn" title="Eliminar">🗑️</button>
        </div>
      `;
      const [btnDup, btnDel] = li.querySelectorAll(".icon-btn");
      btnDup.addEventListener("click", () => { state.logs.push({ ...e, id: cryptoId(), date: new Date().toISOString().slice(0,10) }); save(); renderLog(); drawCharts(); });
      btnDel.addEventListener("click", () => { state.logs = state.logs.filter(x => x.id !== e.id); save(); renderLog(); drawCharts(); });
      logList.appendChild(li);
    });
    updateCounters();
  }
  function updateCounters(){
    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
    const total = state.logs.filter(l => l.date.startsWith(ym)).reduce((a,l)=>a+l.minutes,0);
    totalMonth.textContent = total;

    const today = new Date(); today.setHours(0,0,0,0);
    const firstDow = (d) => { const c = new Date(d); const day=(c.getDay()+6)%7; c.setDate(c.getDate()-day); c.setHours(0,0,0,0); return c; };
    const startWeek = firstDow(today);
    const week = state.logs.filter(l => { const ld = new Date(l.date); ld.setHours(0,0,0,0); return ld >= startWeek && ld <= today; });
    weekCount.textContent = week.length;

    const dates = new Set(state.logs.map(l => l.date));
    let streak = 0; let cur = new Date(); cur.setHours(0,0,0,0);
    while(dates.has(cur.toISOString().slice(0,10))){ streak++; cur.setDate(cur.getDate()-1); }
    streakEl.textContent = streak;
  }
  function renderFavs(){
    favList.innerHTML = "";
    if(state.favs.length === 0){ favList.innerHTML = `<li class="muted">Aún no guardaste rutinas favoritas.</li>`; return; }
    state.favs.forEach((f,idx)=>{
      const li = document.createElement("li");
      li.className = "log-item";
      li.innerHTML = `
        <span>⭐</span>
        <div>
          <div><strong>${f.level}</strong> — ${f.total} min</div>
          <small class="muted">${f.steps.map(s=>s.name).join(" · ")}</small>
        </div>
        <div class="item-actions">
          <button class="icon-btn" title="Usar ahora">▶️</button>
          <button class="icon-btn" title="Eliminar">🗑️</button>
        </div>
      `;
      const [useBtn, delBtn] = li.querySelectorAll(".icon-btn");
      useBtn.addEventListener("click", () => { state.level = f.level; state.routine = JSON.parse(JSON.stringify(f)); renderRoutine(); document.querySelector('[data-route="home"]').click(); toast("Rutina cargada"); });
      delBtn.addEventListener("click", () => { state.favs.splice(idx,1); save(); renderFavs(); });
      favList.appendChild(li);
    });
  }

  function drawCharts(){
    const cvs = $("#minutesChart"); const ctx = cvs.getContext("2d");
    const w = cvs.width, h = cvs.height; ctx.clearRect(0,0,w,h);
    ctx.fillStyle = getCSS("--card"); ctx.fillRect(0,0,w,h);
    const days = [...Array(7)].map((_,i)=>{ const d = new Date(); d.setDate(d.getDate()- (6-i)); return d; });
    const map = days.map(d=>{
      const key = d.toISOString().slice(0,10);
      const sum = state.logs.filter(l => l.date===key).reduce((a,l)=>a+l.minutes,0);
      return { d, sum };
    });
    ctx.strokeStyle = "#e9dfea"; ctx.beginPath(); ctx.moveTo(50,20); ctx.lineTo(50,h-40); ctx.lineTo(w-20,h-40); ctx.stroke();
    const max = Math.max(30, ...map.map(m=>m.sum));
    const bw = Math.min(70, (w-100)/7);
    map.forEach((m,i)=>{
      const x = 60 + i*(bw+14);
      const bh = Math.round((h-80) * (m.sum/max));
      const y = (h-40) - bh;
      const grd = ctx.createLinearGradient(0,y,0,y+bh);
      grd.addColorStop(0, "#eebfd1"); grd.addColorStop(1, "#dccdf1");
      ctx.fillStyle = grd; ctx.fillRect(x,y,bw,bh);
      ctx.fillStyle = "#6a4c68"; ctx.textAlign="center"; ctx.fillText(String(m.sum||0), x+bw/2, y-6);
      ctx.fillStyle = "#8e7a86"; ctx.fillText(`${m.d.getDate()}/${m.d.getMonth()+1}`, x+bw/2, h-20);
    });
    updateCounters();
  }

  // ---------- API EXTERNA: Overpass (OpenStreetMap) ----------
  const centrosGrid = $("#centrosGrid");
  const centersStatus = $("#centersStatus");
  const centerSearch = $("#centerSearch");
  let centersCache = null; // cache en memoria

  async function fetchCentersIfNeeded(){
    if(centersCache){ renderCenters(); return; }
    centersStatus.textContent = "Cargando centros desde OpenStreetMap…";
    try{
      // Área administrativa de Madrid por nombre y todos los POIs con amenity/fitness, sport/pilates o name~=Pilates
      const overpassQL = `
        [out:json][timeout:25];
        area["name"="Madrid"]["boundary"="administrative"]->.madrid;
        (
          node(area.madrid)["name"~"(?i)pilates"];
          way(area.madrid)["name"~"(?i)pilates"];
          node(area.madrid)["sport"="pilates"];
          way(area.madrid)["sport"="pilates"];
          node(area.madrid)["leisure"="fitness_centre"]["name"~"(?i)pilates"];
          way(area.madrid)["leisure"="fitness_centre"]["name"~"(?i)pilates"];
        );
        out center tags;
      `;
      const resp = await fetch("https://overpass-api.de/api/interpreter", {
        method: "POST",
        headers: { "Content-Type":"application/x-www-form-urlencoded;charset=UTF-8" },
        body: "data=" + encodeURIComponent(overpassQL)
      });
      if(!resp.ok) throw new Error("Error Overpass: " + resp.status);
      const data = await resp.json();
      centersCache = (data.elements||[])
        .map(e => ({
          id: e.id,
          name: e.tags?.name || "Centro de Pilates",
          barrio: e.tags?.addr:neighbourhood || e.tags?.addr:suburb || e.tags?.addr:district || "Madrid",
          website: e.tags?.website || e.tags?.contact:website || "",
          mapUrl: `https://www.openstreetmap.org/${e.type}/${e.id}`
        }))
        // limpiar claves con ":" que dan conflicto con acceso punto
        .map(c => ({
          ...c,
          barrio: (e => {
            // re-eval porque arriba usamos propiedades con ":"; rehacemos con 'tags' en una sola pasada
            return c.barrio; // placeholder, se ajusta abajo en normalize
          })
        }));
      // normalizar bien barrio (segunda pasada)
      centersCache = (data.elements||[]).map(e => {
        const tags = e.tags || {};
        const barrio = tags["addr:neighbourhood"] || tags["addr:suburb"] || tags["addr:district"] || tags["is_in:district"] || "Madrid";
        const website = tags["website"] || tags["contact:website"] || "";
        return {
          id: e.id,
          name: tags.name || "Centro de Pilates",
          barrio,
          website,
          mapUrl: `https://www.openstreetmap.org/${e.type}/${e.id}`
        };
      });
      renderCenters();
      centersStatus.textContent = centersCache.length ? `Encontrados ${centersCache.length} centros.` : "No se encontraron centros.";
    }catch(err){
      console.error(err);
      centersStatus.textContent = "No se pudieron cargar los centros (intenta más tarde).";
      centrosGrid.innerHTML = "";
    }
  }

  function renderCenters(){
    const q = (centerSearch.value||"").toLowerCase();
    const list = centersCache.filter(c =>
      !q || c.name.toLowerCase().includes(q) || (c.barrio||"").toLowerCase().includes(q)
    );
    centrosGrid.innerHTML = "";
    list.forEach(c => {
      const card = document.createElement("div");
      card.className = "center-card";
      const hasWeb = !!c.website;
      card.innerHTML = `
        <strong>${escapeHtml(c.name)}</strong>
        <small>${escapeHtml(c.barrio || "Madrid")}</small>
        <a class="center-link" target="_blank" rel="noopener" href="${c.mapUrl}">Ver en mapa ↗</a>
        ${hasWeb ? `<a class="center-link" target="_blank" rel="noopener" href="${c.website}">Web oficial ↗</a>` : `<small class="muted">Sin web oficial</small>`}
      `;
      centrosGrid.appendChild(card);
    });
    if(list.length === 0){
      centrosGrid.innerHTML = `<div class="muted">No se encontraron centros para “${escapeHtml(centerSearch.value)}”.</div>`;
    }
  }
  centerSearch.addEventListener("input", ()=> centersCache && renderCenters());

  // ---------- API PROPIA (json-server) ----------
  // Endpoints: http://localhost:5173/posts
  const API_BASE = "http://localhost:5173";
  const postsList = $("#postsList");
  const postForm = $("#postForm");

  async function loadPosts(){
    postsList.innerHTML = `<li class="muted">Cargando publicaciones…</li>`;
    try{
      const r = await fetch(`${API_BASE}/posts?_sort=createdAt&_order=desc`);
      if(!r.ok) throw new Error(r.status);
      const items = await r.json();
      renderPosts(items);
    }catch(err){
      console.warn("API propia no disponible. ¿Ejecutaste json-server?", err);
      postsList.innerHTML = `<li class="muted">No se pudo conectar con tu API propia. Ejecuta <code>json-server --watch db.json --port 5173</code>.</li>`;
    }
  }

  function renderPosts(items){
    postsList.innerHTML = "";
    if(!items.length){
      postsList.innerHTML = `<li class="muted">Aún no hay publicaciones. ¡Sé la primera! 🌸</li>`;
      return;
    }
    items.forEach(p => {
      const li = document.createElement("li");
      li.className = "log-item";
      li.innerHTML = `
        <span>💗</span>
        <div>
          <div><strong>${escapeHtml(p.title)}</strong> — <span class="tag">${escapeHtml(p.tag)}</span> ${p.rating?`• ★ ${p.rating}`:""}</div>
          <small class="muted">por ${escapeHtml(p.author)} — ${new Date(p.createdAt).toLocaleString()}</small>
          <div class="muted">${escapeHtml(p.text)}</div>
          ${p.link ? `<a class="center-link" target="_blank" rel="noopener" href="${p.link}">Enlace ↗</a>` : ``}
        </div>
        <div class="item-actions">
          <button class="icon-btn" data-id="${p.id}" title="Eliminar">🗑️</button>
        </div>
      `;
      li.querySelector(".icon-btn").addEventListener("click", async () => {
        try{
          const rr = await fetch(`${API_BASE}/posts/${p.id}`, { method:"DELETE" });
          if(!rr.ok) throw new Error(rr.status);
          toast("Publicación eliminada");
          loadPosts();
        }catch(err){ alert("No se pudo eliminar: "+ err.message); }
      });
      postsList.appendChild(li);
    });
  }

  postForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = {
      author: $("#postAuthor").value.trim(),
      title: $("#postTitle").value.trim(),
      tag: $("#postTag").value,
      link: $("#postLink").value.trim(),
      rating: $("#postRating").value ? Number($("#postRating").value) : null,
      text: $("#postText").value.trim(),
      createdAt: Date.now()
    };
    if(!payload.author || !payload.title || !payload.tag || !payload.text){
      alert("Rellena los campos obligatorios."); return;
    }
    try{
      const r = await fetch(`${API_BASE}/posts`, {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify(payload)
      });
      if(!r.ok) throw new Error("Error al publicar");
      toast("Publicado en tu API ✨");
      postForm.reset();
      loadPosts();
    }catch(err){
      alert("No se pudo publicar. ¿Está json-server en marcha? " + err.message);
    }
  });

  // ---------- EXPORTAR / IMPORTAR ----------
  $("#exportData").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify({ logs: state.logs, favs: state.favs }, null, 2)], { type:"application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "pilates-suave-datos.json"; a.click();
    URL.revokeObjectURL(url);
  });
  $("#importData").addEventListener("change", async (e) => {
    const file = e.target.files?.[0]; if(!file) return;
    try{
      const text = await file.text();
      const data = JSON.parse(text);
      if(!data || (typeof data!=="object")) throw new Error("Formato inválido");
      state.logs = Array.isArray(data.logs) ? data.logs : state.logs;
      state.favs = Array.isArray(data.favs) ? data.favs : state.favs;
      save(); renderLog(); renderFavs(); drawCharts();
      toast("Datos importados correctamente");
      e.target.value = "";
    }catch(err){ alert("No se pudo importar: " + err.message); }
  });

  // ---------- HELPERS ----------
  function save(){ store.set({ level:state.level, routine:state.routine, logs:state.logs, favs:state.favs, theme:state.theme }); }

  // ---------- ARRANQUE ----------
  if(!state.routine){ genRoutine(state.level); } else { renderRoutine(); }
  renderFavs(); renderLog(); drawCharts();
  // Pre-carga silenciosa de centros (opcional: espera a navegar a la vista)
  // fetchCentersIfNeeded();
})();

