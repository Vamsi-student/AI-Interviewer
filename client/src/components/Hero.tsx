import { Button } from "@/components/ui/button";
import { ArrowRight, Play, CheckCircle } from "lucide-react";

interface HeroProps {
  onStartInterview?: () => void;
  onWatchDemo?: () => void;
}

export default function Hero({ onStartInterview, onWatchDemo }: HeroProps) {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-blue-50 via-purple-50 to-blue-50 py-20 lg:py-32">
      <div className="absolute inset-0 bg-gradient-to-r from-primary/10 to-purple-500/10"></div>
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div className="text-center lg:text-left animate-fade-in">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 leading-tight">
              Master Your Interviews with{" "}
              <span className="gradient-text">AI-Powered Practice</span>
            </h1>
            <p className="mt-6 text-xl text-gray-600 leading-relaxed">
              Experience realistic, multi-stage mock interviews with instant AI feedback. 
              Practice MCQs, coding challenges, and voice interviews to ace your next job opportunity.
            </p>
            
            <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
              <Button
                onClick={onStartInterview}
                className="btn-primary text-lg px-8 py-4 h-auto"
              >
                Start Free Interview
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              <Button
                variant="outline"
                onClick={onWatchDemo}
                className="text-lg px-8 py-4 h-auto border-2 hover:border-primary hover:text-primary"
              >
                <Play className="mr-2 h-5 w-5" />
                Watch Demo
              </Button>
            </div>

            <div className="mt-8 flex items-center justify-center lg:justify-start space-x-6 text-sm text-gray-500">
              <div className="flex items-center">
                <CheckCircle className="h-5 w-5 text-green-500 mr-2" />
                <span>Free to start</span>
              </div>
              <div className="flex items-center">
                <CheckCircle className="h-5 w-5 text-green-500 mr-2" />
                <span>No credit card required</span>
              </div>
              <div className="flex items-center">
                <CheckCircle className="h-5 w-5 text-green-500 mr-2" />
                <span>Instant feedback</span>
              </div>
            </div>
          </div>

          <div className="relative animate-slide-up">
            {/* Modern interview simulation mockup */}
            <div className="bg-gray-900 rounded-2xl p-2 shadow-2xl transform rotate-2 hover:rotate-0 transition-transform duration-500">
              <div className="bg-white rounded-xl overflow-hidden">
                <div className="bg-gray-100 px-4 py-2 flex items-center space-x-2">
                  <div className="w-3 h-3 bg-red-400 rounded-full"></div>
                  <div className="w-3 h-3 bg-yellow-400 rounded-full"></div>
                  <div className="w-3 h-3 bg-green-400 rounded-full"></div>
                </div>
                
                <div className="p-4">
                  <div className="flex items-center space-x-3 mb-3">
                    <div className="w-10 h-10 bg-gradient-to-r from-primary to-purple-500 rounded-full flex items-center justify-center">
                      <span className="text-white text-sm">🤖</span>
                    </div>
                    <div>
                      <div className="font-semibold text-gray-900">AI Interviewer</div>
                      <div className="text-sm text-green-500 flex items-center">
                        <div className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"></div>
                        Speaking...
                      </div>
                    </div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-700 mb-3">
                    "Tell me about a challenging project you worked on and how you handled it."
                  </div>
                  <div className="flex space-x-2">
                    <Button className="flex-1 bg-primary text-white text-sm">
                      🎤 Record Answer
                    </Button>
                    <Button variant="outline" className="text-sm">
                      ⌨️
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            {/* Floating elements */}
            <div className="absolute -top-4 -right-4 bg-white rounded-xl shadow-lg p-3 animate-bounce">
              <div className="flex items-center space-x-2">
                <span className="text-yellow-400">⭐</span>
                <span className="text-sm font-semibold text-gray-700">95% Success Rate</span>
              </div>
            </div>
            
            <div className="absolute -bottom-4 -left-4 bg-white rounded-xl shadow-lg p-3 animate-pulse">
              <div className="flex items-center space-x-2">
                <span className="text-primary">⏱️</span>
                <span className="text-sm font-semibold text-gray-700">Real-time Feedback</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
