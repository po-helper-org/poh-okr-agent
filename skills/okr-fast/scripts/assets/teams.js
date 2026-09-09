(function(){
  /* Команда — это раздел листа планирования. Выбор живёт во второй панели рейки,
     рядом с содержанием: и то и другое — навигация, только содержание двигает
     позицию, а команда меняет состав документа. */
  var tab = document.getElementById("teamTab");
  var drawer = document.getElementById("teamDrawer");
  var items = Array.prototype.slice.call(drawer.querySelectorAll(".team-item"));
  if(items.length < 3){ tab.hidden = true; return; }

  var KEY = "okr-team:{{QUARTER}}";
  var sections = Array.prototype.slice.call(document.querySelectorAll("section.team"));

  function apply(team){
    sections.forEach(function(s){ s.hidden = !!team && s.getAttribute("data-team") !== team; });
    items.forEach(function(b){
      if((b.getAttribute("data-team") || "") === (team || "")) b.setAttribute("data-active", "");
      else b.removeAttribute("data-active");
    });
    document.getElementById("teamNow").textContent = team || "все";
    try{ localStorage.setItem(KEY, team || ""); }catch(e){}
  }

  function toggle(){
    drawer.classList.toggle("open");
    document.body.classList.toggle("drawer-open", drawer.classList.contains("open"));
  }
  tab.addEventListener("click", toggle);
  drawer.querySelector(".drawer-close").addEventListener("click", toggle);

  items.forEach(function(b){
    b.addEventListener("click", function(){
      apply(b.getAttribute("data-team") || "");
      toggle();
      window.scrollTo({ top: 0 });
    });
  });

  var saved = "";
  try{ saved = localStorage.getItem(KEY) || ""; }catch(e){}
  apply(saved);
})();
