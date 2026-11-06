(() => {
  const MAX_DELAY = 30;
  const STORE_W = 960, STORE_H = 540;
  const MAX_FRAMES = MAX_DELAY * 31; // hard cap on buffered frames

  const $ = (id) => document.getElementById(id);
  const video = $('cam'), canvas = $('display'), ctx = canvas.getContext('2d');
  const num = $('delayNum'), range = $('delayRange'), statusEl = $('status'), errorEl = $('error');

  let delay = 0;
  try { delay = clamp(parseInt(localStorage.getItem('delay'), 10) || 0); } catch {}
  let frames = []; // {t, bmp}
  let stream = null;

  function clamp(n) { return Math.max(0, Math.min(MAX_DELAY, n | 0)); }

  function setDelay(n) {
    delay = clamp(n);
    num.value = range.value = delay;
    try { localStorage.setItem('delay', delay); } catch {}
    if (delay === 0) clearFrames();
  }

  function clearFrames() {
    for (const f of frames) f.bmp.close();
    frames = [];
  }

  function showError(msg) { errorEl.textContent = msg; errorEl.hidden = false; }

  async function start() {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }, audio: false });
    } catch (e) {
      const denied = e && (e.name === 'NotAllowedError' || e.name === 'SecurityError');
      showError(denied
        ? 'Camera access was denied. Allow it in your browser, and on macOS in System Settings → Privacy & Security → Camera, then reload.'
        : 'Could not open a camera (' + (e && e.name) + '). Make sure one is connected and not in use by another app.');
      return;
    }
    video.srcObject = stream;
    await video.play();
    requestAnimationFrame(loop);
  }

  function drawCover(src, sw, sh) {
    if (canvas.width !== sw || canvas.height !== sh) { canvas.width = sw; canvas.height = sh; }
    ctx.drawImage(src, 0, 0, sw, sh);
  }

  async function loop() {
    requestAnimationFrame(loop);
    if (video.readyState < 2 || document.hidden) return;
    const now = performance.now();
    const vw = video.videoWidth, vh = video.videoHeight;

    if (delay === 0) {
      statusEl.hidden = true;
      drawCover(video, vw, vh);
      return;
    }

    // Capture downscaled frame into buffer.
    if (frames.length < MAX_FRAMES) {
      const h = Math.round(STORE_W * vh / vw);
      try {
        const bmp = await createImageBitmap(video, { resizeWidth: STORE_W, resizeHeight: h });
        frames.push({ t: now, bmp });
      } catch {}
    }

    // Find newest frame with t <= now - delay; drop older ones.
    const target = now - delay * 1000;
    let idx = -1;
    for (let i = 0; i < frames.length; i++) {
      if (frames[i].t <= target) idx = i; else break;
    }
    if (idx >= 0) {
      for (let i = 0; i < idx; i++) frames[i].bmp.close();
      frames.splice(0, idx);
      const f = frames[0];
      drawCover(f.bmp, f.bmp.width, f.bmp.height);
      statusEl.hidden = true;
    } else {
      const have = frames.length ? (now - frames[0].t) / 1000 : 0;
      statusEl.textContent = 'Buffering… ' + Math.max(0, Math.ceil(delay - have)) + 's';
      statusEl.hidden = false;
    }
  }

  num.addEventListener('change', () => setDelay(parseInt(num.value, 10) || 0));
  range.addEventListener('input', () => setDelay(parseInt(range.value, 10) || 0));
  $('minus').addEventListener('click', () => setDelay(delay - 1));
  $('plus').addEventListener('click', () => setDelay(delay + 1));

  window.addEventListener('keydown', (e) => {
    if (e.target === num) return;
    if (e.key === 'ArrowUp') { setDelay(delay + 1); e.preventDefault(); }
    else if (e.key === 'ArrowDown') { setDelay(delay - 1); e.preventDefault(); }
    else if (e.key === 'f' || e.key === 'F') {
      if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen();
    }
  });

  document.addEventListener('visibilitychange', () => { if (!document.hidden) clearFrames(); });
  window.addEventListener('pagehide', () => { if (stream) stream.getTracks().forEach((t) => t.stop()); clearFrames(); });

  setDelay(delay);
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showError('Camera access is not available. Open this page via http://localhost or HTTPS.');
  } else {
    start();
  }
})();
