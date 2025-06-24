import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, Code, Mic, Trophy } from "lucide-react";

const steps = [
  {
    number: 1,
    title: "Setup & MCQ Assessment",
    description: "Select your target role and experience level. Start with multiple-choice questions tailored to your field.",
    color: "from-primary to-blue-600",
    icon: Check,
    mockup: (
      <div className="bg-gray-50 rounded-lg p-4 text-left">
        <div className="text-sm font-medium text-gray-700 mb-3">Sample Question:</div>
        <div className="text-sm text-gray-600 mb-3">What is the time complexity of binary search?</div>
        <div className="space-y-2">
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 border-2 border-primary rounded-full bg-primary flex items-center justify-center">
              <div className="w-2 h-2 bg-white rounded-full"></div>
            </div>
            <span className="text-sm text-gray-600">O(log n)</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 border-2 border-gray-300 rounded-full"></div>
            <span className="text-sm text-gray-600">O(n)</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 border-2 border-gray-300 rounded-full"></div>
            <span className="text-sm text-gray-600">O(n²)</span>
          </div>
        </div>
      </div>
    )
  },
  {
    number: 2,
    title: "Coding Challenge",
    description: "Solve technical problems in our integrated code editor with real-time feedback and test case validation.",
    color: "from-purple-500 to-pink-500",
    icon: Code,
    mockup: (
      <div className="bg-gray-900 rounded-lg p-4 text-left">
        <div className="flex items-center space-x-2 mb-3">
          <div className="w-3 h-3 bg-red-400 rounded-full"></div>
          <div className="w-3 h-3 bg-yellow-400 rounded-full"></div>
          <div className="w-3 h-3 bg-green-400 rounded-full"></div>
          <span className="text-xs text-gray-400 ml-2">solution.py</span>
        </div>
        <div className="text-xs text-green-400 font-mono">def binary_search(arr, target):</div>
        <div className="text-xs text-gray-300 font-mono ml-4">left, right = 0, len(arr) - 1</div>
        <div className="text-xs text-gray-300 font-mono ml-4">while left &lt;= right:</div>
        <div className="text-xs text-blue-400 font-mono ml-8"># Your code here</div>
        <div className="mt-2 flex items-center space-x-2">
          <div className="w-2 h-2 bg-green-500 rounded-full"></div>
          <span className="text-xs text-green-400">Tests passing: 3/5</span>
        </div>
      </div>
    )
  },
  {
    number: 3,
    title: "Voice Interview",
    description: "Engage in natural conversation with our AI interviewer for realistic practice and instant verbal feedback.",
    color: "from-green-500 to-emerald-500",
    icon: Mic,
    mockup: (
      <div className="bg-gradient-to-r from-primary-50 to-purple-50 rounded-lg p-4">
        <div className="flex items-center space-x-3 mb-3">
          <div className="w-8 h-8 bg-gradient-to-r from-primary to-purple-500 rounded-full flex items-center justify-center">
            <span className="text-white text-xs">🤖</span>
          </div>
          <div className="text-left">
            <div className="text-sm font-medium text-gray-900">AI Interviewer</div>
            <div className="text-xs text-green-500 flex items-center">
              <div className="w-1.5 h-1.5 bg-green-500 rounded-full mr-1 animate-pulse"></div>
              Speaking
            </div>
          </div>
        </div>
        <div className="text-xs text-gray-700 text-left bg-white rounded p-2 mb-3">
          "Tell me about your experience with team leadership."
        </div>
        <Button className="bg-red-500 text-white px-4 py-2 rounded-full text-xs font-medium flex items-center mx-auto hover:bg-red-600">
          <Mic className="h-3 w-3 mr-2" />
          Recording...
        </Button>
      </div>
    )
  }
];

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="py-20 bg-gradient-to-br from-gray-50 to-blue-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
            How It{" "}
            <span className="gradient-text">Works</span>
          </h2>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            Get started in minutes with our streamlined three-stage interview process designed to simulate real-world scenarios.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 relative">
          {/* Connection lines for desktop */}
          <div className="hidden lg:block absolute top-1/2 left-1/3 w-1/3 h-0.5 bg-gradient-to-r from-primary/30 to-purple-500/30 transform -translate-y-1/2"></div>
          <div className="hidden lg:block absolute top-1/2 right-1/3 w-1/3 h-0.5 bg-gradient-to-r from-primary/30 to-purple-500/30 transform -translate-y-1/2"></div>

          {steps.map((step, index) => {
            const IconComponent = step.icon;
            return (
              <div key={step.number} className="relative">
                <Card className="bg-white rounded-2xl shadow-lg card-hover border-0">
                  <CardContent className="p-8">
                    <div className="text-center">
                      <div className={`w-16 h-16 bg-gradient-to-r ${step.color} rounded-full flex items-center justify-center mx-auto mb-6 relative`}>
                        <span className="text-white font-bold text-xl">{step.number}</span>
                        <div className="absolute -top-1 -right-1 w-6 h-6 bg-gradient-to-r from-green-500 to-emerald-600 rounded-full flex items-center justify-center">
                          <IconComponent className="h-3 w-3 text-white" />
                        </div>
                      </div>
                      
                      <h3 className="text-xl font-bold text-gray-900 mb-4">
                        {step.title}
                      </h3>
                      
                      <p className="text-gray-600 mb-6">
                        {step.description}
                      </p>
                      
                      {step.mockup}
                    </div>
                  </CardContent>
                </Card>
              </div>
            );
          })}
        </div>

        {/* Final Results Preview */}
        <Card className="mt-16 bg-white rounded-2xl shadow-lg border-0">
          <CardContent className="p-8">
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-gradient-to-r from-yellow-400 to-orange-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trophy className="h-8 w-8 text-white" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-2">Get Comprehensive Results</h3>
              <p className="text-gray-600">Receive detailed feedback with scores, strengths, areas for improvement, and personalized recommendations.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="text-center p-4 bg-green-50 rounded-xl">
                <div className="text-2xl font-bold text-green-600 mb-1">85%</div>
                <div className="text-sm text-gray-600">Overall Score</div>
              </div>
              <div className="text-center p-4 bg-blue-50 rounded-xl">
                <div className="text-2xl font-bold text-blue-600 mb-1">Strong</div>
                <div className="text-sm text-gray-600">Communication</div>
              </div>
              <div className="text-center p-4 bg-purple-50 rounded-xl">
                <div className="text-2xl font-bold text-purple-600 mb-1">3 Tips</div>
                <div className="text-sm text-gray-600">For Improvement</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
