/* Редактор TEAMPLANNER. Один экран — одна цель (OBJ), цели переключаются в
   левой выезжающей панели, KR раскрываются в список подзадач. В той же панели —
   состав команды (команда · тип · ФИО): из него выбирают исполнителей. У подзадачи правятся тип, название и исполнитель; подзадачи можно
   добавить и удалить. Правки живут в localStorage этого браузера, пока их не
   выгрузят кнопкой «Скачать JSON». Правила «нет роли в команде» и строки для
   таблицы считаются так же, как в okr-plan.py — меняешь там, меняй и здесь. */
(function(){
  "use strict";
  var DATA = JSON.parse(document.getElementById("page-data").textContent);
  var ROLES = DATA.roles, ST = DATA.statuses;
  var KEY = "okr-tp:" + DATA.file;
  /* Черновик браузера привязан к содержимому файла (хэш всего JSON): агент поправил
     файл и пересобрал страницу — старый черновик к новой версии не применяется. */
  function hash(str){
    var h = 2166136261;
    for(var i = 0; i < str.length; i++){ h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(16);
  }
  var BASE = hash(JSON.stringify(DATA.doc));
  var COLUMNS = ["Название", "Комментарий", "Роль", "Исполнитель", "Начало", "Конец",
                 "Статус", "Прогресс, %", "Образ результата", "Образ действия"];

  function clone(x){ return JSON.parse(JSON.stringify(x)); }
  function esc(v){
    return String(v == null ? "" : v).replace(/[&<>"]/g, function(c){
      return {"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"}[c];
    });
  }
  /* Правки к прошлой версии файла не применяются и не теряются молча: уходят в
     отдельный ключ и ждут, пока их скачают или отбросят. */
  var OLD = KEY + ":old", stale = null;
  function stored(){
    var current = null;
    try {
      var s = JSON.parse(localStorage.getItem(KEY) || "null");
      if(s && s.base === BASE) current = s.doc;
      else if(s && s.doc){ localStorage.setItem(OLD, JSON.stringify(s.doc)); localStorage.removeItem(KEY); }
      stale = JSON.parse(localStorage.getItem(OLD) || "null");
    } catch(e){}
    return current;
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
  /* Заметка KR («Детальнее»): только эти теги, без атрибутов — как RICH_TAGS в okr-plan.py. */
  var RICH = {H3: "h3", P: "p", DIV: "p", B: "b", STRONG: "strong", I: "i", EM: "em", UL: "ul", OL: "ol", LI: "li", BR: "br"};
  var DROP = {SCRIPT: 1, STYLE: 1, TEMPLATE: 1, IFRAME: 1, OBJECT: 1};
  var BLOCKS = {H3: 1, P: 1, UL: 1, OL: 1, LI: 1, DIV: 1};
  function richClean(node){
    var out = "";
    node.childNodes.forEach(function(n){
      if(n.nodeType === 3){ out += esc(n.data); return; }
      if(n.nodeType !== 1 || DROP[n.tagName]) return;
      var tag = RICH[n.tagName];
      if(tag === "br"){ out += "<br>"; return; }
      out += tag ? "<" + tag + ">" + richClean(n) + "</" + tag + ">" : richClean(n);
    });
    return out;
  }
  function parse(html){ var t = document.createElement("template"); t.innerHTML = html || ""; return t.content; }
  /* Простым текстом для таблицы — то же правило, что rich_text в okr-plan.py. */
  function richText(html){
    var out = "";
    (function walk(node){
      node.childNodes.forEach(function(n){
        if(n.nodeType === 3){ out += n.data; return; }
        if(n.nodeType !== 1 || DROP[n.tagName]) return;
        if(n.tagName === "BR"){ out += "\n"; return; }
        out += n.tagName === "LI" ? "\n- " : BLOCKS[n.tagName] ? "\n" : "";
        walk(n);
        if(BLOCKS[n.tagName]) out += "\n";
      });
    })(parse(html));
    return out.split("\n").map(function(l){ return l.trim(); }).filter(Boolean).join("\n");
  }
  var TEMPLATE = "<h3>Образ действия</h3><p><br></p><h3>Образ результата</h3><p><br></p><h3>Дополнительно</h3><p><br></p>";

  function tableRows(){
    var rows = [];
    (doc.objectives || []).forEach(function(o){
      rows.push({"Название": "OBJ " + o.id + " — " + o.title});
      (o.krs || []).forEach(function(kr){
        var d = krDates(kr), pct = krPct(kr);
        rows.push({"Название": "KR " + kr.id + " " + (kr.tag ? "[" + kr.tag + "] " : "") + kr.title + " (общий прогресс)",
                   "Комментарий": [kr.result, kr.comment, richText(kr.details)].filter(Boolean).join("\n"),
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
    /* EXT — только если в документе есть смежная команда (external): иначе этапу не на кого уйти. */
    var hasExt = (doc.teams || []).some(function(t){ return t.external; }) || s.ext;
    var ext = hasExt ? ROLES.map(function(r){ return option("EXT:" + r, "EXT[" + r + "]", s.ext ? "EXT:" + s.role : ""); }).join("") : "";
    return '<select class="type" data-k="' + k + 'type" aria-label="Тип">' + own
      + (ext ? '<optgroup label="Внешний ресурс">' + ext + "</optgroup>" : "") + "</select>";
  }
  /* Исполнитель — поле с подсказками «[ТИП] ФИО» из всего состава: сначала люди с
     типом подзадачи, дальше по порядку типов и по имени. Человек из двух команд —
     один раз. Можно начать печатать часть имени или типа. */
  function candidates(kr, s){
    var seen = {}, list = people(null).filter(function(p){
      if(!p.name || seen[p.name]) return false;
      seen[p.name] = 1;
      return true;
    });
    function rank(p){ var i = ROLES.indexOf(p.role); return (p.role === s.role ? -1 : i < 0 ? ROLES.length : i); }
    return list.sort(function(a, b){ return rank(a) - rank(b) || a.name.localeCompare(b.name, "ru"); });
  }
  function label(p){ return "[" + (p.role || "?") + "] " + p.name; }
  function whoInput(kr, s, k){
    var list = candidates(kr, s), me = list.filter(function(p){ return p.name === s.who; })[0];
    var value = s.who ? (me ? label(me) : s.who + " (нет в составе)") : "";
    var id = "dl-" + k.replace(/[^\w]/g, "-");
    return '<input class="who" data-k="' + k + 'who" list="' + id + '" value="' + esc(value) + '" placeholder="'
      + (state(kr, s).norole ? "нет роли в команде" : "исполнитель") + '" autocomplete="off" aria-label="Исполнитель">'
      + '<datalist id="' + id + '">' + list.map(function(p){ return '<option value="' + esc(label(p)) + '">'; }).join("") + "</datalist>";
  }
  /* Текст из поля → имя: точное «[ТИП] ФИО» или ФИО, иначе единственное совпадение
     по части строки. Не нашли или нашли несколько — null. */
  function resolveWho(kr, s, text){
    var q = text.trim().toLowerCase(), list = candidates(kr, s);
    if(!q) return "";
    var exact = list.filter(function(p){ return label(p).toLowerCase() === q || p.name.toLowerCase() === q; });
    if(exact.length) return exact[0].name;
    var part = list.filter(function(p){ return label(p).toLowerCase().indexOf(q) >= 0; });
    return part.length === 1 ? part[0].name : null;
  }
  function stepRow(kr, s, i){
    var st = state(kr, s), k = kr.id + "|" + i + "|";
    var flag = st.ext ? " data-ext" : st.norole ? " data-norole" : st.unassigned ? " data-unassigned" : "";
    return '<div class="step"' + flag + ">" + typeSelect(kr, s, k)
      + '<input class="title" data-k="' + k + 'title" value="' + esc(s.title) + '" aria-label="Название">'
      + (st.ext ? '<span class="who ext">' + esc(whoText(kr, s)) + "</span>" : '<span class="who-box">' + whoInput(kr, s, k) + "</span>")
      + '<button type="button" class="del" data-act="del" data-kr="' + esc(kr.id) + '" data-i="' + i + '" aria-label="Удалить подзадачу">×</button></div>';
  }
  function krBlock(kr){
    var n = (kr.steps || []).length;
    var open = (kr.steps || []).filter(function(s){ var st = state(kr, s); return st.unassigned || st.norole; }).length;
    return '<details class="kr" data-kr="' + esc(kr.id) + '"' + (opened[kr.id] ? " open" : "") + ">"
      + '<summary><span class="kr-id">' + esc(kr.id) + '</span><span class="kr-title">' + esc(kr.title) + "</span>"
      + '<span class="kr-count">' + n + (open ? ' · <b>без исполнителя ' + open + "</b>" : "") + "</span>"
      + '<button type="button" class="more"' + (richText(kr.details) ? " data-has" : "") + ' data-act="more" data-kr="'
      + esc(kr.id) + '">Детальнее</button></summary>'
      + '<div class="steps">' + (kr.steps || []).map(function(s, i){ return stepRow(kr, s, i); }).join("") + "</div>"
      + '<button type="button" class="add" data-act="add" data-kr="' + esc(kr.id) + '">+ подзадача</button></details>';
  }

  var objs = doc.objectives || [];
  var cur = 0, opened = {};
  function fromHash(){
    var m = location.hash.match(/obj=([^&]+)/);
    if(m) objs.forEach(function(o, i){ if(String(o.id) === decodeURIComponent(m[1])) cur = i; });
  }
  fromHash();
  window.addEventListener("hashchange", function(){ fromHash(); render(); });
  /* ---------- состав команды: строки «команда · тип · ФИО» ---------- */
  var roster;
  function initRoster(){
    roster = [];
    (doc.teams || []).forEach(function(t){
      if(t.external) return;
      (t.people || []).forEach(function(p){ roster.push({id: t.id, team: t.name || "", role: p.role || "", name: p.name || ""}); });
    });
  }
  initRoster();
  /* Строки состава → doc.teams. Команда ищется по названию; новое название — новая
     команда. Пустые новые команды без KR убираются, внешние команды не трогаются. */
  function syncTeams(){
    var original = DATA.doc.teams || [], used = {};
    (doc.objectives || []).forEach(function(o){ (o.krs || []).forEach(function(k){
      (k.teams || []).forEach(function(t){ used[t] = 1; });
      (k.steps || []).forEach(function(s){ if(s.ext) used[s.ext] = 1; });
    }); });
    var own = (doc.teams || []).filter(function(t){ return !t.external; });
    own.forEach(function(t){ t.people = []; });
    var ext = (doc.teams || []).filter(function(t){ return t.external; });
    roster.forEach(function(r){
      var name = r.name.trim(), team = r.team.trim();
      if(!name) return;
      /* Строка помнит свою команду: название не меняли — та же команда, даже если
         оно пустое или повторяется у другой. Поменяли — ищем по названию или заводим. */
      var mine = own.filter(function(x){ return x.id === r.id; })[0];
      var t = mine && (mine.name || "") === team ? mine : team ? own.filter(function(x){ return x.name === team; })[0] : null;
      if(!t){
        if(!team) return;
        var n = 1, ids = own.concat(ext).map(function(x){ return x.id; });
        while(ids.indexOf("team-" + n) >= 0) n++;
        t = {id: "team-" + n, name: team, people: []};
        own.push(t);
      }
      r.id = t.id;
      t.people.push({name: name, role: r.role});
    });
    own = own.filter(function(t){
      return t.people.length || used[t.id] || original.some(function(o){ return o.id === t.id; });
    });
    doc.teams = own.concat(ext);
  }
  var peopleBox = document.getElementById("tpPeople");
  /* Подсказки названий команд. Строки состава при этом не перерисовываются —
     иначе пропадёт поле, в котором человек сейчас печатает. */
  function renderTeamNames(){
    var names = {};
    (doc.teams || []).forEach(function(t){ if(!t.external && t.name) names[t.name] = 1; });
    document.getElementById("tpTeamNames").innerHTML = Object.keys(names).map(function(n){ return option(n, n, ""); }).join("");
  }
  function renderPeople(){
    renderTeamNames();
    peopleBox.innerHTML = roster.map(function(r, i){
      var roles = ROLES.map(function(x){ return option(x, x, r.role); }).join("")
        + (r.role && ROLES.indexOf(r.role) < 0 ? option(r.role, r.role, r.role) : "");
      return '<div class="person"><input data-p="' + i + '|team" value="' + esc(r.team) + '" placeholder="Команда" list="tpTeamNames" aria-label="Команда">'
        + '<select data-p="' + i + '|role" aria-label="Тип">' + roles + "</select>"
        + '<input data-p="' + i + '|name" value="' + esc(r.name) + '" placeholder="ФИО" aria-label="ФИО">'
        + '<button type="button" class="del" data-pdel="' + i + '" aria-label="Удалить участника">×</button></div>';
    }).join("") + '<button type="button" class="add" id="tpAddPerson">+ участник</button>';
  }
  peopleBox.addEventListener("change", function(e){
    var k = e.target.getAttribute("data-p");
    if(!k) return;
    var p = k.split("|");
    roster[+p[0]][p[1]] = e.target.value;
    syncTeams(); save(); render(); renderTeamNames();
  });
  peopleBox.addEventListener("click", function(e){
    if(e.target.id === "tpAddPerson"){
      var last = roster[roster.length - 1];
      roster.push({id: last ? last.id : "", team: last ? last.team : "", role: ROLES[0], name: ""});
      renderPeople();
      var inputs = peopleBox.querySelectorAll('input[data-p$="|name"]');
      inputs[inputs.length - 1].focus();
    } else if(e.target.hasAttribute("data-pdel")){
      roster.splice(+e.target.getAttribute("data-pdel"), 1);
      syncTeams(); save(); renderPeople(); render();
    }
  });

  var tp = document.getElementById("tp"), list = document.getElementById("tpObjs");
  var tab = document.getElementById("tpTab");
  var drawers = [].slice.call(document.querySelectorAll(".drawer"));
  var tabs = [].slice.call(document.querySelectorAll(".rail-tab"));

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
    document.getElementById("tpStale").hidden = !stale;
  }
  function findKr(id){
    var hit = null;
    objs.forEach(function(o){ (o.krs || []).forEach(function(k){ if(k.id === id) hit = k; }); });
    return hit;
  }

  /* Две панели слева — «Цели» и «Команда»; открыта не больше одной. */
  function setDrawer(id){
    drawers.forEach(function(d){ d.classList.toggle("open", d.id === id); });
    tabs.forEach(function(t){ t.classList.toggle("on", t.getAttribute("data-drawer") === id); });
    document.body.classList.toggle("drawer-open", !!id);
  }
  tabs.forEach(function(t){
    t.onclick = function(){
      var id = t.getAttribute("data-drawer");
      setDrawer(document.getElementById(id).classList.contains("open") ? null : id);
    };
  });
  drawers.forEach(function(d){ d.querySelector(".drawer-close").onclick = function(){ setDrawer(null); }; });
  document.addEventListener("keydown", function(e){ if(e.key === "Escape") setDrawer(null); });
  document.addEventListener("click", function(e){
    if(!e.target.isConnected || !document.body.classList.contains("drawer-open")) return;
    if(!drawers.some(function(d){ return d.contains(e.target); }) && tabs.indexOf(e.target) < 0) setDrawer(null);
  });
  list.addEventListener("click", function(e){
    var b = e.target.closest("[data-obj]");
    if(!b) return;
    cur = +b.getAttribute("data-obj");
    /* Во встроенной странице (iframe srcdoc, превью) адрес менять нельзя — цель
       всё равно переключается, просто не запоминается в ссылке. */
    try { history.replaceState(null, "", "#obj=" + encodeURIComponent(objs[cur].id)); } catch(e){}
    setDrawer(null);
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
    } else if(p[2] === "who"){
      var who = resolveWho(kr, s, v);
      if(who === null){
        var el = e.target;
        el.classList.add("miss");
        setTimeout(function(){ render(); }, 900);
        return;
      }
      s.who = who;
    } else {
      s[p[2]] = v;
    }
    save();
    setTimeout(render, 0);
  });
  tp.addEventListener("focusin", function(e){
    if(e.target.classList && e.target.classList.contains("who") && e.target.select) e.target.select();
  });
  tp.addEventListener("keydown", function(e){
    if(e.key === "Enter" && e.target.classList && e.target.classList.contains("who")) e.target.blur();
  });
  tp.addEventListener("click", function(e){
    var b = e.target.closest("[data-act]");
    if(!b) return;
    var kr = findKr(b.getAttribute("data-kr")), i = +b.getAttribute("data-i");
    if(!kr) return;
    if(b.getAttribute("data-act") === "more"){
      e.preventDefault();
      openSide(kr);
    } else if(b.getAttribute("data-act") === "add"){
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

  /* ---------- «Детальнее»: свободная заметка KR в правой панели ---------- */
  var side = document.getElementById("side"), rt = document.getElementById("rt"), sideKr = null;
  function openSide(kr){
    sideKr = kr;
    document.getElementById("sideKr").textContent = "KR " + kr.id;
    document.getElementById("sideTitle").textContent = kr.title;
    rt.innerHTML = kr.details == null ? TEMPLATE : richClean(parse(kr.details));
    side.classList.add("open");
    document.body.setAttribute("data-side", "");
    rt.focus();
  }
  function closeSide(){
    if(!side.classList.contains("open")) return;
    side.classList.remove("open");
    document.body.removeAttribute("data-side");
    sideKr = null;
    render();
  }
  rt.addEventListener("input", function(){
    if(!sideKr) return;
    sideKr.details = richText(rt.innerHTML) ? richClean(rt) : "";
    save();
  });
  rt.addEventListener("paste", function(e){
    var html = e.clipboardData && e.clipboardData.getData("text/html");
    if(!html) return;
    e.preventDefault();
    document.execCommand("insertHTML", false, richClean(parse(html)));
  });
  document.getElementById("rtBar").addEventListener("mousedown", function(e){ e.preventDefault(); });
  document.getElementById("rtBar").addEventListener("click", function(e){
    var b = e.target.closest("[data-cmd]");
    if(!b) return;
    document.execCommand(b.getAttribute("data-cmd"), false, b.getAttribute("data-arg"));
    rt.focus();
  });
  document.getElementById("sideClose").onclick = closeSide;
  document.getElementById("scrim").onclick = closeSide;
  document.addEventListener("keydown", function(e){ if(e.key === "Escape") closeSide(); });

  /* ---------- выгрузка ---------- */
  document.getElementById("bJson").onclick = function(){
    var out = clone(doc);
    out.updated = new Date().toISOString().slice(0, 10);
    if(out.status === "принято") out.status = "черновик";
    download(out, DATA.file);
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
  function download(obj, name){
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 2) + "\n"], {type: "application/json"}));
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
  }
  document.getElementById("bStaleGet").onclick = function(){
    if(stale) download(stale, DATA.file.replace(/\.json$/, "") + ".old-edits.json");
  };
  document.getElementById("bStaleDrop").onclick = function(){
    if(!confirm("Отбросить правки к прошлой версии файла?")) return;
    try { localStorage.removeItem(OLD); } catch(e){}
    stale = null; render();
  };
  document.getElementById("bReset").onclick = function(){
    if(!confirm("Сбросить правки из браузера и вернуть данные файла?")) return;
    try { localStorage.removeItem(KEY); } catch(e){}
    doc = clone(DATA.doc); objs = doc.objectives || []; dirty = false; initRoster(); renderPeople(); render();
  };

  renderPeople();
  render();
})();
