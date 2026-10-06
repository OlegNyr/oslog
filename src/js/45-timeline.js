  // ---------- timeline (trace spans) ----------
  function shortTrace(t){ return t && t.length>10 ? t.slice(0,10)+"…" : (t||""); }
  function tlKeyOf(idx){ // grouping key for a record under the current granularity
    if(tlField==="__idx") return "#"+idx;
    var v=ALL[idx][tlField];
    return (v!=null && v!=="") ? String(v) : "#"+idx;
  }
  function renderTimeline(){
    var box=$("timeline");
    // adaptive granularity: many traces -> per trace; a single trace -> per span; a single span -> per record
    var traces=new Set(), spans=new Set();
    for(var i=0;i<VIEW.length;i++){
      var rr=ALL[VIEW[i]]; if(isNaN(rr.tsMs)) continue;
      if(rr.traceId) traces.add(rr.traceId);
      if(rr.spanId)  spans.add(rr.spanId);
    }
    var unitLabel;
    if(traces.size>1){ tlField="traceId"; unitLabel="трейсов"; }
    else if(spans.size>1){ tlField="spanId"; unitLabel="спанов"; }
    else { tlField="__idx"; unitLabel="записей"; }

    // group the current VIEW by the chosen key -> {min,max,count,err,minIdx}
    var map=new Map();
    for(var j=0;j<VIEW.length;j++){
      var idx=VIEW[j], r=ALL[idx];
      if(isNaN(r.tsMs)) continue;
      var key=tlKeyOf(idx), s=map.get(key);
      if(!s){ map.set(key,{key:key,min:r.tsMs,max:r.tsMs,minIdx:idx,count:1,err:(r.level==="ERROR"||r.hasErr)}); }
      else{
        s.count++;
        if(r.tsMs<s.min){ s.min=r.tsMs; s.minIdx=idx; }
        if(r.tsMs>s.max){ s.max=r.tsMs; }
        if(r.level==="ERROR"||r.hasErr) s.err=true;
      }
    }
    var arr=[]; map.forEach(function(s){ arr.push(s); });
    if(!arr.length){ box.innerHTML='<div class="tl-empty">нет записей с временной меткой в выборке</div>'; tlRange=null; return; }
    var t0=Infinity, t1=-Infinity;
    arr.forEach(function(s){ if(s.min<t0)t0=s.min; if(s.max>t1)t1=s.max; });
    if(t1<=t0) t1=t0+1;
    tlRange={t0:t0,t1:t1};
    var range=t1-t0, gap=range*0.004;
    // greedy lane packing (earliest-start first; a span reuses a lane whose previous span ended)
    arr.sort(function(a,b){ return a.min-b.min; });
    var laneEnds=[];
    arr.forEach(function(s){
      var lane=-1;
      for(var l=0;l<laneEnds.length;l++){ if(s.min>=laneEnds[l]){ lane=l; break; } }
      if(lane<0){ lane=laneEnds.length; laneEnds.push(0); }
      laneEnds[lane]=s.max+gap; s.lane=lane;
    });
    var lanes=laneEnds.length;
    var selKey = selected>=0 ? tlKeyOf(selected) : null;
    var html='<div class="tl-scroll"><div class="tl-lanes" style="height:'+(lanes*LANE_H+4)+'px">';
    html+='<div class="tl-band"></div>'; // background highlight behind the active span
    arr.forEach(function(s){
      var left=(s.min-t0)/range*100, w=(s.max-s.min)/range*100, dur=s.max-s.min;
      var gcls = tlField==="spanId" ? " span" : tlField==="__idx" ? " rec" : "";
      var cls="tl-span"+gcls+(s.err?" err":"")+(s.key===selKey?" sel":"");
      var name = tlField==="traceId" ? ("трейс "+shortTrace(s.key))
               : tlField==="spanId"  ? ("спан "+shortTrace(s.key))
               : ("запись #"+ALL[s.minIdx].seq);
      var title=name+" · "+s.count+" зап. · "+dur+" ms · "+fmtMs(s.min)+"→"+fmtMs(s.max);
      html+='<div class="'+cls+'" data-idx="'+s.minIdx+'" data-key="'+esc(s.key)+'" title="'+esc(title)+'" '+
            'style="left:'+left.toFixed(3)+'%;width:'+w.toFixed(3)+'%;top:'+(s.lane*LANE_H)+'px"></div>';
    });
    html+='</div></div>';
    html+='<div class="tl-axis"><span>'+fmtMs(t0)+'</span><span>'+arr.length+' '+unitLabel+' · '+lanes+' дорожек</span><span>'+fmtMs(t1)+'</span></div>';
    box.innerHTML=html;
    positionBand();
  }
  function positionBand(){ // the highlight band mirrors the currently selected span's left/width
    var box=$("timeline"), band=box.querySelector(".tl-band");
    if(!band) return;
    var sel=box.querySelector(".tl-span.sel");
    if(sel){ band.style.left=sel.style.left; band.style.width=sel.style.width; band.style.display="block"; }
    else band.style.display="none";
  }
  function updateTimelineSel(){
    var selKey = selected>=0 ? tlKeyOf(selected) : null;
    var els=$("timeline").querySelectorAll(".tl-span");
    for(var i=0;i<els.length;i++){ els[i].classList.toggle("sel", selKey!=null && els[i].dataset.key===selKey); }
    positionBand();
  }
  function setIntervalFilter(aMs,bMs){
    // keep exact ms in the filter; snap the minute-precision inputs outward to cover the drag
    filters.tsFrom=aMs; filters.tsTo=bMs;
    $("tFrom").value=toLocalInput(Math.floor(aMs/60000)*60000);
    $("tTo").value=toLocalInput(Math.ceil(bMs/60000)*60000);
    $("tFrom").classList.add("on"); $("tTo").classList.add("on");
    applyFilters();
  }
  (function(){ // drag a region on the timeline -> set the time interval; a click goes to the trace
    var tl=$("timeline"), dragging=false, startX=0, moved=false, sel=null, originLeft=0, w0=0;
    tl.addEventListener("mousedown",function(e){
      if(!tlRange) return;
      var rect=tl.getBoundingClientRect();
      originLeft=rect.left; w0=rect.width;
      startX=Math.max(0,Math.min(w0, e.clientX-originLeft));
      dragging=true; moved=false;
      sel=document.createElement("div"); sel.className="tl-sel";
      sel.style.left=startX+"px"; sel.style.width="0px";
      tl.appendChild(sel);
      e.preventDefault();
    });
    window.addEventListener("mousemove",function(e){
      if(!dragging) return;
      var x=Math.max(0,Math.min(w0, e.clientX-originLeft));
      if(Math.abs(x-startX)>4) moved=true;
      if(sel){ sel.style.left=Math.min(startX,x)+"px"; sel.style.width=Math.abs(x-startX)+"px"; }
    });
    window.addEventListener("mouseup",function(e){
      if(!dragging) return;
      dragging=false;
      var x=Math.max(0,Math.min(w0, e.clientX-originLeft));
      if(sel && sel.parentNode){ sel.parentNode.removeChild(sel); } sel=null;
      if(moved && tlRange){
        var range=tlRange.t1-tlRange.t0;
        setIntervalFilter(tlRange.t0+Math.min(startX,x)/w0*range, tlRange.t0+Math.max(startX,x)/w0*range);
      } else {
        var el=e.target && e.target.closest ? e.target.closest(".tl-span") : null;
        if(el) gotoRecord(parseInt(el.dataset.idx,10));
      }
    });
  })();
  (function(){ // drag the handle below the timeline to resize its height
    var bar=$("tlResize"), tl=$("timeline"), dragging=false, startY=0, startH=0;
    bar.addEventListener("mousedown",function(e){
      dragging=true; startY=e.clientY; startH=tl.offsetHeight;
      document.body.style.cursor="ns-resize"; e.preventDefault();
    });
    window.addEventListener("mousemove",function(e){
      if(!dragging) return;
      var h=Math.max(48, Math.min(window.innerHeight*0.6, startH+(e.clientY-startY)));
      tl.style.height=h+"px";
    });
    window.addEventListener("mouseup",function(){ if(dragging){ dragging=false; document.body.style.cursor=""; } });
  })();
