import React from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Library as LibraryIcon, Menu, LayoutGrid, Layers } from 'lucide-react';

// Open Book Logo - Main Brand
const BookLogo = ({ className = "" }: { className?: string }) => (
  <svg 
    viewBox="0 0 512 512" 
    fill="currentColor"
    className={className}
    xmlns="http://www.w3.org/2000/svg"
  >
    {/* Open book with fanned pages */}
    <path d="M256 160c.3 0 160-48 160-48v288s-159.7 48-160 48c-.3 0-160-48-160-48V112s159.7 48 160 48z" opacity="0.2"/>
    <path d="M256 160v288M416 112v288M96 112v288M256 160c0-.3-80-32-128-48M256 160c0-.3 80-32 128-48" 
      stroke="currentColor" 
      strokeWidth="24" 
      strokeLinecap="round" 
      strokeLinejoin="round"
      fill="none"
    />
    <path d="M128 112l32-16 32 16M384 112l-32-16-32 16" 
      stroke="currentColor" 
      strokeWidth="20" 
      strokeLinecap="round" 
      strokeLinejoin="round"
      fill="none"
    />
  </svg>
);

interface HeaderProps {
  view: 'home' | 'library' | 'reader' | 'upload';
  darkMode: boolean;
  homeVariant?: 1 | 2;
  onToggleHomeVariant?: () => void;
  onToggleSidebar?: () => void;
  fileName?: string;
}

const Header: React.FC<HeaderProps> = ({ view, darkMode, homeVariant = 1, onToggleHomeVariant, onToggleSidebar, fileName }) => {
  const navigate = useNavigate();
  return (
    <header className={`fixed top-0 left-0 right-0 h-16 flex items-center justify-between px-6 z-50 transition-all duration-300 ${
      darkMode 
        ? 'bg-[#0D0D0F]/90 backdrop-blur-xl border-b border-gray-800' 
        : 'bg-white/70 backdrop-blur-xl border-b border-gray-200/50'
    }`}>
      <div className="flex items-center gap-3">
        {view !== 'reader' && onToggleSidebar && (
          <button
            onClick={onToggleSidebar}
            className={`lg:hidden p-2 -ml-2 rounded-lg transition-colors ${darkMode ? 'hover:bg-gray-800 text-gray-300' : 'hover:bg-gray-100 text-gray-600'}`}
            aria-label="Toggle menu"
          >
            <Menu size={24} strokeWidth={2} />
          </button>
        )}
        <span className={`font-semibold tracking-tight text-lg ${darkMode ? 'text-white' : 'text-gray-900'}`}>
          Lifewood PH
        </span>
        <BookLogo className={`w-6 h-6 ${darkMode ? 'text-white' : 'text-gray-900'}`} />
      </div>

      <div className="flex items-center gap-3">
        {view !== 'upload' && (
          <>
            {view !== 'home' && (
              <button
                onClick={() => navigate('/')}
                className={`flex items-center gap-2 px-4 py-1.5 text-sm font-medium rounded-full transition-all ${
                  darkMode ? 'hover:bg-gray-800 text-gray-300' : 'hover:bg-gray-100 text-gray-600'
                }`}
              >
                <span>Home</span>
              </button>
            )}
            <button
              onClick={() => navigate('/library')}
              className={`flex items-center gap-2 px-4 py-1.5 text-sm font-medium rounded-full transition-all ${
                view === 'library' 
                  ? darkMode ? 'bg-white text-black' : 'bg-black text-white' 
                  : darkMode ? 'hover:bg-gray-800 text-gray-300' : 'hover:bg-gray-100 text-gray-600'
              }`}
            >
              <LibraryIcon size={16} />
              <span>My Books</span>
            </button>
            
            {/* Home Variant Toggle */}
            {view === 'home' && onToggleHomeVariant && (
              <div className={`flex items-center rounded-full p-1 ${darkMode ? 'bg-gray-800/50' : 'bg-gray-200/50'}`}>
                <button
                  onClick={homeVariant === 1 ? undefined : onToggleHomeVariant}
                  className={`p-2 rounded-full transition-all ${
                    homeVariant === 1
                      ? darkMode ? 'bg-white text-black' : 'bg-black text-white'
                      : darkMode ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'
                  }`}
                  title="Card View"
                >
                  <LayoutGrid size={16} />
                </button>
                <button
                  onClick={homeVariant === 2 ? undefined : onToggleHomeVariant}
                  className={`p-2 rounded-full transition-all ${
                    homeVariant === 2
                      ? darkMode ? 'bg-white text-black' : 'bg-black text-white'
                      : darkMode ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'
                  }`}
                  title="Showcase View"
                >
                  <Layers size={16} />
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </header>
  );
};

export default Header;