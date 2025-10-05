// Мінімалістична бібліотека життєвих модулів (м²) + колір і коротка мітка.
export const MODULES = {
  galley:       { label: "Galley (Кухня)",           short:"GLY", color:0xFFC107, baseArea:6,  minAreaPerCrew:1.0, zoning:"clean",  avoidNear:["sport","hygiene","wcs"] },
  sleep:        { label: "Crew Sleep (Сон)",         short:"SLP", color:0x90CAF9, baseArea:2,  minAreaPerCrew:2.5, zoning:"clean",  avoidNear:["sport","maintenance"] },
  sport:        { label: "Exercise (Спорт)",         short:"SPT", color:0xFF7043, baseArea:6,  minAreaPerCrew:1.2, zoning:"dirty",  avoidNear:["sleep"] },
  hygiene:      { label: "Hygiene (Гігієна)",        short:"HYG", color:0x80CBC4, baseArea:3,  minAreaPerCrew:0.6, zoning:"dirty",  avoidNear:["galley"] },
  wcs:          { label: "WCS (Санвузол)",           short:"WCS", color:0x8D6E63, baseArea:2,  minAreaPerCrew:0.5, zoning:"dirty",  avoidNear:["galley","sleep"] },
  med:          { label: "Med Bay (Медицина)",       short:"MED", color:0xE57373, baseArea:4,  minAreaPerCrew:0.5, zoning:"clean",  avoidNear:["sport"] },
  stowage:      { label: "Stowage (Склад)",          short:"STW", color:0xA1887F, baseArea:6,  minAreaPerCrew:(days)=>0.02*days, zoning:"dirty" },
  maintenance:  { label: "Maintenance (Майстерня)",  short:"MNT", color:0x9575CD, baseArea:4,  minAreaPerCrew:0.4, zoning:"dirty",  avoidNear:["sleep"] },
  eclss:        { label: "ECLSS (Життєзабезпечення)",short:"ECS", color:0x64B5F6, baseArea:4,  minAreaPerCrew:0.3, zoning:"dirty",  avoidNear:["sleep"] },
  cmd:          { label: "Command/Work (Командний)", short:"CMD", color:0x607D8B, baseArea:5,  minAreaPerCrew:1.0, zoning:"clean" }
};
