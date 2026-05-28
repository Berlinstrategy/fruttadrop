// ============================================================
// FruttaDrop — Suika-style merge game
// ============================================================

const W = 400;
const H = 700;
const DROP_Y = 70;
const DANGER_Y = 130;
const WALL = 6;

const TIERS = [
  { name: 'Ciliegia',  emoji: '🍒', radius: 18, color: 0xff3b3b, score: 1 },
  { name: 'Fragola',   emoji: '🍓', radius: 22, color: 0xff5577, score: 3 },
  { name: 'Uva',       emoji: '🍇', radius: 28, color: 0x9b59b6, score: 6 },
  { name: 'Arancia',   emoji: '🍊', radius: 34, color: 0xff8c1a, score: 10 },
  { name: 'Limone',    emoji: '🍋', radius: 40, color: 0xffe14a, score: 15 },
  { name: 'Mela',      emoji: '🍎', radius: 48, color: 0xe74c3c, score: 21 },
  { name: 'Pera',      emoji: '🍐', radius: 55, color: 0xa3d977, score: 28 },
  { name: 'Pesca',     emoji: '🍑', radius: 64, color: 0xffb085, score: 36 },
  { name: 'Ananas',    emoji: '🍍', radius: 72, color: 0xffd34a, score: 45 },
  { name: 'Melone',    emoji: '🍈', radius: 82, color: 0xc8d96f, score: 55 },
  { name: 'Anguria',   emoji: '🍉', radius: 92, color: 0x2ecc71, score: 100 }
];

const SPAWNABLE_TIERS = 5; // only first 5 tiers can be spawned

// ============================================================
// Scene
// ============================================================
class GameScene extends Phaser.Scene {
  constructor() { super('Game'); }

  create() {
    this.fruits = [];
    this.score = 0;
    this.highScore = parseInt(localStorage.getItem('fruttadrop_hi') || '0', 10);
    this.gameOver = false;
    this.dangerTimer = 0;
    this.canDrop = true;
    this.audioCtx = null;
    this.maxTierReached = 0;

    this.buildTextures();
    this.drawBackground();
    this.drawWalls();
    this.drawHUD();
    this.setupInput();
    this.setupCollisions();

    this.currentTier = this.randomSpawnTier();
    this.nextTier = this.randomSpawnTier();
    this.makePreview();
    this.updateNextPanel();

    // Soft entry tween
    this.cameras.main.fadeIn(400, 26, 26, 46);
  }

  // ----------------------------------------------------------
  // Textures
  // ----------------------------------------------------------
  buildTextures() {
    TIERS.forEach((tier, i) => {
      const r = tier.radius;
      const pad = 4;
      const size = (r + pad) * 2;
      const cx = size / 2;
      const g = this.make.graphics({ x: 0, y: 0, add: false });

      // soft drop shadow
      g.fillStyle(0x000000, 0.22);
      g.fillCircle(cx, cx + 3, r);

      // main body
      g.fillStyle(tier.color, 1);
      g.fillCircle(cx, cx, r);

      // inner sheen
      g.fillStyle(0xffffff, 0.28);
      g.fillCircle(cx - r * 0.32, cx - r * 0.32, r * 0.42);

      // rim
      g.lineStyle(2, 0x000000, 0.2);
      g.strokeCircle(cx, cx, r);

      g.generateTexture(`fruit_${i}`, size, size);
      g.destroy();
    });

    // particle texture
    const pg = this.make.graphics({ x: 0, y: 0, add: false });
    pg.fillStyle(0xffffff, 1);
    pg.fillCircle(6, 6, 5);
    pg.generateTexture('particle', 12, 12);
    pg.destroy();
  }

  // ----------------------------------------------------------
  // Background + walls
  // ----------------------------------------------------------
  drawBackground() {
    // Soft gradient bg via two rects
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x2c2c54, 0x2c2c54, 0x40407a, 0x40407a, 1);
    bg.fillRect(0, 0, W, H);

    // Play area
    const area = this.add.graphics();
    area.fillStyle(0xfff5e1, 1);
    area.fillRoundedRect(WALL, DROP_Y - 10, W - WALL * 2, H - DROP_Y + 10 - WALL, 14);

    // Danger line
    this.dangerLine = this.add.graphics();
    this.redrawDangerLine(0);
  }

  redrawDangerLine(alpha) {
    this.dangerLine.clear();
    const intensity = Phaser.Math.Clamp(alpha, 0, 1);
    this.dangerLine.lineStyle(2, 0xff3344, 0.35 + 0.55 * intensity);
    this.dangerLine.beginPath();
    this.dangerLine.moveTo(WALL + 6, DANGER_Y);
    this.dangerLine.lineTo(W - WALL - 6, DANGER_Y);
    this.dangerLine.strokePath();
    // small dashed effect via dots
    this.dangerLine.fillStyle(0xff3344, 0.4 + 0.5 * intensity);
    for (let x = WALL + 12; x < W - WALL; x += 14) {
      this.dangerLine.fillCircle(x, DANGER_Y, 1.5);
    }
  }

  drawWalls() {
    // Matter walls
    const opts = { isStatic: true, restitution: 0.1, friction: 0.4, render: { visible: false } };
    this.matter.add.rectangle(W / 2, H - WALL / 2, W, WALL, opts);             // floor
    this.matter.add.rectangle(WALL / 2, H / 2, WALL, H, opts);                  // left
    this.matter.add.rectangle(W - WALL / 2, H / 2, WALL, H, opts);              // right
    // Top is open for spawning
  }

  // ----------------------------------------------------------
  // HUD
  // ----------------------------------------------------------
  drawHUD() {
    // Top bar background
    const top = this.add.graphics();
    top.fillStyle(0x1a1a2e, 0.7);
    top.fillRect(0, 0, W, DROP_Y - 10);

    // Score label
    this.add.text(14, 8, 'PUNTI', {
      fontSize: '11px', fontStyle: 'bold', color: '#ffd34a',
      fontFamily: 'system-ui, sans-serif'
    });
    this.scoreText = this.add.text(14, 22, '0', {
      fontSize: '28px', fontStyle: 'bold', color: '#ffffff',
      fontFamily: 'system-ui, sans-serif'
    });

    // High score
    this.add.text(W - 14, 8, 'RECORD', {
      fontSize: '11px', fontStyle: 'bold', color: '#ffd34a',
      fontFamily: 'system-ui, sans-serif'
    }).setOrigin(1, 0);
    this.highScoreText = this.add.text(W - 14, 22, String(this.highScore), {
      fontSize: '20px', fontStyle: 'bold', color: '#ffffff',
      fontFamily: 'system-ui, sans-serif'
    }).setOrigin(1, 0);

    // Next panel
    this.nextPanelBg = this.add.graphics();
    this.nextPanelBg.fillStyle(0x000000, 0.25);
    this.nextPanelBg.fillRoundedRect(W / 2 - 32, 6, 64, 50, 8);

    this.add.text(W / 2, 12, 'PROSSIMO', {
      fontSize: '9px', fontStyle: 'bold', color: '#ffd34a',
      fontFamily: 'system-ui, sans-serif'
    }).setOrigin(0.5, 0);

    this.nextIcon = this.add.image(W / 2, 40, 'fruit_0').setScale(0.5);
    this.nextEmoji = this.add.text(W / 2, 40, '🍒', {
      fontSize: '18px',
      fontFamily: 'Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, sans-serif'
    }).setOrigin(0.5);
  }

  updateScore(delta) {
    this.score += delta;
    this.scoreText.setText(String(this.score));
    if (this.score > this.highScore) {
      this.highScore = this.score;
      this.highScoreText.setText(String(this.highScore));
      localStorage.setItem('fruttadrop_hi', String(this.highScore));
    }
    // little pop
    this.tweens.add({
      targets: this.scoreText,
      scale: { from: 1.15, to: 1 },
      duration: 200,
      ease: 'Back.Out'
    });
  }

  updateNextPanel() {
    const tier = TIERS[this.nextTier];
    this.nextIcon.setTexture(`fruit_${this.nextTier}`);
    const targetScale = 36 / ((tier.radius + 4) * 2);
    this.nextIcon.setScale(targetScale);
    this.nextEmoji.setText(tier.emoji);
    this.nextEmoji.setFontSize(Math.max(16, Math.floor(tier.radius * 0.9)));
  }

  // ----------------------------------------------------------
  // Preview (the floating fruit at top following pointer)
  // ----------------------------------------------------------
  makePreview() {
    this.previewSprite = this.add.image(W / 2, DROP_Y, `fruit_${this.currentTier}`)
      .setAlpha(0.85);
    this.previewEmoji = this.add.text(W / 2, DROP_Y, TIERS[this.currentTier].emoji, {
      fontSize: `${Math.floor(TIERS[this.currentTier].radius * 1.05)}px`,
      fontFamily: 'Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, sans-serif'
    }).setOrigin(0.5).setAlpha(0.85);
    this.dropX = W / 2;
  }

  updatePreview() {
    const tier = TIERS[this.currentTier];
    this.previewSprite.setTexture(`fruit_${this.currentTier}`);
    this.previewEmoji.setText(tier.emoji);
    this.previewEmoji.setFontSize(Math.floor(tier.radius * 1.05));
    this.previewSprite.setAlpha(0.85);
    this.previewEmoji.setAlpha(0.85);
  }

  movePreview(x) {
    const tier = TIERS[this.currentTier];
    const minX = WALL + tier.radius + 2;
    const maxX = W - WALL - tier.radius - 2;
    this.dropX = Phaser.Math.Clamp(x, minX, maxX);
    this.previewSprite.x = this.dropX;
    this.previewEmoji.x = this.dropX;
  }

  // ----------------------------------------------------------
  // Input
  // ----------------------------------------------------------
  setupInput() {
    this.input.on('pointermove', (p) => {
      if (this.gameOver) return;
      this.movePreview(p.worldX);
    });
    this.input.on('pointerdown', (p) => {
      if (this.gameOver) return;
      this.movePreview(p.worldX);
      if (this.canDrop) this.dropFruit();
    });
  }

  // ----------------------------------------------------------
  // Spawn / drop
  // ----------------------------------------------------------
  randomSpawnTier() {
    // weighted toward smaller fruits
    const weights = [40, 30, 20, 8, 4];
    const total = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i];
      if (r <= 0) return i;
    }
    return 0;
  }

  dropFruit() {
    this.canDrop = false;
    this.previewSprite.setAlpha(0);
    this.previewEmoji.setAlpha(0);
    this.spawnFruit(this.dropX, DROP_Y, this.currentTier);
    this.currentTier = this.nextTier;
    this.nextTier = this.randomSpawnTier();
    this.updatePreview();
    this.updateNextPanel();
    this.time.delayedCall(450, () => {
      this.canDrop = true;
      if (!this.gameOver) {
        this.previewSprite.setAlpha(0.85);
        this.previewEmoji.setAlpha(0.85);
      }
    });
  }

  spawnFruit(x, y, tierIdx) {
    const tier = TIERS[tierIdx];
    const sprite = this.matter.add.sprite(x, y, `fruit_${tierIdx}`, null, {
      shape: { type: 'circle', radius: tier.radius },
      restitution: 0.15,
      friction: 0.35,
      frictionAir: 0.005,
      density: 0.0015,
      label: `fruit_${tierIdx}`
    });
    sprite.setData('tier', tierIdx);
    sprite.setData('merged', false);
    sprite.setData('birthTime', this.time.now);

    const emoji = this.add.text(x, y, tier.emoji, {
      fontSize: `${Math.floor(tier.radius * 1.05)}px`,
      fontFamily: 'Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, sans-serif'
    }).setOrigin(0.5);

    this.fruits.push({ sprite, emoji, tierIdx });

    // pop in
    sprite.setScale(0.7);
    emoji.setScale(0.7);
    this.tweens.add({
      targets: [sprite, emoji],
      scale: 1,
      duration: 180,
      ease: 'Back.Out'
    });

    if (tierIdx > this.maxTierReached) this.maxTierReached = tierIdx;
    return sprite;
  }

  removeFruit(sprite) {
    const idx = this.fruits.findIndex(f => f.sprite === sprite);
    if (idx >= 0) {
      this.fruits[idx].emoji.destroy();
      this.fruits.splice(idx, 1);
    }
    if (sprite && sprite.body) sprite.destroy();
  }

  // ----------------------------------------------------------
  // Collisions / merging
  // ----------------------------------------------------------
  setupCollisions() {
    this.matter.world.on('collisionstart', (event) => {
      if (this.gameOver) return;
      event.pairs.forEach(pair => {
        const a = pair.bodyA;
        const b = pair.bodyB;
        if (!a.gameObject || !b.gameObject) return;
        const sa = a.gameObject;
        const sb = b.gameObject;
        if (!sa.getData || !sb.getData) return;
        if (sa.getData('merged') || sb.getData('merged')) return;
        const ta = sa.getData('tier');
        const tb = sb.getData('tier');
        if (ta === undefined || tb === undefined) return;
        if (ta === tb && ta < TIERS.length - 1) {
          sa.setData('merged', true);
          sb.setData('merged', true);
          const mx = (sa.x + sb.x) / 2;
          const my = (sa.y + sb.y) / 2;
          this.mergeFruits(sa, sb, mx, my, ta + 1);
        } else if (ta === tb && ta === TIERS.length - 1) {
          // Two watermelons! Special celebration
          sa.setData('merged', true);
          sb.setData('merged', true);
          const mx = (sa.x + sb.x) / 2;
          const my = (sa.y + sb.y) / 2;
          this.removeFruit(sa);
          this.removeFruit(sb);
          this.updateScore(500);
          this.spawnParticles(mx, my, 0x2ecc71, 24);
          this.playMergeSound(TIERS.length);
          this.flashScreen(0x2ecc71);
        }
      });
    });
  }

  mergeFruits(spriteA, spriteB, x, y, newTier) {
    this.updateScore(TIERS[newTier].score);
    this.spawnParticles(x, y, TIERS[newTier].color, 10);
    this.playMergeSound(newTier);
    this.removeFruit(spriteA);
    this.removeFruit(spriteB);
    this.spawnFruit(x, y, newTier);
    // tiny screen pulse
    this.cameras.main.shake(60, 0.0015);
  }

  // ----------------------------------------------------------
  // Particles
  // ----------------------------------------------------------
  spawnParticles(x, y, color, count = 8) {
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 / count) * i + Math.random() * 0.3;
      const dist = 30 + Math.random() * 30;
      const dx = Math.cos(angle) * dist;
      const dy = Math.sin(angle) * dist;
      const p = this.add.image(x, y, 'particle').setTint(color).setScale(0.6);
      this.tweens.add({
        targets: p,
        x: x + dx,
        y: y + dy,
        scale: 0,
        alpha: 0,
        duration: 500 + Math.random() * 200,
        ease: 'Cubic.easeOut',
        onComplete: () => p.destroy()
      });
    }
  }

  flashScreen(color) {
    const overlay = this.add.rectangle(W / 2, H / 2, W, H, color, 0.3);
    this.tweens.add({
      targets: overlay,
      alpha: 0,
      duration: 400,
      onComplete: () => overlay.destroy()
    });
  }

  // ----------------------------------------------------------
  // Sound (Web Audio, procedural)
  // ----------------------------------------------------------
  playMergeSound(tier) {
    try {
      if (!this.audioCtx) {
        this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      const ctx = this.audioCtx;
      const t = ctx.currentTime;
      const baseFreq = 220 + tier * 50;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(baseFreq, t);
      osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.6, t + 0.12);
      gain.gain.setValueAtTime(0.18, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.4);
    } catch (e) {}
  }

  playGameOverSound() {
    try {
      if (!this.audioCtx) this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const ctx = this.audioCtx;
      const t = ctx.currentTime;
      [440, 330, 220].forEach((f, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = f;
        gain.gain.setValueAtTime(0.15, t + i * 0.15);
        gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.15 + 0.3);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t + i * 0.15);
        osc.stop(t + i * 0.15 + 0.35);
      });
    } catch (e) {}
  }

  // ----------------------------------------------------------
  // Update loop
  // ----------------------------------------------------------
  update(time, delta) {
    // sync emoji positions
    this.fruits.forEach(f => {
      if (f.sprite && f.sprite.body) {
        f.emoji.x = f.sprite.x;
        f.emoji.y = f.sprite.y;
        f.emoji.rotation = f.sprite.rotation;
      }
    });

    if (this.gameOver) return;

    // danger detection: any resting fruit above danger line
    let danger = false;
    for (const f of this.fruits) {
      if (!f.sprite.body) continue;
      const age = time - (f.sprite.getData('birthTime') || 0);
      if (age < 1200) continue; // grace period
      const r = TIERS[f.tierIdx].radius;
      const v = f.sprite.body.velocity;
      if (f.sprite.y - r < DANGER_Y && Math.abs(v.y) < 1.2 && Math.abs(v.x) < 1.2) {
        danger = true;
        break;
      }
    }

    if (danger) {
      this.dangerTimer += delta;
    } else {
      this.dangerTimer = Math.max(0, this.dangerTimer - delta * 1.5);
    }

    const dangerAlpha = Phaser.Math.Clamp(this.dangerTimer / 2200, 0, 1);
    this.redrawDangerLine(dangerAlpha);

    if (this.dangerTimer > 2200) this.triggerGameOver();
  }

  // ----------------------------------------------------------
  // Game over
  // ----------------------------------------------------------
  triggerGameOver() {
    this.gameOver = true;
    this.canDrop = false;
    this.previewSprite.setAlpha(0);
    this.previewEmoji.setAlpha(0);
    this.playGameOverSound();
    this.cameras.main.shake(300, 0.01);

    // Overlay
    const dim = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.65).setDepth(10);
    const panel = this.add.graphics().setDepth(11);
    panel.fillStyle(0x1a1a2e, 0.95);
    panel.fillRoundedRect(40, 200, W - 80, 320, 18);
    panel.lineStyle(3, 0xffd34a, 1);
    panel.strokeRoundedRect(40, 200, W - 80, 320, 18);

    const title = this.add.text(W / 2, 230, 'FINE PARTITA', {
      fontSize: '26px', fontStyle: 'bold', color: '#ffd34a',
      fontFamily: 'system-ui, sans-serif'
    }).setOrigin(0.5).setDepth(12);

    const scoreLabel = this.add.text(W / 2, 280, 'PUNTEGGIO', {
      fontSize: '13px', color: '#ffffff', fontFamily: 'system-ui, sans-serif'
    }).setOrigin(0.5).setDepth(12);

    const scoreBig = this.add.text(W / 2, 318, String(this.score), {
      fontSize: '54px', fontStyle: 'bold', color: '#ffffff',
      fontFamily: 'system-ui, sans-serif'
    }).setOrigin(0.5).setDepth(12);

    let hiMsg = `Record: ${this.highScore}`;
    if (this.score >= this.highScore && this.score > 0) hiMsg = '✨ NUOVO RECORD! ✨';
    this.add.text(W / 2, 360, hiMsg, {
      fontSize: '14px', color: '#ffd34a', fontFamily: 'system-ui, sans-serif',
      fontStyle: this.score >= this.highScore ? 'bold' : 'normal'
    }).setOrigin(0.5).setDepth(12);

    // Buttons
    const playAgain = this.makeButton(W / 2, 420, 220, 50, 'GIOCA ANCORA', 0xffd34a, 0x1a1a2e, () => {
      this.scene.restart();
    });
    playAgain.forEach(o => o.setDepth(12));

    const share = this.makeButton(W / 2, 482, 220, 44, '📤 CONDIVIDI', 0x2ecc71, 0xffffff, () => {
      this.shareScore();
    });
    share.forEach(o => o.setDepth(12));

    [dim, title, scoreLabel, scoreBig, panel].forEach(o => {
      o.setAlpha(0);
      this.tweens.add({ targets: o, alpha: o === dim ? 0.65 : 1, duration: 300 });
    });
  }

  makeButton(x, y, w, h, label, bgColor, txtColor, onClick) {
    const btn = this.add.graphics();
    btn.fillStyle(bgColor, 1);
    btn.fillRoundedRect(x - w / 2, y - h / 2, w, h, 12);
    btn.lineStyle(2, 0x000000, 0.2);
    btn.strokeRoundedRect(x - w / 2, y - h / 2, w, h, 12);

    const text = this.add.text(x, y, label, {
      fontSize: '17px', fontStyle: 'bold',
      color: Phaser.Display.Color.IntegerToColor(txtColor).rgba,
      fontFamily: 'system-ui, sans-serif'
    }).setOrigin(0.5);

    const hit = this.add.rectangle(x, y, w, h, 0xffffff, 0)
      .setInteractive({ useHandCursor: true });
    hit.on('pointerdown', () => {
      this.tweens.add({
        targets: [btn, text],
        scaleX: 0.95, scaleY: 0.95, duration: 80, yoyo: true,
        onComplete: onClick
      });
    });
    return [btn, text, hit];
  }

  shareScore() {
    const text = `🍉 Ho fatto ${this.score} punti su FruttaDrop! Ce la fai a battermi?`;
    const url = window.location.href;
    if (navigator.share) {
      navigator.share({ title: 'FruttaDrop', text, url }).catch(() => {});
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(`${text}\n${url}`).then(() => {
        const toast = this.add.text(W / 2, H - 100, 'Copiato negli appunti!', {
          fontSize: '14px', color: '#ffffff', backgroundColor: '#2ecc71',
          padding: { x: 14, y: 8 }, fontFamily: 'system-ui, sans-serif'
        }).setOrigin(0.5).setDepth(20);
        this.tweens.add({
          targets: toast, alpha: 0, duration: 2000, delay: 1500,
          onComplete: () => toast.destroy()
        });
      });
    }
  }
}

// ============================================================
// Phaser config
// ============================================================
const config = {
  type: Phaser.AUTO,
  parent: 'game',
  width: W,
  height: H,
  backgroundColor: '#1a1a2e',
  physics: {
    default: 'matter',
    matter: {
      gravity: { y: 1.0 },
      enableSleeping: true,
      debug: false
    }
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH
  },
  scene: [GameScene]
};

new Phaser.Game(config);
