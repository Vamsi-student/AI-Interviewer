import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Menu, X, Bell, Search, User, LogOut } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { signOut } from "@/lib/auth";

export default function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const { user, dbUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Helper to scroll to section or navigate
  const handleSectionScroll = (sectionId: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    if (location.pathname === "/") {
      const el = document.getElementById(sectionId);
      if (el) {
        el.scrollIntoView({ behavior: "smooth" });
      } else {
        // fallback: update hash
        window.location.hash = `#${sectionId}`;
      }
    } else {
      navigate(`/#${sectionId}`);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      window.location.href = "/";
    } catch (error) {
      console.error('Sign out error:', error);
    }
  };

  return (
    <header className="bg-white shadow-sm fixed w-full top-0 z-50">
      <div className="max-w-7xl mx-auto px-2 sm:px-4 lg:px-8">
        <div className="flex justify-between items-center h-16 relative">
          {/* Logo */}
          <div className="flex items-center space-x-2 min-w-0">
            <Link to="/" className="flex items-center min-w-0">
              <div className="bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg p-1">
                <span className="text-white font-bold text-lg px-2">AI</span>
              </div>
              <span className="ml-2 text-xl font-bold text-purple-700 truncate max-w-[120px] sm:max-w-none">AI Interviewer</span>
            </Link>
          </div>

          {/* Navigation */}
          <nav className="hidden md:flex items-center space-x-4 lg:space-x-8">
            <Link to="/">
              <span className="text-base font-medium text-gray-700 hover:text-purple-700 transition whitespace-nowrap">Home</span>
            </Link>
            <Link to="/dashboard">
              <span className="text-base font-medium text-gray-700 hover:text-purple-700 transition whitespace-nowrap">Dashboard</span>
            </Link>
            <a href="#features" onClick={handleSectionScroll("features")}
              className="text-base font-medium text-gray-700 hover:text-purple-700 transition whitespace-nowrap cursor-pointer">
              Features
            </a>
            <a href="#how-it-works" onClick={handleSectionScroll("how-it-works")}
              className="text-base font-medium text-gray-700 hover:text-purple-700 transition whitespace-nowrap cursor-pointer">
              How it Works
            </a>
          </nav>

          {/* Actions */}
          <div className="hidden md:flex items-center space-x-2 sm:space-x-4">
            {user && dbUser ? (
              <>
                <Link to="/profile">
                  <div className="w-8 h-8 sm:w-9 sm:h-9 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white text-lg font-bold cursor-pointer">
                    {dbUser.name?.charAt(0).toUpperCase() || 'U'}
                  </div>
                </Link>
                <Button
                  variant="outline"
                  onClick={handleSignOut}
                  className="border-red-400 text-red-500 hover:bg-red-50 hover:border-red-500 font-semibold px-3 sm:px-4 py-2 ml-1 sm:ml-2 text-sm sm:text-base"
                >
                  <LogOut className="h-4 w-4 mr-2" />
                  <span className="hidden sm:inline">Sign Out</span>
                </Button>
              </>
            ) : (
              <Link to="/signup">
                <Button className="bg-gradient-to-br from-blue-500 to-purple-600 text-white font-semibold px-3 sm:px-4 py-2 text-sm sm:text-base">
                  <User className="h-4 w-4 mr-2" />
                  Login
                </Button>
              </Link>
            )}
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden flex items-center">
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
        <div className="md:hidden bg-white shadow-lg">
          <div className="px-2 pt-2 pb-3 space-y-1">
            <Link to="/">
              <span className="block px-3 py-2 text-base font-medium text-gray-700 hover:text-purple-700 hover:bg-gray-50 rounded-md">Home</span>
            </Link>
            <Link to="/dashboard">
              <span className="block px-3 py-2 text-base font-medium text-gray-700 hover:text-purple-700 hover:bg-gray-50 rounded-md">Dashboard</span>
            </Link>
            <a href="#features" onClick={handleSectionScroll("features")}
              className="block px-3 py-2 text-base font-medium text-gray-700 hover:text-purple-700 hover:bg-gray-50 rounded-md cursor-pointer">
              Features
            </a>
            <a href="#how-it-works" onClick={handleSectionScroll("how-it-works")}
              className="block px-3 py-2 text-base font-medium text-gray-700 hover:text-purple-700 hover:bg-gray-50 rounded-md cursor-pointer">
              How it Works
            </a>
            <div className="flex items-center space-x-2 mt-2">
              {user && dbUser ? (
                <>
                  <Link to="/profile">
                    <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white text-lg font-bold cursor-pointer">
                      {dbUser.name?.charAt(0).toUpperCase() || 'U'}
                    </div>
                  </Link>
                  <Button
                    variant="outline"
                    onClick={handleSignOut}
                    className="border-red-400 text-red-500 hover:bg-red-50 hover:border-red-500 font-semibold px-3 py-2 ml-2 text-sm"
                  >
                    <LogOut className="h-4 w-4 mr-2" />
                    Sign Out
                  </Button>
                </>
              ) : (
                <Link to="/signup">
                  <Button className="bg-gradient-to-br from-blue-500 to-purple-600 text-white font-semibold px-3 py-2 text-sm">
                    <User className="h-4 w-4 mr-2" />
                    Login
                  </Button>
                </Link>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Profile Photo Modal */}
      <Dialog open={showPhotoModal} onOpenChange={setShowPhotoModal}>
        <DialogContent className="max-w-sm p-6">
          <DialogTitle>Profile Photo</DialogTitle>
          <div className="text-center space-y-4">
            {/* Circular Profile Photo in Modal */}
            <div className="flex justify-center">
              {dbUser?.profileImage ? (
                <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-gray-200 shadow-lg">
                  <img 
                    src={dbUser.profileImage} 
                    alt="Profile" 
                    className="w-full h-full object-cover"
                  />
                </div>
              ) : (
                <div className="w-32 h-32 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white text-4xl font-bold border-4 border-gray-200 shadow-lg">
                  {dbUser?.name?.charAt(0).toUpperCase() || 'U'}
                </div>
              )}
            </div>
            
            {/* User Info */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900">{dbUser?.name}</h3>
              <p className="text-sm text-gray-600">{dbUser?.email}</p>
            </div>
            
            {/* Action Buttons */}
            <div className="flex flex-col space-y-2">
              <Link to="/profile">
                <Button 
                  onClick={() => setShowPhotoModal(false)}
                  className="w-full"
                >
                  <User className="h-4 w-4 mr-2" />
                  View Profile
                </Button>
              </Link>
              
              <Button
                variant="ghost"
                onClick={() => setShowPhotoModal(false)}
                className="w-full"
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </header>
  );
}
