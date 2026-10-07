/* Презентация квартала: на широком экране — по слайду (1600×900 под размер окна),
   на узком — лентой. Стрелки, пробел, PageUp/PageDown, Home/End; номер слайда — в
   адресе (#slide=N); «Слайды» — оглавление; F — на весь экран; PDF — печать. */
(function(){
  "use strict";
  var deck = document.getElementById("deck");
  var feed = document.getElementById("feed");
  var slides = [].slice.call(document.querySelectorAll(".slide"));
  var toc = document.getElementById("toc");
  var cur = 0;

  /* Оглавление: номер · вид · название. */
  var list = document.getElementById("tocList");
  slides.forEach(function(s, i){
    var a = document.createElement("a");
    a.href = "#slide=" + (i + 1);
    a.innerHTML = '<span class="n">' + (i + 1) + ' ·</span><span class="kind"></span>';
    a.querySelector(".kind").textContent = s.getAttribute("data-kind") || "";
    a.appendChild(document.createTextNode(s.getAttribute("data-title") || ""));
    a.addEventListener("click", function(e){ e.preventDefault(); go(i); closeToc(); });
    list.appendChild(a);
  });
  var links = [].slice.call(list.querySelectorAll("a"));

  function stage(){ return window.innerWidth >= 900; }
  function fit(){
    if(!deck.classList.contains("stage")) { slides.forEach(function(s){ s.style.transform = ""; }); return; }
    var k = Math.min(feed.clientWidth / 1640, (feed.clientHeight - 60) / 920);
    slides.forEach(function(s){ s.style.transform = "translate(-50%, -50%) scale(" + k + ")"; });
  }
  function mark(){
    links.forEach(function(a, i){ a.classList.toggle("cur", i === cur); });
    document.getElementById("count").textContent = (cur + 1) + " / " + slides.length;
    document.getElementById("prev").disabled = cur === 0;
    document.getElementById("next").disabled = cur === slides.length - 1;
  }
  function go(i, keepHash){
    cur = Math.max(0, Math.min(slides.length - 1, i));
    slides.forEach(function(s, k){ s.classList.toggle("cur", k === cur); });
    if(!deck.classList.contains("stage")) slides[cur].scrollIntoView({block: "start"});
    /* Во встроенной странице (iframe srcdoc) адрес менять нельзя — листаем без него. */
    if(!keepHash){ try { history.replaceState(null, "", "#slide=" + (cur + 1)); } catch(e){} }
    mark();
  }
  function setMode(){
    deck.classList.toggle("stage", stage());
    fit();
  }
  function openToc(){ toc.classList.add("open"); }
  function closeToc(){ toc.classList.remove("open"); }

  document.getElementById("sideTab").onclick = function(){ toc.classList.contains("open") ? closeToc() : openToc(); };
  document.getElementById("tocBtn").onclick = function(){ toc.classList.contains("open") ? closeToc() : openToc(); };
  document.getElementById("prev").onclick = function(){ go(cur - 1); };
  document.getElementById("next").onclick = function(){ go(cur + 1); };
  document.getElementById("printBtn").onclick = function(){ window.print(); };
  var full = document.getElementById("fullBtn");
  full.onclick = function(){
    if(document.fullscreenElement) document.exitFullscreen();
    else if(document.documentElement.requestFullscreen) document.documentElement.requestFullscreen();
  };
  document.addEventListener("fullscreenchange", function(){
    full.textContent = document.fullscreenElement ? "Выйти из полноэкранного" : "На весь экран";
    setTimeout(fit, 50);
  });
  document.addEventListener("click", function(e){
    if(toc.classList.contains("open") && !toc.contains(e.target) && e.target.id !== "sideTab" && e.target.id !== "tocBtn") closeToc();
  });
  document.addEventListener("keydown", function(e){
    if(e.key === "Escape"){ closeToc(); return; }
    if(!deck.classList.contains("stage")) return;
    if(e.key === "ArrowRight" || e.key === "PageDown" || e.key === " "){ e.preventDefault(); go(cur + 1); }
    if(e.key === "ArrowLeft" || e.key === "PageUp"){ e.preventDefault(); go(cur - 1); }
    if(e.key === "Home"){ e.preventDefault(); go(0); }
    if(e.key === "End"){ e.preventDefault(); go(slides.length - 1); }
    if(e.key === "f" || e.key === "F" || e.key === "а" || e.key === "А"){ full.click(); }
  });
  /* Лента на узком экране: текущий слайд — тот, что ближе к верху. */
  feed.addEventListener("scroll", function(){
    if(deck.classList.contains("stage")) return;
    var top = feed.getBoundingClientRect().top, best = 0;
    slides.forEach(function(s, i){ if(s.getBoundingClientRect().top - top < 120) best = i; });
    if(best !== cur){ cur = best; mark(); }
  });
  window.addEventListener("resize", setMode);
  window.addEventListener("hashchange", function(){ go(fromHash(), true); });
  function fromHash(){ var m = location.hash.match(/slide=(\d+)/); return m ? parseInt(m[1], 10) - 1 : 0; }

  setMode();
  go(fromHash(), true);
})();
