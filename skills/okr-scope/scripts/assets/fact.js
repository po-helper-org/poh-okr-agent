/* Страница ФАКТ: фильтр по исходу и карточка KR. Только чтение — всё, что
   показывается, уже посчитано okr-plan.py и лежит в #fact-data. */
(function(){
  var DATA = JSON.parse(document.getElementById("fact-data").textContent);
  var STATUS_NAME = {"done": "DONE", "progress": "IN PROGRESS", "todo": "TODO", "none": "нет статуса", "dropped": "снято"};

  var tab = document.getElementById("stTab");
  var drawer = document.getElementById("stDrawer");
  var rows = Array.prototype.slice.call(document.querySelectorAll("tr.row"));
  var items = Array.prototype.slice.call(drawer.querySelectorAll(".st-item"));

  function syncBlocks(){
    document.querySelectorAll("table.fact").forEach(function(tbl){
      var visible = tbl.querySelectorAll("tbody tr.row:not([hidden])").length;
      tbl.closest(".table-wrap").hidden = !visible;
    });
  }
  function apply(state){
    rows.forEach(function(r){ r.hidden = !!state && r.getAttribute("data-state") !== state; });
    syncBlocks();
    items.forEach(function(b){
      if((b.getAttribute("data-state") || "") === state) b.setAttribute("data-active", "");
      else b.removeAttribute("data-active");
    });
    var active = items.filter(function(b){ return b.hasAttribute("data-active"); })[0];
    document.getElementById("stNow").textContent = state ? active.getAttribute("data-name") : "все";
  }
  function toggle(){
    drawer.classList.toggle("open");
    document.body.classList.toggle("drawer-open", drawer.classList.contains("open"));
  }
  tab.addEventListener("click", toggle);
  drawer.querySelector(".drawer-close").addEventListener("click", toggle);
  items.forEach(function(b){
    b.addEventListener("click", function(){ apply(b.getAttribute("data-state") || ""); toggle(); });
  });

  var side = document.getElementById("side");
  var note = document.getElementById("sideNote");
  function el(tag, cls, text){
    var node = document.createElement(tag);
    if(cls) node.className = cls;
    if(text !== undefined) node.textContent = text;
    return node;
  }
  function block(type, text){
    var div = el("div", "b", text);
    div.setAttribute("data-t", type);
    note.appendChild(div);
  }
  function segline(plan){
    var box = el("span", "segs");
    plan.forEach(function(s){
      var seg = el("i", "seg s-" + s.status);
      seg.title = s.role + " · " + s.step + " · " + (STATUS_NAME[s.status] || s.status);
      box.appendChild(seg);
    });
    return box;
  }
  function steps(title, list){
    if(!list || !list.length) return;
    block("h", title);
    list.forEach(function(s){
      var row = el("div", "step");
      row.setAttribute("data-s", s.status);
      row.appendChild(el("span", "role", s.role));
      row.appendChild(el("span", "txt", s.step));
      var badge = el("span", "badge", STATUS_NAME[s.status] || s.status);
      badge.setAttribute("data-s", s.status);
      row.appendChild(badge);
      note.appendChild(row);
    });
  }
  function list(title, values){
    if(!values || !values.length) return;
    block("h", title);
    values.forEach(function(v){ block("li", v); });
  }

  function open(kr){
    var d = DATA[kr];
    if(!d) return;
    document.getElementById("sideKr").textContent = kr + " · " + d.obj;
    document.getElementById("sideTitle").textContent = d.title;
    var line = document.getElementById("sideState");
    line.textContent = d.stateLine;
    if(d.plan.length){
      line.appendChild(document.createElement("br"));
      line.appendChild(segline(d.plan));
      line.appendChild(el("span", "segn", d.planCount));
    }
    note.innerHTML = "";
    if(d.goal){ block("h", "Образ результата"); block("p", d.goal); }
    steps("Процессный roadmap", d.plan);
    steps("Зависимости", d.deps);
    list("Риски", d.risks);
    block("h", "Фактическая готовность");
    block("p", d.fact);
    block("h", "Следующие действия");
    block("p", d.next);
    if(d.link) block("p", d.link);
    list("Исполнители", d.who);
    side.classList.add("open");
    document.body.setAttribute("data-side", "");
  }
  function close(){
    side.classList.remove("open");
    document.body.removeAttribute("data-side");
  }
  document.getElementById("sideClose").addEventListener("click", close);
  document.getElementById("scrim").addEventListener("click", close);
  rows.forEach(function(r){
    r.addEventListener("click", function(){ open(r.getAttribute("data-kr")); });
  });
  document.addEventListener("keydown", function(e){ if(e.key === "Escape") close(); });
})();
