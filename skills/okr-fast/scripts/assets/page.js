(function(){
  var STORE = "okr-pick-proto:2026Q4";
  var QUARTER = "2026Q4";
  var DOC = ".okr/2026Q4/OKR-2026Q4.md";

  /* Заметка KR по умолчанию. Разделы — обычные заголовки внутри текста, а не поля
     формы: PO дописывает что угодно, ничего не спрашивая у разметки. */
  var NOTES = {
    "1.1": "## Образ результата\nПокупатель оформляет возврат сам, обращение в поддержку не нужно.\n\n## How to demo\n- Открыть заказ в личном кабинете\n- Нажать «Вернуть билет», выбрать места\n- Увидеть сумму возврата и срок зачисления\n- Подтвердить: заявка уходит без письма в поддержку\n\n## БФТ\nБФТ-104",
    "1.2": "## Образ результата\nПокупатель меняет билет на другой сеанс того же мероприятия.\n\n## How to demo\n- Открыть заказ, нажать «Обменять»\n- Выбрать другой сеанс\n- Доплатить разницу или получить возврат остатка\n- Старый билет гасится, новый приходит на почту",
    "1.3": "## Образ результата\nТекст правил на странице билета совпадает с поведением системы.\n\n## How to demo\n- Открыть страницу билета\n- Правила видны без перехода в справку\n- Сроки и удержания совпадают с расчётом при возврате\n\n## БФТ\nБФТ-118",
    "1.4": "## Образ результата\nПокупатель возвращает часть мест, остальные остаются действующими.\n\n## How to demo\n[] сценарий не написан",
    "1.5": "## Образ результата\nГость возвращает билет по ссылке из письма, без входа в кабинет.\n\n## How to demo\n[] сценарий не написан",
    "2.1": "## Образ результата\nДеньги приходят на карту не позже трёх рабочих дней после заявки.\n\n## How to demo\n- Оформить возврат по карте\n- Заявка уходит в эквайринг в тот же день\n- Деньги на карте за три рабочих дня, статус «зачислено»\n\n## БФТ\nБФТ-121\n\n## Зависимости\n> Срок по картам другого эмитента банк пока не подтвердил.",
    "2.2": "## Образ результата\nЕжедневная сверка возвратов с выпиской расходится не больше чем на 0,1 процента.\n\n## How to demo\n- Ночной джоб сверяет возвраты с выпиской\n- Расхождение больше порога поднимает алерт\n- Отчёт сверки лежит в админке за каждый день\n\n## Зависимости\n> Нужен доступ к API банка.",
    "2.3": "## Образ результата\nПокупатель получает письмо на каждом шаге возврата.\n\n## How to demo\n- Оформить возврат\n- Письма приходят на приём заявки, отправку в банк, зачисление",
    "2.4": "## Образ результата\nВозврат уходит тем же способом, каким платили.\n\n## How to demo\n[] сценарий не написан",
    "2.5": "## Образ результата\nОтмена мероприятия запускает возврат без участия оператора.\n\n## How to demo\n- Организатор отменяет мероприятие\n- Система заводит возвраты по всем заказам\n- Оператор видит прогресс списком\n\n## БФТ\nБФТ-133",
    "2.6": "## Образ результата\nСервисный сбор возвращается по правилам мероприятия, а не вручную.\n\n## How to demo\n[] сценарий не написан",
    "3.1": "## Образ результата\nОператор видит стадию возврата и причину задержки.\n\n## How to demo\n- Открыть заказ в админке\n- Видна стадия: принят, отправлен в банк, зачислено\n- При задержке видна причина и дата следующей попытки",
    "3.2": "## Образ результата\nОтчёт по причинам возвратов собирается без ручной выгрузки.\n\n## How to demo\n[] сценарий не написан",
    "3.3": "## Образ результата\nОператор возвращает заказы списком, а не по одному.\n\n## How to demo\n- Отфильтровать заказы по мероприятию\n- Отметить нужные, нажать «Вернуть»\n- Возвраты уходят пачкой, отчёт в том же экране",
    "3.4": "## Образ результата\nОператор видит переписку по заказу в одном окне с заказом.\n\n## How to demo\n[] сценарий не написан",
    "3.5": "## Образ результата\nСрок возврата виден на дашборде поддержки за день.\n\n## How to demo\n- Открыть дашборд поддержки\n- Средний и максимальный срок возврата видны без выгрузки",
    "3.6": "## Образ результата\nВыгрузка возвратов уходит в 1С по расписанию.\n\n## How to demo\n[] сценарий не написан"
  };

  function load(){ try{ return JSON.parse(localStorage.getItem(STORE) || "{}"); }catch(e){ return {}; } }
  function write(state){ try{ localStorage.setItem(STORE, JSON.stringify(state)); }catch(e){} }

  var PBV_OPTIONS = ["—","0","1","2","3","4","5","6","7","8","9"];

  /* Ступень веса. Границы взяты из шкалы PBV 1—9: 8—9 квартал не отдаёт, 5—7
     двигают метрику, 1—4 мелочь, 0 — вес не назначали вовсе. */
  function tierOf(pbv){
    if(pbv === null || pbv === "—") return "none";
    var n = Number(pbv);
    if(n >= 8) return "high";
    if(n >= 5) return "mid";
    if(n >= 1) return "low";
    return "zero";
  }

  function paintPbv(cell){
    var value = cell.querySelector("select").value;
    var tier = tierOf(value === "—" ? null : value);
    cell.setAttribute("data-tier", tier);
    cell.toggleAttribute("data-empty", tier === "none");
  }
  function rows(){ return Array.prototype.slice.call(document.querySelectorAll("tr.row")); }

  /* Снимок разметки до восстановления состояния: правка — это отличие от него,
     а не сам факт, что PO трогал поле. */
  var BASE = {};
  rows().forEach(function(row){
    BASE[row.getAttribute("data-kr")] = {
      take: row.querySelector("td.take input").checked,
      pbv: row.querySelector("td.pbv select").value,
      title: row.children[1].textContent.trim()
    };
  });

  function readRow(row){
    var pbv = row.querySelector("td.pbv select").value;
    return {
      kr: row.getAttribute("data-kr"),
      title: row.children[1].textContent.trim(),
      goal: row.children[2].textContent.trim(),
      take: row.querySelector("td.take input").checked,
      pbv: pbv === "—" ? null : pbv,
      isNew: row.hasAttribute("data-new")
    };
  }

  /* Заготовка карточки. Разделы предзаполнены, чтобы PO не тратил время на
     набор заголовков, но это обычная заметка: разделы можно переименовать,
     удалить, поменять местами и дописать свои. */
  var SKELETON = ["Подход к оценке результата", "План", "Вопросы", "Риски", "Исполнители"];

  /** Раскладывает заметку по заготовке: известные разделы встают по порядку,
      недостающие добавляются пустыми, чужие остаются в конце. */
  function applySkeleton(md){
    var found = {}, order = [], current = null;
    (md || "").split("\n").forEach(function(line){
      var head = line.match(/^#{1,6}\s+(.*)$/);
      if(head){
        current = head[1].trim();
        if(!found[current]){ found[current] = []; order.push(current); }
        return;
      }
      if(current === null){
        // Текст до первого заголовка — это подход к оценке: в листе планирования
        // он и лежит первой колонкой.
        current = SKELETON[0];
        if(!found[current]){ found[current] = []; order.push(current); }
      }
      found[current].push(line);
    });

    var extra = order.filter(function(name){ return SKELETON.indexOf(name) === -1; });
    var lines = [];
    SKELETON.concat(extra).forEach(function(name){
      lines.push("## " + name);
      var body = (found[name] || []).join("\n").replace(/^\n+|\n+$/g, "");
      lines.push(body);
      lines.push("");
    });
    return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  function noteOf(kr){
    var state = load();
    // Правленую заметку не трогаем: если PO снёс раздел, он снесён.
    if(state.notes && state.notes[kr] !== undefined) return state.notes[kr];
    return applySkeleton(NOTES[kr] || "");
  }

  function persist(){
    var state = load();
    state.pick = {};
    rows().forEach(function(row){
      var r = readRow(row);
      if(!r.isNew) state.pick[r.kr] = { take:r.take, pbv:r.pbv };
    });
    state.added = (state.added || []).map(function(item){
      var row = document.querySelector('tr.row[data-kr="' + item.kr + '"]');
      if(!row) return item;
      var r = readRow(row);
      return { kr:item.kr, obj:item.obj, text:item.text, take:r.take, pbv:r.pbv };
    });
    write(state);
  }

  /* ——— заметка: markdown ⇄ блоки ———
     Блок — строка со своим типом. Тип виден по виду, а не по значку: заголовок
     крупнее, у пункта списка точка, у дела — квадрат. */
  var note = document.getElementById("sideNote");

  function block(type, text, done){
    var div = document.createElement("div");
    div.className = "b";
    div.setAttribute("data-t", type);
    if(type === "todo"){
      var tick = document.createElement("button");
      tick.type = "button";
      tick.className = "tick";
      tick.contentEditable = "false";
      div.appendChild(tick);
      if(done) div.setAttribute("data-done", "");
    }
    div.appendChild(document.createTextNode(text || ""));
    if(type === "hr") div.contentEditable = "false";
    return div;
  }

  function fromMarkdown(md){
    note.innerHTML = "";
    (md || "").split("\n").forEach(function(line){
      if(/^#{1,6}\s+/.test(line)) note.appendChild(block("h", line.replace(/^#{1,6}\s+/, "")));
      else if(/^-\s+\[( |x)\]\s*/i.test(line)) note.appendChild(block("todo", line.replace(/^-\s+\[( |x)\]\s*/i, ""), /\[x\]/i.test(line)));
      else if(/^\[\]\s*/.test(line)) note.appendChild(block("todo", line.replace(/^\[\]\s*/, "")));
      else if(/^[-*]\s+/.test(line)) note.appendChild(block("li", line.replace(/^[-*]\s+/, "")));
      else if(/^>\s?/.test(line)) note.appendChild(block("quote", line.replace(/^>\s?/, "")));
      else if(/^---+$/.test(line)) note.appendChild(block("hr", ""));
      else note.appendChild(block("p", line));
    });
    if(!note.firstChild) note.appendChild(block("p", ""));
  }

  function toMarkdown(){
    return Array.prototype.slice.call(note.children).map(function(b){
      var type = b.getAttribute("data-t");
      var text = (b.textContent || "").trim();
      if(type === "h") return "## " + text;
      if(type === "li") return "- " + text;
      if(type === "todo") return "- [" + (b.hasAttribute("data-done") ? "x" : " ") + "] " + text;
      if(type === "quote") return "> " + text;
      if(type === "hr") return "---";
      return text;
    }).join("\n").replace(/\n{3,}/g, "\n\n");
  }

  function currentBlock(){
    var sel = window.getSelection();
    if(!sel.rangeCount) return null;
    var node = sel.getRangeAt(0).startContainer;
    while(node && node !== note && node.parentNode !== note) node = node.parentNode;
    return node === note ? null : node;
  }

  function caretToEnd(el){
    var range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  var SHORTCUT = { "# ":"h", "- ":"li", "[] ":"todo", "> ":"quote" };

  note.addEventListener("beforeinput", function(e){
    var b = currentBlock();
    if(!b) return;

    if(e.inputType === "insertParagraph"){
      e.preventDefault();
      // Пустой список или дело — выход в обычный абзац, а не бесконечный список.
      var type = b.getAttribute("data-t");
      if((type === "li" || type === "todo") && !b.textContent.trim()){
        b.replaceWith(block("p", ""));
        return;
      }
      var next = block(type === "li" || type === "todo" ? type : "p", "");
      b.after(next);
      caretToEnd(next);
      save();
      return;
    }

    if(e.inputType === "insertText" && e.data === " "){
      var head = (b.textContent || "").slice(0, 3);
      for(var prefix in SHORTCUT){
        if((head + " ").startsWith(prefix) && b.getAttribute("data-t") === "p"){
          e.preventDefault();
          var rest = b.textContent.slice(prefix.length - 1);
          var made = block(SHORTCUT[prefix], rest);
          b.replaceWith(made);
          caretToEnd(made);
          save();
          return;
        }
      }
    }

    if(e.inputType === "insertText" && e.data === "-" && b.textContent === "--"){
      e.preventDefault();
      var hr = block("hr", "");
      var after = block("p", "");
      b.replaceWith(hr);
      hr.after(after);
      caretToEnd(after);
      save();
      return;
    }

    if(e.inputType === "deleteContentBackward" && !b.textContent.trim() && b.getAttribute("data-t") !== "p"){
      e.preventDefault();
      var plain = block("p", "");
      b.replaceWith(plain);
      caretToEnd(plain);
      save();
    }
  });

  note.addEventListener("click", function(e){
    var tick = e.target.closest(".tick");
    if(!tick) return;
    var b = tick.parentElement;
    b.toggleAttribute("data-done");
    save();
  });

  var currentKr = null;
  function save(){
    if(!currentKr) return;
    var state = load();
    state.notes = state.notes || {};
    state.notes[currentKr] = toMarkdown();
    state.titles = state.titles || {};
    var title = document.getElementById("sideTitle").textContent.trim();
    if(title) state.titles[currentKr] = title;
    write(state);
    var row = document.querySelector('tr.row[data-kr="' + currentKr + '"]');
    if(row && title) row.children[1].textContent = title;
    paintComments();
  renderChanges();
  }
  note.addEventListener("input", save);
  document.getElementById("sideTitle").addEventListener("input", save);

  /* — карточка — */
  var side = document.getElementById("side");
  var scrim = document.createElement("div");
  scrim.className = "scrim";
  document.body.appendChild(scrim);
  scrim.addEventListener("click", function(){ closeCard(); });

  function openSide(){ side.classList.add("open"); document.body.setAttribute("data-side", ""); }
  function closeCard(){ side.classList.remove("open"); document.body.removeAttribute("data-side"); }
  function openCard(row){
    var r = readRow(row);
    currentKr = r.kr;
    document.getElementById("sideKr").textContent = r.kr + (r.isNew ? " · новый" : "");
    document.getElementById("sideTitle").textContent = (load().titles || {})[r.kr] || r.title;
    var tag = '<span class="pbvtag" data-tier="' + tierOf(r.pbv) + '">' +
      (r.pbv === null ? "PBV не задан" : "PBV " + r.pbv) + "</span>";
    document.getElementById("sideTake").innerHTML =
      (r.take ? "в квартал: <b>да</b>" : 'в квартал: <b class="no">нет</b>') + " · " + tag;
    fromMarkdown(noteOf(r.kr) || applySkeleton("## Подход к оценке результата\n" + r.title));
    openSide();
  }
  document.getElementById("sideClose").addEventListener("click", closeCard);
  document.addEventListener("keydown", function(e){
    if(e.key === "Escape" && !e.target.closest(".note")) closeCard();
  });

  /* Клик мимо карточки закрывает её. Строка таблицы исключена: клик по соседнему
     KR переключает карточку, а не закрывает и открывает её заново. */
  document.addEventListener("click", function(e){
    if(!side.classList.contains("open")) return;
    if(e.target.closest(".side") || e.target.closest("tr.row") ||
       e.target.closest(".promptbox") || e.target.closest(".bar")) return;
    closeCard();
  });

  /* — комментарий по строке —
     Правая кнопка вместо значка в ячейке: колонок и так пять, а замечание
     оставляют изредка. Форма и поведение те же, что у комментариев БФТ. */
  var pop = null;
  function closePopover(){ if(pop){ pop.remove(); pop = null; } }

  function commentsOf(kr){ return (load().comments || {})[kr] || []; }

  function paintComments(){
    rows().forEach(function(row){
      var has = commentsOf(row.getAttribute("data-kr")).length > 0;
      row.toggleAttribute("data-commented", has);
    });
  }

  function openComment(row, x, y){
    closePopover();
    var kr = row.getAttribute("data-kr");
    var title = row.children[1].textContent.trim();
    var mine = commentsOf(kr);
    pop = document.createElement("div");
    pop.className = "popover";
    pop.style.left = Math.max(8, Math.min(x, window.innerWidth - 296)) + "px";
    pop.style.top = (y + window.scrollY + 4) + "px";
    pop.innerHTML =
      '<div class="pmeta">' + kr + "</div>" +
      '<div class="pquote">' + title.replace(/[&<>]/g, "") + "</div>" +
      (mine.length ? '<div class="pexisting"><div class="pexisting-title">Уже сказано</div>' +
        mine.map(function(t, i){
          return '<div class="pex-item">' + t.replace(/[&<>]/g, "") +
                 '<button class="pex-del" type="button" data-i="' + i + '">удалить</button></div>';
        }).join("") + "</div>" : "") +
      '<textarea placeholder="Замечание по KR (Ctrl+Enter — сохранить)"></textarea>' +
      '<div class="prow"><button class="save" type="button">Сохранить</button>' +
      '<button class="cancel" type="button">Отмена</button></div>';
    document.body.appendChild(pop);
    var ta = pop.querySelector("textarea");
    ta.focus();

    function commit(){
      var text = ta.value.trim();
      if(text){
        var st = load();
        st.comments = st.comments || {};
        st.comments[kr] = (st.comments[kr] || []).concat(text);
        write(st);
        paintComments();
        renderChanges();
      }
      closePopover();
    }
    pop.querySelector(".save").addEventListener("click", commit);
    pop.querySelector(".cancel").addEventListener("click", closePopover);
    pop.querySelectorAll(".pex-del").forEach(function(btn){
      btn.addEventListener("click", function(){
        var st = load();
        st.comments[kr].splice(Number(btn.getAttribute("data-i")), 1);
        if(!st.comments[kr].length) delete st.comments[kr];
        write(st);
        paintComments();
        renderChanges();
        closePopover();
      });
    });
    ta.addEventListener("keydown", function(e){
      if((e.ctrlKey || e.metaKey) && e.key === "Enter"){ e.preventDefault(); commit(); }
      if(e.key === "Escape"){ closePopover(); }
    });
  }

  document.addEventListener("click", function(e){
    if(pop && !e.target.closest(".popover")) closePopover();
  });

  /* — строка — */
  function bindRow(row){
    row.addEventListener("contextmenu", function(e){
      e.preventDefault();
      openComment(row, e.clientX, e.clientY);
    });
    row.addEventListener("click", function(e){
      if(e.target.closest("td.take") || e.target.closest("td.pbv")) return;
      openCard(row);
    });
    var box = row.querySelector("td.take input");
    box.addEventListener("change", function(){
      row.setAttribute("data-take", box.checked ? "yes" : "no");
      persist();
      renderChanges();
      if(currentKr === row.getAttribute("data-kr") && side.classList.contains("open")) openCard(row);
    });
    var pbv = row.querySelector("td.pbv select");
    pbv.addEventListener("change", function(){
      paintPbv(pbv.closest("td"));
      persist();
      renderChanges();
      if(currentKr === row.getAttribute("data-kr") && side.classList.contains("open")) openCard(row);
    });
  }

  var state = load();
  rows().forEach(function(row){
    var saved = (state.pick || {})[row.getAttribute("data-kr")];
    if(saved){
      if(typeof saved.take === "boolean"){
        row.querySelector("td.take input").checked = saved.take;
        row.setAttribute("data-take", saved.take ? "yes" : "no");
      }
      if(saved.pbv){ row.querySelector("td.pbv select").value = saved.pbv; }
    }
    var title = (state.titles || {})[row.getAttribute("data-kr")];
    if(title) row.children[1].textContent = title;
    paintPbv(row.querySelector("td.pbv"));
    bindRow(row);
  });

  /* — новый KR текстом — */
  function makeRow(item){
    var tbody = document.querySelector("#" + item.obj).nextElementSibling.querySelector("tbody");
    var tr = document.createElement("tr");
    tr.className = "row";
    tr.setAttribute("data-kr", item.kr);
    tr.setAttribute("data-new", "");
    tr.setAttribute("data-take", item.take === false ? "no" : "yes");
    var options = PBV_OPTIONS.map(function(v){
      return "<option" + (String(item.pbv) === v ? " selected" : "") + ">" + v + "</option>";
    }).join("");
    tr.innerHTML =
      '<td class="kr">' + item.kr + "</td>" +
      "<td>" + item.text + "</td>" +
      '<td class="goal">формулировку напишет агент</td>' +
      '<td class="pbv"' + (item.pbv ? "" : " data-empty") + '><select data-field="pbv">' + options + "</select></td>" +
      '<td class="take"><input type="checkbox"' + (item.take === false ? "" : " checked") + "></td>";
    tbody.appendChild(tr);
    paintPbv(tr.querySelector("td.pbv"));
    bindRow(tr);
  }
  (state.added || []).forEach(makeRow);

  function addFromText(){
    var input = document.getElementById("addText");
    var text = input.value.trim();
    if(!text) return;
    var st = load();
    st.added = st.added || [];
    var item = { kr:"new-" + (st.added.length + 1), obj:document.getElementById("addObj").value,
                 text:text, take:true, pbv:null };
    st.added.push(item);
    write(st);
    makeRow(item);
    input.value = "";
    var row = document.querySelector('tr.row[data-kr="' + item.kr + '"]');
    row.scrollIntoView({ block:"center" });
    openCard(row);
    renderChanges();
  }
  document.getElementById("addBtn").addEventListener("click", addFromText);
  document.getElementById("addText").addEventListener("keydown", function(e){
    if(e.key === "Enter"){ e.preventDefault(); addFromText(); }
  });

  /* — промт — */
  function buildPrompt(){
    var all = rows().map(readRow);
    var taken = all.filter(function(r){ return r.take && !r.isNew; });
    var dropped = all.filter(function(r){ return !r.take && !r.isNew; });
    var fresh = all.filter(function(r){ return r.isNew; });
    var st = load();
    var notes = st.notes || {};

    var lines = ["Отбор в квартал " + QUARTER + " сделан. Собери " + DOC + " по нему.", ""];
    lines.push("Берём (" + taken.length + "):");
    taken.forEach(function(r){
      lines.push("- " + r.kr + " " + ((st.titles || {})[r.kr] || r.title) +
        " · PBV " + (r.pbv === null ? "не задан" : r.pbv));
    });
    lines.push("");
    lines.push("Не берём (" + dropped.length + "), оставить в бэклоге:");
    dropped.forEach(function(r){ lines.push("- " + r.kr + " " + r.title); });

    if(fresh.length){
      lines.push("");
      lines.push("Добавить, описано текстом PO — сформулируй как KR:");
      fresh.forEach(function(r){
        lines.push("- [" + (r.take ? "берём" : "не берём") + "] " + r.title +
          " · PBV " + (r.pbv === null ? "не задан" : r.pbv));
        if(notes[r.kr]) lines.push("  заметка:\n" + notes[r.kr].split("\n").map(function(l){ return "  " + l; }).join("\n"));
      });
    }

    // Заметки уходят целиком только там, где PO их правил: иначе промт станет
    // копией документа, и в нём потеряются сами правки.
    var edited = Object.keys(notes).filter(function(kr){
      return !/^new-/.test(kr) && notes[kr] !== (NOTES[kr] || "");
    });
    if(edited.length){
      lines.push("");
      lines.push("Правленые карточки — перенеси в документ как есть:");
      edited.forEach(function(kr){
        lines.push("");
        lines.push("### " + kr);
        lines.push(notes[kr]);
      });
    }

    var commented = Object.keys(st.comments || {});
    if(commented.length){
      lines.push("");
      lines.push("Замечания PO по KR:");
      commented.forEach(function(kr){
        (st.comments[kr] || []).forEach(function(text){ lines.push("- " + kr + ": " + text); });
      });
    }

    lines.push("");
    lines.push("PBV и сценарии за PO не додумывай.");
    return lines.join("\n");
  }

  /* — что именно изменено — */
  function changes(){
    var st = load();
    var notes = st.notes || {};
    var titles = st.titles || {};
    var out = [];
    rows().forEach(function(row){
      var kr = row.getAttribute("data-kr");
      var r = readRow(row);
      if(r.isNew){
        out.push("новый · " + r.title.slice(0, 46) + (r.take ? "" : " (не берём)"));
        return;
      }
      var base = BASE[kr];
      if(!base) return;
      if(base.take !== r.take) out.push(kr + " · " + (r.take ? "в квартал" : "из квартала"));
      var pbv = r.pbv === null ? "—" : r.pbv;
      if(base.pbv !== pbv) out.push(kr + " · PBV " + base.pbv + " → " + pbv);
      if(titles[kr] && titles[kr] !== base.title) out.push(kr + " · название");
      if(notes[kr] !== undefined && notes[kr] !== (NOTES[kr] || "")) out.push(kr + " · заметка");
      var said = (st.comments || {})[kr] || [];
      said.forEach(function(text){ out.push(kr + " · замечание: " + text.slice(0, 40)); });
    });
    return out;
  }

  function renderChanges(){
    var list = changes();
    document.getElementById("cCount").textContent = list.length;
    var box = document.getElementById("changeList");
    box.innerHTML = "";
    if(!list.length){
      box.innerHTML = '<p class="empty">Правок нет.</p>';
    } else {
      list.forEach(function(text){
        var div = document.createElement("div");
        div.className = "item";
        div.textContent = text;
        box.appendChild(div);
      });
    }
    document.getElementById("promptOut").value = buildPrompt();
  }

  document.getElementById("panelToggle").addEventListener("click", function(){
    document.getElementById("panel").classList.toggle("open");
  });

  document.getElementById("copyBtn").addEventListener("click", function(){
    var btn = document.getElementById("copyBtn");
    var was = btn.textContent;
    navigator.clipboard.writeText(buildPrompt()).then(function(){
      btn.textContent = "В буфере";
      setTimeout(function(){ btn.textContent = was; }, 1800);
    }, function(){ btn.textContent = "Буфер недоступен"; });
  });

  renderChanges();
})();
