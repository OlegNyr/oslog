  // ---------- viewer filters -> OpenSearch query («⇡ фильтры») ----------
  // Turns the active viewer filters into Lucene over the cluster's fields
  // (app.* = the parsed log line, k8s fields at the _source root), ANDs it to
  // the query, moves the time interval into «от/до», clears what was moved
  // and loads. A regex search can't be expressed and stays local.
  var K8S_SOURCE={ app:"pod_labels.app", pod:"pod", namespace:"namespace", container:"container", node:"node", cluster:"k8sClusterName" };
  var LUCENE_LEVELS=["ERROR","WARN","INFO","DEBUG","TRACE"];

  function luceneField(path){
    if(path.indexOf("k8s.")===0 && K8S_SOURCE[path.slice(4)]) return K8S_SOURCE[path.slice(4)];
    return ("app."+path).replace(/[+\-=&|><!(){}\[\]^"~*?:\\\/\s]/g,"\\$&");
  }
  function luceneVal(v){ return '"'+String(v).replace(/[\\"]/g,"\\$&")+'"'; }

  // -> {parts:[lucene…], time:bool, skipped:[text…], none:bool (every level off)}
  function filtersToLucene(){
    var parts=[], skipped=[];
    var on=LUCENE_LEVELS.filter(function(l){ return levelOn[l]; });
    if(on.length<LUCENE_LEVELS.length || !levelOn.RAW){
      var cond = on.length===LUCENE_LEVELS.length? "_exists_:app.level" : on.length? "app.level:("+on.join(" OR ")+")" : "";
      // RAW = no app.level. Inside OR a bare NOT would turn into must_not for the
      // whole group (Lucene) and match nothing — hence (*:* NOT …)
      if(levelOn.RAW && on.length<LUCENE_LEVELS.length) cond = cond? "("+cond+" OR (*:* NOT _exists_:app.level))" : "NOT _exists_:app.level";
      if(cond) parts.push(cond); else return {parts:[], time:false, skipped:[], none:true};
    }
    if(filters.logger) parts.push((filters.loggerNeg? "NOT " : "")+"app.logger:"+luceneVal(filters.logger));
    if(filters.thread) parts.push("app.process.thread.name:"+luceneVal(filters.thread));
    if(filters.trace) parts.push("app.traceId:"+luceneVal(filters.trace));
    if(filters.correlation) parts.push("app.correlation:"+luceneVal(filters.correlation));
    filters.fields.forEach(function(f){
      var fld=luceneField(f.path);
      if(f.op==="empty") parts.push("NOT _exists_:"+fld);
      else if(f.op==="nonempty") parts.push("_exists_:"+fld);
      else parts.push((f.op==="ne"? "NOT " : "")+fld+":"+luceneVal(f.val));
    });
    var q=filters.q.trim();
    if(q){ if(filters.regex) skipped.push("регулярное выражение в поиске"); else parts.push(luceneVal(q)); }
    return {parts:parts, time:(filters.tsFrom!=null || filters.tsTo!=null), skipped:skipped, none:false};
  }
  function updateFiltersBtn(){
    var b=$("osFromView"); if(!b) return;
    var t=filtersToLucene();
    b.disabled = qRunning || (!t.parts.length && !t.time);
  }
  function transferFilters(){
    if(qRunning) return;
    var t=filtersToLucene();
    if(t.none){ toast("все уровни выключены — нечего искать"); return; }
    if(!t.parts.length && !t.time){ toast("нет фильтров для переноса"); return; }
    if(t.parts.length){
      var cur=$("osQuery").value.trim(), add=t.parts.join(" AND ");
      $("osQuery").value = cur? "("+cur+") AND "+add : add;
    }
    if(t.time){
      renderTimes();
      if(filters.tsFrom!=null) qs.from=filters.tsFrom;
      if(filters.tsTo!=null) qs.to=filters.tsTo;
      qs.rel=null; renderTimes();
    }
    // moved to the server — drop them here so nothing is filtered twice
    filters.logger=null; filters.loggerNeg=false; filters.thread=null; filters.trace=null; filters.correlation=null; filters.fields=[];
    if(!filters.regex){ filters.q=""; $("q").value=""; }
    LEVEL_ORDER.forEach(function(l){ levelOn[l]=true; });
    buildLevelButtons();
    clearTimeFilter(); // also re-applies the (now empty) local filters
    toast("фильтры перенесены в запрос"+(t.skipped.length? " · не перенесено: "+t.skipped.join(", ") : ""));
    osLoad();
  }
  if(osApi){
    $("osFromView").style.display="";
    $("osFromView").onclick=transferFilters;
    updateFiltersBtn();
  }
