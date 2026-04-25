import React from 'react';
import ForkKnifeIcon from './icons/ForkKnifeIcon';

type Page = 'home' | 'login' | 'signup' | 'dashboard';

interface NavbarProps {
  isLoggedIn: boolean;
  onLogout: () => void;
  onNavigate: (page: Page) => void;
}

const Navbar: React.FC<NavbarProps> = ({ isLoggedIn, onLogout, onNavigate }) => {
  return (
    <nav className="backdrop-blur-lg sticky top-0 z-50 border-b" style={{ backgroundColor: '#FFEFD5', borderBottom: '1px solid rgba(0,0,0,0.85)' }}>
      <div className="max-w-6xl mx-auto px-4 md:px-8">
        <div className="flex items-center justify-between h-16">
          <div 
            className="flex items-center cursor-pointer" 
            onClick={() => onNavigate(isLoggedIn ? 'dashboard' : 'home')}
          >
            <ForkKnifeIcon className="h-7 w-7 text-green-600" />
            <span className="ml-2 text-xl font-bold text-stone-800">DishGenius</span>
          </div>
          <div className="flex items-center space-x-2">
            {isLoggedIn ? (
              <button
                onClick={onLogout}
                className="px-4 py-2 text-sm font-semibold text-stone-600 bg-stone-100 rounded-lg hover:bg-stone-200 transition"
              >
                Logout
              </button>
            ) : (
              <>
                <button
                  onClick={() => onNavigate('login')}
                  className="px-4 py-2 text-sm font-semibold text-stone-600 hover:bg-stone-100 rounded-lg transition"
                >
                  Login
                </button>
                <button
                  onClick={() => onNavigate('signup')}
                  className="px-4 py-2 text-sm font-semibold text-white bg-green-600 rounded-lg hover:bg-green-700 transition"
                >
                  Sign Up
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;