/* Редактор TEAMPLANNER. Источник — JSON из page-data; правки живут в localStorage
   этого браузера, пока их не выгрузят кнопкой «Скачать JSON». Производные поля
   (исполнитель «нет роли в команде», прогресс и статус KR, сроки KR, строки для
   таблицы) считаются так же, как в okr-plan.py — меняешь правило там, меняй и здесь. */
(function(){
  "use strict";
  var DATA = JSON.parse(document.getElementById("page-data").textContent);
  var ROLES = DATA.roles, ST = DATA.statuses, STATUSES = Object.keys(ST);
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
  function storedDoc(){
    try {
      var s = JSON.parse(localStorage.getItem(KEY) || "null");
      if(s && s.base === BASE) return s.doc;
    } catch(e){}
    return null;
  }
  var doc = storedDoc();
  var dirty = !!doc;
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
    var roles = people(kr.teams || []).map(function(p){ return p.role; });
    var norole = roles.indexOf(s.role) < 0;
    return {ext: "", unassigned: !norole, norole: norole};
  }
  function stepPct(s){ return typeof s.progress === "number" ? s.progress : (s.status === "DONE" ? 100 : 0); }
  function krPct(kr){
    var st = kr.steps || [];
    if(!st.length) return null;
    return Math.floor(st.reduce(function(a, s){ return a + stepPct(s); }, 0) / st.length + 0.5);
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

  /* ---------- фильтры и раскрытие ---------- */
  var filter = {team: "", who: "", problems: false};
  var closed = {};
  function stepVisible(kr, s){
    var st = state(kr, s);
    if(filter.problems && !(st.unassigned || st.norole)) return false;
    if(filter.who === "__none" && !(st.unassigned || st.norole)) return false;
    if(filter.who && filter.who !== "__none" && s.who !== filter.who) return false;
    return true;
  }
  function krVisible(kr){
    if(filter.team && (kr.teams || []).indexOf(filter.team) < 0) return false;
    if(!filter.who && !filter.problems) return true;
    return (kr.steps || []).some(function(s){ return stepVisible(kr, s); });
  }

  /* ---------- разметка ---------- */
  function option(value, label, current){
    return '<option value="' + esc(value) + '"' + (value === current ? " selected" : "") + ">" + esc(label) + "</option>";
  }
  function whoSelect(kr, s, k){
    var here = people(kr.teams || []), all = people(null), seen = {};
    function group(label, list){
      var opts = list.filter(function(p){ if(seen[p.name]) return false; seen[p.name] = 1; return true; })
        .map(function(p){ return option(p.name, p.name + " · " + p.role, s.who || ""); }).join("");
      return opts ? '<optgroup label="' + esc(label) + '">' + opts + "</optgroup>" : "";
    }
    var html = option("", state(kr, s).norole ? "нет роли в команде" : "— не назначен —", s.who || "")
      + group(s.role + " в команде", here.filter(function(p){ return p.role === s.role; }))
      + group("Другие роли в командах KR", here)
      + group("Другие команды", all);
    if(s.who && !seen[s.who]) html += option(s.who, s.who + " (нет в составе)", s.who);
    return '<select class="who" data-k="' + k + 'who">' + html + "</select>";
  }
  function stepRow(kr, s, i){
    var st = state(kr, s), k = kr.id + "|" + i + "|";
    var ext = (doc.teams || []).filter(function(t){ return t.external; });
    var attrs = (st.ext ? " data-ext" : "") + (st.norole ? " data-norole" : "") + (st.unassigned ? " data-unassigned" : "")
      + (stepVisible(kr, s) ? "" : " hidden");
    var roleOpts = ROLES.map(function(r){ return option(r, r, s.role); }).join("")
      + (ROLES.indexOf(s.role) < 0 ? option(s.role, s.role + " ?", s.role) : "");
    var extOpts = option("", "своя команда", s.ext || "")
      + ext.map(function(t){ return option(t.id, t.name, s.ext || ""); }).join("");
    var has = s.result || s.action || s.comment;
    return "<tr" + attrs + '><td class="n">' + esc(kr.id) + "." + (i + 1) + "</td>"
      + '<td><select class="role" data-k="' + k + 'role" title="Тип ресурса">' + roleOpts + "</select></td>"
      + '<td><select data-k="' + k + 'ext" title="Чей ресурс">' + extOpts + "</select></td>"
      + '<td><input data-k="' + k + 'title" value="' + esc(s.title) + '" placeholder="Что сделать"></td>'
      + "<td>" + (st.ext ? '<span class="extname">' + esc(whoText(kr, s)) + "</span>" : whoSelect(kr, s, k)) + "</td>"
      + '<td><input type="date" data-k="' + k + 'start" value="' + esc(s.start) + '"></td>'
      + '<td><input type="date" data-k="' + k + 'end" value="' + esc(s.end) + '"></td>'
      + '<td><select class="st" data-s="' + esc(s.status || "TODO") + '" data-k="' + k + 'status">'
      + STATUSES.map(function(x){ return option(x, ST[x], s.status || "TODO"); }).join("") + "</select></td>"
      + '<td><input type="number" min="0" max="100" step="5" data-k="' + k + 'progress" value="'
      + (typeof s.progress === "number" ? s.progress : "") + '" placeholder="' + stepPct(s) + '" title="Прогресс, %"></td>'
      + '<td><button type="button" class="note-btn"' + (has ? " data-has" : "") + ' data-act="note" data-kr="' + esc(kr.id)
      + '" data-i="' + i + '" title="Образ результата, образ действия, комментарий">✎</button></td>'
      + '<td><button type="button" class="del" data-act="del" data-kr="' + esc(kr.id) + '" data-i="' + i + '" title="Удалить этап">×</button></td></tr>';
  }
  function krBlock(kr){
    var tm = teamMap(), d = krDates(kr), pct = krPct(kr), status = krStatus(kr);
    var problems = (kr.steps || []).filter(function(s){ var st = state(kr, s); return st.unassigned || st.norole; }).length;
    var names = (kr.teams || []).map(function(t){ return tm[t] ? tm[t].name : t; }).join(", ");
    var tier = kr.pbv == null ? "none" : kr.pbv >= 8 ? "high" : kr.pbv >= 4 ? "mid" : kr.pbv >= 1 ? "low" : "zero";
    return '<details class="kr" data-kr="' + esc(kr.id) + '"' + (closed[kr.id] ? "" : " open") + (krVisible(kr) ? "" : " hidden") + ">"
      + '<summary><span class="kr-id">KR ' + esc(kr.id) + "</span>"
      + '<span class="kr-title">' + (kr.tag ? "[" + esc(kr.tag) + "] " : "") + esc(kr.title) + "</span>"
      + '<span class="kr-meta"><span class="pbvtag" data-tier="' + tier + '">' + (kr.pbv == null ? "—" : esc(kr.pbv)) + "</span>"
      + "<span>" + esc(names) + "</span><span>" + esc(kr.owner || "—") + "</span>"
      + "<span>" + esc(d[0] || "—") + " — " + esc(d[1] || "—") + "</span>"
      + '<span class="stb" data-s="' + status + '">' + esc(ST[status]) + "</span>"
      + '<span class="pbar"><i style="width:' + (pct || 0) + '%"></i></span><span>' + (pct == null ? "—" : pct + " %") + "</span>"
      + '<span class="kr-flag' + (problems ? "" : " ok") + '">' + (problems ? "без исполнителя: " + problems : "все назначены") + "</span>"
      + '<button type="button" class="note-btn"' + (kr.comment || kr.result ? " data-has" : "") + ' data-act="krnote" data-kr="'
      + esc(kr.id) + '" title="Ответственный, образ результата, комментарий">✎</button></span></summary>'
      + (kr.comment ? '<p class="kr-comment" data-act="krnote" data-kr="' + esc(kr.id) + '">' + esc(kr.comment) + "</p>" : "")
      + '<div class="table-wrap"><table class="tp"><colgroup><col class="c-n"><col class="c-role"><col class="c-ext"><col>'
      + '<col class="c-who"><col class="c-d"><col class="c-d"><col class="c-st"><col class="c-p"><col class="c-b"><col class="c-b"></colgroup>'
      + "<thead><tr><th>№</th><th>Роль</th><th>Чей ресурс</th><th>Этап</th><th>Исполнитель</th><th>Начало</th><th>Конец</th>"
      + "<th>Статус</th><th>%</th><th></th><th></th></tr></thead><tbody>"
      + (kr.steps || []).map(function(s, i){ return stepRow(kr, s, i); }).join("")
      + '</tbody></table></div><button type="button" class="add" data-act="add" data-kr="' + esc(kr.id) + '">+ этап</button></details>';
  }

  var tp = document.getElementById("tp");
  function findKr(id){
    var hit = null;
    (doc.objectives || []).forEach(function(o){ (o.krs || []).forEach(function(k){ if(k.id === id) hit = k; }); });
    return hit;
  }
  function render(){
    var active = document.activeElement, key = active && active.getAttribute && active.getAttribute("data-k");
    tp.innerHTML = (doc.objectives || []).map(function(o){
      var krs = (o.krs || []).map(krBlock).join("");
      var any = (o.krs || []).some(krVisible);
      return '<h3 class="tp-obj"' + (any ? "" : " hidden") + ">OBJ " + esc(o.id) + " — " + esc(o.title) + "</h3>" + krs;
    }).join("");
    if(key){ var el = tp.querySelector('[data-k="' + key.replace(/"/g, '\\"') + '"]'); if(el) el.focus(); }
    renderLoad();
    renderDirty();
  }

  /* ---------- правки ---------- */
  tp.addEventListener("change", function(e){
    var k = e.target.getAttribute("data-k");
    if(!k) return;
    var p = k.split("|"), kr = findKr(p[0]), s = kr && kr.steps[+p[1]], field = p[2], v = e.target.value;
    if(!s) return;
    if(field === "progress"){
      if(v === "") delete s.progress; else s.progress = Math.max(0, Math.min(100, Math.round(+v)));
    } else if(field === "ext"){
      s.ext = v;
      if(v) s.who = "";
    } else {
      s[field] = v;
    }
    save();
    setTimeout(render, 0);
  });
  tp.addEventListener("click", function(e){
    var b = e.target.closest("[data-act]");
    if(!b) return;
    e.preventDefault();
    var kr = findKr(b.getAttribute("data-kr")), i = +b.getAttribute("data-i"), act = b.getAttribute("data-act");
    if(!kr) return;
    if(act === "add"){
      kr.steps = kr.steps || [];
      kr.steps.push({role: "BE", title: "", ext: "", who: "", start: "", end: "", status: "TODO", result: "", action: "", comment: ""});
      save(); render();
      var el = tp.querySelector('[data-k="' + kr.id + "|" + (kr.steps.length - 1) + '|title"]');
      if(el) el.focus();
    } else if(act === "del"){
      if(confirm("Удалить этап «" + (kr.steps[i].title || "без названия") + "»?")){ kr.steps.splice(i, 1); save(); render(); }
    } else if(act === "note"){
      openSide(kr, i);
    } else if(act === "krnote"){
      openSide(kr, null);
    }
  });
  tp.addEventListener("toggle", function(e){
    var d = e.target;
    if(d.matches && d.matches("details.kr")) closed[d.getAttribute("data-kr")] = !d.open;
  }, true);

  /* ---------- заметки в боковой панели ---------- */
  var side = document.getElementById("side");
  function field(name, label, hint, value, tag){
    return "<label>" + label + (hint ? " <small>" + hint + "</small>" : "") + "</label>"
      + (tag || '<textarea data-f="' + name + '">' + esc(value) + "</textarea>");
  }
  function openSide(kr, i){
    var s = i == null ? null : kr.steps[i], form = document.getElementById("sideForm");
    document.getElementById("sideKr").textContent = "KR " + kr.id + (s ? " · этап " + kr.id + "." + (i + 1) + " · " + roleText(s) : "");
    document.getElementById("sideTitle").textContent = s ? (s.title || "Этап без названия") : kr.title;
    if(s){
      form.innerHTML = field("result", "Образ результата", "что будет готово и как это проверить", s.result)
        + field("action", "Образ действия", "как будем делать: встречи, шаги, договорённости", s.action)
        + field("comment", "Комментарий", "всё, что поможет спланировать ресурс", s.comment);
    } else {
      var owners = option("", "—", kr.owner || "") + people(null).filter(function(p, n, a){
        return a.findIndex(function(q){ return q.name === p.name; }) === n;
      }).map(function(p){ return option(p.name, p.name + " · " + p.role, kr.owner || ""); }).join("");
      form.innerHTML = field("owner", "Ответственный за KR", "", "", '<select data-f="owner">' + owners + "</select>")
        + field("result", "Образ результата", "из Scope", kr.result)
        + field("comment", "Комментарий", "блокеры, сроки, риски", kr.comment);
    }
    form.oninput = form.onchange = function(e){
      var f = e.target.getAttribute("data-f");
      if(!f) return;
      (s || kr)[f] = e.target.value;
      save(); renderDirty();
    };
    side.classList.add("open");
    document.body.setAttribute("data-side", "");
    var first = form.querySelector("textarea, select");
    if(first) first.focus();
  }
  function closeSide(){
    if(!side.classList.contains("open")) return;
    side.classList.remove("open");
    document.body.removeAttribute("data-side");
    render();
  }
  document.getElementById("sideClose").onclick = closeSide;
  document.getElementById("scrim").onclick = closeSide;
  document.addEventListener("keydown", function(e){ if(e.key === "Escape") closeSide(); });

  /* ---------- панель: фильтры и выгрузка ---------- */
  var bar = document.getElementById("tpBar");
  function renderBar(){
    var names = people(null).map(function(p){ return p.name; }).filter(function(n, i, a){ return a.indexOf(n) === i; }).sort();
    bar.innerHTML = '<label>Команда <select id="fTeam">' + option("", "все", filter.team)
      + (doc.teams || []).map(function(t){ return option(t.id, t.name, filter.team); }).join("") + "</select></label>"
      + '<label>Исполнитель <select id="fWho">' + option("", "все", filter.who) + option("__none", "без исполнителя", filter.who)
      + names.map(function(n){ return option(n, n, filter.who); }).join("") + "</select></label>"
      + '<label><input type="checkbox" id="fProb"' + (filter.problems ? " checked" : "") + "> только проблемные</label>"
      + '<button type="button" id="bOpen">Развернуть</button><button type="button" id="bClose">Свернуть</button>'
      + '<span class="sp"></span>'
      + '<button type="button" id="bTsv">Скопировать для Google Sheets</button>'
      + '<button type="button" class="primary" id="bJson">Скачать JSON</button>';
    document.getElementById("fTeam").onchange = function(e){ filter.team = e.target.value; render(); };
    document.getElementById("fWho").onchange = function(e){ filter.who = e.target.value; render(); };
    document.getElementById("fProb").onchange = function(e){ filter.problems = e.target.checked; render(); };
    document.getElementById("bOpen").onclick = function(){ closed = {}; render(); };
    document.getElementById("bClose").onclick = function(){
      (doc.objectives || []).forEach(function(o){ (o.krs || []).forEach(function(k){ closed[k.id] = true; }); });
      render();
    };
    document.getElementById("bJson").onclick = downloadJson;
    document.getElementById("bTsv").onclick = copyTsv;
  }
  var dirtyBox = document.getElementById("tpDirty");
  function renderDirty(){
    dirtyBox.hidden = !dirty;
    dirtyBox.innerHTML = dirty ? 'Есть правки в этом браузере, которых нет в файле. «Скачать JSON» — и отдайте файл агенту '
      + 'или положите вместо <code>' + esc(DATA.file) + '</code>. <button type="button" id="bReset">Сбросить правки</button>' : "";
    var r = document.getElementById("bReset");
    if(r) r.onclick = function(){
      if(!confirm("Сбросить все правки из браузера и вернуть данные файла?")) return;
      try { localStorage.removeItem(KEY); } catch(e){}
      doc = clone(DATA.doc); dirty = false; render();
    };
  }
  function downloadJson(){
    var out = clone(doc);
    out.updated = new Date().toISOString().slice(0, 10);
    if(out.status === "принято") out.status = "черновик";
    var blob = new Blob([JSON.stringify(out, null, 2) + "\n"], {type: "application/json"});
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = DATA.file;
    document.body.appendChild(a); a.click(); a.remove();
  }
  function cell(v){
    v = String(v == null ? "" : v);
    return /[\t\n"]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }
  function copyTsv(){
    var text = [COLUMNS.join("\t")].concat(tableRows().map(function(r){
      return COLUMNS.map(function(c){ return cell(r[c]); }).join("\t");
    })).join("\n");
    var done = function(){ var b = document.getElementById("bTsv"); b.textContent = "Скопировано"; setTimeout(function(){ b.textContent = "Скопировать для Google Sheets"; }, 1500); };
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(text).then(done, fallback);
    } else fallback();
    function fallback(){
      var t = document.createElement("textarea"); t.value = text; document.body.appendChild(t); t.select();
      try { document.execCommand("copy"); done(); } catch(e){} t.remove();
    }
  }

  /* ---------- нагрузка ---------- */
  function renderLoad(){
    var byWho = {}, byRole = {};
    (doc.objectives || []).forEach(function(o){ (o.krs || []).forEach(function(kr){ (kr.steps || []).forEach(function(s){
      var st = state(kr, s), r = byRole[s.role] = byRole[s.role] || {n: 0, who: 0, un: 0, no: 0, ext: 0};
      r.n++;
      if(st.ext) r.ext++; else if(st.norole) r.no++; else if(st.unassigned) r.un++; else r.who++;
      if(s.who && !st.ext){
        var w = byWho[s.who] = byWho[s.who] || {n: 0, active: 0, krs: {}, from: "", to: ""};
        w.n++; w.krs[kr.id] = 1;
        if(s.status === "IN PROGRESS" || s.status === "BLOCKED") w.active++;
        if(s.start && (!w.from || s.start < w.from)) w.from = s.start;
        if(s.end && (!w.to || s.end > w.to)) w.to = s.end;
      }
    }); }); });
    var roleOf = {};
    people(null).forEach(function(p){ roleOf[p.name] = roleOf[p.name] || p.role; });
    var who = Object.keys(byWho).sort().map(function(n){
      var w = byWho[n];
      return "<tr><td>" + esc(n) + "</td><td>" + esc(roleOf[n] || "") + '</td><td class="num">' + w.n + '</td><td class="num">'
        + w.active + "</td><td>" + esc(Object.keys(w.krs).join(", ")) + "</td><td>" + esc(w.from || "—") + " — " + esc(w.to || "—") + "</td></tr>";
    }).join("");
    var roles = ROLES.filter(function(r){ return byRole[r]; }).map(function(r){
      var x = byRole[r];
      return "<tr" + (x.no || x.un ? ' class="warn"' : "") + "><td>" + r + '</td><td class="num">' + x.n + '</td><td class="num">' + x.who
        + '</td><td class="num">' + x.un + '</td><td class="num">' + x.no + '</td><td class="num">' + x.ext + "</td></tr>";
    }).join("");
    document.getElementById("tpLoadBody").innerHTML =
      '<div class="table-wrap"><table class="mini head"><tr><td>Исполнитель</td><td>Роль</td><td>Этапов</td><td>В работе</td><td>KR</td><td>Период</td></tr>'
      + (who || '<tr><td colspan="6">никто не назначен</td></tr>') + "</table></div>"
      + '<div class="table-wrap"><table class="mini head"><tr><td>Роль</td><td>Этапов</td><td>Назначено</td><td>Без исполнителя</td>'
      + "<td>Нет роли в команде</td><td>Внешний ресурс</td></tr>" + roles + "</table></div>";
  }

  renderBar();
  render();
})();
