import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Header from "@/components/Header";
import Hero from "@/components/Hero";
import Features from "@/components/Features";
import HowItWorks from "@/components/HowItWorks";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useInterview } from "@/hooks/useInterview";

export default function Landing() {
  const { user, dbUser } = useAuth();
  const navigate = useNavigate();
  const { createInterviewMutation } = useInterview();

  useEffect(() => {
    if (window.location.hash) {
      const id = window.location.hash.replace('#', '');
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ behavior: "smooth" });
      }
    }
  }, []);

  const handleStartInterview = () => {
    if (user && dbUser) {
      // User is logged in, redirect to dashboard
      navigate("/dashboard");
    } else {
      // User not logged in, redirect to signup page
      navigate("/signup");
    }
  };

  const handleWatchDemo = () => {
    // Scroll to how it works section
    document.getElementById('how-it-works')?.scrollIntoView({ 
      behavior: 'smooth' 
    });
  };

  return (
    <div className="min-h-screen bg-white">
      <Header />
      
      <main className="pt-16">
        <Hero 
          onStartInterview={handleStartInterview}
          onWatchDemo={handleWatchDemo}
        />
        <Features />
        <HowItWorks />
        
        {/* Call to Action Section */}
        <section className="py-12 sm:py-20 bg-gradient-to-r from-primary to-purple-600 relative overflow-hidden">
          <div className="absolute inset-0 bg-black opacity-10"></div>
          <div className="relative max-w-4xl mx-auto text-center px-4 sm:px-6 lg:px-8">
            <h2 className="text-2xl sm:text-3xl lg:text-5xl font-bold text-white mb-4 sm:mb-6">
              Ready to Ace Your Next Interview?
            </h2>
            <p className="text-base sm:text-xl text-blue-100 mb-6 sm:mb-8 max-w-2xl mx-auto">
              Join thousands of professionals who have improved their interview skills and landed their dream jobs with our AI-powered platform.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center items-center mb-6 sm:mb-8">
              <Button
                onClick={handleStartInterview}
                className="bg-white text-primary hover:bg-gray-100 px-6 sm:px-8 py-3 sm:py-4 text-base sm:text-lg font-semibold rounded-xl hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 w-full sm:w-auto"
              >
                Start Your Free Interview
                <span className="ml-2">→</span>
              </Button>
              <Button
                onClick={handleWatchDemo}
                className="bg-white text-primary hover:bg-gray-100 px-6 sm:px-8 py-3 sm:py-4 text-base sm:text-lg font-semibold rounded-xl hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 w-full sm:w-auto"
              >
                📅 Watch Demo
              </Button>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center space-y-2 sm:space-y-0 sm:space-x-8 text-blue-100 text-sm sm:text-base">
              <div className="flex items-center">
                <span className="mr-2">✓</span>
                <span>No credit card required</span>
              </div>
              <div className="flex items-center">
                <span className="mr-2">✓</span>
                <span>Start in under 2 minutes</span>
              </div>
              <div className="flex items-center">
                <span className="mr-2">✓</span>
                <span>Free feedback report</span>
              </div>
            </div>
          </div>
          
          {/* Decorative elements */}
          <div className="hidden sm:block absolute top-10 left-10 w-20 h-20 bg-white opacity-10 rounded-full"></div>
          <div className="hidden sm:block absolute bottom-10 right-10 w-32 h-32 bg-white opacity-5 rounded-full"></div>
          <div className="hidden sm:block absolute top-1/2 left-20 w-16 h-16 bg-white opacity-10 rounded-full"></div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
