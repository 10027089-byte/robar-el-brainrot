export class GameAudio {
  constructor() {
    this.context = null;
    this.masterGain = null;
    this.musicGain = null;
    this.masterVolume = 0.8;
    this.musicVolume = 0.8;
    this.muted = false;
  }

  async start() {
    if (!this.context) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      this.context = new AudioContext();
      this.masterGain = this.context.createGain();
      this.musicGain = this.context.createGain();
      this.musicGain.gain.value = 0.025 * this.musicVolume;
      this.musicGain.connect(this.masterGain);
      this.masterGain.connect(this.context.destination);
      this.startAmbientLoop();
      this.applyMasterVolume();
    }
    if (this.context.state === "suspended") await this.context.resume();
  }

  setMasterVolume(volume) {
    this.masterVolume = volume;
    this.applyMasterVolume();
  }

  setMusicVolume(volume) {
    this.musicVolume = volume;
    if (this.musicGain && this.context) {
      this.musicGain.gain.setTargetAtTime(0.025 * volume, this.context.currentTime, 0.04);
    }
  }

  setMuted(muted) {
    this.muted = muted;
    this.applyMasterVolume();
  }

  playTone(frequency, duration = 0.12, waveform = "sine") {
    if (!this.context || this.context.state !== "running" || this.muted) return;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    const now = this.context.currentTime;
    oscillator.type = waveform;
    oscillator.frequency.setValueAtTime(frequency, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.08, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain);
    gain.connect(this.masterGain);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.02);
  }

  startAmbientLoop() {
    for (const [frequency, waveform] of [[110, "sine"], [164.81, "triangle"]]) {
      const oscillator = this.context.createOscillator();
      oscillator.type = waveform;
      oscillator.frequency.value = frequency;
      oscillator.connect(this.musicGain);
      oscillator.start();
    }
  }

  applyMasterVolume() {
    if (!this.masterGain || !this.context) return;
    this.masterGain.gain.setTargetAtTime(this.muted ? 0 : this.masterVolume, this.context.currentTime, 0.04);
  }
}
