import React, { useState, useEffect, useCallback } from 'react';
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import SignUpPage from './pages/SignUpPage';
import DashboardPage from './pages/DashboardPage';
import Navbar from './components/Navbar';
import Chatbot from './components/Chatbot';

type Page = 'home' | 'login' | 'signup' | 'dashboard';

const App: React.FC = () => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState<Page>('home');

  useEffect(() => {
    const loggedInStatus = localStorage.getItem('isLoggedIn');
    const email = localStorage.getItem('currentUserEmail');
    if (loggedInStatus === 'true' && email) {
      setIsLoggedIn(true);
      setCurrentUserEmail(email);
      setCurrentPage('dashboard');
    }
  }, []);

  const handleLogin = useCallback((email: string) => {
    localStorage.setItem('isLoggedIn', 'true');
    localStorage.setItem('currentUserEmail', email);
    setIsLoggedIn(true);
    setCurrentUserEmail(email);
    setCurrentPage('dashboard');
  }, []);

  const handleLogout = useCallback(() => {
    localStorage.removeItem('isLoggedIn');
    localStorage.removeItem('currentUserEmail');
    setIsLoggedIn(false);
    setCurrentUserEmail(null);
    setCurrentPage('home');
  }, []);

  const handleNavigate = useCallback((page: Page) => {
    // protect dashboard route: require signup/login first
    if (page === 'dashboard' && !isLoggedIn) {
      setCurrentPage('signup');
      return;
    }
    setCurrentPage(page);
  }, [isLoggedIn]);

  const renderPage = () => {
    switch (currentPage) {
      case 'login':
        return <LoginPage onLogin={handleLogin} onNavigate={handleNavigate} />;
      case 'signup':
        return <SignUpPage onSignUp={(email, password) => {
          // register the user (mock)
          try {
            localStorage.setItem('registeredEmail', email);
            localStorage.setItem('registeredPassword', password);
            // one-time signup success message shown on dashboard
            localStorage.setItem('signupSuccessMessage', 'Account created and signed in successfully');
            // also remember last signed up email for short-term prefill (optional)
            localStorage.setItem('lastSignedUpEmail', email);
          } catch (err) {
            console.warn('Unable to persist registration locally', err);
          }
          // immediately log user in and navigate to dashboard
          handleLogin(email);
        }} onNavigate={handleNavigate} />;
      case 'dashboard':
        return <DashboardPage />;
      case 'home':
      default:
        return <HomePage onNavigate={handleNavigate} />;
    }
  };

  const homepageBg = ((import.meta as any).env?.VITE_HOMEPAGE_BG as string) || '/frontpage.jpg';
  const rootStyle: React.CSSProperties = currentPage === 'home' ? {
    backgroundImage: `linear-gradient(rgba(255,255,255,0.6), rgba(255,255,255,0.6)), url(${homepageBg})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
  } : {};

  return (
    <div style={rootStyle} className="min-h-screen font-sans text-stone-900">
      <Navbar isLoggedIn={isLoggedIn} onLogout={handleLogout} onNavigate={handleNavigate} />
      <main className="max-w-6xl mx-auto p-4 md:p-8">
        {renderPage()}
      </main>
      {/* Render chatbot only for logged-in users on the dashboard page */}
      {isLoggedIn && currentPage === 'dashboard' && (
        <Chatbot name={((import.meta as any).env?.VITE_CHATBOT_NAME as string) || 'DishGenius Assistant'} />
      )}
      <footer className="text-center p-6 mt-12 text-sm text-stone-500" style={{ borderTop: '1px solid rgba(0,0,0,0.85)' }}>
          <p>&copy; {new Date().getFullYear()} DishGenius. All rights reserved.</p>
          <p className="mt-1">Crafted with ❤️ and powered by the DishGenius AI.</p>
          <div className="mt-3 flex items-center justify-center space-x-4">
            {/* X / Twitter */}
            <a href="https://twitter.com/" target="_blank" rel="noreferrer" aria-label="Twitter" className="text-stone-600 hover:text-blue-500 transition">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M22 5.92c-.64.28-1.32.47-2.04.56.73-.44 1.28-1.14 1.54-1.98-.68.4-1.44.68-2.24.84C18.7 4.2 17.66 3.6 16.5 3.6c-1.9 0-3.44 1.56-3.44 3.48 0 .27.03.53.09.78-2.86-.14-5.4-1.52-7.1-3.62-.3.52-.47 1.12-.47 1.76 0 1.22.62 2.3 1.56 2.93-.58-.02-1.12-.18-1.6-.44v.04c0 1.7 1.2 3.12 2.78 3.44-.29.08-.6.12-.92.12-.22 0-.44-.02-.66-.06.44 1.36 1.72 2.34 3.24 2.37-1.18.92-2.66 1.46-4.28 1.46-.28 0-.56-.02-.84-.06 1.56 1 3.4 1.6 5.38 1.6 6.44 0 9.96-5.34 9.96-9.96v-.45c.7-.5 1.3-1.12 1.78-1.84-.64.28-1.32.48-2.04.56z" />
              </svg>
            </a>
            {/* Instagram */}
            <a href="https://www.instagram.com/" target="_blank" rel="noreferrer" aria-label="Instagram" className="text-stone-600 hover:text-pink-500 transition">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5zm5 6.2a4.8 4.8 0 1 0 0 9.6 4.8 4.8 0 0 0 0-9.6zm6.4-.9a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4zM12 9.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z" />
              </svg>
            </a>
            {/* Facebook */}
            <a href="https://www.facebook.com/" target="_blank" rel="noreferrer" aria-label="Facebook" className="text-stone-600 hover:text-blue-700 transition">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M22 12a10 10 0 1 0-11.5 9.9v-7H8.5v-3h2V9.1c0-2 1.2-3.1 3-3.1.9 0 1.8.16 1.8.16v2h-1c-1 0-1.3.62-1.3 1.25V12h2.2l-.35 3H14v7A10 10 0 0 0 22 12z" />
              </svg>
            </a>
            {/* LinkedIn */}
            <a href="https://www.linkedin.com/" target="_blank" rel="noreferrer" aria-label="LinkedIn" className="text-stone-600 hover:text-blue-600 transition">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M4.98 3.5a2.5 2.5 0 1 1 .02 0zM3 8.98h3.96V21H3zM9.5 8.98H13v1.66h.06c.43-.82 1.5-1.68 3.08-1.68 3.3 0 3.9 2.17 3.9 4.98V21h-3.96v-5.16c0-1.23-.02-2.82-1.72-2.82-1.72 0-1.98 1.34-1.98 2.73V21H9.5z" />
              </svg>
            </a>
            {/* YouTube */}
            <a href="https://www.youtube.com/" target="_blank" rel="noreferrer" aria-label="YouTube" className="text-stone-600 hover:text-red-600 transition">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M23.5 6.2s-.2-1.6-.8-2.3c-.8-.9-1.7-.9-2.1-1C16.8 2.4 12 2.4 12 2.4s-4.8 0-8.6.5c-.5.1-1.3.1-2.1 1-.6.7-.8 2.3-.8 2.3S0 8 0 9.8v2.4C0 15.9.5 17.6.5 17.6s.2 1.6.8 2.3c.8.9 1.8 1 2.3 1.1 1.7.2 7.4.5 8.9.5s4.8-.1 8.6-.5c.5-.1 1.3-.2 2.1-1 .6-.7.8-2.3.8-2.3s.5-1.7.5-3.5V9.8c0-1.8-.5-3.6-.5-3.6zM9.75 15.02V8.98l6.08 3.02-6.08 3.02z" />
              </svg>
            </a>
          </div>
      </footer>
    </div>
  );
};

export default App;