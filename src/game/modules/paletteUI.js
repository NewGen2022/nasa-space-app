// src/game/modules/paletteUI.js
// Палітра життєвих модулів з інвентарем (xN), повним згортанням/розгортанням
// і ЯКОРІНГОМ до ПРАВОГО-НИЖНЬОГО краю екрана.
//
import { MODULES } from './moduleLibrary.js';

export function createPaletteUI(scene) {
  // внутрішні відступи всередині панелі
  const PAD   = 8;
  const WIDTH = 240;
  const ROW_H = 18;

  // де розташувати панель відносно країв екрана
  // (піджени ці значення під свій UI)
  const ROOT_RIGHT_PAD  = 24;   // відступ від правого краю
  const ROOT_BOTTOM_PAD = 170;  // відступ від нижнього краю (щоб не перекривати height-палітру)

  // глобальний інвентар у сцені
  scene.inventory        = scene.inventory || {};  // { key: count }
  scene.currentModuleKey = scene.currentModuleKey ?? null;

  // збереження стану розкриття в registry
  let expanded = scene.registry?.get?.('modulesExpanded');
  if (expanded === undefined) expanded = true;

  // ROOT — контейнер, який позиціонується у правому-нижньому куті
  const root = scene.add.container(0, 0).setDepth(2001).setScrollFactor(0);

  // --- бекграунд ---
  const bg = scene.add.rectangle(0, 0, WIDTH, 28, 0x0f1116, 0.9)
    .setOrigin(0, 0)
    .setStrokeStyle(1, 0xffffff, 0.08);
  root.add(bg);

  // --- заголовок ---
  const title = scene.add.text(PAD + 8, PAD + 6, '', {
    fontFamily: 'monospace',
    fontSize: '12px',
    color: '#9cd2ff',
  });
  root.add(title);

  // невидимий хітбокс заголовка для зручного кліку
  const headerHit = scene.add.rectangle(0, 0, WIDTH, 28, 0x000000, 0)
    .setOrigin(0, 0)
    .setInteractive({ useHandCursor: true });
  root.add(headerHit);
  headerHit.on('pointerdown', (pointer, _lx, _ly, event) => {
    event?.stopPropagation?.(); event?.preventDefault?.();
    pointer?.event?.stopPropagation?.();
    expanded = !expanded;
    relayout(); // перерахувати висоту і root.y
  });

  // --- список рядків (модулі) ---
  const rowsContainer = scene.add.container(PAD + 8, PAD + 26);
  root.add(rowsContainer);

  // --- підказка під списком ---
  const hint = scene.add.text(PAD + 8, 0, '', {
    fontFamily: 'monospace',
    fontSize: '12px',
    color: '#b0ffb0',
    wordWrap: { width: WIDTH - 16 },
  });
  root.add(hint);

  // побудова рядків
  const rows = [];        // [{ key, row, label, cnt, plus }]
  const plusButtons = []; // для вмикання/вимикання інтерактивності при collapse
  let i = 0;
  for (const [key, m] of Object.entries(MODULES)) {
    const row = scene.add.container(0, i * ROW_H);

    const label = scene.add.text(0, 0, `• ${m.label}`, {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#ffffff',
    });

    const cnt = scene.add.text(WIDTH - 16 - 52 - PAD, 0, 'x0', {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#e6e6e6',
    }).setOrigin(0, 0);

    const plus = scene.add.text(WIDTH - 16 - 20 - PAD, 0, '[+]', {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#b0ffb0',
    })
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: true });

    plus.on('pointerdown', (pointer, _lx, _ly, event) => {
      // блок пробиття кліку у сцену
      event?.stopPropagation?.(); event?.preventDefault?.();
      pointer?.event?.stopPropagation?.();

      scene.inventory[key] = (scene.inventory[key] || 0) + 1;
      scene.currentModuleKey = key; // «озброїли» курсор
      refresh();
      hint.setText(`Place: ${m.label} (x${scene.inventory[key]}) — клікни в habitat`);
      relayout();
    });

    row.add([label, cnt, plus]);
    rowsContainer.add(row);
    rows.push({ key, row, label, cnt, plus });
    plusButtons.push(plus);
    i++;
  }

  // ——— helpers ———
  function setTitle() {
    title.setText(`Modules ${expanded ? '▾' : '▸'}`);
  }

  function refresh() {
    rows.forEach(({ key, cnt }) => {
      const n = scene.inventory[key] || 0;
      cnt.setText(`x${n}`);
    });

    if (scene.currentModuleKey && (scene.inventory[scene.currentModuleKey] || 0) > 0) {
      const m = MODULES[scene.currentModuleKey];
      hint.setText(`Place: ${m.label} (x${scene.inventory[scene.currentModuleKey]}) — клікни в habitat`);
    } else {
      hint.setText('');
    }
  }

  function relayout() {
    // показ/приховування контенту
    rowsContainer.setVisible(expanded);
    hint.setVisible(expanded);

    // вимикаємо [+] у згорнутому стані
    plusButtons.forEach(btn =>
      expanded ? btn.setInteractive({ useHandCursor: true }) : btn.disableInteractive()
    );

    // висота списку (заголовок + рядки)
    const listH = 26 + rows.length * ROW_H + 8;
    const hintH = hint.visible && hint.text ? hint.height + 6 : 0;

    // розмір панелі
    const height = expanded ? (listH + hintH) : 28;
    bg.width = WIDTH;
    bg.height = height;

    // позиція підказки
    hint.x = PAD + 8;
    hint.y = PAD + listH - 6;

    // заголовок і розмір хітбокса
    setTitle();
    headerHit.width = WIDTH;
    headerHit.height = 28;

    // РОЗТАШУВАННЯ ROOT: притиснути до правого-нижнього краю
    const gs = scene.scale.gameSize || { width: scene.scale.width, height: scene.scale.height };
    root.x = gs.width  - ROOT_RIGHT_PAD  - WIDTH;
    root.y = gs.height - ROOT_BOTTOM_PAD - height;

    // збережемо стан
    scene.registry?.set?.('modulesExpanded', expanded);
  }

  // ESC — скинути «озброєний» модуль
  const onEsc = () => {
    scene.currentModuleKey = null;
    refresh();
    relayout();
  };
  scene.input.keyboard.on('keydown-ESC', onEsc);

  refresh();
  relayout();
  scene.scale.on('resize', relayout);

  // API: модуль розміщено — зменшити лічильник
  function onPlaced(key) {
    if (!key) return;
    const left = Math.max(0, (scene.inventory[key] || 0) - 1);
    scene.inventory[key] = left;
    if (left === 0 && scene.currentModuleKey === key) {
      scene.currentModuleKey = null;
    }
    refresh();
    relayout();
  }

  // API: чи курсор над панеллю (враховує згорнутий стан і root позицію)
  function isOver(pointer) {
    const x = pointer.x, y = pointer.y;
    const withinX = x >= root.x && x <= root.x + bg.width;
    const withinY = y >= root.y && y <= root.y + bg.height;
    return withinX && withinY;
  }

  // очистка
  function destroy() {
    root.destroy();
    scene.scale.off('resize', relayout);
    scene.input.keyboard.off('keydown-ESC', onEsc);
  }

  return { onPlaced, isOver, destroy };
}
