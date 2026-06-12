/* ===============================================
   mc-cond.js  —  Conditioning Timer Engine
   Shared logic used by conditioning-timer.html
   and any future conditioning program pages.
   =============================================== */

'use strict';

/* ── Interval‑timer core ─────────────────────────────────────── */
class CondTimer {
  constructor(opts = {}) {
    this.workSec   = opts.workSec   ?? 40;
    this.restSec   = opts.restSec   ?? 20;
    this.rounds    = opts.rounds    ?? 8;
    this.onTick    = opts.onTick    ?? (() => {});
    this.onPhase   = opts.onPhase   ?? (() => {});
    this.onDone    = opts.onDone    ?? (() => {});

    this._round    = 0;
    this._phase    = 'idle';   // idle | work | rest | done
    this._remain   = 0;
    this._raf      = null;
    this._lastTs   = null;
    this._accMs    = 0;
  }

  /* public */
  start() {
    if (this._phase !== 'idle' && this._phase !== 'done') return;
    this._round  = 1;
    this._phase  = 'work';
    this._remain = this.workSec;
    this._accMs  = 0;
    this.onPhase({ phase: 'work', round: this._round, total: this.rounds });
    this._tick();
  }

  pause() {
    if (this._raf) { cancelAnimationFrame(this._raf); this._raf = null; }
    this._lastTs = null;
  }

  resume() {
    if (this._phase === 'idle' || this._phase === 'done') return;
    this._tick();
  }

  reset() {
    this.pause();
    this._round  = 0;
    this._phase  = 'idle';
    this._remain = 0;
    this._accMs  = 0;
    this.onTick({ remain: 0, phase: 'idle', round: 0, total: this.rounds });
  }

  get phase()  { return this._phase; }
  get round()  { return this._round; }
  get remain() { return this._remain; }

  /* private */
  _tick(ts) {
    if (ts !== undefined && this._lastTs !== null) {
      this._accMs += ts - this._lastTs;
      if (this._accMs >= 1000) {
        const ticks = Math.floor(this._accMs / 1000);
        this._accMs -= ticks * 1000;
        this._remain -= ticks;
        if (this._remain <= 0) {
          this._advance();
          return;
        }
        this.onTick({ remain: this._remain, phase: this._phase,
                      round: this._round, total: this.rounds });
      }
    }
    this._lastTs = ts ?? performance.now();
    this._raf = requestAnimationFrame(t => this._tick(t));
  }

  _advance() {
    if (this._phase === 'work') {
      if (this._round >= this.rounds) {
        this._phase  = 'done';
        this._remain = 0;
        this.onPhase({ phase: 'done', round: this._round, total: this.rounds });
        this.onDone();
        return;
      }
      this._phase  = 'rest';
      this._remain = this.restSec;
      this.onPhase({ phase: 'rest', round: this._round, total: this.rounds });
    } else {
      this._round += 1;
      this._phase  = 'work';
      this._remain = this.workSec;
      this.onPhase({ phase: 'work', round: this._round, total: this.rounds });
    }
    this.onTick({ remain: this._remain, phase: this._phase,
                  round: this._round, total: this.rounds });
    this._raf = requestAnimationFrame(t => this._tick(t));
  }
}

/* ── Audio cues (Web Audio API, no external files) ───────────── */
function _beep(freq, dur, vol = .4, type = 'sine') {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(.0001, ctx.currentTime + dur);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + dur);
  } catch (e) { /* audio unavailable */ }
}

const CondAudio = {
  workStart : () => _beep(880, .12, .5),
  restStart : () => _beep(440, .18, .4),
  countdown : () => _beep(660, .08, .3),
  done      : () => { _beep(523, .15, .5); setTimeout(() => _beep(659, .15, .5), 160); }
};

/* ── Exports ─────────────────────────────────────────────────── */
if (typeof module !== 'undefined') {
  module.exports = { CondTimer, CondAudio };
} else {
  window.CondTimer = CondTimer;
  window.CondAudio = CondAudio;
}
