import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Menu, X, Brain } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { signOut } from "@/lib/auth";

interface HeaderProps {
  onAuthClick?: () => void;
}

export default function Header({ onAuthClick }: HeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { user, dbUser } = useAuth();
  const [location] = useLocation();

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Sign out error:', error);
    }
  };

  const navLinks = [
    { href: "#home", label: "Home" },
    { href: "#features", label: "Features" },
    { href: "#how-it-works", label: "How it Works" },
  ];

  return (
    <header className="bg-white shadow-sm fixed w-full top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16 relative">
          {/* Logo */}
          <div className="flex items-center">
            <Link href="/" className="flex items-center">
              <Brain className="h-8 w-8 text-primary mr-2" />
              <span className="text-xl font-bold text-gray-900">AI Interviewer</span>
            </Link>
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center space-x-8">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="text-gray-700 hover:text-primary px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap"
              >
                {link.label}
              </a>
            ))}
          </nav>

          {/* Auth Buttons */}
          <div className="hidden md:flex items-center space-x-4">
            {user && dbUser ? (
              <div className="flex items-center space-x-4">
                <span className="text-sm text-gray-600">Welcome, {dbUser.name}</span>
                <Link href="/dashboard">
                  <Button variant="ghost" className="text-gray-700 hover:text-primary">
                    Dashboard
                  </Button>
                </Link>
                <Button
                  variant="ghost"
                  onClick={handleSignOut}
                  className="text-gray-700 hover:text-primary"
                >
                  Sign Out
                </Button>
              </div>
            ) : (
              <>
                <Button
                  variant="ghost"
                  onClick={onAuthClick}
                  className="text-gray-700 hover:text-primary"
                >
                  Login
                </Button>
                <Button
                  onClick={onAuthClick}
                  className="bg-primary text-white hover:bg-primary/90"
                >
                  Get Started
                </Button>
              </>
            )}
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="text-gray-700 hover:text-primary p-2"
            >
              {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </Button>
          </div>
        </div>
      </div>

      {/* Mobile Navigation Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden">
          <div className="px-2 pt-2 pb-3 space-y-1 bg-white shadow-lg">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="block px-3 py-2 text-base font-medium text-gray-700 hover:text-primary hover:bg-gray-50 rounded-md"
                onClick={() => setMobileMenuOpen(false)}
              >
                {link.label}
              </a>
            ))}
            <div className="px-3 py-2 space-y-2">
              {user && dbUser ? (
                <>
                  <Link href="/dashboard">
                    <Button
                      variant="ghost"
                      className="w-full text-left justify-start text-gray-700 hover:text-primary"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      Dashboard
                    </Button>
                  </Link>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      handleSignOut();
                      setMobileMenuOpen(false);
                    }}
                    className="w-full text-left justify-start text-gray-700 hover:text-primary"
                  >
                    Sign Out
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      onAuthClick?.();
                      setMobileMenuOpen(false);
                    }}
                    className="w-full text-left justify-start text-gray-700 hover:text-primary"
                  >
                    Login
                  </Button>
                  <Button
                    onClick={() => {
                      onAuthClick?.();
                      setMobileMenuOpen(false);
                    }}
                    className="w-full btn-primary"
                  >
                    Get Started
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
