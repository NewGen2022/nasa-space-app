// src/game/corridors.js
// Темні коридори між habitat'ами з урахуванням рельєфу
// і можливістю ручного маршруту (waypoints).
//
// API:
//   const corrs = createCorridorSystem(scene)
//   corrs.activate() / corrs.deactivate()
//   corrs.redraw()              // коли бази зрушили/змінились
//   corrs.destroy()             // при перевідкритті сцени

import { isOverUI } from '../toolsUI';

export function createCorridorSystem(scene) {
  const tile = scene.tilePx || 32;
  const stepLimitM = 3 * (scene.tileMeters || 1); // максимально допустимий перепад між суміжними тайлами

  // візуальні параметри (темніші, ніж раніше)
  const COLOR = 0x3a414a;
  const ALPHA_MAIN = 0.98; // основна лінія
  const ALPHA_PREV = 0.7;  // прев'ю

  // утиліти висот
  const tileH = (tx, ty) =>
    (scene.heightMap?.[ty]?.[tx] ?? 0);

  // "порт" бази — центр нижнього ребра в тайлах
  const midBottomTile = (house) => {
    const m = house.getData('model') || { w: 1, h: 1 };
    return {
      x: Math.floor((house.x + (m.w * tile) / 2) / tile),
      y: Math.floor((house.y + (m.h * tile)) / tile),
    };
  };

  // відрізок тільки по одній осі та без "крутих" кроків
  const axisSegmentOK = (a, b) => {
    if (a.x !== b.x && a.y !== b.y) return false;
    if (a.x === b.x) {
      const x = a.x;
      const y0 = Math.min(a.y, b.y);
      const y1 = Math.max(a.y, b.y);
      let prev = tileH(x, y0);
      for (let y = y0 + 1; y <= y1; y++) {
        const h = tileH(x, y);
        if (Math.abs(h - prev) > stepLimitM) return false;
        prev = h;
      }
      return true;
    } else {
      const y = a.y;
      const x0 = Math.min(a.x, b.x);
      const x1 = Math.max(a.x, b.x);
      let prev = tileH(x0, y);
      for (let x = x0 + 1; x <= x1; x++) {
        const h = tileH(x, y);
        if (Math.abs(h - prev) > stepLimitM) return false;
        prev = h;
      }
      return true;
    }
  };

  // пробуємо Г-відрізок (L) — спочатку по X, потім Y, або навпаки
  const tryElbow = (a, b) => {
    const p1 = { x: b.x, y: a.y };
    if (axisSegmentOK(a, p1) && axisSegmentOK(p1, b)) return [a, p1, b];
    const p2 = { x: a.x, y: b.y };
    if (axisSegmentOK(a, p2) && axisSegmentOK(p2, b)) return [a, p2, b];
    return null;
  };

  // шлях між точками з урахуванням набору проміжних точок (ортогонально)
  const buildPath = (a, waypoints, b) => {
    const pts = [a];
    let cur = a;

    const addLeg = (next) => {
      const elbow = tryElbow(cur, next);
      if (!elbow) return false;
      pts.push(...elbow.slice(1)); // без дублю першої
      cur = next;
      return true;
    };

    for (const wp of waypoints) {
      if (!addLeg(wp)) return null; // не вийшло провести сегмент
    }
    if (!addLeg(b)) return null;
    return pts;
  };

  // малювання товстої лінії по тайлах
  const drawPath = (g, pts, widthTiles = 1) => {
    const wpx = Math.max(1, widthTiles) * tile;
    g.lineStyle(wpx, COLOR, ALPHA_MAIN);
    g.beginPath();
    g.moveTo(pts[0].x * tile + tile / 2, pts[0].y * tile + tile / 2);
    for (let i = 1; i < pts.length; i++) {
      g.lineTo(pts[i].x * tile + tile / 2, pts[i].y * tile + tile / 2);
    }
    g.strokePath();
  };

  // стан системи
  const state = {
    active: false,
    start: null,                                 // обрана перша база
    tmpWaypoints: /** @type {{x:number,y:number}[]} */ ([]),
    list: /** @type {{aIdx:number,bIdx:number, waypoints:{x:number,y:number}[]}[]} */ ([]),
    gfx: scene.add.graphics().setDepth(6).setAlpha(1),
    preview: scene.add.graphics().setDepth(7).setAlpha(ALPHA_PREV),
  };

  // публічне перемальовування (коли бази рухаються/міняються)
  const redraw = () => {
    const g = state.gfx;
    g.clear();
    for (const c of state.list) {
      const A = scene.houses?.[c.aIdx], B = scene.houses?.[c.bIdx];
      if (!A || !B) continue;
      const a = midBottomTile(A);
      const b = midBottomTile(B);
      const pts = buildPath(a, c.waypoints, b);
      if (pts) drawPath(g, pts, 1);
    }
  };

  // прев'ю під час прокладання
  const onPreview = (p) => {
    if (!state.active || !state.start) return;
    if (isOverUI(scene, p)) return;

    const a = midBottomTile(state.start);
    const hit = (scene.houses || []).find(h =>
      h.getBounds().contains(p.worldX, p.worldY)
    );
    const b = hit
      ? midBottomTile(hit)
      : { x: Math.floor(p.worldX / tile), y: Math.floor(p.worldY / tile) };

    const pts = buildPath(a, state.tmpWaypoints, b);
    state.preview.clear();
    if (pts) drawPath(state.preview, pts, 1);
  };

  // лівий клік: старт, або додати waypoint, або завершити на іншій базі
  const onClick = (p) => {
    if (!state.active) return;
    if (isOverUI(scene, p)) return;

    const clickedHab = (scene.houses || []).find(h =>
      h.getBounds().contains(p.worldX, p.worldY)
    );
    const gridPos = { x: Math.floor(p.worldX / tile), y: Math.floor(p.worldY / tile) };

    if (!state.start) {
      if (!clickedHab) return; // стартуємо тільки з бази
      state.start = clickedHab;
      state.tmpWaypoints.length = 0;
      state.preview.clear();
      return;
    }

    // завершення на іншій базі
    if (clickedHab && clickedHab !== state.start) {
      const aIdx = scene.houses.indexOf(state.start);
      const bIdx = scene.houses.indexOf(clickedHab);
      const a = midBottomTile(state.start);
      const b = midBottomTile(clickedHab);
      const pts = buildPath(a, state.tmpWaypoints, b);
      if (!pts) {
        alert('Неможливо прокласти коридор: занадто великий перепад висот. Додайте проміжні точки.');
        return;
      }
      state.list.push({ aIdx, bIdx, waypoints: [...state.tmpWaypoints] });
      state.start = null;
      state.tmpWaypoints.length = 0;
      state.preview.clear();
      redraw();
      return;
    }

    // додавання проміжної точки
    if (state.start && !clickedHab) {
      const last = state.tmpWaypoints[state.tmpWaypoints.length - 1];
      const from = last || midBottomTile(state.start);
      // перевіримо відразу «коротке плече» до цієї точки
      if (!tryElbow(from, gridPos)) {
        alert('Великий перепад на цьому відрізку. Додайте точку ближче або змініть маршрут.');
        return;
      }
      // уникаємо дублю
      if (!last || last.x !== gridPos.x || last.y !== gridPos.y) {
        state.tmpWaypoints.push(gridPos);
        onPreview(p);
      }
    }
  };

  // правий клік — скасувати останній waypoint
  const onRight = (p) => {
    if (!state.active || !state.start) return;
    if (p.rightButtonDown()) {
      state.tmpWaypoints.pop();
      onPreview(p);
    }
  };

  const activate = () => {
    if (state.active) return;
    state.active = true;
    state.start = null;
    state.tmpWaypoints.length = 0;
    state.preview.clear();
    scene.input.on('pointermove', onPreview);
    scene.input.on('pointerdown', onClick);
    scene.input.on('pointerdown', onRight);
    scene.input.setDefaultCursor('crosshair');
  };

  const deactivate = () => {
    if (!state.active) return;
    state.active = false;
    state.start = null;
    state.tmpWaypoints.length = 0;
    state.preview.clear();
    scene.input.off('pointermove', onPreview);
    scene.input.off('pointerdown', onClick);
    scene.input.off('pointerdown', onRight);
    scene.input.setDefaultCursor('default');
  };

  const destroy = () => {
    deactivate();
    state.gfx.destroy();
    state.preview.destroy();
    state.list.length = 0;
  };

  return { activate, deactivate, redraw, destroy };
}
