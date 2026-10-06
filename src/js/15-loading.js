  // ---------- loading ----------
  function loadText(text, name){
    if(csvSniff(text)){ loadParts([{name:name, text:text}]); return; }
    histHide(); // the density strip belongs to OpenSearch queries
    var lines = text.split(/\r?\n/);
    var recs=[];
    for(var i=0;i<lines.length;i++){
      var ln=lines[i]; if(ln.trim()==="") continue;
      recs.push(norm(ln, recs.length+1));
    }
    setRecords(recs, name, "строк");
  }
  // Replaces the loaded set with ready records (from norm()) and redraws
  // everything. `what` names the unit in the header/toast ("строк", "записей").
  function setRecords(recs, name, what){
    what = what || "строк";
    ALL = recs;
    corrIndex = new Map();
    for(var ci=0; ci<ALL.length; ci++){
      var cc = ALL[ci].correlation;
      if(cc){ var arr=corrIndex.get(cc); if(!arr){ arr=[]; corrIndex.set(cc,arr); } arr.push(ci); }
    }
    selected = -1; detail.classList.add("hidden");
    $("fileName").textContent = name + "  ·  " + recs.length + " " + what;
    drop.style.display="none";
    $("timeline").style.display=""; $("tlResize").style.display="";
    setupTimeBounds();
    buildLevelButtons();
    applyFilters();
    toast("загружено "+recs.length+" "+what);
  }
  function loadFiles(fileList){
    var files=Array.prototype.slice.call(fileList);
    if(!files.length) return;
    var readers = files.map(function(f){
      return new Promise(function(res){
        var r=new FileReader();
        r.onload=function(){res({name:f.name,text:String(r.result)});};
        r.onerror=function(){res({name:f.name,text:""});};
        r.readAsText(f);
      });
    });
    Promise.all(readers).then(loadParts);
  }
  // Files (or pasted text) as [{name, text}]. Plain ndjson keeps the file
  // order; once a CSV export is among them, every line becomes a hit and the
  // whole set is sorted by time like an OpenSearch result.
  function loadParts(parts){
    var name = parts.length===1? parts[0].name : parts.length+" файлов";
    var csv = parts.filter(function(p){ return /\.csv$/i.test(p.name) || csvSniff(p.text); });
    if(!csv.length){ loadText(parts.map(function(p){return p.text;}).join("\n"), name); return; }
    var hits=[], errors=[];
    parts.forEach(function(p){
      if(csv.indexOf(p)>=0){
        var res=csvToHits(p.text, p.name);
        if(res.error) errors.push(res.error); else hits=hits.concat(res.hits);
      } else {
        p.text.split(/\r?\n/).forEach(function(ln){ if(ln.trim()!=="") hits.push({key:"", ts:NaN, msg:ln, k8s:{}}); });
      }
    });
    if(!hits.length){ toast(errors[0]||"нет записей"); return; }
    histHide();
    setRecords(hitsToRecords(hits), name, "записей");
    var apps={}; ALL.forEach(function(r){ if(r.k8s && r.k8s.app) apps[r.k8s.app]=1; });
    if(Object.keys(apps).length>1 && !customCols.some(function(c){return c.path==="k8s.app";})) addCustomCol("k8s.app","service");
    if(errors.length) toast(errors[0]);
  }
