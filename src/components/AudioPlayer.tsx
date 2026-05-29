import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Play, Pause, Volume2, VolumeX, Loader2, RefreshCw, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Card } from '@/components/ui/card';
import { mediaSrc } from '@/utils/mediaToken';

interface AudioPlayerProps {
  url: string;
  recordingNumber?: string;
  className?: string;
}

export function AudioPlayer({ url, recordingNumber, className = '' }: AudioPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [status, setStatus] = useState<'probing' | 'ready' | 'processing' | 'error'>('probing');
  const [buffering, setBuffering] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const retryTimerRef = useRef<number | null>(null);
  const attemptRef = useRef(0);

  const src = mediaSrc(url);

  // Lightweight readiness probe. The fetch-media proxy returns JSON
  // `{ unavailable: true }` while Archive.org is still ingesting the file.
  const probe = useCallback(async () => {
    if (!src) return;
    setStatus('probing');
    try {
      const res = await fetch(src, { method: 'GET', headers: { Range: 'bytes=0-0' } });
      const ct = res.headers.get('Content-Type') || '';
      if (ct.includes('application/json')) {
        const body = await res.json().catch(() => null) as { unavailable?: boolean } | null;
        if (body?.unavailable) {
          setStatus('processing');
          scheduleRetry();
          return;
        }
      }
      if (!res.ok && res.status !== 206) {
        setStatus('processing');
        scheduleRetry();
        return;
      }
      setStatus('ready');
      attemptRef.current = 0;
    } catch {
      setStatus('processing');
      scheduleRetry();
    }
  }, [src]);

  const scheduleRetry = useCallback(() => {
    if (retryTimerRef.current) window.clearTimeout(retryTimerRef.current);
    const n = attemptRef.current++;
    const delay = Math.min(30000, 3000 * Math.pow(2, n)); // 3s, 6s, 12s, 24s, cap 30s
    retryTimerRef.current = window.setTimeout(() => { void probe(); }, delay);
  }, [probe]);

  const retryNow = useCallback(() => {
    if (retryTimerRef.current) window.clearTimeout(retryTimerRef.current);
    attemptRef.current = 0;
    void probe();
  }, [probe]);

  useEffect(() => {
    void probe();
    return () => {
      if (retryTimerRef.current) window.clearTimeout(retryTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateTime = () => setCurrentTime(audio.currentTime);
    const updateDuration = () => setDuration(audio.duration);
    const handleEnded = () => setIsPlaying(false);
    const handleWaiting = () => setBuffering(true);
    const handleCanPlay = () => setBuffering(false);
    const handleError = () => { setBuffering(false); setStatus('error'); };

    audio.addEventListener('timeupdate', updateTime);
    audio.addEventListener('loadedmetadata', updateDuration);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('waiting', handleWaiting);
    audio.addEventListener('canplay', handleCanPlay);
    audio.addEventListener('playing', handleCanPlay);
    audio.addEventListener('error', handleError);

    return () => {
      audio.removeEventListener('timeupdate', updateTime);
      audio.removeEventListener('loadedmetadata', updateDuration);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('waiting', handleWaiting);
      audio.removeEventListener('canplay', handleCanPlay);
      audio.removeEventListener('playing', handleCanPlay);
      audio.removeEventListener('error', handleError);
    };
  }, [status]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleSeek = (value: number[]) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = value[0];
    setCurrentTime(value[0]);
  };

  const handleVolumeChange = (value: number[]) => {
    const audio = audioRef.current;
    if (!audio) return;
    const newVolume = value[0];
    audio.volume = newVolume;
    setVolume(newVolume);
    setIsMuted(newVolume === 0);
  };

  const toggleMute = () => {
    const audio = audioRef.current;
    if (!audio) return;
    
    if (isMuted) {
      audio.volume = volume || 0.5;
      setIsMuted(false);
    } else {
      audio.volume = 0;
      setIsMuted(true);
    }
  };

  const changePlaybackRate = (rate: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.playbackRate = rate;
    setPlaybackRate(rate);
  };

  const formatTime = (time: number) => {
    if (!time || isNaN(time) || !isFinite(time)) return '0:00';
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <Card className={`gamified-card p-4 ${className}`}>
      <audio ref={audioRef} src={mediaSrc(url)} preload="metadata" />
      
      <div className="space-y-4">
        {/* Recording Info */}
        {recordingNumber && (
          <div className="text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary font-medium text-sm">
              🎵 Recording #{recordingNumber}
            </div>
          </div>
        )}

        {/* Progress Bar */}
        <div className="space-y-2">
          <Slider
            value={[currentTime]}
            max={duration || 100}
            step={0.1}
            onValueChange={handleSeek}
            className="cursor-pointer [&_.bg-primary]:bg-primary [&_[role=slider]]:bg-primary [&_[role=slider]]:border-primary"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between gap-4">
          {/* Play/Pause Button */}
          <Button
            onClick={togglePlay}
            size="lg"
            className="rounded-full w-12 h-12 p-0 hover-scale shadow-lg gradient-primary"
          >
            {isPlaying ? (
              <Pause className="w-5 h-5 text-white" fill="white" />
            ) : (
              <Play className="w-5 h-5 text-white ml-0.5" fill="white" />
            )}
          </Button>

          {/* Playback Speed */}
          <div className="flex gap-1">
            {[0.5, 1, 1.5, 2].map((rate) => (
              <Button
                key={rate}
                onClick={() => changePlaybackRate(rate)}
                size="sm"
                variant={playbackRate === rate ? 'default' : 'outline'}
                className={`text-xs px-2 py-1 h-7 hover-scale ${
                  playbackRate === rate ? 'gradient-primary text-white' : ''
                }`}
              >
                {rate}x
              </Button>
            ))}
          </div>

          {/* Volume Control */}
          <div className="flex items-center gap-2 flex-1 max-w-[120px]">
            <Button
              onClick={toggleMute}
              size="sm"
              variant="ghost"
              className="p-0 h-8 w-8 hover-scale"
            >
              {isMuted || volume === 0 ? (
                <VolumeX className="w-4 h-4" />
              ) : (
                <Volume2 className="w-4 h-4" />
              )}
            </Button>
            <Slider
              value={[isMuted ? 0 : volume]}
              max={1}
              step={0.01}
              onValueChange={handleVolumeChange}
              className="cursor-pointer"
            />
          </div>
        </div>
      </div>
    </Card>
  );
}
