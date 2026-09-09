import { useState, useCallback, useRef } from 'react';
import { synthesizeSpeech } from '../lib/api';

export function useTTS() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    setIsSpeaking(false);
  }, []);

  const speak = useCallback(
    async (text: string, voiceId = 'af_heart'): Promise<void> => {
      stop();
      setError(null);

      // Clean up markdown syntax for speech
      const cleaned = text
        .replace(/```[\s\S]*?```/g, '') // remove code blocks
        .replace(/`([^`]+)`/g, '$1')     // un-backtick
        .replace(/[*_#~]/g, '')          // remove markdown formatting
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // remove links keep text
        .trim();

      if (!cleaned) return;

      setIsSpeaking(true);

      try {
        const audioBlob = await synthesizeSpeech(cleaned, voiceId);
        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(audioUrl);
        audioRef.current = audio;

        audio.onended = () => {
          setIsSpeaking(false);
          URL.revokeObjectURL(audioUrl);
          audioRef.current = null;
        };

        audio.onerror = () => {
          setIsSpeaking(false);
          setError('Failed to play audio');
          URL.revokeObjectURL(audioUrl);
          audioRef.current = null;
        };

        await audio.play();
      } catch (err) {
        setIsSpeaking(false);
        const msg = err instanceof Error ? err.message : 'Speech synthesis failed';
        setError(msg);
      }
    },
    [stop],
  );

  return {
    speak,
    stop,
    isSpeaking,
    error,
  };
}
