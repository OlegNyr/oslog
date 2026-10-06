  // ---------- exchange (logbook request <-> response) ----------
  function nearestTo(list, r){
    var best=list[0], bd=Infinity;
    for(var i=0;i<list.length;i++){
      var d=Math.abs((ALL[list[i]].tsMs||0)-(r.tsMs||0));
      if(d<bd){ bd=d; best=list[i]; }
    }
    return best;
  }
  function gotoRecord(idx){
    selectRow(idx);
    var k=VIEW.indexOf(idx);
    if(k>=0){ centerView(k); vlist.focus(); } // focus the entry (span start) in the list
    else toast("строка скрыта фильтром");
  }
  function centerView(k){
    var maxTop=Math.max(0, VIEW.length*ROW_H - vlist.clientHeight);
    vlist.scrollTop=Math.max(0, Math.min(maxTop, k*ROW_H - (vlist.clientHeight-ROW_H)/2));
    renderVirtual(false);
  }
  function buildExchange(r){
    if(!r.correlation) return null;
    var idxs = corrIndex.get(r.correlation) || [];
    if(!idxs.length) return null;
    var reqs=[], resps=[];
    idxs.forEach(function(i){
      var op=String(ALL[i].operation||"").toLowerCase();
      if(op==="request") reqs.push(i);
      else if(op==="response") resps.push(i);
    });
    if(!reqs.length && !resps.length) return null; // correlation present but no pairable sides

    var reqIdx  = reqs.length  ? nearestTo(reqs, r)  : -1;
    var respIdx = resps.length ? nearestTo(resps, r) : -1;
    var reqRec  = reqIdx>=0  ? ALL[reqIdx]  : null;
    var respRec = respIdx>=0 ? ALL[respIdx] : null;

    // direction is read from the request side's origin (the reliable signal — response.origin
    // is not consistently the inverse in real logs). Unknown when the request side is missing.
    var incoming; // undefined -> unknown
    if(reqRec) incoming = String(reqRec.origin||"").toLowerCase()==="incoming";

    var wrap=document.createElement("div"); wrap.className="xchg";

    // head: direction + latency + isolate
    var head=document.createElement("div"); head.className="xchg-head";
    var dir=document.createElement("span"); dir.className="xchg-dir"+(incoming===false?" out":"");
    dir.textContent = incoming===undefined ? "Обмен" : (incoming?"Входящий":"Исходящий");
    head.appendChild(dir);
    if(respRec && respRec.duration!=null && respRec.duration!==""){
      var lat=document.createElement("span"); lat.className="xchg-lat";
      lat.textContent=respRec.duration+" ms"; head.appendChild(lat);
    }
    var iso=document.createElement("button"); iso.className="xchg-iso";
    iso.textContent="изолировать"; iso.title="Показать в списке только записи этого обмена";
    iso.onclick=function(){ filters.correlation=r.correlation; applyFilters(); };
    head.appendChild(iso);
    wrap.appendChild(head);

    // cards
    var cards=document.createElement("div"); cards.className="xchg-cards";
    function bodyText(rec){
      var t = rec.msg!=null ? String(rec.msg) : "";
      if(!t.length) return "(пусто)";
      var pj=tryJson(t); return pj!==null ? pj : t;
    }
    function meta(c,k,v){
      var d=document.createElement("div"); d.className="xchg-meta";
      d.innerHTML='<span class="k">'+esc(k)+': </span>'+esc(v); c.appendChild(d);
    }
    function dataCard(label, i, isResp){
      var rec=ALL[i];
      var c=document.createElement("div"); c.className="xchg-card"+(i===selected?" cur":"");
      var ttl=document.createElement("div"); ttl.className="ttl";
      ttl.textContent=label+(i===selected?" · текущая":""); c.appendChild(ttl);
      if(rec.url) meta(c,"url",rec.url);
      if(rec.parsed && rec.parsed.header && rec.parsed.header.key) meta(c,"key",rec.parsed.header.key);
      if(isResp && rec.duration!=null && rec.duration!=="") meta(c,"duration",rec.duration+" ms");
      var body=document.createElement("div"); body.className="xchg-bodytext";
      body.textContent=bodyText(rec); c.appendChild(body);
      return c;
    }
    function missingCard(label){
      var c=document.createElement("div"); c.className="xchg-card";
      var ttl=document.createElement("div"); ttl.className="ttl"; ttl.textContent=label; c.appendChild(ttl);
      var note=document.createElement("div"); note.className="xchg-note";
      note.textContent="вторая сторона обмена не найдена в загруженном логе"; c.appendChild(note);
      return c;
    }
    if(reqs.length) reqs.forEach(function(i,n){ cards.appendChild(dataCard(reqs.length>1?("REQUEST #"+(n+1)):"REQUEST", i, false)); });
    else cards.appendChild(missingCard("REQUEST"));
    if(resps.length) resps.forEach(function(i,n){ cards.appendChild(dataCard(resps.length>1?("RESPONSE #"+(n+1)):"RESPONSE", i, true)); });
    else cards.appendChild(missingCard("RESPONSE"));
    wrap.appendChild(cards);

    // nav buttons; the side the user is already on is disabled
    var curOp=String(r.operation||"").toLowerCase();
    var nav=document.createElement("div"); nav.className="xchg-nav";
    var bReq=document.createElement("button"); bReq.textContent="→ Запрос";
    if(reqIdx<0){ bReq.disabled=true; bReq.title="нет записи запроса в логе"; }
    else if(curOp==="request"){ bReq.disabled=true; }
    else bReq.onclick=function(){ gotoRecord(reqIdx); };
    var bResp=document.createElement("button"); bResp.textContent="→ Ответ";
    if(respIdx<0){ bResp.disabled=true; bResp.title="нет записи ответа в логе"; }
    else if(curOp==="response"){ bResp.disabled=true; }
    else bResp.onclick=function(){ gotoRecord(respIdx); };
    nav.appendChild(bReq); nav.appendChild(bResp);
    wrap.appendChild(nav);

    return wrap;
  }

  function kvSection(title, rows, rec){
    var frag=document.createDocumentFragment();
    var h=document.createElement("div"); h.className="sect-h"; h.textContent=title; frag.appendChild(h);
    frag.appendChild(kv(rows, rec));
    var wrap=document.createElement("div"); wrap.appendChild(frag); return wrap;
  }
  function kv(rows, rec){
    var g=document.createElement("div"); g.className="kv";
    rows.forEach(function(row){
      var k=document.createElement("div"); k.className="k"; k.textContent=row[0];
      var v=document.createElement("div"); v.className="v"+(row[2]?" click":""); v.textContent=row[1];
      if(row[2]) v.dataset.act=row[2];
      if(row[1]!=null && row[1]!==""){
        var fb=document.createElement("button"); fb.className="kv-f"; fb.type="button";
        fb.textContent="⊕"; fb.title="Фильтр по этому полю = значение";
        fb.onclick=(function(label,path,val){ return function(e){
          e.stopPropagation();
          if(path) addFieldFilter(path, label, rec); else addToQuery(val); // tags etc. have no path -> substring
        }; })(row[0], row[3], row[1]);
        v.appendChild(fb);
      }
      if(row[3]){ // field has a known path -> can be shown as a list column
        var cb=document.createElement("button"); cb.className="kv-f"; cb.type="button";
        cb.textContent="▦"; cb.title="Вывести поле в список как колонку";
        cb.onclick=(function(label,path){ return function(e){ e.stopPropagation(); addCustomCol(path, label); }; })(row[0], row[3]);
        v.appendChild(cb);
      }
      g.appendChild(k); g.appendChild(v);
    });
    return g;
  }
  function fieldValue(r, path){ // value of a JSON field; tries a flat key first (MDC dotted keys), then nested
    var o=r.parsed; if(!o||typeof o!=="object") return undefined;
    if(Object.prototype.hasOwnProperty.call(o, path)) return o[path];
    return pick(o, [path]);
  }
  function firstField(r, paths){ // first present scalar among candidate paths -> {val, path}
    for(var i=0;i<paths.length;i++){
      var v=fieldValue(r, paths[i]);
      if(v!==undefined && v!==null && v!=="" && typeof v!=="object") return {val:String(v), path:paths[i]};
    }
    return null;
  }
  function addFieldFilter(path, label, rec){
    var v=fieldValue(rec, path);
    if(v===undefined || v===null || v==="" || typeof v==="object"){ toast("нет значения для фильтра"); return; }
    v=String(v);
    if(filters.fields.some(function(f){return f.path===path && f.val===v && f.op==="eq";})) return; // already active
    filters.fields.push({path:path, label:label||path, val:v, op:"eq"});
    applyFilters();
    toast((label||path)+" = "+(v.length>30? v.slice(0,30)+"…":v));
  }
  function cycleFieldOp(f){ // = -> ≠ -> пусто -> непусто -> =
    var order=["eq","ne","empty","nonempty"];
    f.op=order[(order.indexOf(f.op)+1)%order.length];
    applyFilters();
  }
  function addToQuery(val){
    val=String(val);
    $("q").value=val; filters.q=val;
    if(filters.regex){ filters.regex=false; $("reToggle").classList.remove("on"); } // value is literal, not a pattern
    applyFilters();
    toast("поиск: "+(val.length>40? val.slice(0,40)+"…" : val));
  }
  $("dClose").onclick=function(){ detail.classList.add("hidden"); selected=-1; renderVirtual(false); updateTimelineSel(); };
