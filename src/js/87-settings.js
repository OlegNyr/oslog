  // ---------- settings dialog (Electron only: needs window.osApi) ----------
  var osApi = window.osApi || null;
  var setBack = $("setBack");
  var setHasPass = false;   // a password is stored in main (its value never comes here)
  var setClearPass = false; // "удалить" pressed: clear it on save

  function setMsg(id, text, cls){ var el=$(id); el.textContent=text||""; el.className="m-res"+(cls?" "+cls:"")+(id==="sErr"?" m-err":""); }
  function passPlaceholder(){
    $("sPass").placeholder = setClearPass? "будет удалён при сохранении" : setHasPass? "сохранён — оставьте пустым" : "";
    $("sPassClear").style.display = setHasPass && !setClearPass? "" : "none";
  }
  function fillSettings(s){
    $("sUrl").value=s.url||""; $("sUser").value=s.username||""; $("sPass").value="";
    $("sCa").value=s.caPath||""; $("sInsecure").checked=!!s.insecure; $("sIndex").value=s.index||"";
    $("sDays").value=s.cacheDays; $("sSize").value=Math.round(s.cacheMaxMb/1024*10)/10;
    setHasPass=!!s.hasPassword; setClearPass=false; passPlaceholder();
    var w = s.passwordStorage==="weak"? "нет системного хранилища ключей (keyring) — пароль хранится без надёжного шифрования"
          : s.passwordStorage==="none"? "шифрование недоступно — пароль не сохранится" : "";
    $("sPassWarn").textContent=w; $("sPassWarn").style.display=w?"":"none";
  }
  // the form as a saveSettings/testConnection patch; empty password = keep the stored one
  function formPatch(){
    var p={
      url:$("sUrl").value, username:$("sUser").value, caPath:$("sCa").value,
      insecure:$("sInsecure").checked, index:$("sIndex").value,
      cacheDays:Number($("sDays").value), cacheMaxMb:Math.round(Number($("sSize").value)*1024)
    };
    if($("sPass").value) p.password=$("sPass").value;
    else if(setClearPass) p.clearPassword=true;
    return p;
  }
  function openSettings(){
    if(!osApi) return;
    osApi.getSettings().then(function(s){
      fillSettings(s); setMsg("sErr"); setMsg("sTestRes"); showCacheStats();
      setBack.style.display="";
      $(s.url? "sPass" : "sUrl").focus();
    },function(e){ toast("настройки: "+e.message); });
  }
  function fmtBytes(b){ return b>=1073741824? (b/1073741824).toFixed(1)+" ГБ" : (b/1048576).toFixed(1)+" МБ"; }
  function showCacheStats(){
    setMsg("sCacheRes","…");
    osApi.cacheStats().then(function(c){
      if(!c.hits){ setMsg("sCacheRes","кэш пуст"); return; }
      setMsg("sCacheRes", c.hits.toLocaleString("ru-RU")+" записей · "+fmtBytes(c.bytes)+" · "+
        fmtFull({tsMs:c.oldest})+" → "+fmtFull({tsMs:c.newest}));
    },function(e){ setMsg("sCacheRes",e.message,"bad"); });
  }
  function closeSettings(){ setBack.style.display="none"; $("sPass").value=""; }
  function settingsOpen(){ return setBack.style.display!=="none"; }

  if(osApi){
    $("settingsBtn").style.display="";
    $("settingsBtn").onclick=openSettings;
    $("setClose").onclick=closeSettings;
    $("sCancel").onclick=closeSettings;
    setBack.addEventListener("mousedown",function(e){ if(e.target===setBack) closeSettings(); });
    $("sPassClear").onclick=function(){ setClearPass=true; $("sPass").value=""; passPlaceholder(); };
    $("sClearCache").onclick=function(){
      var b=$("sClearCache"); b.disabled=true;
      osApi.clearCache().then(function(r){ setMsg("sCacheRes","удалено записей: "+r.removed.toLocaleString("ru-RU"),"ok"); },
        function(e){ setMsg("sCacheRes",e.message,"bad"); }).then(function(){ b.disabled=false; });
    };
    $("sTest").onclick=function(){
      var b=$("sTest"); b.disabled=true; setMsg("sTestRes","проверяю…");
      osApi.testConnection(formPatch()).then(function(r){
        setMsg("sTestRes","есть соединение · "+r.total.toLocaleString()+" записей за 15 мин · "+r.ms+" мс"+
          (r.shards&&r.shards.failed? " · сбойных шардов: "+r.shards.failed : ""),"ok");
      },function(e){ setMsg("sTestRes",e.message,"bad"); }).then(function(){ b.disabled=false; });
    };
    $("sSave").onclick=function(){
      var b=$("sSave"); b.disabled=true; setMsg("sErr");
      osApi.saveSettings(formPatch()).then(function(){ closeSettings(); toast("настройки сохранены"); },
        function(e){ setMsg("sErr",e.message); }).then(function(){ b.disabled=false; });
    };
    // while the dialog is open, keys belong to it: Esc closes, Enter saves,
    // and the viewer's shortcuts (j/k, /, Esc-clears-filter) don't fire
    window.addEventListener("keydown",function(e){
      if(!settingsOpen()) return;
      e.stopPropagation();
      if(e.key==="Escape"){ e.preventDefault(); closeSettings(); }
      else if(e.key==="Enter" && e.target.tagName==="INPUT" && e.target.type!=="checkbox"){ e.preventDefault(); $("sSave").click(); }
    },true);
    // first run: nothing configured yet
    osApi.getSettings().then(function(s){ if(!s.url) openSettings(); },function(){});
  }
