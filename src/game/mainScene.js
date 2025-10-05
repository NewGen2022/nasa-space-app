// src/game/mainScene.js
import Phaser from 'phaser';

import { createBackground } from './background';
import { createHudPanel } from './hudPanel';
import { drawScreenGrid } from './gridOverlay';
import { renderHouse } from './houseRenderer';
import { enableDragSnap } from './dragSnap';
import { enableResizeKeepArea } from './resizeKeepArea';
import { makeGrid, rectFree, markRect } from './occupancy';
import { TILE_PX } from './layoutCalc';
import { makeHeightMap, paintHeight, rectSlope, heightToColor } from './terrain';
import { createNavbar, createHeightPalette, isOverUI } from './toolsUI';
import { createIssuesPanel } from './issuesPanel';

import { createPaletteUI } from './modules/paletteUI.js';
import { attachModuleLayer } from './modules/moduleLayer.js';

const clampInt = (n, min, max) => Math.max(min, Math.min(max, Number(n | 0)));

export default class MainScene extends Phaser.Scene {
  constructor(BG_URL) {
    super('MainScene');
    this.BG_URL = BG_URL;
  }

  preload() {
    this.load.image('bg', this.BG_URL);
  }

  /* --------------------- recreate safety / cleanup --------------------- */
  _resetIfRecreated() {
    if (!this._createdOnce) { this._createdOnce = true; return; }
    const off = (ev, h) => { try { this.input.off(ev, h); } catch {} };

    off('pointerdown', this._placeHandler);
    off('pointermove', this._brushHandler);

    off('pointermove', this._corrPreviewHandler);
    off('pointerdown', this._corrClickHandler);
    off('pointerdown', this._corrRightHandler);

    off('pointermove', this._pathPreviewHandler);
    off('pointerdown', this._pathClickHandler);
    off('pointerdown', this._pathRightHandler);

    off('pointermove', this._eraseMoveHandler);
    off('pointerdown', this._eraseClickHandler);

    try { this.events.off('tool-changed', this._toolHandler); } catch {}
    try { this.scale.off('resize', this._issuesResizeHandler); } catch {}

    this.children.removeAll(true);

    this.houses = [];
    this._issuesUI = null;
    this.paletteUI = null;

    this.corr = null;
    this.path = null;
    this.eraser = null;

    this._heightLabels = null;
    this._heightLabelLayer = null;
    this._setHeightLabel = null;
  }

  /* ==================================================================== */
  create() {
    this._resetIfRecreated();

    const cfg = this.game.registry.get('user') ?? {};
    const d   = cfg.derived ?? {};

    // units
    this.tilePx      = d.tilePx ?? TILE_PX;
    this.tileMeters  = d.tileMeters ?? 1;
    this.missionDays = Math.round((cfg.missionDuration ?? 0) / 24);

    const tilePx   = this.tilePx;
    const wTiles   = d.wTiles ?? 6;
    const hTiles   = d.hTiles ?? 6;
    const count    = clampInt(d.habitatsCount ?? cfg.overallHabitats ?? 1, 1, 200);

    // bg / hud / grid
    createBackground(this, 'bg');
    createHudPanel(this, cfg, 'topleft');
    drawScreenGrid(this, tilePx);

    // tools bar (Mouse / Brush / Corridor / Path / Erase)
    this.tool = 'mouse';
    createNavbar(this);

    // world & camera
    const GAP = 1, MARGIN = 2;
    const cols = Math.ceil(Math.sqrt(count));
    const rows = Math.ceil(count / cols);
    const mapW = MARGIN * 2 + cols * wTiles + (cols - 1) * GAP;
    const mapH = MARGIN * 2 + rows * hTiles + (rows - 1) * GAP;

    const minTilesX = Math.ceil(this.scale.width / tilePx);
    const minTilesY = Math.ceil(this.scale.height / tilePx);
    const worldTilesX = Math.max(mapW, minTilesX);
    const worldTilesY = Math.max(mapH, minTilesY);
    const worldW = worldTilesX * tilePx;
    const worldH = worldTilesY * tilePx;

    this.cameras.main.setBounds(0, 0, worldW, worldH);
    this.physics.world.setBounds(0, 0, worldW, worldH);

    // initial habitat positions (tile coords)
    const positions = [];
    let k = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (k++ >= count) break;
        positions.push({ ox: MARGIN + c * (wTiles + GAP), oy: MARGIN + r * (hTiles + GAP) });
      }
    }

    // occupancy grid
    const grid = makeGrid(worldTilesX, worldTilesY);
    const worldRect = new Phaser.Geom.Rectangle(0, 0, worldW, worldH);

    // heights
    const HEIGHT_MIN = -7000, HEIGHT_MAX = 22000;
    this.currentHeight = 0;
    this.heightMap = makeHeightMap(worldTilesX, worldTilesY, 0);

    // STATIC labels layer (hidden by default; shows only in Brush)
    this._heightLabelLayer = this.add.layer().setDepth(99).setVisible(false);
    this._heightLabels = Array.from({ length: worldTilesY }, () =>
      Array(worldTilesX).fill(null)
    );
    this._setHeightLabel = (tx, ty, hVal) => {
      if (tx < 0 || ty < 0 || ty >= this._heightLabels.length || tx >= this._heightLabels[0].length) return;
      const px = tx * this.tilePx + this.tilePx - 2;
      const py = ty * this.tilePx + 2;
      const text = `${hVal} m`;
      let label = this._heightLabels[ty][tx];
      if (!label) {
        label = this.add.text(px, py, text, {
          fontFamily: 'monospace',
          fontSize: '10px',
          color: '#ffffff',
        })
        .setOrigin(1, 0);
        label.setStroke('#000', 3);
        label.setShadow(0, 1, '#000', 2, true, true);
        this._heightLabels[ty][tx] = label;
        this._heightLabelLayer.add(label);
      } else {
        label.setPosition(px, py).setText(text).setAlpha(1);
      }
    };

    // height color overlay (no labels here)
    const heightGfx = this.add.graphics().setDepth(50).setAlpha(0.85);
    const redrawHeight = () => {
      heightGfx.clear();
      for (let ty = 0; ty < worldTilesY; ty++) {
        for (let tx = 0; tx < worldTilesX; tx++) {
          const h = this.heightMap[ty][tx];
          const col = heightToColor(h, HEIGHT_MIN, HEIGHT_MAX);
          heightGfx.fillStyle(col, 1).fillRect(tx * tilePx, ty * tilePx, tilePx, tilePx);
        }
      }
      // labels NOT auto-populated here (they appear only after painting)
    };
    redrawHeight();

    // height palette
    createHeightPalette(this, { minH: HEIGHT_MIN, maxH: HEIGHT_MAX, initial: this.currentHeight });

    // tool switching
    this._toolHandler = (tool) => {
      // show height labels only in Brush
      this._heightLabelLayer?.setVisible(tool === 'brush');

      // manage port overlays: show only in corridor/path; clear otherwise
      const showPorts = tool === 'corridor' || tool === 'path';
      if (showPorts) {
        this.corr?.portGfx?.clear();
        this._showCorrPorts?.();
      } else {
        this.corr?.portGfx?.clear();
      }

      const drag = tool === 'mouse';
      this.houses?.forEach(h => {
        const hit = h.getByName('hit');
        if (!hit) return;
        drag ? hit.setInteractive({ cursor: 'grab' }) : hit.disableInteractive();
      });

      if (tool === 'corridor') {
        this._activateCorridors(); this._deactivatePaths(); this._deactivateEraser();
      } else if (tool === 'path') {
        this._activatePaths(); this._deactivateCorridors(); this._deactivateEraser();
      } else if (tool === 'erase') {
        this._activateEraser(); this._deactivateCorridors(); this._deactivatePaths();
      } else {
        this._deactivateCorridors(); this._deactivatePaths(); this._deactivateEraser();
      }
    };
    this.events.on('tool-changed', this._toolHandler);

    // height brush (create/update label only for painted tiles)
    this._brushHandler = (pointer) => {
      if (this.tool !== 'brush' || !pointer.isDown) return;
      if (isOverUI(this, pointer)) return;
      if (this.paletteUI?.isOver?.(pointer)) return;
      if (this._issuesUI?.isOver?.(pointer)) return;

      const tx = Math.floor(pointer.worldX / tilePx);
      const ty = Math.floor(pointer.worldY / tilePx);
      if (paintHeight(this.heightMap, tx, ty, this.currentHeight, HEIGHT_MIN, HEIGHT_MAX)) {
        const col = heightToColor(this.heightMap[ty][tx], HEIGHT_MIN, HEIGHT_MAX);
        heightGfx.fillStyle(col, 1).fillRect(tx * tilePx, ty * tilePx, tilePx, tilePx);
        this._setHeightLabel(tx, ty, this.currentHeight);
        this._redrawCorridors?.();
        this._redrawPaths?.();
      }
    };
    this.input.on('pointermove', this._brushHandler);

    // crew & capacity
    this.assignment = (d.crewAssignment ?? []).slice(0, count);
    while (this.assignment.length < count) this.assignment.push(0);
    this.capacity = d.humansPerHabitat ?? cfg.humansPerHabitats ?? 0;
    this.crewSize = d.crewSize ?? Number(cfg.crewSize ?? 0);

    // issues panel
    if (typeof createIssuesPanel === 'function') {
      this._issuesUI = createIssuesPanel(this);
      this._updateIssues = () =>
        this._issuesUI.update(this.assignment, this.crewSize, this.capacity, count);
      this._updateIssues();
      this._issuesResizeHandler = () => this._issuesUI.relayout();
      this.scale.on('resize', this._issuesResizeHandler);
    }

    // terrain slope rule
    const slopeLimitMeters = (wT, hT) => 0.05 * Math.max(wT, hT) * this.tileMeters;
    const terrainOK = (ox, oy, W, H) =>
      rectSlope(this.heightMap, ox, oy, W, H) <= slopeLimitMeters(W, H);

    // habitats
    this.houses = [];
    const exactTiles = wTiles * hTiles;

    positions.forEach(({ ox, oy }, idx) => {
      markRect(grid, ox, oy, wTiles, hTiles, 1);

      const humansHere = this.assignment[idx] ?? 0;
      const house = renderHouse(this, ox, oy, wTiles, hTiles, {
        name: `Habitat ${idx + 1}`,
        humans: humansHere,
        capacity: this.capacity,
      });
      this.houses.push(house);

      house.setData('model',  { w: wTiles, h: hTiles, areaTiles: exactTiles });
      house.setData('origin', { ox, oy });

      attachModuleLayer(this, house);

      enableDragSnap(this, house, tilePx, worldRect, (nx, ny) => {
        const nOx = Math.round(nx / tilePx);
        const nOy = Math.round(ny / tilePx);
        const { ox: px, oy: py } = house.getData('origin');
        const { w: cw, h: ch } = house.getData('model');

        markRect(grid, px, py, cw, ch, 0);
        const freeRect = rectFree(grid, nOx, nOy, cw, ch);
        const terrOK2  = terrainOK(nOx, nOy, cw, ch);

        if (freeRect && terrOK2) {
          markRect(grid, nOx, nOy, cw, ch, 1);
          house.setData('origin', { ox: nOx, oy: nOy });

          this._redrawCorridors?.();
          this._redrawPaths?.();

          // refresh ports if corridor/path active
          if (this.corr?.active || this.path?.active) {
            this.corr?.portGfx?.clear();
            this._showCorrPorts?.();
          }
          return true;
        } else {
          markRect(grid, px, py, cw, ch, 1);
          if (!terrOK2) alert('Неможливо поставити habitat: надто великий перепад висот.');
          return false;
        }
      });

      enableResizeKeepArea(this, house, tilePx, worldRect, {
        rectFree: (x, y, W, H) => rectFree(grid, x, y, W, H),
        markRect: (x, y, W, H, val) => markRect(grid, x, y, W, H, val),
        terrainOK,
      });

      house.on('requestSetHumans', (newVal) => {
        const v = Math.max(0, Math.min(this.capacity, Number(newVal | 0)));
        const current = this.assignment[idx];
        if (v === current) return;

        const totalWithout = this.assignment.reduce((s, n, i) => s + (i === idx ? 0 : n), 0);
        const newTotal = totalWithout + v;

        if (v > this.capacity) { alert(`Max capacity here is ${this.capacity}.`); return; }
        if (newTotal > this.crewSize) {
          alert(`Забагато людей на ${newTotal - this.crewSize}. Зменшіть в іншому habitat.`);
          return;
        }

        this.assignment[idx] = v;
        house.setData('humans', v);
        const pplTxt = house.getByName('labelHumans');
        if (pplTxt) pplTxt.setText(`${v}/${this.capacity} ppl`);
        this._updateIssues?.();
      });
    });

    // module palette
    this.paletteUI = createPaletteUI(this);
    this.currentModuleKey = this.currentModuleKey ?? null;
    this.inventory = this.inventory || {};

    // place module click
    this._placeHandler = (p) => {
      if (this.tool === 'corridor' || this.tool === 'path' || this.tool === 'erase') return;
      if (isOverUI(this, p)) return;
      if (this.paletteUI?.isOver?.(p)) return;
      if (this._issuesUI?.isOver?.(p)) return;

      const key = this.currentModuleKey;
      if (!key) return;
      if ((this.inventory[key] || 0) <= 0) return;

      const hit = (this.houses || []).find(h => h.getBounds().contains(p.worldX, p.worldY));
      if (!hit) return;

      const relX = Math.floor((p.worldX - hit.x) / tilePx);
      const relY = Math.floor((p.worldY - hit.y) / tilePx);
      const base = (p.event && p.event.shiftKey) ? 2 : 1;

      const api = hit.getData('modules');
      const placed = api?.addModule(key, relX, relY, base, base);
      if (placed) {
        this.paletteUI.onPlaced(key);
        this._updateIssues?.();
      }
    };
    this.input.on('pointerdown', this._placeHandler);

    // corridors / paths / eraser
    this._initCorridors();
    this._initPaths();
    this._initEraser();

    this._updateIssues?.();
  }

  /* ========================= SHARED HELPERS ========================= */
  _portRectsFor(h) {
    const tile = this.tilePx;
    const m = h.getData('model') || { w: 1, h: 1 };
    const px = h.x, py = h.y;
    const wpx = m.w * tile, hpx = m.h * tile;
    const thick = tile * 0.35;
    const long  = Math.max(tile * 0.9, tile * 0.9);
    return [
      { side: 'top',    rect: new Phaser.Geom.Rectangle(px + wpx/2 - long/2, py,             long, thick) },
      { side: 'right',  rect: new Phaser.Geom.Rectangle(px + wpx - thick,    py + hpx/2 - long/2, thick, long) },
      { side: 'bottom', rect: new Phaser.Geom.Rectangle(px + wpx/2 - long/2, py + hpx - thick, long, thick) },
      { side: 'left',   rect: new Phaser.Geom.Rectangle(px,                  py + hpx/2 - long/2, thick, long) },
    ];
  }
  _portCenterTile(h, side) {
    const tile = this.tilePx;
    const pr = this._portRectsFor(h).find(p => p.side === side)?.rect;
    const cx = pr ? pr.centerX : h.x + (h.getData('model').w * tile) / 2;
    const cy = pr ? pr.centerY : h.y + (h.getData('model').h * tile) / 2;
    return { x: Math.floor(cx / tile), y: Math.floor(cy / tile) };
  }
  _pickPortAt(x, y) {
    for (const h of this.houses) {
      for (const p of this._portRectsFor(h)) {
        if (p.rect.contains(x, y)) return { house: h, side: p.side };
      }
    }
    return null;
  }

  _segmentOK(a, b) {
    const stepLimit = 3 * (this.tileMeters || 1);
    const tileH = (tx, ty) => (this.heightMap?.[ty]?.[tx] ?? 0);
    // Bresenham
    const pts = [];
    let x0=a.x, y0=a.y, x1=b.x, y1=b.y;
    const dx=Math.abs(x1-x0), dy=Math.abs(y1-y0);
    const sx = x0<x1?1:-1, sy = y0<y1?1:-1;
    let err = dx - dy;
    while(true){
      pts.push({x:x0,y:y0});
      if (x0===x1 && y0===y1) break;
      const e2=2*err;
      if (e2>-dy){ err-=dy; x0+=sx; }
      if (e2< dx){ err+=dx; y0+=sy; }
    }
    for (let i=1;i<pts.length;i++){
      const p=pts[i], q=pts[i-1];
      if (Math.abs(tileH(p.x,p.y)-tileH(q.x,q.y)) > stepLimit) return false;
    }
    return true;
  }

  _materializePolyline(startRef, waypoints, endRef) {
    const a = this._portCenterTile(startRef.house, startRef.side);
    const b = this._portCenterTile(endRef.house, endRef.side);
    const poly = [a, ...waypoints, b];
    for (let i = 1; i < poly.length; i++) {
      if (!this._segmentOK(poly[i-1], poly[i])) return null;
    }
    return poly;
  }

  /* ============================== CORRIDORS ============================== */
  _initCorridors() {
    const tile = this.tilePx;

    const COLOR_MAIN  = 0xffffff;   // tube (white)
    const COLOR_DASH  = 0x9ea7b3;   // inner line (grey)
    const ALPHA_MAIN  = 1.0;
    const ALPHA_PREV  = 0.92;
    const WIDTH_T     = 1.6;
    const DASH_LEN    = tile * 0.60;
    const DASH_GAP    = tile * 0.36;

    const PORT_STROKE = 0x9cd2ff, PORT_FILL = 0x1b232c, PORT_ALPHA = 0.95;

    const drawPorts = () => {
      const g = this.corr.portGfx;
      g.clear(); g.lineStyle(1, PORT_STROKE, 0.9);
      this.houses.forEach(h => {
        this._portRectsFor(h).forEach(({rect}) => {
          g.fillStyle(PORT_FILL, PORT_ALPHA);
          g.fillRoundedRect(rect.x, rect.y, rect.width, rect.height, 4);
          g.strokeRoundedRect(rect.x, rect.y, rect.width, rect.height, 4);
        });
      });
    };

    const drawTube = (g, poly) => {
      const wpx = WIDTH_T * tile;
      g.lineStyle(wpx + 2, 0x0e141a, 0.85);
      g.lineCap = 1; g.lineJoin = 1;
      g.beginPath();
      g.moveTo(poly[0].x*tile+tile/2, poly[0].y*tile+tile/2);
      for (let i=1;i<poly.length;i++) g.lineTo(poly[i].x*tile+tile/2, poly[i].y*tile+tile/2);
      g.strokePath();
      g.lineStyle(wpx, COLOR_MAIN, ALPHA_MAIN);
      g.beginPath();
      g.moveTo(poly[0].x*tile+tile/2, poly[0].y*tile+tile/2);
      for (let i=1;i<poly.length;i++) g.lineTo(poly[i].x*tile+tile/2, poly[i].y*tile+tile/2);
      g.strokePath();
    };
    const drawDash = (g, poly) => {
      const wpx = Math.max(2, WIDTH_T*tile*0.30);
      g.lineCap=1; g.lineJoin=1; g.lineStyle(wpx, COLOR_DASH, 0.95);
      for (let i=0;i<poly.length-1;i++){
        const a=poly[i], b=poly[i+1];
        const ax=a.x*tile+tile/2, ay=a.y*tile+tile/2;
        const bx=b.x*tile+tile/2, by=b.y*tile+tile/2;
        const dx=bx-ax, dy=by-ay, len=Math.hypot(dx,dy), nx=dx/len, ny=dy/len;
        let t=0; while(t<len){ const t2=Math.min(len,t+DASH_LEN);
          g.beginPath(); g.moveTo(ax+nx*t, ay+ny*t); g.lineTo(ax+nx*t2, ay+ny*t2); g.strokePath();
          t=t2+DASH_GAP;
        }
      }
    };
    const drawPath = (g, poly) => { if (!poly || poly.length<2) return; drawTube(g, poly); drawDash(g, poly); };

    this.corr = {
      active:false,
      start:null,                  // {house, side}
      tmpWaypoints: [],
      list: [],
      gfx: this.add.graphics().setDepth(95),
      preview: this.add.graphics().setDepth(96).setAlpha(ALPHA_PREV),
      portGfx: this.add.graphics().setDepth(97),
      widthTiles: WIDTH_T,
    };

    this._redrawCorridors = () => {
      const g = this.corr.gfx; g.clear();
      for (const c of this.corr.list) {
        const A=this.houses[c.aIdx], B=this.houses[c.bIdx]; if(!A||!B) continue;
        const upd = this._materializePolyline({house:A,side:c.aSide}, c.waypoints, {house:B,side:c.bSide});
        if (upd) { c.poly=upd; drawPath(g, c.poly); }
      }
      if (this.corr.active) drawPorts();
    };

    this._corrPreviewHandler = (p) => {
      if (!this.corr.active || !this.corr.start) return;
      if (isOverUI(this, p)) return;

      const pr = this.corr.preview; pr.clear();
      const cursor = { x: Math.floor(p.worldX/tile), y: Math.floor(p.worldY/tile) };
      const pick = this._pickPortAt(p.worldX, p.worldY);

      if (pick && (pick.house !== this.corr.start.house || pick.side !== this.corr.start.side)) {
        const poly = this._materializePolyline(this.corr.start, this.corr.tmpWaypoints, pick);
        if (poly) { drawPath(pr, poly); return; }
        const a=this._portCenterTile(this.corr.start.house,this.corr.start.side);
        pr.lineStyle(this.corr.widthTiles*tile, 0xff4444, 0.95);
        pr.beginPath(); pr.moveTo(a.x*tile+tile/2, a.y*tile+tile/2);
        pr.lineTo(cursor.x*tile+tile/2, cursor.y*tile+tile/2); pr.strokePath();
        return;
      }

      const last = this.corr.tmpWaypoints[this.corr.tmpWaypoints.length-1]
                || this._portCenterTile(this.corr.start.house,this.corr.start.side);
      const ok = this._segmentOK(last, cursor);
      if (ok) drawPath(pr, [ last, cursor ]);
      else {
        pr.lineStyle(this.corr.widthTiles*tile, 0xff4444, 0.95);
        pr.beginPath(); pr.moveTo(last.x*tile+tile/2, last.y*tile+tile/2);
        pr.lineTo(cursor.x*tile+tile/2, cursor.y*tile+tile/2); pr.strokePath();
      }
    };

    this._corrClickHandler = (p) => {
      if (!this.corr.active) return;
      if (isOverUI(this, p)) return;

      // Alt+click — quick delete near cursor
      if (p.event?.altKey) { if (this._eraseTryAt(p.worldX, p.worldY)) return; }

      const picked = this._pickPortAt(p.worldX, p.worldY);
      const gridPos = { x: Math.floor(p.worldX/tile), y: Math.floor(p.worldY/tile) };

      if (!this.corr.start) {
        if (!picked) return;
        this.corr.start = picked;
        this.corr.tmpWaypoints.length = 0;
        this.corr.preview.clear();
        this._corrPreviewHandler(p);
        return;
      }

      if (picked && (picked.house !== this.corr.start.house || picked.side !== this.corr.start.side)) {
        const aIdx=this.houses.indexOf(this.corr.start.house);
        const bIdx=this.houses.indexOf(picked.house);
        const poly=this._materializePolyline(this.corr.start, this.corr.tmpWaypoints, picked);
        if (!poly) { alert('Неможливо прокласти коридор: великий перепад висот. Додайте ще точок.'); return; }
        this.corr.list.push({ aIdx,bIdx, aSide:this.corr.start.side, bSide:picked.side, waypoints:[...this.corr.tmpWaypoints], poly });
        this.corr.start=null; this.corr.tmpWaypoints.length=0; this.corr.preview.clear(); this._redrawCorridors(); return;
      }

      if (this.corr.start && !picked) {
        const last=this.corr.tmpWaypoints[this.corr.tmpWaypoints.length-1]
          || this._portCenterTile(this.corr.start.house,this.corr.start.side);
        if (!this._segmentOK(last, gridPos)) { alert('Крутий рельєф. Додайте точку ближче.'); return; }
        if (!last || last.x!==gridPos.x || last.y!==gridPos.y) this.corr.tmpWaypoints.push(gridPos);
        this._corrPreviewHandler(p);
      }
    };

    this._corrRightHandler = (p) => {
      if (!this.corr.active || !this.corr.start) return;
      if (p.rightButtonDown()) { this.corr.tmpWaypoints.pop(); this._corrPreviewHandler(p); }
    };

    this._showCorrPorts = () => drawPorts();
  }
  _activateCorridors() {
    if (!this.corr || this.corr.active) return;
    this.corr.active = true; this._showCorrPorts?.();
    this.input.on('pointermove', this._corrPreviewHandler);
    this.input.on('pointerdown', this._corrClickHandler);
    this.input.on('pointerdown', this._corrRightHandler);
    this.input.setDefaultCursor('crosshair');
  }
  _deactivateCorridors() {
    if (!this.corr || !this.corr.active) return;
    this.corr.active = false;
    this.corr.start=null; this.corr.tmpWaypoints.length=0;
    this.corr.preview.clear(); this.corr.portGfx.clear();
    this.input.off('pointermove', this._corrPreviewHandler);
    this.input.off('pointerdown', this._corrClickHandler);
    this.input.off('pointerdown', this._corrRightHandler);
    this.input.setDefaultCursor('default');
  }

  /* ================================ PATHS ================================ */
  _initPaths() {
    const tile = this.tilePx;

    const COLOR_MAIN  = 0xb06c2f; // warm brown
    const COLOR_DASH  = 0xffffff; // white dash
    const ALPHA_MAIN  = 1.0;
    const ALPHA_PREV  = 0.9;
    const WIDTH_T     = 0.9;
    const DASH_LEN    = tile * 0.45;
    const DASH_GAP    = tile * 0.30;

    const drawTube = (g, poly) => {
      const wpx = WIDTH_T * tile;
      g.lineStyle(wpx + 2, 0x0e141a, 0.6);
      g.lineCap = 1; g.lineJoin = 1;
      g.beginPath();
      g.moveTo(poly[0].x*tile+tile/2, poly[0].y*tile+tile/2);
      for (let i=1;i<poly.length;i++) g.lineTo(poly[i].x*tile+tile/2, poly[i].y*tile+tile/2);
      g.strokePath();
      g.lineStyle(wpx, COLOR_MAIN, ALPHA_MAIN);
      g.beginPath();
      g.moveTo(poly[0].x*tile+tile/2, poly[0].y*tile+tile/2);
      for (let i=1;i<poly.length;i++) g.lineTo(poly[i].x*tile+tile/2, poly[i].y*tile+tile/2);
      g.strokePath();
    };
    const drawDash = (g, poly) => {
      const wpx = Math.max(1, WIDTH_T*tile*0.22);
      g.lineCap=1; g.lineJoin=1; g.lineStyle(wpx, COLOR_DASH, 0.85);
      for (let i=0;i<poly.length-1;i++){
        const a=poly[i], b=poly[i+1];
        const ax=a.x*tile+tile/2, ay=a.y*tile+tile/2;
        const bx=b.x*tile+tile/2, by=b.y*tile+tile/2;
        const dx=bx-ax, dy=by-ay, len=Math.hypot(dx,dy), nx=dx/len, ny=dy/len;
        let t=0; while(t<len){ const t2=Math.min(len,t+DASH_LEN);
          g.beginPath(); g.moveTo(ax+nx*t, ay+ny*t); g.lineTo(ax+nx*t2, ay+ny*t2); g.strokePath();
          t=t2+DASH_GAP;
        }
      }
    };
    const drawPath = (g,poly)=>{ if(!poly||poly.length<2)return; drawTube(g,poly); drawDash(g,poly); };

    this.path = {
      active:false,
      start:null,
      tmpWaypoints: [],
      list: [],
      gfx: this.add.graphics().setDepth(93),
      preview: this.add.graphics().setDepth(94).setAlpha(ALPHA_PREV),
      widthTiles: WIDTH_T,
    };

    this._redrawPaths = () => {
      const g = this.path.gfx; g.clear();
      for (const c of this.path.list) {
        const A=this.houses[c.aIdx], B=this.houses[c.bIdx]; if(!A||!B) continue;
        const upd = this._materializePolyline({house:A,side:c.aSide}, c.waypoints, {house:B,side:c.bSide});
        if (upd) { c.poly = upd; drawPath(g, c.poly); }
      }
    };

    this._pathPreviewHandler = (p) => {
      if (!this.path.active || !this.path.start) return;
      if (isOverUI(this, p)) return;

      const pr = this.path.preview; pr.clear();
      const cursor = { x: Math.floor(p.worldX/tile), y: Math.floor(p.worldY/tile) };
      const pick = this._pickPortAt(p.worldX, p.worldY);

      if (pick && (pick.house !== this.path.start.house || pick.side !== this.path.start.side)) {
        const poly = this._materializePolyline(this.path.start, this.path.tmpWaypoints, pick);
        if (poly) { drawPath(pr, poly); return; }
        const a=this._portCenterTile(this.path.start.house,this.path.start.side);
        pr.lineStyle(this.path.widthTiles*tile, 0xff6666, 0.95);
        pr.beginPath(); pr.moveTo(a.x*tile+tile/2, a.y*tile+tile/2);
        pr.lineTo(cursor.x*tile+tile/2, cursor.y*tile+tile/2); pr.strokePath();
        return;
      }

      const last=this.path.tmpWaypoints[this.path.tmpWaypoints.length-1]
        || this._portCenterTile(this.path.start.house,this.path.start.side);
      const ok = this._segmentOK(last, cursor);
      if (ok) drawPath(pr, [ last, cursor ]);
      else {
        pr.lineStyle(this.path.widthTiles*tile, 0xff6666, 0.95);
        pr.beginPath(); pr.moveTo(last.x*tile+tile/2, last.y*tile+tile/2);
        pr.lineTo(cursor.x*tile+tile/2, cursor.y*tile+tile/2); pr.strokePath();
      }
    };

    this._pathClickHandler = (p) => {
      if (!this.path.active) return;
      if (isOverUI(this, p)) return;

      if (p.event?.altKey) { if (this._eraseTryAt(p.worldX, p.worldY)) return; }

      const picked = this._pickPortAt(p.worldX, p.worldY);
      const gridPos = { x: Math.floor(p.worldX/tile), y: Math.floor(p.worldY/tile) };

      if (!this.path.start) {
        if (!picked) return;
        this.path.start = picked; this.path.tmpWaypoints.length=0; this.path.preview.clear();
        this._pathPreviewHandler(p);
        return;
      }
      if (picked && (picked.house !== this.path.start.house || picked.side !== this.path.start.side)) {
        const aIdx=this.houses.indexOf(this.path.start.house);
        const bIdx=this.houses.indexOf(picked.house);
        const poly=this._materializePolyline(this.path.start, this.path.tmpWaypoints, picked);
        if (!poly) { alert('Стежку не можна прокласти через великий перепад. Додайте точку.'); return; }
        this.path.list.push({ aIdx,bIdx, aSide:this.path.start.side, bSide:picked.side, waypoints:[...this.path.tmpWaypoints], poly });
        this.path.start=null; this.path.tmpWaypoints.length=0; this.path.preview.clear(); this._redrawPaths(); return;
      }
      if (this.path.start && !picked) {
        const last=this.path.tmpWaypoints[this.path.tmpWaypoints.length-1]
          || this._portCenterTile(this.path.start.house,this.path.start.side);
        if (!this._segmentOK(last, gridPos)) { alert('Крутий рельєф. Додайте точку ближче.'); return; }
        if (!last || last.x!==gridPos.x || last.y!==gridPos.y) this.path.tmpWaypoints.push(gridPos);
        this._pathPreviewHandler(p);
      }
    };

    this._pathRightHandler = (p) => {
      if (!this.path.active || !this.path.start) return;
      if (p.rightButtonDown()) { this.path.tmpWaypoints.pop(); this._pathPreviewHandler(p); }
    };
  }
  _activatePaths() {
    if (!this.path || this.path.active) return;
    this.path.active = true;
    this._showCorrPorts?.();
    this.input.on('pointermove', this._pathPreviewHandler);
    this.input.on('pointerdown', this._pathClickHandler);
    this.input.on('pointerdown', this._pathRightHandler);
    this.input.setDefaultCursor('crosshair');
  }
  _deactivatePaths() {
    if (!this.path || !this.path.active) return;
    this.path.active = false;
    this.path.start = null;
    this.path.tmpWaypoints.length = 0;
    this.path.preview.clear();
    this.input.off('pointermove', this._pathPreviewHandler);
    this.input.off('pointerdown', this._pathClickHandler);
    this.input.off('pointerdown', this._pathRightHandler);
    this.input.setDefaultCursor('default');

    // clear ports also when leaving path mode
    this.corr?.portGfx?.clear();
  }

  /* ================================ ERASER ================================ */
  _initEraser() {
    const tile = this.tilePx;
    const HILITE_COLOR = 0xff4d4d;
    const HILITE_ALPHA = 0.8;

    const distPointToSeg = (px, py, x1, y1, x2, y2) => {
      const vx = x2 - x1, vy = y2 - y1;
      const wx = px - x1, wy = py - y1;
      const L2 = vx*vx + vy*vy;
      let t = L2 ? (wx*vx + wy*vy) / L2 : 0;
      t = Math.max(0, Math.min(1, t));
      const cx = x1 + t*vx, cy = y1 + t*vy;
      return Math.hypot(px - cx, py - cy);
    };

    this._pickNearestLink = (wx, wy) => {
      const thCorr = tile * Math.max(0.9, this.corr?.widthTiles || 1.2);
      const thPath = tile * Math.max(0.6, this.path?.widthTiles || 0.8);
      let best = null;

      if (this.corr?.list) {
        this.corr.list.forEach((c, idx) => {
          const poly = c.poly || [];
          for (let i = 0; i < poly.length - 1; i++) {
            const a = poly[i], b = poly[i+1];
            const x1 = a.x*tile + tile/2, y1 = a.y*tile + tile/2;
            const x2 = b.x*tile + tile/2, y2 = b.y*tile + tile/2;
            const d = distPointToSeg(wx, wy, x1, y1, x2, y2);
            if (d <= thCorr && (!best || d < best.dist)) best = { type: 'corr', index: idx, seg: i, dist: d };
          }
        });
      }
      if (this.path?.list) {
        this.path.list.forEach((c, idx) => {
          const poly = c.poly || [];
          for (let i = 0; i < poly.length - 1; i++) {
            const a = poly[i], b = poly[i+1];
            const x1 = a.x*tile + tile/2, y1 = a.y*tile + tile/2;
            const x2 = b.x*tile + tile/2, y2 = b.y*tile + tile/2;
            const d = distPointToSeg(wx, wy, x1, y1, x2, y2);
            if (d <= thPath && (!best || d < best.dist)) best = { type: 'path', index: idx, seg: i, dist: d };
          }
        });
      }
      return best;
    };

    const drawHighlight = (hit) => {
      const g = this.eraser.gfx;
      g.clear();
      if (!hit) return;

      const widthT = hit.type === 'corr' ? (this.corr?.widthTiles || 1.5) : (this.path?.widthTiles || 0.8);
      const wpx = (widthT + 0.7) * this.tilePx;
      const list = hit.type === 'corr' ? this.corr.list : this.path.list;
      const poly = list[hit.index]?.poly || [];
      if (poly.length < 2) return;

      g.lineStyle(wpx, HILITE_COLOR, HILITE_ALPHA);
      g.lineCap = 1; g.lineJoin = 1;
      g.beginPath();
      g.moveTo(poly[0].x*this.tilePx + this.tilePx/2, poly[0].y*this.tilePx + this.tilePx/2);
      for (let i = 1; i < poly.length; i++)
        g.lineTo(poly[i].x*this.tilePx + this.tilePx/2, poly[i].y*this.tilePx + this.tilePx/2);
      g.strokePath();
    };

    this.eraser = {
      active: false,
      hover: null,
      gfx: this.add.graphics().setDepth(98),
      _draw: drawHighlight,
    };

    this._eraseMoveHandler = (p) => {
      if (!this.eraser.active) return;
      if (isOverUI(this, p)) { this.eraser.hover = null; this.eraser._draw(null); return; }
      const hit = this._pickNearestLink(p.worldX, p.worldY);
      this.eraser.hover = hit;
      this.eraser._draw(hit);
    };

    this._eraseClickHandler = (p) => {
      if (!this.eraser.active) return;
      if (isOverUI(this, p)) return;
      const hit = this._pickNearestLink(p.worldX, p.worldY);
      if (!hit) return;

      if (hit.type === 'corr') { this.corr.list.splice(hit.index, 1); this._redrawCorridors?.(); }
      else                    { this.path.list.splice(hit.index, 1); this._redrawPaths?.(); }

      this.eraser.hover = null;
      this.eraser._draw(null);
    };

    this._eraseTryAt = (wx, wy) => {
      const hit = this._pickNearestLink(wx, wy);
      if (!hit) return false;
      if (hit.type === 'corr') { this.corr.list.splice(hit.index, 1); this._redrawCorridors?.(); }
      else                    { this.path.list.splice(hit.index, 1); this._redrawPaths?.(); }
      return true;
    };
  }
  _activateEraser() {
    if (!this.eraser || this.eraser.active) return;
    this.eraser.active = true;
    this.input.on('pointermove', this._eraseMoveHandler);
    this.input.on('pointerdown', this._eraseClickHandler);
    this.input.setDefaultCursor('not-allowed');
  }
  _deactivateEraser() {
    if (!this.eraser || !this.eraser.active) return;
    this.eraser.active = false;
    this.eraser.hover = null;
    this.eraser._draw(null);
    this.input.off('pointermove', this._eraseMoveHandler);
    this.input.off('pointerdown', this._eraseClickHandler);
    this.input.setDefaultCursor('default');
  }
}
