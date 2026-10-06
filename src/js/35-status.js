  // ---------- status ----------
  function renderStatus(){
    var c={ERROR:0,WARN:0,INFO:0,DEBUG:0,TRACE:0,RAW:0};
    for(var i=0;i<VIEW.length;i++) c[ALL[VIEW[i]].level]++;
    // earliest → latest, whatever order the list is sorted in
    var first=null, last=null;
    for(var j=0;j<VIEW.length;j++){
      var rj=ALL[VIEW[j]]; if(isNaN(rj.tsMs)) continue;
      if(!first||rj.tsMs<first.tsMs) first=rj;
      if(!last||rj.tsMs>last.tsMs) last=rj;
    }
    var range="";
    if(first&&last) range = fmtTime(first)+" → "+fmtTime(last);
    status.innerHTML =
      '<span><b>'+VIEW.length.toLocaleString()+'</b> shown</span><span class="sep">·</span>'+
      '<span>'+ALL.length.toLocaleString()+' total</span><span class="sep">·</span>'+
      (c.ERROR?'<span class="s-error">'+c.ERROR+' ERR</span> ':'')+
      (c.WARN?'<span class="s-warn">'+c.WARN+' WARN</span> ':'')+
      '<span class="s-info">'+c.INFO+' INFO</span> '+
      '<span class="s-debug">'+c.DEBUG+' DEBUG</span>'+
      (range? '<span class="sep">·</span><span>'+range+'</span>':'');
  }
