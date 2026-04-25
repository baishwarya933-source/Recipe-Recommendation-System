import React, { useState, useEffect } from 'react';
import { Recommendation, UserPreferences } from '../types';
import { getFullRecipe, getNearbyStoresWithQuery } from '../services/geminiClient';
import LoadingSpinner from './LoadingSpinner';
import AlertTriangleIcon from './icons/AlertTriangleIcon';

interface RecipeModalProps {
  recommendation: Recommendation;
  onClose: () => void;
  preferences: UserPreferences;
}

const RecipeModal: React.FC<RecipeModalProps> = ({ recommendation, onClose, preferences }) => {
  const [fullRecipe, setFullRecipe] = useState<Pick<Recommendation, 'ingredients' | 'instructions'> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [missingIngredients, setMissingIngredients] = useState<string[]>([]);
  const [nearbyStores, setNearbyStores] = useState<{ name: string; uri: string }[]>([]);
  const [storesLoading, setStoresLoading] = useState(false);

  useEffect(() => {
    if (!fullRecipe) {
      setMissingIngredients([]);
      return;
    }

    const userHas = (preferences.includeIngredients || []).map((s) => String(s).toLowerCase());
    const missing = (fullRecipe.ingredients || []).filter((ing) => {
      const low = String(ing || '').toLowerCase();
      return !userHas.some(h => low.includes(h) || h.includes(low));
    });

    setMissingIngredients(missing);
  }, [fullRecipe, preferences.includeIngredients]);

  useEffect(() => {
    const fetchRecipe = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const recipeData = await getFullRecipe(recommendation.dishName, recommendation.description, preferences);
        setFullRecipe(recipeData);
      } catch (err: any) {
        setError(err.message || 'Could not load the recipe.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchRecipe();
  }, [recommendation.dishName, recommendation.description, preferences]);

  return (
    <div 
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-modal-fade-in"
      onClick={onClose}
    >
      <div 
        className="backdrop-blur-sm rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col animate-modal-slide-up" style={{ backgroundColor: '#FFEFD5' }}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="p-5 border-b border-stone-200/30 flex justify-between items-center sticky top-0 rounded-t-2xl backdrop-blur-sm" style={{ backgroundColor: '#FFEFD5' }}>
          <h2 className="text-2xl font-bold text-stone-800">{recommendation.dishName}</h2>
          <button onClick={onClose} className="text-stone-500 hover:text-stone-800">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </header>

        <div className="overflow-y-auto p-6 space-y-6">
            {/* images removed: modal now shows recipe text only */}
            {isLoading && <LoadingSpinner />}
            
            {error && (
              <div className="text-center p-4 bg-red-100/40 text-red-700 rounded-lg flex items-center justify-center gap-2 backdrop-blur-sm">
                <AlertTriangleIcon className="w-5 h-5" />
                <p>{error}</p>
              </div>
            )}
            
            {fullRecipe && (
                <div className="animate-fade-in">
                    <div className="mb-6">
                        <h3 className="text-xl font-semibold text-stone-800 mb-3 border-b pb-2">Ingredients</h3>
                        <ul className="list-disc list-inside space-y-1.5 text-stone-700 text-sm">
                                {fullRecipe.ingredients?.map((ing, i) => <li key={i}>{ing}</li>)}
                        </ul>
                        {/* If user doesn't have some ingredients, show a Find Nearby Stores button */}
                        {missingIngredients.length > 0 && (
                          <div className="mt-4 p-3 bg-yellow-50/40 border border-yellow-100/40 rounded-lg backdrop-blur-sm">
                            <p className="text-sm text-yellow-800 mb-2">You are missing: <strong>{missingIngredients.join(', ')}</strong></p>
                            <div className="flex gap-2">
                              <button
                                className="px-3 py-2 bg-green-600 text-white rounded-lg text-sm"
                                onClick={() => {
                                  setStoresLoading(true);
                                  navigator.geolocation.getCurrentPosition(async (pos) => {
                                    try {
                                      const q = missingIngredients.join(' ');
                                      const stores = await getNearbyStoresWithQuery(pos.coords.latitude, pos.coords.longitude, q);
                                      setNearbyStores(stores || []);
                                    } catch (e) {
                                      console.warn('Nearby stores lookup failed:', e);
                                      setNearbyStores([]);
                                    } finally {
                                      setStoresLoading(false);
                                    }
                                  }, (err) => { console.warn('Geolocation failed:', err); setStoresLoading(false); setNearbyStores([]); }, { timeout: 10000 });
                                }}
                              >Find Nearby Stores</button>
                              <button className="px-3 py-2 bg-stone-100/30 text-stone-800 rounded-lg text-sm" onClick={() => setMissingIngredients([])}>Dismiss</button>
                            </div>
                            {storesLoading && <p className="text-sm text-stone-600 mt-2">Searching for stores near you…</p>}
                            {nearbyStores.length > 0 && (
                              <ul className="mt-3 space-y-2">
                                {nearbyStores.map((s, idx) => (
                                  <li key={idx} className="p-2 rounded-md" style={{ backgroundColor: '#FFEFD5' }}>
                                    <a href={s.uri} target="_blank" rel="noopener noreferrer" className="text-sm text-green-700 font-medium">{s.name}</a>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        )}
                    </div>
                    <div>
                        <h3 className="text-xl font-semibold text-stone-800 mb-3 border-b pb-2">Instructions</h3>
                        <ol className="list-decimal list-inside space-y-3 text-stone-700 text-sm">
                            {fullRecipe.instructions?.map((step, i) => <li key={i}>{step}</li>)}
                        </ol>
                    </div>
                </div>
            )}

        </div>
      </div>
    </div>
  );
};

export default RecipeModal;