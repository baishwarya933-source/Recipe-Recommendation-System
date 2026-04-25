import React, { useState } from 'react';

type Page = 'home' | 'login' | 'signup' | 'dashboard';

interface LoginPageProps {
  onLogin: (email: string) => void;
  onNavigate: (page: Page) => void;
}

const LoginPage: React.FC<LoginPageProps> = ({ onLogin, onNavigate }) => {
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const form = e.currentTarget;
    const formData = new FormData(form);
    const email = (formData.get('email') || '').toString().trim();
    const password = (formData.get('password') || '').toString();

    // Validate against registered user in localStorage (mock)
    const registeredEmail = localStorage.getItem('registeredEmail');
    const registeredPassword = localStorage.getItem('registeredPassword');

    if (!registeredEmail || !registeredPassword) {
      setError('No account found. Please sign up first.');
      // give user a moment to read the message then navigate to signup
      setTimeout(() => onNavigate('signup'), 900);
      return;
    }

    // Strict validation: email and password must match exactly
    if (email !== registeredEmail) {
      setError(`This account email (${registeredEmail}) does not match the login attempt. Please sign up with the correct email or use the registered email.`);
      return;
    }

    if (password !== registeredPassword) {
      setError('Incorrect password. Please try again or use the "Forgot password?" option to reset it.');
      return;
    }

    // Both email and password match - login successful
    try { localStorage.setItem('currentUser', email); } catch (e) {}
    onLogin(email);
  };

  const bgUrl = '/Recipee.jpg';
  // Only prefill email if the user just signed up (immediate flow)
  const prefillEmail = localStorage.getItem('lastSignedUpEmail') || '';

  return (
    <div className="fixed inset-0 bg-fixed bg-center bg-cover" style={{ backgroundImage: `url(${bgUrl})` }}>
      {/* subtle dark overlay for contrast */}
      <div className="absolute inset-0 bg-black/30" aria-hidden="true" />

      <div className="relative z-10 min-h-screen flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-lg mx-auto">
          <div className="p-10 md:p-12 rounded-2xl shadow-2xl border border-neutral-800/40" style={{ backgroundColor: 'rgba(18,18,20,0.92)' }}>
            <h2 className="text-center text-4xl md:text-5xl font-bold text-white mb-6">Welcome Back!</h2>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-neutral-300 mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  name="email"
                  id="email"
                  required
                  defaultValue={prefillEmail}
                  className="w-full px-4 py-3 rounded-lg transition bg-neutral-800 text-neutral-100 border border-neutral-700 focus:ring-2 focus:ring-green-400 focus:border-green-400"
                  placeholder="you@example.com"
                />
              </div>
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-neutral-300 mb-1">
                  Password
                </label>
                <input
                  type="password"
                  name="password"
                  id="password"
                  required
                  defaultValue=""
                  className="w-full px-4 py-3 rounded-lg transition bg-neutral-800 text-neutral-100 border border-neutral-700 focus:ring-2 focus:ring-green-400 focus:border-green-400"
                />
              </div>
              {error && <p className="text-center text-sm text-red-400">{error}</p>}
              <button
                type="submit"
                className="w-full bg-green-600 text-white font-bold py-4 px-6 rounded-lg hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition text-lg"
              >
                Login
              </button>
              <div className="flex justify-between items-center mt-2">
                <button type="button" onClick={() => {
                  const email = prompt('Enter your account email to reset password:') || '';
                  if (!email) return;
                  const registeredEmail = localStorage.getItem('registeredEmail');
                  if (email.trim() !== registeredEmail) {
                    alert('No account found for that email.');
                    return;
                  }
                  const newPass = prompt('Enter a new password for your account:');
                  if (!newPass) { alert('Password reset cancelled.'); return; }
                  localStorage.setItem('registeredPassword', newPass);
                  alert('Password reset successfully. You can now login with the new password.');
                }} className="text-sm text-neutral-300 hover:underline">Forgot password?</button>
              </div>
            </form>
            <p className="text-center text-sm text-neutral-300 mt-6">
              Don't have an account?{' '}
              <button onClick={() => onNavigate('signup')} className="font-semibold text-green-400 hover:underline">
                Sign up
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;