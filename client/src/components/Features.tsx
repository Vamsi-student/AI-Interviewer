import { Card, CardContent } from "@/components/ui/card";
import { 
  Layers, 
  Brain, 
  Mic, 
  Code, 
  TrendingUp, 
  Briefcase,
  Check 
} from "lucide-react";

const featureData = [
  {
    icon: Layers,
    title: "Multi-Stage Interview Process",
    description: "Experience realistic interviews with MCQ questions, coding challenges, and live voice conversations tailored to your role.",
    color: "from-blue-500 to-blue-600",
    bgColor: "from-blue-50 to-primary-50",
    features: [
      "Multiple choice assessments",
      "Technical coding challenges", 
      "Real-time voice interviews"
    ]
  },
  {
    icon: Brain,
    title: "AI-Powered Instant Feedback",
    description: "Get detailed analysis of your performance with personalized suggestions for improvement after every response.",
    color: "from-purple-500 to-pink-500",
    bgColor: "from-purple-50 to-pink-50",
    features: [
      "Communication skills analysis",
      "Confidence level assessment",
      "Technical competency scoring"
    ]
  },
  {
    icon: Mic,
    title: "Natural Voice Interaction",
    description: "Practice with AI that speaks to you and listens to your responses, just like a real interview experience.",
    color: "from-green-500 to-emerald-600",
    bgColor: "from-green-50 to-emerald-50",
    features: [
      "Text-to-speech questions",
      "Voice-to-text responses",
      "Spoken feedback delivery"
    ]
  },
  {
    icon: Code,
    title: "Integrated Code Editor",
    description: "Solve coding problems in a professional environment with syntax highlighting and real-time execution.",
    color: "from-orange-500 to-amber-500",
    bgColor: "from-orange-50 to-amber-50",
    features: [
      "Multiple programming languages",
      "Automatic test case validation",
      "Performance metrics analysis"
    ]
  },
  {
    icon: TrendingUp,
    title: "Progress Tracking",
    description: "Monitor your improvement over time with detailed analytics and performance history.",
    color: "from-indigo-500 to-blue-600",
    bgColor: "from-indigo-50 to-blue-50",
    features: [
      "Interview history dashboard",
      "Skill improvement metrics",
      "Personalized recommendations"
    ]
  },
  {
    icon: Briefcase,
    title: "Role-Specific Preparation",
    description: "Customize your practice sessions based on your target role and experience level across various industries.",
    color: "from-teal-500 to-cyan-600",
    bgColor: "from-teal-50 to-cyan-50",
    features: [
      "Technical and non-technical roles",
      "Experience-based difficulty",
      "Industry-specific scenarios"
    ]
  }
];

export default function Features() {
  return (
    <section id="features" className="py-20 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
            Everything You Need to{" "}
            <span className="gradient-text">Succeed</span>
          </h2>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            Our comprehensive platform combines cutting-edge AI technology with proven interview techniques to give you the edge you need.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {featureData.map((feature, index) => {
            const IconComponent = feature.icon;
            return (
              <Card
                key={index}
                className={`bg-gradient-to-br ${feature.bgColor} rounded-2xl border-0 card-hover`}
              >
                <CardContent className="p-8">
                  <div className={`w-14 h-14 bg-gradient-to-r ${feature.color} rounded-xl flex items-center justify-center mb-6`}>
                    <IconComponent className="h-6 w-6 text-white" />
                  </div>
                  
                  <h3 className="text-xl font-bold text-gray-900 mb-4">
                    {feature.title}
                  </h3>
                  
                  <p className="text-gray-600 mb-4">
                    {feature.description}
                  </p>
                  
                  <ul className="space-y-2">
                    {feature.features.map((item, idx) => (
                      <li key={idx} className="flex items-center text-sm text-gray-500">
                        <Check className="h-4 w-4 text-green-500 mr-2 flex-shrink-0" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}
