class SoundManager {
  constructor() {
    this.ctx = null;
  }

  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
  }

  /**
   * Play a clean, woody click sound when a tile is discarded.
   */
  playDiscard() {
    this.init();
    if (!this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(150, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(80, this.ctx.currentTime + 0.08);

    gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.08);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.08);
  }

  /**
   * Play a soft rustling sound when drawing a tile.
   */
  playDraw() {
    this.init();
    if (!this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(400, this.ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(300, this.ctx.currentTime + 0.1);

    gain.gain.setValueAtTime(0.08, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.01, this.ctx.currentTime + 0.1);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.1);
  }

  /**
   * Play a bright slide-up chime for flower replacements.
   */
  playFlower() {
    this.init();
    if (!this.ctx) return;

    const time = this.ctx.currentTime;
    
    // Quick two-tone chime
    [523.25, 659.25].forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, time + idx * 0.08);
      
      gain.gain.setValueAtTime(0.15, time + idx * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.01, time + idx * 0.08 + 0.15);
      
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      
      osc.start(time + idx * 0.08);
      osc.stop(time + idx * 0.08 + 0.15);
    });
  }

  /**
   * Play an energetic synth ring for claims (Chow, Pung, Kong).
   */
  playAction() {
    this.init();
    if (!this.ctx) return;

    const time = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(587.33, time); // D5
    osc.frequency.setValueAtTime(880.00, time + 0.1); // A5

    gain.gain.setValueAtTime(0.05, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.3);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start();
    osc.stop(time + 0.3);
  }

  /**
   * Play a celebratory winning fanfare.
   */
  playHu() {
    this.init();
    if (!this.ctx) return;

    const time = this.ctx.currentTime;
    const notes = [
      { f: 523.25, d: 0.15 }, // C5
      { f: 659.25, d: 0.15 }, // E5
      { f: 783.99, d: 0.15 }, // G5
      { f: 1046.50, d: 0.4 }  // C6
    ];

    let currentOffset = 0;
    notes.forEach(note => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(note.f, time + currentOffset);

      gain.gain.setValueAtTime(0.2, time + currentOffset);
      gain.gain.exponentialRampToValueAtTime(0.01, time + currentOffset + note.d);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(time + currentOffset);
      osc.stop(time + currentOffset + note.d);

      currentOffset += note.d * 0.8;
    });
  }
}

export const soundManager = new SoundManager();
