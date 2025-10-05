// src/game/issuesPanel.js
// Панель Constraints із згортанням/розгортанням (▾/▸).
// Показує: розподіл екіпажу, достатність habitat, площі модулів,
// повний список дефіцитів (у сталій черзі з moduleLibrary).
// Ефективна площа модулів враховує «пів-перекриття».

import { modulePlanIssues, requiredAreas } from './modules/rules.js';
import { MODULES } from './modules/moduleLibrary.js';

export function createIssuesPanel(scene) {
  const PAD = 8;
  const WIDTH = 320;

  // стан розкриття збережемо у registry
  let expanded = scene.registry?.get?.('constraintsExpanded');
  if (expanded === undefined) expanded = true;

  const bg = scene.add
    .rectangle(0, 0, WIDTH, 60, 0x121418, 0.92)
    .setOrigin(1, 0)
    .setScrollFactor(0)
    .setDepth(2001)
    .setStrokeStyle(1, 0xffffff, 0.08)
    .setName('issues-bg');

  const title = scene.add
    .text(0, 0, '', {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#9cd2ff',
    })
    .setOrigin(1, 0)
    .setScrollFactor(0)
    .setDepth(2002)
    .setInteractive({ useHandCursor: true });

  const txt = scene.add
    .text(0, 0, '', {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#ffffff',
      wordWrap: { width: WIDTH - PAD * 2 },
    })
    .setOrigin(1, 0)
    .setScrollFactor(0)
    .setDepth(2002)
    .setName('issues-text');

  function setTitle() {
    title.setText(`Constraints ${expanded ? '▾' : '▸'}`);
  }

  function relayout() {
    const gs =
      scene.scale.gameSize || { width: scene.scale.width, height: scene.scale.height };
    const x = gs.width - PAD;
    const y = PAD;

    bg.x = x;  bg.y = y;
    title.x = x - PAD; title.y = y + PAD;

    txt.x = x - PAD;
    txt.y = title.y + 16;

    txt.setVisible(expanded);

    const contentH =
      (title.height || 14) + (txt.visible ? (txt.height || 14) : 0) + PAD * 3;
    bg.width = WIDTH;
    bg.height = expanded ? Math.max(60, contentH) : 28;

    setTitle();
    scene.registry?.set?.('constraintsExpanded', expanded);
  }

  title.on('pointerdown', (pointer, _lx, _ly, event) => {
    event?.stopPropagation?.(); event?.preventDefault?.();
    pointer?.event?.stopPropagation?.();
    expanded = !expanded;
    relayout();
  });

  relayout();
  scene.scale.on('resize', relayout);

  // —— допоміжні обчислення ——

  // Площа всіх habitat у тайлах (груба оцінка)
  function estimateTotalAreaTiles() {
    let sum = 0;
    const list =
      scene.houses?.getChildren ? scene.houses.getChildren() : scene.houses || [];
    for (const h of list) {
      const m = h?.getData?.('model');
      if (m?.areaTiles) { sum += m.areaTiles; continue; }
      if (m?.w && m?.h) { sum += m.w * m.h; continue; }
    }
    return sum;
  }

  // Ефективна площа модулів з урахуванням "пів-перекриття"
  function placedAreasPerModuleEffective(tileMeters) {
    const per = {}; // м² на ключ модуля
    const list =
      scene.houses?.getChildren ? scene.houses.getChildren() : scene.houses || [];
    for (const h of list) {
      const api = h.getData('modules');
      if (!api) continue;
      const mods = (api._mods || []).map((m) => ({ ...m })); // локальна копія

      // базова площа
      mods.forEach((m) => (m.effTiles = m.w * m.h));

      // по 0.5 * overlap з кожної пари
      for (let i = 0; i < mods.length; i++) {
        for (let j = i + 1; j < mods.length; j++) {
          const a = mods[i], b = mods[j];
          const ox1 = Math.max(a.tx, b.tx);
          const oy1 = Math.max(a.ty, b.ty);
          const ox2 = Math.min(a.tx + a.w, b.tx + b.w);
          const oy2 = Math.min(a.ty + a.h, b.ty + b.h);
          const ow = Math.max(0, ox2 - ox1);
          const oh = Math.max(0, oy2 - oy1);
          const otiles = ow * oh;
          if (otiles > 0) {
            const cut = 0.5 * otiles;
            a.effTiles -= cut;
            b.effTiles -= cut;
          }
        }
      }

      // у м² по ключах
      mods.forEach((m) => {
        const aM2 = Math.max(0, m.effTiles) * tileMeters * tileMeters;
        per[m.key] = (per[m.key] || 0) + aM2;
      });
    }
    return per;
  }

  // стабільний порядок модулів — з moduleLibrary
  const ORDER = Object.keys(MODULES);

  function update(
    assignment = [],
    crewSize = 0,
    capacity = 0,
    habitatsCount = 0,
    opts = {}
  ) {
    const lines = [];

    // 1) розподіл екіпажу
    const totalAssigned = assignment.reduce((s, n) => s + Number(n || 0), 0);
    if (totalAssigned < crewSize) {
      lines.push(`• Додайте ще ${crewSize - totalAssigned} чол. (зараз ${totalAssigned}/${crewSize}).`);
    } else if (totalAssigned > crewSize) {
      lines.push(`• Заберіть ${totalAssigned - crewSize} чол. (перевищено ${totalAssigned}/${crewSize}).`);
    } else {
      lines.push(`• Екіпаж розподілений: ${totalAssigned}/${crewSize}.`);
    }

    // 2) місткість / кількість habitat
    assignment.forEach((v, i) => {
      if (capacity > 0 && v > capacity) {
        lines.push(`• Habitat ${i + 1} перевищує місткість (${v}/${capacity}).`);
      }
    });
    if (capacity > 0) {
      const needHab = Math.ceil(crewSize / Math.max(1, capacity));
      if (habitatsCount < needHab) {
        lines.push(`• Додайте ще ${needHab - habitatsCount} habitat(и), щоб вмістити екіпаж.`);
      } else {
        lines.push(`• Habitat достатньо: ${habitatsCount} × ${capacity} місць.`);
      }
    }

    // 3) базова оцінка площі під життєві модулі
    const tileMeters   = Number(opts.tileMeters   ?? scene.tileMeters   ?? 1);
    const missionDays  = Number(opts.missionDays  ?? scene.missionDays  ?? 0);
    const totalTiles   = Number(opts.totalAreaTiles ?? estimateTotalAreaTiles());
    const availableM2  = totalTiles * tileMeters * tileMeters;

    lines.push(...modulePlanIssues(availableM2, crewSize, missionDays));

    // 4) повний список дефіцитів у сталому порядку
    const placed = placedAreasPerModuleEffective(tileMeters);
    const needPer = requiredAreas(crewSize, missionDays).per;

    const orderedKeys = ORDER.filter(k => k in needPer);
    const deficits = orderedKeys
      .map(k => ({
        k,
        need: needPer[k],
        got: placed[k] || 0,
        diff: (placed[k] || 0) - needPer[k],
      }))
      .filter(x => x.diff < -0.1); // лише те, чого не вистачає

    if (deficits.length) {
      lines.push('• Дефіцит площі модулів (розміщено/потрібно):');
      deficits.forEach(d => {
        lines.push(`   - ${d.k}: ${d.got.toFixed(1)} / ${d.need.toFixed(1)} м²`);
      });
    } else {
      lines.push('• Площа розміщених модулів покриває базові потреби (з урахуванням перекриттів).');
    }

    // колір: зелено/червоне тло
    const hasProblem = deficits.length > 0 ||
      lines.some(l => /Додайте ще|перевищує/.test(l));
    bg.setFillStyle(hasProblem ? 0x321515 : 0x15321a, 0.92);

    txt.setText(lines.join('\n'));
    txt.setWordWrapWidth(WIDTH - PAD * 2, true);
    relayout();
  }

  function isOver(pointer) {
    const gs =
      scene.scale.gameSize || { width: scene.scale.width, height: scene.scale.height };
    const x = gs.width - PAD - bg.width;
    const y = PAD;
    const withinX = pointer.x >= x && pointer.x <= x + bg.width;
    const withinY = pointer.y >= y && pointer.y <= y + bg.height;
    return withinX && withinY;
  }

  return {
    update,
    relayout,
    isOver,
    destroy() {
      bg.destroy();
      title.destroy();
      txt.destroy();
      scene.scale.off('resize', relayout);
    },
  };
}
