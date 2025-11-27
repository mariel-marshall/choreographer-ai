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

export default function Page() {
  const [poemText, setPoemText] = useState<string>('');
  const [poemWords, setPoemWords] = useState<string[]>([]);
  const [currentWordIndex, setCurrentWordIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);

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

  // --- FETCH POEM FROM /api/chat -----------------------------------------

  const startNewPoem = async () => {
    try {
      setError(null);
      setIsLoading(true);
      setIsPlaying(false);
      setPoemText('');
      setPoemWords([]);
      setCurrentWordIndex(0);

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

      setPoemText(cleaned);
      setPoemWords(words);
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

  // --- RENDER -------------------------------------------------------------

  const currentWord =
    poemWords.length > 0 && currentWordIndex < poemWords.length
      ? poemWords[currentWordIndex]
      : '';

  return (
    <div className="min-h-screen bg-black text-white flex flex-col relative overflow-hidden">
      {/* Subtle gradient & grainy vibe */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.12),_transparent_55%),radial-gradient(circle_at_bottom,_rgba(255,255,255,0.05),_transparent_60%)] opacity-70" />

      {/* Top bar: title + controls */}
      <header className="relative z-10 flex items-center justify-between px-4 py-3 md:px-8">
        <div className="space-y-1">
          <h1 className="text-xs tracking-[0.4em] uppercase text-zinc-400 font-mono">
            Toronto Missed Connection Poet
          </h1>
          <p className="text-[10px] md:text-xs text-zinc-500 font-mono">
            each word is a sound &mdash; each sound is you
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

      {/* Center word */}
      <main className="relative z-10 flex-1 flex items-center justify-center px-4">
        {error && (
          <div className="text-center text-xs md:text-sm text-red-400 font-mono">
            {error}
          </div>
        )}

        {!error && !isPlaying && poemWords.length === 0 && !isLoading && (
          <p className="text-xs md:text-sm text-zinc-500 text-center max-w-md font-mono">
            press{' '}
            <span className="tracking-[0.25em] uppercase">
              missed connection
            </span>{' '}
            to let the monster remember you, one word at a time.
          </p>
        )}

        {!error && (isPlaying || poemWords.length > 0) && (
          <div className="w-full flex items-center justify-center">
            <span
              key={currentWordIndex} // force animation per word
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
      `}</style>
    </div>
  );
}
