(function () {
  "use strict";

  var remoteUrl = window.N1_REMOTE_CHANNELS_URL || "";
  var channels = [];
  var screen = "home";
  var homeFocus = 0;
  var channelFocus = 0;
  var currentIndex = -1;
  var loadId = 0;
  var hideTimer = null;
  var errorTimer = null;
  var usingAvplay = !!(window.webapis && webapis.avplay);
  var fallbackVideo = document.getElementById("fallbackVideo");
  var playerChrome = document.getElementById("playerChrome");
  var playerState = document.getElementById("playerState");
  var retryButton = document.getElementById("retryButton");

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
    var names = ["home", "channels", "player"];
    for (var i = 0; i < names.length; i++) { document.getElementById(names[i]).className = "screen " + names[i] + (names[i] === next ? " active" : ""); }
    screen = next;
    document.getElementById("app").className = "app" + (next === "player" ? " playing" : "");
    document.documentElement.style.background = next === "player" ? "transparent" : "";
    document.body.style.background = next === "player" ? "transparent" : "";
  }

  function focusHome() {
    document.getElementById("watchButton").className = "action action-primary" + (homeFocus === 0 ? " focused" : "");
    document.getElementById("n1Button").className = "action action-secondary" + (homeFocus === 1 ? " focused" : "");
  }

  function renderChannels() {
    var list = document.getElementById("channelList");
    list.innerHTML = "";
    for (var i = 0; i < channels.length; i++) {
      var item = channels[i];
      var button = document.createElement("button");
      button.type = "button";
      button.className = "channel-card" + (i === channelFocus ? " focused" : "");
      button.setAttribute("data-index", String(i));
      button.innerHTML = '<span class="channel-number">0' + (i + 1) + '</span><span class="channel-name"></span><svg class="channel-play" viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M11 7.5a2 2 0 0 1 3.02-1.72l13 8.5a2 2 0 0 1 0 3.44l-13 8.5A2 2 0 0 1 11 24.5v-17Z" fill="currentColor"/></svg>';
      button.querySelector(".channel-name").textContent = item.shortName;
      button.onclick = (function (index) { return function () { startChannel(index); }; })(i);
      list.appendChild(button);
    }
  }

  function focusChannel(index) {
    channelFocus = (index + channels.length) % channels.length;
    renderChannels();
  }

  function openChannels() {
    stopPlayback();
    setScreen("channels");
    document.getElementById("sourceStatus").textContent = "Učitavanje kanala s GitHuba…";
    fetchChannels(function (err, result) {
      if (screen !== "channels") { return; }
      if (err) {
        channels = [];
        document.getElementById("channelList").innerHTML = '<div class="source-error"></div>';
        document.querySelector(".source-error").textContent = err.message;
        document.getElementById("sourceStatus").textContent = "Izvor nije učitan · pritisnite OK za ponovni pokušaj";
        return;
      }
      channels = result;
      channelFocus = 0;
      renderChannels();
      document.getElementById("sourceStatus").textContent = "";
    });
  }

  function clearTimers() { clearTimeout(hideTimer); clearTimeout(errorTimer); }
  function showChrome() {
    playerChrome.className = "player-chrome";
    clearTimeout(hideTimer);
    if (screen === "player" && playerState.className.indexOf("hidden") !== -1) {
      hideTimer = setTimeout(function () { playerChrome.className = "player-chrome hidden"; }, 5000);
    }
  }
  function showState(title, detail, isError) {
    playerState.className = "player-state" + (isError ? " error" : "");
    document.getElementById("stateTitle").textContent = title;
    document.getElementById("stateDetail").textContent = detail;
    retryButton.className = isError ? "retry-button focused" : "retry-button hidden";
    showChrome();
  }
  function hideState() { playerState.className = "player-state hidden"; showChrome(); }
  function failPlayback(message, id) {
    if (id !== loadId || screen !== "player") { return; }
    showState("Program nije dostupan", message || "Pokušajte ponovo ili izaberite drugi kanal.", true);
  }
  function stopPlayback() {
    loadId++;
    clearTimers();
    fallbackVideo.pause();
    fallbackVideo.removeAttribute("src");
    fallbackVideo.load();
    if (usingAvplay) {
      try { webapis.avplay.stop(); } catch (ignore) {}
      try { webapis.avplay.close(); } catch (ignore2) {}
    }
  }
  function startChannel(index) {
    if (!channels[index]) { return; }
    stopPlayback();
    currentIndex = index;
    setScreen("player");
    document.getElementById("playerTitle").textContent = channels[index].name;
    showState("Povezivanje…", "Učitavanje programa uživo", false);
    var id = loadId;
    var url = channels[index].url;
    errorTimer = setTimeout(function () { failPlayback("Veza sa strimom je istekla. Pokušajte ponovo.", id); }, 20000);
    if (usingAvplay) {
      try {
        fallbackVideo.className = "fallback-video hidden";
        webapis.avplay.open(url);
        webapis.avplay.setDisplayRect(0, 0, 1920, 1080);
        webapis.avplay.setDisplayMethod("PLAYER_DISPLAY_MODE_LETTER_BOX");
        webapis.avplay.setListener({
          onbufferingstart: function () { if (id === loadId) { showState("Povezivanje…", "Učitavanje programa uživo", false); } },
          onbufferingcomplete: function () { if (id === loadId) { clearTimeout(errorTimer); hideState(); } },
          onstreamcompleted: function () { failPlayback("Prijenos je završen. Pokušajte ponovo.", id); },
          onerror: function () { failPlayback("Nije moguće pokrenuti ovaj strim. Provjerite mrežu ili pokušajte kasnije.", id); }
        });
        webapis.avplay.prepareAsync(function () {
          if (id !== loadId) { return; }
          try { webapis.avplay.play(); clearTimeout(errorTimer); hideState(); }
          catch (err) { failPlayback(err.message, id); }
        }, function () { failPlayback("Strim nije dostupan na ovom TV-u ili u vašoj regiji.", id); });
      } catch (err2) { failPlayback(err2.message, id); }
    } else {
      fallbackVideo.className = "fallback-video";
      fallbackVideo.src = url;
      var promise = fallbackVideo.play();
      if (promise && promise.catch) { promise.catch(function () { failPlayback("Preglednik ne podržava ovaj HLS strim. Koristite Samsung TV.", id); }); }
    }
  }

  fallbackVideo.addEventListener("playing", function () { clearTimeout(errorTimer); hideState(); });
  fallbackVideo.addEventListener("error", function () { failPlayback("Preglednik ne podržava strim ili je trenutno nedostupan.", loadId); });

  function back() {
    if (screen === "player") { stopPlayback(); setScreen("channels"); focusChannel(currentIndex < 0 ? 0 : currentIndex); }
    else if (screen === "channels") { setScreen("home"); focusHome(); }
    else if (window.tizen && tizen.application) { try { tizen.application.getCurrentApplication().exit(); } catch (ignore) {} }
  }
  function onKey(event) {
    var key = event.keyCode;
    if ([37,38,39,40,13,10009,8,27,403,427,428,49,50,51,32].indexOf(key) !== -1) { event.preventDefault(); }
    if (key === 10009 || key === 8 || key === 27) { back(); return; }
    if (key === 403) { if (screen !== "player") { openChannels(); } else { showChrome(); } return; }
    if (key >= 49 && key <= 51 && channels.length === 3) { startChannel(key - 49); return; }
    if (screen === "home") {
      if (key === 37 || key === 39 || key === 38 || key === 40) { homeFocus = 1 - homeFocus; focusHome(); }
      else if (key === 13 && homeFocus === 0) { openChannels(); }
    } else if (screen === "channels") {
      if (!channels.length) { if (key === 13) { openChannels(); } return; }
      if (key === 37 || key === 38) { focusChannel(channelFocus - 1); }
      else if (key === 39 || key === 40) { focusChannel(channelFocus + 1); }
      else if (key === 13) { startChannel(channelFocus); }
    } else if (screen === "player") {
      if (key === 37 || key === 428) { startChannel((currentIndex + channels.length - 1) % channels.length); }
      else if (key === 39 || key === 427) { startChannel((currentIndex + 1) % channels.length); }
      else if (key === 13 || key === 32) { if (playerState.className.indexOf("error") !== -1) { startChannel(currentIndex); } else { showChrome(); } }
      else { showChrome(); }
    }
  }
  function registerKeys() {
    if (!window.tizen || !tizen.tvinputdevice) { return; }
    var keys = ["ColorF0Red", "ChannelUp", "ChannelDown"];
    for (var i = 0; i < keys.length; i++) { try { tizen.tvinputdevice.registerKey(keys[i]); } catch (ignore) {} }
  }
  document.getElementById("watchButton").onclick = openChannels;
  document.getElementById("n1Button").onclick = function () {};
  retryButton.onclick = function () { if (screen === "player" && currentIndex >= 0) { startChannel(currentIndex); } };
  document.addEventListener("keydown", onKey);
  window.addEventListener("beforeunload", stopPlayback);
  registerKeys();
  focusHome();
}());
