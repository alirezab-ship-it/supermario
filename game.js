(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const overlay = document.getElementById('overlay');
  const overlayTitle = document.getElementById('overlay-title');
  const overlaySub = document.getElementById('overlay-sub');
  const overlayBtn = document.getElementById('overlay-btn');
  const startScreen = document.getElementById('start-screen');
  const startBtn = document.getElementById('start-btn');

  const VIEW_W = canvas.width;
  const VIEW_H = canvas.height;
  const GROUND_Y = 400;
  const GRAVITY = 0.34;
  const MOVE_SPEED = 2.6;
  const JUMP_VELOCITY = -12;
  const FRICTION = 0.8;
  const LEVEL_WIDTH = 4200;

  // ---- Audio (ElevenLabs-generated SFX) ---------------------------------
  const SOUND_FILES = {
    jump: 'sounds/jump.mp3',
    coin: 'sounds/coin.mp3',
    stomp: 'sounds/stomp.mp3',
    die: 'sounds/die.mp3',
    win: 'sounds/win.mp3',
    gameover: 'sounds/gameover.mp3',
  };
  const sounds = {};
  for (const [key, src] of Object.entries(SOUND_FILES)) {
    const a = new Audio(src);
    a.preload = 'auto';
    sounds[key] = a;
  }
  function playSound(key) {
    const base = sounds[key];
    if (!base) return;
    const node = base.cloneNode();
    node.volume = base.volume;
    node.play().catch(() => {});
  }

  // ---- Sprites (Gemini-generated pixel art) ------------------------------
  const IMAGE_FILES = {
    marioStand: 'sprites/mario_stand.png',
    marioWalk: 'sprites/mario_walk.png',
    marioJump: 'sprites/mario_jump.png',
    goomba: 'sprites/goomba.png',
    goombaSquash: 'sprites/goomba_squash.png',
    coin: 'sprites/coin.png',
    groundTile: 'sprites/ground_tile.png',
    platformTile: 'sprites/platform_tile.png',
    stairTile: 'sprites/stair_tile.png',
    flagpole: 'sprites/flagpole.png',
    cloud: 'sprites/cloud.png',
    bgHills: 'sprites/bg_hills.png',
  };
  const images = {};
  for (const [key, src] of Object.entries(IMAGE_FILES)) {
    const img = new Image();
    img.src = src;
    images[key] = img;
  }
  function imgReady(key) {
    const img = images[key];
    return img && img.complete && img.naturalWidth > 0;
  }
  const patternCache = {};
  function getPattern(key) {
    if (patternCache[key]) return patternCache[key];
    if (!imgReady(key)) return null;
    const pattern = ctx.createPattern(images[key], 'repeat');
    patternCache[key] = pattern;
    return pattern;
  }

  // ---- Level data -------------------------------------------------------
  // Pits: gaps in the ground. Falling into one costs a life.
  const pits = [
    { x: 760, w: 100 },
    { x: 1400, w: 100 },
    { x: 2620, w: 120 },
    { x: 3260, w: 90 },
  ];

  function groundSegments() {
    const sorted = [...pits].sort((a, b) => a.x - b.x);
    const segs = [];
    let cursor = 0;
    for (const p of sorted) {
      if (p.x > cursor) segs.push({ x: cursor, w: p.x - cursor });
      cursor = p.x + p.w;
    }
    if (cursor < LEVEL_WIDTH) segs.push({ x: cursor, w: LEVEL_WIDTH - cursor });
    return segs.map(s => ({ x: s.x, y: GROUND_Y, w: s.w, h: VIEW_H - GROUND_Y, type: 'ground' }));
  }

  const platforms = [
    { x: 300, y: 300, w: 120, h: 20, type: 'platform' },
    { x: 980, y: 250, w: 150, h: 20, type: 'platform' },
    { x: 1700, y: 320, w: 110, h: 20, type: 'platform' },
    { x: 1980, y: 260, w: 200, h: 20, type: 'platform' },
    { x: 2900, y: 260, w: 150, h: 20, type: 'platform' },
    { x: 3550, y: 300, w: 130, h: 20, type: 'platform' },
  ];

  // Ascending staircase before the flag.
  const stairs = [];
  for (let i = 0; i < 4; i++) {
    stairs.push({ x: 3900 + i * 40, y: GROUND_Y - (i + 1) * 40, w: 40, h: (i + 1) * 40 + (VIEW_H - GROUND_Y), type: 'stair' });
  }

  const FLAG_X = 4100;
  const flagpole = { x: FLAG_X, y: 200, w: 8, h: GROUND_Y - 200 };

  const coinDefs = [
    { x: 340, y: 260 }, { x: 380, y: 260 }, { x: 420, y: 260 },
    { x: 1010, y: 210 }, { x: 1050, y: 210 }, { x: 1090, y: 210 },
    { x: 600, y: 360 }, { x: 640, y: 360 },
    { x: 2020, y: 220 }, { x: 2060, y: 220 }, { x: 2100, y: 220 }, { x: 2140, y: 220 },
    { x: 2940, y: 220 }, { x: 2980, y: 220 },
    { x: 1740, y: 280 }, { x: 1770, y: 280 },
    { x: 3580, y: 260 }, { x: 3610, y: 260 },
    { x: 3960, y: GROUND_Y - 250 }, { x: 4000, y: GROUND_Y - 300 }, { x: 4040, y: GROUND_Y - 350 },
  ];

  const goombaDefs = [
    { x: 500, min: 420, max: 700 },
    { x: 1100, min: 940, max: 1350 },
    { x: 1950, min: 1550, max: 1950 },
    { x: 2450, min: 2260, max: 2560 },
    { x: 3050, min: 2800, max: 3200 },
    { x: 3500, min: 3350, max: 3700 },
  ];

  // ---- Entities -----------------------------------------------------------
  function makePlayer() {
    return {
      x: 40, y: GROUND_Y - 48, w: 30, h: 48,
      vx: 0, vy: 0,
      grounded: false,
      facing: 1,
      alive: true,
      invincibleTimer: 0,
      animTimer: 0,
      animFrame: 0,
    };
  }

  let player = makePlayer();
  let coins = [];
  let goombas = [];
  let solids = [];
  let score = 0;
  let lives = 3;
  let cameraX = 0;
  let elapsed = 0;
  let state = 'start'; // start | playing | won | dead | gameover
  let stateTimer = 0;

  function resetLevel() {
    coins = coinDefs.map(c => ({ ...c, r: 9, taken: false, bob: Math.random() * Math.PI * 2 }));
    goombas = goombaDefs.map(g => ({ x: g.x, y: GROUND_Y - 34, w: 32, h: 34, vx: -1.2, min: g.min, max: g.max, alive: true, squashTimer: 0 }));
    solids = [...groundSegments(), ...platforms, ...stairs];
  }

  function resetGame() {
    player = makePlayer();
    score = 0;
    lives = 3;
    elapsed = 0;
    state = 'playing';
    stateTimer = 0;
    resetLevel();
    hideOverlay();
  }

  // ---- Input ---------------------------------------------------------------
  const keys = {};
  window.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => { keys[e.code] = false; });

  overlayBtn.addEventListener('click', () => resetGame());
  startBtn.addEventListener('click', () => {
    startScreen.classList.add('hidden');
    state = 'playing';
  });

  function showOverlay(title, sub) {
    overlayTitle.textContent = title;
    overlaySub.textContent = sub;
    overlay.classList.remove('hidden');
  }
  function hideOverlay() { overlay.classList.add('hidden'); }

  // ---- Collision helpers -----------------------------------------------
  function aabb(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function moveAndCollide(entity, solidsList) {
    // Horizontal
    entity.x += entity.vx;
    for (const s of solidsList) {
      if (!aabb(entity, s)) continue;
      if (entity.vx > 0) entity.x = s.x - entity.w;
      else if (entity.vx < 0) entity.x = s.x + s.w;
      entity.vx = 0;
    }
    // Vertical
    entity.y += entity.vy;
    entity.grounded = false;
    for (const s of solidsList) {
      if (!aabb(entity, s)) continue;
      if (entity.vy > 0) {
        entity.y = s.y - entity.h;
        entity.vy = 0;
        entity.grounded = true;
      } else if (entity.vy < 0) {
        entity.y = s.y + s.h;
        entity.vy = 0;
      }
    }
  }

  function killPlayer() {
    if (!player.alive) return;
    playSound('die');
    lives -= 1;
    if (lives <= 0) {
      state = 'gameover';
      stateTimer = 0;
    } else {
      player.alive = false;
      state = 'dead';
      stateTimer = 0;
    }
  }

  // ---- Update ---------------------------------------------------------
  function updatePlayer() {
    if (keys['ArrowLeft'] || keys['KeyA']) {
      player.vx -= 0.55;
      player.facing = -1;
    }
    if (keys['ArrowRight'] || keys['KeyD']) {
      player.vx += 0.55;
      player.facing = 1;
    }
    player.vx *= FRICTION;
    if (Math.abs(player.vx) < 0.05) player.vx = 0;
    player.vx = Math.max(-MOVE_SPEED, Math.min(MOVE_SPEED, player.vx));

    if ((keys['Space'] || keys['ArrowUp'] || keys['KeyW']) && player.grounded) {
      player.vy = JUMP_VELOCITY;
      player.grounded = false;
      playSound('jump');
    }

    player.vy += GRAVITY;
    if (player.vy > 12) player.vy = 12;

    moveAndCollide(player, solids);

    if (player.x < 0) player.x = 0;
    if (player.x > LEVEL_WIDTH - player.w) player.x = LEVEL_WIDTH - player.w;

    if (Math.abs(player.vx) > 0.2) {
      player.animTimer++;
      if (player.animTimer > 6) {
        player.animTimer = 0;
        player.animFrame = (player.animFrame + 1) % 2;
      }
    } else {
      player.animFrame = 0;
    }

    // Fell into a pit or off the bottom of the world.
    if (player.y > VIEW_H + 100) {
      killPlayer();
    }

    // Reached the flag.
    if (player.x + player.w >= flagpole.x) {
      state = 'won';
      stateTimer = 0;
    }
  }

  function updateGoombas() {
    for (const g of goombas) {
      if (!g.alive) {
        g.squashTimer++;
        continue;
      }
      g.x += g.vx;
      if (g.x < g.min) { g.x = g.min; g.vx *= -1; }
      if (g.x + g.w > g.max) { g.x = g.max - g.w; g.vx *= -1; }

      if (player.alive && aabb(player, g)) {
        const playerBottom = player.y + player.h;
        const stompedFromAbove = player.vy > 0 && playerBottom - g.y < 16;
        if (stompedFromAbove) {
          g.alive = false;
          g.squashTimer = 0;
          player.vy = JUMP_VELOCITY * 0.6;
          score += 100;
          playSound('stomp');
        } else {
          killPlayer();
        }
      }
    }
  }

  function updateCoins() {
    for (const c of coins) {
      if (c.taken) continue;
      c.bob += 0.08;
      const cx = c.x, cy = c.y + Math.sin(c.bob) * 3;
      const box = { x: cx - c.r, y: cy - c.r, w: c.r * 2, h: c.r * 2 };
      if (aabb(player, box)) {
        c.taken = true;
        score += 10;
        playSound('coin');
      }
    }
  }

  function update() {
    if (state === 'start') {
      return; // waiting for the player to press Start
    } else if (state === 'playing') {
      elapsed += 1 / 60;
      updatePlayer();
      updateGoombas();
      updateCoins();
    } else if (state === 'dead') {
      stateTimer++;
      if (stateTimer > 60) {
        player = makePlayer();
        state = 'playing';
      }
    } else if (state === 'won') {
      stateTimer++;
      player.vx = 0;
      if (stateTimer === 1) {
        playSound('win');
        showOverlay('Level Complete!', `Score: ${score}  |  Time: ${elapsed.toFixed(1)}s`);
      }
    } else if (state === 'gameover') {
      stateTimer++;
      if (stateTimer === 1) {
        playSound('gameover');
        showOverlay('Game Over', `Score: ${score}`);
      }
    }

    cameraX = Math.max(0, Math.min(player.x - VIEW_W / 2, LEVEL_WIDTH - VIEW_W));
  }

  // ---- Rendering --------------------------------------------------------
  function drawBackground() {
    ctx.fillStyle = '#5c94fc';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    // Parallax hills (Gemini-generated tileable strip), falls back to
    // procedural humps if the image hasn't loaded yet.
    if (imgReady('bgHills')) {
      const img = images.bgHills;
      const hillH = 240;
      const hillW = hillH * (img.naturalWidth / img.naturalHeight);
      const hillOffset = -(cameraX * 0.3) % hillW;
      const count = Math.ceil(VIEW_W / hillW) + 2;
      for (let i = -1; i < count; i++) {
        ctx.drawImage(img, hillOffset + i * hillW, GROUND_Y - hillH + 40, hillW, hillH);
      }
    } else {
      ctx.fillStyle = '#3aa93a';
      const hillOffset = -(cameraX * 0.3) % 400;
      for (let i = -1; i < 4; i++) {
        const hx = hillOffset + i * 400;
        ctx.beginPath();
        ctx.arc(hx + 60, GROUND_Y + 20, 70, Math.PI, 0);
        ctx.fill();
      }
    }

    // Clouds
    const cloudOffset = -(cameraX * 0.5) % 500;
    for (let i = -1; i < 5; i++) {
      const cx = cloudOffset + i * 500 + 100;
      const cy = 70 + (i % 2) * 30;
      drawCloud(cx, cy);
    }
  }

  function drawCloud(x, y) {
    if (imgReady('cloud')) {
      const img = images.cloud;
      const w = 70;
      const h = w * (img.naturalHeight / img.naturalWidth);
      ctx.drawImage(img, x - w / 2, y - h / 2, w, h);
      return;
    }
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x, y, 18, 0, Math.PI * 2);
    ctx.arc(x + 20, y - 8, 20, 0, Math.PI * 2);
    ctx.arc(x + 42, y, 18, 0, Math.PI * 2);
    ctx.fill();
  }

  function fillWithPattern(patternKey, fallbackColor, sx, y, w, h) {
    const pattern = getPattern(patternKey);
    if (pattern) {
      // Anchor the tile's top-left to this shape's own world position so the
      // pattern doesn't "swim" relative to the world as the camera scrolls,
      // and so each ground/platform's top edge always shows the tile's top.
      if (pattern.setTransform) pattern.setTransform(new DOMMatrix().translate(sx, y));
      ctx.fillStyle = pattern;
    } else {
      ctx.fillStyle = fallbackColor;
    }
    // Nearest-neighbor sampling avoids a thin seam where the canvas would
    // otherwise blend each tile's edge pixels with the next repeat.
    const prevSmoothing = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    ctx.fillRect(Math.round(sx), Math.round(y), Math.round(w), Math.round(h));
    ctx.imageSmoothingEnabled = prevSmoothing;
  }

  function drawSolids() {
    for (const s of solids) {
      const sx = s.x - cameraX;
      if (sx + s.w < 0 || sx > VIEW_W) continue;
      if (s.type === 'ground') {
        fillWithPattern('groundTile', '#8b5a2b', sx, s.y, s.w, s.h);
      } else if (s.type === 'platform') {
        fillWithPattern('platformTile', '#c97a3d', sx, s.y, s.w, s.h);
      } else if (s.type === 'stair') {
        fillWithPattern('stairTile', '#9c7a4c', sx, s.y, s.w, s.h);
      }
    }
  }

  const FLAG_POLE_FRAC = 0.154; // pole's x-position as a fraction of the sprite's width

  function drawFlag() {
    const fx = flagpole.x - cameraX;
    if (fx < -80 || fx > VIEW_W + 80) return;

    if (imgReady('flagpole')) {
      const img = images.flagpole;
      const h = GROUND_Y - flagpole.y + 6;
      const w = h * (img.naturalWidth / img.naturalHeight);
      ctx.save();
      if (state === 'won') {
        ctx.shadowColor = '#ffd700';
        ctx.shadowBlur = 20;
      }
      ctx.drawImage(img, fx - w * FLAG_POLE_FRAC, flagpole.y, w, h);
      ctx.restore();
      return;
    }

    ctx.fillStyle = '#c9c9c9';
    ctx.fillRect(fx, flagpole.y, flagpole.w, flagpole.h);
    ctx.beginPath();
    ctx.moveTo(fx + flagpole.w, flagpole.y + 6);
    ctx.lineTo(fx + flagpole.w + 26, flagpole.y + 16);
    ctx.lineTo(fx + flagpole.w, flagpole.y + 26);
    ctx.closePath();
    ctx.fillStyle = state === 'won' ? '#ffd700' : '#2ecc71';
    ctx.fill();
    ctx.fillStyle = '#555';
    ctx.fillRect(fx - 6, GROUND_Y - 6, flagpole.w + 12, 6);
  }

  // Draws an image preserving its aspect ratio, scaled to targetHeight,
  // horizontally centered at footX and bottom-aligned at footY (so sprites
  // whose art extends above/beside the entity's hitbox still plant their
  // feet on the ground correctly). Optionally flips horizontally.
  function drawSpriteCentered(img, footX, footY, targetHeight, flip) {
    const scale = targetHeight / img.naturalHeight;
    const w = img.naturalWidth * scale;
    const h = targetHeight;
    ctx.save();
    ctx.translate(footX, 0);
    ctx.scale(flip ? -1 : 1, 1);
    ctx.drawImage(img, -w / 2, footY - h, w, h);
    ctx.restore();
  }

  function drawCoins() {
    for (const c of coins) {
      if (c.taken) continue;
      const cx = c.x - cameraX;
      if (cx < -20 || cx > VIEW_W + 20) continue;
      const cy = c.y + Math.sin(c.bob) * 3;
      const squish = Math.abs(Math.cos(c.bob));
      if (imgReady('coin')) {
        const img = images.coin;
        const size = c.r * 3;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(squish + 0.15, 1);
        ctx.drawImage(img, -size / 2, -size / 2, size, size);
        ctx.restore();
      } else {
        ctx.fillStyle = '#ffd700';
        ctx.beginPath();
        ctx.ellipse(cx, cy, c.r * squish + 1, c.r, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#c99b00';
        ctx.stroke();
      }
    }
  }

  function drawGoombas() {
    for (const g of goombas) {
      const gx = g.x - cameraX;
      if (gx + g.w < 0 || gx > VIEW_W) continue;
      if (!g.alive) {
        if (g.squashTimer > 20) continue;
        if (imgReady('goombaSquash')) {
          drawSpriteCentered(images.goombaSquash, gx + g.w / 2, g.y + g.h, g.h * 0.55, false);
        } else {
          ctx.fillStyle = '#7b4a2d';
          ctx.fillRect(gx, g.y + g.h - 10, g.w, 10);
        }
        continue;
      }
      if (imgReady('goomba')) {
        // The sprite faces left by default; flip it when moving right.
        drawSpriteCentered(images.goomba, gx + g.w / 2, g.y + g.h, g.h * 1.35, g.vx > 0);
      } else {
        ctx.fillStyle = '#8b5a2b';
        ctx.beginPath();
        ctx.ellipse(gx + g.w / 2, g.y + g.h / 2 + 4, g.w / 2, g.h / 2 - 2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#4a2e15';
        ctx.fillRect(gx + 4, g.y + g.h - 8, 8, 8);
        ctx.fillRect(gx + g.w - 12, g.y + g.h - 8, 8, 8);
        ctx.fillStyle = 'white';
        ctx.fillRect(gx + 6, g.y + 10, 6, 6);
        ctx.fillRect(gx + g.w - 12, g.y + 10, 6, 6);
        ctx.fillStyle = 'black';
        ctx.fillRect(gx + 8, g.y + 12, 3, 3);
        ctx.fillRect(gx + g.w - 10, g.y + 12, 3, 3);
      }
    }
  }

  function drawPlayer() {
    if (!player.alive) return;
    const px = player.x - cameraX;
    const py = player.y;
    const w = player.w, h = player.h;

    const jumping = !player.grounded;
    const walking = !jumping && Math.abs(player.vx) > 0.2;
    const spriteKey = jumping ? 'marioJump' : (walking && player.animFrame === 1 ? 'marioWalk' : 'marioStand');

    if (imgReady(spriteKey)) {
      drawSpriteCentered(images[spriteKey], px + w / 2, py + h, h * 1.6, player.facing < 0);
      return;
    }

    // Fallback flat-shape drawing while sprites are still loading.
    const legOffset = player.animFrame === 1 ? 4 : 0;
    ctx.save();
    ctx.translate(px + w / 2, 0);
    ctx.scale(player.facing, 1);
    ctx.translate(-w / 2, 0);

    ctx.fillStyle = '#2255cc';
    ctx.fillRect(4, py + h - 14, 10, 14 - legOffset);
    ctx.fillRect(w - 14, py + h - 14, 10, 14 - (legOffset ? 0 : 4));
    ctx.fillStyle = '#e52521';
    ctx.fillRect(2, py + 18, w - 4, h - 30);
    ctx.fillStyle = '#2255cc';
    ctx.fillRect(6, py + 24, w - 12, h - 38);
    ctx.fillStyle = '#f2c29a';
    ctx.fillRect(4, py + 4, w - 8, 16);
    ctx.fillStyle = '#e52521';
    ctx.fillRect(2, py, w - 4, 8);
    ctx.fillRect(w - 10, py + 6, 12, 6);
    ctx.fillStyle = '#222';
    ctx.fillRect(w - 12, py + 10, 3, 3);
    ctx.fillStyle = '#e52521';
    ctx.fillRect(-2, py + 20, 6, 12);
    ctx.fillRect(w - 4, py + 20, 6, 12);

    ctx.restore();
  }

  function drawHUD() {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, 0, VIEW_W, 34);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 16px "Trebuchet MS", sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText(`SCORE  ${score}`, 16, 18);
    ctx.fillText(`LIVES  ${Math.max(lives, 0)}`, 200, 18);
    ctx.fillText(`TIME  ${elapsed.toFixed(1)}s`, 340, 18);
    ctx.fillText(`COINS  ${coins.filter(c => c.taken).length}/${coins.length}`, 520, 18);
  }

  function render() {
    drawBackground();
    drawSolids();
    drawFlag();
    drawCoins();
    drawGoombas();
    drawPlayer();
    drawHUD();
  }

  // Fixed 60Hz timestep so gameplay speed doesn't depend on the display's
  // refresh rate (requestAnimationFrame fires once per monitor refresh,
  // which is 90/120/144Hz on many screens, not always 60Hz).
  const STEP_MS = 1000 / 60;
  const MAX_STEPS_PER_FRAME = 5;
  let lastTime = null;
  let accumulator = 0;

  function loop(now) {
    if (lastTime === null) lastTime = now;
    accumulator += Math.min(now - lastTime, 250);
    lastTime = now;

    let steps = 0;
    while (accumulator >= STEP_MS && steps < MAX_STEPS_PER_FRAME) {
      update();
      accumulator -= STEP_MS;
      steps++;
    }

    render();
    requestAnimationFrame(loop);
  }

  resetLevel();
  requestAnimationFrame(loop);
})();
