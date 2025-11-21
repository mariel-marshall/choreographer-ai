  const playNoteForWord = useCallback(
    (_index: number) => {
      const ctx = audioContextRef.current;
      const gain = gainNodeRef.current;
      if (!ctx || !gain || isMuted) return;

      const now = ctx.currentTime;

      // Random airy tone per word (not a fixed scale)
      const baseFreq = 160 + Math.random() * 440; // ~160–600 Hz
      const duration = 0.8 + Math.random() * 0.7; // 0.8–1.5s
      const attack = 0.15 + Math.random() * 0.15;
      const release = 0.4 + Math.random() * 0.4;

      const osc = ctx.createOscillator();
      const oscGain = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      const stereoPanner =
        (ctx as any).createStereoPanner?.() ?? null;

      // More textured than pure sine
      osc.type = Math.random() > 0.5 ? 'triangle' : 'sawtooth';
      osc.frequency.setValueAtTime(baseFreq, now);

      // Gentle lowpass sweep to make it more "sound" than musical note
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(baseFreq * 2.5, now);
      filter.frequency.linearRampToValueAtTime(
        baseFreq,
        now + duration + release
      );

      // Soft envelope
      oscGain.gain.setValueAtTime(0, now);
      oscGain.gain.linearRampToValueAtTime(0.9, now + attack);
      oscGain.gain.linearRampToValueAtTime(
        0,
        now + duration + release
      );

      osc.connect(oscGain);
      oscGain.connect(filter);

      if (stereoPanner) {
        stereoPanner.pan.setValueAtTime(
          Math.random() * 2 - 1,
          now
        );
        filter.connect(stereoPanner);
        stereoPanner.connect(gain);
      } else {
        filter.connect(gain);
      }

      osc.start(now);
      osc.stop(now + duration + release + 0.1);
    },
    [isMuted]
  );
