// ============================================================
// config.js – Hajni Burger Clicker (v2)
// ------------------------------------------------------------
// MINDEN balanszolható érték itt van. A logika (script.js) csak
// ezekre hivatkozik – sehol sincs "beégetve" szám.
//
// A "HP" = HÚSPONT (nem életerő!). Minden ételnek van húspontja,
// Hajni ennyivel lakik jól. A húspontból lép szintet is.
// ============================================================

// ── KAJÁK ───────────────────────────────────────────────────
// Rarity-sorrend: fentről lefelé egyre ritkább (drop = súly).
//   id   : belső azonosító (mentésnél is ez, NE változtasd)
//   name : megjelenő név
//   icon : emoji
//   drop : esély-súly (nagyobb = gyakoribb; nem %, csak arány)
//   hp   : HÚSPONT / darab (ennyivel csökken Hajni éhsége)
//   type : "food" = megehető | "building" = Marhatelep (termelő)
const FOODS = [
  { id: "huscafat",   name: "Húscafat",            icon: "🍖", drop: 1000, hp: 1,   type: "food" },
  { id: "csirkecomb", name: "Csirkecomb",          icon: "🍗", drop: 500,  hp: 3,   type: "food" },
  { id: "hamburger",  name: "Hamburger",           icon: "🍔", drop: 350,  hp: 5,   type: "food" },
  { id: "hbmenu",     name: "Hamburger menü",      icon: "🍟", drop: 180,  hp: 9,   type: "food" },
  { id: "csirke",     name: "Egész csirke",        icon: "🐔", drop: 90,   hp: 15,  type: "food" },
  { id: "oldalas",    name: "Oldalas",             icon: "🥓", drop: 45,   hp: 24,  type: "food" },
  { id: "steak",      name: "Steak",               icon: "🥩", drop: 18,   hp: 40,  type: "food" },
  { id: "feldiszno",  name: "Fél disznó",          icon: "🐖", drop: 6,    hp: 65,  type: "food" },
  { id: "malac",      name: "Sült malac egészben", icon: "🐷", drop: 3,    hp: 100, type: "food" },
  { id: "marha",      name: "Marha",               icon: "🐄", drop: 1,    hp: 160, type: "food" },
  // Recept-kimenetek: NEM esnek a gombból (drop 0), csak recepttel készülnek.
  { id: "menu",       name: "Hajni Menü",          icon: "🍱", drop: 0,    hp: 50,  type: "food", craft: true },
  { id: "lakoma",     name: "Lakoma tál",          icon: "🍲", drop: 0,    hp: 140, type: "food", craft: true },
  { id: "marhatelep", name: "Marhatelep",          icon: "🏭", drop: 0.3,  hp: 0,   type: "building" },
];

// ── TERMELŐK (idle, mint a Marhatelep) ──────────────────────
// Aranyért vehető, szintezhető. Szintenként arányosan gyorsabb.
const PRODUCERS = [
  { id: "burgerbake", name: "Burgersütöde", icon: "🍔", foodId: "hamburger", baseCost: 60,  costGrowth: 1.40, intervalMs: 8000 },
  { id: "csirkefarm", name: "Csirkefarm",   icon: "🐔", foodId: "csirke",    baseCost: 220, costGrowth: 1.45, intervalMs: 12000 },
  { id: "steakhaz",   name: "Steakház",     icon: "🥩", foodId: "steak",     baseCost: 900, costGrowth: 1.50, intervalMs: 20000 },
];

// ── RECEPTEK ────────────────────────────────────────────────
// Kajákból „menü" készíthető: a kimenet TÖBB húspontot ér, mint a
// hozzávalók külön-külön (jutalom), + helyet spórol a hűtőben.
const RECIPES = [
  { id: "menu",   out: "menu",   cost: { hamburger: 2, hbmenu: 2, csirkecomb: 2 } },
  { id: "lakoma", out: "lakoma", cost: { steak: 1, oldalas: 1, csirke: 2 } },
];

// ── ÁLTALÁNOS BEÁLLÍTÁSOK ───────────────────────────────────
const CONFIG = {
  saveKey: "hajni_clicker_save_v2",

  // ── PÉNZ ──
  goldPerClick: 1,           // ennyi aranypénz / kattintás a 🪙 gombbal

  // ── ELADÁS (hűtőből, slotonként az egész stack) ──
  // FONTOS: a PÉNZ gomb legyen MINDIG sokkal erősebb bevétel az eladásnál,
  // ezért ez a szorzó szándékosan alacsony. Emeld óvatosan!
  sellFactor: 0.1,           // eladási ár = max(1, round(darab * húspont * sellFactor))

  // ── HAJNI HÚSPONTIGÉNYE (mennyi kell a teljes jóllakáshoz) ──
  baseFullRequirement: 20,   // 0. szinten ennyi húspont a teljes jóllakás
  reqGrowthPerLevel: 1.15,   // szintenként ennyiszeresére nő az igény

  // ── SZINTLÉPÉS (elfogyasztott húspont alapján) ──
  baseLevelUpReq: 30,        // 0→1 szinthez ennyi elfogyasztott húspont kell
  levelUpGrowth: 1.20,       // szintenként ennyiszer több kell

  // ── ÉHEZÉSI BÜNTETÉS (ébren, ha nem etetik) ──
  hungerCycleMs: 30000,      // ennyi időnként nő az éhség
  hungerPenaltyBase: 5,      // alap +húspont / ciklus
  hungerPenaltyPerLevel: 1,  // + szintenként ennyivel több a büntetés

  // ── HŰTŐ SLOTOK ──
  fridgeStartSlots: 1,       // ennyi használható slottal indul
  fridgeMaxSlots: 50,        // maximum
  slotStackLimit: 20,        // egy slotban max ennyi azonos item
  fridgeBaseCost: 25,        // a 2. slot ára
  fridgeCostGrowth: 1.35,    // minden további slot ennyiszer drágább

  // ── ÁGY (alvási idő) ──
  bedMaxLevel: 15,
  bedBaseSleepMs: 20000,     // 1. szinten 20 mp alvás
  bedSleepPerLevelMs: 8000,  // szintenként +8 mp
  bedBaseCost: 40,           // a 2. szint ára
  bedCostGrowth: 1.40,

  // ── ZSÍRLESZÍVÁS (csökkenti a húspontigényt) ──
  lipoMaxLevel: 10,
  lipoReductionPerLevel: 0.04, // szintenként -4% igény
  lipoMaxReduction: 0.50,      // MAX 50% csökkentés (sosem nullázható le)
  lipoBaseCost: 100,           // 1. kezelés ára
  lipoCostGrowth: 1.55,

  // ── LACIKA (tartva-termelő segéd) ──
  // 1. szint (0→1) ára 50 🪙, szinte végtelenül fejleszthető.
  // Aktiválás: 15 húscafat → Lacika aktív (szint × 15) mp-ig. Amíg aktív,
  // a farm-gombokat NYOMVA TARTVA automatikusan termelnek.
  lacikaBaseCost: 50,          // az 1. szint (0→1) ára
  lacikaCostGrowth: 1.5,       // minden további szint ennyiszer drágább
  lacikaSecondsPerLevel: 15,   // aktiválási időtartam = szint × ennyi mp
  lacikaActivateFood: "huscafat",
  lacikaActivateAmount: 15,    // egy aktiválás ennyi húscafatba kerül
  lacikaHoldIntervalMs: 120,   // tartva ilyen gyakran termel (gyorsabb a kézinél)

  // ── MARHATELEP (jackpot termelő épület) ──
  marhatelepIntervalMs: 15000, // 15 mp-enként 1 Marha / telep a hűtőbe

  // ── GAME OVER ──
  // true = Game Over után a megvett fejlesztések (hűtő/ágy/zsír) és az
  // aranypénz MEGMARADNAK (meta-progresszió). false = teljes nulláról.
  gameOverKeepUpgrades: true,

  // ── COMBO (gyors kattintás szorzó) ──
  comboWindowMs: 900,   // ennyin belüli kattintás folytatja a combót
  comboStep: 5,         // ennyi kattintásonként +1 szorzó
  comboMaxBonus: 4,     // max bónusz → ×5

  // ── ESEMÉNYEK ──
  eventMinMs: 45000,        // legalább ennyi idő két esemény között
  eventMaxMs: 90000,        // legfeljebb ennyi
  goldRainDurationMs: 12000,// aranyeső hossza
  goldRainMult: 2,          // aranyeső alatt ennyiszeres arany/kattintás

  // ── RÉMÁLOM (zöldségekről) ──
  nightmareChance: 0.18,       // ébredésenként ennyi eséllyel rémálom
  nightmareBonusFactor: 0.30,  // ennyivel ugrik meg TARTÓSAN a húspontigény

  // ── ÉLMÉNY (juice) ──
  soundDefault: true,   // hangeffektek alapból be
  vibrateDefault: true, // rezgés alapból be (iPhone-on nincs Vibration API → ott hatástalan)

  // ── MENTÉS ──
  autosaveMs: 3000,
  maxOfflineCatchupMs: 24 * 60 * 60 * 1000, // offline max 24 óra
};

// ── HAJNI ÁLLAPOT-KINÉZETEK ─────────────────────────────────
// A "sprite" a images/hajni.png 2×2 rácsán belüli negyedet jelöli:
//   tl = bal-fent (Alvás)      tr = jobb-fent (Éhes)
//   bl = bal-lent (Extrém éhes) br = jobb-lent (Közömbös)
// Ha a kép hiányzik, a "face" emoji a tartalék.
const HAJNI_LOOKS = {
  sleeping: { face: "😴", label: "ALSZIK",      hint: "Farmolj kaját 🍔 vagy pénzt 🪙!",  sprite: "tl" },
  content:  { face: "🙂", label: "JÓLLAKOTT",   hint: "Hajni elégedett… mindjárt alszik.", sprite: "br" },
  hungry:   { face: "😒", label: "ÉHES",        hint: "Nyisd a hűtőt és etesd meg!",       sprite: "tr" },
  starving: { face: "😩", label: "EXTRÉM ÉHES", hint: "Siess, egyre éhesebb!",             sprite: "bl" },
  eating:   { face: "😋", label: "ESZIK",       hint: "Nyam-nyam…",                        sprite: "bl" },
  paused:   { face: "⏸️", label: "MEGÁLLÍTVA",  hint: "A játék szünetel.",                 sprite: "br" },
  gameover: { face: "💀", label: "GAME OVER",   hint: "A hűtő üresen maradt…",             sprite: "br" },
};

// ============================================================
// KÉPLETEK – ezek is szabadon átírhatók (a fenti konstansokból)
// ============================================================

// Hajni NYERS húspontigénye adott szinten (zsírleszívás nélkül).
function fullRequirementRaw(level) {
  return Math.round(CONFIG.baseFullRequirement * Math.pow(CONFIG.reqGrowthPerLevel, level));
}

// Következő szinthez szükséges elfogyasztott húspont.
function levelUpRequirement(level) {
  return Math.round(CONFIG.baseLevelUpReq * Math.pow(CONFIG.levelUpGrowth, level));
}

// Éhezési büntetés (húspont / 30 mp) adott szinten.
function hungerPenalty(level) {
  return CONFIG.hungerPenaltyBase + level * CONFIG.hungerPenaltyPerLevel;
}

// A KÖVETKEZŐ hűtőslot ára (currentSlots = jelenlegi slotszám).
function fridgeSlotCost(currentSlots) {
  const step = currentSlots - CONFIG.fridgeStartSlots; // 0 az első vásárlásnál
  return Math.round(CONFIG.fridgeBaseCost * Math.pow(CONFIG.fridgeCostGrowth, step));
}

// Alvási idő (ms) adott ágyszinten (1-től indul).
function bedSleepMs(bedLevel) {
  return CONFIG.bedBaseSleepMs + (bedLevel - 1) * CONFIG.bedSleepPerLevelMs;
}

// A KÖVETKEZŐ ágyszint ára (bedLevel = jelenlegi szint).
function bedUpgradeCost(bedLevel) {
  return Math.round(CONFIG.bedBaseCost * Math.pow(CONFIG.bedCostGrowth, bedLevel - 1));
}

// Zsírleszívás húspontigény-csökkentése (0..lipoMaxReduction).
function lipoReduction(lipoLevel) {
  return Math.min(lipoLevel * CONFIG.lipoReductionPerLevel, CONFIG.lipoMaxReduction);
}

// A KÖVETKEZŐ zsírleszívás-kezelés ára (lipoLevel = jelenlegi szint).
function lipoUpgradeCost(lipoLevel) {
  return Math.round(CONFIG.lipoBaseCost * Math.pow(CONFIG.lipoCostGrowth, lipoLevel));
}

// Egy teljes slot (adott kaja × darab) eladási ára.
function sellPrice(hp, count) {
  return Math.max(1, Math.round(count * hp * CONFIG.sellFactor));
}

// A KÖVETKEZŐ Lacika-szint ára (level = jelenlegi szint; 1→2 = lacikaBaseCost).
// Lacika az 1. szinten indul (nincs feloldás), mint a többi fejlesztés.
function lacikaUpgradeCost(level) {
  return Math.round(CONFIG.lacikaBaseCost * Math.pow(CONFIG.lacikaCostGrowth, level - 1));
}
// Egy aktiválás időtartama (ms) adott Lacika-szinten.
function lacikaDurationMs(level) {
  return level * CONFIG.lacikaSecondsPerLevel * 1000;
}

// Egy termelő KÖVETKEZŐ szintjének ára (level = jelenlegi szint).
function producerCost(p, level) {
  return Math.round(p.baseCost * Math.pow(p.costGrowth, level));
}

// Szintsáv színe a szinthez (a legmagasabb illeszkedő "min" nyer).
const LEVEL_COLORS = [
  { min: 0,  from: "#8a8f98", to: "#aeb4bd" }, // szürke
  { min: 3,  from: "#3fb950", to: "#57d977" }, // zöld
  { min: 6,  from: "#2bb3c0", to: "#4fd6e3" }, // türkiz
  { min: 10, from: "#3d7bff", to: "#6aa0ff" }, // kék
  { min: 15, from: "#9d5cff", to: "#c08cff" }, // lila
  { min: 20, from: "#ff5cc0", to: "#ff8fd6" }, // pink
  { min: 30, from: "#ff9d3c", to: "#ffd166" }, // arany
];
function levelColor(level) {
  let chosen = LEVEL_COLORS[0];
  for (const c of LEVEL_COLORS) if (level >= c.min) chosen = c;
  return chosen;
}
