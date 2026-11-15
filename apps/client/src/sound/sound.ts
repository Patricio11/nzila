// The game's first sounds, all made here in the browser from noise and tones:
// nothing is recorded and nothing is downloaded, so sound costs no data. The
// sea against the Marginal's edge, the hum of the avenue, footsteps, the
// push and the landing of a jump, a candongueiro's hoot as it pulls away.
//
// These are stand-ins with the right shape. The cobrador's call and music
// must come from real people and signed licences (D-0.18, Q8) and are not
// imitated here.

type Context = AudioContext;

export class Sound {
  private context: Context | null = null;
  private master: GainNode | null = null;
  private sea: GainNode | null = null;
  private road: GainNode | null = null;
  private on = true;
  /** How many sounds have been asked for since the page opened, whether or not they could be heard. */
  played = 0;

  /** A browser lets sound begin only from a touch or a key: call this from one. */
  wake(): void {
    if (this.context) {
      if (this.context.state === "suspended") void this.context.resume();
      return;
    }
    const Made = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Made) return;
    const context = new Made();
    this.context = context;
    const master = context.createGain();
    master.gain.value = this.on ? 0.8 : 0;
    master.connect(context.destination);
    this.master = master;
    // Two seconds of noise, looped, is the stuff of the sea and of the road.
    const noise = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.noise = noise;
    const bed = (frequency: number, q: number, type: BiquadFilterType): GainNode => {
      const source = context.createBufferSource();
      source.buffer = noise;
      source.loop = true;
      const filter = context.createBiquadFilter();
      filter.type = type;
      filter.frequency.value = frequency;
      filter.Q.value = q;
      const gain = context.createGain();
      gain.gain.value = 0;
      source.connect(filter).connect(gain).connect(master);
      source.start();
      return gain;
    };
    // The sea: a wide band of hiss that swells and falls back every few seconds.
    this.sea = bed(900, 0.4, "bandpass");
    const swell = context.createOscillator();
    swell.frequency.value = 0.16;
    const depth = context.createGain();
    depth.gain.value = 0.035;
    swell.connect(depth).connect(this.sea.gain);
    swell.start();
    // The road: what is left of noise under 180 Hz.
    this.road = bed(180, 0.7, "lowpass");
  }

  private noise: AudioBuffer | null = null;

  /** Sound on or off (Definições; Modo Poupança turns it off). */
  set(on: boolean): void {
    this.on = on;
    if (this.master && this.context) this.master.gain.setTargetAtTime(on ? 0.8 : 0, this.context.currentTime, 0.08);
  }

  /** Where the listener is: how near the water and how near traffic, each 0 (far) to 1 (beside it). */
  ambience(water: number, traffic: number): void {
    if (!this.context || !this.sea || !this.road) return;
    const now = this.context.currentTime;
    this.sea.gain.setTargetAtTime(0.02 + 0.09 * water, now, 0.6);
    this.road.gain.setTargetAtTime(0.03 + 0.16 * traffic, now, 0.6);
  }

  /** A short burst of filtered noise: a foot on the pavement, a body landing. */
  private thud(frequency: number, loud: number, seconds: number): void {
    this.played += 1;
    const context = this.context;
    if (!context || !this.master || !this.noise || context.state !== "running" || !this.on) return;
    const source = context.createBufferSource();
    source.buffer = this.noise;
    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = frequency;
    const gain = context.createGain();
    const now = context.currentTime;
    gain.gain.setValueAtTime(loud, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + seconds);
    source.connect(filter).connect(gain).connect(this.master);
    source.start(now, Math.random() * 1.5, seconds + 0.02);
  }

  /** A tone that slides from one pitch to another. */
  private tone(from: number, to: number, loud: number, seconds: number, type: OscillatorType, after = 0): void {
    const context = this.context;
    if (!context || !this.master || context.state !== "running" || !this.on) return;
    const oscillator = context.createOscillator();
    oscillator.type = type;
    const gain = context.createGain();
    const start = context.currentTime + after;
    oscillator.frequency.setValueAtTime(from, start);
    oscillator.frequency.exponentialRampToValueAtTime(to, start + seconds);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(loud, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + seconds);
    oscillator.connect(gain).connect(this.master);
    oscillator.start(start);
    oscillator.stop(start + seconds + 0.02);
  }

  step(running: boolean): void {
    this.thud(running ? 520 : 380, running ? 0.2 : 0.13, 0.07);
  }

  jump(): void {
    this.played += 1;
    this.tone(190, 420, 0.1, 0.16, "sine");
  }

  land(): void {
    this.thud(240, 0.34, 0.14);
  }

  /** A van's two short hoots. `near` is 0 (far) to 1 (beside you). */
  hoot(near: number): void {
    this.played += 1;
    const loud = 0.04 + 0.12 * Math.max(0, Math.min(1, near));
    this.tone(440, 430, loud, 0.13, "square");
    this.tone(440, 430, loud, 0.2, "square", 0.2);
  }

  close(): void {
    void this.context?.close();
    this.context = null;
  }
}
