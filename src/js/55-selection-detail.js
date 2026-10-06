  // ---------- selection / detail ----------
  function selectRow(idx){
    selected=idx; renderVirtual(false); updateTimelineSel(); showDetail(ALL[idx]);
  }
  function showDetail(r){
    detail.classList.remove("hidden");
    var o=r.parsed||{};
    $("dLevel").textContent=r.level; $("dLevel").className="lvl-badge badge-"+r.level;
    $("dLogger").textContent=shortLogger(r.logger);
    $("dSeq").textContent="#"+r.seq;
    var b=$("dBody"); b.innerHTML="";

    // time
    var t=document.createElement("div"); t.className="d-time";
    t.innerHTML = fmtFull(r) + (r.ts? ' <small>'+esc(r.ts)+'</small>':'');
    b.appendChild(t);

    // logger (clickable filter)
    if(r.logger){
      var lg=document.createElement("div"); lg.className="mini"; lg.style.margin="2px 0 4px";
      lg.innerHTML='<span class="v click" data-act="logger">'+esc(r.logger)+'</span>';
      b.appendChild(lg);
    }

    // exchange (logbook request <-> response pair) — shown above the message
    var xc = buildExchange(r);
    if(xc) b.appendChild(xc);

    // message (pretty-print if it is itself JSON)
    var m=document.createElement("div"); m.className="d-msg";
    var pj=tryJson(r.msg);
    m.textContent = pj!==null ? pj : (r.msg||"(empty message)");
    b.appendChild(m);

    // trace section
    var traceRows=[];
    if(o.traceId) traceRows.push(["traceId", o.traceId, "trace", "traceId"]);
    if(o.spanId) traceRows.push(["spanId", o.spanId, null, "spanId"]);
    if(o.correlation) traceRows.push(["correlation", o.correlation, null, "correlation"]);
    if(o.origin) traceRows.push(["origin", o.origin, null, "origin"]);
    if(o.operation) traceRows.push(["operation", o.operation, null, "operation"]);
    if(o.duration!==undefined) traceRows.push(["duration", o.duration+" ms", null, "duration"]);
    if(traceRows.length) b.appendChild(kvSection("trace · context", traceRows, r));

    // header / url / request context — resolve each field by the first existing path (flat MDC key or nested)
    var hdr=[];
    function pushField(label, paths){ var f=firstField(r, paths); if(f) hdr.push([label, f.val, null, f.path]); }
    pushField("url", ["url"]);
    pushField("method", ["method"]);
    pushField("client.ip", ["client.ip","header.client.ip"]);
    pushField("matrix.id", ["matrix.id","header.matrix.id"]);
    pushField("header.key", ["header.key"]);
    pushField("traceparent", ["traceparent","header.traceparent"]);
    pushField("remote", ["remote"]);
    pushField("protocolVersion", ["protocolVersion"]);
    if(hdr.length) b.appendChild(kvSection("request", hdr, r));

    // process / thread
    var proc=[];
    if(r.thread) proc.push(["thread", r.thread, "thread", "process.thread.name"]);
    if(o.process && o.process.pid!==undefined) proc.push(["pid", o.process.pid, null, "process.pid"]);
    if(o.servicesc && o.servicesc.name) proc.push(["service", o.servicesc.name, null, "servicesc.name"]);
    if(o.tags && o.tags.length) proc.push(["tags", o.tags.join(", "), null]); // array -> substring fallback
    if(proc.length) b.appendChild(kvSection("process", proc, r));

    // error / stack
    if(o.error){
      var h=document.createElement("div"); h.className="sect-h";
      h.innerHTML = o.error.stack_trace ? 'error<button class="copy" data-act="copystack">copy</button>' : 'error';
      b.appendChild(h);
      var ek=kv([["type",o.error.type||"",null,"error.type"],["message",o.error.message||"",null,"error.message"]], r);
      b.appendChild(ek);
      if(o.error.stack_trace){
        var st=document.createElement("div"); st.className="stack";
        st.innerHTML = formatStack(o.error.stack_trace);
        b.appendChild(st);
      }
    }

    // raw json
    var rh=document.createElement("div"); rh.className="sect-h";
    rh.innerHTML='raw<button class="copy" data-act="copyraw">copy</button>';
    b.appendChild(rh);
    var raw=document.createElement("div"); raw.className="raw";
    raw.innerHTML = r.parsed? jsonHighlight(JSON.stringify(r.parsed,null,2)) : esc(r.raw);
    b.appendChild(raw);

    // wire clickable actions
    b.querySelectorAll("[data-act]").forEach(function(el){
      el.onclick=function(){
        var act=el.dataset.act;
        if(act==="trace"){ filters.trace=o.traceId; applyFilters(); }
        else if(act==="logger"){ filters.logger=r.logger; filters.loggerNeg=false; applyFilters(); }
        else if(act==="thread"){ filters.thread=r.thread; applyFilters(); }
        else if(act==="copystack"){ copy(o.error.stack_trace); }
        else if(act==="copyraw"){ copy(r.raw); }
      };
    });
  }
