// Vice Cover Studio — cover render engine.
//
// drawCover(ctx, state, W, H) paints one GTA-style multi-panel poster cover:
// white-guttered photo panels, a Vice City sunset / neon colour grade,
// vignette + film grain, and bold poster lettering. Pure canvas, no
// network, no fonts beyond the system stack. The same function draws the
// live preview and the exported PNG, so what you see is what you get.

export const LAYOUTS = {
  hero: {
    label: 'Hero',
    panels: [{ x: 0, y: 0, w: 1, h: 1 }],
  },
  split: {
    label: 'Split',
    panels: [
      { x: 0, y: 0, w: 0.5, h: 1 },
      { x: 0.5, y: 0, w: 0.5, h: 1 },
    ],
  },
  trio: {
    label: 'Trio',
    panels: [
      { x: 0, y: 0, w: 0.62, h: 1 },
      { x: 0.62, y: 0, w: 0.38, h: 0.5 },
      { x: 0.62, y: 0.5, w: 0.38, h: 0.5 },
    ],
  },
  grid: {
    label: 'Grid',
    panels: [
      { x: 0, y: 0, w: 0.5, h: 0.5 },
      { x: 0.5, y: 0, w: 0.5, h: 0.5 },
      { x: 0, y: 0.5, w: 0.5, h: 0.5 },
      { x: 0.5, y: 0.5, w: 0.5, h: 0.5 },
    ],
  },
};

// One grade = a sky gradient washed over the photo, a glow, and the
// vignette strength. All colours are ours; nothing here is Rockstar art.
export const GRADES = {
  sunset: {
    label: 'Vice Sunset',
    stops: [
      [0, '#ff2d78'],
      [0.45, '#ff7a18'],
      [1, '#7b2ff7'],
    ],
    mode: 'soft-light',
    glow: { x: 0.3, y: 0.68, r: 0.55, color: '#ff9a3d', alpha: 0.35 },
    vignette: 0.5,
  },
  neon: {
    label: 'Neon Nights',
    stops: [
      [0, '#00e5ff'],
      [0.5, '#ff2bd6'],
      [1, '#2b1bff'],
    ],
    mode: 'overlay',
    glow: { x: 0.72, y: 0.3, r: 0.5, color: '#00e5ff', alpha: 0.3 },
    vignette: 0.55,
  },
  noir: {
    label: 'Vice Noir',
    stops: [
      [0, '#3d0a5e'],
      [1, '#0a0616'],
    ],
    mode: 'multiply',
    glow: { x: 0.5, y: 0.2, r: 0.6, color: '#b14bff', alpha: 0.28 },
    vignette: 0.7,
  },
};

export const GUTTER_COLOR = '#f4efe4';
export const SCRIM_COLOR = 'rgba(8, 4, 18, 0.55)';

// A 128 x 128 tile of random grey noise, reused as the film grain.
let grainTile = null;
function getGrainTile() {
  if (grainTile) return grainTile;
  const tile = document.createElement('canvas');
  tile.width = 128;
  tile.height = 128;
  const g = tile.getContext('2d');
  const img = g.createImageData(128, 128);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 96 + Math.floor(Math.random() * 96);
    img.data[i] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  grainTile = tile;
  return tile;
}

// Where a photo lands inside its panel: cover-fit, scaled by zoom, panned
// by ox/oy (fractions of the panel size). Returns the draw rect plus the
// pan limits, so dragging can never expose the panel edge.
export function fitPhoto(img, panel, zoom, ox, oy) {
  const scale = Math.max(panel.w / img.width, panel.h / img.height) * zoom;
  const dw = img.width * scale;
  const dh = img.height * scale;
  const maxOx = Math.max(0, (dw - panel.w) / 2 / panel.w);
  const maxOy = Math.max(0, (dh - panel.h) / 2 / panel.h);
  const cx = Math.max(-maxOx, Math.min(maxOx, ox));
  const cy = Math.max(-maxOy, Math.min(maxOy, oy));
  return {
    x: panel.x + (panel.w - dw) / 2 + cx * panel.w,
    y: panel.y + (panel.h - dh) / 2 + cy * panel.h,
    w: dw,
    h: dh,
    maxOx,
    maxOy,
    ox: cx,
    oy: cy,
  };
}

// Shrink the font until the text fits maxWidth; returns the size used.
function fitFont(ctx, text, maxWidth, startPx, family) {
  let px = startPx;
  while (px > 12) {
    ctx.font = `900 ${px}px ${family}`;
    if (ctx.measureText(text).width <= maxWidth) break;
    px -= 2;
  }
  return px;
}

const TITLE_FAMILY = '"Arial Black", "Helvetica Neue", Arial, sans-serif';
const SUB_FAMILY = '"Helvetica Neue", Arial, sans-serif';

function drawLettering(ctx, state, W, H) {
  const pad = W * 0.045;
  const title = (state.title || '').toUpperCase();
  const sub = (state.subtitle || '').toUpperCase();
  if (!title && !sub) return;

  // A dark scrim along the bottom so white letters read on any photo.
  const scrimH = H * 0.24;
  const scrim = ctx.createLinearGradient(0, H - scrimH, 0, H);
  scrim.addColorStop(0, 'rgba(8, 4, 18, 0)');
  scrim.addColorStop(1, SCRIM_COLOR);
  ctx.fillStyle = scrim;
  ctx.fillRect(0, H - scrimH, W, scrimH);

  const maxW = W - pad * 2;
  let cursorY = H - pad;

  if (title) {
    const startPx = Math.round(W * 0.105);
    const px = fitFont(ctx, title, maxW, startPx, TITLE_FAMILY);
    ctx.save();
    ctx.translate(pad, cursorY);
    ctx.rotate(-0.02); // a whisper of poster tilt
    ctx.scale(0.94, 1); // condensed, poster-like
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    try {
      ctx.letterSpacing = '1px';
    } catch {
      /* older canvas: ignore */
    }
    const grad = ctx.createLinearGradient(0, -px, 0, 0);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(1, '#ffd9a0');
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(3, px * 0.11);
    ctx.strokeStyle = '#0a0514';
    ctx.strokeText(title, 0, 0);
    ctx.fillStyle = grad;
    ctx.fillText(title, 0, 0);
    ctx.restore();
    cursorY -= px * 1.12;
  }

  if (sub) {
    const px = Math.round(W * 0.032);
    ctx.save();
    ctx.font = `700 ${px}px ${SUB_FAMILY}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    try {
      ctx.letterSpacing = `${Math.max(2, px * 0.28)}px`;
    } catch {
      /* older canvas: ignore */
    }
    ctx.fillStyle = '#ffe14d';
    ctx.fillText(sub, pad, cursorY);
    ctx.restore();
    cursorY -= px * 1.4;
  }

  // Neon accent bar under the block.
  const barW = W * 0.16;
  const barH = Math.max(4, H * 0.008);
  const bar = ctx.createLinearGradient(pad, 0, pad + barW, 0);
  bar.addColorStop(0, '#ff2d78');
  bar.addColorStop(1, '#00e5ff');
  ctx.fillStyle = bar;
  ctx.fillRect(pad, cursorY - barH, barW, barH);
}

function drawGrade(ctx, grade, amount, W, H) {
  if (amount <= 0) return;
  const sky = ctx.createLinearGradient(0, 0, W * 0.25, H);
  for (const [at, color] of grade.stops) sky.addColorStop(at, color);
  ctx.save();
  ctx.globalCompositeOperation = grade.mode;
  ctx.globalAlpha = Math.min(1, amount);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();

  const g = grade.glow;
  const glow = ctx.createRadialGradient(
    g.x * W,
    g.y * H,
    0,
    g.x * W,
    g.y * H,
    g.r * Math.max(W, H),
  );
  glow.addColorStop(0, g.color);
  glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = g.alpha * amount;
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

function drawVignette(ctx, strength, W, H) {
  const v = ctx.createRadialGradient(
    W / 2,
    H / 2,
    Math.min(W, H) * 0.42,
    W / 2,
    H / 2,
    Math.max(W, H) * 0.75,
  );
  v.addColorStop(0, 'rgba(8, 4, 18, 0)');
  v.addColorStop(1, `rgba(8, 4, 18, ${0.55 * strength})`);
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);
}

function drawGrain(ctx, W, H) {
  const tile = getGrainTile();
  const pattern = ctx.createPattern(tile, 'repeat');
  if (!pattern) return;
  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = 0.09;
  ctx.fillStyle = pattern;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

// state: { layout, slots: [{photo, zoom, ox, oy} x4], title, subtitle,
//          grade, gradeAmount, grain, selected }
// slots are positional: layout N uses slots[0..N-1].
export function drawCover(ctx, state, W, H) {
  const layout = LAYOUTS[state.layout] ?? LAYOUTS.hero;
  const grade = GRADES[state.grade] ?? GRADES.sunset;
  const gutter = Math.max(2, Math.round(W * 0.008));

  ctx.save();
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = GUTTER_COLOR;
  ctx.fillRect(0, 0, W, H);

  for (let i = 0; i < layout.panels.length; i++) {
    const r = layout.panels[i];
    const panel = {
      x: r.x * W + gutter,
      y: r.y * H + gutter,
      w: r.w * W - gutter * 2,
      h: r.h * H - gutter * 2,
    };
    ctx.save();
    ctx.beginPath();
    ctx.rect(panel.x, panel.y, panel.w, panel.h);
    ctx.clip();
    const slot = state.slots[i];
    if (slot && slot.photo) {
      const fit = fitPhoto(slot.photo, panel, slot.zoom || 1, slot.ox || 0, slot.oy || 0);
      ctx.drawImage(slot.photo, fit.x, fit.y, fit.w, fit.h);
    } else {
      // Empty panel: a dark placeholder with a thin neon frame.
      ctx.fillStyle = '#17102a';
      ctx.fillRect(panel.x, panel.y, panel.w, panel.h);
      ctx.strokeStyle = 'rgba(0, 229, 255, 0.5)';
      ctx.lineWidth = Math.max(1, W * 0.002);
      ctx.strokeRect(panel.x + 8, panel.y + 8, panel.w - 16, panel.h - 16);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
      ctx.font = `600 ${Math.round(W * 0.022)}px ${SUB_FAMILY}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('ADD A PHOTO', panel.x + panel.w / 2, panel.y + panel.h / 2);
    }
    ctx.restore();
  }

  drawGrade(ctx, grade, state.gradeAmount ?? 0.85, W, H);
  drawVignette(ctx, grade.vignette, W, H);
  if (state.grain !== false) drawGrain(ctx, W, H);
  drawLettering(ctx, state, W, H);

  ctx.restore();
}

// Panel rects in canvas pixels, for hit-testing pointer input.
export function panelRects(state, W, H) {
  const layout = LAYOUTS[state.layout] ?? LAYOUTS.hero;
  const gutter = Math.max(2, Math.round(W * 0.008));
  return layout.panels.map((r) => ({
    x: r.x * W + gutter,
    y: r.y * H + gutter,
    w: r.w * W - gutter * 2,
    h: r.h * H - gutter * 2,
  }));
}
