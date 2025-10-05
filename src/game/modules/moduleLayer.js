// src/game/modules/moduleLayer.js
// Шар модулів усередині одного habitat.
// - Дефолтний розмір модуля 1×1.
// - Перетягування з клампом у межах будинку.
// - Заборона повного перекриття (>50% площі меншого) — дозволено "напівперекриття".
// - Автопідлаштування під ресайз будинку: якщо контейнер змінився — модулі
//   клампляться усередину нових меж і перемальовуються.
// - Видалення виділеного: Delete/Backspace.

import { MODULES } from './moduleLibrary.js';

export function attachModuleLayer(scene, houseContainer) {
  const tile = scene.tilePx || 32;
  const layer = scene.add.container(0, 0).setName('mods-layer');
  houseContainer.add(layer);

  /** актуальний розмір будинку в тайлах за фактом (від container.size) */
  const houseTiles = () => ({
    w: Math.max(1, Math.round(houseContainer.width / tile)),
    h: Math.max(1, Math.round(houseContainer.height / tile)),
  });

  /** @type {{id:string,key:string,tx:number,ty:number,w:number,h:number,cont:Phaser.GameObjects.Container,g:Phaser.GameObjects.Graphics,txt:Phaser.GameObjects.Text}[]} */
  const mods = [];
  let selected = null;

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  function overlapTiles(a, b) {
    const x1 = Math.max(a.tx, b.tx);
    const y1 = Math.max(a.ty, b.ty);
    const x2 = Math.min(a.tx + a.w, b.tx + b.w);
    const y2 = Math.min(a.ty + a.h, b.ty + b.h);
    const w = Math.max(0, x2 - x1);
    const h = Math.max(0, y2 - y1);
    return w * h;
  }

  function withinBounds(m) {
    const ht = houseTiles();
    return (
      m.tx >= 0 && m.ty >= 0 &&
      m.tx + m.w <= ht.w &&
      m.ty + m.h <= ht.h
    );
  }

  // ≤50% перекриття від меншого модуля
  function placementAllowed(test) {
    if (!withinBounds(test)) return false;
    for (const other of mods) {
      if (other === test) continue;
      const o = overlapTiles(test, other);
      if (o <= 0) continue;
      const minArea = Math.min(test.w * test.h, other.w * other.h);
      if (o > 0.5 * minArea) return false;
    }
    return true;
  }

  const colorFor = (key) => MODULES[key]?.color ?? 0x1d7a46;
  const shortFor = (key) => MODULES[key]?.short ?? key.slice(0, 3).toUpperCase();

  function drawMod(m) {
    if (!m.cont) {
      m.cont = scene.add.container(m.tx * tile, m.ty * tile);
      layer.add(m.cont);

      m.g = scene.add.graphics();
      m.cont.add(m.g);

      m.txt = scene.add
        .text(0, 0, shortFor(m.key), {
          fontFamily: 'monospace',
          fontSize: '12px',
          color: '#000000',
        })
        .setOrigin(0.5, 0.5)
        .setShadow(1, 1, '#ffffff', 0, true, true);
      m.cont.add(m.txt);

      // інтерактив + drag
      m.g.setInteractive(
        new Phaser.Geom.Rectangle(0, 0, m.w * tile, m.h * tile),
        Phaser.Geom.Rectangle.Contains
      );
      scene.input.setDraggable(m.g);

      m.g.on('pointerdown', () => select(m));
      m.g.on('drag', (_p, dragX, dragY) => {
        const ht = houseTiles();
        const tx = clamp(Math.round(dragX / tile), 0, ht.w - m.w);
        const ty = clamp(Math.round(dragY / tile), 0, ht.h - m.h);

        const prev = { tx: m.tx, ty: m.ty };
        m.tx = tx; m.ty = ty;
        if (placementAllowed(m)) {
          m.cont.setPosition(tx * tile, ty * tile);
          scene._updateIssues?.();
        } else {
          m.tx = prev.tx; m.ty = prev.ty;
          flashDenied(m);
        }
      });
    }

    // перемалювання
    m.g.clear();
    m.g.fillStyle(colorFor(m.key), 0.80).fillRect(0, 0, m.w * tile, m.h * tile);
    m.g.lineStyle(m === selected ? 2 : 1, 0xffffff, m === selected ? 0.95 : 0.35)
      .strokeRect(0, 0, m.w * tile, m.h * tile);

    m.txt.setText(shortFor(m.key));
    m.txt.setPosition((m.w * tile) / 2, (m.h * tile) / 2);

    m.cont.setPosition(m.tx * tile, m.ty * tile);
    m.g.input?.hitArea?.setTo?.(0, 0, m.w * tile, m.h * tile);
  }

  function flashDenied(m) {
    m.g.lineStyle(2, 0xff3b30, 0.9).strokeRect(0, 0, m.w * tile, m.h * tile);
    scene.time.delayedCall(120, () => drawMod(m));
  }

  function drawAll() { mods.forEach(drawMod); }
  function select(m) { selected = m; drawAll(); }

  // ДОДАНО: слідкуємо за зміною розміру будинку і клампимо модулі
  let lastW = houseTiles().w, lastH = houseTiles().h;
  const onUpdate = () => {
    const ht = houseTiles();
    if (ht.w === lastW && ht.h === lastH) return;
    lastW = ht.w; lastH = ht.h;

    let changed = false;
    for (const m of mods) {
      const ntx = clamp(m.tx, 0, Math.max(0, ht.w - m.w));
      const nty = clamp(m.ty, 0, Math.max(0, ht.h - m.h));
      if (ntx !== m.tx || nty !== m.ty) {
        m.tx = ntx; m.ty = nty;
        changed = true;
      }
      // якщо після різкого зменшення модуль більший за нові межі — підріжемо
      m.w = Math.min(m.w, ht.w);
      m.h = Math.min(m.h, ht.h);
    }
    if (changed) { drawAll(); scene._updateIssues?.(); }
  };
  scene.events.on('update', onUpdate);

  // ДОДАНО: при знищенні будинку прибираємо слухач
  houseContainer.once('destroy', () => scene.events.off('update', onUpdate));

  // 🔧 Дефолт 1×1
  function addModule(key, tx, ty, w = 1, h = 1) {
    const ht = houseTiles();
    w = clamp(w | 0, 1, ht.w);
    h = clamp(h | 0, 1, ht.h);
    tx = clamp((tx ?? 1) | 0, 0, Math.max(0, ht.w - w));
    ty = clamp((ty ?? 1) | 0, 0, Math.max(0, ht.h - h));

    const m = {
      id: `${key}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      key, tx, ty, w, h,
      cont: null, g: null, txt: null,
    };

    if (!placementAllowed(m)) {
      // пошук першої валідної позиції
      let placed = false;
      for (let r = 0; r <= ht.h - h && !placed; r++) {
        for (let c = 0; c <= ht.w - w && !placed; c++) {
          m.tx = c; m.ty = r;
          if (placementAllowed(m)) placed = true;
        }
      }
      if (!placed) return null;
    }

    mods.push(m);
    drawMod(m);
    select(m);
    scene._updateIssues?.();
    return m;
  }

  // Ресайз виділеного (стрілки, Shift = крок 2)
  scene.input.keyboard.on('keydown', (ev) => {
    if (!selected) return;
    const ht = houseTiles();
    const step = ev.shiftKey ? 2 : 1;

    const prev = { w: selected.w, h: selected.h };
    if (ev.code === 'ArrowRight') selected.w = clamp(selected.w + step, 1, ht.w - selected.tx);
    if (ev.code === 'ArrowLeft')  selected.w = clamp(selected.w - step, 1, ht.w - selected.tx);
    if (ev.code === 'ArrowDown')  selected.h = clamp(selected.h + step, 1, ht.h - selected.ty);
    if (ev.code === 'ArrowUp')    selected.h = clamp(selected.h - step, 1, ht.h - selected.ty);

    if (!placementAllowed(selected)) {
      selected.w = prev.w; selected.h = prev.h;
      flashDenied(selected);
      return;
    }
    drawMod(selected);
    scene._updateIssues?.();
  });

  // Видалення виділеного модуля
  function removeSelected() {
    if (!selected) return;
    const i = mods.indexOf(selected);
    if (i >= 0) {
      selected.cont?.destroy();
      selected.g?.destroy();
      selected.txt?.destroy();
      mods.splice(i, 1);
      selected = null;
      scene._updateIssues?.();
    }
  }
  scene.input.keyboard.on('keydown-DELETE', removeSelected);
  scene.input.keyboard.on('keydown-BACKSPACE', removeSelected);

  function list()  { return mods.map(m => ({ id: m.id, key: m.key, tx: m.tx, ty: m.ty, w: m.w, h: m.h })); }
  function remove(id) {
    const i = mods.findIndex(x => x.id === id);
    if (i >= 0) {
      const m = mods[i];
      m.cont?.destroy(); m.g?.destroy(); m.txt?.destroy();
      mods.splice(i, 1);
      if (selected === m) selected = null;
      scene._updateIssues?.();
    }
  }

  houseContainer.setData('modules', { addModule, list, remove, _mods: mods });
  return { addModule, list, remove };
}
