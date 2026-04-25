import React, { useState, useEffect } from 'react';
import { Recommendation, UserPreferences, NearbyStore, HistoryItem } from '../types';
import { getFoodRecommendations, getNearbyStores } from '../services/geminiService';
import PreferenceForm from '../components/PreferenceForm';
import RecommendationCard from '../components/RecommendationCard';
import LoadingSpinner from '../components/LoadingSpinner';
import AlertTriangleIcon from '../components/icons/AlertTriangleIcon';
import SearchXIcon from '../components/icons/SearchXIcon';
import NearbyStores from '../components/NearbyStores';
import RecipeModal from '../components/RecipeModal';
import HistorySection from '../components/HistorySection';

const DashboardPage: React.FC = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [nearbyStores, setNearbyStores] = useState<NearbyStore[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [activeRecipe, setActiveRecipe] = useState<Recommendation | null>(null);
  const [searchedPreferences, setSearchedPreferences] = useState<UserPreferences | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [oneTimeMessage, setOneTimeMessage] = useState<string | null>(null);
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    try {
      const storedHistory = localStorage.getItem('recipeHistory');
      if (storedHistory) {
        setHistory(JSON.parse(storedHistory));
      }
    } catch (e) {
      console.error("Failed to load or parse recipe history:", e);
      localStorage.removeItem('recipeHistory');
    }

    // check for any one-time message (e.g., signup success) and auto-hide it
    try {
      const msg = localStorage.getItem('signupSuccessMessage');
      if (msg) {
        setOneTimeMessage(msg);
        setShowBanner(true);
        // remove from storage immediately so it won't reappear on refresh
        localStorage.removeItem('signupSuccessMessage');
        localStorage.removeItem('lastSignedUpEmail');

        const hideTimer = window.setTimeout(() => {
          setShowBanner(false);
          // remove from DOM after the fade-out completes
          window.setTimeout(() => setOneTimeMessage(null), 400);
        }, 3000);

        return () => {
          clearTimeout(hideTimer);
        };
      }
    } catch (err) {}
  }, []);

  const handleGetRecommendations = async (preferences: UserPreferences) => {
    setIsLoading(true);
    setError(null);
    setRecommendations([]);
    setNearbyStores([]);
    setHasSearched(true);
    setSearchedPreferences(preferences);

    try {
      const recsPromise = getFoodRecommendations(preferences);
      let storesPromise: Promise<NearbyStore[]> = Promise.resolve([]);

      if (preferences.includeIngredients.length === 0) {
        storesPromise = new Promise((resolve) => {
           navigator.geolocation.getCurrentPosition(
            (position) => {
                getNearbyStores(position.coords.latitude, position.coords.longitude)
                    .then(resolve)
                    .catch(() => resolve([]));
            },
            () => {
                console.warn("Geolocation permission denied by user.");
                resolve([]);
            },
            { timeout: 5000 }
           );
        });
      }

      const [recsResult, storesResult] = await Promise.allSettled([recsPromise, storesPromise]);
      
      if (recsResult.status === 'fulfilled') {
        setRecommendations(recsResult.value);
      } else {
        console.error('Recipe fetch failed:', recsResult.reason);
        setError(recsResult.reason instanceof Error ? recsResult.reason.message : 'Failed to fetch recommendations.');
      }

      if (storesResult.status === 'fulfilled') {
        setNearbyStores(storesResult.value);
      } else {
        console.error('Nearby stores fetch failed:', storesResult.reason);
      }

    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleViewRecipe = (recipe: Recommendation, prefs: UserPreferences) => {
    setActiveRecipe(recipe);
    setSearchedPreferences(prefs);
    
    setHistory(prevHistory => {
      const filteredHistory = prevHistory.filter(item => item.recommendation.dishName !== recipe.dishName);
      const newHistory = [{ recommendation: recipe, preferences: prefs }, ...filteredHistory];
      const cappedHistory = newHistory.slice(0, 8);
      localStorage.setItem('recipeHistory', JSON.stringify(cappedHistory));
      return cappedHistory;
    });
  };

  const handleClearHistory = () => {
    setHistory([]);
    localStorage.removeItem('recipeHistory');
  };

  return (
    <div style={{ backgroundColor: '#99FFFF' }} className="min-h-screen overflow-x-hidden">
      <div className="space-y-12 max-w-6xl mx-auto p-6 md:p-8">
        <div>
          <h1 className="text-4xl md:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-green-600 to-teal-600 mb-2">
            Create Your Perfect Meal
          </h1>
          <p className="text-lg text-stone-600">
            Tell us what you're craving, and our AI chef will whip up some ideas for you.
          </p>
        </div>

        <PreferenceForm onSubmit={handleGetRecommendations} isLoading={isLoading} />

        <div className="mt-12">
          {oneTimeMessage && (
            <div className={`max-w-md mx-auto mb-6 text-center p-3 bg-green-100/70 text-green-800 rounded-md transition-opacity duration-500 ease-in-out transform ${showBanner ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2 pointer-events-none'}`}>
              {oneTimeMessage}
            </div>
          )}
          {isLoading && <LoadingSpinner />}
          
          {error && (
            <div className="max-w-md mx-auto text-center p-6 bg-red-100/60 text-red-700 rounded-2xl flex flex-col items-center justify-center gap-4 border border-red-200">
                <AlertTriangleIcon className="w-10 h-10" />
                <h3 className="font-bold text-lg">Oops! Something went wrong.</h3>
                <p className="text-sm">{error}</p>
            </div>
          )}

          {!isLoading && !error && hasSearched && (
            <>
              {nearbyStores.length > 0 && <NearbyStores stores={nearbyStores} />}
              {recommendations.length > 0 ? (
                <div>
                  <h2 className="text-3xl font-bold text-stone-800 mb-6">Your Personalized Recommendations:</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {recommendations.map((rec, index) => (
                      <RecommendationCard 
                        key={rec.dishName + index} 
                        recommendation={rec} 
                        index={index} 
                        onViewRecipe={() => searchedPreferences && handleViewRecipe(rec, searchedPreferences)}
                      />
                    ))}
                  </div>
                </div>
              ) : (
                <div className="max-w-md mx-auto text-center p-6 bg-stone-100/80 text-stone-600 rounded-2xl flex flex-col items-center justify-center gap-4 border border-stone-200">
                  <SearchXIcon className="w-10 h-10" />
                  <h3 className="font-bold text-lg">No Recipes Found</h3>
                  <p className="text-sm">We couldn't find any recipes matching your ingredients. Try adjusting your inputs!</p>
                </div>
              )}
            </>
          )}
        </div>

        {!isLoading && (
            <HistorySection 
                history={history}
                onViewRecipe={(item) => handleViewRecipe(item.recommendation, item.preferences)}
                onClearHistory={handleClearHistory}
            />
        )}
      </div>
      {activeRecipe && searchedPreferences && (
        <RecipeModal 
          recommendation={activeRecipe} 
          onClose={() => setActiveRecipe(null)} 
          preferences={searchedPreferences} 
        />
      )}
    </div>
  );
};

export default DashboardPage;
