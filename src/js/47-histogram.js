  // ---------- density histogram (OpenSearch date_histogram over the query range) ----------
  // Shown for OpenSearch queries only (not files / CSV / a whole trace). Bars
  // (square-root height): ERROR at the bottom, then WARN, then the rest; the part of the range the
  // loaded records don't cover is dimmed. Drag across it to load that range.
  var HIST={ state:"hidden", seq:0, data:null, err:"", loaded:null };
  var HIST_W=1000, HIST_H=34;

  function histHide(){ HIST.seq++; HIST.state="hidden"; HIST.data=null; HIST.loaded=null; renderHist(); }
  // req: the search request (index, apps, from, to, query)
  function histLoad(req){
    if(!osApi) return;
    var my=++HIST.seq;
    HIST.state="loading"; HIST.loaded=null; renderHist();
    osApi.histogram({ index:req.index, apps:req.apps, from:req.from, to:req.to, query:req.query }).then(function(d){
      if(my!==HIST.seq) return;
      HIST.state="ok"; HIST.data=d; renderHist();
    },function(e){
      if(my!==HIST.seq) return;
      HIST.state="err"; HIST.err=e.message; HIST.data=null; renderHist();
    });
  }
  // ingest-time span of the loaded hits (same clock as the histogram)
  function histSetLoaded(hits){
    var lo=Infinity, hi=-Infinity;
    hits.forEach(function(h){ if(!isNaN(h.ts)){ if(h.ts<lo) lo=h.ts; if(h.ts>hi) hi=h.ts; } });
    HIST.loaded = lo<=hi? {lo:lo, hi:hi, n:hits.length} : {lo:NaN, hi:NaN, n:0};
    renderHist();
  }
  function histTime(ms, span){
    var d=new Date(ms), hm=pad(d.getHours())+":"+pad(d.getMinutes());
    if(span>2*86400000) return pad(d.getDate())+"."+pad(d.getMonth()+1)+" "+hm;
    return span>3600000*6? hm : hm+":"+pad(d.getSeconds());
  }
  function histStepText(ms){
    return ms>=86400000? (ms/86400000)+" д" : ms>=3600000? (ms/3600000)+" ч" : ms>=60000? (ms/60000)+" мин" : (ms/1000)+" с";
  }
  function histSummary(){
    var d=HIST.data, s="в OpenSearch: "+fmtN(d.total);
    if(HIST.loaded) s+=" · загружено: "+fmtN(HIST.loaded.n);
    return s+" · шаг "+histStepText(d.step);
  }
  function renderHist(){
    var box=$("hist");
    if(HIST.state==="hidden"){ box.style.display="none"; box.innerHTML=""; return; }
    box.style.display="";
    if(HIST.state!=="ok"){
      box.innerHTML='<div class="hist-msg">'+esc(HIST.state==="err"? "гистограмма: "+HIST.err : "гистограмма…")+'</div>';
      return;
    }
    var d=HIST.data, span=Math.max(1, d.to-d.from), max=1;
    d.buckets.forEach(function(b){ if(b.n>max) max=b.n; });
    function x(t){ return Math.max(0, Math.min(HIST_W, (t-d.from)/span*HIST_W)); }
    var bw=Math.max(0.5, d.step/span*HIST_W - 0.6), svg="";
    d.buckets.forEach(function(b){
      if(!b.n) return;
      var x0=x(b.t), w=Math.min(bw, HIST_W-x0); if(w<=0) return;
      // square-root scale: one burst doesn't flatten everything else; ERROR / WARN keep their share of the bar
      var h=Math.sqrt(b.n/max)*HIST_H, he=h*b.err/b.n, hw=h*b.warn/b.n, y=HIST_H;
      if(he>0){ y-=he; svg+='<rect class="h-err" x="'+x0.toFixed(2)+'" y="'+y.toFixed(2)+'" width="'+w.toFixed(2)+'" height="'+he.toFixed(2)+'"/>'; }
      if(hw>0){ y-=hw; svg+='<rect class="h-warn" x="'+x0.toFixed(2)+'" y="'+y.toFixed(2)+'" width="'+w.toFixed(2)+'" height="'+hw.toFixed(2)+'"/>'; }
      var rest=h-he-hw; if(rest>0) svg+='<rect class="h-n" x="'+x0.toFixed(2)+'" y="'+(y-rest).toFixed(2)+'" width="'+w.toFixed(2)+'" height="'+rest.toFixed(2)+'"/>';
    });
    var L=HIST.loaded;
    if(L && L.n && d.total>L.n){ // dim what isn't loaded
      var a=x(L.lo), z=x(L.hi);
      if(a>0) svg+='<rect class="h-dim" x="0" y="0" width="'+a.toFixed(2)+'" height="'+HIST_H+'"/>';
      if(z<HIST_W) svg+='<rect class="h-dim" x="'+z.toFixed(2)+'" y="0" width="'+(HIST_W-z).toFixed(2)+'" height="'+HIST_H+'"/>';
    }
    box.innerHTML=
      '<svg class="hist-svg" viewBox="0 0 '+HIST_W+' '+HIST_H+'" preserveAspectRatio="none">'+svg+'</svg>'+
      '<div class="hist-sel" style="display:none"></div>'+
      '<div class="hist-axis"><span>'+esc(histTime(d.from,span))+'</span><span class="hist-mid">'+esc(histSummary())+'</span><span>'+esc(histTime(d.to,span))+'</span></div>';
  }
  (function(){ // hover: numbers of the bucket; drag: load that range
    var box=$("hist"), drag=null;
    function plot(){ var s=box.querySelector(".hist-svg"); return (s||box).getBoundingClientRect(); }
    function tAt(clientX){
      var r=plot(), d=HIST.data;
      return d.from + Math.max(0, Math.min(1, (clientX-r.left)/r.width))*(d.to-d.from);
    }
    box.addEventListener("mousemove",function(e){
      if(HIST.state!=="ok") return;
      var d=HIST.data, mid=box.querySelector(".hist-mid"); if(!mid) return;
      if(drag){
        var r=plot(), a=Math.min(drag.x, e.clientX)-r.left, b=Math.max(drag.x, e.clientX)-r.left, sel=box.querySelector(".hist-sel");
        sel.style.display=""; sel.style.left=Math.max(0,a)+"px"; sel.style.width=Math.max(1, Math.min(r.width,b)-Math.max(0,a))+"px";
        var t0=tAt(Math.min(drag.x,e.clientX)), t1=tAt(Math.max(drag.x,e.clientX)), span=d.to-d.from;
        mid.textContent="загрузить "+histTime(t0,span)+" → "+histTime(t1,span);
        return;
      }
      var t=tAt(e.clientX), b=null;
      for(var i=0;i<d.buckets.length;i++){ if(d.buckets[i].t<=t) b=d.buckets[i]; else break; }
      if(!b){ mid.textContent=histSummary(); return; }
      mid.textContent=histTime(b.t, d.to-d.from)+" · "+fmtN(b.n)+" записей"+(b.err? " · "+fmtN(b.err)+" ERROR" : "")+(b.warn? " · "+fmtN(b.warn)+" WARN" : "");
    });
    box.addEventListener("mouseleave",function(){
      if(drag || HIST.state!=="ok") return;
      var mid=box.querySelector(".hist-mid"); if(mid) mid.textContent=histSummary();
    });
    box.addEventListener("mousedown",function(e){
      if(HIST.state!=="ok" || e.button!==0) return;
      drag={x:e.clientX}; e.preventDefault();
    });
    window.addEventListener("mouseup",function(e){
      if(!drag) return;
      var x0=drag.x; drag=null;
      var sel=box.querySelector(".hist-sel"); if(sel) sel.style.display="none";
      if(Math.abs(e.clientX-x0)<4 || HIST.state!=="ok"){ var mid=box.querySelector(".hist-mid"); if(mid) mid.textContent=histSummary(); return; }
      histPickRange(Math.round(tAt(Math.min(x0,e.clientX))), Math.round(tAt(Math.max(x0,e.clientX))));
    });
  })();
