  // ---------- keyboard ----------
  document.addEventListener("keydown",function(e){
    if(e.target.tagName==="INPUT" && e.key!=="Escape") {
      if(e.key==="Enter"){ e.target.blur(); }
      return;
    }
    if(e.key==="/"){ e.preventDefault(); $("q").focus(); $("q").select(); }
    else if(e.key==="Escape"){
      if($("colsPop").style.display==="block"){ $("colsPop").style.display="none"; }
      else if(filters.correlation){filters.correlation=null;applyFilters();}
      else if(filters.tsFrom!=null||filters.tsTo!=null){clearTimeFilter();}
      else if(filters.trace){filters.trace=null;applyFilters();}
      else if(!detail.classList.contains("hidden")){$("dClose").click();}
    }
    else if(e.key==="ArrowDown"||e.key==="j"){ e.preventDefault(); moveSel(1); }
    else if(e.key==="ArrowUp"||e.key==="k"){ e.preventDefault(); moveSel(-1); }
    else if(e.key==="N"&&e.shiftKey){ jumpIssue(1); }
    else if(e.key==="P"&&e.shiftKey){ jumpIssue(-1); }
  });
  $("nextHit").onclick=function(){jumpIssue(1);};
  $("prevHit").onclick=function(){jumpIssue(-1);};
  function moveSel(dir){
    if(!VIEW.length) return;
    var cur = selected>=0? VIEW.indexOf(selected) : -1;
    var nk = cur<0 ? (dir>0?0:VIEW.length-1) : Math.max(0,Math.min(VIEW.length-1,cur+dir));
    selectRow(VIEW[nk]); scrollToView(nk);
  }
