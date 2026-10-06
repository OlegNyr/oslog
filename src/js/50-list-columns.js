  // ---------- list columns (built-in + user-defined root-level JSON fields) ----------
  function buildColHead(){
    var html=
      '<div class="c-seq">#<span class="col-rsz" data-var="--c-seq" data-min="36"></span></div>'+
      '<div class="c-time">time<span class="col-rsz" data-var="--c-time" data-min="70"></span></div>'+
      '<div class="c-lvl">level<span class="col-rsz" data-var="--c-lvl" data-min="44"></span></div>'+
      '<div class="c-logger">logger<span class="col-rsz" data-var="--c-logger" data-min="80"></span></div>'+
      '<div class="c-thread">thread<span class="col-rsz" data-var="--c-thread" data-min="80"></span></div>';
    customCols.forEach(function(c){
      html+='<div class="c-custom" style="flex:0 0 var('+c.var+')" title="'+esc(c.path)+'">'+esc(c.label)+
            '<span class="col-x" data-key="'+esc(c.path)+'" title="Убрать колонку">×</span>'+
            '<span class="col-rsz" data-var="'+c.var+'" data-min="50"></span></div>';
    });
    html+='<div class="c-msg">message</div>';
    $("colHead").innerHTML=html;
  }
  function cellValue(r, path){ // value at a JSON path (flat key or nested); objects shown as compact JSON
    var v=fieldValue(r, path);
    if(v===undefined||v===null) return "";
    if(typeof v==="object"){ try{ return JSON.stringify(v); }catch(e){ return String(v); } }
    return String(v);
  }
  function rootKeys(){ // distinct top-level keys across loaded records (excluding built-in-covered ones)
    var set={};
    for(var i=0;i<ALL.length;i++){
      var o=ALL[i].parsed; if(!o||typeof o!=="object") continue;
      for(var k in o){ if(Object.prototype.hasOwnProperty.call(o,k) && !COL_EXCLUDE[k]) set[k]=true; }
    }
    return Object.keys(set).sort();
  }
  function addCustomCol(path, label){
    if(customCols.some(function(c){return c.path===path;})){ toast("колонка уже есть"); return; }
    var v="--cc-"+(ccSeq++);
    document.documentElement.style.setProperty(v,"140px");
    customCols.push({path:path, label:label||path, var:v});
    buildColHead(); renderVirtual(false);
    toast("колонка: "+(label||path));
  }
  function removeCustomCol(path){
    customCols=customCols.filter(function(c){return c.path!==path;});
    buildColHead(); renderVirtual(false);
  }
  function buildColsMenu(){
    var keys=rootKeys(), active={};
    customCols.forEach(function(c){ active[c.path]=true; });
    var html='<h5>колонки · поля JSON корневого уровня</h5>';
    if(!keys.length) html+='<div class="mini" style="padding:4px 6px">загрузите лог</div>';
    keys.forEach(function(k){
      html+='<label><input type="checkbox" data-key="'+esc(k)+'"'+(active[k]?" checked":"")+'> '+esc(k)+'</label>';
    });
    $("colsPop").innerHTML=html;
  }
  $("colsBtn").onclick=function(){
    var pop=$("colsPop");
    if(pop.style.display==="block"){ pop.style.display="none"; return; }
    buildColsMenu();
    pop.style.display="block";
    var r=this.getBoundingClientRect();
    pop.style.left=Math.max(8, Math.min(r.left, window.innerWidth-pop.offsetWidth-8))+"px";
    pop.style.top=(r.bottom+4)+"px";
  };
  $("colsPop").addEventListener("change",function(e){
    var cb=e.target.closest && e.target.closest("input[type=checkbox]"); if(!cb) return;
    if(cb.checked) addCustomCol(cb.dataset.key, cb.dataset.key); else removeCustomCol(cb.dataset.key);
  });
  document.addEventListener("mousedown",function(e){ // click outside closes the popover
    var pop=$("colsPop");
    if(pop.style.display!=="block") return;
    if(e.target.closest && (e.target.closest("#colsPop")||e.target.closest("#colsBtn"))) return;
    pop.style.display="none";
  });
  (function(){ // drag header borders to resize columns; × removes a custom column (built-in + custom share this)
    var root=document.documentElement, vname=null, vmin=40, startX=0, startW=0;
    $("colHead").addEventListener("mousedown",function(e){
      var h=e.target.closest && e.target.closest(".col-rsz"); if(!h) return;
      vname=h.dataset.var; vmin=parseFloat(h.dataset.min)||40; startX=e.clientX;
      startW=parseFloat(getComputedStyle(root).getPropertyValue(vname))||0;
      document.body.style.cursor="col-resize"; e.preventDefault();
    });
    $("colHead").addEventListener("click",function(e){
      var x=e.target.closest && e.target.closest(".col-x"); if(!x) return;
      removeCustomCol(x.dataset.key);
    });
    window.addEventListener("mousemove",function(e){
      if(!vname) return;
      root.style.setProperty(vname, Math.max(vmin, startW+(e.clientX-startX))+"px");
    });
    window.addEventListener("mouseup",function(){ if(vname){ vname=null; document.body.style.cursor=""; } });
  })();
  buildColHead();
