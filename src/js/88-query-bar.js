  // ---------- OpenSearch query bar (Electron only) ----------
  var QKEY="oslog.query";
  var qs=null;           // persisted query-bar state, see qDefaults()
  var qRunning=false;
  var APP_RE=/^[\w.-]{1,100}$/;

  function qDefaults(){
    return { index:"", apps:[{name:"matrixkc",on:true},{name:"acd",on:false}], rel:15, from:null, to:null, query:"", limit:5000 };
  }
  function qLoad(){
    var d=qDefaults(), s=null;
    try{ s=JSON.parse(localStorage.getItem(QKEY)||"null"); }catch(e){}
    if(s && typeof s==="object"){ for(var k in d){ if(Object.prototype.hasOwnProperty.call(s,k)) d[k]=s[k]; } }
    if(!Array.isArray(d.apps)) d.apps=qDefaults().apps;
    return d;
  }
  function qSave(){ try{ localStorage.setItem(QKEY, JSON.stringify(qs)); }catch(e){} }
  function toLocalInputSec(ms){ return toLocalInput(ms)+":"+pad(new Date(ms).getSeconds()); }
  function fromLocalInput(v){ var t=v? new Date(v).getTime() : NaN; return isNaN(t)? null : t; }

  function qStatus(text, cls){ var el=$("osStatus"); el.textContent=text||""; el.className="q-status"+(cls?" "+cls:""); }

  function renderApps(){
    var box=$("osApps"); box.innerHTML="";
    qs.apps.forEach(function(a, i){
      var b=document.createElement("button");
      b.className="tbtn q-app"+(a.on?" on":""); b.textContent=a.name;
      b.onclick=function(){ a.on=!a.on; qSave(); renderApps(); };
      b.oncontextmenu=function(e){ e.preventDefault(); qs.apps.splice(i,1); qSave(); renderApps(); toast("сервис убран: "+a.name); };
      box.appendChild(b);
    });
    var add=document.createElement("button"); add.className="tbtn"; add.textContent="+"; add.title="Добавить сервис";
    add.onclick=function(){
      var inp=document.createElement("input"); inp.type="text"; inp.className="q-add"; inp.placeholder="сервис"; inp.spellcheck=false;
      box.replaceChild(inp, add); inp.focus();
      var done=false;
      function finish(ok){
        if(done) return; done=true;
        var v=inp.value.trim();
        if(ok && v){
          if(!APP_RE.test(v)) toast("имя сервиса: буквы, цифры, _ . -");
          else if(qs.apps.some(function(a){return a.name===v;})) toast("сервис уже есть");
          else { qs.apps.push({name:v,on:true}); qSave(); }
        }
        renderApps();
      }
      inp.addEventListener("keydown",function(e){
        if(e.key==="Enter"){ e.preventDefault(); e.stopPropagation(); finish(true); }
        else if(e.key==="Escape"){ e.preventDefault(); e.stopPropagation(); finish(false); }
      });
      inp.addEventListener("blur",function(){ finish(true); });
    };
    box.appendChild(add);
  }
  function renderTimes(){
    if(qs.rel){ var now=Date.now(); qs.to=now; qs.from=now-qs.rel*60000; }
    $("osFrom").value=qs.from!=null? toLocalInputSec(qs.from) : "";
    $("osTo").value=qs.to!=null? toLocalInputSec(qs.to) : "";
    Array.prototype.forEach.call($("osQuick").children,function(b){ b.classList.toggle("on", Number(b.dataset.min)===qs.rel); });
  }
  function setRunning(on){
    qRunning=on;
    var b=$("osLoad"); b.textContent=on? "стоп" : "загрузить"; b.classList.toggle("stop", on);
  }
  function fmtN(n){ return Number(n||0).toLocaleString("ru-RU"); }

  function osLoad(){
    if(qRunning){ osApi.stopSearch(); return; }
    renderTimes(); // a quick range (15м…) is relative: it ends now on every load
    var from=fromLocalInput($("osFrom").value), to=fromLocalInput($("osTo").value);
    if(from==null || to==null){ qStatus("задайте интервал","err"); return; }
    if(from>to){ qStatus("«от» позже «до»","err"); return; }
    var apps=qs.apps.filter(function(a){return a.on;}).map(function(a){return a.name;});
    if(!apps.length){ qStatus("выберите сервис","err"); return; }
    var limit=Math.floor(Number($("osLimit").value));
    if(!(limit>=1 && limit<=100000)){ qStatus("лимит: от 1 до 100 000","err"); return; }
    qs.index=$("osIndex").value.trim(); qs.query=$("osQuery").value; qs.limit=limit; qs.from=from; qs.to=to;
    qSave();
    runSearch({ index:qs.index, apps:apps, from:from, to:to, query:qs.query, limit:limit }, apps.join(" + ")+" · "+qs.index, "");
  }

  // Runs osApi.search with progress, «стоп» and the result line; `name` goes
  // to the viewer header, `what` prefixes the status ("трейс …: ").
  function runSearch(req, name, what){
    var t0=Date.now();
    setRunning(true); qStatus(what+"загрузка…");
    osApi.search(req, function(p){
      qStatus(what+(p.cached? "из кэша "+fmtN(p.cached)+" · " : "")+"загружено "+fmtN(p.loaded)+" из "+fmtN(p.total)+"…");
    }).then(function(res){
      // nothing at all (OpenSearch down, cache empty): keep what is on screen
      if(res.reason==="error" && !res.hits.length){ qStatus(what+"ошибка: "+res.error+(res.bypass? "" : " · в кэше за этот интервал ничего нет"),"err"); return; }
      if(req.traceId && !res.hits.length){ qStatus(what+"в OpenSearch не найдено (±1 ч от записи)","warn"); return; }
      var recs=hitsToRecords(res.hits);
      setRecords(recs, name, "записей");
      var distinct={}; recs.forEach(function(r){ distinct[r.k8s.app]=1; });
      if(Object.keys(distinct).length>1 && !customCols.some(function(c){return c.path==="k8s.app";})) addCustomCol("k8s.app","service");
      // total is known only for a straight OpenSearch query (Lucene, trace); through the cache it's null
      var sec=" · "+((Date.now()-t0)/1000).toFixed(1)+" с", n=fmtN(res.hits.length),
          of=res.total!=null? " из "+fmtN(res.total) : "",
          src=req.traceId? " · сервисы: "+Object.keys(distinct).join(", ") : res.bypass? " · мимо кэша" : " (из кэша "+fmtN(res.cached)+", из OpenSearch "+fmtN(res.fetched)+")";
      if(res.reason==="limit") qStatus(what+n+of+" — достигнут лимит"+src+sec,"warn");
      else if(res.reason==="stopped") qStatus(what+"остановлено: "+n+of+src+sec,"warn");
      else if(res.reason==="error") qStatus(what+(res.bypass? n+of : "показано из кэша: "+n)+" · ошибка: "+res.error,"err");
      else qStatus(what+n+(res.hits.length===1?" запись":" записей")+src+sec);
    },function(e){
      qStatus(what+e.message,"err");
    }).then(function(){ setRunning(false); });
  }

  // «весь трейс» in the detail panel: every record of this traceId in all
  // services, ±TRACE_WINDOW around the record (mimo кэша, like Lucene).
  var TRACE_RE=/^[0-9a-fA-F]{8,64}$/, TRACE_WINDOW=3600000;
  function canLoadTrace(r){ return !!osApi && !!r.traceId && TRACE_RE.test(String(r.traceId)) && !isNaN(r.tsMs); }
  function loadTrace(r){
    if(qRunning){ toast("дождитесь окончания загрузки"); return; }
    var id=String(r.traceId), index=$("osIndex").value.trim();
    runSearch({ index:index, apps:[], traceId:id, from:Math.max(0, Math.round(r.tsMs-TRACE_WINDOW)), to:Math.round(r.tsMs+TRACE_WINDOW), limit:100000 },
      "трейс "+id+" · "+index, "трейс "+id.slice(0,8)+"…: ");
  }

  if(osApi){
    qs=qLoad();
    $("qbar").style.display="";
    $("osQuery").value=qs.query||"";
    $("osLimit").value=qs.limit;
    renderApps(); renderTimes();
    osApi.getSettings().then(function(s){ $("osIndex").value=qs.index||s.index||""; },function(){});
    $("osQuick").addEventListener("click",function(e){
      var b=e.target.closest && e.target.closest("button[data-min]"); if(!b) return;
      qs.rel=Number(b.dataset.min); renderTimes(); osLoad();
    });
    ["osFrom","osTo"].forEach(function(id){
      $(id).addEventListener("change",function(){
        qs.rel=null; qs.from=fromLocalInput($("osFrom").value); qs.to=fromLocalInput($("osTo").value);
        renderTimes(); qSave();
      });
    });
    $("osLoad").onclick=osLoad;
    $("qbar").addEventListener("keydown",function(e){
      if(e.key==="Enter" && e.target.tagName==="INPUT"){ e.preventDefault(); if(!qRunning) osLoad(); }
    });
    drop.querySelector("h1").textContent="Загрузите логи из OpenSearch";
    drop.querySelector("p").textContent="Выберите сервисы и интервал в строке сверху и нажмите «загрузить». Можно и по-старому: перетащить сюда ndjson-файл или вставить его.";
  }
