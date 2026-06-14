/* =====================================================================
   GOAL 2026 — voice-controlled World Cup pixel football
   No dependencies. Canvas 2D + Web Audio + MediaDevices + MediaRecorder.
   ===================================================================== */
(() => {
  'use strict';

  // ----------------------------- data -----------------------------------
  const FLAGS = {
    Argentina: { type: 'argentina', headband: ['#75AADB', '#FFFFFF', '#75AADB'] },
    Australia: { type: 'blue-ensign', variant: 'australia', headband: ['#012169', '#FFFFFF', '#E4002B'] },
    Belgium: { type: 'vertical', colors: ['#000000', '#FDDA24', '#EF3340'] },
    Brazil: { type: 'brazil', headband: ['#009C3B', '#FFDF00', '#002776'] },
    Canada: { type: 'canada', headband: ['#FF0000', '#FFFFFF', '#FF0000'] },
    Colombia: { type: 'horizontal', colors: ['#FCD116', '#003893', '#CE1126'], ratios: [2, 1, 1] },
    Croatia: { type: 'croatia', headband: ['#FF0000', '#FFFFFF', '#171796'] },
    England: { type: 'england', headband: ['#FFFFFF', '#CF142B', '#FFFFFF'] },
    France: { type: 'vertical', colors: ['#0055A4', '#FFFFFF', '#EF4135'] },
    Germany: { type: 'horizontal', colors: ['#000000', '#DD0000', '#FFCE00'] },
    Ghana: { type: 'ghana', headband: ['#CE1126', '#FCD116', '#006B3F'] },
    Italy: { type: 'vertical', colors: ['#009246', '#FFFFFF', '#CE2B37'] },
    Japan: { type: 'japan', headband: ['#FFFFFF', '#BC002D', '#FFFFFF'] },
    Mexico: { type: 'mexico', headband: ['#006847', '#FFFFFF', '#CE1126'] },
    Morocco: { type: 'morocco', headband: ['#C1272D', '#006233', '#C1272D'] },
    Netherlands: { type: 'horizontal', colors: ['#AE1C28', '#FFFFFF', '#21468B'] },
    'New Zealand': { type: 'blue-ensign', variant: 'new-zealand', headband: ['#00247D', '#FFFFFF', '#CC142B'] },
    Poland: { type: 'horizontal', colors: ['#FFFFFF', '#DC143C'] },
    Portugal: { type: 'portugal', headband: ['#006600', '#DA291C', '#F1BF00'] },
    Senegal: { type: 'senegal', headband: ['#00853F', '#FDEF42', '#E31B23'] },
    'South Korea': { type: 'south-korea', headband: ['#FFFFFF', '#CD2E3A', '#0047A0'] },
    Spain: { type: 'horizontal', colors: ['#AA151B', '#F1BF00', '#AA151B'], ratios: [1, 2, 1] },
    Sweden: { type: 'nordic', base: '#005293', cross: '#FECB00', headband: ['#005293', '#FECB00', '#005293'] },
    Uruguay: { type: 'uruguay', headband: ['#FFFFFF', '#5CBFEB', '#FCD116'] },
    USA: { type: 'usa', headband: ['#3C3B6E', '#FFFFFF', '#B22234'] },
  };
  const FLAG_ALIASES = {
    'Brazil 2002': 'Brazil',
    'Spain 2010': 'Spain',
    'Germany 2014': 'Germany',
    'Argentina 2022': 'Argentina',
  };

  // Selectable nations (player identity → headband / share card flag).
  const NATIONS = [
    ['ARG', 'Argentina'], ['BRA', 'Brazil'], ['FRA', 'France'], ['GER', 'Germany'], ['POR', 'Portugal'],
    ['ESP', 'Spain'], ['JPN', 'Japan'], ['USA', 'USA'], ['ENG', 'England'],
  ].map(([id, name]) => ({
    id, name,
    bands: headbandForName(name),
    flag: flagForName(name),
  }));

  // Challenge ladder. aiBase grows with stage; jersey colours for the rival.
  const TEAMS = [
    'New Zealand|#FFFFFF|#1a1a1a', 'Canada|#FF0000|#FFFFFF', 'Australia|#00843D|#FFCD00',
    'Japan|#BC002D|#FFFFFF', 'USA|#3C3B6E|#B22234', 'South Korea|#C60C30|#003478',
    'Mexico|#006847|#CE1126', 'Poland|#DC143C|#FFFFFF', 'Sweden|#FFCD00|#005293',
    'Germany|#1a1a1a|#DD0000', 'Croatia|#FF0000|#FFFFFF', 'Uruguay|#5CBFEB|#1a1a1a',
    'Belgium|#C8102E|#FDDA24', 'Netherlands|#FF6900|#FFFFFF', 'France|#0055A4|#EF4135',
    'Portugal|#DA291C|#006600', 'England|#FFFFFF|#CF142B', 'Italy|#0066CC|#FFFFFF',
    'Spain|#AA151B|#F1BF00', 'Brazil|#FFDF00|#009C3B', 'Colombia|#FCD116|#003893',
    'Morocco|#C1272D|#006233', 'Senegal|#00853F|#FDEF42', 'Ghana|#006B3F|#CE1126',
    'Argentina|#75AADB|#FFFFFF',
  ].map((s, i) => {
    const [name, c1, c2] = s.split('|');
    return { stage: i + 1, name, c1, c2, bands: headbandForName(name), flag: flagForName(name), aiBase: 0.16 + i * 0.0125 };
  });

  // Hidden bosses appear once the player clears the trigger stage.
  const BOSSES = [
    { afterStage: 5,  key: 'BRA2002', name: 'Brazil 2002',    theme: 'R-R-R', c1: '#FFDF00', c2: '#009C3B', aiBase: 0.32 },
    { afterStage: 10, key: 'ESP2010', name: 'Spain 2010',     theme: 'Tiki-Taka', c1: '#AA151B', c2: '#F1BF00', aiBase: 0.42 },
    { afterStage: 15, key: 'GER2014', name: 'Germany 2014',   theme: 'Die Mannschaft', c1: '#1a1a1a', c2: '#DD0000', aiBase: 0.54 },
    { afterStage: 25, key: 'ARG2022', name: 'Argentina 2022', theme: 'La Scaloneta', c1: '#75AADB', c2: '#FFFFFF', aiBase: 0.70 },
  ];
  const OPENING_ASSIST_END_STAGE = 8;

  const MATCH_SECONDS = 15;
  const SAVE_KEY = 'goal2026.save.v1';
  const SFX = {
    kickoff: 'assets/sfx/referee-whistle.wav',
    ambient: 'assets/sfx/match-crowd-live-random.mp3',
    win: 'assets/sfx/leeds-last-minute-goal.mp3',
    lose: 'assets/sfx/crowd-booing-howardv.mp3',
  };

  // ----------------------------- state ----------------------------------
  const save = loadSave();
  let screen = 'nation';

  // media
  let micStream = null, camStream = null;
  let audioCtx = null, analyser = null, freqData = null;
  const sfxBuffers = {};
  const sfxLoads = {};
  let ambientCrowd = null;
  let noiseFloor = 0.04;          // adaptive baseline
  let usingMic = false;
  let practiceHeld = false;       // space / pointer fallback

  // recording
  let recorder = null, recChunks = [], replayBlob = null, replayUrl = null;
  let shareImageBlob = null, shareImageUrl = null, lastResult = null;

  // per-match runtime
  let match = null;
  let rafId = 0;
  let lastT = 0;

  // ----------------------------- elements --------------------------------
  const $ = (id) => document.getElementById(id);
  const screens = {
    nation: $('screen-nation'), home: $('screen-home'),
    permission: $('screen-permission'), match: $('screen-match'),
    result: $('screen-result'),
  };
  const canvas = $('game-canvas');
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const W = canvas.width, H = canvas.height;
  const camFeed = $('camera-feed');

  // ----------------------------- save ------------------------------------
  function loadSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) return Object.assign(defaultSave(), JSON.parse(raw));
    } catch (e) { /* ignore */ }
    return defaultSave();
  }
  function defaultSave() {
    return { nation: null, stage: 1, best: 0, bossesBeaten: {} };
  }
  function persist() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {}
  }

  // --------------------------- navigation --------------------------------
  function show(name) {
    screen = name;
    for (const k in screens) screens[k].classList.toggle('active', k === name);
  }

  function flagKey(name) {
    return FLAG_ALIASES[name] || String(name || '').replace(/\s+\d{4}$/, '');
  }
  function flagForName(name) {
    return FLAGS[flagKey(name)] || { type: 'horizontal', colors: ['#FFFFFF', '#8b93c9', '#11163a'] };
  }
  function headbandForName(name) {
    const flag = flagForName(name);
    const colors = flag.headband || flag.colors || ['#FFFFFF', '#8b93c9', '#11163a'];
    return [colors[0], colors[1] || colors[0], colors[2] || colors[0]];
  }
  function nationById(id) { return NATIONS.find(n => n.id === id) || NATIONS[0]; }

  // Resolve which opponent the current stage faces (boss takes priority).
  function currentOpponent() {
    const boss = pendingBoss();
    if (boss) return {
      name: boss.name,
      c1: boss.c1,
      c2: boss.c2,
      bands: headbandForName(boss.name),
      flag: flagForName(boss.name),
      aiBase: boss.aiBase,
      boss,
    };
    const idx = Math.min(save.stage - 1, TEAMS.length - 1);
    const t = TEAMS[idx];
    // beyond the authored ladder, keep ramping difficulty
    const aiBase = save.stage <= TEAMS.length ? t.aiBase : t.aiBase + (save.stage - TEAMS.length) * 0.02;
    return { name: t.name, c1: t.c1, c2: t.c2, bands: t.bands, flag: t.flag, aiBase, boss: null };
  }

  // A boss is "pending" if its trigger stage was just cleared but not yet beaten.
  function pendingBoss() {
    for (const b of BOSSES) {
      if (save.stage === b.afterStage + 1 && !save.bossesBeaten[b.key]) return b;
    }
    return null;
  }

  // ========================== NATION SELECT ==============================
  function buildNationGrid() {
    const grid = $('nation-grid');
    grid.innerHTML = '';
    NATIONS.forEach(n => {
      const btn = document.createElement('button');
      btn.className = 'nation-btn' + (save.nation === n.id ? ' selected' : '');
      const chip = document.createElement('div');
      chip.className = 'flag-chip';
      renderFlagElement(chip, n.flag);
      const label = document.createElement('span');
      label.textContent = n.name;
      btn.appendChild(chip); btn.appendChild(label);
      btn.addEventListener('click', () => {
        save.nation = n.id;
        persist();
        renderHome();
        show('home');
      });
      grid.appendChild(btn);
    });
  }

  // =============================== HOME ==================================
  function renderHome() {
    const n = nationById(save.nation);
    const flag = $('home-flag');
    renderFlagElement(flag, n.flag);
    $('home-nation-name').textContent = n.name;
    $('home-stage').textContent = save.stage;
    $('home-best').textContent = save.best;
    const opp = currentOpponent();
    $('home-next').textContent = opp.boss
      ? `★ BOSS: ${opp.name} ★`
      : `Next up: ${opp.name}`;
  }

  // =========================== PERMISSIONS ===============================
  async function requestMedia() {
    const status = $('perm-status');
    status.style.color = '#8b93c9';
    status.textContent = 'Requesting mic + camera…';
    let micOk = false;
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micOk = true;
    } catch (e) { micStream = null; }
    try {
      camStream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240, facingMode: 'user' } });
      camFeed.srcObject = camStream;
    } catch (e) { camStream = null; }

    if (micOk) {
      setupAnalyser(micStream);
      usingMic = true;
      startMatch();
    } else {
      usingMic = false;
      status.style.color = 'var(--red)';
      status.textContent = 'Mic blocked. Use Practice mode (SPACE / tap) instead.';
    }
  }

  function setupAnalyser(stream) {
    try {
      const ctxA = ensureAudioContext();
      if (!ctxA) return;
      const src = ctxA.createMediaStreamSource(stream);
      analyser = ctxA.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.6;
      freqData = new Uint8Array(analyser.frequencyBinCount);
      src.connect(analyser);
    } catch (e) { analyser = null; }
  }

  // -------------------- microphone / input intensity ---------------------
  function openingAssist(stage) {
    return clamp((OPENING_ASSIST_END_STAGE - stage) / (OPENING_ASSIST_END_STAGE - 1), 0, 1);
  }

  // Returns 0..1 "shout intensity" for this frame.
  function readIntensity() {
    if (usingMic && analyser) {
      analyser.getByteFrequencyData(freqData);
      let sum = 0;
      for (let i = 0; i < freqData.length; i++) sum += freqData[i];
      const avg = sum / freqData.length / 255;        // 0..1
      // adaptive noise floor: drift up slowly toward quiet ambient level
      if (avg < noiseFloor) noiseFloor += (avg - noiseFloor) * 0.05;
      else noiseFloor += (avg - noiseFloor) * 0.002;
      const assist = openingAssist(match ? match.stage : save.stage);
      const gate = 0.02 - assist * 0.012;
      const scale = 0.35 - assist * 0.1;
      const v = clamp((avg - noiseFloor - gate) / scale, 0, 1);
      return Math.pow(v, 1 - assist * 0.22);
    }
    // practice fallback
    return practiceHeld ? 0.85 : 0;
  }

  // =============================== MATCH =================================
  function startMatch() {
    const opp = currentOpponent();
    const playerNation = nationById(save.nation);
    clearShareImage();
    match = {
      opp, playerNation,
      stage: save.stage,
      ballX: 0.5,            // 0 = player goal (left), 1 = opponent goal (right)
      ballSpin: 0,
      timeLeft: MATCH_SECONDS,
      over: false,
      result: null,          // 'win' | 'lose' | 'draw'
      intensity: 0,
      smoothInt: 0,
      power: 0,
      burst: 0,              // sustained-loud accumulator
      multiplier: 1,
      screenShake: 0,
      particles: [],
      confetti: [],
      crowdPhase: 0,
      aiPhase: Math.PI,      // deterministic-ish start
      goalFlash: 0,
      goalSide: null,        // which goal got scored on
      playerMouth: 0,
      oppMouth: 0,
      celebrate: 0,
    };
    show('match');
    $('practice-hint').classList.toggle('show', !usingMic);
    startRecording();
    resumeAudio();
    playKickoffSound();
    startAmbientCrowd();
    lastT = 0;
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(loop);
  }

  function ensureAudioContext() {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      return audioCtx;
    } catch (e) {
      return null;
    }
  }

  function resumeAudio() {
    const ctxA = ensureAudioContext();
    if (ctxA && ctxA.state === 'suspended') ctxA.resume();
    warmSfx();
  }

  function loop(t) {
    if (!lastT) lastT = t;
    let dt = (t - lastT) / 1000;
    lastT = t;
    dt = Math.min(dt, 0.05);
    if (!match.over) update(dt);
    else updateGoalScene(dt);
    render();
    rafId = requestAnimationFrame(loop);
  }

  function update(dt) {
    const m = match;
    m.timeLeft -= dt;
    m.crowdPhase += dt * 4;
    m.aiPhase += dt * 2.2;

    // --- player input ---
    const assist = openingAssist(m.stage);
    const raw = readIntensity();
    m.intensity = raw;
    m.smoothInt += (raw - m.smoothInt) * 0.35;

    // burst builds while loud, decays while quiet → unlocks higher multipliers
    if (raw > 0.45 - assist * 0.12) m.burst = Math.min(1, m.burst + dt * (0.9 + assist * 0.25));
    else m.burst = Math.max(0, m.burst - dt * 1.4);

    const power = clamp(m.smoothInt * (0.6 + m.burst * 0.8) * (1 + assist * 0.22), 0, 1);
    m.power = power;
    m.multiplier = power < 0.18 ? 1 : power < 0.42 ? 3 : power < 0.72 ? 5 : 10;

    // --- opponent AI: base pressure + rhythmic waves + phase spikes ---
    const phaseRamp = 1 + (1 - m.timeLeft / MATCH_SECONDS) * 0.25; // pushes harder late
    const wave = 0.55 + 0.45 * Math.abs(Math.sin(m.aiPhase));
    const aiPush = m.opp.aiBase * (1 - assist * 0.28) * wave * phaseRamp;
    m.oppMouth += ((wave - 0.3) - m.oppMouth) * 0.2;

    // --- ball physics ---
    const playerPush = power * (0.95 + assist * 0.12);
    const delta = (playerPush - aiPush) * dt * 0.62;
    m.ballX = clamp(m.ballX + delta, 0, 1);
    m.ballSpin += (playerPush + aiPush) * dt * 14;

    // mouth + feedback
    m.playerMouth += (clamp(raw * 1.3, 0, 1) - m.playerMouth) * 0.4;
    m.screenShake = Math.max(m.screenShake, raw * 6 * (m.multiplier >= 5 ? 1.4 : 1));
    m.screenShake *= 0.86;

    // spawn GOAL particles toward the ball when shouting hard
    if (raw > 0.3 && Math.random() < raw * m.multiplier * 0.12) spawnGoalParticle();
    updateParticles(dt);

    // --- win / lose checks: only a ball visibly inside the goal counts ---
    if (ballHasEnteredGoal(m, 'right')) endMatch('win', 'right');
    else if (ballHasEnteredGoal(m, 'left')) endMatch('lose', 'left');
    else if (m.timeLeft <= 0) endMatch('draw', null);
  }

  function endMatch(result, side) {
    const m = match;
    m.over = true;
    m.result = result;
    m.goalSide = side;
    m.goalFlash = side ? 1 : 0;
    m.celebrate = result === 'win' ? 2.2 : 0;
    m.screenShake = side ? 14 : 6;
    if (result === 'win') burstConfetti();
    stopAmbientCrowd(0.3);
    playResultSound(result);

    // progression
    if (result === 'win') {
      const opp = m.opp;
      if (opp.boss) save.bossesBeaten[opp.boss.key] = true;
      save.stage += 1;
      save.best = Math.max(save.best, save.stage - 1);
    }
    persist();

    // goal scenes get a celebration beat; no-goal results should resolve faster.
    setTimeout(finishToResult, side ? 2300 : 1100);
  }

  function updateGoalScene(dt) {
    const m = match;
    m.crowdPhase += dt * 8;
    m.goalFlash = Math.max(0, m.goalFlash - dt * 0.8);
    m.celebrate = Math.max(0, m.celebrate - dt);
    m.screenShake *= 0.9;
    m.playerMouth = m.result === 'win' ? 1 : m.playerMouth * 0.9;
    m.oppMouth = m.result === 'lose' ? 1 : m.oppMouth * 0.9;
    updateParticles(dt);
    updateConfetti(dt);
  }

  // --------------------------- particles ---------------------------------
  function spawnGoalParticle() {
    const m = match;
    const bx = fieldX(m.ballX), by = BALL_Y;
    m.particles.push({
      x: 80 + Math.random() * 30, y: H * 0.5 + (Math.random() - 0.5) * 40,
      tx: bx, ty: by, life: 0, dur: 0.5 + Math.random() * 0.3,
      hit: false, hue: Math.random() < 0.5 ? '#ffdc00' : '#2ecc40',
    });
  }
  function updateParticles(dt) {
    const m = match;
    for (let i = m.particles.length - 1; i >= 0; i--) {
      const p = m.particles[i];
      p.life += dt;
      const k = Math.min(1, p.life / p.dur);
      p.x += (p.tx - p.x) * 0.18;
      p.y += (p.ty - p.y) * 0.18;
      if (!p.hit && k > 0.85) { p.hit = true; m.screenShake = Math.max(m.screenShake, 3); }
      if (p.life > p.dur) m.particles.splice(i, 1);
    }
  }
  function burstConfetti() {
    const m = match;
    for (let i = 0; i < 120; i++) {
      m.confetti.push({
        x: W * 0.5 + (Math.random() - 0.5) * 80, y: H * 0.4,
        vx: (Math.random() - 0.5) * 260, vy: -120 - Math.random() * 200,
        c: ['#ffdc00', '#2ecc40', '#ff4136', '#3ba7ff', '#ffffff'][i % 5],
        r: 2 + Math.random() * 3, life: 0,
      });
    }
  }
  function updateConfetti(dt) {
    const m = match;
    for (let i = m.confetti.length - 1; i >= 0; i--) {
      const c = m.confetti[i];
      c.life += dt; c.vy += 380 * dt;
      c.x += c.vx * dt; c.y += c.vy * dt;
      if (c.y > H + 10) m.confetti.splice(i, 1);
    }
  }

  // ============================= RENDER =================================
  const GOAL_W = 26;
  const GOAL_TOP = 130;
  const GOAL_H = 110;
  const LEFT_GOAL_X = 70 - GOAL_W;
  const RIGHT_GOAL_X = W - 70;
  const BALL_R = 10;
  const BALL_Y = H * 0.55;
  const BALL_MIN_X = LEFT_GOAL_X + GOAL_W * 0.5;
  const BALL_MAX_X = RIGHT_GOAL_X + GOAL_W * 0.5;
  const GOAL_SCORE_DEPTH = GOAL_W * 0.35;
  const fieldX = (bx) => BALL_MIN_X + bx * (BALL_MAX_X - BALL_MIN_X);   // ball x mapped into the goals

  function ballHasEnteredGoal(m, side) {
    const x = fieldX(m.ballX);
    const y = BALL_Y;
    const insideY = y >= GOAL_TOP + BALL_R * 0.5 && y <= GOAL_TOP + GOAL_H - BALL_R * 0.5;
    if (!insideY) return false;
    if (side === 'right') return x >= RIGHT_GOAL_X + GOAL_SCORE_DEPTH;
    return x <= LEFT_GOAL_X + GOAL_W - GOAL_SCORE_DEPTH;
  }

  function render() {
    const m = match;
    ctx.save();
    if (m.screenShake > 0.3) {
      ctx.translate((Math.random() - 0.5) * m.screenShake, (Math.random() - 0.5) * m.screenShake);
    }
    drawPitch();
    drawCrowd();
    drawGoals();
    drawPlayer();
    drawOpponent();
    drawParticles();
    drawBall();
    drawCheerleaders();
    drawConfetti();
    ctx.restore();           // shake off for HUD
    drawHUD();
    drawCameraPiP();
    if (m.over && m.goalFlash > 0.02) drawGoalText();
  }

  function drawPitch() {
    ctx.fillStyle = '#0a3d12';
    ctx.fillRect(0, 0, W, H);
    // grass stripes
    for (let i = 0; i < 12; i++) {
      ctx.fillStyle = i % 2 ? '#0c4716' : '#0a3d12';
      ctx.fillRect(i * (W / 12), 80, W / 12, H - 80);
    }
    // pitch lines
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 2;
    ctx.strokeRect(70, 95, W - 140, H - 115);
    ctx.beginPath(); ctx.moveTo(W / 2, 95); ctx.lineTo(W / 2, H - 20); ctx.stroke();
    ctx.beginPath(); ctx.arc(W / 2, (H + 75) / 2, 34, 0, Math.PI * 2); ctx.stroke();
  }

  function drawCrowd() {
    const m = match;
    for (let r = 0; r < 4; r++) {
      for (let x = 0; x < W; x += 12) {
        const f = Math.sin((x + r * 30) * 0.3 + m.crowdPhase + (m.over ? x : 0));
        const lit = f > 0.4;
        ctx.fillStyle = lit ? randCrowd(x + r) : '#1c1430';
        ctx.fillRect(x, 8 + r * 16, 10, 12);
      }
    }
    ctx.fillStyle = '#241a3d';
    ctx.fillRect(0, 72, W, 8);
  }
  function randCrowd(seed) {
    const cols = ['#ffdc00', '#2ecc40', '#ff4136', '#3ba7ff', '#ffffff', '#ff851b'];
    return cols[(seed * 7) % cols.length];
  }

  function drawGoals() {
    drawGoal(70, true);                 // left = player's goal
    drawGoal(W - 70, false);            // right = opponent's goal
  }
  function drawGoal(cx, left) {
    const top = GOAL_TOP, h = GOAL_H, w = GOAL_W;
    const x = left ? cx - w : cx;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.strokeRect(x, top, w, h);
    // net
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 5; i++) {
      ctx.beginPath(); ctx.moveTo(x + (i * w / 5), top); ctx.lineTo(x + (i * w / 5), top + h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x, top + (i * h / 5)); ctx.lineTo(x + w, top + (i * h / 5)); ctx.stroke();
    }
  }

  function drawBall() {
    const m = match;
    const x = fieldX(m.ballX), y = BALL_Y;
    // trail when moving fast
    const speed = Math.abs(m.smoothInt) + m.burst;
    if (speed > 0.4) {
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(x - 10, y, 9, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.save();
    ctx.translate(x, y); ctx.rotate(m.ballSpin);
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(0, 0, BALL_R, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#111';
    ctx.beginPath(); ctx.arc(0, 0, 3.5, 0, Math.PI * 2); ctx.fill();
    for (let a = 0; a < 5; a++) {
      const ang = a * (Math.PI * 2 / 5);
      ctx.beginPath();
      ctx.arc(Math.cos(ang) * 6.5, Math.sin(ang) * 6.5, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawParticles() {
    const m = match;
    ctx.font = '10px "Press Start 2P", monospace';
    for (const p of m.particles) {
      const k = Math.min(1, p.life / p.dur);
      ctx.globalAlpha = 1 - k * 0.3;
      ctx.fillStyle = p.hue;
      ctx.fillText('GOAL', p.x - 18, p.y);
    }
    ctx.globalAlpha = 1;
  }

  function drawConfetti() {
    const m = match;
    for (const c of m.confetti) { ctx.fillStyle = c.c; ctx.fillRect(c.x, c.y, c.r, c.r); }
  }

  function drawCheerleaders() {
    const m = match;
    if (!m.over || m.result !== 'win') return;
    const colors = m.playerNation.bands;
    const baseX = 178;
    const groundY = H - 25;
    for (let i = 0; i < 5; i++) {
      const phase = Math.sin(m.crowdPhase * 3.2 + i * 0.9);
      const x = baseX + i * 54;
      const y = groundY + (phase > 0 ? -2 : 1);
      drawCheerleader(x, y, phase, colors, i);
    }
  }

  function drawCheerleader(cx, groundY, phase, teamColors, index) {
    const upLeft = phase > 0;
    const skin = '#e8b98c';
    const hair = ['#241a14', '#111111', '#6b3518', '#3b2316', '#7a4b22'][index % 5];
    const top = teamColors[index % teamColors.length] || '#ffdc00';
    const skirt = teamColors[(index + 1) % teamColors.length] || '#3ba7ff';
    const pomA = index % 2 ? '#ffdc00' : '#ffffff';
    const pomB = index % 2 ? '#3ba7ff' : '#ff4136';
    const bodyY = groundY - 22;
    const leftPom = { x: cx - 13, y: groundY - (upLeft ? 34 : 23) };
    const rightPom = { x: cx + 13, y: groundY - (upLeft ? 23 : 34) };

    // shadow
    ctx.fillStyle = 'rgba(5,7,26,0.38)';
    ctx.fillRect(cx - 13, groundY + 1, 26, 3);

    // arms
    ctx.strokeStyle = skin;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx - 4, bodyY + 4);
    ctx.lineTo(leftPom.x, leftPom.y + 3);
    ctx.moveTo(cx + 4, bodyY + 4);
    ctx.lineTo(rightPom.x, rightPom.y + 3);
    ctx.stroke();

    drawPom(leftPom.x, leftPom.y, pomA);
    drawPom(rightPom.x, rightPom.y, pomB);

    // legs
    ctx.fillStyle = skin;
    const kick = phase > 0 ? 1 : -1;
    ctx.fillRect(cx - 5, groundY - 9, 4, 9);
    ctx.fillRect(cx + 2 + kick, groundY - 9, 4, 9);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(cx - 7, groundY - 1, 7, 3);
    ctx.fillRect(cx + kick, groundY - 1, 8, 3);

    // uniform
    ctx.fillStyle = top;
    ctx.fillRect(cx - 7, bodyY, 14, 10);
    ctx.fillStyle = skirt;
    ctx.fillRect(cx - 10, bodyY + 9, 20, 6);
    ctx.fillStyle = '#05071a';
    ctx.fillRect(cx - 1, bodyY + 1, 2, 8);

    // head and hair
    ctx.fillStyle = hair;
    ctx.fillRect(cx - 7, bodyY - 13, 14, 9);
    ctx.fillRect(cx - 9, bodyY - 9, 4, 10);
    ctx.fillRect(cx + 5, bodyY - 9, 4, 10);
    ctx.fillStyle = skin;
    ctx.fillRect(cx - 6, bodyY - 10, 12, 10);
    ctx.fillStyle = hair;
    ctx.fillRect(cx - 6, bodyY - 12, 12, 4);
    ctx.fillStyle = '#111111';
    ctx.fillRect(cx - 3, bodyY - 6, 2, 2);
    ctx.fillRect(cx + 3, bodyY - 6, 2, 2);
    ctx.fillStyle = '#5a1010';
    ctx.fillRect(cx - 2, bodyY - 2, 4, 2);
  }

  function drawPom(cx, cy, color) {
    ctx.fillStyle = color;
    ctx.fillRect(cx - 5, cy, 10, 4);
    ctx.fillRect(cx - 3, cy - 3, 6, 10);
    ctx.fillRect(cx - 7, cy + 3, 14, 3);
  }

  // pixel avatar with national headband + animated mouth
  function drawHead(cx, cy, bands, jersey, mouth, flip) {
    const s = 5; // pixel scale
    ctx.save();
    ctx.translate(cx, cy);
    if (flip) ctx.scale(-1, 1);
    // body / jersey
    ctx.fillStyle = jersey;
    ctx.fillRect(-3.2 * s, 2.6 * s, 6.4 * s, 3 * s);
    // skin
    ctx.fillStyle = '#e8b98c';
    ctx.fillRect(-2.6 * s, -2.6 * s, 5.2 * s, 5.2 * s);
    // hair
    ctx.fillStyle = '#241a14';
    ctx.fillRect(-2.6 * s, -2.6 * s, 5.2 * s, 1.1 * s);
    // headband (national colours, 3 stripes)
    const bw = 5.2 * s / 3;
    for (let i = 0; i < 3; i++) { ctx.fillStyle = bands[i]; ctx.fillRect(-2.6 * s + i * bw, -1.5 * s, bw, 0.8 * s); }
    // eyes
    ctx.fillStyle = '#222';
    ctx.fillRect(-1.6 * s, -0.4 * s, 0.8 * s, 0.8 * s);
    ctx.fillRect(0.8 * s, -0.4 * s, 0.8 * s, 0.8 * s);
    // mouth — grows with shout intensity
    const mh = (0.4 + mouth * 1.8) * s;
    ctx.fillStyle = '#5a1010';
    ctx.fillRect(-1.4 * s, 1.0 * s, 2.8 * s, mh);
    if (mouth > 0.25) { ctx.fillStyle = '#ff5a5a'; ctx.fillRect(-0.9 * s, 1.0 * s + mh * 0.4, 1.8 * s, mh * 0.5); }
    ctx.restore();
  }

  function drawPlayer() {
    const m = match;
    drawHead(60, H * 0.5, m.playerNation.bands, '#1d6fd6', m.playerMouth, false);
    if (m.playerMouth > 0.5 && !m.over) {
      ctx.fillStyle = '#ffdc00';
      ctx.font = '8px "Press Start 2P", monospace';
      ctx.fillText('GOAL!', 78, H * 0.5 - 36);
    }
  }
  function drawOpponent() {
    const m = match;
    drawHead(W - 60, H * 0.5, m.opp.bands, m.opp.c2, m.oppMouth, true);
    if (m.oppMouth > 0.55 && !m.over) {
      ctx.fillStyle = '#ff6b6b';
      ctx.font = '8px "Press Start 2P", monospace';
      ctx.fillText('NO!', W - 96, H * 0.5 - 36);
    }
  }

  // broadcast-style HUD
  function drawHUD() {
    const m = match;
    // scoreboard
    ctx.fillStyle = 'rgba(5,7,26,0.85)';
    ctx.fillRect(W / 2 - 130, 84, 260, 26);
    ctx.strokeStyle = '#2b346b'; ctx.lineWidth = 2;
    ctx.strokeRect(W / 2 - 130, 84, 260, 26);
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#fff';
    ctx.fillText(short(m.playerNation.name), W / 2 - 124, 101);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#fff';
    ctx.fillText(short(m.opp.name), W / 2 + 124, 101);
    ctx.textAlign = 'center';
    ctx.fillStyle = m.timeLeft < 5 ? '#ff4136' : '#ffdc00';
    ctx.fillText(Math.ceil(Math.max(0, m.timeLeft)) + 's', W / 2, 101);
    ctx.textAlign = 'left';

    // stage tag
    ctx.fillStyle = m.opp.boss ? '#ff4136' : '#8b93c9';
    ctx.fillText((m.opp.boss ? 'BOSS' : 'STAGE ' + save.stage), 14, 100);

    // Goal Meter (bottom-right)
    drawGoalMeter();
  }

  function drawGoalMeter() {
    const m = match;
    const x = W - 150, y = H - 30, w = 134, h = 16;
    ctx.fillStyle = 'rgba(5,7,26,0.85)';
    ctx.fillRect(x - 4, y - 16, w + 8, h + 22);
    ctx.font = '7px "Press Start 2P", monospace';
    ctx.fillStyle = '#fff';
    ctx.fillText('GOAL METER', x, y - 6);
    // bar
    ctx.fillStyle = '#11163a';
    ctx.fillRect(x, y, w, h);
    const fill = m.power || 0;
    const col = m.multiplier >= 10 ? '#ff4136' : m.multiplier >= 5 ? '#ff851b' : m.multiplier >= 3 ? '#ffdc00' : '#2ecc40';
    ctx.fillStyle = col;
    ctx.fillRect(x, y, w * fill, h);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'right';
    ctx.fillText('x' + m.multiplier, x + w - 2, y + 12);
    ctx.textAlign = 'left';
  }

  function drawCameraPiP() {
    const m = match;
    const w = 92, h = 70, x = 14, y = H - h - 14;
    ctx.fillStyle = '#000';
    ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
    if (camStream && camFeed.readyState >= 2) {
      ctx.save();
      // mirror selfie
      ctx.translate(x + w, y); ctx.scale(-1, 1);
      try { ctx.drawImage(camFeed, 0, 0, w, h); } catch (e) {}
      ctx.restore();
    } else {
      ctx.fillStyle = '#11163a';
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = '#8b93c9';
      ctx.font = '7px "Press Start 2P", monospace';
      ctx.fillText('NO CAM', x + 22, y + h / 2);
    }
    ctx.strokeStyle = '#2b346b'; ctx.lineWidth = 2; ctx.strokeRect(x - 2, y - 2, w + 4, h + 4);
  }

  function drawGoalText() {
    const m = match;
    const k = m.goalFlash;
    ctx.save();
    ctx.globalAlpha = Math.min(0.45, k * 0.5);
    ctx.fillStyle = m.result === 'win' ? '#2ecc40' : '#ff4136';
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
    const scale = 1 + (1 - k) * 0.6;
    ctx.translate(W / 2, H / 2 - 10);
    ctx.scale(scale, scale);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.font = '26px "Press Start 2P", monospace';
    ctx.lineWidth = 4; ctx.strokeStyle = '#05071a';
    const txt = m.result === 'win' ? 'GOOOAL!!!' : 'CONCEDED';
    ctx.strokeText(txt, 0, 0); ctx.fillText(txt, 0, 0);
    ctx.restore();
    ctx.textAlign = 'left';
  }

  // ============================ AUDIO FX ================================
  function warmSfx() {
    for (const name in SFX) loadSfx(name).catch(() => {});
  }

  async function loadSfx(name) {
    if (sfxBuffers[name]) return sfxBuffers[name];
    if (sfxLoads[name]) return sfxLoads[name];
    const ctxA = ensureAudioContext();
    if (!ctxA) throw new Error('AudioContext unavailable');
    sfxLoads[name] = fetch(SFX[name])
      .then(res => {
        if (!res.ok) throw new Error(`SFX ${name} failed: ${res.status}`);
        return res.arrayBuffer();
      })
      .then(buf => ctxA.decodeAudioData(buf))
      .then(decoded => {
        sfxBuffers[name] = decoded;
        return decoded;
      });
    return sfxLoads[name];
  }

  async function playSfx(name, opts = {}) {
    const ctxA = ensureAudioContext();
    if (!ctxA) throw new Error('AudioContext unavailable');
    if (ctxA.state === 'suspended') await ctxA.resume();
    const buffer = await loadSfx(name);
    const source = ctxA.createBufferSource();
    const gain = ctxA.createGain();
    const volume = opts.volume ?? 1;
    const delay = opts.delay ?? 0;
    const start = ctxA.currentTime + delay;
    const minRemaining = opts.minRemaining ?? 0;
    const maxOffset = Math.max(0, buffer.duration - minRemaining);
    const offset = opts.randomOffset ? Math.random() * maxOffset : (opts.offset ?? 0);

    source.buffer = buffer;
    source.loop = !!opts.loop;
    source.playbackRate.value = opts.playbackRate ?? 1;
    source.connect(gain);
    gain.connect(opts.destination || ctxA.destination);

    if (opts.fadeIn) {
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(volume, start + opts.fadeIn);
    } else {
      gain.gain.setValueAtTime(volume, start);
    }

    source.start(start, offset);
    if (opts.maxDuration) {
      const stopAt = start + opts.maxDuration;
      if (opts.fadeOut) {
        gain.gain.setValueAtTime(volume, Math.max(start, stopAt - opts.fadeOut));
        gain.gain.linearRampToValueAtTime(0.0001, stopAt);
      }
      source.stop(stopAt + 0.05);
    }
    return { source, gain, ctx: ctxA };
  }

  function playKickoffSound() {
    playSfx('kickoff', { volume: 0.62, maxDuration: 1.45 }).catch(() => {
      playKickoffFallback();
    });
  }

  function startAmbientCrowd() {
    stopAmbientCrowd(0);
    playSfx('ambient', { volume: 0.16, loop: true, fadeIn: 1.1, randomOffset: true, minRemaining: MATCH_SECONDS + 2 })
      .then(node => {
        if (screen !== 'match' || !match || match.over) {
          fadeOutNode(node, 0.2);
          return;
        }
        ambientCrowd = node;
      })
      .catch(() => {});
  }

  function stopAmbientCrowd(fade = 0.35) {
    if (!ambientCrowd) return;
    fadeOutNode(ambientCrowd, fade);
    ambientCrowd = null;
  }

  function fadeOutNode(node, fade) {
    const ctxA = node.ctx || audioCtx;
    if (!ctxA) return;
    const now = ctxA.currentTime;
    try {
      node.gain.gain.cancelScheduledValues(now);
      node.gain.gain.setValueAtTime(Math.max(0.0001, node.gain.gain.value || 0.0001), now);
      node.gain.gain.linearRampToValueAtTime(0.0001, now + fade);
      node.source.stop(now + fade + 0.05);
    } catch (e) {}
  }

  function playResultSound(result) {
    if (result === 'draw') {
      playSyntheticResultSound('draw');
      return;
    }
    const name = result === 'win' ? 'win' : 'lose';
    const volume = result === 'win' ? 0.9 : 0.82;
    const maxDuration = result === 'win' ? 7.0 : 6.2;
    playSfx(name, { volume, maxDuration, fadeOut: 0.8 }).catch(() => {
      playSyntheticResultSound(result);
    });
  }

  function playKickoffFallback() {
    const ctxA = ensureAudioContext();
    if (!ctxA) return;
    const now = ctxA.currentTime;
    const osc = ctxA.createOscillator();
    const gain = ctxA.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(1900, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.16, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);
    osc.connect(gain); gain.connect(ctxA.destination);
    osc.start(now); osc.stop(now + 0.5);
  }

  // Synthesized result sounds remain as a fallback if real samples fail.
  function playSyntheticResultSound(result) {
    const ctxA = ensureAudioContext();
    if (!ctxA) return;
    if (ctxA.state === 'suspended') ctxA.resume();

    const win = result === 'win';
    const draw = result === 'draw';
    const now = ctxA.currentTime;
    const master = ctxA.createGain();
    master.gain.value = 0.0001;
    master.connect(ctxA.destination);
    master.gain.exponentialRampToValueAtTime(win ? 0.55 : draw ? 0.22 : 0.34, now + 0.08);
    master.gain.exponentialRampToValueAtTime(0.0001, now + (win ? 2.35 : draw ? 1.35 : 1.9));

    // crowd noise (filtered white noise)
    const dur = win ? 2.3 : draw ? 1.3 : 1.8;
    const buf = ctxA.createBuffer(1, ctxA.sampleRate * dur, ctxA.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) {
      const k = i / d.length;
      const shape = win ? Math.sin(Math.PI * k) : draw ? Math.sin(Math.PI * k) * 0.5 : Math.pow(1 - k, 0.55);
      d[i] = (Math.random() * 2 - 1) * (win ? 0.62 : draw ? 0.22 : 0.48) * shape;
    }
    const noise = ctxA.createBufferSource(); noise.buffer = buf;
    const bp = ctxA.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = win ? 1050 : draw ? 520 : 360;
    bp.Q.value = win ? 0.7 : draw ? 0.85 : 1.1;
    noise.connect(bp); bp.connect(master); noise.start(now);

    if (win) {
      // referee whistle
      const w = ctxA.createOscillator(); w.type = 'square'; w.frequency.value = 2100;
      const wg = ctxA.createGain(); wg.gain.value = 0.0001;
      wg.gain.exponentialRampToValueAtTime(0.18, now + 0.05);
      wg.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
      w.connect(wg); wg.connect(ctxA.destination); w.start(now); w.stop(now + 0.45);
      // little stadium fanfare
      [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
        playTone(ctxA, now + 0.48 + i * 0.13, freq, 0.18, 'triangle', 0.11, master);
      });
      // claps
      for (let i = 0; i < 10; i++) {
        const t = now + 0.2 + i * 0.12;
        const cb = ctxA.createBufferSource();
        const cbuf = ctxA.createBuffer(1, 600, ctxA.sampleRate);
        const cd = cbuf.getChannelData(0);
        for (let j = 0; j < cd.length; j++) cd[j] = (Math.random() * 2 - 1) * Math.pow(1 - j / cd.length, 4);
        cb.buffer = cbuf;
        const cg = ctxA.createGain(); cg.gain.value = 0.25;
        cb.connect(cg); cg.connect(ctxA.destination); cb.start(t);
      }
    } else if (draw) {
      // neutral full-time whistle pair
      [740, 740].forEach((freq, i) => {
        playTone(ctxA, now + 0.1 + i * 0.34, freq, 0.16, 'square', 0.08, master);
      });
    } else {
      // descending "aww" tones for a conceded goal
      [196, 164.81, 130.81].forEach((freq, i) => {
        playTone(ctxA, now + 0.08 + i * 0.22, freq, 0.45, 'sawtooth', 0.13 - i * 0.025, master);
      });
      const thud = ctxA.createOscillator();
      thud.type = 'sine';
      thud.frequency.setValueAtTime(92, now + 0.05);
      thud.frequency.exponentialRampToValueAtTime(46, now + 0.55);
      const tg = ctxA.createGain();
      tg.gain.setValueAtTime(0.18, now + 0.05);
      tg.gain.exponentialRampToValueAtTime(0.0001, now + 0.72);
      thud.connect(tg); tg.connect(master); thud.start(now + 0.05); thud.stop(now + 0.78);
    }
  }

  function playTone(ctxA, start, freq, dur, type, volume, destination) {
    const osc = ctxA.createOscillator();
    const gain = ctxA.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(gain); gain.connect(destination);
    osc.start(start); osc.stop(start + dur + 0.04);
  }

  // ========================== RECORDING ================================
  function startRecording() {
    replayBlob = null;
    if (replayUrl) { URL.revokeObjectURL(replayUrl); replayUrl = null; }
    recChunks = [];
    try {
      const stream = canvas.captureStream(30);
      // fold in the player's mic so they hear/see themselves in the replay
      if (micStream) micStream.getAudioTracks().forEach(tr => stream.addTrack(tr));
      const mime = pickMime();
      recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      recorder.ondataavailable = (e) => { if (e.data && e.data.size) recChunks.push(e.data); };
      recorder.start(200);
    } catch (e) { recorder = null; }
  }
  function pickMime() {
    const opts = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
    for (const o of opts) { if (window.MediaRecorder && MediaRecorder.isTypeSupported(o)) return o; }
    return '';
  }
  function stopRecording() {
    return new Promise((resolve) => {
      if (!recorder || recorder.state === 'inactive') return resolve();
      recorder.onstop = () => {
        try {
          if (recChunks.length) {
            replayBlob = new Blob(recChunks, { type: recChunks[0].type || 'video/webm' });
            replayUrl = URL.createObjectURL(replayBlob);
          }
        } catch (e) {}
        resolve();
      };
      try { recorder.stop(); } catch (e) { resolve(); }
    });
  }

  // ============================ RESULT =================================
  async function finishToResult() {
    cancelAnimationFrame(rafId);
    await stopRecording();
    const m = match;
    lastResult = buildResultData(m);
    const title = $('result-title');
    title.textContent = resultLabel(m.result);
    title.className = 'result-title ' + m.result;

    const vid = $('replay-video');
    if (replayUrl) { vid.src = replayUrl; vid.style.display = ''; vid.load(); }
    else vid.style.display = 'none';

    $('btn-next').textContent = m.result === 'win' ? 'Next Match' : 'Continue';
    $('btn-share').style.display = '';
    $('btn-share').textContent = 'Share Card';
    $('btn-share').disabled = false;
    $('btn-download').style.display = replayBlob ? '' : 'none';

    // free media between matches; re-acquire on next start
    show('result');
  }

  function quitMatch() {
    cancelAnimationFrame(rafId);
    stopAmbientCrowd(0.2);
    if (recorder && recorder.state !== 'inactive') { try { recorder.stop(); } catch (e) {} }
    renderHome();
    show('home');
  }

  // ---------------------------- sharing ----------------------------------
  function buildResultData(m) {
    const playerWon = m.result === 'win';
    const draw = m.result === 'draw';
    const playerScore = playerWon ? 1 : 0;
    const opponentScore = draw || playerWon ? 0 : 1;
    return {
      result: m.result,
      stage: m.stage,
      best: save.best,
      playerName: m.playerNation.name,
      opponentName: m.opp.name,
      playerFlag: m.playerNation.flag,
      opponentFlag: m.opp.flag,
      playerScore,
      opponentScore,
      url: getShareUrl(),
    };
  }

  function getShareUrl() {
    const max = window.Goal2026Qr ? window.Goal2026Qr.maxBytes : 106;
    const encoder = new TextEncoder();
    const page = new URL(window.location.href);
    page.hash = '';
    page.search = '';
    const exact = page.href;
    if (encoder.encode(exact).length <= max) return exact;
    const pathOnly = page.origin + page.pathname;
    if (encoder.encode(pathOnly).length <= max) return pathOnly;
    return page.origin;
  }

  async function openShareCard() {
    if (!lastResult && match) lastResult = buildResultData(match);
    if (!lastResult) return;
    const btn = $('btn-share');
    btn.disabled = true;
    btn.textContent = 'Making...';
    try {
      const blob = await generateShareImageBlob(lastResult);
      if (shareImageUrl) URL.revokeObjectURL(shareImageUrl);
      shareImageBlob = blob;
      shareImageUrl = URL.createObjectURL(blob);
      $('share-image-preview').src = shareImageUrl;
      $('share-modal').classList.add('show');
      $('share-modal').setAttribute('aria-hidden', 'false');
    } catch (e) {
      console.warn(e);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Share Card';
    }
  }

  async function generateShareImageBlob(data) {
    if (document.fonts && document.fonts.ready) {
      try { await document.fonts.ready; } catch (e) {}
    }
    const poster = document.createElement('canvas');
    poster.width = 1080;
    poster.height = 1350;
    const pctx = poster.getContext('2d');
    drawSharePoster(pctx, poster.width, poster.height, data);
    return new Promise((resolve, reject) => {
      poster.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not create share image')), 'image/png');
    });
  }

  function drawSharePoster(g, w, h, data) {
    const accent = resultAccent(data.result);

    g.imageSmoothingEnabled = false;
    g.fillStyle = '#070b20';
    g.fillRect(0, 0, w, h);

    for (let i = 0; i < 18; i++) {
      g.fillStyle = i % 2 ? '#0a3d12' : '#0c4716';
      g.fillRect(i * (w / 18), 290, w / 18 + 1, 470);
    }
    g.fillStyle = '#12183d';
    g.fillRect(0, 0, w, 300);
    g.fillStyle = '#241a3d';
    g.fillRect(0, 248, w, 42);
    drawPosterCrowd(g, w);

    g.fillStyle = '#05071a';
    g.fillRect(58, 58, w - 116, h - 116);
    g.strokeStyle = '#2b346b';
    g.lineWidth = 10;
    g.strokeRect(58, 58, w - 116, h - 116);

    drawLogo(g, w / 2, 150);
    drawCenteredFit(g, resultLabel(data.result), w / 2, 260, 860, 86, accent);

    drawScorePanel(g, 126, 350, 828, 230, data, accent);

    const qrSize = 340;
    const qrX = (w - qrSize) / 2;
    const qrY = 690;
    g.fillStyle = '#11163a';
    g.fillRect(qrX - 34, qrY - 44, qrSize + 68, qrSize + 132);
    g.strokeStyle = '#2b346b';
    g.lineWidth = 8;
    g.strokeRect(qrX - 34, qrY - 44, qrSize + 68, qrSize + 132);
    drawQr(g, data.url, qrX, qrY, qrSize);
    drawCenteredFit(g, 'SCAN TO PLAY', w / 2, qrY + qrSize + 50, 520, 28, '#ffffff');
    drawCenteredFit(g, data.url.replace(/^https?:\/\//, ''), w / 2, h - 74, 820, 20, '#8b93c9');
  }

  function drawLogo(g, x, y) {
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = '64px "Press Start 2P", monospace';
    g.fillStyle = '#05071a';
    g.fillText('GOAL', x + 8, y + 8);
    g.fillStyle = '#f6f7ff';
    g.fillText('GOAL', x - 78, y);
    g.fillStyle = '#ffdc00';
    g.fillText('2026', x + 176, y);
  }

  function drawScorePanel(g, x, y, w, h, data, accent) {
    g.fillStyle = '#11163a';
    g.fillRect(x, y, w, h);
    g.strokeStyle = accent;
    g.lineWidth = 8;
    g.strokeRect(x, y, w, h);

    drawFlag(g, x + 54, y + 44, 126, 82, data.playerFlag);
    drawFlag(g, x + w - 180, y + 44, 126, 82, data.opponentFlag);
    drawCenteredFit(g, short(data.playerName).toUpperCase(), x + 117, y + 164, 260, 28, '#ffffff');
    drawCenteredFit(g, short(data.opponentName).toUpperCase(), x + w - 117, y + 164, 260, 28, '#ffffff');

    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = '92px "Press Start 2P", monospace';
    g.fillStyle = '#ffdc00';
    g.fillText(`${data.playerScore} - ${data.opponentScore}`, x + w / 2, y + 112);
  }

  function drawPosterCrowd(g, w) {
    const cols = ['#ffdc00', '#2ecc40', '#ff4136', '#3ba7ff', '#ffffff', '#ff851b'];
    for (let row = 0; row < 6; row++) {
      for (let x = 0; x < w; x += 24) {
        g.fillStyle = cols[(x / 24 + row * 3) % cols.length];
        g.fillRect(x, 18 + row * 34, 18, 24);
      }
    }
  }

  function renderFlagElement(el, flag) {
    el.innerHTML = '';
    const c = document.createElement('canvas');
    c.width = 68;
    c.height = 44;
    c.className = 'flag-canvas';
    el.appendChild(c);
    const flagCtx = c.getContext('2d');
    flagCtx.imageSmoothingEnabled = false;
    drawFlagDesign(flagCtx, flag, 0, 0, c.width, c.height);
  }

  function drawFlag(g, x, y, w, h, flag) {
    g.fillStyle = '#05071a';
    g.fillRect(x - 6, y - 6, w + 12, h + 12);
    drawFlagDesign(g, flag, x, y, w, h);
  }

  function drawFlagDesign(g, flag, x, y, w, h) {
    const spec = flag || {};
    g.save();
    g.beginPath();
    g.rect(x, y, w, h);
    g.clip();

    if (spec.type === 'horizontal') drawHorizontalFlag(g, x, y, w, h, spec.colors, spec.ratios);
    else if (spec.type === 'vertical') drawVerticalFlag(g, x, y, w, h, spec.colors, spec.ratios);
    else if (spec.type === 'argentina') {
      drawHorizontalFlag(g, x, y, w, h, ['#75AADB', '#FFFFFF', '#75AADB']);
      drawSun(g, x + w * 0.5, y + h * 0.5, h * 0.11, '#F6B40E');
    } else if (spec.type === 'brazil') {
      fill(g, x, y, w, h, '#009C3B');
      drawDiamond(g, x + w * 0.5, y + h * 0.5, w * 0.74, h * 0.72, '#FFDF00');
      drawCircle(g, x + w * 0.5, y + h * 0.5, h * 0.22, '#002776');
    } else if (spec.type === 'japan') {
      fill(g, x, y, w, h, '#FFFFFF');
      drawCircle(g, x + w * 0.5, y + h * 0.5, h * 0.26, '#BC002D');
    } else if (spec.type === 'england') {
      fill(g, x, y, w, h, '#FFFFFF');
      fill(g, x + w * 0.43, y, w * 0.14, h, '#CF142B');
      fill(g, x, y + h * 0.42, w, h * 0.16, '#CF142B');
    } else if (spec.type === 'usa') {
      for (let i = 0; i < 13; i++) fill(g, x, y + i * h / 13, w, h / 13, i % 2 ? '#FFFFFF' : '#B22234');
      fill(g, x, y, w * 0.45, h * 7 / 13, '#3C3B6E');
      for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++) {
        drawStar(g, x + w * (0.055 + c * 0.08), y + h * (0.07 + r * 0.09), h * 0.018, h * 0.008, '#FFFFFF');
      }
    } else if (spec.type === 'canada') {
      drawVerticalFlag(g, x, y, w, h, ['#FF0000', '#FFFFFF', '#FF0000'], [1, 2, 1]);
      drawMapleLeaf(g, x + w * 0.5, y + h * 0.5, h * 0.27, '#FF0000');
    } else if (spec.type === 'portugal') {
      fill(g, x, y, w * 0.4, h, '#006600');
      fill(g, x + w * 0.4, y, w * 0.6, h, '#DA291C');
      drawCircle(g, x + w * 0.4, y + h * 0.5, h * 0.15, '#F1BF00');
      drawCircle(g, x + w * 0.4, y + h * 0.5, h * 0.09, '#DA291C');
    } else if (spec.type === 'mexico') {
      drawVerticalFlag(g, x, y, w, h, ['#006847', '#FFFFFF', '#CE1126']);
      drawCircle(g, x + w * 0.5, y + h * 0.5, h * 0.09, '#B38B00');
      drawCircle(g, x + w * 0.5, y + h * 0.5, h * 0.045, '#006847');
    } else if (spec.type === 'south-korea') {
      fill(g, x, y, w, h, '#FFFFFF');
      drawTaegeuk(g, x + w * 0.5, y + h * 0.5, h * 0.22);
      drawTrigrams(g, x, y, w, h);
    } else if (spec.type === 'nordic') {
      fill(g, x, y, w, h, spec.base);
      fill(g, x + w * 0.29, y, w * 0.13, h, spec.cross);
      fill(g, x, y + h * 0.41, w, h * 0.18, spec.cross);
    } else if (spec.type === 'blue-ensign') {
      fill(g, x, y, w, h, '#00247D');
      drawUnionJack(g, x, y, w * 0.48, h * 0.52);
      if (spec.variant === 'new-zealand') {
        drawStar(g, x + w * 0.69, y + h * 0.27, h * 0.09, h * 0.04, '#FFFFFF');
        drawStar(g, x + w * 0.69, y + h * 0.27, h * 0.06, h * 0.025, '#CC142B');
        drawStar(g, x + w * 0.82, y + h * 0.43, h * 0.08, h * 0.035, '#FFFFFF');
        drawStar(g, x + w * 0.82, y + h * 0.43, h * 0.055, h * 0.022, '#CC142B');
        drawStar(g, x + w * 0.66, y + h * 0.62, h * 0.08, h * 0.035, '#FFFFFF');
        drawStar(g, x + w * 0.66, y + h * 0.62, h * 0.055, h * 0.022, '#CC142B');
        drawStar(g, x + w * 0.84, y + h * 0.76, h * 0.07, h * 0.03, '#FFFFFF');
        drawStar(g, x + w * 0.84, y + h * 0.76, h * 0.048, h * 0.02, '#CC142B');
      } else {
        drawStar(g, x + w * 0.26, y + h * 0.74, h * 0.10, h * 0.045, '#FFFFFF');
        drawStar(g, x + w * 0.70, y + h * 0.28, h * 0.075, h * 0.035, '#FFFFFF');
        drawStar(g, x + w * 0.82, y + h * 0.43, h * 0.06, h * 0.028, '#FFFFFF');
        drawStar(g, x + w * 0.68, y + h * 0.62, h * 0.06, h * 0.028, '#FFFFFF');
        drawStar(g, x + w * 0.84, y + h * 0.76, h * 0.055, h * 0.025, '#FFFFFF');
      }
    } else if (spec.type === 'croatia') {
      drawHorizontalFlag(g, x, y, w, h, ['#FF0000', '#FFFFFF', '#171796']);
      drawCheckerShield(g, x + w * 0.5, y + h * 0.5, h * 0.26);
    } else if (spec.type === 'uruguay') {
      for (let i = 0; i < 9; i++) fill(g, x, y + i * h / 9, w, h / 9, i % 2 ? '#5CBFEB' : '#FFFFFF');
      fill(g, x, y, w * 0.36, h * 5 / 9, '#FFFFFF');
      drawSun(g, x + w * 0.18, y + h * 0.27, h * 0.08, '#FCD116');
    } else if (spec.type === 'morocco') {
      fill(g, x, y, w, h, '#C1272D');
      drawStar(g, x + w * 0.5, y + h * 0.5, h * 0.18, h * 0.075, '#006233');
    } else if (spec.type === 'senegal') {
      drawVerticalFlag(g, x, y, w, h, ['#00853F', '#FDEF42', '#E31B23']);
      drawStar(g, x + w * 0.5, y + h * 0.5, h * 0.13, h * 0.055, '#00853F');
    } else if (spec.type === 'ghana') {
      drawHorizontalFlag(g, x, y, w, h, ['#CE1126', '#FCD116', '#006B3F']);
      drawStar(g, x + w * 0.5, y + h * 0.5, h * 0.13, h * 0.055, '#111111');
    } else {
      drawHorizontalFlag(g, x, y, w, h, ['#FFFFFF', '#8b93c9', '#11163a']);
    }
    g.restore();
  }

  function fill(g, x, y, w, h, color) {
    g.fillStyle = color;
    g.fillRect(x, y, w, h);
  }
  function drawHorizontalFlag(g, x, y, w, h, colors, ratios) {
    const rs = ratios || colors.map(() => 1);
    const total = rs.reduce((a, b) => a + b, 0);
    let yy = y;
    colors.forEach((color, i) => {
      const hh = h * rs[i] / total;
      fill(g, x, yy, w, hh, color);
      yy += hh;
    });
  }
  function drawVerticalFlag(g, x, y, w, h, colors, ratios) {
    const rs = ratios || colors.map(() => 1);
    const total = rs.reduce((a, b) => a + b, 0);
    let xx = x;
    colors.forEach((color, i) => {
      const ww = w * rs[i] / total;
      fill(g, xx, y, ww, h, color);
      xx += ww;
    });
  }
  function drawCircle(g, cx, cy, r, color) {
    g.fillStyle = color;
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.fill();
  }
  function drawDiamond(g, cx, cy, w, h, color) {
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(cx, cy - h / 2);
    g.lineTo(cx + w / 2, cy);
    g.lineTo(cx, cy + h / 2);
    g.lineTo(cx - w / 2, cy);
    g.closePath();
    g.fill();
  }
  function drawStar(g, cx, cy, outer, inner, color, points = 5) {
    g.fillStyle = color;
    g.beginPath();
    for (let i = 0; i < points * 2; i++) {
      const r = i % 2 ? inner : outer;
      const a = -Math.PI / 2 + i * Math.PI / points;
      const px = cx + Math.cos(a) * r;
      const py = cy + Math.sin(a) * r;
      if (i) g.lineTo(px, py); else g.moveTo(px, py);
    }
    g.closePath();
    g.fill();
  }
  function drawSun(g, cx, cy, r, color) {
    for (let i = 0; i < 12; i++) {
      const a = i * Math.PI / 6;
      g.strokeStyle = color;
      g.lineWidth = Math.max(1, r * 0.18);
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * r * 1.2, cy + Math.sin(a) * r * 1.2);
      g.lineTo(cx + Math.cos(a) * r * 1.8, cy + Math.sin(a) * r * 1.8);
      g.stroke();
    }
    drawCircle(g, cx, cy, r, color);
  }
  function drawUnionJack(g, x, y, w, h) {
    fill(g, x, y, w, h, '#012169');
    drawDiagonalBand(g, x, y, w, h, '#FFFFFF', h * 0.22, 1);
    drawDiagonalBand(g, x, y, w, h, '#FFFFFF', h * 0.22, -1);
    drawDiagonalBand(g, x, y, w, h, '#C8102E', h * 0.10, 1);
    drawDiagonalBand(g, x, y, w, h, '#C8102E', h * 0.10, -1);
    fill(g, x + w * 0.42, y, w * 0.16, h, '#FFFFFF');
    fill(g, x, y + h * 0.38, w, h * 0.24, '#FFFFFF');
    fill(g, x + w * 0.46, y, w * 0.08, h, '#C8102E');
    fill(g, x, y + h * 0.44, w, h * 0.12, '#C8102E');
  }
  function drawDiagonalBand(g, x, y, w, h, color, thick, dir) {
    g.save();
    g.beginPath();
    g.rect(x, y, w, h);
    g.clip();
    g.translate(x + w / 2, y + h / 2);
    g.rotate(dir * Math.atan2(h, w));
    fill(g, -Math.hypot(w, h) / 2, -thick / 2, Math.hypot(w, h), thick, color);
    g.restore();
  }
  function drawTaegeuk(g, cx, cy, r) {
    g.fillStyle = '#CD2E3A';
    g.beginPath();
    g.arc(cx, cy, r, Math.PI, 0);
    g.arc(cx + r / 2, cy, r / 2, 0, Math.PI);
    g.arc(cx - r / 2, cy, r / 2, 0, Math.PI, true);
    g.fill();
    g.fillStyle = '#0047A0';
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI);
    g.arc(cx - r / 2, cy, r / 2, Math.PI, 0);
    g.arc(cx + r / 2, cy, r / 2, Math.PI, 0, true);
    g.fill();
  }
  function drawTrigrams(g, x, y, w, h) {
    g.fillStyle = '#111111';
    const bar = (cx, cy, rot) => {
      g.save();
      g.translate(cx, cy);
      g.rotate(rot);
      for (let i = -1; i <= 1; i++) g.fillRect(-w * 0.055, i * h * 0.04, w * 0.11, h * 0.014);
      g.restore();
    };
    bar(x + w * 0.25, y + h * 0.24, -0.7);
    bar(x + w * 0.75, y + h * 0.24, 0.7);
    bar(x + w * 0.25, y + h * 0.76, 0.7);
    bar(x + w * 0.75, y + h * 0.76, -0.7);
  }
  function drawCheckerShield(g, cx, cy, size) {
    const cell = size / 5;
    fill(g, cx - size / 2 - cell * 0.15, cy - size / 2 - cell * 0.15, size + cell * 0.3, size + cell * 0.3, '#FFFFFF');
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        fill(g, cx - size / 2 + c * cell, cy - size / 2 + r * cell, cell, cell, (r + c) % 2 ? '#FFFFFF' : '#FF0000');
      }
    }
  }
  function drawMapleLeaf(g, cx, cy, r, color) {
    g.fillStyle = color;
    g.beginPath();
    const pts = [
      [0, -1], [0.16, -0.48], [0.48, -0.65], [0.34, -0.26], [0.72, -0.22],
      [0.38, 0.02], [0.55, 0.44], [0.16, 0.32], [0.10, 0.78], [-0.10, 0.78],
      [-0.16, 0.32], [-0.55, 0.44], [-0.38, 0.02], [-0.72, -0.22], [-0.34, -0.26],
      [-0.48, -0.65], [-0.16, -0.48],
    ];
    pts.forEach(([px, py], i) => {
      const xx = cx + px * r;
      const yy = cy + py * r;
      if (i) g.lineTo(xx, yy); else g.moveTo(xx, yy);
    });
    g.closePath();
    g.fill();
  }

  function drawQr(g, url, x, y, size) {
    try {
      const modules = window.Goal2026Qr.make(url);
      window.Goal2026Qr.draw(g, modules, x, y, size);
    } catch (e) {
      g.fillStyle = '#ffffff';
      g.fillRect(x, y, size, size);
      drawCenteredFit(g, 'PLAY', x + size / 2, y + size / 2 - 12, size - 50, 32, '#07110b');
      drawCenteredFit(g, 'GOAL2026', x + size / 2, y + size / 2 + 32, size - 50, 18, '#07110b');
    }
  }

  function drawCenteredFit(g, text, x, y, maxWidth, fontSize, color) {
    let size = fontSize;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    do {
      g.font = `${size}px "Press Start 2P", monospace`;
      if (g.measureText(text).width <= maxWidth || size <= 12) break;
      size -= 2;
    } while (size > 12);
    g.fillStyle = color;
    g.fillText(text, x, y);
  }

  async function shareGeneratedImage() {
    if (!shareImageBlob && lastResult) shareImageBlob = await generateShareImageBlob(lastResult);
    if (!shareImageBlob) return;
    const file = new File([shareImageBlob], 'goal2026-match-card.png', { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: 'GOAL 2026' }); return; }
      catch (e) { /* fall through to download */ }
    }
    downloadShareImage();
  }

  function downloadShareImage() {
    if (!shareImageUrl) return;
    const a = document.createElement('a');
    a.href = shareImageUrl;
    a.download = 'goal2026-match-card.png';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function closeShareCard() {
    $('share-modal').classList.remove('show');
    $('share-modal').setAttribute('aria-hidden', 'true');
  }

  function clearShareImage() {
    closeShareCard();
    if (shareImageUrl) URL.revokeObjectURL(shareImageUrl);
    shareImageBlob = null;
    shareImageUrl = null;
    lastResult = null;
  }

  function downloadReplay() {
    if (!replayUrl) return;
    const a = document.createElement('a');
    a.href = replayUrl; a.download = 'goal2026.webm';
    document.body.appendChild(a); a.click(); a.remove();
  }

  // ----------------------------- utils -----------------------------------
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function short(name) { return name.length > 11 ? name.slice(0, 10) + '.' : name; }
  function resultLabel(result) {
    return result === 'win' ? 'YOU WIN' : result === 'draw' ? 'DRAW' : 'YOU LOSE';
  }
  function resultAccent(result) {
    return result === 'win' ? '#2ecc40' : result === 'draw' ? '#ffdc00' : '#ff4136';
  }

  // =========================== INPUT WIRING =============================
  function wire() {
    $('btn-play').addEventListener('click', () => { $('perm-status').textContent = ''; show('permission'); });
    $('btn-change-nation').addEventListener('click', () => { buildNationGrid(); show('nation'); });
    $('btn-start-match').addEventListener('click', () => { resumeAudio(); requestMedia(); });
    $('btn-practice').addEventListener('click', () => { usingMic = false; resumeAudio(); startMatch(); });
    $('btn-perm-back').addEventListener('click', () => { renderHome(); show('home'); });
    $('btn-exit').addEventListener('click', quitMatch);

    $('btn-next').addEventListener('click', () => { renderHome(); show('home'); $('btn-play').focus(); });
    $('btn-retry').addEventListener('click', () => { show('permission'); });
    $('btn-home').addEventListener('click', () => { renderHome(); show('home'); });
    $('btn-share').addEventListener('click', openShareCard);
    $('btn-download').addEventListener('click', downloadReplay);
    $('btn-close-share').addEventListener('click', closeShareCard);
    $('btn-share-image').addEventListener('click', shareGeneratedImage);
    $('btn-save-share-image').addEventListener('click', downloadShareImage);
    $('share-modal').addEventListener('click', (e) => {
      if (e.target === $('share-modal')) closeShareCard();
    });

    // practice fallback input: hold SPACE
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && $('share-modal').classList.contains('show')) closeShareCard();
      if (e.code === 'Space' && screen === 'match' && !usingMic) { practiceHeld = true; e.preventDefault(); }
    });
    window.addEventListener('keyup', (e) => { if (e.code === 'Space') practiceHeld = false; });
    // …or press the field
    const press = (v) => (e) => { if (screen === 'match' && !usingMic) { practiceHeld = v; e.preventDefault(); } };
    canvas.addEventListener('pointerdown', press(true));
    canvas.addEventListener('pointerup', press(false));
    canvas.addEventListener('pointerleave', press(false));
    canvas.addEventListener('pointercancel', press(false));
    window.addEventListener('blur', () => { practiceHeld = false; });
  }

  // ============================== BOOT =================================
  function boot() {
    wire();
    buildNationGrid();
    if (save.nation) { renderHome(); show('home'); }
    else show('nation');
  }
  boot();
})();
