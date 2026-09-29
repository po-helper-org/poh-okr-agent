/* Редактор TEAMPLANNER. Один экран — одна цель (OBJ), цели переключаются в
   левой выезжающей панели, KR раскрываются в список подзадач. У подзадачи правятся тип, название и исполнитель; подзадачи можно
   добавить и удалить. Правки живут в localStorage этого браузера, пока их не
   выгрузят кнопкой «Скачать JSON». Правила «нет роли в команде» и строки для
   таблицы считаются так же, как в okr-plan.py — меняешь там, меняй и здесь. */
(function(){
  "use strict";
  var DATA = JSON.parse(document.getElementById("page-data").textContent);
  var ROLES = DATA.roles, ST = DATA.statuses;
  var KEY = "okr-tp:" + DATA.file;
  var BASE = (DATA.doc.updated || "") + "|" + JSON.stringify(DATA.doc).length;
  var COLUMNS = ["Название", "Комментарий", "Роль", "Исполнитель", "Начало", "Конец",
                 "Статус", "Прогресс, %", "Образ результата", "Образ действия"];

  function clone(x){ return JSON.parse(JSON.stringify(x)); }
  function esc(v){
    return String(v == null ? "" : v).replace(/[&<>"]/g, function(c){
      return {"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"}[c];
    });
  }
  function stored(){
    try {
      var s = JSON.parse(localStorage.getItem(KEY) || "null");
      if(s && s.base === BASE) return s.doc;
    } catch(e){}
    return null;
  }
  var doc = stored(), dirty = !!doc;
  if(!doc) doc = clone(DATA.doc);
  function save(){
    dirty = true;
    try { localStorage.setItem(KEY, JSON.stringify({base: BASE, doc: doc})); } catch(e){}
  }

  /* ---------- производные: как в okr-plan.py ---------- */
  function teamMap(){ var m = {}; (doc.teams || []).forEach(function(t){ m[t.id] = t; }); return m; }
  function people(teamIds){
    var out = [];
    (doc.teams || []).forEach(function(t){
      if(t.external || (teamIds && teamIds.indexOf(t.id) < 0)) return;
      (t.people || []).forEach(function(p){ out.push({name: p.name, role: p.role, team: t.id}); });
    });
    return out;
  }
  function state(kr, s){
    if(s.ext || s.who) return {ext: s.ext || "", unassigned: false, norole: false};
    var norole = people(kr.teams || []).map(function(p){ return p.role; }).indexOf(s.role) < 0;
    return {ext: "", unassigned: !norole, norole: norole};
  }
  function stepPct(s){ return typeof s.progress === "number" ? s.progress : (s.status === "DONE" ? 100 : 0); }
  function krPct(kr){
    var st = kr.steps || [];
    return st.length ? Math.floor(st.reduce(function(a, s){ return a + stepPct(s); }, 0) / st.length + 0.5) : null;
  }
  function krStatus(kr){
    var st = (kr.steps || []).map(function(s){ return s.status || "TODO"; });
    if(st.length && st.every(function(x){ return x === "DONE"; })) return "DONE";
    if(st.indexOf("BLOCKED") >= 0) return "BLOCKED";
    if(st.some(function(x){ return x === "IN PROGRESS" || x === "DONE"; })) return "IN PROGRESS";
    return "TODO";
  }
  function krDates(kr){
    var s = (kr.steps || []).map(function(x){ return x.start; }).filter(Boolean).sort();
    var e = (kr.steps || []).map(function(x){ return x.end; }).filter(Boolean).sort();
    return [s[0] || "", e.length ? e[e.length - 1] : ""];
  }
  function roleText(s){ return s.ext ? "EXT[" + s.role + "]" : (s.role || ""); }
  function whoText(kr, s){
    var st = state(kr, s);
    if(st.ext){ var t = teamMap()[st.ext]; return "внешний ресурс: " + (t ? t.name : st.ext); }
    if(s.who) return s.who;
    return st.norole ? "нет роли в команде" : "";
  }
  function tableRows(){
    var rows = [];
    (doc.objectives || []).forEach(function(o){
      rows.push({"Название": "OBJ " + o.id + " — " + o.title});
      (o.krs || []).forEach(function(kr){
        var d = krDates(kr), pct = krPct(kr);
        rows.push({"Название": "KR " + kr.id + " " + (kr.tag ? "[" + kr.tag + "] " : "") + kr.title + " (общий прогресс)",
                   "Комментарий": [kr.result, kr.comment].filter(Boolean).join("\n"),
                   "Исполнитель": kr.owner || "", "Начало": d[0], "Конец": d[1],
                   "Статус": ST[krStatus(kr)], "Прогресс, %": pct == null ? "" : pct});
        (kr.steps || []).forEach(function(s){
          rows.push({"Название": (s.title || "") + " (" + roleText(s) + ")", "Комментарий": s.comment || "",
                     "Роль": roleText(s), "Исполнитель": whoText(kr, s), "Начало": s.start || "", "Конец": s.end || "",
                     "Статус": ST[s.status || "TODO"] || "", "Прогресс, %": stepPct(s),
                     "Образ результата": s.result || "", "Образ действия": s.action || ""});
        });
      });
    });
    return rows;
  }

  /* ---------- разметка ---------- */
  function option(value, label, current){
    return '<option value="' + esc(value) + '"' + (value === current ? " selected" : "") + ">" + esc(label) + "</option>";
  }
  /* Тип: своя роль или EXT[роль] — та же работа силами смежной команды. */
  function typeSelect(kr, s, k){
    var own = ROLES.map(function(r){ return option(r, r, s.ext ? "" : s.role); }).join("");
    var ext = ROLES.map(function(r){ return option("EXT:" + r, "EXT[" + r + "]", s.ext ? "EXT:" + s.role : ""); }).join("");
    return '<select class="type" data-k="' + k + 'type" aria-label="Тип">' + own
      + '<optgroup label="Внешний ресурс">' + ext + "</optgroup></select>";
  }
  function whoSelect(kr, s, k){
    var here = people(kr.teams || []), seen = {};
    function group(label, list){
      var opts = list.filter(function(p){ if(seen[p.name]) return false; seen[p.name] = 1; return true; })
        .map(function(p){ return option(p.name, p.name, s.who || ""); }).join("");
      return opts ? '<optgroup label="' + esc(label) + '">' + opts + "</optgroup>" : "";
    }
    var html = option("", state(kr, s).norole ? "нет роли в команде" : "исполнитель", s.who || "")
      + group(s.role, here.filter(function(p){ return p.role === s.role; }))
      + group("Команда", here)
      + group("Другие команды", people(null));
    if(s.who && !seen[s.who]) html += option(s.who, s.who, s.who);
    return '<select class="who" data-k="' + k + 'who" aria-label="Исполнитель">' + html + "</select>";
  }
  function stepRow(kr, s, i){
    var st = state(kr, s), k = kr.id + "|" + i + "|";
    var flag = st.ext ? " data-ext" : st.norole ? " data-norole" : st.unassigned ? " data-unassigned" : "";
    return '<div class="step"' + flag + ">" + typeSelect(kr, s, k)
      + '<input class="title" data-k="' + k + 'title" value="' + esc(s.title) + '" aria-label="Название">'
      + (st.ext ? '<span class="who ext">' + esc(whoText(kr, s)) + "</span>" : whoSelect(kr, s, k))
      + '<button type="button" class="del" data-act="del" data-kr="' + esc(kr.id) + '" data-i="' + i + '" aria-label="Удалить подзадачу">×</button></div>';
  }
  function krBlock(kr){
    var n = (kr.steps || []).length;
    var open = (kr.steps || []).filter(function(s){ var st = state(kr, s); return st.unassigned || st.norole; }).length;
    return '<details class="kr" data-kr="' + esc(kr.id) + '"' + (opened[kr.id] ? " open" : "") + ">"
      + '<summary><span class="kr-id">' + esc(kr.id) + '</span><span class="kr-title">' + esc(kr.title) + "</span>"
      + '<span class="kr-count">' + n + (open ? ' · <b>без исполнителя ' + open + "</b>" : "") + "</span></summary>"
      + '<div class="steps">' + (kr.steps || []).map(function(s, i){ return stepRow(kr, s, i); }).join("") + "</div>"
      + '<button type="button" class="add" data-act="add" data-kr="' + esc(kr.id) + '">+ подзадача</button></details>';
  }

  var objs = doc.objectives || [];
  var cur = 0, opened = {};
  var m = location.hash.match(/obj=([^&]+)/);
  if(m) objs.forEach(function(o, i){ if(String(o.id) === decodeURIComponent(m[1])) cur = i; });
  var tp = document.getElementById("tp"), list = document.getElementById("tpObjs");
  var drawer = document.getElementById("tpDrawer"), tab = document.getElementById("tpTab");

  function render(){
    var active = document.activeElement, key = active && active.getAttribute && active.getAttribute("data-k");
    list.innerHTML = objs.map(function(o, i){
      return '<button type="button" class="st-item" data-obj="' + i + '"' + (i === cur ? " data-active" : "") + ">"
        + "OBJ " + esc(o.id) + " — " + esc(o.title) + '<span class="n">' + (o.krs || []).length + " KR</span></button>";
    }).join("");
    var o = objs[cur];
    tab.textContent = o ? "OBJ " + o.id + " из " + objs.length : "Цели";
    document.getElementById("tpObj").textContent = o ? "OBJ " + o.id + " — " + o.title : "";
    tp.innerHTML = o ? (o.krs || []).map(krBlock).join("") : "";
    if(key){ var el = tp.querySelector('[data-k="' + key + '"]'); if(el) el.focus(); }
    document.getElementById("tpDirty").hidden = !dirty;
  }
  function findKr(id){
    var hit = null;
    objs.forEach(function(o){ (o.krs || []).forEach(function(k){ if(k.id === id) hit = k; }); });
    return hit;
  }

  function setDrawer(open){
    drawer.classList.toggle("open", open);
    document.body.classList.toggle("drawer-open", open);
  }
  tab.onclick = function(){ setDrawer(!drawer.classList.contains("open")); };
  document.getElementById("tpDrawerClose").onclick = function(){ setDrawer(false); };
  document.addEventListener("keydown", function(e){ if(e.key === "Escape") setDrawer(false); });
  document.addEventListener("click", function(e){
    if(drawer.classList.contains("open") && !drawer.contains(e.target) && e.target !== tab) setDrawer(false);
  });
  list.addEventListener("click", function(e){
    var b = e.target.closest("[data-obj]");
    if(!b) return;
    cur = +b.getAttribute("data-obj");
    history.replaceState(null, "", "#obj=" + encodeURIComponent(objs[cur].id));
    setDrawer(false);
    render();
    window.scrollTo(0, 0);
  });
  tp.addEventListener("change", function(e){
    var k = e.target.getAttribute("data-k");
    if(!k) return;
    var p = k.split("|"), kr = findKr(p[0]), s = kr && kr.steps[+p[1]], v = e.target.value;
    if(!s) return;
    if(p[2] === "type"){
      if(v.indexOf("EXT:") === 0){
        var ext = (doc.teams || []).filter(function(t){ return t.external; });
        var mine = ext.filter(function(t){ return (kr.teams || []).indexOf(t.id) >= 0; });
        s.role = v.slice(4); s.ext = (mine[0] || ext[0] || {id: ""}).id; s.who = "";
      } else { s.role = v; s.ext = ""; }
    } else if(p[2] === "title"){
      s.title = v.trim() || kr.title;
    } else {
      s[p[2]] = v;
    }
    save();
    setTimeout(render, 0);
  });
  tp.addEventListener("click", function(e){
    var b = e.target.closest("[data-act]");
    if(!b) return;
    var kr = findKr(b.getAttribute("data-kr")), i = +b.getAttribute("data-i");
    if(!kr) return;
    if(b.getAttribute("data-act") === "add"){
      kr.steps = kr.steps || [];
      kr.steps.push({role: ROLES[0], title: kr.title, ext: "", who: "", start: "", end: "", status: "TODO",
                     result: "", action: "", comment: ""});
      save(); render();
      var el = tp.querySelector('[data-k="' + kr.id + "|" + (kr.steps.length - 1) + '|type"]');
      if(el) el.focus();
    } else if(confirm("Удалить подзадачу «" + (kr.steps[i].title || "") + "»?")){
      kr.steps.splice(i, 1); save(); render();
    }
  });
  tp.addEventListener("toggle", function(e){
    if(e.target.matches && e.target.matches("details.kr")) opened[e.target.getAttribute("data-kr")] = e.target.open;
  }, true);

  /* ---------- выгрузка ---------- */
  document.getElementById("bJson").onclick = function(){
    var out = clone(doc);
    out.updated = new Date().toISOString().slice(0, 10);
    if(out.status === "принято") out.status = "черновик";
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(out, null, 2) + "\n"], {type: "application/json"}));
    a.download = DATA.file;
    document.body.appendChild(a); a.click(); a.remove();
  };
  document.getElementById("bTsv").onclick = function(){
    var b = this;
    function cell(v){ v = String(v == null ? "" : v); return /[\t\n"]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
    var text = [COLUMNS.join("\t")].concat(tableRows().map(function(r){
      return COLUMNS.map(function(c){ return cell(r[c]); }).join("\t");
    })).join("\n");
    function done(){ b.textContent = "Скопировано"; setTimeout(function(){ b.textContent = "Копировать в Sheets"; }, 1500); }
    function fallback(){
      var t = document.createElement("textarea"); t.value = text; document.body.appendChild(t); t.select();
      try { document.execCommand("copy"); done(); } catch(e){} t.remove();
    }
    if(navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback);
    else fallback();
  };
  document.getElementById("bReset").onclick = function(){
    if(!confirm("Сбросить правки из браузера и вернуть данные файла?")) return;
    try { localStorage.removeItem(KEY); } catch(e){}
    doc = clone(DATA.doc); objs = doc.objectives || []; dirty = false; render();
  };

  render();
})();
