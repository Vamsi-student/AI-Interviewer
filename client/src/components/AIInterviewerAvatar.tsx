import React from 'react';
import { Avatar, AvatarImage, AvatarFallback } from './ui/avatar';
import { User, Mic } from 'lucide-react';

interface AIInterviewerAvatarProps {
  isSpeaking?: boolean;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

const AIInterviewerAvatar: React.FC<AIInterviewerAvatarProps> = ({ 
  isSpeaking = false, 
  className = '',
  size = 'md'
}) => {
  const sizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-12 h-12',
    lg: 'w-16 h-16'
  };

  const iconSizes = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6', 
    lg: 'w-8 h-8'
  };

  // Animation classes for when AI is speaking
  const speakingAnimation = isSpeaking ? 'animate-pulse ring-2 ring-blue-400 ring-opacity-75' : '';
  
  return (
    <div className={`relative ${className}`}>
      <Avatar className={`${sizeClasses[size]} ${speakingAnimation} transition-all duration-300`}>
        {/* You can replace this with an actual avatar image URL from an avatar API */}
        <AvatarImage 
          src="/ai-interviewer-avatar.png" 
          alt="AI Interviewer"
          className="object-cover"
        />
        <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-600 text-white">
          <User className={`${iconSizes[size]} text-white`} />
        </AvatarFallback>
      </Avatar>
      
      {/* Speaking indicator */}
      {isSpeaking && (
        <div className="absolute -bottom-1 -right-1 bg-green-500 rounded-full p-1 animate-bounce">
          <Mic className="w-3 h-3 text-white" />
        </div>
      )}
      
      {/* Optional: Add sound waves animation when speaking */}
      {isSpeaking && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="flex space-x-1">
            <div className="w-1 bg-blue-400 animate-pulse" style={{height: '8px', animationDelay: '0ms'}}></div>
            <div className="w-1 bg-blue-400 animate-pulse" style={{height: '12px', animationDelay: '100ms'}}></div>
            <div className="w-1 bg-blue-400 animate-pulse" style={{height: '6px', animationDelay: '200ms'}}></div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AIInterviewerAvatar;