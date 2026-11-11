// Page for the native video WebView: the YouTube IFrame Player with YouTube's own control bar off
// (controls=0, which also drops its share / copy-link buttons) and a play / seek / sound bar of our
// own, matching the web app's popup. Taps on the picture play/pause instead of opening YouTube.

const ICONS = {
  play: '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>',
  replay:
    '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M12 5V1L7 6l5 5V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7z"/></svg>',
  sound:
    '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 8v8a4.5 4.5 0 0 0 2.5-4z"/></svg>',
  muted:
    '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm18.7 3-2.3-2.3-1.4 1.4 2.3 2.3-2.3 2.3 1.4 1.4 2.3-2.3 2.3 2.3 1.4-1.4-2.3-2.3 2.3-2.3-1.4-1.4z"/></svg>',
};

export function buildPlayerHtml(videoId: string, origin: string): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }
  html, body { height: 100%; background: #000; overflow: hidden; font-family: sans-serif; }
  #wrap { display: flex; flex-direction: column; height: 100%; }
  #stage { position: relative; flex: 1; background: #000; }
  #player, #stage iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; }
  #tap { position: absolute; inset: 0; display: none; align-items: center; justify-content: center; background: transparent; border: 0; }
  #big { width: 64px; height: 64px; border-radius: 50%; background: rgba(0,0,0,.6); color: #fff; display: flex; align-items: center; justify-content: center; }
  #big svg { width: 32px; height: 32px; }
  #msg { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; padding: 24px; text-align: center; color: rgba(255,255,255,.85); font-size: 14px; font-weight: 700; }
  #bar { display: flex; align-items: center; gap: 8px; padding: 8px 10px; background: #14104a; }
  #bar button { flex: none; width: 38px; height: 38px; border: 0; border-radius: 50%; background: transparent; color: #fff; display: flex; align-items: center; justify-content: center; }
  #bar button:disabled { opacity: .4; }
  #time { flex: none; color: rgba(255,255,255,.8); font-size: 12px; font-weight: 700; font-variant-numeric: tabular-nums; }
  #seek { flex: 1; min-width: 0; accent-color: #fff; }
</style>
</head>
<body>
<div id="wrap">
  <div id="stage">
    <div id="player"></div>
    <button id="tap" aria-label="Play"><span id="big">${ICONS.play}</span></button>
    <div id="msg">ဗီဒီယို ဖွင့်နေပါသည်...</div>
  </div>
  <div id="bar">
    <button id="playBtn" disabled aria-label="Play">${ICONS.play}</button>
    <span id="time">0:00 / 0:00</span>
    <input id="seek" type="range" min="0" max="0" step="0.5" value="0" disabled />
    <button id="muteBtn" disabled aria-label="Mute">${ICONS.sound}</button>
  </div>
</div>
<script>
  var ICONS = ${JSON.stringify(ICONS)};
  var player = null, ready = false, state = -1, timer = null, dragging = false;
  var $ = function (id) { return document.getElementById(id); };

  function fmt(s) { s = Math.max(0, Math.floor(s || 0)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
  function playing() { return state === 1 || state === 3; }

  function render() {
    var ended = state === 0;
    var icon = ended ? ICONS.replay : playing() ? ICONS.pause : ICONS.play;
    $('playBtn').innerHTML = icon;
    $('tap').style.display = ready ? 'flex' : 'none';
    $('big').style.display = playing() ? 'none' : 'flex';
    $('big').innerHTML = ended ? ICONS.replay : ICONS.play;
    $('muteBtn').innerHTML = player && player.isMuted() ? ICONS.muted : ICONS.sound;
    var d = player ? player.getDuration() : 0;
    $('seek').max = d || 0;
    if (!dragging && player) $('seek').value = player.getCurrentTime();
    $('time').textContent = fmt(player ? player.getCurrentTime() : 0) + ' / ' + fmt(d);
  }

  function toggle() {
    if (!ready) return;
    if (state === 0) { player.seekTo(0, true); player.playVideo(); }
    else if (playing()) player.pauseVideo();
    else player.playVideo();
  }

  function fail() {
    $('msg').style.display = 'flex';
    $('msg').textContent = 'ဗီဒီယို ဖွင့်လို့ မရပါ။ အင်တာနက် ချိတ်ဆက်မှုကို စစ်ပြီး ပြန်ဖွင့်ကြည့်ပါ။';
    $('tap').style.display = 'none';
  }

  $('tap').onclick = toggle;
  $('playBtn').onclick = toggle;
  $('muteBtn').onclick = function () { if (!ready) return; player.isMuted() ? player.unMute() : player.mute(); setTimeout(render, 50); };
  $('seek').oninput = function () { dragging = true; $('time').textContent = fmt(this.value) + ' / ' + fmt(player.getDuration()); };
  $('seek').onchange = function () { dragging = false; player.seekTo(Number(this.value), true); render(); };

  window.onYouTubeIframeAPIReady = function () {
    player = new YT.Player('player', {
      videoId: ${JSON.stringify(videoId)},
      host: 'https://www.youtube-nocookie.com',
      width: '100%',
      height: '100%',
      playerVars: { autoplay: 1, controls: 0, disablekb: 1, fs: 0, rel: 0, playsinline: 1, iv_load_policy: 3, origin: ${JSON.stringify(origin)} },
      events: {
        onReady: function () {
          ready = true;
          $('msg').style.display = 'none';
          ['playBtn', 'muteBtn', 'seek'].forEach(function (id) { $(id).disabled = false; });
          render();
        },
        onStateChange: function (e) {
          state = e.data;
          clearInterval(timer);
          if (playing()) timer = setInterval(render, 250);
          render();
        },
        onError: fail
      }
    });
  };
</script>
<script src="https://www.youtube.com/iframe_api" onerror="fail()"></script>
</body>
</html>`;
}
