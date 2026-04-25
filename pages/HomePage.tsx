import React from 'react';
import SparklesIcon from '../components/icons/SparklesIcon';
import GlobeIcon from '../components/icons/GlobeIcon';
import LeafIcon from '../components/icons/LeafIcon';

type Page = 'home' | 'login' | 'signup' | 'dashboard';

interface HomePageProps {
  onNavigate: (page: Page) => void;
}

const FeatureCard: React.FC<{ icon: React.ReactNode; title: string; children: React.ReactNode }> = ({ icon, title, children }) => (
  <div className="bg-white/50 backdrop-blur-lg p-6 rounded-2xl border border-stone-200/80 text-center shadow-lg">
    <div className="inline-block bg-green-100 text-green-700 p-3 rounded-full mb-4">
        {icon}
      </div>
      <h3 className="text-lg font-bold text-stone-900 mb-2">{title}</h3>
      <p className="text-stone-800 text-sm">{children}</p>
  </div>
);

const HomePage: React.FC<HomePageProps> = ({ onNavigate }) => {
  const bgUrl = '/frontpage.jpg';

  return (
    <div
      className="fixed inset-0 bg-fixed bg-center bg-cover"
      style={{
        backgroundImage: `url(${bgUrl})`,
      }}
    >
      {/* subtle white overlay to keep text readable while letting the image show through */}
      <div className="absolute inset-0 bg-white/6" aria-hidden="true" />

      {/* content wrapper sits above the background and stretches to full viewport so the hero covers the entire page */}
      <div className="relative z-10 min-h-screen flex flex-col justify-center">
        <div className="w-full max-w-6xl mx-auto px-4 text-center py-16 md:py-24">
            <h1 className="text-5xl md:text-7xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-green-600 to-teal-600">
            Discover Your Next Meal
          </h1>
          <p className="mt-4 text-lg md:text-xl text-stone-900 max-w-2xl mx-auto">
            Tired of the same old recipes? Let our AI chef curate personalized meal recommendations just for you, based on your tastes and dietary needs.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={() => onNavigate('signup')}
              className="w-full sm:w-auto bg-green-600 text-white font-bold py-3 px-8 rounded-lg hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-transform duration-150 ease-in-out hover:scale-105 text-lg"
            >
              Get Started Free
            </button>
            <button
              onClick={() => onNavigate('login')}
              className="w-full sm:w-auto bg-white/40 backdrop-blur-sm border border-white/20 text-stone-900 font-bold py-3 px-8 rounded-lg hover:bg-white/50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition text-lg"
            >
              I have an account
            </button>
          </div>
        </div>

        <div className="py-16 md:py-24">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-stone-900">Why You'll Love DishGenius</h2>
            <p className="mt-3 text-stone-900 max-w-xl mx-auto">
              From endless variety to perfectly tailored suggestions, find your food inspiration here.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto px-4">
            <FeatureCard
              icon={<SparklesIcon className="w-6 h-6" />}
              title="Personalized AI Magic"
            >
              Our smart AI understands your preferences to suggest meals you're guaranteed to enjoy.
            </FeatureCard>
            <FeatureCard
              icon={<GlobeIcon className="w-6 h-6" />}
              title="Explore Global Cuisines"
            >
              Journey through a world of flavors, from Italian classics to spicy Thai street food.
            </FeatureCard>
            <FeatureCard
              icon={<LeafIcon className="w-6 h-6" />}
              title="Fits Your Diet"
            >
              Whether you're vegan, gluten-free, or keto, we find delicious recipes that meet your needs.
            </FeatureCard>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HomePage;