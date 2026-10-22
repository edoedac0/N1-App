(function () {
  "use strict";

  var remoteUrl = window.N1_REMOTE_CHANNELS_URL || "";
  var channels = [];
  var channelStatus = "loading";
  var screen = "home";
  var homeFocus = 0;
  var channelFocus = 0;
  var themeFocus = false;
  var darkTheme = false;
  var currentIndex = -1;
  var loadId = 0;
  var channelLoadId = 0;
  var hideTimer = null;
  var errorTimer = null;
  var paused = false;
  var playbackReady = false;
  var usingAvplay = !!(window.webapis && webapis.avplay);
  var avplayOpen = false;
  var browserVideoActive = false;
  var browserHls = null;
  var hlsScriptLoading = false;
  var hlsScriptCallbacks = [];
  var app = document.getElementById("app");
  var screens = {
    home: document.getElementById("home"),
    channels: document.getElementById("channels"),
    player: document.getElementById("player")
  };
  var watchButton = document.getElementById("watchButton");
  var n1Button = document.getElementById("n1Button");
  var channelList = document.getElementById("channelList");
  var channelButtons = [];
  var fallbackVideo = document.getElementById("fallbackVideo");
  var pauseButton = document.getElementById("pauseButton");
  var playerState = document.getElementById("playerState");
  var retryButton = document.getElementById("retryButton");
  var themeToggle = document.getElementById("themeToggle");
  var controlledKeys = {37:1,38:1,39:1,40:1,13:1,10009:1,8:1,27:1,403:1,427:1,428:1,49:1,50:1,51:1,32:1,10252:1,19:1,415:1,10232:1,10233:1};
  var switchKeys = {37:1,38:1,39:1,40:1,427:1,428:1,10232:1,10233:1};

  function applyTheme() {
    document.documentElement.setAttribute("data-theme", darkTheme ? "dark" : "light");
    themeToggle.setAttribute("aria-label", darkTheme ? "Uključi svijetli način" : "Uključi tamni način");
  }
  function toggleTheme() {
    darkTheme = !darkTheme;
    applyTheme();
    try { window.localStorage.setItem("n1-theme", darkTheme ? "dark" : "light"); } catch (ignore) {}
  }
  function renderThemeFocus() { themeToggle.className = "theme-toggle" + (themeFocus ? " focused" : ""); }

  function validChannels(data) {
    if (!data || !Array.isArray(data.channels)) { return false; }
    if (data.channels.length !== 3) { return false; }
    var expected = ["ba", "hr", "rs"];
    for (var i = 0; i < 3; i++) {
      var item = data.channels[i];
      if (!item || item.id !== expected[i] || typeof item.name !== "string" || typeof item.shortName !== "string" || typeof item.url !== "string" || !/^https:\/\//.test(item.url)) { return false; }
    }
    return true;
  }

  function fetchChannels(done) {
    if (!remoteUrl || !/^https:\/\//.test(remoteUrl)) {
      done(new Error("Postavite GitHub raw URL u settings.js."));
      return;
    }
    var request = new XMLHttpRequest();
    request.open("GET", remoteUrl + (remoteUrl.indexOf("?") === -1 ? "?" : "&") + "t=" + Date.now(), true);
    request.timeout = 10000;
    request.onreadystatechange = function () {
      if (request.readyState !== 4) { return; }
      if (request.status < 200 || request.status >= 300) { done(new Error("GitHub izvor nije dostupan (HTTP " + request.status + ").")); return; }
      try {
        var data = JSON.parse(request.responseText);
        if (!validChannels(data)) { throw new Error("Datoteka channels.json nema očekivani format."); }
        done(null, data.channels);
      } catch (err) { done(err); }
    };
    request.onerror = function () { done(new Error("Provjerite internetsku vezu i GitHub URL.")); };
    request.ontimeout = function () { done(new Error("GitHub izvor nije odgovorio na vrijeme.")); };
    request.send();
  }

  function setScreen(next) {
    if (screen !== next) {
      screens[screen].className = "screen " + screen;
      screens[next].className = "screen " + next + " active";
    }
    screen = next;
    app.className = "app" + (next === "player" ? " playing" : "");
    document.documentElement.style.background = next === "player" ? "transparent" : "";
    document.body.style.background = next === "player" ? "transparent" : "";
  }

  function focusHome() {
    watchButton.className = "action action-primary" + (!themeFocus && homeFocus === 0 ? " focused" : "");
    n1Button.className = "action action-secondary" + (!themeFocus && homeFocus === 1 ? " focused" : "");
    renderThemeFocus();
  }

  function renderChannels() {
    channelList.className = "channel-list";
    channelList.innerHTML = "";
    channelButtons = [];
    for (var i = 0; i < channels.length; i++) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "channel-card" + (!themeFocus && i === channelFocus ? " focused" : "");
      button.setAttribute("data-index", String(i));
      button.innerHTML = '<span class="channel-name"></span><svg class="channel-arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m9 5 7 7-7 7" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      button.querySelector(".channel-name").textContent = channels[i].shortName;
      button.onclick = (function (index) { return function () { startChannel(index); }; })(i);
      channelList.appendChild(button);
      channelButtons.push(button);
    }
  }
  function renderChannelFocus() {
    for (var i = 0; i < channelButtons.length; i++) {
      channelButtons[i].className = "channel-card" + (!themeFocus && i === channelFocus ? " focused" : "");
    }
  }

  function focusChannel(index) {
    channelFocus = (index + channels.length) % channels.length;
    renderChannelFocus();
    renderThemeFocus();
  }

  function loadChannels() {
    var id = ++channelLoadId;
    channelStatus = "loading";
    channels = [];
    channelButtons = [];
    channelList.className = "channel-list";
    channelList.innerHTML = '<div class="source-message">Učitavanje kanala…</div>';
    fetchChannels(function (err, result) {
      if (id !== channelLoadId) { return; }
      if (err) {
        channelStatus = "error";
        channels = [];
        channelList.innerHTML = '<div class="source-error"></div>';
        channelList.firstChild.textContent = err.message + " Pritisnite OK za ponovni pokušaj.";
        return;
      }
      channelStatus = "ready";
      channels = result;
      channelFocus = 0;
      renderChannels();
    });
  }
  function openChannels() {
    stopPlayback();
    themeFocus = false;
    setScreen("channels");
    if (channelStatus === "ready") { focusChannel(currentIndex < 0 ? 0 : currentIndex); }
    else { renderThemeFocus(); }
  }

  function clearTimers() { clearTimeout(hideTimer); clearTimeout(errorTimer); }
  function showPauseControl() {
    clearTimeout(hideTimer);
    pauseButton.className = "pause-control" + (paused ? " is-paused" : "");
    pauseButton.setAttribute("aria-label", paused ? "Nastavi reprodukciju" : "Pauziraj");
    if (!paused) {
      hideTimer = setTimeout(function () { pauseButton.className = "pause-control hidden"; }, 1100);
    }
  }
  function showState(title, detail, isError) {
    playerState.className = "player-state" + (isError ? " error" : " loading");
    screens.player.className = "screen player active" + (isError ? " error" : " loading");
    document.getElementById("stateTitle").textContent = title;
    document.getElementById("stateDetail").textContent = detail;
    retryButton.className = isError ? "retry-button focused" : "retry-button hidden";
    pauseButton.className = "pause-control hidden";
  }
  function hideState() {
    playerState.className = "player-state hidden";
    screens.player.className = "screen player active";
  }
  function failPlayback(message, id) {
    if (id !== loadId || screen !== "player") { return; }
    showState("Program nije dostupan", message || "Pokušajte ponovo ili izaberite drugi kanal.", true);
  }
  function stopPlayback() {
    loadId++;
    clearTimers();
    paused = false;
    playbackReady = false;
    pauseButton.className = "pause-control hidden";
    if (browserHls) { browserHls.destroy(); browserHls = null; }
    if (browserVideoActive) {
      fallbackVideo.pause();
      fallbackVideo.removeAttribute("src");
      fallbackVideo.load();
      browserVideoActive = false;
    }
    if (avplayOpen) {
      try { webapis.avplay.stop(); } catch (ignore) {}
      try { webapis.avplay.close(); } catch (ignore2) {}
      avplayOpen = false;
    }
  }
  function loadHlsScript(done) {
    if (window.Hls) { done(null); return; }
    hlsScriptCallbacks.push(done);
    if (hlsScriptLoading) { return; }
    hlsScriptLoading = true;
    var script = document.createElement("script");
    script.src = "vendor/hls.light.min.js";
    script.onload = function () { completeHlsScript(window.Hls ? null : new Error("HLS biblioteka se nije učitala.")); };
    script.onerror = function () { completeHlsScript(new Error("HLS biblioteka nije dostupna.")); };
    document.head.appendChild(script);
  }
  function completeHlsScript(error) {
    hlsScriptLoading = false;
    var callbacks = hlsScriptCallbacks.splice(0);
    for (var i = 0; i < callbacks.length; i++) { callbacks[i](error); }
  }
  function playInBrowser(url, id) {
    fallbackVideo.className = "fallback-video";
    browserVideoActive = true;
    if (fallbackVideo.canPlayType("application/vnd.apple.mpegurl")) {
      fallbackVideo.src = url;
      var nativePromise = fallbackVideo.play();
      if (nativePromise && nativePromise.catch) { nativePromise.catch(function () { failPlayback("Preglednik nije mogao pokrenuti strim.", id); }); }
      return;
    }
    loadHlsScript(function (error) {
      if (id !== loadId || screen !== "player") { return; }
      if (error || !window.Hls || !Hls.isSupported()) { failPlayback("Preglednik ne podržava ovaj HLS strim.", id); return; }
      browserHls = new Hls({ autoStartLoad: false, capLevelToPlayerSize: false, maxBufferLength: 20, backBufferLength: 20 });
      browserHls.on(Hls.Events.MANIFEST_PARSED, function (event, data) {
        if (id !== loadId) { return; }
        var best = 0;
        for (var i = 1; i < data.levels.length; i++) {
          var candidate = data.levels[i];
          var current = data.levels[best];
          if ((candidate.width * candidate.height > current.width * current.height) ||
              (candidate.width * candidate.height === current.width * current.height && candidate.bitrate > current.bitrate)) { best = i; }
        }
        browserHls.startLevel = best;
        browserHls.startLoad();
        var promise = fallbackVideo.play();
        if (promise && promise.catch) { promise.catch(function () { failPlayback("Preglednik nije mogao pokrenuti strim.", id); }); }
      });
      browserHls.on(Hls.Events.ERROR, function (event, data) {
        if (data.fatal) { failPlayback("HLS strim nije dostupan u pregledniku.", id); }
      });
      browserHls.loadSource(url);
      browserHls.attachMedia(fallbackVideo);
    });
  }
  function startChannel(index) {
    if (!channels[index]) { return; }
    stopPlayback();
    themeFocus = false;
    renderThemeFocus();
    currentIndex = index;
    setScreen("player");
    showState("Povezivanje…", "Učitavanje programa uživo", false);
    var id = loadId;
    var url = channels[index].url;
    errorTimer = setTimeout(function () { failPlayback("Veza sa strimom je istekla. Pokušajte ponovo.", id); }, 20000);
    if (usingAvplay) {
      try {
        fallbackVideo.className = "fallback-video hidden";
        webapis.avplay.open(url);
        avplayOpen = true;
        try { webapis.avplay.setStreamingProperty("ADAPTIVE_INFO", "STARTBITRATE=HIGHEST"); } catch (ignore) {}
        webapis.avplay.setDisplayRect(0, 0, 1920, 1080);
        webapis.avplay.setDisplayMethod("PLAYER_DISPLAY_MODE_LETTER_BOX");
        webapis.avplay.setListener({
          onbufferingstart: function () { if (id === loadId) { showState("Povezivanje…", "Učitavanje programa uživo", false); } },
          onbufferingcomplete: function () { if (id === loadId && playbackReady) { clearTimeout(errorTimer); hideState(); } },
          onstreamcompleted: function () { failPlayback("Prijenos je završen. Pokušajte ponovo.", id); },
          onerror: function () { failPlayback("Nije moguće pokrenuti ovaj strim. Provjerite mrežu ili pokušajte kasnije.", id); }
        });
        webapis.avplay.prepareAsync(function () {
          if (id !== loadId) { return; }
          try { webapis.avplay.play(); playbackReady = true; clearTimeout(errorTimer); hideState(); }
          catch (err) { failPlayback(err.message, id); }
        }, function () { failPlayback("Strim nije dostupan na ovom TV-u ili u vašoj regiji.", id); });
      } catch (err2) { failPlayback(err2.message, id); }
    } else {
      playInBrowser(url, id);
    }
  }

  fallbackVideo.addEventListener("playing", function () { if (screen === "player") { playbackReady = true; paused = false; clearTimeout(errorTimer); hideState(); } });
  fallbackVideo.addEventListener("error", function () { failPlayback("Preglednik ne podržava strim ili je trenutno nedostupan.", loadId); });

  function changePause(mode) {
    if (screen !== "player" || !playbackReady || playerState.className.indexOf("hidden") === -1) { return; }
    try {
      var state = usingAvplay ? webapis.avplay.getState() : (fallbackVideo.paused ? "PAUSED" : "PLAYING");
      if (state !== "PLAYING" && state !== "PAUSED") { return; }
      var isPaused = state === "PAUSED";
      var shouldPlay = mode === "play" ? true : mode === "pause" ? false : isPaused;
      if (shouldPlay && !isPaused) { return; }
      if (!shouldPlay && isPaused) { return; }
      if (usingAvplay) {
        if (shouldPlay) { webapis.avplay.play(); }
        else { webapis.avplay.pause(); }
      } else if (shouldPlay) {
        var promise = fallbackVideo.play();
        if (promise && promise.catch) { promise.catch(function () { failPlayback("Reprodukcija se ne može nastaviti.", loadId); }); }
      } else { fallbackVideo.pause(); }
      paused = !shouldPlay;
      showPauseControl();
    } catch (err) { failPlayback("Kontrola reprodukcije nije dostupna: " + err.message, loadId); }
  }

  function back() {
    if (screen === "player") { stopPlayback(); setScreen("channels"); focusChannel(currentIndex < 0 ? 0 : currentIndex); }
    else if (screen === "channels") { themeFocus = false; setScreen("home"); focusHome(); }
    else if (window.tizen && tizen.application) { try { tizen.application.getCurrentApplication().exit(); } catch (ignore) {} }
  }
  function onKey(event) {
    var key = event.keyCode;
    if (controlledKeys[key]) { event.preventDefault(); }
    if (key === 10009 || key === 8 || key === 27) { back(); return; }
    if (key === 403) { openChannels(); return; }
    if (key >= 49 && key <= 51 && channels.length === 3) { startChannel(key - 49); return; }
    if (screen === "home") {
      if (key === 38) { themeFocus = true; focusHome(); }
      else if (key === 40) { themeFocus = false; focusHome(); }
      else if (key === 37 || key === 39) { themeFocus = false; homeFocus = key === 37 ? 0 : 1; focusHome(); }
      else if (key === 13) { if (themeFocus) { toggleTheme(); } else if (homeFocus === 0) { openChannels(); } }
    } else if (screen === "channels") {
      if (key === 38 && (themeFocus || channelFocus === 0)) { themeFocus = true; renderChannelFocus(); renderThemeFocus(); }
      else if (key === 40 && themeFocus) { themeFocus = false; if (channels.length) { focusChannel(0); } else { renderThemeFocus(); } }
      else if (!channels.length) { if (key === 13) { if (themeFocus) { toggleTheme(); } else if (channelStatus === "error") { loadChannels(); } } }
      else if (key === 37 || key === 38) { themeFocus = false; focusChannel(channelFocus - 1); }
      else if (key === 39 || key === 40) { themeFocus = false; focusChannel(channelFocus + 1); }
      else if (key === 13) { if (themeFocus) { toggleTheme(); } else { startChannel(channelFocus); } }
    } else if (screen === "player") {
      if (event.repeat && switchKeys[key]) { return; }
      if (key === 37 || key === 40 || key === 428 || key === 10232) { startChannel((currentIndex + channels.length - 1) % channels.length); }
      else if (key === 39 || key === 38 || key === 427 || key === 10233) { startChannel((currentIndex + 1) % channels.length); }
      else if (key === 13 || key === 32) { if (playerState.className.indexOf("error") !== -1) { startChannel(currentIndex); } else { changePause(); } }
      else if (key === 10252) { changePause(); }
      else if (key === 19) { changePause("pause"); }
      else if (key === 415) { changePause("play"); }
    }
  }
  function registerKeys() {
    if (!window.tizen || !tizen.tvinputdevice) { return; }
    var keys = ["ColorF0Red", "ChannelUp", "ChannelDown", "MediaPlayPause", "MediaPause", "MediaPlay", "MediaTrackPrevious", "MediaTrackNext"];
    for (var i = 0; i < keys.length; i++) { try { tizen.tvinputdevice.registerKey(keys[i]); } catch (ignore) {} }
  }
  watchButton.onclick = openChannels;
  themeToggle.onclick = toggleTheme;
  retryButton.onclick = function () { if (screen === "player" && currentIndex >= 0) { startChannel(currentIndex); } };
  pauseButton.onclick = function (event) { event.stopPropagation(); changePause(); };
  screens.player.onclick = function () { changePause(); };
  document.addEventListener("keydown", onKey);
  document.addEventListener("visibilitychange", function () {
    if (document.hidden && screen === "player") {
      stopPlayback();
      setScreen("channels");
      focusChannel(currentIndex < 0 ? 0 : currentIndex);
    }
  });
  window.addEventListener("beforeunload", stopPlayback);
  try { darkTheme = window.localStorage.getItem("n1-theme") === "dark"; } catch (ignore) {}
  applyTheme();
  focusHome();
  loadChannels();
  registerKeys();
}());
