// src/game/modules/rules.js
import { MODULES } from './moduleLibrary.js';

// площа для модуля (м²) з урахуванням екіпажу/тривалості
export function areaForModule(key, crew, days) {
  const m = MODULES[key];
  const perCrew = typeof m.minAreaPerCrew === "function" ? m.minAreaPerCrew(days) : (m.minAreaPerCrew||0);
  return (m.baseArea||0) + perCrew * crew;
}

// сумарні вимоги за площею (м²)
export function requiredAreas(crew, days) {
  const per = {};
  let total = 0;
  for (const k of Object.keys(MODULES)) {
    const a = areaForModule(k, crew, days);
    per[k] = a;
    total += a;
  }
  return { per, total };
}

// кількість критичних елементів (поки що тільки WCS)
export function recommendedCounts(crew) {
  const wcs = Math.max(1, Math.floor(crew/3)); // ≥1 на кожних 3 ос.
  return { wcs };
}

// Сформувати текстові підказки для панелі Issues
export function modulePlanIssues(availableAreaM2, crew, days) {
  const lines = [];
  const { total, per } = requiredAreas(crew, days);
  const diff = availableAreaM2 - total;

  lines.push(`• Потрібна площа під модулі: ${total.toFixed(1)} м² (доступно ${availableAreaM2.toFixed(1)} м²).`);
  if (diff < 0) lines.push(`• Не вистачає ≈ ${Math.abs(diff).toFixed(1)} м² для базових функцій (сон/кухня/гігієна/спорт/мед/склад/ECLSS/командний/майстерня).`);
  else         lines.push('• Площа під модулі достатня для обраного екіпажу/тривалості.');

  const { wcs } = recommendedCounts(crew);
  lines.push(`• Рекомендація: WCS ≥ ${wcs} од.`);

  // (за бажання) можна додати розкладку per-модулів:
  // lines.push(`• Орієнтовно: сон ${per.sleep.toFixed(1)} м², кухня ${per.galley.toFixed(1)} м², ...`);

  return lines;
}
