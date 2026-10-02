/* Презентация квартала: слайд 1280×720 под размер окна, листание стрелками,
   пробелом, кликом по краю; номер слайда — в адресе (#slide=N). */
(function(){
  "use strict";
  var stage = document.getElementById("stage");
  var slides = [].slice.call(document.querySelectorAll(".slide"));
  var cur = 0;
  function fit(){
    var k = Math.min(window.innerWidth / 1280, window.innerHeight / 720);
    stage.style.transform = "scale(" + k + ") translate(-50%, -50%)";
  }
  function show(i, push){
    cur = Math.max(0, Math.min(slides.length - 1, i));
    slides.forEach(function(s, k){ s.classList.toggle("on", k === cur); });
    document.getElementById("pos").textContent = (cur + 1) + " / " + slides.length;
    /* Во встроенной странице (iframe srcdoc) адрес менять нельзя — листаем без него. */
    if(push !== false){ try { history.replaceState(null, "", "#slide=" + (cur + 1)); } catch(e){} }
  }
  function fromHash(){ var m = location.hash.match(/slide=(\d+)/); return m ? parseInt(m[1], 10) - 1 : 0; }
  window.addEventListener("resize", fit);
  window.addEventListener("hashchange", function(){ show(fromHash(), false); });
  document.getElementById("prev").onclick = function(){ show(cur - 1); };
  document.getElementById("next").onclick = function(){ show(cur + 1); };
  document.addEventListener("keydown", function(e){
    if(e.key === "ArrowRight" || e.key === "PageDown" || e.key === " "){ e.preventDefault(); show(cur + 1); }
    if(e.key === "ArrowLeft" || e.key === "PageUp"){ e.preventDefault(); show(cur - 1); }
    if(e.key === "Home"){ e.preventDefault(); show(0); }
    if(e.key === "End"){ e.preventDefault(); show(slides.length - 1); }
  });
  fit();
  show(fromHash(), false);
})();
