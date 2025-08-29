import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Mic, MicOff, Play, Pause, Square, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

interface VoiceRecorderProps {
  onRecordingComplete: (audioBlob: Blob) => void;
  disabled?: boolean;
}

export default function VoiceRecorder({ onRecordingComplete, disabled }: VoiceRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const { toast } = useToast();
  const { getToken } = useAuth();

  const transcribeAudio = async (blob: Blob) => {
    setIsTranscribing(true);
    setTranscript(null);
    try {
      const formData = new FormData();
      formData.append('audio', blob, 'audio.wav');

      // Get authentication token
      const token = await getToken();

      const response = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData,
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();
      if (data.success) {
        setTranscript(data.transcript);
        toast({
          title: "Transcription Complete",
          description: "Your audio has been transcribed successfully!",
        });
      } else {
        setTranscript('Transcription failed: ' + (data.message || 'Unknown error'));
        toast({
          title: "Transcription Failed",
          description: data.message || 'Failed to transcribe audio',
          variant: "destructive",
        });
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setTranscript('Transcription error: ' + errorMessage);
      toast({
        title: "Transcription Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsTranscribing(false);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      const chunks: BlobPart[] = [];
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/wav' });
        setAudioBlob(blob);
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        onRecordingComplete(blob);
        
        // Start transcription automatically
        transcribeAudio(blob);
        
        // Stop all tracks to release microphone
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      
      // Start timer
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

    } catch (error) {
      console.error('Error accessing microphone:', error);
      toast({
        title: "Microphone Error",
        description: "Could not access microphone. Please check permissions.",
        variant: "destructive",
      });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  };

  const playRecording = () => {
    if (audioUrl && audioRef.current) {
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  const pauseRecording = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
    }
  };

  const clearRecording = () => {
    setAudioBlob(null);
    setAudioUrl(null);
    setRecordingTime(0);
    setIsPlaying(false);
    setTranscript(null);
    
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <Card className="w-full">
      <CardContent className="p-6">
        <div className="flex flex-col items-center space-y-4">
          {/* Recording Button */}
          <div className="relative">
            <Button
              onClick={isRecording ? stopRecording : startRecording}
              disabled={disabled}
              className={`w-16 h-16 rounded-full ${
                isRecording 
                  ? 'bg-red-500 hover:bg-red-600 recording-pulse' 
                  : 'bg-primary hover:bg-primary/90'
              }`}
            >
              {isRecording ? (
                <Square className="h-6 w-6 text-white" />
              ) : (
                <Mic className="h-6 w-6 text-white" />
              )}
            </Button>
            
            {isRecording && (
              <div className="absolute -bottom-8 left-1/2 transform -translate-x-1/2">
                <div className="bg-red-500 text-white px-2 py-1 rounded-full text-xs font-medium">
                  {formatTime(recordingTime)}
                </div>
              </div>
            )}
          </div>

          {/* Status Text */}
          <div className="text-center">
            {isRecording ? (
              <div>
                <p className="text-sm font-medium text-red-600">Recording...</p>
                <p className="text-xs text-gray-500">Click to stop recording</p>
              </div>
            ) : audioBlob ? (
              <div>
                <p className="text-sm font-medium text-green-600">Recording complete!</p>
                <p className="text-xs text-gray-500">You can play it back or record again</p>
              </div>
            ) : (
              <div>
                <p className="text-sm font-medium text-gray-700">Ready to record</p>
                <p className="text-xs text-gray-500">Click the microphone to start</p>
              </div>
            )}
          </div>

          {/* Playback Controls */}
          {audioBlob && (
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={isPlaying ? pauseRecording : playRecording}
              >
                {isPlaying ? (
                  <Pause className="h-4 w-4" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
              </Button>
              
              <Button
                variant="outline"
                size="sm"
                onClick={clearRecording}
              >
                <MicOff className="h-4 w-4" />
              </Button>
              
              <span className="text-xs text-gray-500">
                Duration: {formatTime(recordingTime)}
              </span>
            </div>
          )}

          {/* Transcription Status */}
          {isTranscribing && (
            <div className="flex items-center space-x-2 text-blue-600 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Transcribing audio...</span>
            </div>
          )}

          {/* Transcript Display */}
          {transcript && (
            <div className="w-full bg-gray-50 rounded-lg p-4 border">
              <h4 className="text-sm font-semibold text-gray-700 mb-2">Transcript:</h4>
              <div className="text-sm text-gray-800 leading-relaxed">
                {transcript}
              </div>
            </div>
          )}

          {/* Hidden audio element */}
          {audioUrl && (
            <audio
              ref={audioRef}
              src={audioUrl}
              onEnded={() => setIsPlaying(false)}
              className="hidden"
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
}
