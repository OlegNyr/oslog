  // ---------- loading ----------
  function loadText(text, name){
    var lines = text.split(/\r?\n/);
    var recs=[];
    for(var i=0;i<lines.length;i++){
      var ln=lines[i]; if(ln.trim()==="") continue;
      recs.push(norm(ln, recs.length+1));
    }
    setRecords(recs, name, "lines");
  }
  // Replaces the loaded set with ready records (from norm()) and redraws
  // everything. `what` names the unit in the header/toast ("lines", "записей").
  function setRecords(recs, name, what){
    what = what || "lines";
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
    toast("Loaded "+recs.length+" "+what);
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
    Promise.all(readers).then(function(parts){
      var text = parts.map(function(p){return p.text;}).join("\n");
      var name = parts.length===1? parts[0].name : parts.length+" files";
      loadText(text, name);
    });
  }
