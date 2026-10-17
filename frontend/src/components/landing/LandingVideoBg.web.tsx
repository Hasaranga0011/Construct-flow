import { Image } from 'react-native';

const BLUR = '0px';
const DIM = '0.50';
const LERP_FACTOR = 0.10;

let VIDEO_SRC = '';
try {
  const videoAsset = require('../../../assets/images/homepage_scroll.mp4');
  VIDEO_SRC = typeof videoAsset === 'string' ? videoAsset : (Image.resolveAssetSource(videoAsset)?.uri || '');
} catch {
  VIDEO_SRC = '';
}

export function injectVideoBackground(): () => void {
  if (typeof document === 'undefined') return () => {};

  if (!document.getElementById('cf-vbg-style')) {
    const s = document.createElement('style');
    s.id = 'cf-vbg-style';
    s.textContent = `
      :root{--vblur:${BLUR};--vdim:${DIM};}
      #cf-vbg{position:fixed;inset:0;width:100%;height:100vh;height:100dvh;z-index:0;overflow:hidden;
        background:linear-gradient(135deg,#0f172a 0%,#1e293b 55%,#0c1a2e 100%);}
      #cf-vbg video{position:absolute;top:50%;left:50%;min-width:100vw;min-height:100vh;width:auto;height:auto;
        transform:translate(-50%,-50%) scale(1.78);object-fit:cover;object-position:center center;
        filter:blur(var(--vblur)) brightness(0.65);
        opacity:0;transition:opacity 1s ease;}
      #cf-vbg.rdy video{opacity:1;}
      #cf-vbg video.rdy{opacity:1;}
      #cf-vbg .dim{position:absolute;inset:0;z-index:1;
        background:linear-gradient(to bottom,
          rgba(0,0,0,calc(var(--vdim)*.5)) 0%,
          rgba(0,0,0,var(--vdim)) 50%,
          rgba(0,0,0,calc(var(--vdim)*1.5)) 100%);}
      body{margin:0;overflow-x:hidden;}
      body, html, #root, [data-rnwstyle]{background-color: transparent !important;}
      body>[data-rnwstyle],body>#root{position:relative;z-index:1;}
    `;
    document.head.appendChild(s);
  }

  let c = document.getElementById('cf-vbg');
  if (!c) {
    c = document.createElement('div'); c.id = 'cf-vbg';
    const d = document.createElement('div'); d.className = 'dim';
    c.appendChild(d);
    document.body.insertBefore(c, document.body.firstChild);
  }

  let v = c.querySelector('video') as HTMLVideoElement | null;
  if (!v) {
    v = document.createElement('video');
    v.muted = true; v.playsInline = true;
    v.preload = 'auto'; v.autoplay = false;
    v.loop = false; v.src = VIDEO_SRC;
    c.appendChild(v);
    v.addEventListener('loadedmetadata', () => v!.classList.add('rdy'));
    v.load();
  }

  let raf = 0;
  let cur = 0;
  let tgt = 0;

  const progress = () => {
    return (window as any).__cfScrollProgress || 0;
  };

  const tick = () => {
    const vid = c!.querySelector('video') as HTMLVideoElement | null;
    if (vid && vid.readyState >= 1 && vid.duration > 0) {
      tgt = progress() * vid.duration;
      cur += (tgt - cur) * LERP_FACTOR;
      if (Math.abs(vid.currentTime - cur) > 0.008) vid.currentTime = cur;
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}
