  // ---------- chips ----------
  function renderChips(){
    var bar=$("chipBar"), box=$("chips"); box.innerHTML="";
    var any=false;
    function chip(k,v,neg,onClear){
      any=true;
      var c=document.createElement("span"); c.className="chip"+(neg?" neg":"");
      c.innerHTML='<span class="k">'+k+'</span><span class="v" title="'+esc(v)+'">'+esc(v)+'</span>';
      var x=document.createElement("button"); x.textContent="×"; x.onclick=onClear; c.appendChild(x);
      box.appendChild(c);
    }
    if(filters.tsFrom!=null || filters.tsTo!=null){
      var from = filters.tsFrom!=null? fmtMs(filters.tsFrom) : "…";
      var to   = filters.tsTo!=null?   fmtMs(filters.tsTo)   : "…";
      chip("интервал", from+" → "+to, false, clearTimeFilter);
    }
    if(filters.correlation) chip("обмен", filters.correlation, false, function(){filters.correlation=null;applyFilters();});
    if(filters.trace) chip("trace", filters.trace, false, function(){filters.trace=null;applyFilters();});
    if(filters.logger) chip(filters.loggerNeg?"logger ≠":"logger", shortLogger(filters.logger), filters.loggerNeg, function(){filters.logger=null;applyFilters();});
    if(filters.thread) chip("thread", filters.thread, false, function(){filters.thread=null;applyFilters();});
    filters.fields.forEach(function(f){
      any=true;
      var neg=(f.op==="ne"||f.op==="empty");
      var opSym=f.op==="ne"?" ≠":f.op==="eq"?" =":"";
      var valTxt=f.op==="empty"?"(пусто)":f.op==="nonempty"?"(непусто)":f.val;
      var c=document.createElement("span"); c.className="chip clickable"+(neg?" neg":"");
      c.title="клик — сменить условие: = / ≠ / пусто / непусто";
      c.innerHTML='<span class="k">'+esc(f.label)+opSym+'</span><span class="v" title="'+esc(valTxt)+'">'+esc(valTxt)+'</span>';
      c.onclick=(function(ff){ return function(){ cycleFieldOp(ff); }; })(f);
      var x=document.createElement("button"); x.textContent="×";
      x.onclick=(function(ff){ return function(e){ e.stopPropagation(); filters.fields=filters.fields.filter(function(z){return z!==ff;}); applyFilters(); }; })(f);
      c.appendChild(x);
      box.appendChild(c);
    });
    bar.style.display = any? "flex":"none";
  }
