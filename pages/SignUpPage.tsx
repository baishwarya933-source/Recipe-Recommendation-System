import React from 'react';

type Page = 'home' | 'login' | 'signup' | 'dashboard';

interface SignUpPageProps {
  onSignUp: (email: string, password: string) => void;
  onNavigate: (page: Page) => void;
}

const SignUpPage: React.FC<SignUpPageProps> = ({ onSignUp, onNavigate }) => {
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    const email = (formData.get('email') || '').toString().trim();
    const password = (formData.get('password') || '').toString();
    // store the registered user in localStorage (mock)
    if (email && password) {
      // call the provided onSignUp handler (App will persist & navigate)
      onSignUp(email, password);
    }
  };
  const bgUrl = '/Recipee.jpg';

  return (
    <div className="fixed inset-0 bg-fixed bg-center bg-cover" style={{ backgroundImage: `url(${bgUrl})` }}>
      {/* subtle overlay so form remains readable over the photo */}
      <div className="absolute inset-0 bg-black/25" aria-hidden="true" />

      <div className="relative z-10 min-h-screen flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-lg mx-auto">
          <div className="bg-white/70 backdrop-blur-sm p-10 md:p-12 rounded-2xl shadow-lg border border-stone-200/80">
            <h2 className="text-center text-4xl md:text-5xl font-bold text-stone-800 mb-6">Create Your Account</h2>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-stone-700 mb-1">
              Full Name
            </label>
            <input
              type="text"
              name="name"
              id="name"
              required
              className="w-full px-4 py-3 border border-stone-300 rounded-lg focus:ring-2 focus:ring-green-400 focus:border-green-400 transition bg-white/70"
            />
          </div>
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-stone-700 mb-1">
              Email Address
            </label>
            <input
              type="email"
              name="email"
              id="email"
              required
              className="w-full px-4 py-3 border border-stone-300 rounded-lg focus:ring-2 focus:ring-green-400 focus:border-green-400 transition bg-white/70"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-stone-700 mb-1">
              Password
            </label>
            <input
              type="password"
              name="password"
              id="password"
              required
              className="w-full px-4 py-3 border border-stone-300 rounded-lg focus:ring-2 focus:ring-green-400 focus:border-green-400 transition bg-white/70"
            />
          </div>
          <button
            type="submit"
            className="w-full bg-green-600 text-white font-bold py-4 px-6 rounded-lg hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition text-lg"
          >
            Sign Up
          </button>
        </form>
        <p className="text-center text-sm text-stone-600 mt-6">
          Already have an account?{' '}
          <button onClick={() => onNavigate('login')} className="font-semibold text-green-600 hover:underline">
            Login
          </button>
        </p>
        </div>
      </div>
    </div>
  </div>
  );
};

export default SignUpPage;