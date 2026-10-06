  // ---------- search input ----------
  var qT;
  $("q").addEventListener("input", function(e){
    filters.q=e.target.value; clearTimeout(qT); qT=setTimeout(applyFilters,120);
  });
  $("reToggle").onclick=function(){
    filters.regex=!filters.regex; this.classList.toggle("on",filters.regex); applyFilters();
  };

  // ---------- time-range filter ---------- (pad() is the shared helper defined below)
  function toLocalInput(ms){ // minute precision — matches the datetime-local inputs (no seconds)
    var d=new Date(ms);
    return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate())+"T"+
           pad(d.getHours())+":"+pad(d.getMinutes());
  }
  function onTimeInput(){
    var f=$("tFrom").value, t=$("tTo").value;
    filters.tsFrom = f ? new Date(f).getTime() : null;
    filters.tsTo   = t ? new Date(t).getTime() : null;
    $("tFrom").classList.toggle("on", filters.tsFrom!=null);
    $("tTo").classList.toggle("on", filters.tsTo!=null);
    applyFilters();
  }
  function setupTimeBounds(){
    // reset any carried-over interval, then set the native picker bounds to the data's span
    $("tFrom").value=""; $("tTo").value="";
    filters.tsFrom=null; filters.tsTo=null;
    $("tFrom").classList.remove("on"); $("tTo").classList.remove("on");
    var lo=Infinity, hi=-Infinity;
    for(var i=0;i<ALL.length;i++){ var t=ALL[i].tsMs; if(!isNaN(t)){ if(t<lo)lo=t; if(t>hi)hi=t; } }
    if(lo<=hi){
      var min=toLocalInput(lo), max=toLocalInput(hi);
      $("tFrom").min=min; $("tFrom").max=max;
      $("tTo").min=min;   $("tTo").max=max;
    } else {
      ["tFrom","tTo"].forEach(function(id){ $(id).removeAttribute("min"); $(id).removeAttribute("max"); });
    }
  }
  function clearTimeFilter(){
    $("tFrom").value=""; $("tTo").value="";
    filters.tsFrom=null; filters.tsTo=null;
    $("tFrom").classList.remove("on"); $("tTo").classList.remove("on");
    applyFilters();
  }
  $("tFrom").addEventListener("change", onTimeInput);
  $("tFrom").addEventListener("input", onTimeInput);
  $("tTo").addEventListener("change", onTimeInput);
  $("tTo").addEventListener("input", onTimeInput);
  $("tClear").onclick=clearTimeFilter;
