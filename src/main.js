// Vice Cover Studio — editor wiring.
//
// Owns the page state, the photo tray, panel picking (click to select,
// drag to pan, wheel to zoom), the export sizes, and the honest screenshot
// mode: ?shot=cover|editor loads a sample photo and a caption from the
// URL and raises window.__shotReady once painted, so a screenshot taken
// in a browser shows the real app and its real output.

import { drawCover, panelRects, LAYOUTS, GRADES } from './cover.js';

const SIZES = {
  '1080x1080': { w: 1080, h: 1080, label: 'Square · 1080 × 1080' },
  '1080x1350': { w: 1080, h: 1350, label: 'Portrait · 1080 × 1350' },
  '1920x1080': { w: 1920, h: 1080, label: 'Wide · 1920 × 1080' },
};

const $ = (id) => document.getElementById(id);
const canvas = $('cover');
const ctx = canvas.getContext('2d');

const state = {
  layout: 'hero',
  slots: [
    { photo: null, zoom: 1, ox: 0, oy: 0 },
    { photo: null, zoom: 1, ox: 0, oy: 0 },
    { photo: null, zoom: 1, ox: 0, oy: 0 },
    { photo: null, zoom: 1, ox: 0, oy: 0 },
  ],
  selected: 0,
  title: 'SUNSET HEIST',
  subtitle: 'A SUNSET STORY',
  grade: 'sunset',
  gradeAmount: 0.85,
  grain: true,
  size: '1080x1080',
  photos: [], // { id, name, img }
};

let photoSeq = 0;

function size() {
  return SIZES[state.size];
}

function render() {
  const s = size();
  if (canvas.width !== s.w || canvas.height !== s.h) {
    canvas.width = s.w;
    canvas.height = s.h;
  }
  drawCover(ctx, state, s.w, s.h);
  document.querySelectorAll('#layouts button').forEach((b) => {
    b.classList.toggle('active', b.dataset.layout === state.layout);
  });
  document.querySelectorAll('#grades button').forEach((b) => {
    b.classList.toggle('active', b.dataset.grade === state.grade);
  });
  document.querySelectorAll('#sizes button').forEach((b) => {
    b.classList.toggle('active', b.dataset.size === state.size);
  });
  $('zoom').value = String(Math.round((state.slots[state.selected]?.zoom ?? 1) * 100));
  $('zoomVal').textContent = `${Math.round((state.slots[state.selected]?.zoom ?? 1) * 100)}%`;
  renderTray();
}

function status(msg) {
  $('status').textContent = msg;
}

function renderTray() {
  const tray = $('tray');
  tray.innerHTML = '';
  for (const p of state.photos) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'thumb';
    btn.title = `Use ${p.name} in the selected panel`;
    const img = document.createElement('img');
    img.src = p.img.src;
    img.alt = p.name;
    btn.appendChild(img);
    btn.addEventListener('click', () => assignPhoto(p));
    tray.appendChild(btn);
  }
  if (state.photos.length === 0) {
    const hint = document.createElement('p');
    hint.className = 'muted';
    hint.textContent = 'No photos yet — upload one, or try a sample below.';
    tray.appendChild(hint);
  }
}

function assignPhoto(p) {
  const slot = state.slots[state.selected];
  slot.photo = p.img;
  slot.zoom = 1;
  slot.ox = 0;
  slot.oy = 0;
  render();
  status(`${p.name} is in panel ${state.selected + 1}. Drag it to position, scroll to zoom.`);
}

function addPhoto(img, name) {
  const p = { id: ++photoSeq, name, img };
  state.photos.push(p);
  // First photo fills every empty slot, so one tap gives a finished cover.
  let filled = false;
  for (const slot of state.slots) {
    if (!slot.photo) {
      slot.photo = img;
      filled = true;
    }
  }
  render();
  status(filled ? `${name} loaded — your cover is ready to export.` : `${name} loaded — pick it from the tray to use it.`);
  return p;
}

function loadImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.onload = () => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('That file is not an image.'));
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function loadSample(name) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Sample ${name} did not load.`));
    img.src = `samples/${name}.jpg`;
  });
}

async function handleFiles(files) {
  const images = [...files].filter((f) => f.type.startsWith('image/'));
  if (images.length === 0) {
    status('That was not an image file.');
    return;
  }
  for (const file of images) {
    try {
      const img = await loadImageFile(file);
      addPhoto(img, file.name);
    } catch (err) {
      status(err.message);
    }
  }
}

// --- Pointer input on the canvas: click picks a panel, drag pans it. ---
let drag = null;

function canvasPoint(ev) {
  const rect = canvas.getBoundingClientRect();
  const s = size();
  return {
    x: ((ev.clientX - rect.left) / rect.width) * s.w,
    y: ((ev.clientY - rect.top) / rect.height) * s.h,
  };
}

canvas.addEventListener('pointerdown', (ev) => {
  const pt = canvasPoint(ev);
  const rects = panelRects(state, size().w, size().h);
  const hit = rects.findIndex(
    (r) => pt.x >= r.x && pt.x <= r.x + r.w && pt.y >= r.y && pt.y <= r.y + r.h,
  );
  if (hit === -1) return;
  state.selected = hit;
  const slot = state.slots[hit];
  drag = { x: pt.x, y: pt.y, ox: slot.ox, oy: slot.oy, rect: rects[hit] };
  canvas.setPointerCapture(ev.pointerId);
  render();
});

canvas.addEventListener('pointermove', (ev) => {
  if (!drag) return;
  const pt = canvasPoint(ev);
  const slot = state.slots[state.selected];
  slot.ox = drag.ox + (pt.x - drag.x) / drag.rect.w;
  slot.oy = drag.oy + (pt.y - drag.y) / drag.rect.h;
  render();
});

canvas.addEventListener('pointerup', () => {
  drag = null;
});

canvas.addEventListener('wheel', (ev) => {
  ev.preventDefault();
  const slot = state.slots[state.selected];
  const factor = ev.deltaY < 0 ? 1.12 : 1 / 1.12;
  slot.zoom = Math.max(1, Math.min(4, (slot.zoom || 1) * factor));
  render();
}, { passive: false });

// --- Controls ---
$('file').addEventListener('change', (ev) => {
  handleFiles(ev.target.files);
  ev.target.value = '';
});

window.addEventListener('dragover', (ev) => ev.preventDefault());
window.addEventListener('drop', (ev) => {
  ev.preventDefault();
  if (ev.dataTransfer?.files?.length) handleFiles(ev.dataTransfer.files);
});

document.querySelectorAll('#samples button').forEach((b) => {
  b.addEventListener('click', async () => {
    try {
      const img = await loadSample(b.dataset.sample);
      addPhoto(img, `${b.dataset.sample}.jpg`);
    } catch (err) {
      status(err.message);
    }
  });
});

document.querySelectorAll('#layouts button').forEach((b) => {
  b.addEventListener('click', () => {
    state.layout = b.dataset.layout;
    const count = LAYOUTS[state.layout].panels.length;
    if (state.selected >= count) state.selected = 0;
    render();
    status(`Layout: ${LAYOUTS[state.layout].label}. Click a panel, then a photo, to fill it.`);
  });
});

document.querySelectorAll('#grades button').forEach((b) => {
  b.addEventListener('click', () => {
    state.grade = b.dataset.grade;
    render();
    status(`Grade: ${GRADES[state.grade].label}.`);
  });
});

document.querySelectorAll('#sizes button').forEach((b) => {
  b.addEventListener('click', () => {
    state.size = b.dataset.size;
    render();
    status(`Export size: ${SIZES[state.size].label}.`);
  });
});

$('gradeAmount').addEventListener('input', (ev) => {
  state.gradeAmount = Number(ev.target.value) / 100;
  render();
});

$('grain').addEventListener('change', (ev) => {
  state.grain = ev.target.checked;
  render();
});

$('zoom').addEventListener('input', (ev) => {
  const slot = state.slots[state.selected];
  slot.zoom = Math.max(1, Math.min(4, Number(ev.target.value) / 100));
  render();
});

$('fillAll').addEventListener('click', () => {
  const slot = state.slots[state.selected];
  if (!slot.photo) {
    status('The selected panel has no photo yet.');
    return;
  }
  for (const s of state.slots) {
    s.photo = slot.photo;
    s.zoom = 1;
    s.ox = 0;
    s.oy = 0;
  }
  render();
  status('One photo now fills every panel.');
});

$('resetPan').addEventListener('click', () => {
  const slot = state.slots[state.selected];
  slot.zoom = 1;
  slot.ox = 0;
  slot.oy = 0;
  render();
  status('Panel position reset.');
});

$('title').addEventListener('input', (ev) => {
  state.title = ev.target.value;
  render();
});

$('subtitle').addEventListener('input', (ev) => {
  state.subtitle = ev.target.value;
  render();
});

$('export').addEventListener('click', () => {
  const s = size();
  const out = document.createElement('canvas');
  out.width = s.w;
  out.height = s.h;
  drawCover(out.getContext('2d'), state, s.w, s.h);
  out.toBlob((blob) => {
    if (!blob) {
      status('Export failed — the canvas could not make a PNG.');
      return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `vice-cover-${s.w}x${s.h}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    status(`Exported vice-cover-${s.w}x${s.h}.png — share it anywhere.`);
  }, 'image/png');
});

// --- Screenshot mode ---
// ?shot=cover shows the cover alone; ?shot=editor shows the editor with a
// sample loaded. Params: photo (pier|boulevard), layout, size, title,
// subtitle, grade. window.__shotReady fires once painted, so a screenshot
// runner knows the shot is real.
async function runShot() {
  const q = new URLSearchParams(location.search);
  const shot = q.get('shot');
  if (!shot) return false;
  const photo = q.get('photo') ?? 'pier';
  if (q.get('layout') && LAYOUTS[q.get('layout')]) state.layout = q.get('layout');
  if (q.get('size') && SIZES[q.get('size')]) state.size = q.get('size');
  if (q.get('title') !== null) {
    state.title = q.get('title');
    $('title').value = state.title;
  }
  if (q.get('subtitle') !== null) {
    state.subtitle = q.get('subtitle');
    $('subtitle').value = state.subtitle;
  }
  if (q.get('grade') && GRADES[q.get('grade')]) state.grade = q.get('grade');
  if (shot === 'cover') document.body.classList.add('shot-cover');
  try {
    const img = await loadSample(photo);
    addPhoto(img, `${photo}.jpg`);
  } catch (err) {
    status(err.message);
  }
  render();
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      window.__shotReady = true;
    }),
  );
  return true;
}

render();
runShot();
