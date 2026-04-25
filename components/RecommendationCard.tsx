import React from 'react';
import { Recommendation } from '../types';

interface RecommendationCardProps {
  recommendation: Recommendation;
  index: number;
  onViewRecipe: () => void;
}

const RecommendationCard: React.FC<RecommendationCardProps> = ({ recommendation, index, onViewRecipe }) => {
  return (
    <div
      className="rounded-2xl shadow-md hover:shadow-lg overflow-hidden transform hover:-translate-y-1 transition-all duration-300 ease-in-out flex flex-col group animate-fade-in"
      style={{ backgroundColor: '#FFEFD5', animationDelay: `${index * 100}ms`, border: '1px solid rgba(0,0,0,0.85)' }}
    >
      <div className="p-5 flex flex-col flex-grow">
        <h3 className="text-xl font-bold text-stone-800 mb-2">{recommendation.dishName}</h3>
        <p className="text-stone-600 text-sm mb-4 flex-grow">{recommendation.description}</p>

        {Array.isArray((recommendation as any).ingredients) && (recommendation as any).ingredients.length > 0 && (
          <div className="mb-3">
            <h4 className="text-sm font-semibold text-stone-700 mb-1">Ingredients:</h4>
            <ul className="text-xs text-stone-600 list-disc list-inside">
              {(recommendation as any).ingredients.slice(0, 8).map((ing: string, i: number) => (
                <li key={i}>{ing}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-auto">
          <button
            onClick={onViewRecipe}
            className="w-full text-center bg-green-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-all duration-200 ease-in-out"
          >
            View Recipe
          </button>
        </div>
      </div>
    </div>
  );
};

export default RecommendationCard;