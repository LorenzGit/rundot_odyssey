import { store } from "../state/store.ts";
import musicTrackUrl from "../assets/audio/hermes-map.mp3";

export type SfxCue = "tap" | "start" | "bounce" | "ring" | "impact" | "reward" | "error";

export interface AudioDebugSnapshot {
    contextState: AudioContextState | "locked";
    musicRunning: boolean;
    /** Playhead of the music track, in seconds. */
    musicTime: number;
    /** The track element has buffered enough to play. */
    musicReady: boolean;
    activeSfxVoices: number;
    suppressedSfx: number;
}

class AudioManager {
    private context: AudioContext | null = null;
    private master: GainNode | null = null;
    private musicBus: GainNode | null = null;
    private sfxBus: GainNode | null = null;
    private track: HTMLAudioElement | null = null;
    private trackSource: MediaElementAudioSourceNode | null = null;
    private sfxVoices = new Set<OscillatorNode>();
    private lastCueAt = new Map<SfxCue, number>();
    private suppressedSfx = 0;
    private paused = false;
    private hostPaused = false;
    private hostOverlayVisible = false;
    private pageHidden = typeof document !== "undefined" ? document.visibilityState !== "visible" : false;
    private bound = false;

    bind(): void {
        if (this.bound) return;
        this.bound = true;
        store.subscribe(() => this.sync());
        document.addEventListener("visibilitychange", () => {
            this.pageHidden = document.visibilityState !== "visible";
            this.applyPauseState();
        });
    }

    async unlock(): Promise<boolean> {
        try {
            this.ensureGraph();
            if (!this.context) return false;
            if (this.paused) return false;
            if (this.context.state === "suspended") {
                // WebKit leaves resume() pending FOREVER when the call is not
                // backed by recognized user activation. Never let that hang a
                // caller — UI actions may await unlock before proceeding.
                await Promise.race([
                    this.context.resume(),
                    new Promise<void>((resolve) => window.setTimeout(resolve, 300)),
                ]);
            }
            this.sync();
            return this.context.state === "running";
        } catch (error) {
            console.warn("[audio] WebAudio unavailable", error);
            return false;
        }
    }

    setPaused(paused: boolean): void {
        this.hostPaused = paused;
        this.applyPauseState();
    }

    /**
     * Host-owned UI such as ads and checkout sheets may not emit lifecycle
     * events. Keep this interruption separate from player mute settings and
     * host pause so one signal cannot accidentally clear another.
     */
    setHostOverlayVisible(visible: boolean): void {
        this.hostOverlayVisible = visible;
        this.applyPauseState();
    }

    private applyPauseState(): void {
        this.paused = this.hostPaused || this.pageHidden || this.hostOverlayVisible;
        if (!this.context) return;
        if (this.paused) {
            this.stopMusic();
            void this.context.suspend().catch(() => undefined);
        } else {
            void this.context
                .resume()
                .then(() => this.sync())
                .catch(() => undefined);
        }
    }

    /**
     * @param pitch Multiplier on the cue's frequencies. A ring run walks this
     * upward so four rings in a row read as a rising phrase rather than the
     * same blip four times.
     */
    play(cue: SfxCue, pitch = 1): void {
        const state = store.get();
        if (!this.context || !this.sfxBus || this.paused || !state.sfxEnabled || state.sfxVolume <= 0) return;

        const cooldowns: Record<SfxCue, number> = {
            tap: 55,
            start: 180,
            bounce: 90,
            // Rings can be threaded a few frames apart on a fast, flat arc, so
            // this has to be short enough that a run never swallows a hit.
            ring: 35,
            impact: 90,
            reward: 260,
            error: 220,
        };
        const realNow = performance.now();
        if (realNow - (this.lastCueAt.get(cue) ?? -Infinity) < cooldowns[cue]) {
            this.suppressedSfx += 1;
            return;
        }
        this.lastCueAt.set(cue, realNow);

        const cues: Record<
            SfxCue,
            {
                frequency: number;
                endFrequency: number;
                duration: number;
                peak: number;
                type: OscillatorType;
            }
        > = {
            tap: { frequency: 440, endFrequency: 493.88, duration: 0.045, peak: 0.045, type: "sine" },
            start: { frequency: 293.66, endFrequency: 440, duration: 0.18, peak: 0.065, type: "triangle" },
            bounce: { frequency: 196, endFrequency: 220, duration: 0.035, peak: 0.028, type: "sine" },
            // Threading a ring: a bright, short chime that rises as it decays.
            ring: { frequency: 784, endFrequency: 1_174.66, duration: 0.16, peak: 0.05, type: "triangle" },
            // The arrow biting the target: a low, fast thud under the chime.
            impact: { frequency: 220, endFrequency: 82.41, duration: 0.26, peak: 0.075, type: "sawtooth" },
            reward: { frequency: 523.25, endFrequency: 783.99, duration: 0.24, peak: 0.065, type: "triangle" },
            error: { frequency: 146.83, endFrequency: 110, duration: 0.16, peak: 0.05, type: "triangle" },
        };
        const definition = cues[cue];
        const now = this.context.currentTime;
        const oscillator = this.context.createOscillator();
        const envelope = this.context.createGain();
        oscillator.type = definition.type;
        // Clamped so a long ring run cannot walk the pitch into a shriek.
        const scale = Math.min(2.2, Math.max(0.5, pitch));
        oscillator.frequency.setValueAtTime(definition.frequency * scale, now);
        oscillator.frequency.exponentialRampToValueAtTime(definition.endFrequency * scale, now + definition.duration);
        envelope.gain.setValueAtTime(0.0001, now);
        envelope.gain.exponentialRampToValueAtTime(definition.peak, now + 0.008);
        envelope.gain.exponentialRampToValueAtTime(0.0001, now + definition.duration);
        oscillator.connect(envelope).connect(this.sfxBus);
        this.trackVoice(oscillator, envelope);
        oscillator.start(now);
        oscillator.stop(now + definition.duration + 0.02);
    }

    debugSnapshot(): AudioDebugSnapshot {
        return {
            contextState: this.context?.state ?? "locked",
            musicRunning: this.track !== null && !this.track.paused,
            musicTime: this.track?.currentTime ?? 0,
            // HAVE_FUTURE_DATA or better: enough is buffered to start.
            musicReady: (this.track?.readyState ?? 0) >= 3,
            activeSfxVoices: this.sfxVoices.size,
            suppressedSfx: this.suppressedSfx,
        };
    }

    private ensureGraph(): void {
        if (this.context) return;
        const AudioContextCtor = window.AudioContext;
        if (!AudioContextCtor) return;
        this.context = new AudioContextCtor();
        this.master = this.context.createGain();
        this.musicBus = this.context.createGain();
        this.sfxBus = this.context.createGain();
        const limiter = this.context.createDynamicsCompressor();
        limiter.threshold.value = -20;
        limiter.knee.value = 18;
        limiter.ratio.value = 4;
        limiter.attack.value = 0.004;
        limiter.release.value = 0.24;
        this.musicBus.connect(this.master);
        this.sfxBus.connect(this.master);
        this.master.connect(limiter).connect(this.context.destination);

        // Streamed, not decoded: three minutes of 44.1 kHz stereo is ~66 MB of
        // Float32 PCM, which is not worth holding in memory for a background
        // loop. A media-element source can only be created once per element,
        // so the element and its node are built together, here, exactly once.
        const track = new Audio(musicTrackUrl);
        track.loop = true;
        track.preload = "auto";
        this.track = track;
        this.trackSource = this.context.createMediaElementSource(track);
        this.trackSource.connect(this.musicBus);
    }

    private sync(): void {
        if (!this.context || !this.master || !this.musicBus || !this.sfxBus) return;
        const state = store.get();
        const now = this.context.currentTime;
        this.musicBus.gain.setTargetAtTime(state.musicEnabled ? state.musicVolume : 0, now, 0.12);
        this.sfxBus.gain.setTargetAtTime(state.sfxEnabled ? state.sfxVolume : 0, now, 0.03);
        this.master.gain.setTargetAtTime(this.paused ? 0 : 0.58, now, 0.08);
        if (state.musicEnabled && state.musicVolume > 0 && !this.paused && this.context.state === "running") {
            this.startMusic();
        } else {
            this.stopMusic();
        }
    }

    /**
     * Start (or resume) the music track.
     *
     * `play()` rejects whenever the browser has not granted autoplay, which is
     * the normal state until the player's first tap. That is not an error
     * worth surfacing — `sync()` runs again on every store change and on
     * `unlock()`, so the track starts the moment permission arrives.
     */
    private startMusic(): void {
        if (!this.track || !this.track.paused) return;
        void this.track.play().catch(() => undefined);
    }

    /**
     * Pause rather than stop: the track keeps its playhead, so returning from
     * a host pause or an ad resumes the phrase instead of restarting it.
     */
    private stopMusic(): void {
        if (!this.track || this.track.paused) return;
        this.track.pause();
    }

    /** Release a cue's nodes as soon as it has finished sounding. */
    private trackVoice(oscillator: OscillatorNode, envelope: GainNode): void {
        this.sfxVoices.add(oscillator);
        oscillator.addEventListener(
            "ended",
            () => {
                this.sfxVoices.delete(oscillator);
                oscillator.disconnect();
                envelope.disconnect();
            },
            { once: true },
        );
    }
}

export const audioManager = new AudioManager();
