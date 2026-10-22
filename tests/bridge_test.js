const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const root = __dirname + '/..';
const json = Buffer.from(fs.readFileSync(root + '/channels.json'));
const html = fs.readFileSync(root + '/index.html', 'utf8');
const css = fs.readFileSync(root + '/style.css', 'utf8');
assert(html.indexOf('type="application/avplayer"') > 0);
assert(html.indexOf('type="application/avplayer"') < html.indexOf('id="app"'));
assert(css.includes('html,body{width:100%;height:100%;margin:0;overflow:hidden;background:transparent'));
assert(css.includes('.app.playing{background:transparent}'));

function makeDom() {
  const elements = {};
  let created = 0;
  function element(id) {
    if (!elements[id]) {
      const value = {
        id, className: '', style: {}, children: [], textContent: '', attributes: {},
        setAttribute(k, v) { this.attributes[k] = v; },
        removeAttribute(k) { delete this.attributes[k]; },
        addEventListener(k, fn) { this['on' + k] = fn; },
        appendChild(child) { this.children.push(child); },
        querySelector(s) { return element(id + s); },
        pause() { this.paused = true; },
        load() {},
        play() { this.paused = false; if (this.onplaying) this.onplaying(); return Promise.resolve(); },
        canPlayType() { return ''; }
      };
      Object.defineProperty(value, 'innerHTML', {
        set(html) { this._html = html; this.children = []; if (html && html.indexOf('source-error') !== -1) this.firstChild = element('sourceError'); },
        get() { return this._html; }
      });
      elements[id] = value;
    }
    return elements[id];
  }
  const document = {
    getElementById: element,
    createElement: () => element('created' + (++created)),
    documentElement: element('html'),
    head: element('head'),
    body: element('body'),
    addEventListener(k, fn) { this['on' + k] = fn; }
  };
  return {element, document};
}

async function run(withAvplay) {
  const {element, document} = makeDom();
  const keys = [], urls = [], modes = [], properties = [], displayRects = [];
  let fetches = 0, state = 'NONE', hlsInstance;
  class XHR {
    open() {}
    send() {
      fetches++;
      this.status = 200;
      this.response = json.buffer.slice(json.byteOffset, json.byteOffset + json.byteLength);
      this.onload();
    }
  }
  const avplay = {
    open(url) { urls.push(url); state = 'IDLE'; },
    setStreamingProperty(k,v) { properties.push([k,v]); },
    setDisplayRect(x,y,w,h) { displayRects.push([x,y,w,h]); },
    setDisplayMethod(value) { modes.push(value); },
    setListener() {},
    prepareAsync(ok) { state = 'READY'; ok(); },
    play() { state = 'PLAYING'; },
    pause() { state = 'PAUSED'; },
    stop() { state = 'IDLE'; },
    close() { state = 'NONE'; }
  };
  class Hls {
    constructor(options) { this.options=options; this.events={}; hlsInstance=this; }
    on(k, fn) { this.events[k]=fn; }
    loadSource(url) { this.url=url; urls.push(url); }
    attachMedia(video) { this.video=video; this.events[Hls.Events.MANIFEST_PARSED]('',{levels:[{width:480,height:384,bitrate:596000},{width:720,height:576,bitrate:1496000}]}); }
    startLoad() { this.started=true; }
    destroy() { this.destroyed=true; }
    static isSupported() { return true; }
  }
  Hls.Events={MANIFEST_PARSED:'parsed',ERROR:'error'};
  const window = {
    N1_REMOTE_CHANNELS_URL: 'https://raw.githubusercontent.com/edoedac0/N1-App/main/channels.json',
    WebAssembly,
    Hls,
    tizen: {tvinputdevice:{registerKey(k){keys.push(k);}}},
    localStorage: {getItem(){return null;},setItem(){}},
    addEventListener(){}
  };
  if (withAvplay) window.webapis={avplay};
  const context={window,document,XMLHttpRequest:XHR,WebAssembly,TextDecoder,Uint8Array,Date,Promise,console,
    atob: s=>Buffer.from(s,'base64').toString('binary'),
    setTimeout(){return 1;},clearTimeout(){}};
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(root+'/core-data.js','utf8'),context);
  vm.runInContext(fs.readFileSync(root+'/bridge.js','utf8'),context);
  await new Promise(resolve=>setTimeout(resolve,30));
  function key(code) { document.onkeydown({keyCode:code,repeat:false,preventDefault(){}}); }

  assert.equal(fetches,1);
  assert.equal(element('channelList').children.length,3);
  assert(keys.includes('MediaPlayPause') && keys.includes('ChannelUp'));
  element('watchButton').onclick();
  key(13);
  assert.equal(element('channelBadge').textContent,'N1 · BiH');
  assert.equal(element('channelBadge').className,'channel-badge');
  if (withAvplay) {
    assert.equal(modes[0],'PLAYER_DISPLAY_MODE_FULL_SCREEN');
    assert.equal(displayRects.length,2);
    assert.deepEqual(displayRects[1],[0,0,1920,1080]);
    assert.deepEqual(properties[0],['ADAPTIVE_INFO','STARTBITRATE=HIGHEST']);
    assert.equal(state,'PLAYING');
  } else {
    assert.equal(hlsInstance.startLevel,1);
    assert(hlsInstance.started);
    assert.equal(element('fallbackVideo').paused,false);
  }
  key(13);
  if (withAvplay) assert.equal(state,'PAUSED'); else assert.equal(element('fallbackVideo').paused,true);
  key(10252);
  if (withAvplay) assert.equal(state,'PLAYING'); else assert.equal(element('fallbackVideo').paused,false);
  key(427);
  assert(urls[1].includes('n1hrv'));
  assert.equal(element('channelBadge').textContent,'N1 · Hrvatska');
  key(428);
  assert(urls[2].includes('n1bos'));
  key(51);
  assert(urls[3].includes('n1srp'));
  document.hidden=true;
  document.onvisibilitychange();
  assert.equal(element('channels').className,'screen channels active');
  assert.equal(fetches,1);
}

(async () => {
  await run(true);
  await run(false);
  console.log('PASS WASM bridge: startup fetch, AVPlay/HLS, badge, pause, remote channel switching');
})().catch(error=>{console.error(error);process.exitCode=1;});
