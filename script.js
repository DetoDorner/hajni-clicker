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

      fridge: new Array(MAX_SLOTS).fill(null),

      marhatelep: 0,
      marhaProdElapsed: 0,

      lastSaved: Date.now(),
    };
  }

  // ── DOM ───────────────────────────────────────────────────
  const el = {};
  function cacheDom() {
    const ids = [
      "levelNum","levelBarFill","levelBarText","goldNum",
      "hajniFace","hajniSprite","hajniState","hajniHint","hajniAvatar","lastGain",
      "sleepRow","sleepTime","hungerRow","hungerFill","hungerText","reqText",
      "burgerBtn","moneyBtn","pauseBtn","popupLayer",
      "fridgeBtn","fridgePanel","closeFridge","fridgeHead","fridgeStatus",
      "autoFeedBtn","fridgeSlots","buySlotBtn",
      "upgBtn","upgPanel","closeUpg","upgStatus","upgList","resetAllBtn",
      "gameoverPanel","restartBtn",
    ];
    ids.forEach(id => el[id] = document.getElementById(id));
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
    return Math.max(1, Math.round(raw * (1 - lipoReduction(game.lipoLevel))));
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

  function onBurgerClick(ev) {
    if (!canFarm()) return;
    const food = rollFood();
    if (food.type === "building") {
      game.marhatelep++;
      spawnPopup(food.icon, food.name, ev);
      setLastGain(`🏭 Marhatelep! (${game.marhatelep})`);
    } else {
      const ok = addFoodToFridge(food.id);
      spawnPopup(ok ? food.icon : "🈵", ok ? food.name : "Hűtő tele!", ev);
      setLastGain(ok ? `${food.icon} ${food.name} +1` : "🈵 A hűtő tele van!");
    }
    renderFridge(); updateUI(); scheduleSave();
  }

  function onMoneyClick(ev) {
    if (!canFarm()) return;
    game.gold += CONFIG.goldPerClick;
    spawnPopup("🪙", `+${CONFIG.goldPerClick}`, ev);
    setLastGain(`🪙 +${CONFIG.goldPerClick} aranypénz`);
    updateUI(); scheduleSave();
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
    game.levelProgressHP += food.hp;
    c.count--;
    if (c.count <= 0) game.fridge[slotIdx] = null;
    checkLevelUps();
    return true;
  }

  function feedFromSlot(slotIdx) {
    if (game.state !== "hungry" || game.paused) return;
    if (!feedOne(slotIdx)) return;
    game.feedFlashUntil = performance.now() + 700;
    if (game.hunger <= 0) goToSleep(); else maybeGameOver();
    renderFridge(); renderUpgrades(); updateUI(); scheduleSave();
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
    let guard = 0;
    while (game.state === "hungry" && game.hunger > 0 && !fridgeIsEmpty() && guard < 100000) {
      const idx = pickBestSlot(game.hunger);
      if (idx == null) break;
      feedOne(idx);
      guard++;
      if (game.hunger <= 0) break;
    }
    game.feedFlashUntil = performance.now() + 700;
    if (game.hunger <= 0) goToSleep(); else maybeGameOver();
    renderFridge(); renderUpgrades(); updateUI(); scheduleSave();
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
    game.state = "hungry";
    game.hunger = currentFullRequirement();
    game.baseRequirement = game.hunger;
    game.hungerPeak = Math.max(1, game.hunger);
    game.hungerCycleElapsed = 0;
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
    updateUI(); renderFridge();
    if (el.gameoverPanel) el.gameoverPanel.classList.add("open");
    saveGame();
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
    renderFridge(); renderUpgrades(); updateUI(); saveGame();
  }
  function buyBed() {
    if (game.bedLevel >= CONFIG.bedMaxLevel) return;
    const cost = bedUpgradeCost(game.bedLevel);
    if (game.gold < cost) return;
    game.gold -= cost; game.bedLevel++;
    renderUpgrades(); updateUI(); saveGame();
  }
  function buyLipo() {
    if (game.lipoLevel >= CONFIG.lipoMaxLevel) return;
    const cost = lipoUpgradeCost(game.lipoLevel);
    if (game.gold < cost) return;
    game.gold -= cost; game.lipoLevel++;
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

    const sleeping = game.state === "sleeping";
    const hungry = game.state === "hungry";
    el.sleepRow.style.display = sleeping ? "flex" : "none";
    el.hungerRow.style.display = hungry ? "block" : "none";
    if (sleeping) el.sleepTime.textContent = fmtTime(bedSleepMs(game.bedLevel) - game.sleepElapsed);
    if (hungry) {
      const hp = Math.max(0, game.hunger);
      el.hungerFill.style.width = Math.max(0, Math.min(100, (hp / game.hungerPeak) * 100)) + "%";
      el.hungerText.textContent = Math.ceil(hp) + " HP";
      el.reqText.textContent = `Még ${Math.ceil(hp)} húspont a teljes jóllakáshoz`;
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

    el.upgList.innerHTML = `
      ${upgCard("🧊","Hűtő",`Szint ${fSlots} · ${fSlots}/${CONFIG.fridgeMaxSlots} slot`,
        fMax ? "Maximális szint" : `Következő slot: ${fCost} 🪙`, "buy-fridge", fMax, fCost != null && g >= fCost)}
      ${upgCard("🛏️","Ágy",`Szint ${game.bedLevel} · alvási idő ${bSleep}`,
        bMax ? "Maximális szint" : `Következő szint: ${bCost} 🪙`, "buy-bed", bMax, bCost != null && g >= bCost)}
      ${upgCard("🩺","Zsírleszívás",`Szint ${game.lipoLevel} · húspontigény −${lPct}%`,
        lMax ? "Maximális szint" : `Következő kezelés: ${lCost} 🪙`, "buy-lipo", lMax, lCost != null && g >= lCost)}
    `;
  }
  function upgCard(icon, title, line1, line2, action, maxed, affordable) {
    const btn = maxed
      ? `<button class="upg-buy" disabled>MAX</button>`
      : `<button class="upg-buy" data-upg="${action}" ${affordable ? "" : "disabled"}>Vásárlás</button>`;
    return `<div class="upg-card"><div class="upg-ic">${icon}</div>
      <div class="upg-body"><div class="upg-title">${title}</div>
      <div class="upg-line">${line1}</div><div class="upg-line accent">${line2}</div></div>${btn}</div>`;
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

    catchUpFrom(saved.lastSaved);
  }

  function catchUpFrom(sinceTs) {
    let remaining = Math.min(Date.now() - (sinceTs || Date.now()), CONFIG.maxOfflineCatchupMs);
    if (remaining <= 0) return;
    let guard = 0;
    const maxGuard = CONFIG.maxOfflineCatchupMs / 1000 + 10;
    while (remaining > 0 && guard < maxGuard) {
      step(Math.min(1000, remaining));
      remaining -= 1000; guard++;
      if (game.state === "gameover") break;
    }
    lastTick = performance.now();
  }

  // ============================================================
  // PANELEK + ESEMÉNYEK
  // ============================================================
  function setupPanels() {
    el.fridgeBtn.addEventListener("click", () => { renderFridge(); updateUI(); el.fridgePanel.classList.add("open"); });
    el.closeFridge.addEventListener("click", () => el.fridgePanel.classList.remove("open"));
    el.upgBtn.addEventListener("click", () => { renderUpgrades(); updateUI(); el.upgPanel.classList.add("open"); });
    el.closeUpg.addEventListener("click", () => el.upgPanel.classList.remove("open"));
    el.resetAllBtn.addEventListener("click", hardReset);

    el.autoFeedBtn.addEventListener("click", autoFeed);

    el.fridgeSlots.addEventListener("click", (e) => {
      const fb = e.target.closest("[data-feed]");
      if (fb) { feedFromSlot(+fb.dataset.feed); return; }
      const sb = e.target.closest("[data-sell]");
      if (sb) { sellSlot(+sb.dataset.sell); return; }
    });
    el.buySlotBtn.addEventListener("click", buyFridgeSlot);

    el.upgList.addEventListener("click", (e) => {
      const b = e.target.closest("[data-upg]");
      if (!b) return;
      if (b.dataset.upg === "buy-fridge") buyFridgeSlot();
      else if (b.dataset.upg === "buy-bed") buyBed();
      else if (b.dataset.upg === "buy-lipo") buyLipo();
    });
  }

  // ============================================================
  // INDÍTÁS
  // ============================================================
  function init() {
    cacheDom();
    loadGame();

    el.burgerBtn.addEventListener("click", onBurgerClick);
    el.moneyBtn.addEventListener("click", onMoneyClick);
    el.pauseBtn.addEventListener("click", togglePause);
    el.restartBtn.addEventListener("click", () => resetRun(CONFIG.gameOverKeepUpgrades));
    setupPanels();

    if (game.state === "gameover") el.gameoverPanel.classList.add("open");

    renderFridge(); renderUpgrades(); updateUI();

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
