  // ---------- file open / drag / paste ----------
  $("openBtn").onclick=function(){$("fileInput").click();};
  $("dropOpen").onclick=function(){$("fileInput").click();};
  $("fileInput").onchange=function(e){ if(e.target.files.length) loadFiles(e.target.files); };
  ["dragenter","dragover"].forEach(function(ev){
    window.addEventListener(ev,function(e){e.preventDefault(); if(drop.style.display!=="none") drop.classList.add("dragover");});
  });
  ["dragleave","drop"].forEach(function(ev){
    window.addEventListener(ev,function(e){e.preventDefault(); drop.classList.remove("dragover");});
  });
  window.addEventListener("drop",function(e){
    e.preventDefault();
    if(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) loadFiles(e.dataTransfer.files);
  });
  window.addEventListener("paste",function(e){
    // pasting into a field (search, settings, password) is never a log load
    var tg=e.target&&e.target.tagName; if(tg==="INPUT"||tg==="TEXTAREA") return;
    var t=(e.clipboardData||window.clipboardData).getData("text");
    if(t && t.indexOf("{")>=0 && t.length>40){ loadText(t,"pasted"); }
  });
