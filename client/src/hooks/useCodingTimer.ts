import { useState, useEffect, useRef, useCallback } from 'react';

interface UseCodingTimerOptions {
  onExpire?: () => void;
  autoStart?: boolean;
}

interface UseCodingTimerReturn {
  timeRemaining: number;
  isRunning: boolean;
  isPaused: boolean;
  start: () => void;
  pause: () => void;
  resume: () => void;
  reset: () => void;
  formatTime: () => string;
  isWarning: boolean;
  progress: number;
}

const CODING_TIME_LIMIT = 30 * 60; // 30 minutes in seconds
const WARNING_THRESHOLD = 60; // 1 minute warning

export function useCodingTimer({
  onExpire,
  autoStart = true
}: UseCodingTimerOptions): UseCodingTimerReturn {
  const [timeRemaining, setTimeRemaining] = useState(CODING_TIME_LIMIT);
  const [isRunning, setIsRunning] = useState(autoStart);
  const [isPaused, setIsPaused] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(Date.now());
  const pausedTimeRef = useRef<number>(0);

  // Format time as mm:ss
  const formatTime = useCallback(() => {
    const minutes = Math.floor(timeRemaining / 60);
    const seconds = timeRemaining % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }, [timeRemaining]);

  // Calculate progress percentage
  const progress = useCallback(() => {
    return ((CODING_TIME_LIMIT - timeRemaining) / CODING_TIME_LIMIT) * 100;
  }, [timeRemaining]);

  // Check if timer is in warning state (last 1 minute)
  const isWarning = timeRemaining <= WARNING_THRESHOLD;

  // Start timer
  const start = useCallback(() => {
    setIsRunning(true);
    setIsPaused(false);
    setTimeRemaining(CODING_TIME_LIMIT);
    startTimeRef.current = Date.now();
    pausedTimeRef.current = 0;
  }, []);

  // Pause timer
  const pause = useCallback(() => {
    if (isRunning && !isPaused) {
      setIsPaused(true);
      pausedTimeRef.current = Date.now();
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
  }, [isRunning, isPaused]);

  // Resume timer
  const resume = useCallback(() => {
    if (isRunning && isPaused) {
      setIsPaused(false);
      const pauseDuration = Date.now() - pausedTimeRef.current;
      startTimeRef.current += pauseDuration;
    }
  }, [isRunning, isPaused]);

  // Reset timer
  const reset = useCallback(() => {
    setIsRunning(false);
    setIsPaused(false);
    setTimeRemaining(CODING_TIME_LIMIT);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // Handle timer expiration
  const handleExpire = useCallback(() => {
    setIsRunning(false);
    setIsPaused(false);
    if (onExpire) {
      onExpire();
    }
  }, [onExpire]);

  // Main timer effect
  useEffect(() => {
    if (!isRunning || isPaused) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    intervalRef.current = setInterval(() => {
      setTimeRemaining(prev => {
        if (prev <= 1) {
          handleExpire();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isRunning, isPaused, handleExpire]);

  // Handle page visibility changes
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && isRunning && !isPaused) {
        pause();
      } else if (!document.hidden && isPaused) {
        resume();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isRunning, isPaused, pause, resume]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return {
    timeRemaining,
    isRunning,
    isPaused,
    start,
    pause,
    resume,
    reset,
    formatTime,
    isWarning,
    progress: progress()
  };
}
