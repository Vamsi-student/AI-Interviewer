import { Card, CardContent } from "@/components/ui/card";
import { Star } from "lucide-react";

const testimonials = [
  {
    name: "Sarah Chen",
    role: "Software Developer at Google",
    image: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop&crop=face",
    rating: 5,
    text: "The AI feedback was incredibly detailed and helped me identify specific areas to improve. I landed my dream job at a top tech company after just 2 weeks of practice!"
  },
  {
    name: "Maria Rodriguez", 
    role: "Marketing Manager at Adobe",
    image: "https://images.unsplash.com/photo-1494790108755-2616b9df9b97?w=100&h=100&fit=crop&crop=face",
    rating: 5,
    text: "The voice interview feature made me feel like I was talking to a real interviewer. It helped me overcome my nervousness and speak more confidently."
  },
  {
    name: "James Thompson",
    role: "Data Scientist at Netflix", 
    image: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop&crop=face",
    rating: 5,
    text: "The coding challenges were perfectly tailored to my experience level. The real-time feedback helped me optimize my solutions before the actual interview."
  },
  {
    name: "Emily Davis",
    role: "Junior Developer at Stripe",
    image: "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=100&h=100&fit=crop&crop=face",
    rating: 5,
    text: "As a recent graduate, this platform gave me the confidence I needed. The progress tracking showed my improvement over time."
  },
  {
    name: "Alex Kumar",
    role: "Product Manager at Meta",
    image: "https://images.unsplash.com/photo-1560250097-0b93528c311a?w=100&h=100&fit=crop&crop=face",
    rating: 5,
    text: "The multi-stage process perfectly replicated my actual interviews. I felt completely prepared when the real day came."
  },
  {
    name: "Lisa Wang",
    role: "UX Designer at Airbnb",
    image: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=100&h=100&fit=crop&crop=face",
    rating: 5,
    text: "The personalized feedback was game-changing. I could see exactly where I needed to improve and track my progress."
  }
];

const stats = [
  { value: "10,000+", label: "Users Helped", color: "text-primary" },
  { value: "95%", label: "Success Rate", color: "text-green-600" },
  { value: "50,000+", label: "Interviews Completed", color: "text-purple-600" },
  { value: "4.9/5", label: "Average Rating", color: "text-orange-600" }
];

const bgColors = [
  "from-blue-50 to-primary-50",
  "from-purple-50 to-pink-50", 
  "from-green-50 to-emerald-50",
  "from-orange-50 to-amber-50",
  "from-indigo-50 to-blue-50",
  "from-teal-50 to-cyan-50"
];

export default function Testimonials() {
  return (
    <section id="testimonials" className="py-20 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
            What Our Users{" "}
            <span className="gradient-text">Say</span>
          </h2>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            Join thousands of professionals who have improved their interview skills and landed their dream jobs.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {testimonials.map((testimonial, index) => (
            <Card
              key={index}
              className={`bg-gradient-to-br ${bgColors[index]} rounded-2xl border-0 card-hover`}
            >
              <CardContent className="p-8">
                <div className="flex items-center mb-4">
                  <div className="flex text-yellow-400">
                    {[...Array(testimonial.rating)].map((_, i) => (
                      <Star key={i} className="h-4 w-4 fill-current" />
                    ))}
                  </div>
                </div>
                
                <blockquote className="text-gray-700 mb-6">
                  "{testimonial.text}"
                </blockquote>
                
                <div className="flex items-center">
                  <img
                    src={testimonial.image}
                    alt={`${testimonial.name}'s profile`}
                    className="w-12 h-12 rounded-full object-cover mr-4"
                  />
                  <div>
                    <div className="font-semibold text-gray-900">{testimonial.name}</div>
                    <div className="text-sm text-gray-600">{testimonial.role}</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Stats Section */}
        <div className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-8">
          {stats.map((stat, index) => (
            <div key={index} className="text-center">
              <div className={`text-3xl font-bold ${stat.color} mb-2`}>
                {stat.value}
              </div>
              <div className="text-gray-600">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
