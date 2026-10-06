  // ---------- virtual list ----------
  function renderVirtual(reset){
    vspacer.style.height = (VIEW.length*ROW_H)+"px";
    if(reset){
      var maxTop=Math.max(0, VIEW.length*ROW_H - vlist.clientHeight);
      if(vlist.scrollTop>maxTop) vlist.scrollTop=maxTop;
    }
    var scrollTop=vlist.scrollTop, h=vlist.clientHeight;
    var start=Math.max(0, Math.floor(scrollTop/ROW_H)-BUF);
    var end=Math.min(VIEW.length, Math.ceil((scrollTop+h)/ROW_H)+BUF);
    vrows.style.transform="translateY("+(start*ROW_H)+"px)";
    var qc=compileQuery();
    var html="";
    for(var k=start;k<end;k++){
      var idx=VIEW[k], r=ALL[idx];
      var cls="row lv-"+r.level+(idx===selected?" sel":"");
      var msg = r.hasErr && r.parsed && r.parsed.error
        ? '<span class="err-tag">['+esc(shortType(r.parsed.error.type))+'] </span>'+hl(r.msg,qc)
        : hl(r.msg, qc);
      var custom="";
      for(var ci=0; ci<customCols.length; ci++){
        var cv=cellValue(r, customCols[ci].path);
        custom+='<div class="c-custom" style="flex:0 0 var('+customCols[ci].var+')" title="'+esc(cv)+'">'+esc(cv)+'</div>';
      }
      html+='<div class="'+cls+'" data-i="'+idx+'">'+
        '<div class="c-seq">'+r.seq+'</div>'+
        '<div class="c-time">'+fmtTime(r)+'</div>'+
        '<div class="c-lvl">'+r.level+'</div>'+
        '<div class="c-logger" title="'+esc(r.logger)+'">'+esc(shortLogger(r.logger))+'</div>'+
        '<div class="c-thread" title="'+esc(r.thread)+'">'+esc(r.thread)+'</div>'+
        custom+
        '<div class="c-msg">'+msg+'</div>'+
      '</div>';
    }
    vrows.innerHTML=html;
  }
  vlist.addEventListener("scroll", function(){ renderVirtual(false); });
  window.addEventListener("resize", function(){ renderVirtual(false); });
  vrows.addEventListener("click", function(e){
    var row=e.target.closest(".row"); if(!row) return;
    selectRow(parseInt(row.dataset.i,10));
  });
