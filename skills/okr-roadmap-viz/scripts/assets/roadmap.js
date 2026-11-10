(function () {
  var D = JSON.parse(document.getElementById('data').textContent);
  var WPX = 28, DAY = 86400000, W0 = D.w0 ? Date.UTC(+D.w0.slice(0, 4), +D.w0.slice(5, 7) - 1, +D.w0.slice(8, 10)) : Date.UTC(2026, 5, 29);
  var STATUS = [['Открыт', 's-open'], ['В работе', 's-work'], ['Заблокировано', 's-block'], ['Выполнено', 's-done']];
  var SCLS = {}; STATUS.forEach(function (s) { SCLS[s[0]] = s[1]; });
  var SHEX = { 'Открыт': '6b7280', 'В работе': '2563eb', 'Заблокировано': 'dc2626', 'Выполнено': '15803d' };
  var MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
  var BASE = D.items, ROLES = D.roles, TRACKS = D.tracks, ITEM = {}, KIDS = {}, items = [], RBY = {};
  ROLES.forEach(function (r) { RBY[r.key] = r; });
  BASE.forEach(function (it, i) {
    it.pid = ''; it.custom = false; it.name = it.name || it.title;
    if (it.pref != null) it.pid = it.pref || '';
    else if (it.parent) for (var j = i - 1; j >= 0; j--) if (BASE[j].title === it.parent && BASE[j].stage === it.stage) { it.pid = BASE[j].id; break; }
  });
  BASE.forEach(function (it) { it.pid0 = it.pid; it.stage0 = it.stage || null; });
  var STAT = [], OWN = (TRACKS.filter(function (t) { return t.own; })[0] || {}).n;
  function fri(w) { return new Date(W0 + w * 7 * DAY + 4 * DAY).toISOString().slice(0, 10); }
  TRACKS.forEach(function (t) { (t.ms || []).forEach(function (m) { STAT.push({ id: 'm' + t.n + '_' + m.w, gid: null, title: m.t, short: m.sn || m.t, status: 'Открыт', pct: '', role: 'PO', stage: null, parent: null, pid: '', custom: false, ty: 'ms', stat: true, track: t.n, len: 1, s0: fri(m.w), sn: m.sn || m.t }); }); });
  (D.global || []).forEach(function (m) { STAT.push({ id: 'mg' + m.w, gid: null, title: m.t, short: m.sn || m.t, status: 'Открыт', pct: '', role: 'PO', stage: null, parent: null, pid: '', custom: false, ty: 'ms', stat: true, track: 0, len: m.len || 1, s0: fri(m.w + (m.len || 1) - 1), sn: m.sn || m.t }); });
  var grp = 'stage'; try { grp = localStorage.getItem('rm-grp') === 'role' ? 'role' : 'stage'; } catch (e) {}
  var noteT = 0, noteItem = '', noteDirty = false, noteSrc = false, mn = null, mnOff = false, noteBoxEl = null, mnEl = null;
  var state = {}, customs = {}, open = {}, db = null, writeQ = {}, lo = -13, hi = 104, view = { t: 'ov' }, sel = null, adding = null, tab = 'plan', dl = null;
  var sc = document.getElementById('sc');

  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function p2(n) { return ('0' + n).slice(-2); }
  function iso(m) { var d = new Date(m); return d.getUTCFullYear() + '-' + p2(d.getUTCMonth() + 1) + '-' + p2(d.getUTCDate()); }
  function ms(s) { var p = s.split('-'); return Date.UTC(+p[0], +p[1] - 1, +p[2]); }
  function wk(s) { return Math.floor((ms(s) - W0) / (7 * DAY)); }
  function weekMon(i) { return W0 + i * 7 * DAY; }
  function fmt(s) { var p = s.split('-'); return p[2] + '.' + p[1] + '.' + p[0]; }
  function fmtS(s) { var p = s.split('-'); return p[2] + '.' + p[1]; }
  function pl(n, f) { var m = n % 100, d = n % 10; return n + ' ' + (m > 10 && m < 15 ? f[2] : d === 1 ? f[0] : d > 1 && d < 5 ? f[1] : f[2]); }
  function plural(n) { return pl(n, ['задача', 'задачи', 'задач']); }
  function clip(s, n) { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
  var nowD = new Date(), todayMs = Date.UTC(nowD.getFullYear(), nowD.getMonth(), nowD.getDate()), todayIdx = Math.floor((todayMs - W0) / (7 * DAY));
  function svg(d, cls) {
    var ns = 'http://www.w3.org/2000/svg', v = document.createElementNS(ns, 'svg'), p = document.createElementNS(ns, 'path');
    v.setAttribute('viewBox', '0 0 24 24'); v.setAttribute('fill', 'none'); v.setAttribute('stroke', 'currentColor'); v.setAttribute('stroke-width', '1.5');
    v.setAttribute('stroke-linecap', 'round'); v.setAttribute('stroke-linejoin', 'round'); v.setAttribute('aria-hidden', 'true'); if (cls) v.setAttribute('class', cls);
    p.setAttribute('d', d); v.appendChild(p); return v;
  }
  var ICON = { chat: 'M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.4A8 8 0 1 1 21 12zM8.5 11.5h7M8.5 14.5h4', plus: 'M12 5v14M5 12h14', down: 'm6 9 6 6 6-6', right: 'm9 18 6-6-6-6', left: 'm15 18-6-6 6-6', x: 'M6 6l12 12M18 6 6 18',
    cal: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
    doc: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h6',
    net: 'M12 3.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM5 17.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM19 17.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM12 6.5V12M12 12l-6 5.5M12 12l6 5.5' };

  // ---------- items: source + added by hand ----------
  function isDesc(it, rootId) { var p = it.pid, n = 0; while (p && n < 20) { if (p === rootId) return true; p = (ITEM[p] || {}).pid; n++; } return false; }
  var cmts = {};
  var NODES = [], moves = {}, orders = {}, CHL = {}, GROUPS = [], NUM = {}, SNUM = {}, NUMPREV = null, SNUMPREV = null;
  var NB = (TRACKS.filter(function (t) { return t.own; })[0] || {}).nb || '';
  var NUMSTRIP = /^[\s!\-]*\d+(?:\.\d+)+\.?[\s\-]*/;
  function rebuild() {
    ITEM = {}; NODES = BASE.slice(); NODES.forEach(function (i) { ITEM[i.id] = i; }); STAT.forEach(function (i) { ITEM[i.id] = i; });
    Object.keys(customs).map(function (k) { return customs[k]; }).sort(function (a, b) { return a.ts - b.ts; }).forEach(function (c) {
      var it = { id: c.id, gid: null, name: c.title, title: c.title, short: c.title, status: 'Открыт', pct: '', role: c.role || 'PO', stage: c.stage || null, stage0: c.stage || null, pid0: c.pid && !/^S:/.test(c.pid) ? c.pid : '', pid: '', parent: null, custom: true };
      ITEM[it.id] = it; NODES.push(it);
    });
    relayout();
  }
  function numbered(x) { var e = eff(x); return e.ty !== 'bl' && !/^[\s!\-]*(БЛОКАТОР|ВОПРОС|ЖДЕМ|ВЛИЯЕТ)/i.test(x.name); }
  function ordered(key, def) {
    var st = orders[key] || [], set = {}, out = []; def.forEach(function (d) { set[d] = 1; });
    st.forEach(function (d) { if (set[d] === 1) { out.push(d); set[d] = 2; } }); def.forEach(function (d) { if (set[d] === 1) out.push(d); }); return out;
  }
  function relayout() {
    var nodes = NODES, CH = {}, rootDef = [], seenS = {}, stNames = [];
    function push(k, v) { (CH[k] = CH[k] || []).push(v); }
    nodes.forEach(function (x) { var m = moves[x.id]; x.pid = m ? m.pid : x.pid0; x.stg = m ? (m.stage || null) : x.stage0; if (x.pid && (!ITEM[x.pid] || x.pid === x.id || ITEM[x.pid].stat)) x.pid = ''; });
    nodes.forEach(function (x) { var p = x.pid, n = 0, seen = {}; seen[x.id] = 1; while (p && n < 40) { if (seen[p]) { x.pid = ''; break; } seen[p] = 1; p = (ITEM[p] || {}).pid; n++; } });
    function stg(x, d) { return x.pid && d < 40 ? stg(ITEM[x.pid], d + 1) : x.stg; }
    nodes.forEach(function (x) { x.stage = stg(x, 0); if (x.stage0 && stNames.indexOf(x.stage0) < 0) stNames.push(x.stage0); });
    nodes.forEach(function (x) {
      if (x.stage0 && !seenS[x.stage0]) { seenS[x.stage0] = 1; rootDef.push('S:' + x.stage0); }
      if (x.pid) push('p:' + x.pid, x.id); else if (x.stage) push('S:' + x.stage, x.id); else rootDef.push(x.id);
    });
    CHL = {}; Object.keys(CH).forEach(function (k) { CHL[k] = ordered(k, CH[k]); }); stNames.forEach(function (n) { if (!CHL['S:' + n]) CHL['S:' + n] = []; }); CHL.R = ordered('R', rootDef);
    items = []; GROUPS = []; NUM = {}; SNUM = {}; KIDS = {};
    function walk(list, base, g) {
      var k = 0;
      list.forEach(function (id) { var x = ITEM[id], num = ''; if (base && numbered(x)) num = NUM[id] = base + '.' + (++k); items.push(x); g.items.push(x); walk(CHL['p:' + id] || [], num, g); });
    }
    var k = 0, cur = null;
    CHL.R.forEach(function (e) {
      if (e.indexOf('S:') === 0) { var sn = e.slice(2), g = { stage: sn, items: [] }; SNUM[sn] = NB ? NB + '.' + (++k) : ''; cur = null; GROUPS.push(g); walk(CHL[e] || [], SNUM[sn], g); }
      else { var x = ITEM[e], num = ''; if (NB && numbered(x)) num = NUM[e] = NB + '.' + (++k); if (!cur) { cur = { stage: null, items: [] }; GROUPS.push(cur); } items.push(x); cur.items.push(x); walk(CHL['p:' + e] || [], num, cur); }
    });
    function expand(t) { return String(t).replace(/\{#([^}]+)\}/g, function (m, id) { var y = ITEM[id]; return y ? (NUM[id] || clip(y.name.replace(/^[\s!\-]+/, ''), 24)) : ''; }); }
    items.forEach(function (x) { var nm = expand(x.custom ? x.name.replace(NUMSTRIP, '') || x.name : x.name); x.title = (NUM[x.id] ? NUM[x.id] + ' ' : '') + nm; x.short = x.title; });
    items.forEach(function (x) { x.parent = x.pid && ITEM[x.pid] ? ITEM[x.pid].title : null; if (x.pid) (KIDS[x.pid] = KIDS[x.pid] || []).push(x); });
    if (NUMPREV) renumberNotes(NUMPREV, SNUMPREV);
    NUMPREV = Object.assign({}, NUM); SNUMPREV = Object.assign({}, SNUM);
  }
  function renumberNotes(o, os) {
    var rev = {}, any = false;
    Object.keys(o).forEach(function (id) { if (o[id] !== NUM[id]) { rev[o[id]] = id; any = true; } });
    Object.keys(os).forEach(function (st) { if (os[st] !== SNUM[st]) { rev[os[st]] = 'S:' + st; any = true; } });
    if (!any) return;
    Object.keys(state).forEach(function (k) {
      var n = state[k]; if (!n.d || n.d.indexOf('@$') < 0 || (noteDirty && noteItem === k)) return;
      var text = n.d;
      parseNote(n.d).toks.slice().reverse().forEach(function (t) {
        if (t.k !== 'dp' || !t.val) return; var mv = false;
        var np = depParts(t.val).map(function (q) { var r = rev[q.replace(/\.$/, '')]; if (!r) return q; var nn = r.indexOf('S:') === 0 ? SNUM[r.slice(2)] : NUM[r]; if (!nn) return q; mv = true; return nn; });
        if (mv) text = text.slice(0, t.e) + ' ' + np.join(', ') + text.slice(t.ve);
      });
      if (text !== n.d) { n.d = text; save(k); }
    });
  }
  function stageTitle(st) { return st ? (SNUM[st] ? SNUM[st] + ' ' : '') + st.replace(/^\s*\d+(?:\.\d+)*\.?\s*/, '') : ''; }
  function kidsOf(id) { return KIDS[id] || []; }
  function depth(it) { var d = 1, p = it.pid, n = 0; while (p && ITEM[p] && n < 10) { d++; p = ITEM[p].pid; n++; } return d; }
  function lvlOf(it) { if (!it.stage && !it.pid) return 0; return Math.min(3, (it.stage ? 1 : 0) + depth(it) - 1); }
  function hidden(it) { var p = it.pid; while (p) { if (open['t:' + p] === false) return true; p = (ITEM[p] || {}).pid; } return false; }
  function lastDesc(id) { var idx = items.indexOf(ITEM[id]), last = id; for (var i = idx + 1; i < items.length && isDesc(items[i], id); i++) last = items[i].id; return last; }
  function numOf(it) { return NUM[it.id] || null; }
  function label(it) { var n = numOf(it); return n ? n + ' ' + clip(it.short.replace(/^[\s!\-]*\d+(?:\.\d+)+\.?[\s\-]*/, ''), 36) : clip(it.short.replace(/^[\s!\-]+/, ''), 44); }
  function stagesList() { return GROUPS.filter(function (g) { return g.stage; }).map(function (g) { return g.stage; }); }

  // ---------- state ----------
  function blank() { return { s: '', e: '', r: '', st: '', p: null, d: '', cu: '', as: '', ap: '', ty: '', sn: '', dep: [] }; }
  function shortOf(it) { var s = (state[it.id] || {}).sn; if (s) return s; if (it.sn) return it.sn; return clip(it.short.replace(/^[\s!\-]*\d+(?:\.\d+)+\.?[\s\-]*/, '').replace(/^[\s!\-]+/, ''), 48); }
  function isMs(it) { return eff(it).ty === 'ms'; }
  function isBl(it) { return eff(it).ty === 'bl'; }
  function isPt(it) { var t = eff(it).ty; return t === 'ms' || t === 'bl'; }
  function eff(it) {
    var s = state[it.id] || {}, st = s.st || it.status || 'Открыт';
    var ty = s.ty ? (s.ty === 't' ? '' : s.ty) : (it.ty || ''), sd = s.s || it.s0 || '';
    return { st: st, role: s.r || it.role, ty: ty, sn: s.sn || '', s: sd, e: (ty === 'ms' || ty === 'bl') ? '' : (s.e || ''), p: s.p != null ? s.p : (st === 'Выполнено' ? 100 : (parseInt(it.pct, 10) || 0)),
      d: s.d || '', cu: s.cu || '', as: s.as || '', ap: s.ap || '', dep: (s.dep || []).filter(function (r) { return r.indexOf('S:') === 0 || ITEM[r]; }) };
  }
  function span(it) { var e = eff(it); if (!e.s) return null; var a = wk(e.s), b = e.e ? Math.max(a, wk(e.e)) : a; return [a, b]; }
  function cur(it) { var n = Object.assign(blank(), state[it.id] || {}); n.dep = (n.dep || []).slice(); return n; }
  function put(it, n) {
    n.r = n.r === it.role ? '' : n.r; n.st = n.st === it.status ? '' : n.st; n.s = n.s === it.s0 ? '' : n.s; n.ty = n.ty === (it.ty || '') ? '' : n.ty; n.sn = n.sn === it.sn ? '' : n.sn;
    if (!n.s && !n.e && !n.r && !n.st && n.p == null && !n.d && !n.cu && !n.as && !n.ap && !n.ty && !n.sn && !n.dep.length) delete state[it.id]; else state[it.id] = n;
  }
  function commit(it, n) {
    var b = eff(it); put(it, n); var a = eff(it), moved = [];
    if (!noteSrc && n.d) { var t2 = syncTokens(n.d, { s: a.s, e: a.e, p: a.p, single: a.ty === 'ms' || a.ty === 'bl' }); if (t2 !== n.d) { n.d = t2; put(it, n); } }
    if (b.s !== a.s || b.e !== a.e) cascade(it.id, {}, moved);
    render(); save(it.id); syncDrawer();
    if (moved.length) toast('Сдвинуты зависимые задачи: ' + moved.length, 2600);
  }
  function stageOf(t) { return items.filter(function (x) { return x.stage === t; }); }
  function predEnd(ref) {
    if (ref.indexOf('S:') === 0) { var m = ''; stageOf(ref.slice(2)).forEach(function (x) { var e = eff(x); var en = e.e || e.s; if (en && en > m) m = en; }); return m; }
    var it = ITEM[ref]; if (!it) return ''; var e = eff(it); return e.e || e.s || '';
  }
  function predLabel(ref) { return ref.indexOf('S:') === 0 ? 'Этап: ' + clip(stageTitle(ref.slice(2)), 44) : label(ITEM[ref]); }
  function affects(ref, id) { return ref === id || (ref.indexOf('S:') === 0 && ITEM[id] && ITEM[id].stage === ref.slice(2)); }
  function needShift(d) {
    var e = eff(d), need = 0; if (!e.s) return 0;
    e.dep.forEach(function (r) { var pe = predEnd(r); if (pe) { var min = iso(ms(pe) + DAY); if (e.s < min) need = Math.max(need, Math.round((ms(min) - ms(e.s)) / DAY)); } });
    return need;
  }
  function shift(d, days) { var e = eff(d), n = cur(d); n.s = iso(ms(e.s) + days * DAY); n.e = e.e ? iso(ms(e.e) + days * DAY) : ''; if (n.d) n.d = syncTokens(n.d, { s: n.s, e: n.e, single: e.ty === 'ms' || e.ty === 'bl' }); put(d, n); save(d.id); }
  function msOf(n) { return STAT.filter(function (m) { return m.track === 0 || m.track === n; }).concat(n === OWN ? items.filter(function (it) { return isMs(it) && eff(it).s; }) : []).filter(function (m) { return eff(m).s; }); }
  function xOf(s) { return (ms(s) - weekMon(lo)) / DAY * (WPX / 7) + WPX / 14; }
  function cascade(id, seen, moved) {
    if (seen[id]) return; seen[id] = 1;
    items.concat(STAT).forEach(function (d) {
      var st = state[d.id]; if (!st || !st.dep || !st.dep.length) return;
      if (!st.dep.some(function (r) { return affects(r, id); })) return;
      var need = needShift(d); if (need > 0) { shift(d, need); moved.push(d.id); cascade(d.id, seen, moved); }
    });
  }
  function violated(d) { var e = eff(d); return !!e.s && e.dep.some(function (r) { var pe = predEnd(r); return pe && e.s <= pe; }); }
  function reach(ref, target, seen) {
    var ids = ref.indexOf('S:') === 0 ? stageOf(ref.slice(2)).map(function (x) { return x.id; }) : [ref];
    return ids.some(function (id) {
      if (id === target) return true; if (seen[id]) return false; seen[id] = 1;
      var st = state[id]; return !!(st && st.dep && st.dep.some(function (r) { return reach(r, target, seen); }));
    });
  }
  function canDep(it, ref) {
    if (ref === it.id) return false;
    if (ref.indexOf('S:') === 0) { if (it.stage === ref.slice(2)) return false; }
    else { var p = ITEM[ref]; if (!p || isDesc(p, it.id) || isDesc(it, p.id)) return false; }
    return !reach(ref, it.id, {});
  }
  function addDep(it, ref) {
    var n = cur(it); if (n.dep.indexOf(ref) >= 0) return; n.dep.push(ref);
    commit(it, n);
    var need = needShift(it);
    if (need > 0) { shift(it, need); var moved = []; cascade(it.id, {}, moved); render(); syncDrawer(); toast('Старт сдвинут на ' + pl(need, ['день', 'дня', 'дней']) + ': после завершения предшественника', 2600); }
  }
  function rmDep(it, ref) { var n = cur(it); n.dep = n.dep.filter(function (r) { return r !== ref; }); commit(it, n); }

  // ---------- range ----------
  function ensureRange() { STAT.forEach(function (it) { var sp = span(it); if (sp) { lo = Math.min(lo, sp[0] - 4); hi = Math.max(hi, sp[1] + 14); } }); items.forEach(function (it) { var sp = span(it); if (sp) { lo = Math.min(lo, sp[0] - 4); hi = Math.max(hi, sp[1] + 14); } }); }
  function lw() { var n = window.innerWidth < 700; return view.t === 'ov' ? (n ? 200 : 320) : (n ? 240 : 380); }
  function wInfo(i) { var d = new Date(weekMon(i) + 6 * DAY), m = d.getUTCMonth(), y = d.getUTCFullYear(); return { m: y * 12 + m, q: y * 4 + Math.floor(m / 3) }; }
  function weekInQ(i) { var q = wInfo(i).q, j = i; while (wInfo(j - 1).q === q) j--; return i - j + 1; }
  function curTrack() { return TRACKS.filter(function (t) { return t.n === view.n; })[0] || TRACKS[0]; }

  // ---------- render ----------
  function render(shift) {
    relayout();
    var sl = sc.scrollLeft, st = sc.scrollTop;
    ensureRange();
    var l = lw(), tw = (hi - lo) * WPX, inn = el('div', 'in');
    inn.style.setProperty('--lw', l + 'px'); inn.style.setProperty('--tw', tw + 'px'); inn.style.width = (l + tw) + 'px';
    inn.appendChild(buildHead()); inn.appendChild(buildOverlay());
    if (view.t === 'ov') buildOverview(inn); else buildTrack(inn);
    var pad = el('div', 'row pad'); pad.appendChild(el('div', 'lc')); pad.appendChild(el('div', 'tc')); inn.appendChild(pad);
    sc.textContent = ''; sc.appendChild(inn);
    sc.scrollLeft = sl + (shift || 0) * WPX; sc.scrollTop = st;
    drawDeps(inn);
    markNotes(inn); renderBar();
    if (adding && adding.focus) { var ai = inn.querySelector('.addin'); if (ai) { adding.focus = false; ai.focus(); } }
  }
  function buildHead() {
    var hd = el('div', 'hd'), c = el('div', 'corner');
    if (view.t === 'ov') {
      c.appendChild(el('div', 'ctitle', 'Roadmap'));
      var lg = el('div', 'legend');
      ROLES.forEach(function (r) { var s = el('span'), i = el('i', 'sq'); i.style.background = r.color; s.appendChild(i); s.appendChild(document.createTextNode(r.name)); s.title = r.sub; lg.appendChild(s); });
      c.appendChild(lg);
    } else {
      var t = curTrack(), back = el('a', 'back'), ctop = el('div', 'ctop'); back.href = '#'; back.appendChild(svg(ICON.left)); back.appendChild(document.createTextNode('Roadmap')); ctop.appendChild(back);
      if (t.own) {
        var tog = el('div', 'tog'); tog.setAttribute('role', 'group'); tog.setAttribute('aria-label', 'Группировка задач');
        [['stage', 'Этапы'], ['role', 'Роли']].forEach(function (g) {
          var b = el('button', '', g[1]); b.type = 'button'; b.setAttribute('aria-pressed', String(grp === g[0]));
          b.addEventListener('click', function () { grp = g[0]; adding = null; try { localStorage.setItem('rm-grp', grp); } catch (e) {} render(); });
          tog.appendChild(b);
        });
        ctop.appendChild(tog);
      }
      c.appendChild(ctop);
      var nm = el('div', 'cname', t.n + '. ' + t.name); nm.title = t.name; c.appendChild(nm);
    }
    var th = el('div', 'th'), q0 = null, m0 = null, i;
    function cell(cls, a, b, text) { var h = el('div', 'hc ' + cls); h.style.left = (a - lo) * WPX + 'px'; h.style.width = (b - a + 1) * WPX + 'px'; if (text) h.appendChild(el('span', '', text)); th.appendChild(h); }
    for (i = lo; i < hi; i++) {
      var w = wInfo(i);
      if (!q0 || q0.k !== w.q) { if (q0) cell('q', q0.a, i - 1, q0.t); q0 = { k: w.q, a: i, t: 'Q' + (w.q % 4 + 1) + ' ' + Math.floor(w.q / 4) }; }
      if (!m0 || m0.k !== w.m) { if (m0) cell('m', m0.a, i - 1, m0.t); m0 = { k: w.m, a: i, t: MONTHS[w.m % 12] }; }
      var h = el('div', 'hc w' + (i === todayIdx ? ' now' : ''), 'W' + weekInQ(i)); h.style.left = (i - lo) * WPX + 'px'; h.title = 'Неделя с ' + fmt(iso(weekMon(i))); th.appendChild(h);
    }
    cell('q', q0.a, hi - 1, q0.t); cell('m', m0.a, hi - 1, m0.t);
    hd.appendChild(c); hd.appendChild(th); return hd;
  }
  function buildOverlay() {
    var ov = el('div', 'ov'), i, d;
    D.holiday.forEach(function (h) { if (h >= lo && h < hi) { d = el('div', 'hol'); d.style.left = (h - lo) * WPX + 'px'; ov.appendChild(d); } });
    if (todayIdx >= lo && todayIdx < hi) { d = el('div', 'tod'); d.style.left = (todayIdx - lo) * WPX + 'px'; ov.appendChild(d); }
    for (i = lo + 1; i < hi; i++) if (wInfo(i).q !== wInfo(i - 1).q) { d = el('div', 'ql'); d.style.left = (i - lo) * WPX + 'px'; ov.appendChild(d); }
    if (view.t === 'ov') {
      STAT.filter(function (m) { return m.track === 0 && eff(m).s; }).forEach(function (m) {
        var a = wk(eff(m).s) - (m.len - 1), g = el('div', 'gband ' + SCLS[eff(m).st]); g.style.left = (a - lo) * WPX + 'px'; g.style.width = m.len * WPX + 'px'; ov.appendChild(g);
        ov.appendChild(msLabel(m, (a - lo) * WPX + 3, m.len * WPX - 6, 8));
      });
    } else {
      var xs = [];
      msOf(view.n).sort(function (a, b) { return eff(a).s < eff(b).s ? -1 : 1; }).forEach(function (m) {
        var e = eff(m), x = xOf(e.s), ln = el('i', 'mln ' + SCLS[e.st]), tier = 0; ln.style.left = x - 1 + 'px'; ov.appendChild(ln);
        var wx = (wk(e.s) - lo) * WPX + 1; xs.forEach(function (px) { if (px === wx) tier++; }); xs.push(wx);
        ov.appendChild(msLabel(m, wx, WPX - 2, 8 + tier * 212));
      });
    }
    return ov;
  }
  function seg(a, b, y, color, plan) {
    var d = el('div', 'lane' + (plan ? ' plan' : '')); d.style.left = (a - lo) * WPX + 2 + 'px'; d.style.width = (b - a + 1) * WPX - 4 + 'px'; d.style.top = y + 'px'; d.style.setProperty('--c', color); return d;
  }
  function merge(list) {
    list.sort(function (x, y) { return x[0] - y[0]; }); var out = [];
    list.forEach(function (s) { var l = out[out.length - 1]; if (l && s[0] <= l[1] + 1) l[1] = Math.max(l[1], s[1]); else out.push([s[0], s[1]]); }); return out;
  }
  function msLabel(m, x, w, top) {
    var e = eff(m), b = el('button', 'lb ' + SCLS[e.st] + (sel === m.id ? ' on' : '')); b.type = 'button'; b.dataset.ms = m.id;
    b.style.left = x + 'px'; b.style.top = top + 'px'; if (w) b.style.width = w + 'px';
    b.title = m.title + '\n' + fmt(e.s) + ' · ' + e.st; b.appendChild(el('i', 'dot')); b.appendChild(el('span', '', clip(shortOf(m), 64)));
    b.addEventListener('click', function (ev) { ev.stopPropagation(); openDrawer(m.id); }); b.addEventListener('keydown', function (ev) { ev.stopPropagation(); });
    return b;
  }
  function msCol(m) {
    var e = eff(m), c = el('button', 'mcol ' + SCLS[e.st] + (sel === m.id ? ' on' : '')); c.type = 'button'; c.dataset.ms = m.id;
    c.style.left = (wk(e.s) - lo) * WPX + 1 + 'px'; c.title = m.title + '\n' + fmt(e.s) + ' · ' + e.st;
    c.appendChild(el('i', 'dot')); c.appendChild(el('span', 'tx', clip(shortOf(m), 44)));
    c.addEventListener('click', function (ev) { ev.stopPropagation(); openDrawer(m.id); }); c.addEventListener('keydown', function (ev) { ev.stopPropagation(); });
    return c;
  }
  function addBtn(title, fn) {
    var b = el('button', 'addb'); b.type = 'button'; b.title = title; b.setAttribute('aria-label', title); b.appendChild(svg(ICON.plus));
    b.addEventListener('click', function (ev) { ev.stopPropagation(); fn(); }); return b;
  }

  // ---------- overview ----------
  function buildOverview(inn) {
    TRACKS.forEach(function (t) {
      var row = el('div', 'row go'), lc = el('div', 'lc'), tc = el('div', 'tc'); row.dataset.track = t.n;
      row.tabIndex = 0; row.setAttribute('role', 'link'); row.setAttribute('aria-label', 'Открыть трек: ' + t.name);
      var tn = el('div', 'tn'); tn.appendChild(el('i', '', String(t.n))); tn.appendChild(document.createTextNode(t.name)); lc.appendChild(tn);
      if (t.result) lc.appendChild(el('div', 'tr', t.result));
      if (t.own) lc.appendChild(el('div', 'ts', plural(items.length) + ' · ' + items.filter(function (it) { return span(it); }).length + ' со сроками'));
      ROLES.forEach(function (r, k) {
        var y = 34 + k * 12;
        (t.plan[r.key] || []).forEach(function (p) { tc.appendChild(seg(p[0], p[1], y, r.color, true)); });
        if (t.own) {
          var spans = []; items.forEach(function (it) { if (eff(it).role === r.key && !isPt(it)) { var sp = span(it); if (sp) spans.push(sp); } });
          merge(spans).forEach(function (p) { tc.appendChild(seg(p[0], p[1], y, r.color, false)); });
        }
      });
      msOf(t.n).filter(function (m) { return m.track !== 0; }).forEach(function (m) { tc.appendChild(msCol(m)); });
      row.appendChild(lc); row.appendChild(tc);
      var go = function () { location.hash = '#track-' + t.n; };
      row.addEventListener('click', go); row.addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); });
      inn.appendChild(row);
    });
  }

  // ---------- add row ----------
  function addRow(lvl, cls) {
    var row = el('div', 'row add ' + (cls || ('l' + lvl))), lc = el('div', 'lc'), inp = el('input', 'addin');
    inp.type = 'text'; inp.placeholder = adding.pid ? 'Название подзадачи' : 'Название задачи'; inp.value = adding.val || ''; inp.setAttribute('aria-label', inp.placeholder);
    inp.addEventListener('input', function () { adding.val = inp.value; });
    inp.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') { adding = null; render(); ev.stopPropagation(); }
      else if (ev.key === 'Enter') { ev.preventDefault(); createItem(inp.value); }
    });
    lc.appendChild(inp); lc.appendChild(el('div', 'addh', 'Enter — добавить и продолжить, Esc — закрыть'));
    row.appendChild(lc); row.appendChild(el('div', 'tc')); return row;
  }
  function startAdd(o) {
    adding = { pid: o.pid || '', stage: o.stage || '', role: o.role || 'PO', mode: grp, val: '', focus: true };
    if (o.pid) open['t:' + o.pid] = true; if (o.stage) open['st:' + o.stage] = true; if (o.openRole) open[o.openRole] = true;
    render();
  }
  function createItem(title) {
    title = (title || '').trim(); title = title.replace(NUMSTRIP, '').trim() || title; if (!title) return;
    var id = 'c' + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);
    var par = adding.pid ? ITEM[adding.pid] : null;
    customs[id] = mkCustom({ id: id, title: title, pid: adding.pid, stage: par ? par.stage || '' : adding.stage, role: par ? eff(par).role : adding.role, ts: Date.now() });
    rebuild(); adding.val = ''; adding.focus = true; render(); saveCustom(id); return id;
  }
  function mkCustom(v) { return { id: v.id, title: v.title, pid: v.pid || '', stage: v.stage || '', role: v.role || 'PO', ts: v.ts || 0 }; }

  // ---------- track page ----------
  function buildTrack(inn) {
    var t = curTrack(), res = el('div', 'row res'), lc = el('div', 'lc'); res.dataset.track = t.n;
    lc.appendChild(el('div', 'lab', 'Результат трека')); lc.appendChild(el('div', 'restext', t.result || 'Не указан'));
    if (!t.own) lc.appendChild(el('div', 'empty', 'Подробной декомпозиции у этого трека пока нет. Показан план по ролям из roadmap.'));
    res.appendChild(lc); res.appendChild(el('div', 'tc')); inn.appendChild(res);
    if (t.own && grp === 'stage') { buildStages(inn); return; }
    ROLES.forEach(function (role) {
      var mine = t.own ? items.filter(function (it) { return eff(it).role === role.key; }) : [], plan = t.plan[role.key] || [];
      if (!mine.length && !plan.length) return;
      var isOpen = open[role.key] !== false && mine.length > 0;
      var rh = el('div', 'row rh'), l = el('div', 'lc'), tc = el('div', 'tc'), b; rh.dataset.track = t.n; rh.dataset.role = role.key;
      if (mine.length) { b = el('button', 'rolebtn'); b.type = 'button'; b.setAttribute('aria-expanded', String(isOpen)); b.appendChild(svg(isOpen ? ICON.down : ICON.right, 'chev')); }
      else { b = el('div', 'rolebtn static'); }
      var sq = el('i', 'sq'); sq.style.background = role.color; b.appendChild(sq); b.appendChild(el('span', 'rn', role.name)); b.title = role.sub;
      var dated = mine.filter(function (it) { return span(it); }).length;
      b.appendChild(el('span', 'cnt', mine.length ? plural(mine.length) + (dated ? ' · ' + dated + ' со сроками' : '') : 'план roadmap'));
      if (mine.length) b.addEventListener('click', function () { open[role.key] = !isOpen; render(); });
      l.appendChild(b);
      if (t.own) l.appendChild(addBtn('Добавить задачу: ' + role.name, function () { startAdd({ role: role.key, openRole: role.key }); }));
      rh.appendChild(l);
      plan.forEach(function (p) { var d = el('div', 'plan'); d.style.setProperty('--c', role.color); d.style.left = (p[0] - lo) * WPX + 2 + 'px'; d.style.width = (p[1] - p[0] + 1) * WPX - 4 + 'px'; tc.appendChild(d); });
      if (!isOpen && mine.length) {
        var list = []; mine.forEach(function (it) { var sp = span(it); if (sp) list.push({ it: it, a: sp[0], b: sp[1] }); });
        list.sort(function (x, y) { return x.a - y.a || x.b - y.b; });
        var lanes = [];
        list.forEach(function (x) {
          var k = 0; while (k < lanes.length && lanes[k] >= x.a) k++; lanes[k] = x.b;
          var m = el('div', 'mini ' + SCLS[eff(x.it).st]); m.style.left = (x.a - lo) * WPX + 2 + 'px'; m.style.width = (x.b - x.a + 1) * WPX - 4 + 'px'; m.style.top = 20 + k * 12 + 'px'; m.title = x.it.title; tc.appendChild(m);
        });
        if (lanes.length) tc.style.height = Math.max(48, 32 + lanes.length * 12) + 'px';
      }
      rh.appendChild(tc); inn.appendChild(rh);
      if (isOpen) mine.forEach(function (it) { inn.appendChild(taskRow(it, null)); });
      if (adding && adding.mode === 'role' && !adding.pid && adding.role === role.key) inn.appendChild(addRow(0, 'r'));
    });
  }
  function buildStages(inn) {
    var groups = GROUPS;
    groups.forEach(function (g) {
      var key = 'st:' + g.stage, isOpen = !g.stage || open[key] !== false;
      if (g.stage) {
        var real = g.items.filter(function (it) { return !isBl(it); }), n = real.length, done = 0, block = 0, sum = 0, a = null, b = null;
        g.items.length && real.forEach(function (it) {
          var e = eff(it); sum += e.p; if (e.st === 'Выполнено') done++; if (e.st === 'Заблокировано') block++;
          var sp = span(it); if (sp) { a = a == null ? sp[0] : Math.min(a, sp[0]); b = b == null ? sp[1] : Math.max(b, sp[1]); }
        });
        var pct = n ? Math.round(sum / n) : 0;
        var rh = el('div', 'row sh'), l = el('div', 'lc'), tc = el('div', 'tc'), btn = el('button', 'stbtn');
        rh.dataset.stage = g.stage;
        btn.type = 'button'; btn.setAttribute('aria-expanded', String(isOpen)); btn.appendChild(svg(isOpen ? ICON.down : ICON.right, 'chev'));
        var tx = el('div', 'stx'), bt = el('b', '', stageTitle(g.stage)); bt.title = stageTitle(g.stage); tx.appendChild(bt);
        tx.appendChild(el('span', '', plural(n) + ' · ' + done + ' выполнено' + (block ? ' · ' + block + ' заблокировано' : '') + ' · ' + pct + '%'));
        btn.appendChild(tx); btn.addEventListener('click', function () { open[key] = !isOpen; render(); });
        l.appendChild(btn); l.appendChild(addBtn('Добавить задачу в этап', function () { startAdd({ stage: g.stage }); })); l.appendChild(addGrip('stage', g.stage)); rh.appendChild(l);
        if (a != null) {
          var r = el('div', 'roll'); r.style.left = (a - lo) * WPX + 2 + 'px'; r.style.width = (b - a + 1) * WPX - 4 + 'px'; r.title = 'Сводка по этапу: ' + pct + '%';
          var f = el('div', 'fill'); f.style.width = pct + '%'; r.appendChild(f); if (pct) r.appendChild(el('span', 'pl', pct + '%')); tc.appendChild(r);
        }
        rh.appendChild(tc); inn.appendChild(rh);
      }
      if (!isOpen) return;
      var tail = adding && adding.mode === 'stage' && adding.pid ? lastDesc(adding.pid) : null;
      g.items.forEach(function (it) {
        if (hidden(it)) return;
        inn.appendChild(taskRow(it, lvlOf(it)));
        if (tail && it.id === tail) inn.appendChild(addRow(Math.min(3, lvlOf(ITEM[adding.pid]) + 1)));
      });
      if (adding && adding.mode === 'stage' && !adding.pid && g.stage && adding.stage === g.stage) inn.appendChild(addRow(1));
    });
  }
  function taskRow(it, lvl) {
    var e = eff(it), blT = e.ty === 'bl', msT = blT || e.ty === 'ms', kids = kidsOf(it.id), row = el('div', 'row tk' + (msT ? ' ms' : '') + (blT ? ' bl' : '') + (lvl != null ? ' l' + lvl : '') + (sel === it.id ? ' on' : '')), lc = el('div', 'lc'), tc = el('div', 'tc');
    row.dataset.id = it.id; lc.tabIndex = 0;
    if (lvl != null && kids.length) {
      var closed = open['t:' + it.id] === false, tg = el('button', 'tg'); tg.type = 'button'; tg.setAttribute('aria-expanded', String(!closed));
      tg.title = closed ? 'Развернуть подзадачи' : 'Свернуть подзадачи'; tg.setAttribute('aria-label', tg.title); tg.appendChild(svg(closed ? ICON.right : ICON.down));
      tg.addEventListener('click', function (ev) { ev.stopPropagation(); open['t:' + it.id] = closed; render(); }); lc.appendChild(tg);
    }
    var tt = el('div', 'tt ' + SCLS[e.st]); tt.appendChild(el('i', 'dot' + (msT && !blT ? ' big' : ''))); var b = el('b', '', it.short); b.title = it.title; tt.appendChild(b); lc.appendChild(tt);
    var parts = [e.st]; parts.push(e.s ? fmtS(e.s) + (e.e ? ' → ' + fmtS(e.e) : '') : 'без даты'); if (e.p && !msT) parts.push(e.p + '%'); if (msT) parts.unshift(blT ? 'Блокатор' : 'Целевое состояние');
    if (kids.length) parts.push(pl(kids.length, ['подзадача', 'подзадачи', 'подзадач']));
    if (e.as) parts.push(clip(e.as, 22));
    var ncm = cmOf(it.id).length; if (ncm) parts.push(ncm + ' комм.');
    var tm = el('div', 'tm');
    if (lvl != null) { var rl = RBY[e.role], q = el('i', 'sq'); q.style.background = rl.color; tm.appendChild(q); parts.unshift(rl.name); }
    if (e.dep.length) parts.push('после ' + (e.dep.length === 1 ? clip(predLabel(e.dep[0]), 24) + (predEnd(e.dep[0]) ? ' (до ' + fmtS(predEnd(e.dep[0])) + ')' : '') : e.dep.length));
    tm.appendChild(document.createTextNode(parts.join(' · ')));
    if (violated(it)) tm.appendChild(el('span', 'warn', ' · конфликт срока'));
    lc.appendChild(tm);
    if (lvl != null) {
      lc.appendChild(addGrip('item', it.id));
      lc.addEventListener('keydown', function (ev) { if (ev.altKey && ev.key.indexOf('Arrow') === 0) { ev.preventDefault(); keyMove(it.id, ev.key); } });
    }
    if (lvl != null) lc.appendChild(addBtn('Добавить подзадачу', function () { startAdd({ pid: it.id }); }));
    lc.addEventListener('click', function () { openDrawer(it.id); });
    lc.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') openDrawer(it.id); });
    var sp = span(it);
    if (sp) { tc.className += ' has'; tc.appendChild(msT ? taskMarker(it, e) : taskBar(it, e, sp)); }
    else {
      var gh = el('div', 'gh' + (msT ? ' ms' : '')); tc.appendChild(gh); tc.title = msT ? 'Нажмите на неделю, чтобы поставить дату' : 'Нажмите на неделю, чтобы назначить срок';
      tc.addEventListener('mousemove', function (ev) { var x = ev.clientX - tc.getBoundingClientRect().left; gh.style.display = 'block'; gh.style.left = Math.floor(x / WPX) * WPX + 'px'; });
      tc.addEventListener('mouseleave', function () { gh.style.display = 'none'; });
      tc.addEventListener('click', function (ev) {
        var i = lo + Math.floor((ev.clientX - tc.getBoundingClientRect().left) / WPX), n = cur(it);
        if (msT) { n.s = iso(weekMon(i) + 4 * DAY); n.e = ''; } else { n.s = iso(weekMon(i)); n.e = iso(weekMon(i) + 4 * DAY); }
        sel = it.id; commit(it, n); openDrawer(it.id);
      });
    }
    e.dep.forEach(function (ref) {
      var pe = predEnd(ref); if (!pe) return;
      var bad = !!(e.s && e.s <= pe), d = el('button', 'dm' + (bad ? ' bad' : '')); d.type = 'button';
      d.style.left = xOf(pe) - 11 + 'px'; d.setAttribute('aria-label', 'Старт после завершения: ' + predLabel(ref) + ', до ' + fmt(pe));
      d.title = 'Старт только после завершения: ' + predLabel(ref) + '\nдо ' + fmt(pe) + (bad ? '\nСрок задачи пересекается с предшественником' : '');
      d.appendChild(el('i', 'tri', '!'));
      d.addEventListener('pointerdown', function (ev) { ev.stopPropagation(); });
      d.addEventListener('click', function (ev) { ev.stopPropagation(); openDrawer(it.id, 'links'); });
      tc.appendChild(d);
    });
    row.appendChild(lc); row.appendChild(tc); return row;
  }
  function taskBar(it, e, sp) {
    var bar = el('div', 'bar ' + SCLS[e.st] + (sel === it.id ? ' on' : '')), a0 = sp[0], b0 = sp[1];
    bar.style.left = (a0 - lo) * WPX + 2 + 'px'; bar.style.width = (b0 - a0 + 1) * WPX - 4 + 'px'; bar.title = it.title + '\n' + e.st + (e.p ? ' · ' + e.p + '%' : '');
    var f = el('div', 'fill'); f.style.width = e.p + '%'; bar.appendChild(f);
    if (e.p) bar.appendChild(el('span', 'pl', e.p + '%'));
    bar.appendChild(el('i', 'h l')); bar.appendChild(el('i', 'h r'));
    bar.addEventListener('pointerdown', function (ev) {
      if (ev.button !== 0) return; ev.preventDefault();
      var mode = ev.target.classList.contains('l') ? 'l' : ev.target.classList.contains('r') ? 'r' : 'm', x0 = ev.clientX, moved = false, dk = 0;
      bar.setPointerCapture(ev.pointerId);
      function mv(m) {
        if (Math.abs(m.clientX - x0) > 4) moved = true; if (!moved) return;
        dk = Math.round((m.clientX - x0) / WPX); var na = a0, nb = b0;
        if (mode === 'm') { na = a0 + dk; nb = b0 + dk; } else if (mode === 'l') na = Math.min(a0 + dk, b0); else nb = Math.max(b0 + dk, a0);
        bar.style.left = (na - lo) * WPX + 2 + 'px'; bar.style.width = (nb - na + 1) * WPX - 4 + 'px';
      }
      function up() {
        bar.removeEventListener('pointermove', mv); bar.removeEventListener('pointerup', up); bar.removeEventListener('pointercancel', up);
        if (!moved) { openDrawer(it.id); return; }
        if (!dk) { render(); return; }
        var n = cur(it), s = e.s, en = e.e;
        if (mode === 'm') { s = iso(ms(e.s) + 7 * dk * DAY); en = e.e ? iso(ms(e.e) + 7 * dk * DAY) : ''; }
        else if (mode === 'l') { s = iso(weekMon(Math.min(a0 + dk, b0))); }
        else { en = iso(weekMon(Math.max(b0 + dk, a0)) + 4 * DAY); }
        n.s = s; n.e = en; commit(it, n);
      }
      bar.addEventListener('pointermove', mv); bar.addEventListener('pointerup', up); bar.addEventListener('pointercancel', up);
    });
    return bar;
  }

  function taskMarker(it, e) {
    var bl = e.ty === 'bl', late = bl && e.st !== 'Выполнено' && e.s < iso(todayMs);
    var m = el('div', 'mk ' + (bl ? 'bl ' : '') + (late ? 'late ' : '') + SCLS[e.st] + (sel === it.id ? ' on' : '')), left0 = xOf(e.s) - (bl ? 7 : 10); m.dataset.ms = it.id;
    m.style.left = left0 + 'px'; m.title = (bl ? 'Блокатор: ' : '') + it.title + '\n' + (bl ? 'снимется ' : '') + fmt(e.s) + ' · ' + e.st + (late ? ' · просрочен' : '');
    m.addEventListener('pointerdown', function (ev) {
      if (ev.button !== 0) return; ev.preventDefault();
      var x0 = ev.clientX, moved = false, dk = 0; m.setPointerCapture(ev.pointerId);
      function mv(q) { if (Math.abs(q.clientX - x0) > 4) moved = true; if (!moved) return; dk = Math.round((q.clientX - x0) / WPX); m.style.left = left0 + dk * WPX + 'px'; }
      function up() {
        m.removeEventListener('pointermove', mv); m.removeEventListener('pointerup', up); m.removeEventListener('pointercancel', up);
        if (!moved) { openDrawer(it.id); return; }
        if (!dk) { render(); return; }
        var n = cur(it); n.s = iso(ms(e.s) + 7 * dk * DAY); n.e = ''; commit(it, n);
      }
      m.addEventListener('pointermove', mv); m.addEventListener('pointerup', up); m.addEventListener('pointercancel', up);
    });
    return m;
  }

  // ---------- dependency arrows ----------
  function drawDeps(inn) {
    if (view.t !== 'tr') return;
    var ns = 'http://www.w3.org/2000/svg', s = document.createElementNS(ns, 'svg'), ir = inn.getBoundingClientRect(), any = false;
    s.setAttribute('class', 'deps'); s.setAttribute('width', inn.offsetWidth); s.setAttribute('height', inn.offsetHeight);
    function barOf(id) { var r = inn.querySelector('.row.tk[data-id="' + id + '"]'); return r && (r.querySelector('.bar') || r.querySelector('.mk')); }
    function rollOf(t) { var r = Array.prototype.filter.call(inn.querySelectorAll('.row.sh'), function (x) { return x.dataset.stage === t; })[0]; return r && r.querySelector('.roll'); }
    items.forEach(function (d) {
      var st = state[d.id]; if (!st || !st.dep || !st.dep.length) return;
      var tb = barOf(d.id); if (!tb) return; var tr = tb.getBoundingClientRect();
      st.dep.forEach(function (ref) {
        var pb = ref.indexOf('S:') === 0 ? rollOf(ref.slice(2)) : (ITEM[ref] ? barOf(ref) : null); if (!pb) return;
        var pr = pb.getBoundingClientRect(), below = tr.top > pr.top, x1 = pb.classList.contains('mk') ? pr.left + pr.width / 2 - ir.left : pr.right - ir.left - 8, y1 = (below ? pr.bottom : pr.top) - ir.top, x2 = tr.left - ir.left, y2 = tr.top + tr.height / 2 - ir.top;
        var pe = predEnd(ref), e = eff(d), bad = !!(pe && e.s && e.s <= pe), cls = bad ? 'bad' : '', path = document.createElementNS(ns, 'path'), poly = document.createElementNS(ns, 'polygon'), dd;
        if (x2 >= x1 + 8) dd = 'M' + x1 + ' ' + y1 + 'V' + y2 + 'H' + x2;
        else { var ym = ((below ? pr.bottom : pr.top) + (below ? tr.top : tr.bottom)) / 2 - ir.top; dd = 'M' + x1 + ' ' + y1 + 'V' + ym + 'H' + (x2 - 8) + 'V' + y2 + 'H' + x2; }
        path.setAttribute('d', dd); if (cls) path.setAttribute('class', cls);
        poly.setAttribute('points', x2 + ',' + y2 + ' ' + (x2 - 6) + ',' + (y2 - 3.5) + ' ' + (x2 - 6) + ',' + (y2 + 3.5)); if (cls) poly.setAttribute('class', cls);
        s.appendChild(path); s.appendChild(poly); any = true;
      });
    });
    if (any) inn.appendChild(s);
  }

  // ---------- note: inline tokens ----------
  // @! заказчик · @!! исполнитель · @!!! согласующий · @s старт · @f финиш · @% процент · @n краткое название
  var TOK = { '!': 'cu', '!!': 'as', '!!!': 'ap', s: 's', f: 'f', '%': 'p', n: 'n', '$': 'dp' }, WD = { 'пн': 1, 'вт': 2, 'ср': 3, 'чт': 4, 'пт': 5, 'сб': 6, 'вс': 0 };
  function parseNote(text) {
    var re = /(?<!\S)@(?:(!{1,3})|([sсfф%nн$]))(?=\s|$)/giu, list = [], m, out = { toks: list, v: {} };
    while ((m = re.exec(text))) {
      var c = m[2] ? m[2].toLowerCase() : '';
      list.push({ i: m.index, e: re.lastIndex, k: m[1] ? TOK[m[1]] : TOK[c === 'с' ? 's' : c === 'ф' ? 'f' : c === 'н' ? 'n' : c] });
    }
    list.forEach(function (t, j) {
      var end = j + 1 < list.length ? list[j + 1].i : text.length, nl = text.indexOf('\n', t.e); if (nl >= 0 && nl < end) end = nl;
      var raw = text.slice(t.e, end), lead = raw.length - raw.replace(/^[ \t]+/, '').length, body = raw.slice(lead), dbl = body.search(/ {2,}|\t/); if (dbl >= 0) body = body.slice(0, dbl); body = body.replace(/\s+$/, '');
      t.vs = t.e + lead; t.ve = t.vs + body.length; t.val = body.replace(/[,;]+$/, '').trim(); out.v[t.k] = t;
    });
    return out;
  }
  function stageNum(st) { return SNUM[st] || ''; }
  function resolveDep(part, self) {
    part = String(part || '').trim(); if (!part) return null;
    var key = part.replace(/\.$/, ''), low = part.toLowerCase(), ref = null, x = items.filter(function (i) { return numOf(i) === key; })[0];
    if (x) ref = x.id;
    else {
      var st = stagesList().filter(function (g) { return stageNum(g) === key; })[0];
      if (st) ref = 'S:' + st;
      else { x = items.filter(function (i) { return i.title.toLowerCase().indexOf(low) >= 0; })[0]; if (x) ref = x.id; }
    }
    return ref && canDep(self, ref) ? ref : null;
  }
  function depParts(val) { return String(val || '').split(/[;,]/).map(function (x) { return x.trim(); }).filter(Boolean); }
  function depRefs(text, self) { var out = []; parseNote(text || '').toks.forEach(function (t) { if (t.k === 'dp') depParts(t.val).forEach(function (q) { var r = resolveDep(q, self); if (r && out.indexOf(r) < 0) out.push(r); }); }); return out; }
  function depCanon(part, self) { var r = resolveDep(part, self); if (!r) return part; return r.indexOf('S:') === 0 ? (stageNum(r.slice(2)) || part) : (numOf(ITEM[r]) || part); }
  function dateParts(d, m, y) { var t = Date.UTC(y, m - 1, d), x = new Date(t); return x.getUTCFullYear() === y && x.getUTCMonth() === m - 1 && x.getUTCDate() === d ? t : null; }
  function parseDate(s) {
    s = String(s || '').trim().toLowerCase().replace(/[.,;]+$/, ''); if (!s) return null;
    var m, t = todayMs;
    if (s === 'сегодня') return iso(t); if (s === 'завтра') return iso(t + DAY); if (s === 'послезавтра') return iso(t + 2 * DAY); if (s === 'вчера') return iso(t - DAY);
    if ((m = /^\+(\d{1,3})\s*([дdнw])?[а-я]*$/.exec(s))) return iso(t + +m[1] * (m[2] === 'н' || m[2] === 'w' ? 7 : 1) * DAY);
    if ((m = /^(пн|вт|ср|чт|пт|сб|вс)[а-я]*$/.exec(s))) return iso(t + ((WD[m[1]] - new Date(t).getUTCDay() + 7) % 7) * DAY);
    if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s))) { var r = dateParts(+m[3], +m[2], +m[1]); return r == null ? null : iso(r); }
    if ((m = /^(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2}|\d{4}))?$/.exec(s))) {
      var y = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : new Date(t).getUTCFullYear(), r2 = dateParts(+m[1], +m[2], y);
      if (r2 != null && !m[3] && r2 < t - 60 * DAY) r2 = dateParts(+m[1], +m[2], y + 1);
      return r2 == null ? null : iso(r2);
    }
    return null;
  }
  function canonDate(s) { var p = s.split('-'), sh = p[2] + '.' + p[1]; return parseDate(sh) === s ? sh : sh + '.' + p[0]; }
  function cutTok(text, t) {
    var a = t.i, b = t.ve; while (a > 0 && (text[a - 1] === ' ' || text[a - 1] === '\t')) a--;
    if ((a === 0 || text[a - 1] === '\n') && text[b] === '\n') b++;
    return text.slice(0, a) + text.slice(b);
  }
  function plainNote(text) { var P = parseNote(text || ''), out = text || ''; P.toks.slice().reverse().forEach(function (t) { out = cutTok(out, t); }); return out.replace(/[ \t]+\n/g, '\n').trim(); }
  function syncTokens(text, o) {
    if (!text || text.indexOf('@') < 0) return text;
    for (var g = 0; g < 12; g++) {
      var toks = parseNote(text).toks, hit = false;
      for (var i = 0; i < toks.length && !hit; i++) {
        var t = toks[i], val = text.slice(t.vs, t.ve).trim(), nv = null, del = false;
        if (t.k === 's' || t.k === 'f') { var w = o.single ? o.s : t.k === 's' ? o.s : (o.e || o.s); if (!w) del = true; else if (parseDate(val) !== w) nv = canonDate(w); }
        else if (t.k === 'p' && !o.single && o.p != null) { if (parseInt(val, 10) !== o.p) nv = String(o.p); }
        if (del) { text = cutTok(text, t); hit = true; } else if (nv != null) { text = text.slice(0, t.e) + ' ' + nv + text.slice(t.ve); hit = true; }
      }
      if (!hit) break;
    }
    return text;
  }
  function applyNote(it, text, norm) {
    var n = cur(it), e0 = eff(it), prev = parseNote(n.d || '').v, P = parseNote(text), single = e0.ty === 'ms' || e0.ty === 'bl';
    if (norm) {
      P.toks.slice().reverse().forEach(function (t) {
        var d = (t.k === 's' || t.k === 'f') ? parseDate(t.val) : null;
        if (d && t.val !== canonDate(d)) text = text.slice(0, t.e) + ' ' + canonDate(d) + text.slice(t.ve);
        if (t.k === 'dp' && t.val) { var cv = depParts(t.val).map(function (q) { return depCanon(q, it); }).join(', '); if (cv !== t.val) text = text.slice(0, t.e) + ' ' + cv + text.slice(t.ve); }
      });
      text = text.replace(/\s+$/, ''); P = parseNote(text);
    }
    var v = P.v; var prevText = n.d || '';
    ['cu', 'as', 'ap'].forEach(function (k) { if (v[k]) n[k] = v[k].val; else if (prev[k]) n[k] = ''; });
    if (v.n) n.sn = v.n.val; else if (prev.n) n.sn = '';
    var sD = v.s ? parseDate(v.s.val) : null, fD = v.f ? parseDate(v.f.val) : null;
    if (single) { var d1 = fD || sD; if (d1) { n.s = d1; n.e = ''; } else if ((prev.s || prev.f) && !v.s && !v.f) { n.s = ''; n.e = ''; } }
    else {
      if (sD) n.s = sD; else if (prev.s && !v.s) n.s = '';
      if (fD) n.e = fD; else if (prev.f && !v.f) n.e = '';
      if (!n.s && n.e) n.s = n.e; if (n.s && n.e && n.e < n.s) n.e = n.s;
      if (v.p) {
        var pv = parseInt(v.p.val, 10);
        if (!isNaN(pv) && pv !== e0.p) { pv = Math.max(0, Math.min(100, pv)); var st = n.st || it.status; if (pv === 100) n.st = 'Выполнено'; else if (pv > 0 && (st === 'Открыт' || st === 'Выполнено')) n.st = 'В работе'; else if (pv === 0 && st === 'Выполнено') n.st = 'Открыт'; n.p = pv; }
      } else if (prev.p) n.p = null;
    }
    var pRefs = depRefs(prevText, it), nRefs = depRefs(text, it), added = [];
    n.d = text;
    nRefs.forEach(function (r) { if (pRefs.indexOf(r) < 0 && n.dep.indexOf(r) < 0) { n.dep.push(r); added.push(r); } });
    pRefs.forEach(function (r) { if (nRefs.indexOf(r) < 0) n.dep = n.dep.filter(function (x) { return x !== r; }); });
    noteSrc = true; commit(it, n); noteSrc = false;
    if (added.length) { var need = needShift(it); if (need > 0) { shift(it, need); cascade(it.id, {}, []); render(); syncDrawer(); toast('Старт сдвинут на ' + pl(need, ['день', 'дня', 'дней']) + ': после завершения предшественника', 2600); } }
  }
  function flushNote(fromBlur) {
    if (noteT) { clearTimeout(noteT); noteT = 0; }
    var it = ITEM[noteItem];
    if (noteDirty && it) { noteDirty = false; applyNote(it, ta.value, true); }
    if (!fromBlur && document.activeElement === ta) ta.blur();
  }
  function noteEdited() {
    var it = cur1(); if (!it) return; noteItem = it.id; noteDirty = true; renderNote(); renderChips(); renderMention();
    clearTimeout(noteT); noteT = setTimeout(function () { noteT = 0; var x = ITEM[noteItem]; if (x) applyNote(x, ta.value, false); }, 700);
  }
  function knownPeople() { var seen = {}, out = []; Object.keys(state).forEach(function (k) { ['cu', 'as', 'ap'].forEach(function (f) { var v = state[k][f]; if (v && !seen[v]) { seen[v] = 1; out.push(v); } }); }); return out; }
  function setStatus(name) { var it = cur1(); if (!it) return; var n = cur(it); n.st = name; if (name === 'Выполнено') n.p = 100; else if (n.p === 100) n.p = null; commit(it, n); }
  function renderNote() {
    var text = ta.value, P = parseNote(text), pos = 0; nb.textContent = '';
    function plain(a, b) { if (b > a) nb.appendChild(document.createTextNode(text.slice(a, b))); }
    P.toks.forEach(function (t) {
      var kind = t.k === 'cu' || t.k === 'as' || t.k === 'ap' ? 'kp' : t.k === 's' || t.k === 'f' ? 'kd' : t.k === 'dp' ? 'ka' : 'ko', selfIt = cur1();
      plain(pos, t.i); var mk = el('span', 'nm ' + kind); mk.textContent = text.slice(t.i, t.e); nb.appendChild(mk); plain(t.e, t.vs);
      if (t.ve > t.vs) { var badV = ((t.k === 's' || t.k === 'f') && !parseDate(t.val)) || (t.k === 'dp' && selfIt && t.val && depParts(t.val).some(function (q) { return !resolveDep(q, selfIt) && !(selfIt && selfIt.id && depRefs(selfIt && (state[selfIt.id] || {}).d, selfIt).length && false); })), vs = el('span', 'nv ' + kind + (badV ? ' bad' : '')); vs.textContent = text.slice(t.vs, t.ve); nb.appendChild(vs); }
      pos = t.ve;
    });
    plain(pos, text.length); nb.appendChild(document.createTextNode('​'));
  }
  var MARKS = [['@!', 'Заказчик'], ['@!!', 'Исполнитель'], ['@!!!', 'Согласующий'], ['@s', 'Старт'], ['@f', 'Финиш'], ['@%', 'Процент'], ['@$', 'Старт после…'], ['@n', 'Краткое название']], MK2K = { '@!': 'cu', '@!!': 'as', '@!!!': 'ap', '@s': 's', '@f': 'f', '@%': 'p', '@$': 'dp', '@n': 'n' };
  function keysFor(ty) { return ty === 'ms' ? ['cu', 'as', 'ap', 'f', 'dp', 'n'] : ty === 'bl' ? ['cu', 'as', 'ap', 'f', 'dp'] : ['cu', 'as', 'ap', 's', 'f', 'dp', 'p']; }
  function chipLabel(k, ty) { return k === 'f' ? (ty === 'ms' ? 'Дата' : ty === 'bl' ? 'Снимется' : 'Финиш') : { cu: 'Заказчик', as: 'Исполнитель', ap: 'Согласующий', s: 'Старт', dp: 'После', p: 'Прогресс', n: 'Кратко' }[k]; }
  function insertAtCaret(piece) {
    var text = ta.value, pos = document.activeElement === ta ? ta.selectionStart : text.length, pre = '';
    if (pos >= text.length) pre = text && text[text.length - 1] !== '\n' ? '\n' : ''; else if (pos > 0 && !/\s/.test(text[pos - 1])) pre = ' ';
    var ins = pre + piece; ta.value = text.slice(0, pos) + ins + text.slice(pos); ta.focus(); var cp = pos + ins.length; ta.setSelectionRange(cp, cp); mnOff = false; noteEdited();
  }
  function renderChips() {
    var it = cur1(); chipBar.textContent = ''; if (!it) return; var e = eff(it), P = parseNote(ta.value), seen = {};
    var add = el('button', 'chip add'); add.type = 'button'; add.title = 'Параметры (@)'; add.setAttribute('aria-label', 'Добавить параметр'); add.appendChild(svg(ICON.plus));
    add.addEventListener('mousedown', function (ev) { ev.preventDefault(); }); add.addEventListener('click', function () { insertAtCaret('@'); }); chipBar.appendChild(add);
    P.toks.forEach(function (t) {
      if (!t.val || seen[t.k]) return; seen[t.k] = 1; var bad = false, txt = t.val;
      if (t.k === 's' || t.k === 'f') { var dd = parseDate(t.val); if (dd) txt = fmtS(dd) + (dd.slice(0, 4) !== String(new Date(todayMs).getUTCFullYear()) ? '.' + dd.slice(2, 4) : ''); else bad = true; }
      else if (t.k === 'p') txt = t.val.replace(/%$/, '') + '%';
      else if (t.k === 'dp') { bad = depParts(t.val).some(function (q) { return !resolveDep(q, it); }); }
      var b = el('button', 'chip on' + (bad ? ' bad' : '')); b.type = 'button'; b.title = chipLabel(t.k, e.ty);
      b.appendChild(el('span', 'cl', chipLabel(t.k, e.ty))); b.appendChild(el('span', 'cv', clip(txt, 24)));
      b.addEventListener('mousedown', function (ev) { ev.preventDefault(); });
      b.addEventListener('click', function () { var P2 = parseNote(ta.value), t2 = P2.v[t.k]; if (!t2) return; ta.focus(); ta.setSelectionRange(t2.vs, Math.max(t2.vs, t2.ve)); mnOff = false; renderMention(); });
      chipBar.appendChild(b);
    });
  }

  // ---- @-menu: continuations and values, Tab inserts
  function caretRect(pos) {
    var w = document.createTreeWalker(nb, NodeFilter.SHOW_TEXT), n, acc = 0, rng = document.createRange();
    while ((n = w.nextNode())) {
      var l = n.nodeValue.length;
      if (pos <= acc + l) { rng.setStart(n, pos - acc); rng.collapse(true); var m = document.createElement('span'); m.textContent = '\u200b'; rng.insertNode(m); var r = m.getBoundingClientRect(); m.remove(); nb.normalize(); return r; }
      acc += l;
    }
    return nb.getBoundingClientRect();
  }
  function mentionCtx() {
    var pos = ta.selectionStart, text = ta.value, i = pos; if (ta.selectionEnd !== pos) return null;
    while (i > 0 && !/\s/.test(text[i - 1])) i--;
    var word = text.slice(i, pos); if (word[0] === '@') return { type: 'marker', from: i, to: pos, typed: word };
    var P = parseNote(text), t = null;
    P.toks.forEach(function (x) { var te = x.ve; if (text[te] === ' ' && text[te + 1] !== ' ') te++; if (pos >= x.e + 1 && pos <= te) t = x; });
    return t ? { type: 'value', t: t } : null;
  }
  function closeValue() {
    var c = mentionCtx(); if (!c || c.type !== 'value' || !c.t.val) return false;
    var tx = ta.value, ve = c.t.ve, nx = tx.slice(ve, ve + 2), ins = nx === '  ' ? '' : nx[0] === ' ' ? ' ' : '  ';
    if (ins) ta.value = tx.slice(0, ve) + ins + tx.slice(ve);
    var cp = ve + 2; ta.setSelectionRange(cp, cp); noteEdited(); return true;
  }
  function acceptMention(o) { var tx = ta.value; ta.value = tx.slice(0, o.from) + o.ins + tx.slice(o.to); var c = o.from + o.ins.length; ta.focus(); ta.setSelectionRange(c, c); mnOff = false; noteEdited(); }
  function paintMention() { Array.prototype.forEach.call(mnEl.querySelectorAll('.mi'), function (b, i) { b.setAttribute('aria-selected', String(mn && i === mn.sel)); }); }
  function hideMention() { mnEl.textContent = ''; mnEl.style.display = 'none'; mn = null; }
  function renderMention() {
    hideMention(); if (mnOff || document.activeElement !== ta) return;
    var it = cur1(); if (!it) return; var e = eff(it), ctx = mentionCtx(), text = ta.value, items = []; if (!ctx) return;
    if (ctx.type === 'marker') {
      var typed = ctx.typed.toLowerCase().replace(/^@с/, '@s').replace(/^@ф/, '@f').replace(/^@н/, '@n'), used = {};
      parseNote(text).toks.forEach(function (t) { if (t.i !== ctx.from) used[t.k] = 1; });
      var allow = keysFor(e.ty);
      MARKS.forEach(function (m) {
        var k = MK2K[m[0]]; if (allow.indexOf(k) < 0 || (used[k] && k !== 'dp') || m[0].indexOf(typed) !== 0) return;
        var lab = k === 'f' ? (e.ty === 'ms' ? 'Дата достижения' : e.ty === 'bl' ? 'Блокатор снимется' : m[1]) : m[1];
        items.push({ mk: m[0], label: lab, from: ctx.from, to: ctx.to, ins: m[0] + ' ' });
      });
    } else {
      var t = ctx.t, pos = ta.selectionStart;
      if (t.k === 'cu' || t.k === 'as' || t.k === 'ap') { var q = t.val.toLowerCase(); knownPeople().forEach(function (nm) { var l = nm.toLowerCase(); if (l !== q && (!q || l.indexOf(q) >= 0)) items.push({ label: nm, from: t.e, to: t.ve, ins: ' ' + nm }); }); }
      else if (t.k === 's' || t.k === 'f') {
        var add = function (lab, d) { if (t.val && lab.toLowerCase().indexOf(t.val.toLowerCase()) !== 0 && lab.toLowerCase().indexOf(t.val.toLowerCase()) < 0) return; items.push({ label: lab + ' · ' + fmtS(d), from: t.e, to: t.ve, ins: ' ' + canonDate(d) }); };
        if (t.val && parseDate(t.val)) add = function () {};
        add('Сегодня', iso(todayMs)); add('Завтра', iso(todayMs + DAY));
        [[1, 'Пн'], [5, 'Пт']].forEach(function (w) { add(w[1], iso(todayMs + ((w[0] - new Date(todayMs).getUTCDay() + 7) % 7 || 7) * DAY)); });
        add('+1 нед', iso(todayMs + 7 * DAY)); add('+2 нед', iso(todayMs + 14 * DAY));
      } else if (t.k === 'p') (t.val ? [] : [0, 25, 50, 75, 100]).forEach(function (v) { items.push({ label: v + '%', from: t.e, to: t.ve, ins: ' ' + v }); });
      else if (t.k === 'dp') {
        var seg = text.slice(t.vs, pos), cut = Math.max(seg.lastIndexOf(','), seg.lastIndexOf(';')), ps = t.vs + cut + 1; while (text[ps] === ' ') ps++;
        var pe = pos; while (pe < t.ve && text[pe] !== ',' && text[pe] !== ';') pe++;
        var qd = text.slice(ps, pe).trim().toLowerCase(), have = depRefs(text, it), pool = items0(it);
        pool.forEach(function (x) {
          if (have.indexOf(x.id) >= 0 || !canDep(it, x.id)) return;
          var nm = numOf(x) || '', hay = (nm + ' ' + x.title).toLowerCase(); if (qd && hay.indexOf(qd) < 0) return;
          var pe2 = predEnd(x.id); items.push({ pr: qd && nm.indexOf(qd) === 0 ? 0 : 1, label: label(x) + (pe2 ? ' · до ' + fmtS(pe2) : ''), from: ps, to: pe, ins: nm || clip(x.short, 40) });
        });
      }
    }
    items = items.map(function (o, i) { o.ix = i; return o; }).sort(function (a, c) { return (a.pr || 0) - (c.pr || 0) || a.ix - c.ix; }).slice(0, 8); if (!items.length) return;
    mn = { items: items, sel: 0 };
    items.forEach(function (o, i) {
      var b = el('button', 'mi'); b.type = 'button';
      if (o.mk) { b.appendChild(el('b', '', o.mk)); b.appendChild(el('span', '', o.label)); } else b.appendChild(el('span', 'val', o.label));
      b.appendChild(el('kbd', '', 'Tab'));
      b.addEventListener('mousedown', function (ev) { ev.preventDefault(); }); b.addEventListener('mouseenter', function () { mn.sel = i; paintMention(); });
      b.addEventListener('click', function () { acceptMention(o); }); mnEl.appendChild(b);
    });
    mnEl.style.display = 'block'; paintMention();
    var r = caretRect(ta.selectionStart), nr = noteBoxEl.getBoundingClientRect(), left = r.left - nr.left, top = r.bottom - nr.top + 4;
    if (left + mnEl.offsetWidth > nr.width) left = Math.max(0, nr.width - mnEl.offsetWidth);
    if (r.bottom + mnEl.offsetHeight + 100 > window.innerHeight) top = r.top - nr.top - mnEl.offsetHeight - 4;
    mnEl.style.left = left + 'px'; mnEl.style.top = top + 'px';
  }
  function items0(it) { var same = items.filter(function (x) { return x !== it && x.stage === it.stage; }), rest = items.filter(function (x) { return x !== it && x.stage !== it.stage; }); return same.concat(rest); }

  // ---------- drawer ----------
  mnEl = el('div', 'mention'); mnEl.setAttribute('role', 'listbox');
  var dr = el('aside', 'drawer'); dr.setAttribute('aria-label', 'Параметры задачи'); document.body.appendChild(dr);
  var cmIn = el('textarea'), boxCm = el('div', 'cm-list');
  function cmOf(id) { return Object.keys(cmts).map(function (k) { return cmts[k]; }).filter(function (c) { return c.item === id; }).sort(function (a, b) { return b.ts - a.ts; }); }
  function saveCm(id) {
    if (!db) { localSave(); return; }
    queue('k' + id, function () { var ref = db.collection('comments').doc(id), c = cmts[id]; return c ? ref.set({ item: c.item, text: c.text, ts: c.ts }) : ref.delete(); });
  }
  function addCm(text) {
    var it = cur1(); text = (text || '').trim(); if (!it || !text) return;
    var id = 'k' + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36); cmts[id] = { id: id, item: it.id, text: text, ts: Date.now() };
    cmIn.value = ''; saveCm(id); renderCm(); render();
  }
  function cmDate(ts) { var d = new Date(ts); return p2(d.getDate()) + '.' + p2(d.getMonth() + 1) + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes()); }
  function renderCm() {
    var it = cur1(); boxCm.textContent = ''; if (!it) return; var list = cmOf(it.id);
    navB.cm.title = 'Комментарии' + (list.length ? ' · ' + list.length : ''); navB.cm.setAttribute('aria-label', navB.cm.title);
    if (!list.length) { boxCm.appendChild(el('div', 'empty', 'Пока пусто. Отметьте, что и кем сделано.')); return; }
    list.forEach(function (c) {
      var r = el('div', 'cm-i'), h = el('div', 'cm-h'), x = el('button', 'cm-x'); h.appendChild(el('span', '', cmDate(c.ts)));
      x.type = 'button'; x.title = 'Удалить'; x.setAttribute('aria-label', 'Удалить комментарий'); x.appendChild(svg(ICON.x)); x.addEventListener('click', function () { delete cmts[c.id]; saveCm(c.id); renderCm(); render(); });
      h.appendChild(x); r.appendChild(h); r.appendChild(el('div', 'cm-t', c.text)); boxCm.appendChild(r);
    });
  }
  var dTitle = el('div', 'dtitle'), dSub = el('div', 'dsub'), panes = {}, navB = {}, stBtns = {}, roBtns = {};
  var inS = el('input'), inE = el('input'), range = el('input'), big = el('span', 'big'), inName = el('input'), inCu = el('input'), inAs = el('input'), inAp = el('input'), ta = el('textarea');
  var metaEl = el('dl', 'meta'), delBtn = el('button', 'btn danger', 'Удалить подзадачу'), nameFld, depSel = el('select', 'sel'), newIn = el('input', 'newin');
  var nb = el('div', 'nb'), chipBar = el('div', 'nchips'), pills = {}, newBl = el('input', 'newin'), typeSec, roleSec, dateSec, dateLab, fS, fE, two0, chipsEl, progSec, clrBtn, snFld, descFld, peopleSec, tyBtns = {}, inSn = el('input');
  var boxParent = el('div', 'list'), boxDeps = el('div', 'list'), boxNext = el('div', 'list'), boxKids = el('div', 'list'), boxRefs = el('div', 'list');
  function cur1() { return ITEM[sel]; }
  function field(lbl, input) { var l = el('label', 'fld', lbl); l.appendChild(input); return l; }
  function section(lbl) { var s = el('div', 'sec'); if (lbl) s.appendChild(el('div', 'lab', lbl)); return s; }
  (function () {
    var head = el('div', 'dhead'), ht = el('div', 'dht'); ht.appendChild(dTitle); ht.appendChild(dSub); head.appendChild(ht);
    var x = el('button', 'x'); x.type = 'button'; x.setAttribute('aria-label', 'Закрыть'); x.appendChild(svg(ICON.x)); x.addEventListener('click', closeDrawer); head.appendChild(x);
    var body = el('div', 'dbody');
    ['plan', 'desc', 'cm', 'links'].forEach(function (k) { var p = el('div', 'pane' + (k === 'desc' ? ' col' : '')); panes[k] = p; body.appendChild(p); });
    // --- planning
    var s0 = section('Тип'), g0 = el('div', 'seg c3 tall'); typeSec = s0;
    [['t', 'Задача'], ['ms', 'Целевое состояние'], ['bl', 'Блокатор']].forEach(function (q) {
      var b = el('button', '', q[1]); b.type = 'button';
      b.addEventListener('click', function () { var it = cur1(); if (!it || it.stat) return; var n = cur(it); n.ty = q[0]; if (q[0] !== 't') n.e = ''; if (q[0] === 'bl' && !eff(it).s) n.s = iso(weekMon(todayIdx + 1) + 4 * DAY); commit(it, n); });
      g0.appendChild(b); tyBtns[q[0]] = b;
    });
    s0.appendChild(g0); panes.plan.appendChild(s0);
    var s1 = section('Статус'), g1 = el('div', 'seg c2');
    STATUS.forEach(function (s) {
      var b = el('button'); b.type = 'button'; b.appendChild(el('i', 'dot ' + s[1])); b.appendChild(document.createTextNode(s[0]));
      b.addEventListener('click', function () { var it = cur1(); if (!it) return; var n = cur(it); n.st = s[0]; if (s[0] === 'Выполнено') n.p = 100; else if (n.p === 100) n.p = null; commit(it, n); });
      g1.appendChild(b); stBtns[s[0]] = b;
    });
    s1.appendChild(g1); panes.plan.appendChild(s1);
    var s2 = section('Роль'), g2 = el('div', 'seg c3');
    ROLES.forEach(function (r) {
      var b = el('button'); b.type = 'button'; b.title = r.sub; var q = el('i', 'sq'); q.style.background = r.color; b.appendChild(q); b.appendChild(document.createTextNode(r.name));
      b.addEventListener('click', function () { var it = cur1(); if (!it) return; var n = cur(it); n.r = r.key; commit(it, n); });
      g2.appendChild(b); roBtns[r.key] = b;
    });
    s2.appendChild(g2); panes.plan.appendChild(s2); roleSec = s2;
    var s3 = section('Сроки'), two = el('div', 'two'), clr = el('button', 'btn link', 'Сбросить'); clr.type = 'button';
    s3.firstChild.appendChild(clr); dateSec = s3; dateLab = s3.firstChild; clrBtn = clr; two0 = two;
    inS.type = 'date'; inE.type = 'date'; fS = field('Начало', inS); fE = field('Окончание', inE); two.appendChild(fS); two.appendChild(fE); s3.appendChild(two);
    var ch = el('div', 'chips');
    [['1 неделя', 1], ['2 недели', 2], ['3 недели', 3], ['1 месяц', 0]].forEach(function (p) {
      var b = el('button', 'btn', p[0]); b.type = 'button';
      b.addEventListener('click', function () {
        var it = cur1(); if (!it) return; var n = cur(it), s = n.s || iso(weekMon(Math.floor((todayMs - W0) / DAY / 7))), sm = ms(s), en;
        if (p[1]) en = sm + (7 * p[1] - 1) * DAY; else { var d = new Date(sm); d.setUTCMonth(d.getUTCMonth() + 1); en = d.getTime() - DAY; }
        n.s = s; n.e = iso(en); commit(it, n);
      });
      ch.appendChild(b);
    });
    s3.appendChild(ch); panes.plan.appendChild(s3); chipsEl = ch;
    clr.addEventListener('click', function () { var it = cur1(); if (!it) return; var n = cur(it); n.s = ''; n.e = ''; commit(it, n); });
    inS.addEventListener('change', function () {
      var it = cur1(); if (!it) return; var n = cur(it); n.s = inS.value; if (it.stat && !n.s) { syncDrawer(); return; } if (!n.s || eff(it).ty === 'ms') n.e = ''; else if (n.e && n.e < n.s) n.e = n.s; inE.classList.remove('bad'); commit(it, n);
    });
    inE.addEventListener('change', function () {
      var it = cur1(); if (!it) return; var n = cur(it);
      if (inE.value && n.s && inE.value < n.s) { inE.classList.add('bad'); return; }
      inE.classList.remove('bad'); n.e = inE.value; if (n.e && !n.s) n.s = n.e; commit(it, n);
    });
    var s4 = section(), lab = el('div', 'lab'); lab.style.display = 'flex'; lab.style.justifyContent = 'space-between'; lab.style.alignItems = 'baseline';
    lab.appendChild(el('span', '', 'Процент выполнения')); lab.appendChild(big); s4.appendChild(lab);
    range.type = 'range'; range.min = 0; range.max = 100; range.step = 5; range.setAttribute('aria-label', 'Процент выполнения'); s4.appendChild(range); panes.plan.appendChild(s4); progSec = s4;
    range.addEventListener('input', function () { big.textContent = range.value + '%'; });
    range.addEventListener('change', function () { setProgress(+range.value); });
    // --- description
    inName.className = 'seam-title'; inName.type = 'text'; inName.placeholder = 'Название'; inName.setAttribute('aria-label', 'Название'); panes.desc.appendChild(inName);
    var noteBox = noteBoxEl = el('div', 'note'); nb.setAttribute('aria-hidden', 'true'); ta.className = 'ni'; ta.spellcheck = false; ta.setAttribute('aria-label', 'Заметка');
    noteBox.appendChild(nb); noteBox.appendChild(ta); noteBox.appendChild(mnEl); panes.desc.appendChild(noteBox);
    ta.addEventListener('input', function () { mnOff = false; noteEdited(); });
    ta.addEventListener('keyup', function (ev) { if (['ArrowDown', 'ArrowUp', 'Tab', 'Escape', 'Shift'].indexOf(ev.key) >= 0) return; renderMention(); });
    ta.addEventListener('click', renderMention);
    ta.addEventListener('keydown', function (ev) {
      if (!mn) { if (ev.key === 'Tab' && !ev.shiftKey && !ev.altKey && !ev.ctrlKey && closeValue()) ev.preventDefault(); return; } var n = mn.items.length;
      if (ev.key === 'Tab' && !ev.shiftKey) { ev.preventDefault(); acceptMention(mn.items[mn.sel]); }
      else if (ev.key === 'ArrowDown') { ev.preventDefault(); mn.sel = (mn.sel + 1) % n; paintMention(); }
      else if (ev.key === 'ArrowUp') { ev.preventDefault(); mn.sel = (mn.sel + n - 1) % n; paintMention(); }
      else if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); mnOff = true; hideMention(); }
    });
    ta.addEventListener('blur', function () { hideMention(); flushNote(true); });
    var foot = el('div', 'nfoot'); foot.appendChild(chipBar);
    inName.addEventListener('change', function () {
      var it = cur1(); if (!it || !it.custom || !inName.value.trim()) return; customs[it.id].title = inName.value.trim().replace(NUMSTRIP, '').trim() || inName.value.trim(); rebuild(); render(); saveCustom(it.id); syncDrawer();
    });
    delBtn.type = 'button'; delBtn.style.marginTop = '12px';
    delBtn.addEventListener('click', function () {
      var it = cur1(); if (!it || !it.custom) return;
      if (delBtn.dataset.armed !== '1') { delBtn.dataset.armed = '1'; delBtn.textContent = 'Точно удалить?'; setTimeout(function () { delBtn.dataset.armed = ''; delBtn.textContent = 'Удалить подзадачу'; }, 3000); return; }
      removeCustom(it.id);
    });
    panes.desc.appendChild(delBtn); panes.desc.appendChild(foot);
    // --- links
    var l1 = section('Родитель'); l1.appendChild(boxParent); panes.links.appendChild(l1);
    var l2 = section('Старт после завершения'); l2.appendChild(boxDeps); depSel.setAttribute('aria-label', 'Добавить зависимость'); l2.appendChild(depSel); panes.links.appendChild(l2);
    depSel.addEventListener('change', function () { var it = cur1(); var v = depSel.value; depSel.value = ''; if (it && v) addDep(it, v); });
    var l3 = section('Следом идут'); l3.appendChild(boxNext); panes.links.appendChild(l3);
    var l4 = section('Подзадачи'); l4.appendChild(boxKids); newIn.type = 'text'; newIn.placeholder = 'Новая подзадача, Enter'; newIn.setAttribute('aria-label', 'Новая подзадача'); newIn.style.marginTop = '8px'; l4.appendChild(newIn); panes.links.appendChild(l4);
    newIn.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Enter') return; ev.preventDefault(); var it = cur1(), v = newIn.value.trim(); if (!it || !v) return;
      adding = { pid: it.id, stage: it.stage || '', role: eff(it).role, mode: grp, val: '', focus: false }; open['t:' + it.id] = true; createItem(v); adding = null; newIn.value = ''; render(); syncDrawer(); newIn.focus();
    });
    newBl.type = 'text'; newBl.placeholder = 'Новый блокатор, Enter'; newBl.setAttribute('aria-label', 'Новый блокатор'); newBl.style.marginTop = '8px'; l4.appendChild(newBl);
    newBl.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Enter') return; ev.preventDefault(); var it = cur1(), v = newBl.value.trim(); if (!it || !v) return;
      adding = { pid: it.id, stage: it.stage || '', role: eff(it).role, mode: grp, val: '', focus: false }; open['t:' + it.id] = true;
      var id = createItem(v); adding = null; newBl.value = '';
      var nb = ITEM[id]; if (nb) { var n = cur(nb); n.ty = 'bl'; n.s = iso(weekMon(todayIdx + 1) + 4 * DAY); commit(nb, n); toast('Блокатор добавлен: точка на неделе ' + fmtS(n.s) + ', дату можно поменять', 3200); }
      newBl.focus();
    });
    var l5 = section('Упоминания по номеру в названии'); l5.appendChild(boxRefs); panes.links.appendChild(l5);
    // --- nav
    cmIn.className = 'cm-in'; cmIn.rows = 2; cmIn.placeholder = 'Что изменилось? Enter — добавить'; cmIn.setAttribute('aria-label', 'Новый комментарий');
    cmIn.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing) { ev.preventDefault(); addCm(cmIn.value); } });
    var cmB = el('button', 'btn cm-add', 'Добавить'); cmB.type = 'button'; cmB.addEventListener('click', function () { addCm(cmIn.value); });
    panes.cm.appendChild(cmIn); panes.cm.appendChild(cmB); panes.cm.appendChild(boxCm);
    var nav = el('nav', 'dnav'); nav.setAttribute('aria-label', 'Разделы задачи');
    [['plan', 'Планирование', ICON.cal], ['desc', 'Описание', ICON.doc], ['cm', 'Комментарии', ICON.chat], ['links', 'Связи', ICON.net]].forEach(function (t) {
      var b = el('button'); b.type = 'button'; b.title = t[1]; b.setAttribute('aria-label', t[1]); b.appendChild(svg(t[2])); b.appendChild(el('span', '', t[1]));
      b.addEventListener('click', function () { tab = t[0]; syncTabs(); }); nav.appendChild(b); navB[t[0]] = b;
    });
    dr.appendChild(head); dr.appendChild(body); dr.appendChild(nav);
  })();
  function syncTabs() { var cu0 = cur1(); dr.classList.toggle('et', !!(cu0 && cu0.custom && tab === 'desc')); Object.keys(panes).forEach(function (k) { panes[k].classList.toggle('on', k === tab); navB[k].setAttribute('aria-pressed', String(k === tab)); }); }
  function setProgress(v) {
    var it = cur1(); if (!it) return; var n = cur(it), st = n.st || it.status;
    if (v === 100) n.st = 'Выполнено'; else if (v > 0 && (st === 'Открыт' || st === 'Выполнено')) n.st = 'В работе'; else if (v === 0 && st === 'Выполнено') n.st = 'Открыт';
    n.p = v; commit(it, n);
  }
  function openDrawer(id, t) { flushNote(); if (t) tab = t; else if (ITEM[id] && isPt(ITEM[id])) tab = 'desc'; sel = id; dr.classList.add('open'); mark(); syncDrawer(); }
  function closeDrawer() { flushNote(); sel = null; dr.classList.remove('open'); mark(); }
  function gotoItem(id) {
    var it = ITEM[id]; if (!it) return;
    if (view.t === 'tr' && curTrack().own) { if (grp === 'stage') { if (it.stage) open['st:' + it.stage] = true; var p = it.pid; while (p) { open['t:' + p] = true; p = (ITEM[p] || {}).pid; } } else open[eff(it).role] = true; }
    sel = id; render(); mark(); syncDrawer();
    var r = sc.querySelector('.row.tk[data-id="' + id + '"]'); if (r) r.scrollIntoView({ block: 'center' });
  }
  function mark() {
    sc.querySelectorAll('.row.tk').forEach(function (r) { r.classList.toggle('on', r.dataset.id === sel); });
    sc.querySelectorAll('.bar').forEach(function (b) { b.classList.remove('on'); });
    sc.querySelectorAll('[data-ms]').forEach(function (b) { b.classList.toggle('on', b.dataset.ms === sel); });
    var r = sel && sc.querySelector('.row.tk[data-id="' + sel + '"] .bar'); if (r) r.classList.add('on');
  }
  function lnk(it, extra, cls) {
    var b = el('button', 'lnk' + (cls ? ' ' + cls : '')); b.type = 'button'; var e = eff(it);
    b.appendChild(el('i', 'dot ' + SCLS[e.st])); b.appendChild(el('b', '', label(it))); b.title = it.title;
    if (extra) b.appendChild(typeof extra === 'string' ? el('i', '', extra) : extra);
    b.addEventListener('click', function () { gotoItem(it.id); }); return b;
  }
  function refsIn(it) { var seen = {}, out = [], m, re = /\b\d+(?:\.\d+)+\b/g, own = numOf(it); while ((m = re.exec(it.title))) { if (m[0] !== own && !seen[m[0]]) { seen[m[0]] = 1; out.push(m[0]); } } return out; }
  function byNum(n, except) { return items.filter(function (x) { return x !== except && numOf(x) === n; })[0]; }
  function syncDrawer() {
    var it = cur1(); if (!it) { if (sel) closeDrawer(); return; } var e = eff(it);
    var msT = e.ty === 'ms', blT = e.ty === 'bl', one = msT || blT;
    dTitle.textContent = it.title; dTitle.title = it.title; dSub.textContent = [blT ? 'Блокатор' : msT ? (it.stat ? (it.track ? 'Целевое состояние · трек ' + it.track : 'Целевое состояние · все треки') : 'Целевое состояние') : '', msT && it.stat ? '' : it.stage, it.parent ? '↳ ' + it.parent : ''].filter(Boolean).join(' · ');
    renderCm(); syncTabs();
    typeSec.style.display = it.stat ? 'none' : ''; Object.keys(tyBtns).forEach(function (k) { tyBtns[k].setAttribute('aria-pressed', String(k === (e.ty || 't'))); });
    roleSec.style.display = one ? 'none' : ''; progSec.style.display = one ? 'none' : ''; chipsEl.style.display = one ? 'none' : ''; fE.style.display = one ? 'none' : '';
    two0.style.gridTemplateColumns = one ? '1fr' : ''; dateLab.firstChild.nodeValue = one ? 'Дата' : 'Сроки'; fS.firstChild.nodeValue = blT ? 'Блокатор снимется' : msT ? 'Дата достижения' : 'Начало';
    clrBtn.style.display = it.stat ? 'none' : '';
    STATUS.forEach(function (s) { stBtns[s[0]].setAttribute('aria-pressed', String(s[0] === e.st)); });
    ROLES.forEach(function (r) { roBtns[r.key].setAttribute('aria-pressed', String(r.key === e.role)); });
    if (document.activeElement !== inS) inS.value = e.s; if (document.activeElement !== inE) inE.value = e.e; inE.min = e.s || '';
    range.value = e.p; big.textContent = e.p + '%';
    // description
    inName.style.display = it.custom ? '' : 'none'; if (document.activeElement !== inName) inName.value = (it.name || it.title).replace(NUMSTRIP, '');
    if (document.activeElement !== ta) ta.value = e.d;
    ta.placeholder = (blT ? 'Что блокирует и кто снимет' : msT ? 'Что должно быть достигнуто' : 'Заметка') + ' · введите @ для параметров';
    renderNote(); renderChips(); renderMention();
    metaEl.textContent = '';
    function kv(k, v) { if (v) { metaEl.appendChild(el('dt', '', k)); metaEl.appendChild(el('dd', '', v)); } }
    kv('Этап', stageTitle(it.stage)); kv('К задаче', it.parent); if (one) kv(blT ? 'Снимется' : 'Дата', e.s ? fmt(e.s) : '');
    if (it.stat) kv('Источник', 'roadmap, ' + (it.track ? 'трек ' + it.track : 'все треки'));
    else if (it.custom) kv('Источник', 'Добавлено вручную'); else if (it.file) kv('Файл', it.file); else { kv('Источник', 'GanttPRO, ID ' + it.gid); kv('В выгрузке', it.status + (it.pct ? ', ' + it.pct : '')); }
    delBtn.style.display = it.custom ? '' : 'none';
    // links
    boxParent.textContent = '';
    var par = it.pid ? ITEM[it.pid] : null;
    if (par) boxParent.appendChild(lnk(par)); else boxParent.appendChild(el('div', 'none', it.stage ? 'Этап: ' + stageTitle(it.stage) : 'Верхний уровень'));
    boxDeps.textContent = '';
    e.dep.forEach(function (ref) {
      var pe = predEnd(ref), b = el('div', 'lnk static'), nm;
      if (ref.indexOf('S:') === 0) { nm = el('b', '', predLabel(ref)); nm.title = ref.slice(2); } else { var p = ITEM[ref]; nm = el('b', '', predLabel(ref)); nm.title = p.title; nm.style.cursor = 'pointer'; nm.addEventListener('click', function () { gotoItem(ref); }); }
      b.appendChild(nm);
      var bad = pe && e.s && e.s <= pe;
      b.appendChild(el('i', bad ? 'warn' : '', pe ? 'до ' + fmtS(pe) + (bad ? ' · конфликт' : '') : 'без срока'));
      if (bad) { var fix = el('button', 'btn', 'Сдвинуть'); fix.type = 'button'; fix.title = 'Начать на следующий день после завершения'; fix.addEventListener('click', function () { var d = needShift(it); if (d > 0) { shift(it, d); var mv = []; cascade(it.id, {}, mv); render(); syncDrawer(); } }); b.appendChild(fix); }
      var rm = el('button', 'rm'); rm.type = 'button'; rm.title = 'Убрать зависимость'; rm.setAttribute('aria-label', 'Убрать зависимость'); rm.appendChild(svg(ICON.x)); rm.addEventListener('click', function () { rmDep(it, ref); }); b.appendChild(rm);
      boxDeps.appendChild(b);
    });
    depSel.textContent = '';
    var o0 = el('option', '', e.dep.length ? 'Добавить ещё…' : 'Выбрать задачу или этап…'); o0.value = ''; depSel.appendChild(o0);
    var og = el('optgroup'); og.label = 'Этапы';
    stagesList().forEach(function (s) { var r = 'S:' + s; if (e.dep.indexOf(r) < 0 && canDep(it, r)) { var o = el('option', '', clip(stageTitle(s), 56)); o.value = r; og.appendChild(o); } });
    if (og.children.length) depSel.appendChild(og);
    var og2 = el('optgroup'); og2.label = 'Задачи';
    items.forEach(function (x) { if (e.dep.indexOf(x.id) < 0 && canDep(it, x.id)) { var pe = predEnd(x.id), o = el('option', '', label(x) + (pe ? ' · до ' + fmtS(pe) : '')); o.value = x.id; og2.appendChild(o); } });
    if (og2.children.length) depSel.appendChild(og2);
    boxNext.textContent = '';
    var nxt = items.filter(function (d) { return eff(d).dep.some(function (r) { return affects(r, it.id); }); });
    nxt.forEach(function (d) { boxNext.appendChild(lnk(d, violated(d) ? (function () { var w = el('i', 'warn', 'конфликт'); return w; })() : null)); });
    if (!nxt.length) boxNext.appendChild(el('div', 'none', 'Пока никто не ждёт эту задачу'));
    boxKids.textContent = '';
    var kids = kidsOf(it.id); kids.forEach(function (k) { boxKids.appendChild(lnk(k)); });
    if (!kids.length) boxKids.appendChild(el('div', 'none', 'Подзадач нет'));
    boxRefs.textContent = '';
    var rf = [], seenId = {};
    refsIn(it).forEach(function (n) { var x = byNum(n, it); if (x && !seenId[x.id]) { seenId[x.id] = 1; rf.push([x, 'в названии: ' + n]); } });
    var mine = numOf(it); if (mine) items.forEach(function (x) { if (x !== it && !seenId[x.id] && refsIn(x).indexOf(mine) >= 0) { seenId[x.id] = 1; rf.push([x, 'ссылается на ' + mine]); } });
    rf.forEach(function (r) { boxRefs.appendChild(lnk(r[0], r[1])); });
    if (!rf.length) boxRefs.parentNode.style.display = 'none'; else boxRefs.parentNode.style.display = '';
  }
  document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape' && sel && !adding) closeDrawer(); });

  // ---------- toast ----------
  var toastEl = document.getElementById('toast'), toastT;
  function toast(t, d) { toastEl.textContent = t; toastEl.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(function () { toastEl.classList.remove('on'); }, d || 1600); }

  // ---------- shared storage ----------
  // ---- local copy: used when there is no shared database (standalone .html)
  var SEED = null; try { var sdEl = document.getElementById('seed'); SEED = sdEl ? JSON.parse(sdEl.textContent) : null; } catch (e) {}
  var LS_KEY = 'rm-local-v1' + (SEED ? '-' + SEED.stamp : ''), lsT = 0, lsWarned = false, lsToast = 0;
  function localSave() {
    clearTimeout(lsT);
    lsT = setTimeout(function () {
      try { localStorage.setItem(LS_KEY, JSON.stringify({ v: 1, state: state, customs: customs, moves: moves, orders: orders, cmts: cmts })); if (Date.now() - lsToast > 4000) { lsToast = Date.now(); toast('Сохранено в этом браузере', 1200); } }
      catch (e) { if (!lsWarned) { lsWarned = true; toast('Браузер не даёт сохранить изменения: после закрытия страницы они пропадут', 4000); } }
    }, 60);
  }
  function localLoad() {
    try {
      var v = null; try { v = JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch (e) {}
      if ((!v || v.v !== 1) && SEED) v = { v: 1, state: SEED.state, customs: SEED.customs, moves: SEED.moves, orders: SEED.orders, cmts: SEED.cmts };
      if (!v || v.v !== 1) return false;
      v = JSON.parse(JSON.stringify(v));
      state = v.state || {}; customs = v.customs || {}; moves = v.moves || {}; orders = v.orders || {}; cmts = v.cmts || {}; return true;
    } catch (e) { return false; }
  }
  function sig(o) { return Object.keys(o).sort().map(function (k) { return k + JSON.stringify(o[k]); }).join('|'); }
  function fail(err) { toast(err && err.code === 'invalid_argument' ? 'Нет прав на запись: изменения видны только вам, пока страница открыта' : 'Не удалось сохранить, повторите позже', 3500); }
  function queue(key, fn) { writeQ[key] = (writeQ[key] || Promise.resolve()).then(fn).then(function () { toast('Сохранено'); }).catch(fail); }
  function save(id) {
    if (!db) { localSave(); return; }
    var d = state[id];
    queue('d' + id, function () {
      var ref = db.collection('dates').doc(id);
      if (!d) return ref.delete();
      var o = { s: d.s || '', e: d.e || '', r: d.r || '', st: d.st || '' };
      if (d.p != null) o.p = d.p; if (d.d) o.d = d.d; if (d.cu) o.cu = d.cu; if (d.as) o.as = d.as; if (d.ap) o.ap = d.ap; if (d.ty) o.ty = d.ty; if (d.sn) o.sn = d.sn; if (d.dep && d.dep.length) o.dep = d.dep;
      return ref.set(o);
    });
  }
  function saveCustom(id) {
    if (!db) { localSave(); return; }
    var c = customs[id]; queue('c' + id, function () { var ref = db.collection('tasks').doc(id); return c ? ref.set({ title: c.title, pid: c.pid, stage: c.stage, role: c.role, ts: c.ts }) : ref.delete(); });
  }
  function hash(t) { var h = 5381, i; for (i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
  function saveLayout(kind, k) {
    if (!db) { localSave(); return; }
    var did = kind === 'm' ? 'm' + k : 'o' + hash(k);
    queue('l' + did, function () {
      var ref = db.collection('layout').doc(did);
      if (kind === 'm') return moves[k] ? ref.set({ k: 'm', id: k, pid: moves[k].pid, stage: moves[k].stage }) : ref.delete();
      return orders[k] ? ref.set({ k: 'o', key: k, ids: orders[k] }) : ref.delete();
    });
  }
  function removeCustom(id) {
    var ids = [id]; items.forEach(function (x) { if (x.custom && isDesc(x, id)) ids.push(x.id); });
    closeDrawer();
    ids.forEach(function (i) { delete customs[i]; delete state[i]; saveCustom(i); if (db) { (function (k) { queue('d' + k, function () { return db.collection('dates').doc(k).delete(); }); })(i); } });
    rebuild(); render();
  }
  function subscribe() {
    db.collection('dates').onSnapshot(function (snap) {
      var next = {};
      snap.docs.forEach(function (d) {
        var v = d.data(); if (!v) return;
        var o = { s: v.s || '', e: v.e || '', r: v.r || '', st: v.st || '', p: typeof v.p === 'number' ? v.p : null, d: v.d || '', cu: v.cu || '', as: v.as || '', ap: v.ap || '', ty: v.ty || '', sn: v.sn || '', dep: Array.isArray(v.dep) ? v.dep.slice() : [] };
        if (o.s || o.e || o.r || o.st || o.p != null || o.d || o.cu || o.as || o.ap || o.ty || o.sn || o.dep.length) next[d.id] = o;
      });
      if (sig(next) !== sig(state)) { state = next; render(); syncDrawer(); }
    }, function () { toast('Общие данные недоступны', 3000); });
    db.collection('comments').onSnapshot(function (snap) {
      var next = {};
      snap.docs.forEach(function (d) { var v = d.data(); if (v && v.item && v.text) next[d.id] = { id: d.id, item: v.item, text: v.text, ts: v.ts || 0 }; });
      if (sig(next) !== sig(cmts)) { cmts = next; render(); renderCm(); }
    }, function () {});
    db.collection('layout').onSnapshot(function (snap) {
      var mv = {}, od = {};
      snap.docs.forEach(function (d) { var v = d.data(); if (!v) return; if (v.k === 'm' && v.id) mv[v.id] = { pid: v.pid || '', stage: v.stage || '' }; else if (v.k === 'o' && v.key && Array.isArray(v.ids)) od[v.key] = v.ids.slice(); });
      if (sig(mv) !== sig(moves) || sig(od) !== sig(orders)) { moves = mv; orders = od; render(); syncDrawer(); }
    }, function () {});
    db.collection('tasks').onSnapshot(function (snap) {
      var next = {};
      snap.docs.forEach(function (d) { var v = d.data(); if (v && v.title) next[d.id] = mkCustom({ id: d.id, title: v.title, pid: v.pid, stage: v.stage, role: v.role, ts: v.ts }); });
      if (sig(next) !== sig(customs)) { customs = next; rebuild(); render(); syncDrawer(); }
    }, function () {});
  }

  // ---------- reorder: drag & drop + keyboard ----------
  var drag = null, dGhost = null, dLine = null, dTimer = 0, dEnded = 0;
  function keyOf(pid, stage) { return pid ? 'p:' + pid : stage ? 'S:' + stage : 'R'; }
  function subtreeIds(id) { var o = {}; o[id] = 1; items.forEach(function (x) { if (isDesc(x, id)) o[x.id] = 1; }); return o; }
  function placeItem(id, pid, stage, at) {
    var it = ITEM[id]; if (!it || it.stat) return false; if (pid) stage = null;
    if (pid && (pid === id || isDesc(ITEM[pid], id))) return false;
    var key = keyOf(pid, stage), list = (CHL[key] || []).filter(function (x) { return x !== id; }), idx = list.length;
    if (at === 'first') idx = 0; else if (at && at.id) { var i = list.indexOf(at.id); if (i >= 0) idx = i + (at.after ? 1 : 0); }
    list.splice(idx, 0, id); orders[key] = list;
    var mv = { pid: pid || '', stage: pid ? '' : (stage || '') };
    if (mv.pid === (it.pid0 || '') && (mv.pid || mv.stage === (it.stage0 || ''))) delete moves[id]; else moves[id] = mv;
    saveLayout('m', id); saveLayout('o', key); render(); flashRow(id); return true;
  }
  function placeEntry(entry, at) {
    var list = CHL.R.filter(function (x) { return x !== entry; }), idx = list.length;
    if (at && at.id) { var i = list.indexOf(at.id); if (i >= 0) idx = i + (at.after ? 1 : 0); }
    list.splice(idx, 0, entry); orders.R = list; saveLayout('o', 'R'); render();
  }
  function flashRow(id) { var r = Array.prototype.filter.call(sc.querySelectorAll('.row.tk'), function (x) { return x.dataset.id === id; })[0]; if (r) { r.classList.add('moved'); setTimeout(function () { r.classList.remove('moved'); }, 1300); } }
  function addGrip(kind, key) {
    var g = el('span', 'grip'); g.title = 'Перетащить · Alt+↑↓ — переместить, Alt+←→ — уровень'; g.setAttribute('aria-hidden', 'true');
    g.addEventListener('pointerdown', function (ev) { if (ev.pointerType === 'mouse' && ev.button !== 0) return; ev.preventDefault(); ev.stopPropagation(); beginDrag(ev, kind, key); });
    g.addEventListener('click', function (ev) { ev.stopPropagation(); });
    return g;
  }
  function beginDrag(ev, kind, key) {
    drag = { kind: kind, id: key, x0: ev.clientX, y0: ev.clientY, x: ev.clientX, y: ev.clientY, on: false, sub: kind === 'item' ? subtreeIds(key) : null, t: null };
    document.addEventListener('pointermove', onDragMove); document.addEventListener('pointerup', onDragEnd); document.addEventListener('pointercancel', stopDrag); document.addEventListener('keydown', onDragKey, true);
  }
  function onDragKey(ev) { if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); stopDrag(); } }
  function onDragMove(ev) {
    if (!drag) return; drag.x = ev.clientX; drag.y = ev.clientY;
    if (!drag.on) {
      if (Math.abs(drag.x - drag.x0) + Math.abs(drag.y - drag.y0) < 5) return; drag.on = true; document.body.classList.add('dragging');
      dGhost = el('div', 'dghost', drag.kind === 'stage' ? stageTitle(drag.id) : ITEM[drag.id].title); document.body.appendChild(dGhost);
      dLine = el('div', 'dline'); document.body.appendChild(dLine); dTimer = setInterval(autoScroll, 30);
      Array.prototype.forEach.call(sc.querySelectorAll('.row.tk'), function (r) { if (drag.sub && drag.sub[r.dataset.id]) r.classList.add('dragsrc'); });
      if (drag.kind === 'stage') Array.prototype.forEach.call(sc.querySelectorAll('.row.sh'), function (r) { if (r.dataset.stage === drag.id) r.classList.add('dragsrc'); });
    }
    dGhost.style.left = drag.x + 14 + 'px'; dGhost.style.top = drag.y + 10 + 'px'; refreshDrop();
  }
  function autoScroll() {
    if (!drag || !drag.on) return; var r = sc.getBoundingClientRect(), dy = 0;
    if (drag.y < r.top + 110) dy = -Math.ceil((r.top + 110 - drag.y) / 5); else if (drag.y > r.bottom - 70) dy = Math.ceil((drag.y - (r.bottom - 70)) / 5);
    if (dy) { sc.scrollTop += Math.max(-24, Math.min(24, dy)); refreshDrop(); }
  }
  function rowOf(n) { return n && n.closest ? n.closest('.row.tk, .row.sh') : null; }
  function headerOf(row) { var r = row; while (r && !r.classList.contains('sh')) r = r.previousElementSibling; return r; }
  function dropAt(x, y) {
    var row = rowOf(document.elementFromPoint(x, y)); if (!row) return null;
    var rc = row.getBoundingClientRect(), f = (y - rc.top) / rc.height, isSh = row.classList.contains('sh');
    if (drag.kind === 'stage') {
      if (isSh) return row.dataset.stage === drag.id ? null : { kind: 'stage', ref: 'S:' + row.dataset.stage, pos: f < .5 ? 'before' : 'after', row: row };
      var it = ITEM[row.dataset.id]; if (!it) return null;
      if (it.stage) { var h = headerOf(row); return h && h.dataset.stage !== drag.id ? { kind: 'stage', ref: 'S:' + it.stage, pos: 'after', row: h } : null; }
      var top = it; while (top.pid && ITEM[top.pid]) top = ITEM[top.pid]; return { kind: 'stage', ref: top.id, pos: f < .5 && top === it ? 'before' : 'after', row: row, rootItem: top.id };
    }
    if (isSh) return { kind: 'into-stage', stage: row.dataset.stage, pos: 'into', row: row };
    var x2 = ITEM[row.dataset.id]; if (!x2 || drag.sub[x2.id]) return null;
    var pos = f < .3 ? 'before' : f > .7 ? 'after' : 'into'; if (pos === 'into' && lvlOf(x2) >= 3) pos = f < .5 ? 'before' : 'after';
    return { kind: 'item', ref: x2.id, pos: pos, row: row };
  }
  function clearDrop() { if (dLine) dLine.style.display = 'none'; Array.prototype.forEach.call(document.querySelectorAll('.row.dinto'), function (r) { r.classList.remove('dinto'); }); }
  function groupEnd(row, test) { var last = row, nx = row.nextElementSibling; while (nx && test(nx)) { last = nx; nx = nx.nextElementSibling; } return last; }
  function refreshDrop() {
    if (!drag || !drag.on) return; drag.t = dropAt(drag.x, drag.y); clearDrop(); var t = drag.t; if (!t) return;
    if (t.pos === 'into') { t.row.classList.add('dinto'); return; }
    var rc = t.row.getBoundingClientRect(), y = t.pos === 'before' ? rc.top : rc.bottom;
    if (t.pos === 'after') {
      if (t.kind === 'item') y = groupEnd(t.row, function (n) { return n.classList.contains('tk') && ITEM[n.dataset.id] && isDesc(ITEM[n.dataset.id], t.ref); }).getBoundingClientRect().bottom;
      else if (t.row.classList.contains('sh')) y = groupEnd(t.row, function (n) { return !n.classList.contains('sh') && !n.classList.contains('pad') && !(n.classList.contains('tk') && ITEM[n.dataset.id] && !ITEM[n.dataset.id].stage && !ITEM[n.dataset.id].pid); }).getBoundingClientRect().bottom;
      else y = groupEnd(t.row, function (n) { return n.classList.contains('tk') && ITEM[n.dataset.id] && isDesc(ITEM[n.dataset.id], t.rootItem); }).getBoundingClientRect().bottom;
    }
    var sr = sc.getBoundingClientRect(); dLine.style.cssText = 'display:block;left:' + sr.left + 'px;width:' + sr.width + 'px;top:' + (y - 1) + 'px';
  }
  function stopDrag() {
    document.removeEventListener('pointermove', onDragMove); document.removeEventListener('pointerup', onDragEnd); document.removeEventListener('pointercancel', stopDrag); document.removeEventListener('keydown', onDragKey, true);
    clearInterval(dTimer); if (dGhost) dGhost.remove(); if (dLine) dLine.remove(); dGhost = dLine = null; clearDrop(); document.body.classList.remove('dragging');
    Array.prototype.forEach.call(document.querySelectorAll('.dragsrc'), function (r) { r.classList.remove('dragsrc'); });
    if (drag && drag.on) dEnded = Date.now(); drag = null;
  }
  function onDragEnd() {
    var d = drag, t = d && d.on ? d.t : null; stopDrag(); if (!d || !t) return;
    if (d.kind === 'stage') { placeEntry('S:' + d.id, { id: t.ref, after: t.pos === 'after' }); return; }
    if (t.kind === 'into-stage') { open['st:' + t.stage] = true; placeItem(d.id, '', t.stage, 'first'); return; }
    var ref = ITEM[t.ref]; if (!ref) return;
    if (t.pos === 'into') { open['t:' + ref.id] = true; placeItem(d.id, ref.id, null, 'end'); return; }
    placeItem(d.id, ref.pid, ref.pid ? null : ref.stage, { id: ref.id, after: t.pos === 'after' });
  }
  sc.addEventListener('click', function (ev) { if (Date.now() - dEnded < 150) { ev.stopPropagation(); ev.preventDefault(); } }, true);
  function keyMove(id, k) {
    var it = ITEM[id]; if (!it) return; var key = keyOf(it.pid, it.pid ? null : it.stage), sibs = CHL[key] || [], i = sibs.indexOf(id), ok = false;
    if (k === 'ArrowUp' && i > 0) ok = placeItem(id, it.pid, it.stage, { id: sibs[i - 1], after: false });
    else if (k === 'ArrowDown' && i >= 0 && i < sibs.length - 1) ok = placeItem(id, it.pid, it.stage, { id: sibs[i + 1], after: true });
    else if (k === 'ArrowRight' && i > 0) { var pv = ITEM[sibs[i - 1]]; if (pv && lvlOf(pv) < 3) { open['t:' + pv.id] = true; ok = placeItem(id, pv.id, null, 'end'); } }
    else if (k === 'ArrowLeft' && it.pid) { var p = ITEM[it.pid]; ok = placeItem(id, p.pid, p.stage, { id: p.id, after: true }); }
    if (ok) requestAnimationFrame(function () { var r = Array.prototype.filter.call(sc.querySelectorAll('.row.tk'), function (x) { return x.dataset.id === id; })[0]; if (r) r.querySelector('.lc').focus(); });
  }

  // ---------- export to .xlsx ----------
  var CRC = (function () { var t = [], c, n, k; for (n = 0; n < 256; n++) { c = n; for (k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(u) { var c = -1; for (var i = 0; i < u.length; i++) c = (c >>> 8) ^ CRC[(c ^ u[i]) & 255]; return (c ^ -1) >>> 0; }
  function zip(files) {
    var enc = new TextEncoder(), parts = [], central = [], off = 0, i, f, nm, dt = new Date(), time = (dt.getHours() << 11) | (dt.getMinutes() << 5) | (dt.getSeconds() >> 1), date = ((dt.getFullYear() - 1980) << 9) | ((dt.getMonth() + 1) << 5) | dt.getDate();
    for (i = 0; i < files.length; i++) {
      f = files[i]; nm = enc.encode(f.name); var data = typeof f.data === 'string' ? enc.encode(f.data) : f.data, crc = crc32(data);
      var h = new DataView(new ArrayBuffer(30)); h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true); h.setUint16(10, time, true); h.setUint16(12, date, true);
      h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, nm.length, true); h.setUint16(28, 0, true);
      parts.push(new Uint8Array(h.buffer), nm, data);
      var c = new DataView(new ArrayBuffer(46)); c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true); c.setUint16(12, time, true); c.setUint16(14, date, true);
      c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, nm.length, true); c.setUint32(42, off, true);
      central.push(new Uint8Array(c.buffer), nm); off += 30 + nm.length + data.length;
    }
    var cd = 0; central.forEach(function (p) { cd += p.length; });
    var end = new DataView(new ArrayBuffer(22)); end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, cd, true); end.setUint32(16, off, true);
    return new Blob(parts.concat(central, [new Uint8Array(end.buffer)]), { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }
  function esc(s) { return String(s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function colL(n) { var s = ''; n++; while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }
  function mixHex(h, t) { function f(c) { return ('0' + Math.round(c + (255 - c) * t).toString(16)).slice(-2); } return f(parseInt(h.substr(0, 2), 16)) + f(parseInt(h.substr(2, 2), 16)) + f(parseInt(h.substr(4, 2), 16)); }
  function xd(s) { return (ms(s) - Date.UTC(1899, 11, 30)) / DAY; }
  function Book() {
    var fonts = ['<font><sz val="11"/><name val="Calibri"/></font>'], fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'];
    var borders = ['<border><left/><right/><top/><bottom/><diagonal/></border>', '<border><left style="thin"><color rgb="FFD4D4D4"/></left><right style="thin"><color rgb="FFD4D4D4"/></right><top style="thin"><color rgb="FFD4D4D4"/></top><bottom style="thin"><color rgb="FFD4D4D4"/></bottom><diagonal/></border>'];
    var xfs = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'], cache = {}, sheets = [];
    function idx(arr, x) { var i = arr.indexOf(x); if (i < 0) { arr.push(x); i = arr.length - 1; } return i; }
    function style(o) {
      var key = JSON.stringify(o); if (cache[key] != null) return cache[key];
      var f = idx(fonts, '<font>' + (o.b ? '<b/>' : '') + '<sz val="' + (o.sz || 11) + '"/>' + (o.color ? '<color rgb="FF' + o.color + '"/>' : '') + '<name val="Calibri"/></font>');
      var fl = o.fill ? idx(fills, '<fill><patternFill patternType="solid"><fgColor rgb="FF' + o.fill + '"/><bgColor indexed="64"/></patternFill></fill>') : 0;
      var nf = o.fmt === 'date' ? 164 : o.fmt === 'pct' ? 9 : o.fmt === 'int' ? 1 : 0;
      var al = (o.wrap || o.h || o.v || o.indent || o.rot) ? '<alignment' + (o.rot ? ' textRotation="' + o.rot + '"' : '') + (o.wrap ? ' wrapText="1"' : '') + (o.h ? ' horizontal="' + o.h + '"' : '') + ' vertical="' + (o.v || 'top') + '"' + (o.indent ? ' indent="' + o.indent + '"' : '') + '/>' : '';
      var x = '<xf numFmtId="' + nf + '" fontId="' + f + '" fillId="' + fl + '" borderId="' + (o.border ? 1 : 0) + '" xfId="0" applyFont="1" applyFill="1" applyNumberFormat="1" applyBorder="1"' + (al ? ' applyAlignment="1">' + al + '</xf>' : '/>');
      xfs.push(x); cache[key] = xfs.length - 1; return cache[key];
    }
    function sheet(name) {
      var rows = {}, merges = [], cols = [], sh = { name: name, freeze: null, filter: null, ol: 0 };
      sh.set = function (r, c, v, s) { (rows[r] = rows[r] || { cells: {}, ht: 0, ol: 0 }).cells[c] = { v: v, s: s || 0 }; };
      sh.row = function (r, ht, ol) { var o = (rows[r] = rows[r] || { cells: {}, ht: 0, ol: 0 }); if (ht) o.ht = ht; if (ol) { o.ol = ol; sh.ol = Math.max(sh.ol, ol); } };
      sh.merge = function (r1, c1, r2, c2) { merges.push(colL(c1) + (r1 + 1) + ':' + colL(c2) + (r2 + 1)); };
      sh.col = function (c, w) { cols[c] = w; };
      var links = []; sh.link = function (r, c, loc) { links.push(colL(c) + (r + 1) + '|' + loc); };
      sh.xml = function (first) {
        var out = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetPr><outlinePr summaryBelow="0"/></sheetPr>';
        out += '<sheetViews><sheetView workbookViewId="0"' + (first ? ' tabSelected="1"' : '') + ' showGridLines="0">';
        if (sh.freeze) out += '<pane xSplit="' + sh.freeze[1] + '" ySplit="' + sh.freeze[0] + '" topLeftCell="' + colL(sh.freeze[1]) + (sh.freeze[0] + 1) + '" activePane="bottomRight" state="frozen"/>';
        out += '</sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"' + (sh.ol ? ' outlineLevelRow="' + sh.ol + '"' : '') + '/>';
        var cx = ''; cols.forEach(function (w, i) { if (w) cx += '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>'; }); if (cx) out += '<cols>' + cx + '</cols>';
        out += '<sheetData>';
        Object.keys(rows).map(Number).sort(function (a, b) { return a - b; }).forEach(function (r) {
          var o = rows[r]; out += '<row r="' + (r + 1) + '"' + (o.ht ? ' ht="' + o.ht + '" customHeight="1"' : '') + (o.ol ? ' outlineLevel="' + o.ol + '"' : '') + '>';
          Object.keys(o.cells).map(Number).sort(function (a, b) { return a - b; }).forEach(function (c) {
            var cell = o.cells[c], ref = colL(c) + (r + 1), v = cell.v;
            if (v == null || v === '') out += '<c r="' + ref + '" s="' + cell.s + '"/>';
            else if (typeof v === 'number') out += '<c r="' + ref + '" s="' + cell.s + '"><v>' + v + '</v></c>';
            else out += '<c r="' + ref + '" s="' + cell.s + '" t="inlineStr"><is><t xml:space="preserve">' + esc(v) + '</t></is></c>';
          });
          out += '</row>';
        });
        out += '</sheetData>';
        if (sh.filter) out += '<autoFilter ref="' + sh.filter + '"/>';
        if (merges.length) out += '<mergeCells count="' + merges.length + '">' + merges.map(function (m) { return '<mergeCell ref="' + m + '"/>'; }).join('') + '</mergeCells>';
        if (links.length) out += '<hyperlinks>' + links.map(function (l) { var q = l.split('|'); return '<hyperlink ref="' + q[0] + '" location="' + esc(q[1]) + '" display="' + esc(q[1]) + '"/>'; }).join('') + '</hyperlinks>';
        return out + '</worksheet>';
      };
      sheets.push(sh); return sh;
    }
    function build() {
      var ct = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>';
      sheets.forEach(function (s, i) { ct += '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'; });
      ct += '</Types>';
      var rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
      var wb = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>';
      var wr = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">';
      sheets.forEach(function (s, i) { wb += '<sheet name="' + esc(s.name) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>'; wr += '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>'; });
      wb += '</sheets></workbook>'; wr += '<Relationship Id="rId' + (sheets.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>';
      var st = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="dd\\.mm\\.yyyy"/></numFmts><fonts count="' + fonts.length + '">' + fonts.join('') + '</fonts><fills count="' + fills.length + '">' + fills.join('') + '</fills><borders count="' + borders.length + '">' + borders.join('') + '</borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="' + xfs.length + '">' + xfs.join('') + '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
      var files = [{ name: '[Content_Types].xml', data: ct }, { name: '_rels/.rels', data: rels }, { name: 'xl/workbook.xml', data: wb }, { name: 'xl/_rels/workbook.xml.rels', data: wr }, { name: 'xl/styles.xml', data: st }];
      sheets.forEach(function (s, i) { files.push({ name: 'xl/worksheets/sheet' + (i + 1) + '.xml', data: s.xml(i === 0) }); });
      return zip(files);
    }
    return { style: style, sheet: sheet, build: build };
  }
  function rollup(list) {
    list = list.filter(function (it) { return !isBl(it); });
    var n = list.length, sum = 0, a = '', b = '', done = 0, work = 0, block = 0;
    list.forEach(function (it) { var e = eff(it); sum += e.p; if (e.st === 'Выполнено') done++; else if (e.st === 'В работе') work++; else if (e.st === 'Заблокировано') block++; if (e.s && (!a || e.s < a)) a = e.s; var en = e.e || e.s; if (en && en > b) b = en; });
    return { p: n ? Math.round(sum / n) : 0, a: a, b: b, st: !n ? 'Открыт' : done === n ? 'Выполнено' : (work || done) ? 'В работе' : block ? 'Заблокировано' : 'Открыт' };
  }
  function typeOf(it) {
    var e = eff(it), n = it.name || it.title;
    if (e.ty === 'ms') return 'Целевое состояние'; if (e.ty === 'bl' || /^[\s!\-]*БЛОКАТОР/i.test(n)) return 'Блокатор';
    if (/^[\s!\-]*ВОПРОС/i.test(n)) return 'Вопрос'; if (/^[\s!\-]*(ЖДЕМ|ВЛИЯЕТ)/i.test(n)) return 'Ожидание';
    return kidsOf(it.id).length ? 'Задача с подзадачами' : 'Задача';
  }
  function depText(it) { return eff(it).dep.map(function (r) { var pe = predEnd(r); return predLabel(r) + (pe ? ' (до ' + fmt(pe) + ')' : ''); }).join('; '); }
  function exportBook() {
    var X = Book(), t = TRACKS.filter(function (x) { return x.own; })[0] || TRACKS[0];
    var NAVY = '1E395F', hdr = X.style({ b: 1, color: 'FFFFFF', fill: NAVY, wrap: 1, v: 'center', border: 1 });
    var groups = GROUPS;
    var STT = { 'Выполнено': 'DCFCE7', 'В работе': 'DBEAFE', 'Заблокировано': 'FEE2E2', 'Открыт': 'F3F4F6' };
    // --- sheet 1: table
    var s1 = X.sheet('Задачи'), r = 0;
    ['Этап', 'Задача', 'Роль', 'Статус', 'Исполнитель', 'Заказчик', 'Согласующий', 'Начало', 'Окончание', 'Дней', '% выполнения', 'Старт после завершения', 'Описание', 'Источник', 'Тип', 'Краткое название'].forEach(function (h, c) { s1.set(0, c, h, hdr); });
    s1.row(0, 32); [34, 64, 11, 15, 20, 20, 20, 12, 12, 8, 13, 48, 48, 18, 18, 30].forEach(function (w, c) { s1.col(c, w); });
    s1.freeze = [1, 2]; r = 1;
    var txt = X.style({ wrap: 1, border: 1 }), txtB = X.style({ wrap: 1, border: 1, b: 1, fill: 'EEF1F6' }), dt = X.style({ fmt: 'date', border: 1, h: 'center' }), dtB = X.style({ fmt: 'date', border: 1, h: 'center', b: 1, fill: 'EEF1F6' });
    var pc = X.style({ fmt: 'pct', border: 1, h: 'center' }), pcB = X.style({ fmt: 'pct', border: 1, h: 'center', b: 1, fill: 'EEF1F6' }), nm = X.style({ fmt: 'int', border: 1, h: 'center' }), nmB = X.style({ fmt: 'int', border: 1, h: 'center', b: 1, fill: 'EEF1F6' });
    groups.forEach(function (g) {
      if (g.stage) {
        var ru = rollup(g.items);
        s1.set(r, 0, stageTitle(g.stage), txtB); s1.set(r, 1, stageTitle(g.stage), txtB); s1.set(r, 2, '', txtB); s1.set(r, 3, ru.st, X.style({ b: 1, border: 1, fill: STT[ru.st] })); s1.set(r, 4, '', txtB); s1.set(r, 5, '', txtB); s1.set(r, 6, '', txtB);
        s1.set(r, 7, ru.a ? xd(ru.a) : '', dtB); s1.set(r, 8, ru.b ? xd(ru.b) : '', dtB); s1.set(r, 9, ru.a ? Math.round((ms(ru.b) - ms(ru.a)) / DAY) + 1 : '', nmB); s1.set(r, 10, ru.p / 100, pcB);
        s1.set(r, 11, '', txtB); s1.set(r, 12, '', txtB); s1.set(r, 13, 'Сводка по этапу', txtB); s1.set(r, 14, '', txtB); s1.set(r, 15, '', txtB); r++;
      }
      g.items.forEach(function (it) {
        var e = eff(it), lv = lvlOf(it), ind = Math.max(0, lv - (g.stage ? 0 : 0));
        s1.set(r, 0, stageTitle(it.stage), txt); s1.set(r, 1, it.title, X.style({ wrap: 1, border: 1, indent: Math.min(ind, 6) })); s1.set(r, 2, e.role, txt);
        s1.set(r, 3, e.st, X.style({ border: 1, fill: STT[e.st] })); s1.set(r, 4, e.as, txt); s1.set(r, 5, e.cu, txt); s1.set(r, 6, e.ap, txt);
        s1.set(r, 7, e.s ? xd(e.s) : '', dt); s1.set(r, 8, e.s ? xd(e.e || e.s) : '', dt); s1.set(r, 9, e.s && !isPt(it) ? Math.round((ms(e.e || e.s) - ms(e.s)) / DAY) + 1 : '', nm); s1.set(r, 10, isPt(it) ? '' : e.p / 100, pc);
        s1.set(r, 11, depText(it), txt); s1.set(r, 12, plainNote(e.d), txt); s1.set(r, 13, it.custom ? 'Добавлено вручную' : it.file || 'GanttPRO, ID ' + it.gid, txt);
        s1.set(r, 14, typeOf(it), txt); s1.set(r, 15, e.ty === 'ms' ? shortOf(it) : '', txt);
        s1.row(r, 0, g.stage ? Math.min(7, lv) : (lv ? Math.min(7, lv) : 0)); r++;
      });
    });
    STAT.forEach(function (it) {
      var e = eff(it); s1.set(r, 0, '', txt); s1.set(r, 1, it.title, txt); s1.set(r, 2, '', txt); s1.set(r, 3, e.st, X.style({ border: 1, fill: STT[e.st] })); s1.set(r, 4, e.as, txt); s1.set(r, 5, e.cu, txt); s1.set(r, 6, e.ap, txt);
      s1.set(r, 7, xd(e.s), dt); s1.set(r, 8, xd(e.s), dt); s1.set(r, 9, '', nm); s1.set(r, 10, '', pc); s1.set(r, 11, depText(it), txt); s1.set(r, 12, plainNote(e.d), txt);
      s1.set(r, 13, 'roadmap, ' + (it.track ? 'трек ' + it.track : 'все треки'), txt); s1.set(r, 14, 'Целевое состояние', txt); s1.set(r, 15, shortOf(it), txt); r++;
    });
    s1.filter = 'A1:P' + r;
    // --- shared week header
    var wLo = Infinity, wHi = -Infinity;
    items.concat(msOf(t.n)).forEach(function (it) { var sp = span(it); if (sp) { wLo = Math.min(wLo, sp[0]); wHi = Math.max(wHi, sp[1]); } });
    if (wLo === Infinity) { wLo = todayIdx - 2; wHi = todayIdx + 26; } else { wLo = Math.min(wLo, todayIdx) - 2; wHi = Math.max(wHi, todayIdx) + 8; }
    function weekHeader(sh, c0, a, b) {
      var q0 = null, m0 = null, i, hq = X.style({ b: 1, color: 'FFFFFF', fill: NAVY, h: 'left', v: 'center' }), hm = X.style({ color: 'FFFFFF', fill: '2D4A74', h: 'left', v: 'center' }), hw = X.style({ color: 'FFFFFF', fill: NAVY, h: 'center', v: 'center', sz: 9 }), hn = X.style({ b: 1, fill: 'FFFFFF', h: 'center', v: 'center', sz: 9, border: 1 });
      function close(kind, o, end) { if (end - o.a > 1) sh.merge(kind === 'q' ? 0 : 1, c0 + o.a - a, kind === 'q' ? 0 : 1, c0 + end - a - 1 + 0); }
      for (i = a; i <= b; i++) {
        var w = wInfo(i);
        if (!q0 || q0.k !== w.q) { if (q0) close('q', q0, i); q0 = { k: w.q, a: i }; sh.set(0, c0 + i - a, 'Q' + (w.q % 4 + 1) + ' ' + Math.floor(w.q / 4), hq); } else sh.set(0, c0 + i - a, '', hq);
        if (!m0 || m0.k !== w.m) { if (m0) close('m', m0, i); m0 = { k: w.m, a: i }; sh.set(1, c0 + i - a, MONTHS[w.m % 12], hm); } else sh.set(1, c0 + i - a, '', hm);
        sh.set(2, c0 + i - a, 'W' + weekInQ(i), i === todayIdx ? hn : hw); sh.col(c0 + i - a, 4.3);
      }
      close('q', q0, b + 1); close('m', m0, b + 1);
    }
    var msW = {};
    function cellBg(i) { return D.holiday.indexOf(i) >= 0 ? 'D4D4D4' : msW[i] ? 'C3CCDC' : i === todayIdx ? 'E8EDF5' : null; }
    var msCell = X.style({ fill: 'E5E9F0', border: 1, rot: 90, wrap: 1, v: 'center', h: 'center', sz: 8 });
    function weekCells(sh, row, c0, a, b, spanA, spanB, hex, prog) {
      for (var i = a; i <= b; i++) {
        var fill = cellBg(i);
        if (spanA != null && i >= spanA && i <= spanB) { var len = spanB - spanA + 1, doneN = Math.round(len * prog / 100); fill = (i - spanA) < doneN ? hex : mixHex(hex, 0.62); }
        sh.set(row, c0 + i - a, '', fill ? X.style({ fill: fill }) : 0);
      }
    }
    var LGS = STAT.filter(function (m) { return eff(m).s; }).concat(items.filter(function (it) { return isMs(it) && eff(it).s; })).sort(function (a, b) { return eff(a).s < eff(b).s ? -1 : eff(a).s > eff(b).s ? 1 : 0; }), LGROW = {};
    LGS.forEach(function (m, i) { LGROW[m.id] = i + 2; });
    function lk(sh, row, col, m) { if (LGROW[m.id]) sh.link(row, col, "'Целевые состояния'!A" + LGROW[m.id]); }
    // --- sheet 2: diagram of the track
    var s2 = X.sheet('Диаграмма трека'), C0 = 9;
    s2.freeze = [3, C0]; [58, 10, 14, 18, 11, 11, 7, 20, 10].forEach(function (w, c) { s2.col(c, w); });
    var lh = X.style({ b: 1, color: 'FFFFFF', fill: NAVY, wrap: 1, v: 'center' });
    ['Этап / задача', 'Роль', 'Статус', 'Исполнитель', 'Начало', 'Окончание', '%', 'Тип', 'Длит., нед.'].forEach(function (h, c) { s2.set(0, c, c === 0 ? t.n + '. ' + t.name : '', lh); s2.set(1, c, '', lh); s2.set(2, c, h, lh); });
    s2.merge(0, 0, 1, 0);
    weekHeader(s2, C0, wLo, wHi);
    var lt = X.style({ wrap: 1, border: 1 }), ltB = X.style({ wrap: 1, border: 1, b: 1, fill: 'EEF1F6' }), ldt = X.style({ fmt: 'date', border: 1, h: 'center' }), ldtB = X.style({ fmt: 'date', border: 1, h: 'center', b: 1, fill: 'EEF1F6' }), lp = X.style({ fmt: 'pct', border: 1, h: 'center' }), lpB = X.style({ fmt: 'pct', border: 1, h: 'center', b: 1, fill: 'EEF1F6' });
    var msL = msOf(t.n); msL.forEach(function (m) { msW[wk(eff(m).s)] = 1; });
    r = 3;
    if (msL.length) {
      s2.row(3, 150); s2.set(3, 0, 'Целевые состояния (полные названия — на листе «Целевые состояния»)', ltB); for (var q = 1; q < 9; q++) s2.set(3, q, '', ltB);
      weekCells(s2, 3, C0, wLo, wHi, null, null, null, 0);
      msL.forEach(function (m) { var w = wk(eff(m).s); if (w >= wLo && w <= wHi) { s2.set(3, C0 + w - wLo, clip(shortOf(m), 30), msCell); lk(s2, 3, C0 + w - wLo, m); } });
      r = 4;
    }
    groups.forEach(function (g) {
      if (g.stage) {
        var ru = rollup(g.items); s2.set(r, 0, stageTitle(g.stage), ltB); ['', ru.st, '', ru.a ? xd(ru.a) : '', ru.b ? xd(ru.b) : '', ru.p / 100].forEach(function (v, k) { s2.set(r, k + 1, v, k === 3 || k === 4 ? ldtB : k === 5 ? lpB : ltB); });
        var a = ru.a ? wk(ru.a) : null, b = ru.b ? wk(ru.b) : null; weekCells(s2, r, C0, wLo, wHi, a, b, '525252', ru.p); s2.set(r, 7, 'Этап', ltB); s2.set(r, 8, a != null ? b - a + 1 : '', X.style({ fmt: 'int', border: 1, h: 'center', b: 1, fill: 'EEF1F6' })); r++;
      }
      g.items.forEach(function (it) {
        var e = eff(it), lv = lvlOf(it), sp = span(it);
        s2.set(r, 0, it.short, X.style({ wrap: 1, border: 1, indent: Math.min(lv, 6) })); s2.set(r, 1, e.role, lt); s2.set(r, 2, e.st, X.style({ border: 1, fill: STT[e.st] })); s2.set(r, 3, e.as, lt);
        s2.set(r, 4, e.s ? xd(e.s) : '', ldt); s2.set(r, 5, e.s ? xd(e.e || e.s) : '', ldt); s2.set(r, 6, isPt(it) ? '' : e.p / 100, lp); s2.set(r, 7, typeOf(it), lt); s2.set(r, 8, sp && !isPt(it) ? sp[1] - sp[0] + 1 : '', X.style({ fmt: 'int', border: 1, h: 'center' }));
        weekCells(s2, r, C0, wLo, wHi, sp && e.ty !== 'bl' ? sp[0] : null, sp && e.ty !== 'bl' ? sp[1] : null, SHEX[e.st], e.ty === 'ms' ? 100 : e.p);
        if (sp && e.ty && sp[0] >= wLo && sp[0] <= wHi) s2.set(r, C0 + sp[0] - wLo, e.ty === 'ms' ? '◆' : '○', X.style(e.ty === 'ms' ? { color: 'FFFFFF', fill: SHEX[e.st], h: 'center', v: 'center', b: 1 } : { color: e.st === 'Выполнено' ? '15803D' : 'DC2626', fill: cellBg(sp[0]) || undefined, h: 'center', v: 'center', b: 1, sz: 12 }));
        e.dep.forEach(function (ref) {
          var pe = predEnd(ref); if (!pe) return; var w = wk(pe); if (w < wLo || w > wHi) return;
          var inside = sp && e.ty !== 'bl' && w >= sp[0] && w <= sp[1], badd = !!(e.s && e.s <= pe);
          s2.set(r, C0 + w - wLo, '▲', X.style({ color: inside ? 'FFFFFF' : badd ? 'DC2626' : 'B45309', fill: inside ? SHEX[e.st] : (cellBg(w) || undefined), h: 'center', v: 'center', b: 1 }));
        });
        s2.row(r, 0, g.stage ? Math.min(7, lv) : (lv ? Math.min(7, lv) : 0)); r++;
      });
    });
    // --- sheet 3: roadmap tracks
    msW = {};
    var gl = STAT.filter(function (m) { return m.track === 0 && eff(m).s; }), gmax = 0;
    STAT.forEach(function (m) { if (eff(m).s) gmax = Math.max(gmax, wk(eff(m).s) + 2); });
    function inGlobal(i) { return gl.some(function (m) { var w = wk(eff(m).s); return i > w - m.len && i <= w; }); }
    var s3 = X.sheet('Roadmap'), R0 = 3, rLo = Math.min(0, wLo), rHi = Math.max(90, wHi, gmax), RH = 20;
    s3.freeze = [3, R0]; [26, 56, 14].forEach(function (w, c) { s3.col(c, w); });
    ['Трек', 'Результат', 'Роль / тип'].forEach(function (h, c) { s3.set(0, c, '', lh); s3.set(1, c, '', lh); s3.set(2, c, h, lh); });
    weekHeader(s3, R0, rLo, rHi);
    var msC = X.style({ fill: 'E5E9F0', border: 1, rot: 90, wrap: 1, v: 'center', h: 'center', sz: 9, color: '1E395F' });
    r = 3;
    TRACKS.forEach(function (tr) {
      var start = r, tms = msOf(tr.n).filter(function (m) { return m.track !== 0; }), segsBy = {}, allA = null, allB = null;
      ROLES.forEach(function (ro) {
        var list = (tr.plan[ro.key] || []).map(function (q) { return [q[0], q[1], 'plan']; });
        var own = tr.own ? items.filter(function (it) { return eff(it).role === ro.key && !isPt(it) && span(it); }).map(function (it) { var sp = span(it); return [sp[0], sp[1], 'own']; }) : [];
        segsBy[ro.key] = { plan: merge(list.map(function (q) { return [q[0], q[1]]; })), own: merge(own.map(function (q) { return [q[0], q[1]]; })) };
        segsBy[ro.key].plan.concat(segsBy[ro.key].own).forEach(function (q) { allA = allA == null ? q[0] : Math.min(allA, q[0]); allB = allB == null ? q[1] : Math.max(allB, q[1]); });
      });
      var defs = ROLES.concat(['win']);
      defs.forEach(function (ro, k) {
        s3.row(r, RH); var win = ro === 'win';
        s3.set(r, 0, k === 0 ? tr.n + '. ' + tr.name : '', X.style({ b: 1, wrap: 1, border: 1 })); s3.set(r, 1, k === 0 ? tr.result : '', X.style({ wrap: 1, border: 1, sz: 9 }));
        s3.set(r, 2, win ? 'Весь трек, нед.' : ro.name, X.style({ border: 1, h: 'center', b: win ? 1 : 0, sz: win ? 9 : 11 }));
        var hex = win ? '525252' : ro.color.replace('#', ''), pl0 = win ? (allA == null ? [] : [[allA, allB]]) : segsBy[ro.key].plan, ow0 = win ? [] : segsBy[ro.key].own;
        function inSeg(list, i) { return list.some(function (q) { return i >= q[0] && i <= q[1]; }); }
        function segStart(i) { var f = null; pl0.concat(ow0).forEach(function (q) { if (q[0] === i) f = f == null ? q : (q[1] - q[0] > f[1] - f[0] ? q : f); }); return f; }
        for (var i = rLo; i <= rHi; i++) {
          var fill = cellBg(i), full = inSeg(ow0, i);
          if (inSeg(pl0, i)) fill = win ? mixHex(hex, 0.55) : mixHex(hex, 0.6); if (full) fill = hex;
          var q0 = segStart(i), lab = q0 ? (q0[1] - q0[0] + 1) + ' нед' : '';
          s3.set(r, R0 + i - rLo, lab, lab ? X.style({ fill: fill, sz: 8, color: full ? 'FFFFFF' : '1F2937', h: 'left', v: 'center', b: win ? 1 : 0 }) : (fill ? X.style({ fill: fill }) : 0));
        }
        r++;
      });
      s3.merge(start, 0, r - 1, 0); s3.merge(start, 1, r - 1, 1);
      var used = {};
      tms.forEach(function (m) {
        var w = wk(eff(m).s); if (w < rLo || w > rHi || inGlobal(w) || used[w]) return; used[w] = 1; var c = R0 + w - rLo;
        s3.set(start, c, clip(shortOf(m), 28), msC); lk(s3, start, c, m); s3.merge(start, c, r - 1, c);
      });
    });
    gl.forEach(function (m) {
      var w = wk(eff(m).s) - (m.len - 1), c = R0 + w - rLo; if (w < rLo || r <= 3) return;
      s3.set(3, c, shortOf(m), X.style({ fill: 'E5E9F0', border: 1, rot: 90, wrap: 1, v: 'center', h: 'center', sz: 10, color: '1E395F' })); lk(s3, 3, c, m);
      s3.merge(3, c, r - 1, c + m.len - 1);
    });
    r += 1; var lgS = X.style({ sz: 9, color: '525252' });
    ['Обозначения: цветная полоса — плановая работа роли, подпись — длительность в неделях; тёмная полоса — задачи с датами;',
     'серая вертикальная карточка — целевое состояние (в карточке краткое название, полное — на листе «Целевые состояния», ячейка ведёт на него);',
     'строка «Весь трек» — общий срок трека. Типы и длительности задач — на листах «Задачи» и «Диаграмма трека».'].forEach(function (t, k) { s3.set(r + k, 0, t, lgS); });
    // --- sheet 4: target states legend
    var s4 = X.sheet('Целевые состояния');
    ['№', 'Охват', 'Целевое состояние', 'Краткое название', 'Дата', 'Неделя', 'Статус', 'Длит., нед.'].forEach(function (h, c) { s4.set(0, c, h, hdr); });
    s4.row(0, 28); [9, 34, 72, 34, 12, 14, 15, 11].forEach(function (w, c) { s4.col(c, w); }); s4.freeze = [1, 1];
    var tdt = X.style({ fmt: 'date', border: 1, h: 'center', v: 'top' });
    LGS.forEach(function (m, i) {
      var e = eff(m), w = wk(e.s), row = i + 1, ow = m.track === 0 ? 'Все треки' : (m.track ? TRACKS.filter(function (x) { return x.n === m.track; }).map(function (x) { return x.n + '. ' + x.name; })[0] : t.n + '. ' + t.name + ' (задача)');
      s4.set(row, 0, 'ЦС-' + (i + 1), X.style({ border: 1, h: 'center', b: 1 })); s4.set(row, 1, ow, txt); s4.set(row, 2, m.title, txt); s4.set(row, 3, shortOf(m), txt);
      s4.set(row, 4, xd(e.s), tdt); s4.set(row, 5, 'W' + weekInQ(w) + ' · Q' + (wInfo(w).q % 4 + 1) + ' ' + Math.floor(wInfo(w).q / 4), txt); s4.set(row, 6, e.st, X.style({ border: 1, fill: STT[e.st], v: 'top' })); s4.set(row, 7, m.len || 1, X.style({ fmt: 'int', border: 1, h: 'center', v: 'top' }));
    });
    s4.filter = 'A1:H' + (LGS.length + 1);
    return X.build();
  }
  window.__rmExport = exportBook;
  function doExport() {
    var blob = exportBook(), d = new Date(), name = 'roadmap-' + d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) + '.xlsx';
    if (!dl) { var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000); toast('Файл готов'); return; }
    dl.save({ filename: name, data: blob }).then(function () { toast('Файл готов'); }).catch(function (err) {
      if (err && err.code === 'declined') return; toast('Не удалось сохранить файл', 3000);
    });
  }
  document.getElementById('xl').addEventListener('click', doExport);


  // ---------- comments for the agent: top bar ----------
  // Любой элемент карты → комментарий агенту. Комментарии копятся в браузере и вместе с правками,
  // сделанными на странице, уходят одним промптом. Источник истины — md; страница их не меняет.
  var CM_KEY = 'rm-notes-' + (D.slug || 'roadmap'), notes = [], cmode = false, cpopTarget = null;
  try { notes = JSON.parse(localStorage.getItem(CM_KEY) || '[]') || []; } catch (e) { notes = []; }
  var cbar = document.getElementById('cbar'), cbN = document.getElementById('cbN'), cbMode = document.getElementById('cbMode'),
    cbList = document.getElementById('cbList'), cbCopy = document.getElementById('cbCopy'), cpanel = document.getElementById('cpanel'),
    cpop = document.getElementById('cpop'), cpTarget = document.getElementById('cpTarget'), cpText = document.getElementById('cpText'),
    cpWeek = document.getElementById('cpWeek'), cpAdd = document.getElementById('cpAdd');
  document.getElementById('cbTitle').textContent = D.title || 'Roadmap';
  document.getElementById('cbTitle').title = (D.dir ? D.dir + ' · ' : '') + 'сборка ' + (D.stamp || '');
  function saveNotes() { try { localStorage.setItem(CM_KEY, JSON.stringify(notes)); } catch (e) { toast('Браузер не даёт сохранить комментарии', 3000); } }
  function fileOfStage(t) { var id = (D.stageIds || {})[t]; return 'roadmap.md, ### Этапы' + (id ? ' (' + id + ')' : ''); }
  function itemTarget(it) {
    if (!it) return null;
    if (it.stat) {
      var tr = it.track ? TRACKS.filter(function (t) { return t.n === it.track; })[0] : null;
      return { key: 'ms:' + it.id, kind: 'ts', label: 'Целевое состояние «' + (it.sn || it.title) + '»' + (tr ? ', трек ' + tr.n + ' «' + tr.name + '»' : ', вся цель'), file: 'roadmap.md' };
    }
    var e = eff(it), kind = e.ty === 'ms' ? 'Веха' : e.ty === 'bl' ? 'Блокер' : 'Задача';
    return { key: 'task:' + it.id, kind: 'task', id: it.id, label: kind + ' ' + (NUM[it.id] ? NUM[it.id] + ' ' : '') + '«' + clip(shortOf(it), 70) + '»', file: it.custom ? 'новая задача, добавлена на странице' : (it.file || '') };
  }
  function trackTarget(n, role) {
    var t = TRACKS.filter(function (x) { return x.n === n; })[0]; if (!t) return null;
    return { key: 'track:' + n + (role ? ':' + role : ''), kind: 'track', label: 'Трек ' + t.n + ' «' + t.name + '»' + (role ? ', роль ' + role + ' (план по ролям)' : ''), file: 'roadmap.md, ## Трек ' + t.n };
  }
  function weekAt(x) { var th = sc.querySelector('.th'), cr = sc.querySelector('.corner'); if (!th || !cr) return null; if (x < cr.getBoundingClientRect().right) return null; return lo + Math.floor((x - th.getBoundingClientRect().left) / WPX); }
  function targetOf(node, x) {
    if (!node || !node.closest) return null;
    var w = weekAt(x), t = null, n;
    if (node.closest('.drawer')) t = sel ? itemTarget(ITEM[sel]) : null;
    else if ((n = node.closest('[data-ms]'))) t = itemTarget(ITEM[n.dataset.ms]);
    else if ((n = node.closest('.row.tk[data-id]'))) t = itemTarget(ITEM[n.dataset.id]);
    else if ((n = node.closest('.row.sh[data-stage]'))) t = { key: 'stage:' + n.dataset.stage, kind: 'stage', label: 'Этап «' + stageTitle(n.dataset.stage) + '»', file: fileOfStage(n.dataset.stage) };
    else if ((n = node.closest('[data-role][data-track]'))) t = trackTarget(+n.dataset.track, n.dataset.role);
    else if ((n = node.closest('[data-track]'))) t = trackTarget(+n.dataset.track);
    else if (node.closest('.hd') && w != null) t = { key: 'week:' + w, kind: 'week', label: 'Неделя с ' + fmt(iso(weekMon(w))), file: '' };
    else if (node.closest('#sc')) t = view.t === 'tr' ? trackTarget(curTrack().n) : { key: 'all', kind: 'all', label: 'Roadmap целиком', file: 'roadmap.md' };
    if (!t) return null;
    if (w != null && t.kind !== 'week') t.week = iso(weekMon(w));
    return t;
  }
  function markNotes(root) {
    var keys = {}; notes.forEach(function (c) { keys[c.key] = (keys[c.key] || 0) + 1; });
    root.querySelectorAll('.row.tk[data-id]').forEach(function (r) { r.classList.toggle('cmk', !!keys['task:' + r.dataset.id]); });
    root.querySelectorAll('.row.sh[data-stage]').forEach(function (r) { r.classList.toggle('cmk', !!keys['stage:' + r.dataset.stage]); });
    root.querySelectorAll('[data-ms]').forEach(function (r) { var it = ITEM[r.dataset.ms]; r.classList.toggle('cmk', !!(it && keys[(it.stat ? 'ms:' : 'task:') + it.id])); });
    root.querySelectorAll('.row[data-track]').forEach(function (r) { r.classList.toggle('cmk', !!keys['track:' + r.dataset.track + (r.dataset.role ? ':' + r.dataset.role : '')]); });
  }

  // ----- page edits since the build: they go into the prompt too
  var SEED0 = null; try { var sd0 = document.getElementById('seed'); SEED0 = sd0 ? JSON.parse(sd0.textContent) : null; } catch (e) {}
  SEED0 = SEED0 || { state: {}, customs: {}, moves: {}, orders: {}, cmts: {} };
  function effWith(it, rec) { var keep = state, tmp = {}; if (rec) tmp[it.id] = rec; state = tmp; var r = eff(it); state = keep; return r; }
  function stageRef(t) { var id = (D.stageIds || {})[t]; return 'этап «' + stageTitle(t) + '»' + (id ? ' (stage: ' + id + ')' : ''); }
  function refLabel(r) { if (r.indexOf('S:') === 0) return stageRef(r.slice(2)); var x = ITEM[r]; return x ? (NUM[r] || '') + ' «' + clip(shortOf(x), 40) + '» (' + r + ')' : r; }
  function whereLabel(key) { return key === 'R' ? 'верхний уровень трека' : key.indexOf('S:') === 0 ? stageRef(key.slice(2)) : 'подзадачи ' + refLabel(key.slice(2)); }
  var FLD = [['st', 'статус'], ['role', 'роль'], ['ty', 'тип'], ['s', 'старт'], ['e', 'финиш'], ['p', 'прогресс'], ['sn', 'кратко'], ['cu', 'заказчик'], ['as', 'исполнитель'], ['ap', 'согласующий']];
  var TYN = { '': 'задача', ms: 'веха', bl: 'блокер' };
  function fv(k, v) { if (k === 'ty') return TYN[v] || v; if ((k === 's' || k === 'e') && v) return fmt(v); if (k === 'p') return v == null ? '—' : v + '%'; return v === '' || v == null ? '—' : v; }
  function pageEdits() {
    var out = [];
    items.forEach(function (it) {
      var now = eff(it), lbl = (NUM[it.id] ? NUM[it.id] + ' ' : '') + '«' + clip(shortOf(it), 60) + '»';
      if (it.custom) {
        var bits = ['роль ' + now.role]; if (it.stage) bits.push(stageRef(it.stage)); if (it.pid) bits.push('под задачей ' + refLabel(it.pid));
        if (now.ty) bits.push('тип ' + TYN[now.ty]); if (now.s) bits.push('старт ' + fmt(now.s)); if (now.e) bits.push('финиш ' + fmt(now.e)); if (now.st !== 'Открыт') bits.push('статус ' + now.st);
        if (now.dep.length) bits.push('после: ' + now.dep.map(refLabel).join(', ')); if (now.d) bits.push('описание: ' + now.d.replace(/\s+/g, ' '));
        out.push('Новая задача ' + lbl + ' — создай файл в backlog/: ' + bits.join('; ')); return;
      }
      var was = effWith(it, SEED0.state[it.id]), ch = [];
      FLD.forEach(function (f) { var a = was[f[0]], b = now[f[0]]; if (String(a == null ? '' : a) !== String(b == null ? '' : b)) ch.push(f[1] + ': ' + fv(f[0], a) + ' → ' + fv(f[0], b)); });
      var da = was.dep.slice().sort().join('|'), db2 = now.dep.slice().sort().join('|');
      if (da !== db2) ch.push('зависит от: ' + (now.dep.length ? now.dep.map(refLabel).join(', ') : 'ни от чего') + (was.dep.length ? ' (было: ' + was.dep.map(refLabel).join(', ') + ')' : ''));
      if ((was.d || '') !== (now.d || '')) ch.push('описание: «' + (now.d || '').replace(/\s+/g, ' ') + '»');
      if (ch.length) out.push(lbl + ' (' + (it.file || it.id) + '): ' + ch.join('; '));
    });
    Object.keys(moves).forEach(function (id) {
      if (JSON.stringify(moves[id]) === JSON.stringify(SEED0.moves[id])) return; var x = ITEM[id]; if (!x) return;
      out.push('Перенос ' + refLabel(id) + ' → ' + (x.pid ? 'под задачу ' + refLabel(x.pid) : x.stage ? 'в ' + stageRef(x.stage) : 'на верхний уровень') + ' (parent/stage в файле)');
    });
    Object.keys(orders).forEach(function (k) {
      if (JSON.stringify(orders[k]) === JSON.stringify(SEED0.orders[k])) return;
      var ids = CHL[k] || []; if (!ids.length) return;
      out.push('Новый порядок, ' + whereLabel(k) + ': ' + ids.map(function (r) { return r.indexOf('S:') === 0 ? stageRef(r.slice(2)) : r; }).join(', ') + ' (ordinal по порядку)');
    });
    Object.keys(cmts).forEach(function (k) { var c = cmts[k]; if (SEED0.cmts[k]) return; var x = ITEM[c.item]; out.push('Комментарий о состоянии ' + (x ? refLabel(x.id) : c.item) + ' от ' + fmt(iso(c.ts)) + ': «' + c.text + '» (в раздел «## Комментарии» файла)'); });
    Object.keys(SEED0.cmts).forEach(function (k) { if (!cmts[k]) { var c = SEED0.cmts[k], x = ITEM[c.item]; out.push('Удалён комментарий о состоянии ' + (x ? refLabel(x.id) : c.item) + ': «' + c.text + '»'); } });
    return out;
  }
  function promptText() {
    var dir = D.dir || '<папка roadmap>', ed = pageEdits(), L = [];
    L.push('Правки к roadmap «' + (D.title || 'Roadmap') + '» — навык okr-roadmap-viz.');
    L.push('Папка: ' + dir + ' · сборка ' + (D.stamp || '—'));
    L.push('Источник истины — md: ' + dir + '/roadmap.md и ' + dir + '/backlog/*.md. Правь только их, roadmap.html руками не трогай.');
    L.push('По каждому пункту: правка в md → roadmap.py lint ' + dir + ' → roadmap.py build ' + dir + ' → отчёт по номерам пунктов (сделано / вопрос PO).');
    if (notes.length) {
      L.push(''); L.push('Комментарии (' + notes.length + '):');
      notes.forEach(function (c, i) {
        var head = (i + 1) + '. ' + c.label + (c.file ? ' — ' + c.file : '') + (c.week ? ' · неделя с ' + fmt(c.week) : '') + (c.stamp && c.stamp !== D.stamp ? ' · оставлен на сборке ' + c.stamp : '');
        L.push(head); c.text.split('\n').forEach(function (s) { L.push('   ' + s); });
      });
    }
    if (ed.length) { L.push(''); L.push('Правки, сделанные на странице (' + ed.length + ') — перенеси в md как есть:'); ed.forEach(function (s) { L.push('- ' + s); }); }
    return L.join('\n') + '\n';
  }
  function renderBar() {
    var ed = pageEdits().length, n = notes.length;
    cbN.textContent = String(n + ed); cbN.title = n + ' комментариев · ' + ed + ' правок на странице';
    cbCopy.disabled = !(n + ed); cbar.classList.toggle('has', !!(n + ed));
    cbMode.setAttribute('aria-pressed', String(cmode)); document.body.classList.toggle('cmode', cmode);
    if (!cpanel.hidden) renderPanel();
  }
  function renderPanel() {
    var list = document.getElementById('cpList'); list.textContent = '';
    if (!notes.length) list.appendChild(el('div', 'cp-empty', 'Комментариев нет. Правый клик по любому элементу карты или режим «Комментировать».'));
    notes.forEach(function (c, i) {
      var li = el('div', 'cp-item'), hd = el('button', 'cp-lbl'); hd.type = 'button';
      hd.appendChild(el('b', '', (i + 1) + '.')); hd.appendChild(document.createTextNode(' ' + c.label + (c.week ? ' · неделя с ' + fmt(c.week) : '')));
      hd.addEventListener('click', function () { goTarget(c); });
      var tx = el('div', 'cp-txt', c.text), x = el('button', 'cp-x'); x.type = 'button'; x.title = 'Удалить'; x.setAttribute('aria-label', 'Удалить комментарий'); x.appendChild(svg(ICON.x));
      x.addEventListener('click', function () { notes.splice(i, 1); saveNotes(); render(); renderBar(); });
      li.appendChild(hd); li.appendChild(x); li.appendChild(tx); list.appendChild(li);
    });
    var ed = pageEdits(), eb = document.getElementById('cpEdits'); eb.textContent = '';
    document.getElementById('cpEditsBox').hidden = !ed.length;
    ed.forEach(function (s) { eb.appendChild(el('li', '', s)); });
  }
  function goTarget(c) {
    if (c.key.indexOf('task:') === 0 || c.key.indexOf('ms:') === 0) { var id = c.key.slice(c.key.indexOf(':') + 1); if (ITEM[id]) { if (!ITEM[id].stat && view.t !== 'tr') location.hash = '#track-' + OWN; setTimeout(function () { openDrawer(id); }, 30); } }
    else if (c.key.indexOf('track:') === 0) location.hash = '#track-' + c.key.split(':')[1];
    else if (c.key.indexOf('stage:') === 0 && view.t !== 'tr') location.hash = '#track-' + OWN;
    if (c.week) { var w = Math.floor((ms(c.week) - W0) / (7 * DAY)); setTimeout(function () { sc.scrollTo({ left: Math.max(0, (w - lo) * WPX - 200), behavior: 'smooth' }); }, 60); }
    cpanel.hidden = true; cbList.setAttribute('aria-expanded', 'false');
  }
  function openPop(t, x, y) {
    cpopTarget = t; cpTarget.textContent = t.label; cpTarget.title = t.file || '';
    cpWeek.hidden = !t.week; cpWeek.querySelector('input').checked = !!t.week; cpWeek.querySelector('span').textContent = t.week ? 'неделя с ' + fmt(t.week) : '';
    cpText.value = ''; cpop.hidden = false;
    var r = cpop.getBoundingClientRect(), vw = window.innerWidth, vh = window.innerHeight;
    cpop.style.left = Math.max(8, Math.min(x + 8, vw - r.width - 8)) + 'px'; cpop.style.top = Math.max(52, Math.min(y + 8, vh - r.height - 8)) + 'px';
    cpText.focus();
  }
  function closePop() { cpop.hidden = true; cpopTarget = null; }
  function addNote() {
    var t = cpopTarget, text = cpText.value.trim(); if (!t || !text) { cpText.focus(); return; }
    notes.push({ key: t.key, kind: t.kind, label: t.label, file: t.file || '', week: cpWeek.querySelector('input').checked ? t.week || '' : '', text: text, ts: Date.now(), stamp: D.stamp || '' });
    saveNotes(); closePop(); render(); renderBar(); toast('Комментарий добавлен: ' + notes.length, 1400);
  }
  function copyText(text) {
    function fallback() { var a = el('textarea'); a.value = text; a.style.position = 'fixed'; a.style.opacity = '0'; document.body.appendChild(a); a.select(); var ok = false; try { ok = document.execCommand('copy'); } catch (e) {} a.remove(); return ok; }
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return fallback(); });
    return Promise.resolve(fallback());
  }
  cpAdd.addEventListener('click', addNote);
  document.getElementById('cpCancel').addEventListener('click', closePop);
  cpText.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey)) { ev.preventDefault(); addNote(); } else if (ev.key === 'Escape') { ev.stopPropagation(); closePop(); } });
  cbMode.addEventListener('click', function () { cmode = !cmode; closePop(); renderBar(); if (cmode) toast('Кликните по элементу карты — Esc выключает режим', 2200); });
  cbList.addEventListener('click', function () { cpanel.hidden = !cpanel.hidden; cbList.setAttribute('aria-expanded', String(!cpanel.hidden)); if (!cpanel.hidden) renderPanel(); });
  cbCopy.addEventListener('click', function () {
    var n = notes.length, ed = pageEdits().length;
    copyText(promptText()).then(function (ok) { toast(ok ? 'Промпт скопирован: комментариев ' + n + ', правок ' + ed + '. Вставьте в чат с агентом' : 'Не удалось скопировать — используйте «Файлом»', 3200); });
  });
  document.getElementById('cpFile').addEventListener('click', function () {
    var name = (D.slug || 'roadmap') + '.comments.json';
    var blob = new Blob([JSON.stringify({ roadmap: D.title, dir: D.dir, stamp: D.stamp, comments: notes, page_edits: pageEdits(), prompt: promptText() }, null, 1)], { type: 'application/json' });
    var a = el('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  });
  document.getElementById('cpClear').addEventListener('click', function (ev) {
    var b = ev.currentTarget; if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = 'Точно очистить?'; setTimeout(function () { b.dataset.armed = ''; b.textContent = 'Очистить комментарии'; }, 2500); return; }
    notes = []; saveNotes(); b.dataset.armed = ''; b.textContent = 'Очистить комментарии'; render(); renderBar();
  });
  document.getElementById('cpReset').addEventListener('click', function (ev) {
    var b = ev.currentTarget; if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = 'Точно сбросить?'; setTimeout(function () { b.dataset.armed = ''; b.textContent = 'Сбросить правки страницы'; }, 2500); return; }
    try { localStorage.removeItem(LS_KEY); } catch (e) {} location.reload();
  });
  // right click anywhere on the map, or a click in comment mode
  document.addEventListener('contextmenu', function (ev) {
    if (ev.shiftKey || ev.target.closest('.cbar, .cpanel, .cpop, input, textarea, [contenteditable="true"]')) return;
    var t = targetOf(ev.target, ev.clientX); if (!t) return;
    ev.preventDefault(); openPop(t, ev.clientX, ev.clientY);
  });
  var hov = null;
  sc.addEventListener('mouseover', function (ev) {
    if (!cmode) return; var n = ev.target.closest('[data-ms], .row.tk, .row.sh, .row[data-track], .hd');
    if (hov && hov !== n) hov.classList.remove('chov'); hov = n; if (n) n.classList.add('chov');
  });
  document.addEventListener('click', function (ev) {
    if (!cmode || ev.target.closest('.cbar, .cpanel, .cpop')) return;
    if (!ev.target.closest('#sc, .drawer')) return;
    var t = targetOf(ev.target, ev.clientX); if (!t) return;
    ev.preventDefault(); ev.stopPropagation(); openPop(t, ev.clientX, ev.clientY);
  }, true);
  document.addEventListener('pointerdown', function (ev) { if (cmode && ev.target.closest('#sc .grip')) { ev.stopPropagation(); } }, true);
  document.addEventListener('keydown', function (ev) {
    if (ev.key !== 'Escape') return;
    if (!cpop.hidden) { closePop(); ev.stopPropagation(); return; }
    if (!cpanel.hidden) { cpanel.hidden = true; cbList.setAttribute('aria-expanded', 'false'); return; }
    if (cmode) { cmode = false; renderBar(); if (hov) hov.classList.remove('chov'); }
  }, true);
  document.addEventListener('pointerdown', function (ev) {
    if (!cpop.hidden && !ev.target.closest('.cpop')) closePop();
    if (!cpanel.hidden && !ev.target.closest('.cpanel, #cbList')) { cpanel.hidden = true; cbList.setAttribute('aria-expanded', 'false'); }
  });
  window.addEventListener('storage', function (ev) { if (ev.key === CM_KEY) { try { notes = JSON.parse(ev.newValue || '[]') || []; } catch (e) {} render(); renderBar(); } });
  window.__rmPrompt = promptText;

  // ---------- routing and scrolling ----------
  function route() {
    var m = /^#track-(\d+)$/.exec(location.hash), n = m && +m[1];
    view = n && TRACKS.some(function (t) { return t.n === n; }) ? { t: 'tr', n: n } : { t: 'ov' };
    flushNote(); sel = null; adding = null; dr.classList.remove('open');
    document.title = view.t === 'ov' ? (D.title || 'Roadmap') : curTrack().name + ' · ' + (D.title || 'Roadmap');
    var sl = sc.scrollLeft; render(); sc.scrollLeft = sl; sc.scrollTop = 0;
  }
  function toToday(smooth) { sc.scrollTo({ left: Math.max(0, (todayIdx - lo) * WPX - 120), behavior: smooth ? 'smooth' : 'auto' }); }
  document.getElementById('fab').addEventListener('click', function () { toToday(true); });
  var ticking = false;
  sc.addEventListener('scroll', function () {
    if (ticking) return; ticking = true;
    requestAnimationFrame(function () {
      ticking = false; var sl = sc.scrollLeft, room = sc.scrollWidth - sc.clientWidth - sl;
      if (sl < 300) { lo -= 26; render(26); } else if (room < 400) { hi += 26; render(); }
    });
  });
  window.addEventListener('hashchange', route);
  window.addEventListener('resize', function () { render(); });
  var HAS_RT = !!(window.claude && typeof window.claude.use === 'function');
  if (!HAS_RT) { localLoad(); document.getElementById('xl').hidden = false; }
  rebuild(); syncTabs(); route(); toToday(false);

  if (window.claude && typeof window.claude.use === 'function') {
    var noDb = function () { if (localLoad()) { rebuild(); render(); } };
    window.claude.use('db').then(function (d) { if (d) { db = d; subscribe(); } else noDb(); })
      .catch(noDb);
    window.claude.use('downloads').then(function (d) { if (d) { dl = d; document.getElementById('xl').hidden = false; } }).catch(function () {});
  }
})();
