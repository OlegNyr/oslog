  // ---------- level buttons ----------
  function buildLevelButtons(){
    var counts={}; LEVEL_ORDER.forEach(function(l){counts[l]=0;});
    ALL.forEach(function(r){ counts[r.level]=(counts[r.level]||0)+1; });
    var box=$("levels"); box.innerHTML="";
    LEVEL_ORDER.forEach(function(l){
      if(!counts[l] && l!=="ERROR") return; // hide empty (keep ERROR always visible)
      var b=document.createElement("button");
      b.className="lv-btn"+(levelOn[l]?"":" off"); b.dataset.lv=l;
      b.innerHTML='<span class="dot"></span>'+l+'<span class="cnt">'+(counts[l]||0)+'</span>';
      b.onclick=function(){ levelOn[l]=!levelOn[l]; b.classList.toggle("off",!levelOn[l]); applyFilters(); };
      box.appendChild(b);
    });
  }
