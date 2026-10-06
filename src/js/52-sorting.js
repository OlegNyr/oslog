  // ---------- list sorting (click a column header) ----------
  // Click: sort by that column (▲ → ▼ → off). Shift+click: add it as the next
  // key, or flip / drop it if it is already one. sortKeys = [] keeps the load
  // order (time for OpenSearch / CSV, file order for .log). VIEW is sorted
  // after filtering, so navigation (↑/↓, issue, exchange) follows the list.
  var SORT_LABEL={ seq:"#", time:"time", lvl:"level", logger:"logger", thread:"thread", msg:"message" };

  function sortMark(col){
    for(var i=0;i<sortKeys.length;i++) if(sortKeys[i].col===col)
      return '<span class="sort-ind">'+(sortKeys[i].dir>0?"▲":"▼")+(sortKeys.length>1? (i+1) : "")+'</span>';
    return "";
  }
  // the value a record is sorted by; null/"" always go last
  function sortValue(r, col){
    switch(col){
      case "seq": var n=Number(r.seq); return isNaN(n)? String(r.seq) : n;
      case "time": return isNaN(r.tsMs)? null : r.tsMs;
      case "lvl": return LEVEL_ORDER.indexOf(r.level); // ERROR first
      case "logger": return r.logger.toLowerCase();
      case "thread": return r.thread.toLowerCase();
      case "msg": return r.msg.toLowerCase();
    }
    var v=cellValue(r, col); // custom column: numbers compare as numbers ("58" < "120")
    if(v==="") return null;
    var num=Number(v);
    return (isFinite(num) && /^-?\d/.test(v))? num : v.toLowerCase();
  }
  function sortView(){
    var nk=sortKeys.length, rows=new Array(VIEW.length);
    for(var i=0;i<VIEW.length;i++){
      var r=ALL[VIEW[i]], vals=new Array(nk);
      for(var k=0;k<nk;k++) vals[k]=sortValue(r, sortKeys[k].col);
      rows[i]={idx:VIEW[i], v:vals};
    }
    rows.sort(function(a,b){
      for(var k=0;k<nk;k++){
        var x=a.v[k], y=b.v[k];
        if(x===y) continue;
        if(x===null||x==="") return 1;
        if(y===null||y==="") return -1;
        var tx=typeof x, ty=typeof y;
        if(tx!==ty) return (tx==="number"? -1 : 1); // numbers before text
        return (x<y? -1 : 1)*sortKeys[k].dir;
      }
      return a.idx-b.idx; // stable: load order
    });
    for(var j=0;j<rows.length;j++) VIEW[j]=rows[j].idx;
  }
  function onSortClick(col, add){
    var at=-1;
    for(var i=0;i<sortKeys.length;i++) if(sortKeys[i].col===col) at=i;
    if(add){
      if(at<0) sortKeys.push({col:col, dir:1});
      else if(sortKeys[at].dir>0) sortKeys[at].dir=-1;
      else sortKeys.splice(at,1);
    } else if(at===0 && sortKeys.length===1){
      if(sortKeys[0].dir>0) sortKeys[0].dir=-1; else sortKeys=[];
    } else sortKeys=[{col:col, dir:1}];
    buildColHead();
    applyFilters();
    if(selected>=0){ var k=VIEW.indexOf(selected); if(k>=0) scrollToView(k); }
    toast(sortKeys.length? "сортировка: "+sortKeys.map(function(s){
      var c=customCols.filter(function(cc){return cc.path===s.col;})[0];
      return (SORT_LABEL[s.col]||(c&&c.label)||s.col)+(s.dir>0?" ▲":" ▼");
    }).join(", ") : "сортировка: как загружено");
  }
  $("colHead").addEventListener("click",function(e){
    if(!e.target.closest || e.target.closest(".col-rsz,.col-x")) return;
    var h=e.target.closest("[data-sort]"); if(!h) return;
    onSortClick(h.dataset.sort, e.shiftKey);
  });
