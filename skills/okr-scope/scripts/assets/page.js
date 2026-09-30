/* Страницы планирования (ФАКТ, ПЛАН): фильтр, карточка KR и комментарии для
   ИИ-агента. Страница ничего не правит сама: правый клик по пункту карточки
   оставляет комментарий, комментарии уходят агенту кнопкой «Скопировать для
   агента» или файлом — агент правит JSON и пересобирает страницу. */
(function(){
  var PAGE = JSON.parse(document.getElementById("page-data").textContent);
  var CARDS = PAGE.cards;
  var KEY = "okr-comments:" + PAGE.file;

  function el(tag, cls, text){
    var node = document.createElement(tag);
    if(cls) node.className = cls;
    if(text !== undefined) node.textContent = text;
    return node;
  }
  function slug(status){ return String(status || "").toLowerCase().replace(/\s+/g, "-"); }

  /* — комментарии: localStorage, только на этой машине — */
  var comments = [];
  try { comments = JSON.parse(localStorage.getItem(KEY) || "[]"); } catch(e){ comments = []; }
  function persist(){
    try { localStorage.setItem(KEY, JSON.stringify(comments)); } catch(e){}
    renderComments();
  }

  /* — фильтр в левой рейке — */
  var tab = document.getElementById("stTab");
  var drawer = document.getElementById("stDrawer");
  var rows = Array.prototype.slice.call(document.querySelectorAll("tr.row"));
  var items = Array.prototype.slice.call(drawer.querySelectorAll(".st-item"));
  function apply(value){
    rows.forEach(function(r){
      r.hidden = !!value && (r.getAttribute("data-tags") || "").split(" ").indexOf(value) < 0;
    });
    document.querySelectorAll("table.pick").forEach(function(t){
      t.closest(".table-wrap").hidden = !t.querySelectorAll("tr.row:not([hidden])").length;
    });
    items.forEach(function(b){
      if(b.getAttribute("data-value") === value) b.setAttribute("data-active", "");
      else b.removeAttribute("data-active");
    });
    var active = items.filter(function(b){ return b.hasAttribute("data-active"); })[0];
    document.getElementById("stNow").textContent = value ? active.getAttribute("data-name") : "все";
  }
  function toggle(){
    drawer.classList.toggle("open");
    document.body.classList.toggle("drawer-open", drawer.classList.contains("open"));
  }
  tab.addEventListener("click", toggle);
  drawer.querySelector(".drawer-close").addEventListener("click", toggle);
  items.forEach(function(b){
    b.addEventListener("click", function(){ apply(b.getAttribute("data-value")); toggle(); });
  });

  /* — карточка KR: только чтение, всё уже посчитано okr-plan.py — */
  var side = document.getElementById("side");
  var note = document.getElementById("sideNote");
  var openId = null;

  function segsNode(list, count){
    var wrap = el("span");
    if(!list || !list.length) return wrap;
    var box = el("span", "segs");
    list.forEach(function(s){
      var seg = el("i", "seg s-" + slug(s.status));
      seg.title = s.role + " · " + s.step + " · " + s.status;
      box.appendChild(seg);
    });
    wrap.appendChild(box);
    wrap.appendChild(el("span", "segn", count));
    return wrap;
  }
  function blockNode(b, section){
    var node;
    if(b.t === "step"){
      node = el("div", "step");
      node.appendChild(el("span", "role", b.role));
      node.appendChild(el("span", "txt", b.v));
      if(b.s){
        var badge = el("span", "badge", b.s);
        badge.setAttribute("data-s", slug(b.s));
        node.appendChild(badge);
      }
    } else {
      node = el("div", "b", b.v);
      node.setAttribute("data-t", b.t);
    }
    node.setAttribute("data-sec", b.t === "h" ? b.v : section);
    node.setAttribute("data-quote", b.t === "step" ? b.role + " · " + b.v : b.v);
    return node;
  }
  function open(id){
    var card = CARDS[id];
    if(!card) return;
    openId = id;
    document.getElementById("sideKr").textContent = card.head;
    var title = document.getElementById("sideTitle");
    title.textContent = card.title;
    title.setAttribute("data-sec", "Название");
    title.setAttribute("data-quote", card.title);
    var line = document.getElementById("sideState");
    line.textContent = card.line;
    line.setAttribute("data-sec", "Статус");
    line.setAttribute("data-quote", card.line);
    var segs = document.getElementById("sideSegs");
    segs.innerHTML = "";
    segs.appendChild(segsNode(card.segs, card.segsCount));
    note.innerHTML = "";
    var section = "";
    card.blocks.forEach(function(b){
      if(b.t === "h") section = b.v;
      note.appendChild(blockNode(b, section));
    });
    markCommented();
    side.classList.add("open");
    document.body.setAttribute("data-side", "");
  }
  function close(){
    openId = null;
    hidePopover();
    side.classList.remove("open");
    document.body.removeAttribute("data-side");
  }
  document.getElementById("sideClose").addEventListener("click", close);
  document.getElementById("scrim").addEventListener("click", close);
  rows.forEach(function(r){
    r.addEventListener("click", function(){ open(r.getAttribute("data-kr")); });
  });
  document.addEventListener("keydown", function(e){ if(e.key === "Escape"){ selBtn.hidden = true; if(pop) hidePopover(); else close(); } });

  /* — правый клик: комментарий к пункту — */
  var pop = null;
  function hidePopover(){ if(pop){ pop.remove(); pop = null; } }
  /* Выделенная мышью зона карточки: цитата — сам текст, разделы — все задетые. */
  function selectionTarget(){
    var sel = window.getSelection();
    if(!openId || !sel.rangeCount || sel.isCollapsed) return null;
    var quote = sel.toString().replace(/\s+/g, " ").trim();
    if(!quote || !side.contains(sel.getRangeAt(0).commonAncestorContainer)) return null;
    var hit = Array.prototype.filter.call(side.querySelectorAll("[data-sec]"), function(n){
      return sel.containsNode(n, true);
    });
    var sections = [];
    hit.forEach(function(n){
      var sec = n.getAttribute("data-sec");
      if(sections.indexOf(sec) < 0) sections.push(sec);
    });
    return {kr: openId, section: sections.join(" / ") || "Выделение",
            quote: quote.length > 400 ? quote.slice(0, 400) + "…" : quote,
            blocks: hit.map(function(n){ return n.getAttribute("data-quote"); })};
  }
  function targetOf(e){
    var picked = selectionTarget();
    if(picked) return picked;
    var node = e.target.closest("[data-sec]");
    if(node && side.contains(node) && openId) return {kr: openId, section: node.getAttribute("data-sec"), quote: node.getAttribute("data-quote")};
    var row = e.target.closest("tr.row");
    if(row) return {kr: row.getAttribute("data-kr"), section: "KR целиком", quote: CARDS[row.getAttribute("data-kr")].title};
    return null;
  }
  function sameTarget(c, t){ return c.kr === t.kr && c.section === t.section && c.quote === t.quote; }
  function showPopover(t, x, y){
    hidePopover();
    pop = el("div", "popover");
    pop.appendChild(el("div", "pmeta", "Комментарий для ИИ-агента · KR " + t.kr + " · " + t.section));
    if(t.quote && t.quote !== t.section) pop.appendChild(el("div", "pquote", t.quote));
    var existing = comments.filter(function(c){ return sameTarget(c, t); });
    existing.forEach(function(c){
      var item = el("div", "pex-item", c.text);
      var del = el("button", "pex-del", "удалить");
      del.type = "button";
      del.addEventListener("click", function(){
        comments = comments.filter(function(x){ return x !== c; });
        persist();
        showPopover(t, x, y);
      });
      item.appendChild(el("br"));
      item.appendChild(del);
      pop.appendChild(item);
    });
    var area = el("textarea");
    area.placeholder = "Что поправить: дописать риск, другая готовность, другое следующее действие…";
    pop.appendChild(area);
    var row = el("div", "prow");
    var ok = el("button", "", "Оставить");
    ok.type = "button";
    var cancel = el("button", "cancel", "Отмена");
    cancel.type = "button";
    row.appendChild(ok);
    row.appendChild(cancel);
    pop.appendChild(row);
    ok.addEventListener("click", function(){
      var text = area.value.trim();
      if(!text) return;
      var c = {kr: t.kr, section: t.section, quote: t.quote, text: text, at: new Date().toISOString()};
      if(t.blocks) c.blocks = t.blocks;
      comments.push(c);
      persist();
      hidePopover();
    });
    cancel.addEventListener("click", hidePopover);
    area.addEventListener("keydown", function(e){ if(e.key === "Enter" && (e.metaKey || e.ctrlKey)) ok.click(); });
    document.body.appendChild(pop);
    var w = pop.offsetWidth, h = pop.offsetHeight;
    pop.style.left = Math.max(8, Math.min(x, window.scrollX + document.documentElement.clientWidth - w - 8)) + "px";
    pop.style.top = Math.max(8, Math.min(y, window.scrollY + document.documentElement.clientHeight - h - 8)) + "px";
    area.focus();
  }
  document.addEventListener("contextmenu", function(e){
    var t = targetOf(e);
    if(!t) return;
    e.preventDefault();
    showPopover(t, e.pageX, e.pageY);
  });
  /* Телефон: долгое нажатие вместо правого клика (iOS не шлёт contextmenu). */
  var pressTimer = null, pressed = false, pressAt = 0;
  function pressCancel(){ if(pressTimer){ clearTimeout(pressTimer); pressTimer = null; } }
  document.addEventListener("touchstart", function(e){
    pressCancel();
    if(pop && pop.contains(e.target)) return;
    var touch = e.touches[0], target = e.target;
    pressTimer = setTimeout(function(){
      pressTimer = null;
      if(pop) return;
      var t = targetOf({target: target});
      if(!t) return;
      pressed = true;
      pressAt = Date.now();
      showPopover(t, touch.pageX, touch.pageY);
    }, 600);
  }, {passive: true});
  ["touchmove", "touchend", "touchcancel"].forEach(function(n){ document.addEventListener(n, pressCancel, {passive: true}); });
  /* После долгого нажатия тап не должен открывать карточку строки. */
  document.addEventListener("click", function(e){
    if(pressed){ pressed = false; e.stopPropagation(); e.preventDefault(); }
  }, true);
  /* Кнопка у выделения — для тех, кому правый клик неудобен. */
  var selBtn = el("button", "sel-btn", "Комментировать выделенное");
  selBtn.type = "button";
  selBtn.hidden = true;
  document.body.appendChild(selBtn);
  var selPicked = null;
  document.addEventListener("mousedown", function(e){
    if(pop && !pop.contains(e.target) && Date.now() - pressAt > 800) hidePopover();
    if(e.target !== selBtn) selBtn.hidden = true;
  });
  side.addEventListener("mouseup", function(e){
    setTimeout(function(){
      selPicked = selectionTarget();
      if(!selPicked || pop){ selBtn.hidden = true; return; }
      selBtn.hidden = false;
      selBtn.style.left = Math.max(8, Math.min(e.pageX, window.scrollX + document.documentElement.clientWidth - selBtn.offsetWidth - 8)) + "px";
      selBtn.style.top = (e.pageY + 12) + "px";
    }, 0);
  });
  var selTimer = null;
  document.addEventListener("selectionchange", function(){
    if(!window.matchMedia("(pointer:coarse)").matches) return;
    clearTimeout(selTimer);
    selTimer = setTimeout(function(){
      selPicked = selectionTarget();
      selBtn.hidden = !selPicked || !!pop;
    }, 300);
  });
  selBtn.addEventListener("mousedown", function(e){ e.preventDefault(); });
  selBtn.addEventListener("click", function(){
    var t = selPicked;
    selBtn.hidden = true;
    if(t) showPopover(t, parseInt(selBtn.style.left, 10), parseInt(selBtn.style.top, 10));
  });

  /* — отметки и панель комментариев — */
  function markCommented(){
    rows.forEach(function(r){
      var id = r.getAttribute("data-kr");
      if(comments.some(function(c){ return c.kr === id; })) r.setAttribute("data-commented", "");
      else r.removeAttribute("data-commented");
    });
    if(!openId) return;
    side.querySelectorAll("[data-sec]").forEach(function(node){
      var t = {kr: openId, section: node.getAttribute("data-sec"), quote: node.getAttribute("data-quote")};
      if(comments.some(function(c){
        return sameTarget(c, t) || (c.kr === openId && c.blocks && c.blocks.indexOf(t.quote) >= 0);
      })) node.setAttribute("data-commented", "");
      else node.removeAttribute("data-commented");
    });
  }
  function agentPrompt(){
    var lines = ["Комментарии PO к " + PAGE.file + " — поправь JSON по каждому пункту:", ""];
    comments.forEach(function(c, n){
      var quote = c.quote && c.quote !== c.section ? " — «" + c.quote + "»" : "";
      lines.push((n + 1) + ". KR " + c.kr + " · " + c.section + quote + ": " + c.text);
    });
    lines.push("", "После правок прогони okr-plan.py lint и render и отчитайся по каждому пункту.");
    return lines.join("\n");
  }
  var btn = document.getElementById("commentsBtn");
  var panel = document.getElementById("commentsPanel");
  function renderComments(){
    btn.textContent = "Комментарии: " + comments.length;
    var list = document.getElementById("commentsList");
    list.innerHTML = "";
    if(!comments.length){
      list.appendChild(el("p", "empty", "Пока нет. Правый клик по пункту карточки или строке таблицы, или выделите зону в карточке — комментарий для ИИ-агента."));
    }
    comments.forEach(function(c){
      var item = el("div", "item");
      item.appendChild(el("div", "where", "KR " + c.kr + " · " + c.section));
      item.appendChild(el("div", "", c.text));
      var del = el("button", "", "удалить");
      del.type = "button";
      del.addEventListener("click", function(){ comments = comments.filter(function(x){ return x !== c; }); persist(); });
      item.appendChild(del);
      list.appendChild(item);
    });
    document.getElementById("commentsPrompt").value = comments.length ? agentPrompt() : "";
    markCommented();
  }
  btn.addEventListener("click", function(){ panel.classList.toggle("open"); });
  document.getElementById("commentsCopy").addEventListener("click", function(){
    var area = document.getElementById("commentsPrompt");
    area.select();
    if(navigator.clipboard) navigator.clipboard.writeText(area.value);
    else document.execCommand("copy");
  });
  document.getElementById("commentsSave").addEventListener("click", function(){
    var a = el("a");
    var body = JSON.stringify({file: PAGE.file, comments: comments}, null, 2) + "\n";
    a.href = URL.createObjectURL(new Blob([body], {type: "application/json"}));
    a.download = PAGE.file.replace(/\.json$/, "") + ".comments.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
  });
  document.getElementById("commentsClear").addEventListener("click", function(){
    if(!comments.length || !window.confirm("Удалить все комментарии на этой странице?")) return;
    comments = [];
    persist();
  });
  /* Телефон: описание цели сжато до нескольких строк, тап раскрывает. */
  document.querySelectorAll("tr.objrow").forEach(function(r){
    r.addEventListener("click", function(){
      if(r.hasAttribute("data-open")) r.removeAttribute("data-open"); else r.setAttribute("data-open", "");
    });
  });
  renderComments();
})();
