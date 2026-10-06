  // ---------- issue navigation ----------
  function jumpIssue(dir){
    if(!VIEW.length) return;
    var cur = selected>=0? VIEW.indexOf(selected) : (dir>0?-1:VIEW.length);
    for(var k=cur+dir; k>=0 && k<VIEW.length; k+=dir){
      var r=ALL[VIEW[k]];
      if(r.level==="WARN"||r.level==="ERROR"){ selectRow(VIEW[k]); scrollToView(k); return; }
    }
    toast("no more WARN/ERROR");
  }
  function scrollToView(k){
    var top=k*ROW_H, bottom=top+ROW_H;
    if(top<vlist.scrollTop) vlist.scrollTop=top-ROW_H*3;
    else if(bottom>vlist.scrollTop+vlist.clientHeight) vlist.scrollTop=bottom-vlist.clientHeight+ROW_H*3;
    renderVirtual(false);
  }
