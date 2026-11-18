// camera.js — live camera and the card-shaped guide (ported from the prototype).

let stream = null;

/** Starts the rear camera at the highest resolution the phone offers. Needs https or localhost. */
export async function startCamera(video) {
  stopCamera();
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error(window.isSecureContext === false
      ? 'The live camera only works from an https:// link.'
      : "This browser can't open the camera.");
  }
  stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: { ideal: 'environment' }, width: { ideal: 3840 }, height: { ideal: 2160 } },
  });
  video.srcObject = stream;
  await video.play().catch(() => {});
  const track = stream.getVideoTracks()[0];
  let caps = {};
  try { caps = track.getCapabilities ? track.getCapabilities() : {}; } catch (e) { /* not supported */ }
  return { track, torch: !!caps.torch };
}

export function stopCamera() {
  if (stream) stream.getTracks().forEach((t) => t.stop());
  stream = null;
}

/**
 * Copies the part of the video that sits inside the on-screen guide box.
 * The video is drawn with object-fit: cover, so screen coordinates are mapped back to video pixels.
 */
export function grabFrame(video, camEl, guideEl, margin = 0.04) {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return null;
  const er = camEl.getBoundingClientRect();
  const gr = guideEl.getBoundingClientRect();
  const scale = Math.max(er.width / vw, er.height / vh);
  const ox = (er.width - vw * scale) / 2;
  const oy = (er.height - vh * scale) / 2;
  let sx = (gr.left - er.left - gr.width * margin - ox) / scale;
  let sy = (gr.top - er.top - gr.height * margin - oy) / scale;
  let sw = (gr.width * (1 + 2 * margin)) / scale;
  let sh = (gr.height * (1 + 2 * margin)) / scale;
  sx = Math.max(0, sx);
  sy = Math.max(0, sy);
  sw = Math.min(vw - sx, sw);
  sh = Math.min(vh - sy, sh);
  const c = document.createElement('canvas');
  c.width = Math.round(sw);
  c.height = Math.round(sh);
  c.getContext('2d').drawImage(video, sx, sy, sw, sh, 0, 0, c.width, c.height);
  return c;
}

/** Small JPEG thumbnail for the list. */
export function thumbUrl(canvas, width = 120) {
  const t = document.createElement('canvas');
  t.width = width;
  t.height = Math.round((canvas.height * width) / canvas.width);
  t.getContext('2d').drawImage(canvas, 0, 0, t.width, t.height);
  return t.toDataURL('image/jpeg', 0.7);
}
