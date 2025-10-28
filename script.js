(() => {
  // ---------- UTILIDADES ----------
  const $ = (sel, ctx=document) => ctx.querySelector(sel);
  const $$ = (sel, ctx=document) => Array.from(ctx.querySelectorAll(sel));
  const fmtDate = (d) => new Date(d).toLocaleDateString(undefined, { day:"2-digit", month:"short" });
  const clamp = (n,min,max)=>Math.min(max,Math.max(min,n));
  const store = {
    get(){ try{ return JSON.parse(localStorage.getItem("psuave-data")||"{}"); }catch{ return {}; } },
    set(v){ localStorage.setItem("psuave-data", JSON.stringify(v)); }
  };

  // ---------- ESTADO ----------
  const state = {
    level: "Principiante",
    routine: null,
    flow: { stepIndex: 0, playing:false, left:0, timer:null },
    logs: [],
    favs: [],
    centers: [] // se carga más abajo
  };

  // restaurar si existe
  Object.assign(state, { ...state, ...store.get() });
  state.logs ??= [];
  state.favs ??= [];

  // ---------- NAVEGACIÓN ----------
  const views = $$(".view");
  $$(".nav-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const route = btn.dataset.route;
      views.forEach(v => v.classList.toggle("active", v.dataset.view === route));
      $$(".nav-btn").forEach(b => b.removeAttribute("aria-current"));
      btn.setAttribute("aria-current","page");
      if(route === "progreso"){ drawCharts(); renderLog(); renderFavs(); }
      if(route === "centros"){ renderCenters(); }
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

  // generar y renderizar
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
    // preparar flow
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

  // elegir nivel
  $$(".pill").forEach(p => p.addEventListener("click", () => genRoutine(p.dataset.lvl)));
  // almacenar favorita
  btnSaveRoutine.addEventListener("click", () => {
    if(!state.routine) genRoutine(state.level);
    if(!state.favs.some(f => f.level === state.routine.level)){
      state.favs.push({ ...state.routine, savedAt: Date.now() });
      toast("Rutina guardada en Favoritas");
      renderFavs(); save();
    } else toast("Esa rutina ya está en Favoritas");
  });

  // flujo paso a paso + temporizador simple
  btnStart.addEventListener("click", () => {
    if(!state.routine) genRoutine(state.level);
    btnPlay.removeAttribute("disabled");
    btnNext.removeAttribute("disabled");
    toast("Sesión lista. Pulsa ▶️ para comenzar.");
  });

  btnPlay.addEventListener("click", () => {
    if(state.flow.playing){ pause(); return; }
    play();
  });
  btnPrev.addEventListener("click", () => goStep(-1));
  btnNext.addEventListener("click", () => goStep(1));

  function play(){
    const r = state.routine; if(!r) return;
    state.flow.playing = true;
    btnPlay.textContent = "⏸️ Pausar";
    tick();
    state.flow.timer = setInterval(tick, 1000);
  }
  function pause(){
    state.flow.playing = false;
    btnPlay.textContent = "▶️ Reanudar";
    clearInterval(state.flow.timer);
  }
  function tick(){
    const r = state.routine; if(!r) return;
    const i = state.flow.stepIndex;
    state.flow.left = clamp(state.flow.left-1, 0, 86400);
    stepTimer.textContent = formatTime(state.flow.left);
    if(state.flow.left === 0){
      pause();
      goStep(1, true);
    }
  }
  function goStep(dir, auto=false){
    const r = state.routine; if(!r) return;
    const i = clamp(state.flow.stepIndex + dir, 0, r.steps.length-1);
    state.flow.stepIndex = i;
    state.flow.left = r.steps[i].secs;
    $$(".flow-step").forEach((el,idx)=> el.classList.toggle("active", idx===i));
    updateFlowButtons();
    if(auto) play();
  }
  function updateFlowButtons(){
    const r = state.routine;
    btnPrev.disabled = state.flow.stepIndex===0;
    btnNext.disabled = !r || state.flow.stepIndex===r.steps.length-1;
  }
  function formatTime(s){
    const m = Math.floor(s/60), ss = s%60;
    return `${String(m).padStart(2,"0")}:${String(ss).padStart(2,"0")}`;
  }

  // ---------- PROGRESO (LOG) ----------
  const logForm = $("#logForm");
  const logList = $("#logList");
  const totalMonth = $("#totalMonth");
  const weekCount = $("#weekCount");
  const streakEl = $("#streak");
  const favList = $("#favList");

  // fecha por defecto hoy
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
    save();
    renderLog();
    drawCharts();
    logForm.reset();
    $("#logDate").value = new Date().toISOString().slice(0,10);
  });

  function renderLog(){
    logList.innerHTML = "";
    const sorted = [...state.logs].sort((a,b)=> b.date.localeCompare(a.date));
    if(sorted.length === 0){
      logList.innerHTML = `<li class="muted">Aún no hay registros. Añade tu primera sesión arriba.</li>`;
      updateCounters();
      return;
    }
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
      btnDup.addEventListener("click", () => {
        state.logs.push({ ...e, id: cryptoId(), date: new Date().toISOString().slice(0,10) });
        save(); renderLog(); drawCharts();
      });
      btnDel.addEventListener("click", () => {
        state.logs = state.logs.filter(x => x.id !== e.id);
        save(); renderLog(); drawCharts();
      });
      logList.appendChild(li);
    });
    updateCounters();
  }

  function updateCounters(){
    // total mes
    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
    const total = state.logs.filter(l => l.date.startsWith(ym)).reduce((a,l)=>a+l.minutes,0);
    totalMonth.textContent = total;

    // sesiones semana y racha
    const today = new Date(); today.setHours(0,0,0,0);
    const firstDow = (d) => { const c = new Date(d); const day=(c.getDay()+6)%7; c.setDate(c.getDate()-day); c.setHours(0,0,0,0); return c; };
    const startWeek = firstDow(today);
    const week = state.logs.filter(l => {
      const ld = new Date(l.date); ld.setHours(0,0,0,0);
      return ld >= startWeek && ld <= today;
    });
    weekCount.textContent = week.length;

    // racha (días consecutivos con al menos 1 sesión)
    const dates = new Set(state.logs.map(l => l.date));
    let streak = 0; let cur = new Date(); cur.setHours(0,0,0,0);
    while(dates.has(cur.toISOString().slice(0,10))){
      streak++; cur.setDate(cur.getDate()-1);
    }
    streakEl.textContent = streak;
  }

  // favoritas
  function renderFavs(){
    favList.innerHTML = "";
    if(state.favs.length === 0){
      favList.innerHTML = `<li class="muted">Aún no guardaste rutinas favoritas.</li>`;
      return;
    }
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
      useBtn.addEventListener("click", () => {
        state.level = f.level;
        state.routine = JSON.parse(JSON.stringify(f));
        renderRoutine();
        // saltar al inicio
        document.querySelector('[data-route="home"]').click();
        toast("Rutina cargada");
      });
      delBtn.addEventListener("click", () => {
        state.favs.splice(idx,1); save(); renderFavs();
      });
      favList.appendChild(li);
    });
  }

  // gráfico simple Canvas
  function drawCharts(){
    const cvs = $("#minutesChart"); const ctx = cvs.getContext("2d");
    const w = cvs.width, h = cvs.height;
    ctx.clearRect(0,0,w,h);
    // fondo
    ctx.fillStyle = getCSS("--card"); ctx.fillRect(0,0,w,h);
    // últimos 7 días
    const days = [...Array(7)].map((_,i)=>{ const d = new Date(); d.setDate(d.getDate()- (6-i)); return d; });
    const map = days.map(d=>{
      const key = d.toISOString().slice(0,10);
      const sum = state.logs.filter(l => l.date===key).reduce((a,l)=>a+l.minutes,0);
      return { d, sum };
    });
    // ejes
    ctx.strokeStyle = "#e9dfea"; ctx.beginPath(); ctx.moveTo(50,20); ctx.lineTo(50,h-40); ctx.lineTo(w-20,h-40); ctx.stroke();
    // barras
    const max = Math.max(30, ...map.map(m=>m.sum));
    const bw = Math.min(70, (w-100)/7);
    map.forEach((m,i)=>{
      const x = 60 + i*(bw+14);
      const bh = Math.round((h-80) * (m.sum/max));
      const y = (h-40) - bh;
      const grd = ctx.createLinearGradient(0,y,0,y+bh);
      grd.addColorStop(0, "#eebfd1"); grd.addColorStop(1, "#dccdf1");
      ctx.fillStyle = grd;
      ctx.fillRect(x,y,bw,bh);
      ctx.fillStyle = "#6a4c68";
      ctx.textAlign="center";
      ctx.fillText(String(m.sum||0), x+bw/2, y-6);
      ctx.fillStyle = "#8e7a86";
      ctx.fillText(`${m.d.getDate()}/${m.d.getMonth()+1}`, x+bw/2, h-20);
    });
    updateCounters();
  }

  // ---------- CENTROS (MADRID) ----------
  const CENTROS = [
    { name:"Nature Pilates", barrio:"Centro", url:"https://www.naturepilates.es/" },
    { name:"Pilates Zentro", barrio:"Barrio de Salamanca", url:"https://www.pilateszentro.es/" },
    { name:"PilatesLab", barrio:"Chamberí", url:"https://www.pilateslab.es/" },
    { name:"Temple Pilates (Reformer)", barrio:"Gran Vía 17A", url:"https://templepilates.es/" },
    { name:"Pilates Experience", barrio:"Barrio de Salamanca (C/ Montesa)", url:"https://www.pilatesexperience.es/" },
    { name:"SanePilates", barrio:"Barrio de Salamanca", url:"https://sanepilates.com/" },
    { name:"City Pilates", barrio:"Madrid (varios)", url:"https://city-pilates.com/" },
    { name:"Maison Pilates", barrio:"Madrid (reformer boutique)", url:"https://www.maisonpilatesmadrid.com/" }
  ];
  state.centers = CENTROS;

  const centrosGrid = $("#centrosGrid");
  const centerSearch = $("#centerSearch");
  function renderCenters(){
    const q = (centerSearch.value||"").toLowerCase();
    const list = state.centers.filter(c => !q || c.name.toLowerCase().includes(q) || c.barrio.toLowerCase().includes(q));
    centrosGrid.innerHTML = "";
    list.forEach(c=>{
      const card = document.createElement("div");
      card.className = "center-card";
      card.innerHTML = `
        <strong>${c.name}</strong>
        <small>${c.barrio}</small>
        <a class="center-link" target="_blank" rel="noopener" href="${c.url}">Visitar web ↗</a>
      `;
      centrosGrid.appendChild(card);
    });
    if(list.length === 0){
      centrosGrid.innerHTML = `<div class="muted">No se encontraron centros para “${escapeHtml(centerSearch.value)}”.</div>`;
    }
  }
  centerSearch.addEventListener("input", renderCenters);

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
      save();
      renderLog(); renderFavs(); drawCharts();
      toast("Datos importados correctamente");
      e.target.value = "";
    }catch(err){ alert("No se pudo importar: " + err.message); }
  });

  // ---------- HELPERS ----------
  function cryptoId(){ return (crypto.randomUUID?.() || Math.random().toString(36).slice(2)) }
  function getCSS(varName){ return getComputedStyle(document.body).getPropertyValue(varName).trim() }
  function toast(msg){
    const t = document.createElement("div");
    t.textContent = msg; t.style.position="fixed"; t.style.bottom="16px"; t.style.right="16px";
    t.style.background="#00000080"; t.style.color="#fff"; t.style.padding="8px 12px"; t.style.borderRadius="12px";
    t.style.zIndex="9999";
    document.body.appendChild(t); setTimeout(()=>t.remove(), 1800);
  }
  function escapeHtml(s){ return s.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
  function save(){ store.set({ level:state.level, routine:state.routine, logs:state.logs, favs:state.favs, theme:state.theme }); }

  // ---------- ARRANQUE ----------
  // Generar rutina inicial si no existe
  if(!state.routine){ genRoutine(state.level); } else { renderRoutine(); }
  renderCenters();
  renderFavs();
  renderLog();
  drawCharts();
})();
