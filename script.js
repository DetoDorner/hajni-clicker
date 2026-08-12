// ============================================================
// script.js – Hajni Burger Clicker (v3) – játéklogika
// ------------------------------------------------------------
// FŐ LOOP:
//   HAJNI ALSZIK → farmolsz 🍔 kaját VAGY 🪙 pénzt (döntesz!)
//     → fejleszthetsz / eladhatsz kaját
//   HAJNI FELÉBRED:
//     • ha a hűtő teljesen üres → 💀 GAME OVER
//     • különben ÉHES → etetsz a hűtőből (kézzel VAGY ⚡ gyors etetés),
//       amíg jól nem lakik. Ha nem eteted, 30 mp-enként éhesebb lesz
//       (előbb ÉHES, majd EXTRÉM ÉHES).
//   JÓLLAKIK → visszaalszik → új kör.
// ============================================================

(() => {
  "use strict";

  const FOOD_BY_ID = Object.fromEntries(FOODS.map(f => [f.id, f]));
  const MAX_SLOTS = CONFIG.fridgeMaxSlots;
  const SPRITE_POS = { tl: "0% 0%", tr: "100% 0%", bl: "0% 100%", br: "100% 100%" };

  function randRange(a, b) { return a + Math.random() * (b - a); }
  let catchingUp = false; // offline visszaszámolás alatt ne legyen FX/esemény
  let achChkTimer = 0;    // achievement-ellenőrzés ütemezése

  // ── JÁTÉKÁLLAPOT ──────────────────────────────────────────
  let game = null;

  function newGame() {
    return {
      state: "sleeping",          // "sleeping" | "hungry" | "gameover"
      paused: false,

      level: 0,
      levelProgressHP: 0,

      hunger: 0,                  // hátralévő húspont a jóllakásig (ébren)
      hungerPeak: 1,              // mérő skálázás
      baseRequirement: 0,         // az ébredéskori igény (extrém éhség küszöb)

      sleepElapsed: 0,
      hungerCycleElapsed: 0,
      feedFlashUntil: 0,          // "ESZIK" felvillanás
      contentFlashUntil: 0,       // "JÓLLAKOTT" felvillanás elalvás előtt

      gold: 0,
      fridgeSlots: CONFIG.fridgeStartSlots,
      bedLevel: 1,
      lipoLevel: 0,

      // Lacika (tartva-termelő segéd) – az 1. szinten indul, nincs feloldás
      lacikaLevel: 1,
      lacikaRemainingMs: 0,   // hátralévő aktív idő
      lacikaTotalMs: 0,       // a sáv skálázásához (aktiváláskori teljes idő)

      fridge: new Array(MAX_SLOTS).fill(null),

      marhatelep: 0,
      marhaProdElapsed: 0,

      // termelők (idle): { id: {lvl, el} }
      producers: Object.fromEntries(PRODUCERS.map(p => [p.id, { lvl: 0, el: 0 }])),

      // rémálom (zöldségekről) – TARTÓS húspontigény-növelő
      nightmareBonus: 0,
      hadNightmare: false,

      // események
      eventTimer: 0,
      eventNextMs: randRange(CONFIG.eventMinMs, CONFIG.eventMaxMs),
      goldRainMs: 0,        // aktív aranyeső hátralévő ideje
      merchantOffer: null,  // {foodId, qty, price} amikor vándorárus van

      // prestige (META): állandó ⭐ bónusz
      csillag: 0,

      // célok / statisztika (META – runok között megmarad)
      achievements: {},     // { id: true } a teljesítettek
      stats: { foodFarmed: 0, goldEarned: 0, fed: 0, crafted: 0, merchantsBought: 0, bestLevel: 0, nightmares: 0, gamesOver: 0, prestiges: 0 },

      // élmény-beállítások
      soundOn: CONFIG.soundDefault,
      vibrateOn: CONFIG.vibrateDefault,

      lastSaved: Date.now(),
    };
  }

  // ── DOM ───────────────────────────────────────────────────
  const el = {};
  function cacheDom() {
    const ids = [
      "levelNum","levelBarFill","levelBarText","goldNum","starPill","starNum",
      "lacikaBar","lacikaFill","lacikaText",
      "prestigeBtn","prestigePanel","closePrestige","prestigeBody","prestigeConfirm","prestigeCancel",
      "hajniFace","hajniSprite","hajniState","hajniHint","hajniAvatar","lastGain",
      "sleepRow","sleepTime","hungerRow","hungerFill","hungerText","reqText",
      "burgerBtn","moneyBtn","pauseBtn","popupLayer",
      "fridgeBtn","fridgePanel","closeFridge","fridgeHead","fridgeStatus",
      "autoFeedBtn","fridgeSlots","buySlotBtn",
      "foodInfoBtn","foodInfoPanel","closeFoodInfo","foodInfoList",
      "comboIndicator","producersList","recipeBtn","recipePanel","closeRecipe","recipeList",
      "merchantPanel","merchantText","merchantBuy","merchantSkip",
      "achBtn","achPanel","closeAch","achList",
      "upgBtn","upgPanel","closeUpg","upgStatus","upgList","resetAllBtn",
      "soundToggle","vibrateToggle","fxLayer",
      "gameoverPanel","restartBtn",
    ];
    ids.forEach(id => el[id] = document.getElementById(id));
  }

  // ============================================================
  // ÉLMÉNY (juice): hang + rezgés + konfetti + rázás
  // ============================================================
  let audioCtx = null;
  function ensureAudio() {
    if (!game.soundOn) return null;
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === "suspended") audioCtx.resume();
    } catch (_) { return null; }
    return audioCtx;
  }
  function beep(freq, durMs, type, gain, delay) {
    const ctx = ensureAudio(); if (!ctx) return;
    const t = ctx.currentTime + (delay || 0);
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = type || "sine"; osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain || 0.12, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + durMs / 1000);
    osc.connect(g); g.connect(ctx.destination);
    osc.start(t); osc.stop(t + durMs / 1000 + 0.03);
  }
  function sfx(name) {
    if (!game.soundOn || catchingUp) return;
    switch (name) {
      case "nightmare": [340, 260, 200, 150].forEach((f, i) => beep(f, 240, "sine", 0.12, i * 0.13)); break;
      case "click":    beep(200 + Math.random() * 50, 55, "square", 0.05); break;
      case "coin":     beep(880, 60, "triangle", 0.07); beep(1320, 55, "triangle", 0.05, 0.04); break;
      case "feed":     beep(300, 90, "sine", 0.11); break;
      case "levelup":  [523, 659, 784, 1047].forEach((f, i) => beep(f, 150, "triangle", 0.12, i * 0.08)); break;
      case "jackpot":  [660, 880, 1100, 1320].forEach((f, i) => beep(f, 170, "sawtooth", 0.11, i * 0.06)); break;
      case "gameover": [440, 330, 262, 196].forEach((f, i) => beep(f, 260, "sine", 0.13, i * 0.15)); break;
      case "buy":      beep(500, 70, "square", 0.08); beep(750, 70, "square", 0.06, 0.05); break;
    }
  }
  function haptic(pattern) {
    if (game.vibrateOn && navigator.vibrate) { try { navigator.vibrate(pattern); } catch (_) {} }
  }
  function screenShake() {
    if (catchingUp) return;
    const app = document.querySelector(".app"); if (!app) return;
    app.classList.remove("shake"); void app.offsetWidth; app.classList.add("shake");
    setTimeout(() => app.classList.remove("shake"), 450);
  }
  function confettiBurst(n) {
    if (!el.fxLayer || catchingUp) return;
    const colors = ["#ff9d3c", "#ffd24d", "#52c95f", "#ff5a8a", "#5ab0ff", "#c08cff"];
    for (let i = 0; i < (n || 26); i++) {
      const c = document.createElement("div");
      c.className = "confetti";
      c.style.left = (10 + Math.random() * 80) + "%";
      c.style.background = colors[(Math.random() * colors.length) | 0];
      c.style.animationDelay = (Math.random() * 0.15) + "s";
      c.style.transform = `rotate(${Math.random() * 360}deg)`;
      el.fxLayer.appendChild(c);
      setTimeout(() => c.remove(), 1600);
    }
  }
  function bannerFlash(text) {
    if (!el.fxLayer || catchingUp) return;
    const b = document.createElement("div");
    b.className = "fx-banner"; b.textContent = text;
    el.fxLayer.appendChild(b);
    setTimeout(() => b.remove(), 1200);
  }
  function celebrateLevelUp(newLevel) {
    sfx("levelup"); haptic([15, 30, 15]);
    confettiBurst(30); bannerFlash("SZINT " + newLevel + "! 🎉");
  }

  // ── SEGÉDEK ───────────────────────────────────────────────
  function unlockedSlots() { return game.fridge.slice(0, game.fridgeSlots); }
  function fridgeItemCount() {
    let n = 0;
    for (let i = 0; i < game.fridgeSlots; i++) if (game.fridge[i]) n += game.fridge[i].count;
    return n;
  }
  function fridgeIsEmpty() { return fridgeItemCount() === 0; }

  function currentFullRequirement() {
    const raw = fullRequirementRaw(game.level);
    const reduced = Math.max(1, Math.round(raw * (1 - lipoReduction(game.lipoLevel))));
    // a rémálom-bónusz TARTÓS: a húspontigény alsó küszöbét emeli
    return reduced + (game.nightmareBonus | 0);
  }

  function fmtTime(ms) {
    const s = Math.max(0, Math.ceil(ms / 1000));
    return `${String(Math.floor(s / 60)).padStart(2,"0")}:${String(s % 60).padStart(2,"0")}`;
  }

  function setLastGain(text) { if (el.lastGain) el.lastGain.textContent = text; }

  // ============================================================
  // FARMOLÁS (csak alvás közben)
  // ============================================================
  const DROP_TOTAL = FOODS.reduce((s, f) => s + f.drop, 0);
  function rollFood() {
    let r = Math.random() * DROP_TOTAL;
    for (const f of FOODS) { r -= f.drop; if (r <= 0) return f; }
    return FOODS[0];
  }

  // Kaja a hűtőbe: azonos típusú, nem tele (<20) slot → +1;
  // ha minden azonos stack tele, ÚJ üres slotba kerül (így ugyanaz a kaja
  // több sloton is lehet). Tele hűtő → false.
  function addFoodToFridge(foodId) {
    for (let i = 0; i < game.fridgeSlots; i++) {
      const c = game.fridge[i];
      if (c && c.foodId === foodId && c.count < CONFIG.slotStackLimit) { c.count++; return true; }
    }
    for (let i = 0; i < game.fridgeSlots; i++) {
      if (!game.fridge[i]) { game.fridge[i] = { foodId, count: 1 }; return true; }
    }
    return false;
  }

  function canFarm() { return game.state === "sleeping" && !game.paused; }
  function lacikaActive() { return game.lacikaRemainingMs > 0; }
  // Állandó prestige-szorzó a csillagokból (húspont + arany).
  function prestigeMult() { return 1 + (game.csillag | 0) * CONFIG.prestigeBonusPerStar; }

  // ── COMBO: gyors egymás utáni kattintás szorzót épít ──
  let comboCount = 0, comboLastAt = 0;
  function bumpCombo() {
    const now = performance.now();
    comboCount = (now - comboLastAt <= CONFIG.comboWindowMs) ? comboCount + 1 : 1;
    comboLastAt = now;
  }
  function comboMult() {
    return 1 + Math.min(Math.floor(comboCount / CONFIG.comboStep), CONFIG.comboMaxBonus);
  }

  function produceFood(ev) {
    if (!canFarm()) return;
    bumpCombo();
    const mult = comboMult();
    const food = rollFood();
    if (food.type === "building") {
      game.marhatelep += mult;
      spawnPopup(food.icon, food.name + (mult > 1 ? ` ×${mult}` : ""), ev);
      setLastGain(`🏭 Marhatelep! (${game.marhatelep})`);
    } else {
      let added = 0;
      for (let i = 0; i < mult; i++) { if (addFoodToFridge(food.id)) added++; else break; }
      const ok = added > 0;
      game.stats.foodFarmed += added;
      spawnPopup(ok ? food.icon : "❌", ok ? (food.name + (added > 1 ? ` ×${added}` : "")) : "Hűtő tele!", ev);
      setLastGain(ok ? `${food.icon} ${food.name} +${added}` : "❌ A hűtő tele van!");
    }
    const jackpot = food.id === "marhatelep" || food.id === "marha";
    if (jackpot) { sfx("jackpot"); haptic([20, 40, 20]); screenShake(); }
    else { sfx("click"); haptic(8); }
    renderFridge(); updateUI(); scheduleSave();
  }

  function produceMoney(ev) {
    if (!canFarm()) return;
    bumpCombo();
    const rain = game.goldRainMs > 0 ? CONFIG.goldRainMult : 1;
    const amt = Math.round(CONFIG.goldPerClick * comboMult() * rain * prestigeMult());
    game.gold += amt;
    game.stats.goldEarned += amt;
    spawnPopup("🪙", `+${amt}`, ev);
    setLastGain(`🪙 +${amt} aranypénz${rain > 1 ? " (aranyeső!)" : ""}`);
    sfx("coin"); haptic(8);
    updateUI(); scheduleSave();
  }

  // ── Farm gomb: koppintás = 1 termelés; Lacika alatt NYOMVA TARTVA
  //    automatikusan, gyorsabban termel. ──
  function setupFarmButton(btn, action) {
    let timer = null;
    const stop = () => { if (timer) { clearInterval(timer); timer = null; } };
    btn.addEventListener("pointerdown", (e) => {
      if (e.isPrimary === false) return;
      if (!canFarm()) return;
      e.preventDefault();
      action(e); // egy koppintás = egy termelés
      if (lacikaActive()) {
        try { btn.setPointerCapture(e.pointerId); } catch (_) {}
        stop();
        timer = setInterval(() => {
          if (canFarm() && lacikaActive()) action();
          else stop();
        }, CONFIG.lacikaHoldIntervalMs);
      }
    });
    ["pointerup", "pointercancel", "pointerleave", "lostpointercapture"]
      .forEach(ev => btn.addEventListener(ev, stop));
  }

  // Adott kajából mennyi van összesen a hűtőben.
  function countFood(foodId) {
    let n = 0;
    for (let i = 0; i < game.fridgeSlots; i++) {
      const c = game.fridge[i];
      if (c && c.foodId === foodId) n += c.count;
    }
    return n;
  }
  // Adott kajából levon n darabot a slotokból. true, ha volt elég.
  function removeFood(foodId, n) {
    if (countFood(foodId) < n) return false;
    for (let i = 0; i < game.fridgeSlots && n > 0; i++) {
      const c = game.fridge[i];
      if (c && c.foodId === foodId) {
        const take = Math.min(c.count, n);
        c.count -= take; n -= take;
        if (c.count <= 0) game.fridge[i] = null;
      }
    }
    return true;
  }

  // Lacika aktiválása: 15 húscafat → azonnal (szint×15) mp aktív idő.
  // Nem tárazható: az idő a teljes időtartamra ÁLL BE (nem stackelődik).
  function activateLacika() {
    if (game.paused || game.state === "gameover") return;
    if (countFood(CONFIG.lacikaActivateFood) < CONFIG.lacikaActivateAmount) return;
    removeFood(CONFIG.lacikaActivateFood, CONFIG.lacikaActivateAmount);
    const dur = lacikaDurationMs(game.lacikaLevel);
    game.lacikaRemainingMs = dur;
    game.lacikaTotalMs = dur;
    setLastGain(`🦾 Lacika aktív! ${Math.round(dur / 1000)} mp`);
    renderFridge(); renderUpgrades(); updateUI(); scheduleSave();
  }

  function buyLacika() {
    const cost = lacikaUpgradeCost(game.lacikaLevel);
    if (game.gold < cost) return;
    game.gold -= cost; game.lacikaLevel++;
    sfx("buy"); haptic(10);
    renderUpgrades(); updateUI(); saveGame();
  }

  function buyProducer(id) {
    const p = PRODUCERS.find((x) => x.id === id); if (!p) return;
    const st = game.producers[id];
    const cost = producerCost(p, st.lvl);
    if (game.gold < cost) return;
    game.gold -= cost; st.lvl++;
    sfx("buy"); haptic(10);
    renderProducers(); updateUI(); saveGame();
  }

  // ── RECEPTEK ──
  // Van-e hely a hűtőben egy adott kajának (azonos stack <limit vagy üres slot).
  function foodStackCanAccept(foodId) {
    for (let i = 0; i < game.fridgeSlots; i++) {
      const c = game.fridge[i];
      if (c && c.foodId === foodId && c.count < CONFIG.slotStackLimit) return true;
    }
    for (let i = 0; i < game.fridgeSlots; i++) if (!game.fridge[i]) return true;
    return false;
  }
  function canCraft(r) {
    if (game.paused || game.state === "gameover") return false;
    for (const fid in r.cost) if (countFood(fid) < r.cost[fid]) return false;
    return foodStackCanAccept(r.out);
  }
  function craftRecipe(id) {
    const r = RECIPES.find((x) => x.id === id); if (!r) return;
    if (!canCraft(r)) return;
    for (const fid in r.cost) removeFood(fid, r.cost[fid]);
    addFoodToFridge(r.out);
    game.stats.crafted++;
    const out = FOOD_BY_ID[r.out];
    sfx("buy"); haptic(14);
    setLastGain(`${out.icon} ${out.name} elkészült!`);
    renderRecipes(); renderFridge(); renderUpgrades(); updateUI(); scheduleSave();
  }

  // ============================================================
  // ESEMÉNYEK
  // ============================================================
  function triggerRandomEvent() {
    if (game.state === "gameover" || game.paused || game.merchantOffer) return;
    const r = Math.random();
    if (r < 0.30) eventGoldRain();
    else if (r < 0.55) eventCoinShower();
    else if (r < 0.80) eventFoodFeast();
    else eventMerchant();
  }
  function eventGoldRain() {
    game.goldRainMs = CONFIG.goldRainDurationMs;
    sfx("jackpot"); confettiBurst(24);
    bannerFlash("🌟 ARANYESŐ! ×" + CONFIG.goldRainMult + " arany");
    updateUI();
  }
  function eventCoinShower() {
    const amt = Math.round((15 + game.level * 6) * (2 + Math.random() * 3));
    game.gold += amt;
    sfx("coin"); confettiBurst(18);
    bannerFlash("🍀 Talált pénz +" + amt + " 🪙");
    updateUI(); scheduleSave();
  }
  function eventFoodFeast() {
    const pool = ["hamburger", "hbmenu", "csirkecomb", "csirke", "oldalas"];
    const fid = pool[(Math.random() * pool.length) | 0];
    const want = 5 + ((Math.random() * (game.level + 4)) | 0);
    let added = 0;
    for (let i = 0; i < want; i++) { if (addFoodToFridge(fid)) added++; else break; }
    const f = FOOD_BY_ID[fid];
    sfx("buy"); confettiBurst(16);
    bannerFlash(`🎁 Vendégség! +${added} ${f.icon}`);
    renderFridge(); updateUI(); scheduleSave();
  }
  function eventMerchant() {
    const pool = ["oldalas", "steak", "feldiszno", "csirke"];
    const fid = pool[(Math.random() * pool.length) | 0];
    const f = FOOD_BY_ID[fid];
    const qty = 4 + ((Math.random() * 6) | 0);
    const price = Math.max(10, Math.round(qty * f.hp * 0.5)); // ~fél arany/HP → jó bolt
    game.merchantOffer = { foodId: fid, qty, price };
    sfx("buy");
    openMerchant();
    scheduleSave();
  }
  function openMerchant() {
    const o = game.merchantOffer; if (!o || !el.merchantPanel) return;
    const f = FOOD_BY_ID[o.foodId];
    el.merchantText.innerHTML = `A vándorárus kínál <b>${o.qty}× ${f.icon} ${f.name}</b>-t <b>${o.price} 🪙</b>-ért.`;
    el.merchantBuy.disabled = game.gold < o.price;
    el.merchantPanel.classList.add("open");
  }
  function merchantBuy() {
    const o = game.merchantOffer; if (!o || game.gold < o.price) return;
    let added = 0;
    for (let i = 0; i < o.qty; i++) { if (addFoodToFridge(o.foodId)) added++; else break; }
    if (added === 0) { setLastGain("❌ Nincs hely a hűtőben!"); return; }
    game.gold -= o.price;
    game.merchantOffer = null;
    game.stats.merchantsBought++;
    sfx("buy"); haptic(12);
    setLastGain(`🚚 Vettél ${added}× ${FOOD_BY_ID[o.foodId].icon}`);
    if (el.merchantPanel) el.merchantPanel.classList.remove("open");
    renderFridge(); renderUpgrades(); updateUI(); scheduleSave();
  }
  function merchantSkip() {
    game.merchantOffer = null;
    if (el.merchantPanel) el.merchantPanel.classList.remove("open");
    updateUI(); saveGame();
  }

  // ============================================================
  // CÉLOK / ACHIEVEMENTEK
  // ============================================================
  function metricValue(m) {
    const s = game.stats;
    switch (m) {
      case "bestLevel": return Math.max(s.bestLevel || 0, game.level);
      case "foodFarmed": return s.foodFarmed || 0;
      case "goldEarned": return s.goldEarned || 0;
      case "crafted": return s.crafted || 0;
      case "nightmares": return s.nightmares || 0;
      case "fed": return s.fed || 0;
      case "marhatelep": return game.marhatelep;
      case "producerLevels": return PRODUCERS.reduce((a, p) => a + (game.producers[p.id] ? game.producers[p.id].lvl : 0), 0);
      default: return 0;
    }
  }
  function checkAchievements() {
    game.stats.bestLevel = Math.max(game.stats.bestLevel || 0, game.level);
    let any = false;
    for (const a of ACHIEVEMENTS) {
      if (game.achievements[a.id]) continue;
      if (metricValue(a.metric) >= a.need) {
        game.achievements[a.id] = true;
        game.gold += a.reward;
        any = true;
        if (!catchingUp) { sfx("levelup"); haptic([15, 30, 15]); confettiBurst(24); bannerFlash(`🏆 ${a.name}! +${a.reward} 🪙`); }
      }
    }
    if (any) { updateUI(); renderAchievements(); saveGame(); }
  }

  function spawnPopup(icon, label, ev) {
    const p = document.createElement("div");
    p.className = "food-popup";
    p.innerHTML = `<span class="pp-ic">${icon}</span><span class="pp-tx">${label}</span>`;
    const rect = el.popupLayer.getBoundingClientRect();
    let x = rect.width / 2, y = rect.height * 0.72;
    const pt = ev && (ev.clientX != null ? ev : (ev.changedTouches && ev.changedTouches[0]));
    if (pt && pt.clientX != null) { x = pt.clientX - rect.left; y = pt.clientY - rect.top; }
    p.style.left = x + "px"; p.style.top = y + "px";
    el.popupLayer.appendChild(p);
    setTimeout(() => p.remove(), 950);
  }

  // ============================================================
  // ETETÉS
  // ============================================================
  // Egy adag megetetése (csak az állapotot módosítja, nem renderel).
  function feedOne(slotIdx) {
    const c = game.fridge[slotIdx];
    if (!c || c.count <= 0) return false;
    const food = FOOD_BY_ID[c.foodId];
    game.hunger = Math.max(0, game.hunger - food.hp);
    game.levelProgressHP += food.hp * prestigeMult(); // ⭐ gyorsabb szintezés
    c.count--;
    if (c.count <= 0) game.fridge[slotIdx] = null;
    game.stats.fed++;
    checkLevelUps();
    return true;
  }

  function feedFromSlot(slotIdx) {
    if (game.state !== "hungry" || game.paused) return;
    const prevLevel = game.level;
    if (!feedOne(slotIdx)) return;
    game.feedFlashUntil = performance.now() + 700;
    sfx("feed"); haptic(12);
    if (game.level > prevLevel) celebrateLevelUp(game.level);
    if (game.hunger <= 0) goToSleep(); else maybeGameOver();
    renderFridge(); renderUpgrades(); updateUI(); pulseLevel(); scheduleSave();
  }

  // ⚡ Gyors etetés: automatikusan etet, amíg jól nem lakik / el nem fogy.
  // Okos választás: a legnagyobb kaja, ami még belefér a hátralévő igénybe,
  // különben a legkisebb (minimális pazarlás).
  function pickBestSlot(remaining) {
    let best = null, bestHp = -1, minSlot = null, minHp = Infinity;
    for (let i = 0; i < game.fridgeSlots; i++) {
      const c = game.fridge[i];
      if (!c || c.count <= 0) continue;
      const hp = FOOD_BY_ID[c.foodId].hp;
      if (hp <= remaining && hp > bestHp) { bestHp = hp; best = i; }
      if (hp < minHp) { minHp = hp; minSlot = i; }
    }
    return best != null ? best : minSlot;
  }

  function autoFeed() {
    if (game.state !== "hungry" || game.paused) return;
    const prevLevel = game.level;
    let guard = 0;
    while (game.state === "hungry" && game.hunger > 0 && !fridgeIsEmpty() && guard < 100000) {
      const idx = pickBestSlot(game.hunger);
      if (idx == null) break;
      feedOne(idx);
      guard++;
      if (game.hunger <= 0) break;
    }
    game.feedFlashUntil = performance.now() + 700;
    sfx("feed"); haptic(12);
    if (game.level > prevLevel) celebrateLevelUp(game.level);
    if (game.hunger <= 0) goToSleep(); else maybeGameOver();
    renderFridge(); renderUpgrades(); updateUI(); pulseLevel(); scheduleSave();
  }

  // Rövid felvillanás a húspont-sávon etetéskor (látványos "haladás").
  function pulseLevel() {
    if (!el.levelBarFill) return;
    el.levelBarFill.classList.remove("gain");
    void el.levelBarFill.offsetWidth; // reflow → animáció újraindul
    el.levelBarFill.classList.add("gain");
  }

  function checkLevelUps() {
    let need = levelUpRequirement(game.level);
    while (game.levelProgressHP >= need) {
      game.levelProgressHP -= need;
      game.level++;
      need = levelUpRequirement(game.level);
    }
  }

  // ============================================================
  // ELADÁS (slotonként, az egész stack)
  // ============================================================
  function sellSlot(slotIdx) {
    if (game.paused || game.state === "gameover") return;
    const c = game.fridge[slotIdx];
    if (!c || c.count <= 0) return;
    const price = sellPrice(FOOD_BY_ID[c.foodId].hp, c.count);
    game.gold += price;
    game.fridge[slotIdx] = null;
    setLastGain(`💰 Eladva +${price} 🪙`);
    renderFridge(); renderUpgrades(); updateUI(); scheduleSave();
  }

  // ============================================================
  // ÁLLAPOTVÁLTÁSOK
  // ============================================================
  function wakeUp() {
    if (fridgeIsEmpty()) { doGameOver(); return; }
    // Néha rémálma van a zöldségekről → TARTÓSAN megugrik a húspontigénye.
    game.hadNightmare = Math.random() < CONFIG.nightmareChance;
    if (game.hadNightmare) {
      const jump = Math.max(1, Math.round(fullRequirementRaw(game.level) * CONFIG.nightmareBonusFactor));
      game.nightmareBonus += jump;
      game.stats.nightmares++;
    }
    game.state = "hungry";
    game.hunger = currentFullRequirement();
    game.baseRequirement = game.hunger;
    game.hungerPeak = Math.max(1, game.hunger);
    game.hungerCycleElapsed = 0;
    if (game.hadNightmare) { sfx("nightmare"); haptic([30, 40, 30]); bannerFlash("🥦 RÉMÁLOM! Zöldségek…"); }
  }

  function goToSleep() {
    game.state = "sleeping";
    game.sleepElapsed = 0;
    game.hunger = 0;
    game.hungerCycleElapsed = 0;
    game.contentFlashUntil = performance.now() + 1500; // "JÓLLAKOTT" pillanat
  }

  function maybeGameOver() {
    if (game.state === "hungry" && fridgeIsEmpty() && game.marhatelep === 0) doGameOver();
  }

  function doGameOver() {
    game.state = "gameover";
    game.stats.gamesOver++;
    game.stats.bestLevel = Math.max(game.stats.bestLevel, game.level);
    sfx("gameover"); haptic([60, 50, 60, 50, 120]);
    updateUI(); renderFridge();
    if (el.gameoverPanel) el.gameoverPanel.classList.add("open");
    saveGame();
  }

  // ── PRESTIGE / ÚJJÁSZÜLETÉS ──
  // Nullázza a runt ÉS a fejlesztéseket, cserébe állandó ⭐ bónuszt ad.
  // Megmarad: csillagok, célok, statisztika.
  function doPrestige() {
    const gain = prestigeStars(game.level);
    if (game.level < CONFIG.prestigeMinLevel || gain <= 0) return;
    const keep = {
      csillag: (game.csillag | 0) + gain,
      achievements: game.achievements,
      stats: game.stats,
    };
    game = newGame();
    Object.assign(game, keep);
    game.stats.prestiges = (game.stats.prestiges || 0) + 1;
    if (el.prestigePanel) el.prestigePanel.classList.remove("open");
    el.upgPanel.classList.remove("open");
    lastTick = performance.now();
    setLastGain("");
    sfx("levelup"); haptic([20, 40, 20, 40]); confettiBurst(44);
    bannerFlash(`💫 ÚJJÁSZÜLETÉS! +${gain} ⭐`);
    renderFridge(); renderUpgrades(); renderProducers(); updateUI(); saveGame();
  }
  function renderPrestige() {
    if (!el.prestigeBody) return;
    const gain = prestigeStars(game.level);
    const curBonus = Math.round((prestigeMult() - 1) * 100);
    const newBonus = Math.round((game.csillag + gain) * CONFIG.prestigeBonusPerStar * 100);
    const can = game.level >= CONFIG.prestigeMinLevel && gain > 0;
    el.prestigeBody.innerHTML =
      `<p>Csillagok: <b>${game.csillag} ⭐</b> · állandó bónusz <b>+${curBonus}%</b> húspont & arany</p>
       <p>Most kapnál: <b>+${gain} ⭐</b> → új bónusz: <b>+${newBonus}%</b></p>
       <p class="prestige-warn">⚠️ Ez NULLÁZZA a szintet, aranyat, a hűtőt és MINDEN fejlesztést (hűtő, ágy, zsír, Lacika, termelők). A csillagok, célok és statisztika MEGMARADNAK.</p>
       ${can ? "" : `<p class="prestige-warn">Legalább a ${CONFIG.prestigeMinLevel}. szint kell az újjászületéshez.</p>`}`;
    el.prestigeConfirm.disabled = !can;
  }

  // TELJES törlés: mindent nulláz (szint, arany, fejlesztések, hűtő) és
  // a mentést is kiüríti. Megerősítést kér.
  function hardReset() {
    const ok = window.confirm(
      "Biztosan törlöd a TELJES játékot?\n\nMinden elveszik: szint, aranypénz, fejlesztések és a hűtő tartalma. Ez nem vonható vissza."
    );
    if (!ok) return;
    try { localStorage.removeItem(CONFIG.saveKey); } catch (e) {}
    game = newGame();
    if (el.gameoverPanel) el.gameoverPanel.classList.remove("open");
    el.fridgePanel.classList.remove("open");
    el.upgPanel.classList.remove("open");
    lastTick = performance.now();
    setLastGain("");
    renderFridge(); renderUpgrades(); updateUI(); saveGame();
  }

  function resetRun(keepMeta) {
    const meta = {
      gold: game.gold, fridgeSlots: game.fridgeSlots,
      bedLevel: game.bedLevel, lipoLevel: game.lipoLevel,
      lacikaLevel: game.lacikaLevel, producers: game.producers,
      achievements: game.achievements, stats: game.stats, csillag: game.csillag,
    };
    game = newGame();
    if (keepMeta) Object.assign(game, meta);
    if (el.gameoverPanel) el.gameoverPanel.classList.remove("open");
    lastTick = performance.now();
    setLastGain("");
    renderFridge(); renderUpgrades(); updateUI(); saveGame();
  }

  // ============================================================
  // VÁSÁRLÁSOK
  // ============================================================
  function buyFridgeSlot() {
    if (game.fridgeSlots >= CONFIG.fridgeMaxSlots) return;
    const cost = fridgeSlotCost(game.fridgeSlots);
    if (game.gold < cost) return;
    game.gold -= cost; game.fridgeSlots++;
    sfx("buy"); haptic(10);
    renderFridge(); renderUpgrades(); updateUI(); saveGame();
  }
  function buyBed() {
    if (game.bedLevel >= CONFIG.bedMaxLevel) return;
    const cost = bedUpgradeCost(game.bedLevel);
    if (game.gold < cost) return;
    game.gold -= cost; game.bedLevel++;
    sfx("buy"); haptic(10);
    renderUpgrades(); updateUI(); saveGame();
  }
  function buyLipo() {
    if (game.lipoLevel >= CONFIG.lipoMaxLevel) return;
    const cost = lipoUpgradeCost(game.lipoLevel);
    if (game.gold < cost) return;
    game.gold -= cost; game.lipoLevel++;
    sfx("buy"); haptic(10);
    renderUpgrades(); updateUI(); saveGame();
  }

  // ============================================================
  // PAUSE
  // ============================================================
  function togglePause() {
    if (game.state === "gameover") return;
    game.paused = !game.paused;
    lastTick = performance.now();
    renderFridge(); updateUI(); saveGame();
  }

  // ── Hang / rezgés kapcsoló ──
  function toggleSound() { game.soundOn = !game.soundOn; if (game.soundOn) sfx("buy"); updateToggles(); saveGame(); }
  function toggleVibrate() { game.vibrateOn = !game.vibrateOn; if (game.vibrateOn) haptic(25); updateToggles(); saveGame(); }
  function updateToggles() {
    if (el.soundToggle) {
      el.soundToggle.textContent = game.soundOn ? "🔊 Hang: BE" : "🔇 Hang: KI";
      el.soundToggle.classList.toggle("off", !game.soundOn);
    }
    if (el.vibrateToggle) {
      el.vibrateToggle.textContent = game.vibrateOn ? "📳 Rezgés: BE" : "📴 Rezgés: KI";
      el.vibrateToggle.classList.toggle("off", !game.vibrateOn);
    }
  }

  // ============================================================
  // FŐ HUROK
  // ============================================================
  let lastTick = performance.now();
  function loop(now) {
    const dt = Math.min(now - lastTick, 1000);
    lastTick = now;
    step(dt);
    requestAnimationFrame(loop);
  }

  function step(dt) {
    if (game.paused || game.state === "gameover") return;

    // Lacika visszaszámlálás (ébren is fut)
    if (game.lacikaRemainingMs > 0) {
      game.lacikaRemainingMs = Math.max(0, game.lacikaRemainingMs - dt);
    }

    // Combo lejárása, ha megállt a kattintás
    if (comboCount > 0 && performance.now() - comboLastAt > CONFIG.comboWindowMs) comboCount = 0;

    // Aranyeső buff lejárása
    if (game.goldRainMs > 0) game.goldRainMs = Math.max(0, game.goldRainMs - dt);

    // Esemény-ütemező (offline visszaszámolás alatt nincs esemény)
    if (!catchingUp) {
      game.eventTimer += dt;
      if (game.eventTimer >= game.eventNextMs) {
        game.eventTimer = 0;
        game.eventNextMs = randRange(CONFIG.eventMinMs, CONFIG.eventMaxMs);
        triggerRandomEvent();
      }
      achChkTimer += dt;
      if (achChkTimer >= 1000) { achChkTimer = 0; checkAchievements(); }
    }

    // Termelők (idle): szintenként arányosan gyorsabb
    for (const p of PRODUCERS) {
      const st = game.producers[p.id];
      if (!st || st.lvl <= 0) continue;
      st.el += dt * st.lvl;
      while (st.el >= p.intervalMs) { st.el -= p.intervalMs; addFoodToFridge(p.foodId); }
    }

    if (game.marhatelep > 0) {
      game.marhaProdElapsed += dt * game.marhatelep;
      while (game.marhaProdElapsed >= CONFIG.marhatelepIntervalMs) {
        game.marhaProdElapsed -= CONFIG.marhatelepIntervalMs;
        addFoodToFridge("marha");
      }
    }

    if (game.state === "sleeping") {
      game.sleepElapsed += dt;
      if (game.sleepElapsed >= bedSleepMs(game.bedLevel)) wakeUp();
    } else if (game.state === "hungry") {
      game.hungerCycleElapsed += dt;
      while (game.hungerCycleElapsed >= CONFIG.hungerCycleMs) {
        game.hungerCycleElapsed -= CONFIG.hungerCycleMs;
        game.hunger += hungerPenalty(game.level);
        game.hungerPeak = Math.max(game.hungerPeak, game.hunger);
      }
      maybeGameOver();
    }

    updateUIThrottled();
  }

  // ============================================================
  // UI
  // ============================================================
  function currentLook() {
    const now = performance.now();
    if (game.state === "gameover") return HAJNI_LOOKS.gameover;
    if (game.paused) return HAJNI_LOOKS.paused;
    if (game.state === "sleeping") {
      return now < game.contentFlashUntil ? HAJNI_LOOKS.content : HAJNI_LOOKS.sleeping;
    }
    if (game.state === "hungry") {
      if (now < game.feedFlashUntil) return HAJNI_LOOKS.eating;
      if (game.hunger > game.baseRequirement) return HAJNI_LOOKS.starving; // ignorálva → extrém
      return HAJNI_LOOKS.hungry;
    }
    return HAJNI_LOOKS.sleeping;
  }

  function statusText() {
    if (game.state === "gameover") return "💀 GAME OVER";
    if (game.paused) return "⏸️ Szünet";
    if (game.state === "sleeping") {
      return `😴 ALSZIK · ⏰ ${fmtTime(bedSleepMs(game.bedLevel) - game.sleepElapsed)}`;
    }
    if (game.state === "hungry") {
      const extreme = game.hunger > game.baseRequirement;
      return `${extreme ? "😩 EXTRÉM ÉHES" : "😒 ÉHES"} · ${Math.ceil(game.hunger)} HP hátra`;
    }
    return "";
  }

  let lastUiAt = 0;
  function updateUIThrottled() {
    const now = performance.now();
    if (now - lastUiAt < 60) return;
    lastUiAt = now;
    updateUI();
  }

  function updateUI() {
    const look = currentLook();
    const now = performance.now();

    el.hajniFace.textContent = look.face;
    if (el.hajniSprite) {
      el.hajniSprite.style.backgroundPosition = SPRITE_POS[look.sprite] || "0% 0%";
      el.hajniSprite.classList.toggle("go", game.state === "gameover");
    }
    el.hajniState.textContent = look.label;
    el.hajniHint.textContent = look.hint;
    el.hajniAvatar.className = "hajni-avatar state-" + game.state
      + (game.paused ? " paused" : "")
      + (now < game.feedFlashUntil ? " chewing" : "");

    // Szintsáv
    el.levelNum.textContent = game.level;
    const need = levelUpRequirement(game.level);
    el.levelBarFill.style.width = Math.max(0, Math.min(100, (game.levelProgressHP / need) * 100)) + "%";
    const col = levelColor(game.level);
    el.levelBarFill.style.background = `linear-gradient(90deg, ${col.from}, ${col.to})`;
    el.levelBarText.textContent = `${Math.floor(game.levelProgressHP)} / ${need} húspont`;

    el.goldNum.textContent = Math.floor(game.gold);
    if (el.starPill) {
      el.starPill.style.display = game.csillag > 0 ? "inline-flex" : "none";
      el.starNum.textContent = game.csillag;
    }

    // ── Lacika sáv (csak aktív állapotban) ──
    if (el.lacikaBar) {
      if (game.lacikaRemainingMs > 0) {
        el.lacikaBar.style.display = "block";
        const w = game.lacikaTotalMs > 0 ? (game.lacikaRemainingMs / game.lacikaTotalMs) * 100 : 0;
        el.lacikaFill.style.width = Math.max(0, Math.min(100, w)) + "%";
        el.lacikaText.textContent = `🦾 Lacika: ${fmtTime(game.lacikaRemainingMs)}`;
      } else {
        el.lacikaBar.style.display = "none";
      }
    }
    // farm gombok kinézete Lacika alatt
    const lac = game.lacikaRemainingMs > 0;
    el.burgerBtn.classList.toggle("lacika-on", lac);
    el.moneyBtn.classList.toggle("lacika-on", lac);
    el.moneyBtn.classList.toggle("goldrain-on", game.goldRainMs > 0);

    // combo kijelző
    if (el.comboIndicator) {
      const cm = comboMult();
      if (comboCount > 0 && cm > 1 && game.state === "sleeping" && !game.paused) {
        el.comboIndicator.style.display = "block";
        el.comboIndicator.textContent = `🔥 COMBO ×${cm}`;
      } else {
        el.comboIndicator.style.display = "none";
      }
    }

    const sleeping = game.state === "sleeping";
    const hungry = game.state === "hungry";
    el.sleepRow.style.display = sleeping ? "flex" : "none";
    el.hungerRow.style.display = hungry ? "block" : "none";
    if (sleeping) el.sleepTime.textContent = fmtTime(bedSleepMs(game.bedLevel) - game.sleepElapsed);
    if (hungry) {
      const hp = Math.max(0, game.hunger);
      el.hungerFill.style.width = Math.max(0, Math.min(100, (hp / game.hungerPeak) * 100)) + "%";
      el.hungerText.textContent = Math.ceil(hp) + " HP";
      el.reqText.textContent = `Még ${Math.ceil(hp)} húspont a teljes jóllakáshoz`
        + (game.nightmareBonus > 0 ? ` · 🥦 +${game.nightmareBonus} tartós` : "");
    }

    const farmable = canFarm();
    el.burgerBtn.disabled = !farmable;
    el.moneyBtn.disabled = !farmable;
    el.pauseBtn.textContent = game.paused ? "▶️ Folytat" : "⏸️ Stop";
    el.pauseBtn.disabled = game.state === "gameover";

    // panel státusz csíkok (a timer a hűtőben is látszik!)
    const st = statusText();
    if (el.fridgeStatus) el.fridgeStatus.textContent = st;
    if (el.upgStatus) el.upgStatus.textContent = st;

    // gyors etetés gomb
    if (el.autoFeedBtn) el.autoFeedBtn.disabled = !(hungry && !game.paused);

    updateToggles();
    renderFridgeHead();
  }

  // ============================================================
  // HŰTŐ RENDER
  // ============================================================
  function renderFridgeHead() {
    const slots = game.fridgeSlots;
    const used = unlockedSlots().filter(Boolean).length;
    el.fridgeHead.textContent = `🧊 HŰTŐ – SZINT ${slots} · ${used}/${slots} slot (max ${CONFIG.fridgeMaxSlots})`;
    if (slots >= CONFIG.fridgeMaxSlots) {
      el.buySlotBtn.textContent = "MAX slot"; el.buySlotBtn.disabled = true;
    } else {
      const cost = fridgeSlotCost(slots);
      el.buySlotBtn.innerHTML = `➕ Új slot – ${cost} 🪙`;
      el.buySlotBtn.disabled = game.gold < cost;
    }
  }

  function renderFridge() {
    if (!el.fridgeSlots) return;
    while (el.fridgeSlots.children.length < game.fridgeSlots) {
      const d = document.createElement("div");
      d.className = "fslot"; d.dataset.idx = el.fridgeSlots.children.length;
      el.fridgeSlots.appendChild(d);
    }
    while (el.fridgeSlots.children.length > game.fridgeSlots) {
      el.fridgeSlots.removeChild(el.fridgeSlots.lastChild);
    }

    const canFeed = game.state === "hungry" && !game.paused;
    const canSell = !game.paused && game.state !== "gameover";
    for (let i = 0; i < game.fridgeSlots; i++) {
      const slotEl = el.fridgeSlots.children[i];
      const c = game.fridge[i];
      if (c) {
        const f = FOOD_BY_ID[c.foodId];
        const total = f.hp * c.count;
        const price = sellPrice(f.hp, c.count);
        slotEl.className = "fslot filled";
        slotEl.innerHTML =
          `<div class="fs-icon">${f.icon}</div>
           <div class="fs-info">
             <div class="fs-name">${f.name}</div>
             <div class="fs-sub">×${c.count}/${CONFIG.slotStackLimit} · ${f.hp} HP/db · össz. ${total} HP</div>
           </div>
           <div class="fs-actions">
             <button class="fs-feed" data-feed="${i}" ${canFeed ? "" : "disabled"}>🍽️ Odaadom</button>
             <button class="fs-sell" data-sell="${i}" ${canSell ? "" : "disabled"}>💰 ${price} 🪙</button>
           </div>`;
      } else {
        slotEl.className = "fslot empty";
        slotEl.innerHTML = `<div class="fs-empty">üres slot</div>`;
      }
    }
  }

  // ============================================================
  // FEJLESZTÉSEK
  // ============================================================
  function renderUpgrades() {
    if (!el.upgList) return;
    const g = game.gold;

    const fSlots = game.fridgeSlots;
    const fMax = fSlots >= CONFIG.fridgeMaxSlots;
    const fCost = fMax ? null : fridgeSlotCost(fSlots);

    const bMax = game.bedLevel >= CONFIG.bedMaxLevel;
    const bCost = bMax ? null : bedUpgradeCost(game.bedLevel);
    const bSleep = fmtTime(bedSleepMs(game.bedLevel));

    const lMax = game.lipoLevel >= CONFIG.lipoMaxLevel;
    const lCost = lMax ? null : lipoUpgradeCost(game.lipoLevel);
    const lPct = Math.round(lipoReduction(game.lipoLevel) * 100);

    // Lacika (mint a többi fejlesztés: szintjei vannak, feloldás nélkül)
    const lacCost = lacikaUpgradeCost(game.lacikaLevel);
    const lacDurS = Math.round(lacikaDurationMs(game.lacikaLevel) / 1000);
    const canBuyLac = g >= lacCost;
    const canActLac = countFood(CONFIG.lacikaActivateFood) >= CONFIG.lacikaActivateAmount
      && !game.paused && game.state !== "gameover";

    el.upgList.innerHTML = `
      ${upgCard("🧊","Hűtő",`Szint ${fSlots} · ${fSlots}/${CONFIG.fridgeMaxSlots} slot`,
        fMax ? "Maximális szint" : `Következő slot: ${fCost} 🪙`, "buy-fridge", fMax, fCost != null && g >= fCost)}
      ${upgCard("🛏️","Ágy",`Szint ${game.bedLevel} · alvási idő ${bSleep}`,
        bMax ? "Maximális szint" : `Következő szint: ${bCost} 🪙`, "buy-bed", bMax, bCost != null && g >= bCost)}
      ${upgCard("🩺","Zsírleszívás",`Szint ${game.lipoLevel} · húspontigény −${lPct}%`,
        lMax ? "Maximális szint" : `Következő kezelés: ${lCost} 🪙`, "buy-lipo", lMax, lCost != null && g >= lCost)}
      <div class="upg-card">
        <div class="upg-ic">🦾</div>
        <div class="upg-body">
          <div class="upg-title">Lacika</div>
          <div class="upg-line">Szint ${game.lacikaLevel} · aktív ${lacDurS} mp / aktiválás</div>
          <div class="upg-line accent">Következő szint: ${lacCost} 🪙</div>
        </div>
        <div class="upg-actions">
          <button class="upg-buy" data-upg="buy-lacika" ${canBuyLac ? "" : "disabled"}>Vásárlás</button>
          <button class="upg-activate" data-upg="activate-lacika" ${canActLac ? "" : "disabled"}>${CONFIG.lacikaActivateAmount} 🍖</button>
        </div>
      </div>
    `;
  }
  // ── KAJA-INFÓ: az összes kaja, húspontja és kb. esélye ──
  function fmtDropPct(p) {
    if (p >= 10) return Math.round(p) + "%";
    if (p >= 1) return p.toFixed(1) + "%";
    if (p >= 0.01) return p.toFixed(2) + "%";
    return "<0.01%";
  }
  function renderFoodInfo() {
    if (!el.foodInfoList) return;
    el.foodInfoList.innerHTML = FOODS.filter((f) => !f.craft).map((f) => {
      const pct = fmtDropPct((f.drop / DROP_TOTAL) * 100);
      const hp = f.type === "building" ? "—" : `${f.hp}`;
      const tag = f.type === "building" ? ` <span class="fi-tag">termelő</span>` : "";
      return `<div class="fi-row">
        <span class="fi-nm"><span class="fi-ic">${f.icon}</span>${f.name}${tag}</span>
        <span class="fi-hp">${hp}</span>
        <span class="fi-pc">${pct}</span>
      </div>`;
    }).join("");
  }

  function upgCard(icon, title, line1, line2, action, maxed, affordable) {
    const btn = maxed
      ? `<button class="upg-buy" disabled>MAX</button>`
      : `<button class="upg-buy" data-upg="${action}" ${affordable ? "" : "disabled"}>Vásárlás</button>`;
    return `<div class="upg-card"><div class="upg-ic">${icon}</div>
      <div class="upg-body"><div class="upg-title">${title}</div>
      <div class="upg-line">${line1}</div><div class="upg-line accent">${line2}</div></div>${btn}</div>`;
  }

  // ── CÉLOK panel renderelése ──
  function renderAchievements() {
    if (!el.achList) return;
    const s = game.stats;
    const statsHtml = `<div class="ach-stats">
      <span>🏅 Legjobb szint <b>${Math.max(s.bestLevel, game.level)}</b></span>
      <span>🍖 Farmolt kaja <b>${s.foodFarmed}</b></span>
      <span>🪙 Keresett arany <b>${s.goldEarned}</b></span>
      <span>🍽️ Etetések <b>${s.fed}</b></span>
      <span>🍱 Receptek <b>${s.crafted}</b></span>
      <span>🥦 Rémálmok <b>${s.nightmares}</b></span>
      <span>💫 Csillag <b>${game.csillag} ⭐</b></span>
    </div>`;
    const list = ACHIEVEMENTS.map((a) => {
      const done = !!game.achievements[a.id];
      const cur = Math.min(metricValue(a.metric), a.need);
      const pct = Math.round((cur / a.need) * 100);
      return `<div class="ach-row ${done ? "done" : ""}">
        <div class="ach-ic">${done ? a.icon : "🔒"}</div>
        <div class="ach-body">
          <div class="ach-name">${a.name}${done ? " ✓" : ""}</div>
          <div class="ach-desc">${a.desc} · +${a.reward} 🪙</div>
          <div class="ach-bar"><div class="ach-fill" style="width:${pct}%"></div></div>
        </div>
        <div class="ach-prog">${cur}/${a.need}</div>
      </div>`;
    }).join("");
    el.achList.innerHTML = statsHtml + list;
  }

  // ── TERMELŐK renderelése (a Fejlesztés fülön) ──
  function renderProducers() {
    if (!el.producersList) return;
    const g = game.gold;
    el.producersList.innerHTML = PRODUCERS.map((p) => {
      const st = game.producers[p.id];
      const cost = producerCost(p, st.lvl);
      const rate = st.lvl > 0
        ? `${p.icon} ~${(p.intervalMs / 1000 / st.lvl).toFixed(1)} mp/db`
        : "nincs megvéve";
      return upgCard(p.icon, p.name, `Szint ${st.lvl} · ${rate}`,
        `Következő szint: ${cost} 🪙`, "prod:" + p.id, false, g >= cost);
    }).join("");
  }

  // ── RECEPTEK renderelése ──
  function renderRecipes() {
    if (!el.recipeList) return;
    el.recipeList.innerHTML = RECIPES.map((r) => {
      const out = FOOD_BY_ID[r.out];
      const ings = Object.keys(r.cost).map((fid) => {
        const f = FOOD_BY_ID[fid], have = countFood(fid), need = r.cost[fid];
        return `<span class="rc-ing ${have >= need ? "" : "lack"}">${f.icon} ${need} <em>(${have})</em></span>`;
      }).join("");
      const ok = canCraft(r);
      return `<div class="rc-card">
        <div class="rc-out"><span class="rc-oic">${out.icon}</span>
          <div><div class="rc-name">${out.name}</div><div class="rc-hp">${out.hp} HP</div></div></div>
        <div class="rc-ings">${ings}</div>
        <button class="rc-make" data-recipe="${r.id}" ${ok ? "" : "disabled"}>Elkészít</button>
      </div>`;
    }).join("");
  }

  // ============================================================
  // MENTÉS / BETÖLTÉS
  // ============================================================
  let saveTimer = null;
  function scheduleSave() {
    if (saveTimer) return;
    saveTimer = setTimeout(() => { saveTimer = null; saveGame(); }, 500);
  }
  function saveGame() {
    game.lastSaved = Date.now();
    try { localStorage.setItem(CONFIG.saveKey, JSON.stringify(game)); }
    catch (err) { console.warn("Mentés hiba:", err); }
  }

  function loadGame() {
    let saved = null;
    try { const raw = localStorage.getItem(CONFIG.saveKey); if (raw) saved = JSON.parse(raw); }
    catch (err) { console.warn("Betöltés hiba:", err); }

    if (!saved || typeof saved !== "object") { game = newGame(); return; }
    game = Object.assign(newGame(), saved);

    const fixed = new Array(MAX_SLOTS).fill(null);
    if (Array.isArray(saved.fridge)) {
      for (let i = 0; i < Math.min(saved.fridge.length, MAX_SLOTS); i++) {
        const c = saved.fridge[i];
        if (c && FOOD_BY_ID[c.foodId] && c.count > 0)
          fixed[i] = { foodId: c.foodId, count: Math.min(c.count, CONFIG.slotStackLimit) };
      }
    }
    game.fridge = fixed;
    game.fridgeSlots = Math.min(Math.max(CONFIG.fridgeStartSlots, game.fridgeSlots | 0), CONFIG.fridgeMaxSlots);
    game.lacikaLevel = Math.max(1, game.lacikaLevel | 0); // régi mentés (0. szint) → 1

    // célok / statisztika helyreállítása (régi mentés)
    if (!game.achievements || typeof game.achievements !== "object") game.achievements = {};
    game.stats = Object.assign(
      { foodFarmed: 0, goldEarned: 0, fed: 0, crafted: 0, merchantsBought: 0, bestLevel: 0, nightmares: 0, gamesOver: 0 },
      game.stats || {}
    );

    // termelők helyreállítása (régi mentés → 0 szint)
    if (!game.producers || typeof game.producers !== "object") game.producers = {};
    for (const p of PRODUCERS) {
      const st = game.producers[p.id];
      game.producers[p.id] = (st && typeof st === "object")
        ? { lvl: Math.max(0, st.lvl | 0), el: +st.el || 0 }
        : { lvl: 0, el: 0 };
    }

    catchUpFrom(saved.lastSaved);
  }

  function catchUpFrom(sinceTs) {
    let remaining = Math.min(Date.now() - (sinceTs || Date.now()), CONFIG.maxOfflineCatchupMs);
    if (remaining <= 0) return;
    catchingUp = true;
    let guard = 0;
    const maxGuard = CONFIG.maxOfflineCatchupMs / 1000 + 10;
    while (remaining > 0 && guard < maxGuard) {
      step(Math.min(1000, remaining));
      remaining -= 1000; guard++;
      if (game.state === "gameover") break;
    }
    catchingUp = false;
    lastTick = performance.now();
  }

  // ============================================================
  // PANELEK + ESEMÉNYEK
  // ============================================================
  function setupPanels() {
    el.fridgeBtn.addEventListener("click", () => { renderFridge(); updateUI(); el.fridgePanel.classList.add("open"); });
    el.closeFridge.addEventListener("click", () => el.fridgePanel.classList.remove("open"));
    el.upgBtn.addEventListener("click", () => { renderUpgrades(); renderProducers(); updateUI(); el.upgPanel.classList.add("open"); });
    el.closeUpg.addEventListener("click", () => el.upgPanel.classList.remove("open"));
    el.producersList.addEventListener("click", (e) => {
      const b = e.target.closest("[data-upg]");
      if (b && b.dataset.upg.startsWith("prod:")) buyProducer(b.dataset.upg.slice(5));
    });

    el.recipeBtn.addEventListener("click", () => { renderRecipes(); el.recipePanel.classList.add("open"); });
    el.closeRecipe.addEventListener("click", () => el.recipePanel.classList.remove("open"));
    el.recipeList.addEventListener("click", (e) => {
      const b = e.target.closest("[data-recipe]");
      if (b) craftRecipe(b.dataset.recipe);
    });
    el.resetAllBtn.addEventListener("click", hardReset);

    el.autoFeedBtn.addEventListener("click", autoFeed);

    el.fridgeSlots.addEventListener("click", (e) => {
      const fb = e.target.closest("[data-feed]");
      if (fb) { feedFromSlot(+fb.dataset.feed); return; }
      const sb = e.target.closest("[data-sell]");
      if (sb) { sellSlot(+sb.dataset.sell); return; }
    });
    el.buySlotBtn.addEventListener("click", buyFridgeSlot);

    el.foodInfoBtn.addEventListener("click", () => { renderFoodInfo(); el.foodInfoPanel.classList.add("open"); });
    el.closeFoodInfo.addEventListener("click", () => el.foodInfoPanel.classList.remove("open"));

    el.soundToggle.addEventListener("click", toggleSound);
    el.vibrateToggle.addEventListener("click", toggleVibrate);

    el.merchantBuy.addEventListener("click", merchantBuy);
    el.merchantSkip.addEventListener("click", merchantSkip);

    el.achBtn.addEventListener("click", () => { renderAchievements(); el.achPanel.classList.add("open"); });
    el.closeAch.addEventListener("click", () => el.achPanel.classList.remove("open"));

    el.prestigeBtn.addEventListener("click", () => { renderPrestige(); el.prestigePanel.classList.add("open"); });
    el.closePrestige.addEventListener("click", () => el.prestigePanel.classList.remove("open"));
    el.prestigeCancel.addEventListener("click", () => el.prestigePanel.classList.remove("open"));
    el.prestigeConfirm.addEventListener("click", doPrestige);

    el.upgList.addEventListener("click", (e) => {
      const b = e.target.closest("[data-upg]");
      if (!b) return;
      if (b.dataset.upg === "buy-fridge") buyFridgeSlot();
      else if (b.dataset.upg === "buy-bed") buyBed();
      else if (b.dataset.upg === "buy-lipo") buyLipo();
      else if (b.dataset.upg === "buy-lacika") buyLacika();
      else if (b.dataset.upg === "activate-lacika") activateLacika();
    });
  }

  // ============================================================
  // INDÍTÁS
  // ============================================================
  // Alapból a Hajni-kép látszik (az emoji rejtve). CSAK ha a kép nem
  // tölthető be, akkor kapcsoljuk be az emoji tartalékot (.no-sprite).
  // Így az emoji SOHA nincs a kép mögött.
  function setupSprite() {
    const img = new Image();
    img.onerror = () => el.hajniAvatar.classList.add("no-sprite");
    img.src = "images/hajni.png";
  }

  function init() {
    cacheDom();
    loadGame();
    setupSprite();

    setupFarmButton(el.burgerBtn, produceFood);
    setupFarmButton(el.moneyBtn, produceMoney);
    el.pauseBtn.addEventListener("click", togglePause);
    el.restartBtn.addEventListener("click", () => resetRun(CONFIG.gameOverKeepUpgrades));
    setupPanels();

    if (game.state === "gameover") el.gameoverPanel.classList.add("open");
    if (game.merchantOffer) openMerchant(); // félbehagyott vándorárus visszatöltése

    renderFridge(); renderUpgrades(); renderProducers(); updateUI();
    checkAchievements(); // offline/korábban átlépett célok begyűjtése

    setInterval(saveGame, CONFIG.autosaveMs);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) saveGame();
      else { catchUpFrom(game.lastSaved); renderFridge(); renderUpgrades(); updateUI(); }
    });
    window.addEventListener("beforeunload", saveGame);

    lastTick = performance.now();
    requestAnimationFrame(loop);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
