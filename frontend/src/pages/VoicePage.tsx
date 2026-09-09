/**
 * VoicePage — autonomous Jarvis voice assistant.
 *
 * State machine:
 *   INITIALIZING → REQUESTING_MIC → READY (autoplay blocked) or LISTENING
 *   LISTENING → TRANSCRIBING → THINKING → EXECUTING → SPEAKING → LISTENING
 *
 * VAD: Web Audio API AnalyserNode measures RMS volume while recording.
 * Silence > VAD_SILENCE_MS stops recording automatically — no button press required.
 *
 * Autoplay guard: browser blocks audio.play() before a user gesture.
 * We catch NotAllowedError and show a "Start Jarvis" button to unlock audio,
 * then proceed with the greeting + autonomous loop.
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import {
  Mic, Square, Volume2, VolumeX, Sparkles, Send,
  Bot, User, Wrench, Play,
} from 'lucide-react';
import { toast } from 'sonner';
import { useSpeech } from '../hooks/useSpeech';
import { useTTS } from '../hooks/useTTS';
import { useAppStore, generateId } from '../lib/store';
import { streamChat } from '../lib/sse';
import { serializeToolCallArguments } from '../lib/tool-call';
import type { ChatMessage, ToolCallInfo } from '../types';

// ---------------------------------------------------------------------------
// VAD constants (tunable)
// ---------------------------------------------------------------------------
const VAD_THRESHOLD = 0.01;     // RMS below this → silence
const VAD_SILENCE_MS = 1600;    // ms of continuous silence → stop recording
const VAD_MIN_SPEECH_MS = 300;  // must have heard speech for at least this long
const VAD_MAX_RECORD_MS = 15000; // hard cap — stop even if VAD never fires

// ---------------------------------------------------------------------------
// Voice page state
// ---------------------------------------------------------------------------
export type VoiceState =
  | 'INITIALIZING'
  | 'READY'        // mic permission blocked / waiting for first gesture
  | 'LISTENING'
  | 'TRANSCRIBING'
  | 'THINKING'
  | 'EXECUTING'
  | 'SPEAKING'
  | 'ERROR';

const SYSTEM_PROMPT =
  'You are Jarvis, a local computer voice assistant.\n' +
  'Your primary purpose is to perform useful computer actions using the available OpenJarvis tools.\n' +
  'When the user asks you to control the computer, use the appropriate available tool and actually execute the action. Never pretend that an action was performed.\n' +
  'Prefer dedicated desktop-control tools for desktop actions.\n' +
  'For example:\n' +
  '- opening applications → use windows_desktop_action with action=open_application\n' +
  '- opening URLs → use windows_desktop_action with action=open_url\n' +
  '- searching the web → use windows_desktop_action with action=search_web\n' +
  '- opening folders → use windows_desktop_action with action=open_folder\n' +
  'Only use shell_exec when it is genuinely the appropriate tool and the safety system permits it.\n' +
  'Do not execute destructive or dangerous actions without the existing OpenJarvis approval mechanism.\n' +
  'For successful actions, keep the spoken response very short: "Opening Chrome.", "Done.", etc.\n' +
  'For informational questions, answer concisely.\n' +
  'You are an action-oriented voice assistant, not a normal chatbot.';

export function VoicePage() {
  const [textInput, setTextInput] = useState('');
  const [currentState, setCurrentState] = useState<VoiceState>('INITIALIZING');
  const [statusMessage, setStatusMessage] = useState('Initializing Jarvis...');
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  // true once mic permission is granted (even if autoplay not yet unlocked)
  const [micReady, setMicReady] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  // Set to true while the autonomous loop should keep running
  const loopActiveRef = useRef(false);
  // VAD bookkeeping
  const vadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const speechDetectedRef = useRef(false);
  const speechStartRef = useRef(0);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const vadRafRef = useRef<number | null>(null);

  const selectedModel = useAppStore((s) => s.selectedModel);
  const activeId = useAppStore((s) => s.activeId);
  const messages = useAppStore((s) => s.messages);
  const createConversation = useAppStore((s) => s.createConversation);
  const addMessage = useAppStore((s) => s.addMessage);
  const updateLastAssistant = useAppStore((s) => s.updateLastAssistant);

  const {
    state: speechState,
    error: speechError,
    available: speechAvailable,
    startRecording,
    stopRecording,
    getStream,
  } = useSpeech();

  const { speak, stop: stopTTS, isSpeaking } = useTTS();

  // ------------------------------------------------------------------
  // VAD: attach an AnalyserNode to the live stream and auto-stop when
  // silence has lasted VAD_SILENCE_MS after at least VAD_MIN_SPEECH_MS
  // of detected speech.
  // ------------------------------------------------------------------
  const stopVAD = useCallback(() => {
    if (vadRafRef.current) {
      clearInterval(vadRafRef.current);
      vadRafRef.current = null;
    }
    if (vadTimerRef.current) {
      clearTimeout(vadTimerRef.current);
      vadTimerRef.current = null;
    }
    analyserRef.current = null;
  }, []);

  const startVAD = useCallback(
    (onSilence: () => void) => {
      stopVAD();
      const stream = getStream();
      if (!stream) {
        // No Web Audio stream — use a fixed max-duration timeout fallback
        vadTimerRef.current = setTimeout(() => { stopVAD(); onSilence(); }, VAD_MAX_RECORD_MS);
        return;
      }

      try {
        const ctx = new AudioContext();
        // Resume context in case it was created before a user gesture
        ctx.resume().catch(() => {});
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);
        analyserRef.current = analyser;
        speechDetectedRef.current = false;
        speechStartRef.current = 0;

        const buf = new Float32Array(analyser.fftSize);
        let silenceStart = 0;

        // Use setInterval — requestAnimationFrame pauses in background tabs
        vadRafRef.current = setInterval(() => {
          if (!analyserRef.current) return;
          analyser.getFloatTimeDomainData(buf);
          let sum = 0;
          for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
          const rms = Math.sqrt(sum / buf.length);

          const now = Date.now();
          if (rms > VAD_THRESHOLD) {
            silenceStart = 0;
            if (!speechDetectedRef.current) {
              speechDetectedRef.current = true;
              speechStartRef.current = now;
            }
          } else {
            if (silenceStart === 0) silenceStart = now;
            const silenceDuration = now - silenceStart;
            const spokenMs = speechDetectedRef.current ? now - speechStartRef.current : 0;
            if (speechDetectedRef.current && spokenMs >= VAD_MIN_SPEECH_MS && silenceDuration >= VAD_SILENCE_MS) {
              stopVAD();
              onSilence();
            }
          }
        }, 80) as unknown as number;

        // Hard max-recording timeout
        vadTimerRef.current = setTimeout(() => { stopVAD(); onSilence(); }, VAD_MAX_RECORD_MS);
      } catch {
        // Web Audio unavailable — use timeout fallback
        vadTimerRef.current = setTimeout(() => { stopVAD(); onSilence(); }, VAD_MAX_RECORD_MS);
      }
    },
    [getStream, stopVAD],
  );

  // ------------------------------------------------------------------
  // processQuery — identical pipeline to before; returns to LISTENING
  // automatically when the loop is active.
  // ------------------------------------------------------------------
  const processQuery = useCallback(
    async (userText: string) => {
      const cleanText = userText.trim();
      if (!cleanText) return;

      if (!selectedModel) {
        toast.error('No model selected. Choose a model in settings.');
        return;
      }

      stopTTS();
      setCurrentState('THINKING');
      setStatusMessage(`Thinking with ${selectedModel}...`);

      let convId = activeId;
      if (!convId) convId = createConversation(selectedModel);

      const userMsg: ChatMessage = {
        id: generateId(),
        role: 'user',
        content: cleanText,
        timestamp: Date.now(),
      };
      addMessage(convId, userMsg);

      // Cap history to last 10 messages to keep context small
      const recentMessages = useAppStore.getState().messages.slice(-10);
      const apiMessages: Array<{ role: string; content: string }> = [
        { role: 'system', content: SYSTEM_PROMPT },
        ...recentMessages.map((m) => ({ role: m.role, content: m.content })),
      ];

      const assistantMsg: ChatMessage = {
        id: generateId(),
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
      };
      addMessage(convId, assistantMsg);

      const controller = new AbortController();
      abortRef.current = controller;

      let accumulated = '';
      const toolCalls: ToolCallInfo[] = [];

      try {
        for await (const sseEvent of streamChat(
          { model: selectedModel, messages: apiMessages, stream: true, temperature: 0.7 },
          controller.signal,
        )) {
          const eventName = sseEvent.event;
          if (eventName === 'tool_call_start') {
            try {
              const data = JSON.parse(sseEvent.data);
              setCurrentState('EXECUTING');
              setStatusMessage(`Executing: ${data.tool}...`);
              toolCalls.push({
                id: generateId(),
                tool: data.tool,
                arguments: serializeToolCallArguments(data.arguments),
                status: 'running',
              });
              updateLastAssistant(convId, accumulated, [...toolCalls]);
            } catch {}
          } else if (eventName === 'tool_call_end') {
            try {
              const data = JSON.parse(sseEvent.data);
              const tc = toolCalls.find((t) => t.tool === data.tool && t.status === 'running');
              if (tc) { tc.status = data.success ? 'success' : 'error'; tc.result = data.result; }
              setCurrentState('THINKING');
              setStatusMessage('Processing result...');
              updateLastAssistant(convId, accumulated, [...toolCalls]);
            } catch {}
          } else {
            try {
              const data = JSON.parse(sseEvent.data);
              const delta = data.choices?.[0]?.delta;
              if (delta?.content) {
                accumulated += delta.content;
                updateLastAssistant(convId, accumulated, toolCalls.length > 0 ? [...toolCalls] : undefined);
              }
            } catch {}
          }
        }

        if (accumulated.trim() && ttsEnabled) {
          setCurrentState('SPEAKING');
          setStatusMessage('Speaking...');
          await speak(accumulated);
        }
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          const msg = err?.message || 'Failed to generate response';
          setCurrentState('ERROR');
          setStatusMessage(`Error: ${msg}`);
          toast.error(msg);
          return;
        }
      } finally {
        abortRef.current = null;
      }

      // Return to listening if loop is still active
      if (loopActiveRef.current) {
        beginListening();
      } else {
        setCurrentState('READY');
        setStatusMessage('Tap the microphone to speak');
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedModel, activeId, createConversation, addMessage, updateLastAssistant, ttsEnabled, speak, stopTTS],
  );

  // ------------------------------------------------------------------
  // beginListening — start recording and attach VAD auto-stop
  // ------------------------------------------------------------------
  const beginListening = useCallback(async () => {
    setCurrentState('LISTENING');
    setStatusMessage('Listening... Speak your command');
    try {
      await startRecording();
      // Give MediaRecorder a moment to get going before attaching analyser
      setTimeout(() => {
        startVAD(async () => {
          // VAD fired — silence detected, stop recording and transcribe
          try {
            const text = await stopRecording();
            if (text?.trim()) {
              await processQuery(text);
            } else if (loopActiveRef.current) {
              beginListening();
            }
          } catch {
            if (loopActiveRef.current) beginListening();
          }
        });
      }, 200);
    } catch {
      setCurrentState('ERROR');
      setStatusMessage('Microphone error — check permissions');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startRecording, startVAD, stopRecording, processQuery]);

  // ------------------------------------------------------------------
  // tryGreeting — speak startup greeting; gracefully handles autoplay block
  // ------------------------------------------------------------------
  const tryGreeting = useCallback(
    (autoStartLoop: boolean) => {
      if (!ttsEnabled) {
        if (autoStartLoop) { loopActiveRef.current = true; beginListening(); }
        return;
      }
      
      // Start loop immediately so we don't hang waiting for TTS synthesis
      if (autoStartLoop) { 
        loopActiveRef.current = true; 
        beginListening(); 
      }

      speak("Hello, sir. I'm awake and ready.").then(() => {
        setAudioUnlocked(true);
      }).catch((err: any) => {
        // NotAllowedError = browser autoplay block — show "Start Jarvis" button
        if (err?.name === 'NotAllowedError' || err?.message?.includes('play')) {
          loopActiveRef.current = false;
          stopVAD(); // stop the loop we just started
          setCurrentState('READY');
          setStatusMessage('Click "Start Jarvis" to begin — browser requires a gesture to enable audio');
        } else {
          // TTS service down / other error — loop is already running
          setAudioUnlocked(true);
        }
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ttsEnabled, speak, beginListening, stopVAD],
  );

  // ------------------------------------------------------------------
  // Init: request mic on mount, then attempt greeting
  // ------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setCurrentState('INITIALIZING');
      setStatusMessage('Requesting microphone permission...');
      try {
        // Probe for permission — getUserMedia resolves once granted
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((t) => t.stop()); // release; useSpeech owns it during recording
        if (cancelled) return;
        setMicReady(true);
        setStatusMessage('Microphone ready. Starting Jarvis...');
        await tryGreeting(true);
      } catch {
        if (cancelled) return;
        setCurrentState('READY');
        setStatusMessage('Microphone permission denied. Grant access and click "Start Jarvis".');
      }
    })();
    return () => { cancelled = true; };
  // Only run on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync TTS state (for isSpeaking externally)
  useEffect(() => {
    if (!isSpeaking && currentState === 'SPEAKING') {
      if (loopActiveRef.current) beginListening();
      else { setCurrentState('READY'); setStatusMessage('Tap the microphone to speak'); }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSpeaking]);

  useEffect(() => {
    if (speechError) {
      setCurrentState('ERROR');
      setStatusMessage(`Mic Error: ${speechError}`);
      toast.error(speechError);
    }
  }, [speechError]);

  // ------------------------------------------------------------------
  // handleStartJarvis — user gesture button (unlocks audio + starts loop)
  // ------------------------------------------------------------------
  const handleStartJarvis = useCallback(async () => {
    setAudioUnlocked(true);
    loopActiveRef.current = true;
    setCurrentState('INITIALIZING');
    setStatusMessage('Starting...');
    await tryGreeting(true);
  }, [tryGreeting]);

  // ------------------------------------------------------------------
  // Manual mic toggle (fallback)
  // ------------------------------------------------------------------
  const handleMicToggle = useCallback(async () => {
    if (speechState === 'recording') {
      stopVAD();
      loopActiveRef.current = false; // stop autonomous loop on manual stop
      try {
        const text = await stopRecording();
        if (text?.trim()) {
          loopActiveRef.current = true;
          await processQuery(text);
        } else {
          setCurrentState('READY');
          setStatusMessage('No speech detected.');
        }
      } catch {
        setCurrentState('ERROR');
        setStatusMessage('Transcription failed');
      }
    } else {
      stopTTS();
      abortRef.current?.abort();
      loopActiveRef.current = true;
      setAudioUnlocked(true);
      await beginListening();
    }
  }, [speechState, stopRecording, startRecording, processQuery, stopTTS, beginListening, stopVAD]);

  // Stop everything
  const handleStopAll = useCallback(() => {
    loopActiveRef.current = false;
    stopVAD();
    if (speechState === 'recording') stopRecording().catch(() => {});
    abortRef.current?.abort();
    abortRef.current = null;
    stopTTS();
    setCurrentState('READY');
    setStatusMessage('Paused. Click mic or "Start Jarvis" to resume.');
  }, [speechState, stopRecording, stopTTS, stopVAD]);

  // Form submit (text fallback)
  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!textInput.trim() || currentState === 'THINKING' || currentState === 'EXECUTING') return;
    const q = textInput;
    setTextInput('');
    setAudioUnlocked(true);
    loopActiveRef.current = true;
    processQuery(q);
  };

  const getStateColor = (state: VoiceState) => {
    switch (state) {
      case 'LISTENING':     return 'var(--color-error)';
      case 'TRANSCRIBING':  return 'var(--color-accent)';
      case 'THINKING':      return '#eab308';
      case 'EXECUTING':     return '#a855f7';
      case 'SPEAKING':      return '#22c55e';
      case 'INITIALIZING':  return 'var(--color-accent)';
      case 'ERROR':         return 'var(--color-error)';
      default:              return 'var(--color-border)';
    }
  };

  const isActive = currentState === 'THINKING' || currentState === 'EXECUTING' || currentState === 'TRANSCRIBING';
  const showStartButton = currentState === 'READY' || (currentState === 'ERROR' && !loopActiveRef.current);

  return (
    <div className="flex flex-col h-full max-w-4xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between border-b pb-4 border-[var(--color-border)]">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 rounded-2xl bg-[var(--color-accent-subtle)] text-[var(--color-accent)]">
            <Sparkles size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-[var(--color-text)]">JARVIS Voice Assistant</h1>
            <p className="text-xs text-[var(--color-text-tertiary)]">
              Local STT (Faster-Whisper) &bull; Qwen3.5 &bull; Kokoro TTS &bull; Desktop Control
            </p>
          </div>
        </div>
        <button
          onClick={() => setTtsEnabled(!ttsEnabled)}
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs border border-[var(--color-border)] transition-colors cursor-pointer"
          style={{
            background: ttsEnabled ? 'var(--color-accent-subtle)' : 'transparent',
            color: ttsEnabled ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
          }}
        >
          {ttsEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
          <span>{ttsEnabled ? 'Voice Output ON' : 'Voice Output OFF'}</span>
        </button>
      </div>

      {/* Main Orb */}
      <div className="flex flex-col items-center justify-center py-10 space-y-6 bg-[var(--color-bg-secondary)] rounded-3xl border border-[var(--color-border)] shadow-sm">
        <div className="relative flex items-center justify-center">
          {currentState === 'LISTENING' && (
            <div className="absolute w-36 h-36 rounded-full bg-red-500/20 animate-ping" />
          )}
          {(currentState === 'THINKING' || currentState === 'INITIALIZING') && (
            <div className="absolute w-36 h-36 rounded-full bg-yellow-500/20 animate-pulse" />
          )}
          {currentState === 'EXECUTING' && (
            <div className="absolute w-36 h-36 rounded-full bg-purple-500/20 animate-pulse" />
          )}
          {currentState === 'SPEAKING' && (
            <div className="absolute w-36 h-36 rounded-full bg-green-500/20 animate-pulse" />
          )}

          <button
            onClick={handleMicToggle}
            disabled={!speechAvailable || isActive}
            className="relative z-10 w-28 h-28 rounded-full flex items-center justify-center transition-all transform hover:scale-105 active:scale-95 shadow-lg cursor-pointer disabled:opacity-50"
            title="Manual mic toggle"
            style={{
              background:
                currentState === 'LISTENING' ? 'var(--color-error)'
                : currentState === 'SPEAKING' ? '#22c55e'
                : 'var(--color-accent)',
              color: 'white',
            }}
          >
            {currentState === 'LISTENING'
              ? <Square size={36} className="animate-pulse" />
              : <Mic size={36} />}
          </button>
        </div>

        {/* Status */}
        <div className="flex flex-col items-center space-y-2 text-center px-4">
          <div
            className="inline-flex items-center space-x-2 px-3 py-1 rounded-full text-xs font-semibold text-white uppercase tracking-wider shadow-sm"
            style={{ background: getStateColor(currentState) }}
          >
            <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
            <span>{currentState}</span>
          </div>
          <p className="text-sm font-medium text-[var(--color-text)] max-w-md">{statusMessage}</p>
        </div>

        {/* Start Jarvis button — shown when browser blocked autoplay or permission denied */}
        {showStartButton && (
          <button
            onClick={handleStartJarvis}
            className="flex items-center space-x-2 px-6 py-3 rounded-2xl text-sm font-semibold text-white shadow-lg cursor-pointer transition-all hover:scale-105 active:scale-95"
            style={{ background: 'var(--color-accent)' }}
          >
            <Play size={18} />
            <span>Start Jarvis</span>
          </button>
        )}

        {/* Stop / Cancel — shown during activity or autonomous listening */}
        {(loopActiveRef.current || isActive) && currentState !== 'READY' && (
          <button
            onClick={handleStopAll}
            className="px-4 py-1.5 rounded-full text-xs bg-[var(--color-bg-tertiary)] text-[var(--color-error)] border border-[var(--color-error)]/30 hover:bg-red-500/10 transition-colors cursor-pointer"
          >
            Stop Jarvis
          </button>
        )}
      </div>

      {/* Text Fallback Input */}
      <form onSubmit={handleTextSubmit} className="flex items-center space-x-2">
        <input
          type="text"
          value={textInput}
          onChange={(e) => setTextInput(e.target.value)}
          placeholder="Type a command (e.g. 'Open Chrome' or 'Open Downloads')..."
          disabled={isActive}
          className="flex-1 px-4 py-3 rounded-2xl bg-[var(--color-input-bg)] border border-[var(--color-input-border)] outline-none text-sm text-[var(--color-text)] focus:border-[var(--color-accent)] transition-colors"
        />
        <button
          type="submit"
          disabled={!textInput.trim() || isActive}
          className="p-3 rounded-2xl bg-[var(--color-accent)] text-white hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-40"
        >
          <Send size={18} />
        </button>
      </form>

      {/* Conversation Feed */}
      <div className="flex-1 overflow-y-auto space-y-4 max-h-96 pr-2">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex items-start space-x-3 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {m.role === 'assistant' && (
              <div className="p-2 rounded-xl bg-[var(--color-accent-subtle)] text-[var(--color-accent)] shrink-0">
                <Bot size={16} />
              </div>
            )}
            <div
              className={`max-w-lg p-3.5 rounded-2xl text-sm leading-relaxed ${
                m.role === 'user'
                  ? 'bg-[var(--color-accent)] text-white'
                  : 'bg-[var(--color-bg-secondary)] border border-[var(--color-border)] text-[var(--color-text)]'
              }`}
            >
              {m.content || (
                <span className="italic text-[var(--color-text-tertiary)] animate-pulse">Thinking...</span>
              )}
              {m.toolCalls && m.toolCalls.length > 0 && (
                <div className="mt-2.5 pt-2.5 border-t border-[var(--color-border)]/50 space-y-1 text-xs">
                  {m.toolCalls.map((tc, idx) => (
                    <div key={idx} className="flex items-center space-x-1.5 text-purple-400 font-mono">
                      <Wrench size={12} />
                      <span>{tc.tool}</span>
                      <span className="text-[var(--color-text-tertiary)]">({tc.arguments})</span>
                      {tc.status === 'success' && <span className="text-green-500">✓</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
            {m.role === 'user' && (
              <div className="p-2 rounded-xl bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] shrink-0">
                <User size={16} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
