// src/game/toolsUI.js
import Phaser from 'phaser';
import { heightToColor } from './terrain';

/* ------------------------------------------------------------------ */
/* small helpers: screen-space UI hit-testing to block brush actions  */
/* ------------------------------------------------------------------ */
function registerUIRect(scene, key, rect) {
  if (!scene._uiRects) scene._uiRects = {};
  scene._uiRects[key] = rect; // {x,y,width,height} in SCREEN coords
}
function updateUIRect(scene, key, rect) {
  if (!scene._uiRects) return;
  scene._uiRects[key] = rect;
}

/** Return true if pointer is over any registered UI rectangle */
export function isOverUI(scene, pointer) {
  if (!scene._uiRects) return false;
  const x = pointer.x;
  const y = pointer.y;
  for (const k in scene._uiRects) {
    const r = scene._uiRects[k];
    if (!r) continue;
    if (x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height) {
      return true;
    }
  }
  return false;
}

/* ------------------------------------------------------------------ */
/*                        NAVBAR (top–center)                          */
/* ------------------------------------------------------------------ */
export function createNavbar(scene) {
  const padX = 16;
  const padY = 8;
  const gap = 24;

  const btnStyle = {
    fontFamily: 'monospace',
    fontSize: '20px',
    color: '#e8e8e8',
  };

  // Tools: Mouse / Brush / Corridor / Path / Erase
  const defs = [
    { label: 'Mouse',    key: 'mouse',    cursor: 'default'     },
    { label: 'Brush',    key: 'brush',    cursor: 'crosshair'   },
    { label: 'Corridor', key: 'corridor', cursor: 'crosshair'   },
    { label: 'Path',     key: 'path',     cursor: 'crosshair'   },
    { label: 'Erase',    key: 'erase',    cursor: 'not-allowed' },
  ];

  // create text buttons
  const btns = defs.map((d) =>
    scene.add
      .text(0, 0, d.label, btnStyle)
      .setScrollFactor(0)
      .setDepth(1801)
      .setInteractive({ cursor: 'pointer' })
  );

  // compute background size from ALL buttons
  const maxH = btns.reduce((m, b) => Math.max(m, b.height), 0);
  const totalTextWidth = btns.reduce((s, b, i) => s + b.width + (i ? gap : 0), 0);
  const totalW = totalTextWidth + padX * 2;
  const totalH = maxH + padY * 2;

  let x = Math.round(scene.scale.width / 2 - totalW / 2);
  let y = 8;

  const bg = scene.add
    .rectangle(x, y, totalW, totalH, 0x111318, 0.92)
    .setOrigin(0, 0)
    .setScrollFactor(0)
    .setDepth(1800)
    .setStrokeStyle(1, 0xffffff, 0.08);

  // layout buttons horizontally
  function layoutButtons() {
    let bx = x + padX;
    const by = y + padY;
    btns.forEach((b) => {
      b.setPosition(bx, by);
      bx += b.width + gap;
    });
  }
  layoutButtons();

  // register hit-rect so tools don't act through UI
  registerUIRect(scene, 'navbar', { x, y, width: totalW, height: totalH });

  function renderState() {
    const active = scene.tool || 'mouse';
    btns.forEach((b, i) =>
      b.setColor(defs[i].key === active ? '#9cd2ff' : '#e8e8e8')
    );
  }

  // click handlers
  btns.forEach((b, i) => {
    const d = defs[i];
    b.on('pointerup', () => {
      scene.tool = d.key;
      scene.input.setDefaultCursor(d.cursor);
      scene.events.emit('tool-changed', d.key);
      renderState();
    });
  });

  // keep centered on resize
  const onResize = () => {
    x = Math.round(scene.scale.width / 2 - totalW / 2);
    bg.setPosition(x, y);
    layoutButtons();
    updateUIRect(scene, 'navbar', { x, y, width: totalW, height: totalH });
  };
  scene.scale.on('resize', onResize);

  // init visual state
  if (!scene.tool) scene.tool = 'mouse';
  renderState();

  return {
    relayout: onResize,
    destroy() {
      scene.scale.off('resize', onResize);
      bg.destroy();
      btns.forEach((b) => b.destroy());
    },
  };
}

/* ------------------------------------------------------------------ */
/*                       HEIGHT PALETTE (bottom-right)                 */
/* ------------------------------------------------------------------ */
export function createHeightPalette(scene, opt) {
  const { minH, maxH } = opt;
  let current = typeof opt.initial === 'number' ? opt.initial : 0;
  current = Phaser.Math.Clamp(current, minH, maxH);
  scene.currentHeight = current;

  let step = 50;

  const w = 260;
  const h = 96;
  const pad = 10;

  let x = scene.scale.width - (w + 14);
  let y = scene.scale.height - (h + 14);

  const bg = scene.add
    .rectangle(x, y, w, h, 0x111318, 0.92)
    .setOrigin(0, 0)
    .setScrollFactor(0)
    .setDepth(1700)
    .setStrokeStyle(1, 0xffffff, 0.08);

  // gradient bar
  const grad = scene.add.graphics().setScrollFactor(0).setDepth(1701);
  const gradRect = new Phaser.Geom.Rectangle(x + pad, y + pad, w - pad * 2, 16);

  const minTxt = scene.add
    .text(x + pad, y + pad + 20, `min: ${minH} m`, {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: '#9cd2ff',
    })
    .setScrollFactor(0)
    .setDepth(1701);

  const maxTxt = scene.add
    .text(x + w - pad, y + pad + 20, `max: ${maxH} m`, {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: '#9cd2ff',
    })
    .setOrigin(1, 0)
    .setScrollFactor(0)
    .setDepth(1701);

  const valueTxt = scene.add
    .text(0, 0, '', {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#ffffff',
    })
    .setScrollFactor(0)
    .setDepth(1702);

  const knob = scene.add
    .circle(0, 0, 6, 0xffffff, 1)
    .setScrollFactor(0)
    .setDepth(1702)
    .setInteractive({ useHandCursor: true });

  scene.input.setDraggable(knob);

  const stepLabel = scene.add
    .text(x + pad, y + h - 22, `Step: ${step}`, {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: '#9cd2ff',
    })
    .setScrollFactor(0)
    .setDepth(1701)
    .setInteractive({ cursor: 'text' });

  const updateStepLabel = () => stepLabel.setText(`Step: ${step}`);

  stepLabel.on('pointerdown', () => {
    const ns = Number(prompt('Enter step value (m):', step));
    if (!Number.isNaN(ns) && ns > 0) {
      step = ns;
      updateStepLabel();
    }
  });

  function drawGradient() {
    grad.clear();
    const steps = Math.max(2, Math.floor(gradRect.width));
    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1);
      const hVal = Math.round(minH + t * (maxH - minH));
      const color = heightToColor(hVal, minH, maxH);
      grad.fillStyle(color, 1).fillRect(
        gradRect.x + i,
        gradRect.y,
        1,
        gradRect.height
      );
    }
    grad.lineStyle(1, 0xffffff, 0.12);
    grad.strokeRect(gradRect.x, gradRect.y, gradRect.width, gradRect.height);
  }

  function setKnobByHeight(hVal) {
    current = Phaser.Math.Clamp(hVal, minH, maxH);
    scene.currentHeight = current;
    const t = (current - minH) / (maxH - minH || 1);
    const kx = Phaser.Math.Clamp(
      gradRect.x + t * gradRect.width,
      gradRect.x,
      gradRect.right
    );
    knob.setPosition(kx, gradRect.y + gradRect.height + 18);
    valueTxt.setPosition(kx - 16, knob.y + 10);
    valueTxt.setText(`${current} m`);
  }

  // initial draw + position
  drawGradient();
  setKnobByHeight(current);
  updateStepLabel();

  // drag knob
  knob.on('drag', (_p, dragX) => {
    const clampedX = Phaser.Math.Clamp(dragX, gradRect.x, gradRect.right);
    const t = (clampedX - gradRect.x) / (gradRect.width || 1);
    const raw = Math.round(minH + t * (maxH - minH));
    const snapped = Math.round(raw / step) * step;
    setKnobByHeight(snapped);
  });

  // click bar to jump
  const hitBar = scene.add
    .rectangle(gradRect.x, gradRect.y, gradRect.width, gradRect.height, 0x000000, 0)
    .setOrigin(0, 0)
    .setScrollFactor(0)
    .setDepth(1703)
    .setInteractive({ cursor: 'pointer' });
  hitBar.on('pointerdown', (p) => {
    const clampedX = Phaser.Math.Clamp(p.x, gradRect.x, gradRect.right);
    const t = (clampedX - gradRect.x) / (gradRect.width || 1);
    const raw = Math.round(minH + t * (maxH - minH));
    const snapped = Math.round(raw / step) * step;
    setKnobByHeight(snapped);
  });

  // wheel nudges
  bg.setInteractive({ cursor: 'default' }).on('wheel', (_p, _dx, dy) => {
    const dir = dy > 0 ? -1 : 1;
    setKnobByHeight(current + dir * step);
  });

  // register UI rect
  registerUIRect(scene, 'palette', { x, y, width: w, height: h });

  const onResize = () => {
    x = scene.scale.width - (w + 14);
    y = scene.scale.height - (h + 14);
    bg.setPosition(x, y);

    gradRect.x = x + pad;
    gradRect.y = y + pad;
    gradRect.width = w - pad * 2;

    minTxt.setPosition(x + pad, y + pad + 20);
    maxTxt.setPosition(x + w - pad, y + pad + 20).setOrigin(1, 0);

    hitBar.setPosition(gradRect.x, gradRect.y);
    hitBar.setSize(gradRect.width, gradRect.height);

    drawGradient();
    setKnobByHeight(current);

    stepLabel.setPosition(x + pad, y + h - 22);
    updateStepLabel();

    updateUIRect(scene, 'palette', { x, y, width: w, height: h });
  };
  scene.scale.on('resize', onResize);

  return {
    isOver: (p) =>
      p.x >= x &&
      p.x <= x + w &&
      p.y >= y &&
      p.y <= y + h,
    destroy() {
      scene.scale.off('resize', onResize);
      bg.destroy();
      grad.destroy();
      minTxt.destroy();
      maxTxt.destroy();
      knob.destroy();
      valueTxt.destroy();
      stepLabel.destroy();
      hitBar.destroy();
    },
  };
}
