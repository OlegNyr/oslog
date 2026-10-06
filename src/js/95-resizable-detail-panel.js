  // ---------- resizable detail panel ----------
  (function(){
    var dragging=false, startX, startW;
    var bar=$("dragbar");
    bar.addEventListener("mousedown",function(e){
      if(detail.classList.contains("hidden")) return;
      dragging=true; startX=e.clientX; startW=detail.offsetWidth;
      document.body.style.cursor="col-resize"; e.preventDefault();
    });
    window.addEventListener("mousemove",function(e){
      if(!dragging) return;
      var w=startW+(startX-e.clientX);
      w=Math.max(320,Math.min(window.innerWidth*0.7,w));
      detail.style.flexBasis=w+"px"; renderVirtual(false);
    });
    window.addEventListener("mouseup",function(){ dragging=false; document.body.style.cursor=""; });
  })();
