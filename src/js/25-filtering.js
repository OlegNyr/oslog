  // ---------- filtering ----------
  function compileQuery(){
    var q=filters.q.trim();
    if(!q) return null;
    if(filters.regex){
      try{ return {re:new RegExp(q,"i")}; }catch(e){ return {bad:true}; }
    }
    return {sub:q.toLowerCase()};
  }
  function applyFilters(){
    var qc=compileQuery();
    $("q").style.color = (qc&&qc.bad)? "var(--lv-error)":"var(--txt)";
    VIEW=[];
    for(var i=0;i<ALL.length;i++){
      var r=ALL[i];
      if(!levelOn[r.level]) continue;
      if(filters.tsFrom!=null || filters.tsTo!=null){
        if(isNaN(r.tsMs)) continue; // can't place a record without a parseable timestamp in the interval
        if(filters.tsFrom!=null && r.tsMs<filters.tsFrom) continue;
        if(filters.tsTo!=null && r.tsMs>filters.tsTo) continue;
      }
      if(filters.correlation && r.correlation!==filters.correlation) continue;
      if(filters.trace && r.traceId!==filters.trace) continue;
      if(filters.logger){
        var match = r.logger===filters.logger;
        if(filters.loggerNeg? match : !match) continue;
      }
      if(filters.thread && r.thread!==filters.thread) continue;
      if(filters.fields.length){
        var fpass=true;
        for(var fi=0; fi<filters.fields.length; fi++){
          var ff=filters.fields[fi], got=fieldValue(r, ff.path);
          var emptyVal=(got===undefined||got===null||got===""), ok;
          if(ff.op==="empty") ok=emptyVal;
          else if(ff.op==="nonempty") ok=!emptyVal;
          else if(ff.op==="ne") ok=String(got)!==ff.val;
          else ok=String(got)===ff.val;
          if(!ok){ fpass=false; break; }
        }
        if(!fpass) continue;
      }
      if(qc){
        if(qc.bad) {/* show all on bad regex */}
        else if(qc.sub){ if(r.hay.indexOf(qc.sub)<0) continue; }
        else if(qc.re){ if(!qc.re.test(r.raw)) continue; }
      }
      VIEW.push(i);
    }
    renderChips();
    renderStatus();
    renderVirtual(true);
    renderTimeline();
  }
