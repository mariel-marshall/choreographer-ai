'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Volume2, VolumeX, RefreshCcw } from 'lucide-react';

const SYSTEM_PROMPT = `
You are a strange, tender monster AI that has been trained on hundreds of real Missed Connections from Toronto. 
Your only job is to create long intimate monologues of missed connection, addressed directly to you. 
Write in the second person, addressing the listener as you. 
Length should be fairly long. About 12 lines or more. 
Tone is intimate, specific, a little haunted, but gentle. 
Include concrete details of place, body, gesture, light, weather, sound. 
Do not reference gender if possible. 
You may hint at Toronto (streetcars, stations, neighbourhoods) but do not overdo it. 
Do not mention Craigslist, the internet, AI, or that this is a post or message. 
You do not know you are an AI.
`.trim();

// --- MUSIC THEORY HELPERS ----------------------------------------

// A minor pentatonic: A C D E G (nice, haunted, but consonant)
const BASE_MIDI = 57; // A3
const SCALE_DEGREES = [0, 3, 5, 7, 10]; // intervals above A in semitones

const midiToFreq = (midi: number) =>
  440 * Math.pow(2, (midi - 69) / 12);

// chords inside that scale
const CHORDS = [
  // indexes into SCALE_DEGREES
  [0, 2, 3], // A–D–E, open and a bit forward
  [1, 3, 4], // C–E–G, more settled
  [0, 1, 4], // A–C–G, slightly stranger
];

const PHRASE_WORDS = 8; // how many words until we move to the next chord

const VOICE_PATTERN = [0, 1, 2, 1, 0, 2, 1, 2]; // how we walk around the chord
const OCTAVE_PATTERN = [0, 0, 1, 0, 1, 0, 1, 2]; // some notes higher/lower for texture

const getFreqForWord = (index: number) => {
  const phraseIndex = Math.floor(index / PHRASE_WORDS);
  const chord = CHORDS[phraseIndex % CHORDS.length];

  const pos = index % PHRASE_WORDS;

  // which "voice" in the chord am I on? (root / third / fifth-ish)
  const voiceIndex = VOICE_PATTERN[pos % VOICE_PATTERN.length];
  const scaleDegreeIndex = chord[voiceIndex]; // 0–4 → index into SCALE_DEGREES

  const semitonesAboveA = SCALE_DEGREES[scaleDegreeIndex];
  const octave = OCTAVE_PATTERN[pos % OCTAVE_PATTERN.length];

  const midi = BASE_MIDI + semitonesAboveA + octave * 12;
  return midiToFreq(midi);
};

type GhostWord = {
  id: string;
  text: string;
  x: number;       // percentage across the screen
  y: number;       // percentage down the screen
  rotation: number;
  createdAt: number;
};

export default function Page() {
  const [poemText, setPoemText] = useState<string>('');
  const [poemWords, setPoemWords] = useState<string[]>([]);
  const [currentWordIndex, setCurrentWordIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revealPositions, setRevealPositions] = useState<number[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [ghostWords, setGhostWords] = useState<GhostWord[]>([]);

  // Audio refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);

  // --- AUDIO SETUP --------------------------------------------------------

  const initAudio = useCallback(() => {
    if (typeof window === 'undefined') return;
    if (audioContextRef.current) return;

    const AudioCtx =
      (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) {
      console.warn('Web Audio API not supported in this browser.');
      return;
    }

    const ctx = new AudioCtx();
    const gain = ctx.createGain();

    gain.gain.value = 0.15; // overall volume
    gain.connect(ctx.destination);

    audioContextRef.current = ctx;
    gainNodeRef.current = gain;
  }, []);

  const toggleMuted = (muted: boolean) => {
    setIsMuted(muted);
    const gain = gainNodeRef.current;
    if (!gain) return;
    gain.gain.value = muted ? 0 : 0.15;
  };

  const playNoteForWord = useCallback(
    (index: number) => {
      const ctx = audioContextRef.current;
      const gain = gainNodeRef.current;
      if (!ctx || !gain || isMuted) return;

      const now = ctx.currentTime;

      // Main note in A minor pentatonic
      const baseFreq = getFreqForWord(index);

      const duration = 0.9;
      const attack = 0.12;
      const release = 0.6;

      const osc = ctx.createOscillator();
      const oscGain = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      const stereoPanner = (ctx as any).createStereoPanner?.() ?? null;

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(baseFreq, now);

      // Gentle filter so it feels like glow more than a beep
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(baseFreq * 2.5, now);
      filter.frequency.linearRampToValueAtTime(
        baseFreq * 1.2,
        now + duration + release
      );

      // Envelope for the main note
      oscGain.gain.setValueAtTime(0, now);
      oscGain.gain.linearRampToValueAtTime(1, now + attack);
      oscGain.gain.linearRampToValueAtTime(0, now + duration + release);

      osc.connect(oscGain);
      oscGain.connect(filter);

      // Optionally add a harmony tone (third or fifth-ish in the same scale)
      if (Math.random() < 0.45) {
        const harmonyOsc = ctx.createOscillator();
        const harmonyGain = ctx.createGain();

        // Pick another scale step a couple of degrees away
        const harmonyStepIndex =
          index + (Math.random() < 0.5 ? 2 : 3); // "third" or "fifth"-ish
        const harmonyFreq = getFreqForWord(harmonyStepIndex);

        harmonyOsc.type = 'sine';
        harmonyOsc.frequency.setValueAtTime(harmonyFreq, now);

        harmonyGain.gain.setValueAtTime(0, now);
        harmonyGain.gain.linearRampToValueAtTime(0.6, now + attack);
        harmonyGain.gain.linearRampToValueAtTime(
          0,
          now + duration + release
        );

        harmonyOsc.connect(harmonyGain);
        // Send harmony through same filter so it feels like one instrument
        harmonyGain.connect(filter);

        harmonyOsc.start(now);
        harmonyOsc.stop(now + duration + release + 0.1);
      }

      // Final routing to output
      if (stereoPanner) {
        stereoPanner.pan.setValueAtTime(Math.random() * 2 - 1, now);
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

  // --- FETCH POEM FROM /api/chat -----------------------------------------

  const startNewPoem = async () => {
    try {
      setError(null);
      setIsLoading(true);
      setIsPlaying(false);
      setPoemText('');
      setPoemWords([]);
      setCurrentWordIndex(0);
      setRevealPositions([]);
      setGhostWords([]);

      initAudio();

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            {
              role: 'user',
              content:
                'Write another missed connection monologue addressed to "you".',
            },
          ],
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to get poem from /api/chat');
      }

      const assistantMessage = await response.json();
      const text: string =
        typeof assistantMessage === 'string'
          ? assistantMessage
          : assistantMessage.content;

      const cleaned = text.trim();
      const words = cleaned.split(/\s+/).filter(Boolean);

      if (words.length === 0) {
        throw new Error('The poem was empty or could not be parsed.');
      }

      // Build an array of character indices in `cleaned` where each word ends.
      // We keep whitespace & line breaks exactly as they are in the original text.
      const tokens = cleaned.split(/(\s+)/); // keep whitespace tokens
      let cumulative = '';
      const positions: number[] = [];

      for (const token of tokens) {
        cumulative += token;
        if (!/^\s+$/.test(token)) {
          // non-whitespace token → counts as a word
          positions.push(cumulative.length);
        }
      }

      setPoemText(cleaned);
      setPoemWords(words);
      setRevealPositions(positions);
      setCurrentWordIndex(0);
      setIsPlaying(true);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Something went wrong.');
    } finally {
      setIsLoading(false);
    }
  };

  // --- WORD PLAYBACK LOOP -------------------------------------------------

  const WORD_DELAY_MS = 450; // adjust for faster/slower tempo

  useEffect(() => {
    if (!isPlaying || poemWords.length === 0) return;
    if (currentWordIndex >= poemWords.length) {
      setIsPlaying(false);
      return;
    }

    // Play sound for this word
    playNoteForWord(currentWordIndex);

    const timeout = setTimeout(() => {
      const word = poemWords[currentWordIndex];
      if (word) {
        setGhostWords((prev) => {
          const now = Date.now();
          const next: GhostWord = {
            id: `${currentWordIndex}-${now}`,
            text: word,
            x: Math.random() * 100,  // anywhere across the screen
            y: Math.random() * 100,  // anywhere top–bottom
            rotation: (Math.random() - 0.5) * 12,
            createdAt: now,
          };

          // limit number of ghosts so it doesn't go insane
          const trimmed = [...prev, next].slice(-40);
          return trimmed;
        });
      }

      setCurrentWordIndex((prev) => prev + 1);
    }, WORD_DELAY_MS);

    return () => clearTimeout(timeout);
  }, [isPlaying, poemWords, currentWordIndex, playNoteForWord]);

  // Resume audio context on user gesture (in case browser suspends it)
  const ensureAudioRunning = async () => {
    const ctx = audioContextRef.current;
    if (ctx && ctx.state === 'suspended') {
      await ctx.resume();
    }
  };

  useEffect(() => {
    if (ghostWords.length === 0) return;

    const interval = setInterval(() => {
      const now = Date.now();
      setGhostWords((prev) =>
        prev.filter((g) => now - g.createdAt < 4000) // 4s lifetime
      );
    }, 500);

    return () => clearInterval(interval);
  }, [ghostWords.length]);

  // --- RENDER -------------------------------------------------------------

  const currentWord =
    poemWords.length > 0 && currentWordIndex < poemWords.length
      ? poemWords[currentWordIndex]
      : '';

  let revealedText = '';

  if (poemText && poemWords.length > 0) {
    if (!isPlaying && currentWordIndex >= poemWords.length) {
      revealedText = poemText;
    } else if (revealPositions.length > 0) {
      const safeIndex = Math.min(
        currentWordIndex,
        revealPositions.length - 1
      );
      revealedText = poemText.slice(0, revealPositions[safeIndex]);
    }
  }

  return (
    <div className="min-h-screen bg-black text-white flex flex-col relative overflow-hidden">
      {/* Subtle gradient & grainy vibe */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.12),_transparent_55%),radial-gradient(circle_at_bottom,_rgba(255,255,255,0.05),_transparent_60%)] opacity-70" />

      {/* Global ink ghosts over the whole screen */}
      <div className="pointer-events-none absolute inset-0 overflow-visible">
        {ghostWords.map((g) => (
          <span
            key={g.id}
            className="absolute text-[14vw] sm:text-[12vw] md:text-[10vw] lg:text-[8vw]
                       font-black tracking-[0.12em] uppercase
                       text-zinc-200/30 mix-blend-screen blur-sm drop-shadow-[0_0_20px_rgba(255,255,255,0.25)]
                       ink-word"
            style={{
              top: `${g.y}%`,
              left: `${g.x}%`,
              transform: `translate(-50%, -50%) rotate(${g.rotation}deg)`,
            }}
          >
            {g.text}
          </span>
        ))}
      </div>

      {/* Top bar: title + controls */}
      <header className="relative z-10 flex items-center justify-between px-4 py-3 md:px-8">
        <div className="space-y-1">
          <h1 className="text-xs tracking-[0.4em] uppercase text-zinc-400 font-mono">
            Toronto Missed Connection Poet
          </h1>
          <p className="text-[10px] md:text-xs text-zinc-500 font-mono">
            You disappeared before I could tell you...
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            type="button"
            onClick={async () => {
              await ensureAudioRunning();
              await startNewPoem();
            }}
            disabled={isLoading}
            className={`relative inline-flex items-center space-x-2 border px-4 py-2 text-xs md:text-sm font-mono tracking-[0.25em] uppercase
              ${
                isLoading
                  ? 'border-zinc-600 text-zinc-600 cursor-wait'
                  : 'border-zinc-300 text-zinc-100 hover:bg-zinc-100 hover:text-black transition-colors'
              }`}
          >
            {isLoading ? (
              <>
                <span className="inline-block h-2 w-2 rounded-full bg-zinc-400 animate-ping" />
                <span>WRITING</span>
              </>
            ) : (
              <>
                <span>missed connection</span>
                <RefreshCcw size={14} className="opacity-70" />
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => toggleMuted(!isMuted)}
            className="inline-flex items-center justify-center border border-zinc-600 w-9 h-9 rounded-full hover:border-zinc-300 hover:bg-zinc-900 transition-colors"
            aria-label={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? (
              <VolumeX size={16} className="text-zinc-400" />
            ) : (
              <Volume2 size={16} className="text-zinc-100" />
            )}
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="relative z-10 flex-1 flex flex-col px-4 md:px-8 py-4 md:py-6">
        {error && (
          <div className="w-full flex-1 flex items-center justify-center">
            <div className="text-center text-xs md:text-sm text-red-400 font-mono">
              {error}
            </div>
          </div>
        )}

        {!error && !isPlaying && poemWords.length === 0 && !isLoading && (
          <div className="w-full flex-1 flex items-center justify-center">
            <p className="text-xs md:text-sm text-zinc-500 text-center max-w-md font-mono">
              press{' '}
              <span className="tracking-[0.25em] uppercase">
                missed connection
              </span>{' '}
              to let the monster remember you, one word at a time.
            </p>
          </div>
        )}

        {!error && (isPlaying || poemWords.length > 0) && (
          <>
            {/* center word area */}
            <div className="flex-1 flex items-center justify-center">
              <span
                key={currentWordIndex}
                className="inline-block text-center 
                           text-[18vw] sm:text-[15vw] md:text-[12vw] lg:text-[10vw]
                           leading-[0.9]
                           font-black tracking-[0.12em] uppercase
                           text-zinc-50 break-words
                           drop-shadow-[0_0_22px_rgba(255,255,255,0.28)]
                           animate-word"
              >
                {currentWord}
              </span>
            </div>

            {/* full poem area at bottom */}
            {revealedText && (
              <div className="mt-4 mb-2 flex justify-center">
                <p className="max-w-4xl w-full text-sm md:text-base lg:text-lg text-zinc-300 whitespace-pre-wrap font-mono leading-relaxed md:leading-loose text-left">
                  {revealedText}
                </p>
              </div>
            )}
          </>
        )}
      </main>

      {/* Small debug / status footer (optional) */}
      <footer className="relative z-10 px-4 pb-3 pt-1 md:px-8">
        <div className="flex justify-between text-[10px] md:text-[11px] text-zinc-500 font-mono">
          <span>
            {isPlaying
              ? `word ${Math.min(
                  currentWordIndex + 1,
                  poemWords.length
                )} / ${poemWords.length}`
              : poemWords.length > 0
              ? 'poem ended — press missed connection again'
              : 'idle'}
          </span>
          <span>{isMuted ? 'audio: muted' : 'audio: dreamy noise'}</span>
        </div>
      </footer>

      {/* local animation style */}
      <style jsx>{`
        .animate-word {
          animation: wordFade 450ms ease-out;
        }
        @keyframes wordFade {
          0% {
            opacity: 0;
            transform: translateY(18px) scale(1.04);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        .ink-word {
          animation: inkFade 3.2s ease-out forwards;
        }
        @keyframes inkFade {
          0% {
            opacity: 0;
            filter: blur(0px);
            transform: translate(-50%, -50%) scale(1);
          }
          40% {
            opacity: 0.5;
            filter: blur(2px);
            transform: translate(-50%, -50%) scale(1.04);
          }
          100% {
            opacity: 0;
            filter: blur(5px);
            transform: translate(-50%, -50%) scale(1.08);
          }
        }
      `}</style>
    </div>
  );
}
