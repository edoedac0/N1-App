/* Platform adapter: DOM, networking, and Samsung AVPlay. Navigation lives in C. */
(function () {
  "use strict";

  var api, memory, decoder;
  var cards = [];
  var sourceView = "";
  var sourceMessage = "Kanali nisu dostupni. Pritisnite OK za ponovni pokušaj.";
  var videoMessage = "Pokušajte ponovo ili izaberite drugi kanal.";
  var playToken = -1;
  var playbackTimer = null;
  var avplayOpen = false;
  var avplayStarted = false;
  var browserVideoActive = false;
  var browserHls = null;
  var hlsScriptLoading = false;
  var hlsScriptCallbacks = [];
  var usingAvplay = !!(window.webapis && window.webapis.avplay);
  var app = document.getElementById("app");
  var screens = [document.getElementById("home"), document.getElementById("channels"), document.getElementById("player")];
  var channelList = document.getElementById("channelList");
  var fallbackVideo = document.getElementById("fallbackVideo");
  var channelBadge = document.getElementById("channelBadge");
  var pauseButton = document.getElementById("pauseButton");
  var playerState = document.getElementById("playerState");
  var themeToggle = document.getElementById("themeToggle");
  var watchButton = document.getElementById("watchButton");
  var n1Button = document.getElementById("n1Button");
  var retryButton = document.getElementById("retryButton");
  var controlledKeys = {37:1,38:1,39:1,40:1,13:1,10009:1,8:1,27:1,403:1,427:1,428:1,49:1,50:1,51:1,32:1,10252:1,19:1,415:1,10232:1,10233:1};

  function readString(pointer) {
    if (!pointer) { return ""; }
    var bytes = new Uint8Array(memory.buffer);
    var end = pointer;
    while (end < bytes.length && bytes[end]) { end++; }
    return decoder.decode(bytes.subarray(pointer, end));
  }
  function channelName(index) { return readString(api.n1_string_short(index)); }
  function channelUrl(index) { return readString(api.n1_string_url(index)); }
  function action(kind, index) { api.n1_action(kind, index || 0); }
  function setClass(element, value) { if (element.className !== value) { element.className = value; } }
  function setText(element, value) { if (element.textContent !== value) { element.textContent = value; } }
  function setLabel(element, value) { if (element.getAttribute("aria-label") !== value) { element.setAttribute("aria-label", value); } }

  function buildCards() {
    if (cards.length) { return; }
    channelList.innerHTML = "";
    sourceView = "ready";
    for (var i = 0; i < 3; i++) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "channel-card";
      button.innerHTML = '<span class="channel-name"></span><svg class="channel-arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m9 5 7 7-7 7" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      button.querySelector(".channel-name").textContent = channelName(i);
      button.onclick = (function (index) { return function () { action(3, index); }; })(i);
      channelList.appendChild(button);
      cards.push(button);
    }
  }
  function render() {
    var screen = api.n1_screen();
    var status = api.n1_source_status();
    var video = api.n1_video_status();
    var dark = api.n1_theme();
    var themeFocused = api.n1_theme_focus();
    if (document.documentElement.getAttribute("data-theme") !== (dark ? "dark" : "light")) { document.documentElement.setAttribute("data-theme", dark ? "dark" : "light"); }
    setLabel(themeToggle, dark ? "Uključi svijetli način" : "Uključi tamni način");
    setClass(themeToggle, "theme-toggle" + (themeFocused ? " focused" : ""));
    setClass(app, "app" + (screen === 2 ? " playing" : ""));
    for (var i = 0; i < 3; i++) {
      var screenClass = "screen " + ["home", "channels", "player"][i] + (i === screen ? " active" : "");
      if (i === 2 && screen === 2 && (video === 0 || video === 3)) { screenClass += video === 0 ? " loading" : " error"; }
      setClass(screens[i], screenClass);
    }
    setClass(watchButton, "action action-primary" + (!themeFocused && api.n1_home_focus() === 0 ? " focused" : ""));
    setClass(n1Button, "action action-secondary" + (!themeFocused && api.n1_home_focus() === 1 ? " focused" : ""));
    if (status === 1) {
      buildCards();
      for (i = 0; i < cards.length; i++) { setClass(cards[i], "channel-card" + (!themeFocused && api.n1_channel_focus() === i ? " focused" : "")); }
    } else if (cards.length === 0) {
      var nextSourceView = status === 0 ? "loading" : "error:" + sourceMessage;
      if (sourceView !== nextSourceView) {
        channelList.innerHTML = status === 0 ? '<div class="source-message">Učitavanje kanala…</div>' : '<div class="source-error"></div>';
        if (status === 2) { channelList.firstChild.textContent = sourceMessage; }
        sourceView = nextSourceView;
      }
    }
    if (screen === 2) {
      var index = api.n1_current_index();
      var label = index === 0 ? "BiH" : channelName(index);
      setText(channelBadge, "N1 " + label);
      setClass(channelBadge, "channel-badge" + (api.n1_badge_visible() ? "" : " hidden"));
      setClass(pauseButton, "pause-control" + (video === 2 ? " is-paused" : "") + (api.n1_control_visible() ? "" : " hidden"));
      setLabel(pauseButton, video === 2 ? "Nastavi reprodukciju" : "Pauziraj");
      if (video === 0 || video === 3) {
        setClass(playerState, video === 0 ? "player-state loading" : "player-state error");
        setText(document.getElementById("stateTitle"), video === 0 ? "Povezivanje…" : "Program nije dostupan");
        setText(document.getElementById("stateDetail"), video === 0 ? "Učitavanje programa uživo" : videoMessage);
        setClass(retryButton, video === 3 ? "retry-button focused" : "retry-button hidden");
      } else { setClass(playerState, "player-state hidden"); }
    } else { setClass(channelBadge, "channel-badge hidden"); }
  }

  function fetchChannels() {
    var url = window.N1_REMOTE_CHANNELS_URL || "";
    if (!/^https:\/\//.test(url)) { sourceMessage = "Postavite GitHub URL u settings.js."; api.n1_channels_failed(); return; }
    var request = new XMLHttpRequest();
    request.open("GET", url + (url.indexOf("?") === -1 ? "?" : "&") + "t=" + Date.now(), true);
    request.responseType = "arraybuffer";
    request.timeout = 10000;
    request.onload = function () {
      if (request.status < 200 || request.status >= 300 || !request.response) {
        sourceMessage = "GitHub izvor nije dostupan. Pritisnite OK za ponovni pokušaj.";
        api.n1_channels_failed(); return;
      }
      var data = new Uint8Array(request.response);
      if (data.length >= api.n1_json_capacity()) { sourceMessage = "Datoteka kanala je prevelika."; api.n1_channels_failed(); return; }
      new Uint8Array(memory.buffer, api.n1_json_buffer(), data.length).set(data);
      sourceMessage = "Datoteka channels.json nema očekivani format.";
      api.n1_receive_json(data.length);
    };
    request.onerror = function () { sourceMessage = "Provjerite internetsku vezu i GitHub URL."; api.n1_channels_failed(); };
    request.ontimeout = function () { sourceMessage = "GitHub izvor nije odgovorio na vrijeme."; api.n1_channels_failed(); };
    request.send();
  }

  function clearPlaybackTimer() { clearTimeout(playbackTimer); playbackTimer = null; }
  function failVideo(message, token) {
    if (token !== playToken) { return; }
    videoMessage = message;
    clearPlaybackTimer();
    api.n1_video_error(token);
    playToken = -1;
  }
  function stop() {
    clearPlaybackTimer();
    playToken = -1;
    if (browserHls) { browserHls.destroy(); browserHls = null; }
    if (browserVideoActive) {
      browserVideoActive = false;
      fallbackVideo.pause();
      fallbackVideo.removeAttribute("src");
      fallbackVideo.load();
    }
    if (avplayOpen) {
      try { window.webapis.avplay.stop(); } catch (ignore) {}
      try { window.webapis.avplay.close(); } catch (ignore2) {}
      avplayOpen = false;
    }
    avplayStarted = false;
  }
  function completeHlsScript(error) {
    hlsScriptLoading = false;
    var callbacks = hlsScriptCallbacks.splice(0);
    for (var i = 0; i < callbacks.length; i++) { callbacks[i](error); }
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
  function playBrowser(url, token) {
    fallbackVideo.className = "fallback-video";
    browserVideoActive = true;
    if (fallbackVideo.canPlayType("application/vnd.apple.mpegurl")) {
      fallbackVideo.src = url;
      var nativePromise = fallbackVideo.play();
      if (nativePromise && nativePromise.catch) { nativePromise.catch(function () { failVideo("Preglednik nije mogao pokrenuti strim.", token); }); }
      return;
    }
    loadHlsScript(function (error) {
      if (token !== playToken) { return; }
      if (error || !window.Hls || !window.Hls.isSupported()) { failVideo("Preglednik ne podržava ovaj HLS strim.", token); return; }
      browserHls = new window.Hls({ autoStartLoad: false, capLevelToPlayerSize: false, maxBufferLength: 20, backBufferLength: 20 });
      browserHls.on(window.Hls.Events.MANIFEST_PARSED, function (event, data) {
        if (token !== playToken) { return; }
        var best = 0;
        for (var i = 1; i < data.levels.length; i++) {
          var candidate = data.levels[i];
          var current = data.levels[best];
          if (candidate.width * candidate.height > current.width * current.height ||
              (candidate.width * candidate.height === current.width * current.height && candidate.bitrate > current.bitrate)) { best = i; }
        }
        browserHls.startLevel = best;
        browserHls.startLoad();
        var promise = fallbackVideo.play();
        if (promise && promise.catch) { promise.catch(function () { failVideo("Preglednik nije mogao pokrenuti strim.", token); }); }
      });
      browserHls.on(window.Hls.Events.ERROR, function (event, data) { if (data.fatal) { failVideo("HLS strim nije dostupan u pregledniku.", token); } });
      browserHls.loadSource(url);
      browserHls.attachMedia(fallbackVideo);
    });
  }
  function play(index, token) {
    playToken = token;
    playbackTimer = setTimeout(function () { failVideo("Veza sa strimom je istekla. Pokušajte ponovo.", token); }, 20000);
    var url = channelUrl(index);
    if (!usingAvplay) { playBrowser(url, token); return; }
    try {
      fallbackVideo.className = "fallback-video hidden";
      var player = window.webapis.avplay;
      player.open(url);
      avplayOpen = true;
      try { player.setStreamingProperty("ADAPTIVE_INFO", "STARTBITRATE=HIGHEST"); } catch (ignore) {}
      player.setListener({
        onbufferingstart: function () { if (token === playToken) { api.n1_video_buffering(token); } },
        onbufferingcomplete: function () { if (token === playToken && avplayStarted && api.n1_video_status() === 0) { clearPlaybackTimer(); api.n1_video_ready(token); } },
        onstreamcompleted: function () { failVideo("Prijenos je završen. Pokušajte ponovo.", token); },
        onerror: function () { failVideo("Nije moguće pokrenuti ovaj strim.", token); }
      });
      player.setDisplayMethod("PLAYER_DISPLAY_MODE_FULL_SCREEN");
      player.prepareAsync(function () {
        if (token !== playToken) { return; }
        try {
          player.setDisplayRect(0, 0, 1920, 1080);
          player.play(); avplayStarted = true; clearPlaybackTimer(); api.n1_video_ready(token);
        }
        catch (error) { failVideo(error.message, token); }
      }, function () { failVideo("Strim nije dostupan na ovom TV-u ili u vašoj regiji.", token); });
    } catch (error2) { failVideo(error2.message, token); }
  }
  function pause(playMode, token) {
    if (token !== playToken) { return; }
    try {
      if (usingAvplay) {
        if (playMode) { window.webapis.avplay.play(); } else { window.webapis.avplay.pause(); }
      } else if (playMode) {
        var promise = fallbackVideo.play();
        if (promise && promise.catch) { promise.catch(function () { failVideo("Reprodukcija se ne može nastaviti.", token); }); }
      } else { fallbackVideo.pause(); }
    } catch (error) { failVideo("Kontrola reprodukcije nije dostupna.", token); }
  }
  function registerKeys() {
    if (!window.tizen || !window.tizen.tvinputdevice) { return; }
    var keys = ["ColorF0Red", "ChannelUp", "ChannelDown", "MediaPlayPause", "MediaPause", "MediaPlay", "MediaTrackPrevious", "MediaTrackNext"];
    for (var i = 0; i < keys.length; i++) { try { window.tizen.tvinputdevice.registerKey(keys[i]); } catch (ignore) {} }
  }
  function bootError(message) {
    screens[0].className = "screen home";
    screens[1].className = "screen channels active";
    channelList.innerHTML = '<div class="source-error"></div>';
    channelList.firstChild.textContent = message;
  }
  function boot() {
    if (!window.WebAssembly || !window.N1_CORE_BASE64) { bootError("Ovaj TV ne podržava aplikaciju."); return; }
    var raw = atob(window.N1_CORE_BASE64);
    var bytes = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) { bytes[i] = raw.charCodeAt(i); }
    var imports = {env:{
      host_render: render,
      host_fetch_channels: fetchChannels,
      host_play: play,
      host_stop: stop,
      host_pause: pause,
      host_save_theme: function (dark) { try { window.localStorage.setItem("n1-theme", dark ? "dark" : "light"); } catch (ignore) {} },
      host_exit: function () { if (window.tizen && window.tizen.application) { try { window.tizen.application.getCurrentApplication().exit(); } catch (ignore) {} } },
      host_schedule: function (kind, milliseconds, token) { setTimeout(function () { api.n1_timer(kind, token); }, milliseconds); }
    }};
    WebAssembly.instantiate(bytes, imports).then(function (result) {
      api = result.instance.exports;
      memory = api.memory;
      decoder = new TextDecoder("utf-8");
      watchButton.onclick = function () { action(1, 0); };
      themeToggle.onclick = function () { action(2, 0); };
      pauseButton.onclick = function (event) { event.stopPropagation(); action(5, 0); };
      retryButton.onclick = function () { action(4, 0); };
      document.addEventListener("keydown", function (event) {
        if (controlledKeys[event.keyCode]) { event.preventDefault(); }
        api.n1_key(event.keyCode, event.repeat ? 1 : 0);
      });
      document.addEventListener("visibilitychange", function () { if (document.hidden) { api.n1_background(); } });
      window.addEventListener("beforeunload", stop);
      fallbackVideo.addEventListener("playing", function () { if (browserVideoActive && playToken >= 0) { clearPlaybackTimer(); api.n1_video_ready(playToken); } });
      fallbackVideo.addEventListener("error", function () { if (browserVideoActive) { failVideo("Preglednik ne podržava strim ili je trenutno nedostupan.", playToken); } });
      registerKeys();
      var dark = false;
      try { dark = window.localStorage.getItem("n1-theme") === "dark"; } catch (ignore2) {}
      api.n1_init(dark ? 1 : 0);
    }).catch(function () { bootError("Pokretanje aplikacije nije uspjelo."); });
  }
  boot();
}());
