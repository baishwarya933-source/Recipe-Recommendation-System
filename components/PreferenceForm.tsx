import React, { useState } from 'react';
import { UserPreferences } from '../types';
import SparklesIcon from './icons/SparklesIcon';
import ChevronDownIcon from './icons/ChevronDownIcon';

interface PreferenceFormProps {
  onSubmit: (preferences: UserPreferences) => void;
  isLoading: boolean;
}

const cuisineOptions = [
  "Any", "Italian", "Mexican", "Chinese", "Indian", "Japanese", "Thai", "French", "Greek", "Spanish", "American", "Mediterranean"
];

const dietaryOptions = [
  "None", "Non-Veg", "Vegetarian", "Vegan", "Gluten-Free", "Dairy-Free", "Nut-Free", "Pescatarian", "Keto"
];

const ingredientSuggestions = [
  "Chicken", "Beef", "Pork", "Fish", "Shrimp", "Tofu", "Tempeh", "Lentils", "Black Beans", "Chickpeas",
  "Rice", "Pasta", "Quinoa", "Potatoes", "Sweet Potatoes", "Onions", "Garlic", "Tomatoes", "Bell Peppers",
  "Broccoli", "Spinach", "Kale", "Mushrooms", "Carrots", "Zucchini", "Eggplant", "Avocado", "Lime",
  "Lemon", "Cilantro", "Basil", "Parsley", "Rosemary", "Thyme", "Oregano", "Cumin", "Coriander",
  "Turmeric", "Paprika", "Chili Powder", "Ginger", "Soy Sauce", "Olive Oil", "Coconut Milk", "Almonds",
  "Walnuts", "Cheese", "Feta", "Parmesan", "Eggs", "Bread"
];

interface AccordionStepProps {
  title: string;
  children: React.ReactNode;
  isActive: boolean;
  onToggle: () => void;
}

const AccordionStep: React.FC<AccordionStepProps> = ({ title, children, isActive, onToggle }) => (
  <div className="rounded-2xl transition-all duration-300 shadow-sm" style={{ backgroundColor: '#FFEFD5', border: '1px solid rgba(0,0,0,0.85)' }}>
    <h2>
      <button type="button" onClick={onToggle} className="flex items-center justify-between w-full p-5 font-semibold text-left text-stone-800 hover:bg-stone-50/50 rounded-2xl">
        <span>{title}</span>
        <ChevronDownIcon className={`w-5 h-5 transition-transform duration-300 ${isActive ? 'rotate-180' : ''}`} />
      </button>
    </h2>
    {isActive && (
      <div className="p-5 pt-0 animate-fade-in" style={{animationDuration: '0.4s'}}>
        <div style={{ borderTop: '1px solid rgba(0,0,0,0.85)' }} className="pt-4">
          {children}
        </div>
      </div>
    )}
  </div>
);

const PreferenceForm: React.FC<PreferenceFormProps> = ({ onSubmit, isLoading }) => {
  const [activeStep, setActiveStep] = useState<number>(1);
  const [preferences, setPreferences] = useState<UserPreferences>({
    cuisine: 'Any',
    dietaryRestrictions: 'None',
    includeIngredients: [],
  });
  const [currentIngredient, setCurrentIngredient] = useState('');

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const { name, value } = e.target;
    setPreferences((prev) => ({ ...prev, [name]: value }));
  };
  
  const handleAddIngredient = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedIngredient = currentIngredient.trim();
    if (trimmedIngredient && !preferences.includeIngredients.includes(trimmedIngredient)) {
      setPreferences(prev => ({
        ...prev,
        includeIngredients: [...prev.includeIngredients, trimmedIngredient],
      }));
    }
    setCurrentIngredient('');
  };

  const handleIngredientKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault(); // Prevent default form submission on Enter
      const trimmedIngredient = currentIngredient.trim();
      if (trimmedIngredient && !preferences.includeIngredients.includes(trimmedIngredient)) {
        setPreferences(prev => ({
          ...prev,
          includeIngredients: [...prev.includeIngredients, trimmedIngredient],
        }));
      }
      setCurrentIngredient('');
    }
  };

  const handleRemoveIngredient = (ingredientToRemove: string) => {
    setPreferences(prev => ({
      ...prev,
      includeIngredients: prev.includeIngredients.filter(ing => ing !== ingredientToRemove),
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(preferences);
  };
  
  const toggleStep = (step: number) => {
    setActiveStep(activeStep === step ? 0 : step);
  }

  return (
    <div className="backdrop-blur-sm p-6 md:p-8 rounded-2xl shadow-lg" style={{ backgroundColor: '#FFEFD5', border: '1px solid rgba(0,0,0,0.85)' }}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <AccordionStep title="Step 1: Choose Ingredients" isActive={activeStep === 1} onToggle={() => toggleStep(1)}>
          <label htmlFor="ingredient-input" className="block text-sm font-medium text-stone-700 mb-2">Add ingredients you like</label>
          <div className="flex gap-2 mb-3">
            <input
              id="ingredient-input"
              type="text"
              list="ingredient-suggestions"
              value={currentIngredient}
              onChange={(e) => setCurrentIngredient(e.target.value)}
              onKeyDown={handleIngredientKeyDown}
              placeholder="e.g., tomatoes"
              className="w-full px-4 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-green-400 focus:border-green-400 transition bg-white/70"
            />
            <button
              type="button"
              onClick={handleAddIngredient}
              className="px-4 py-2 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 transition-colors flex-shrink-0"
            >
              Add
            </button>
          </div>
          <datalist id="ingredient-suggestions">
            {ingredientSuggestions.map(ing => <option key={ing} value={ing} />)}
          </datalist>
          <div className="flex flex-wrap gap-2 min-h-[2.5rem]">
            {preferences.includeIngredients.map(ingredient => (
              <span key={ingredient} className="flex items-center gap-1.5 bg-green-100 text-green-800 text-sm font-medium px-3 py-1 rounded-full animate-fade-in" style={{animationDuration: '0.3s'}}>
                {ingredient}
                <button type="button" onClick={() => handleRemoveIngredient(ingredient)} className="text-green-600 hover:text-green-800">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                </button>
              </span>
            ))}
          </div>
        </AccordionStep>

        <AccordionStep title="Step 2: Choose Diet" isActive={activeStep === 2} onToggle={() => toggleStep(2)}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label htmlFor="cuisine" className="block text-sm font-medium text-stone-700 mb-1">Cuisine Type</label>
              <select name="cuisine" id="cuisine" value={preferences.cuisine} onChange={handleSelectChange} className="w-full px-4 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-green-400 focus:border-green-400 transition bg-white/70">
                {cuisineOptions.map(option => <option key={option} value={option}>{option}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="dietaryRestrictions" className="block text-sm font-medium text-stone-700 mb-1">Dietary Restrictions</label>
              <select name="dietaryRestrictions" id="dietaryRestrictions" value={preferences.dietaryRestrictions} onChange={handleSelectChange} className="w-full px-4 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-green-400 focus:border-green-400 transition bg-white/70">
                {dietaryOptions.map(option => <option key={option} value={option}>{option}</option>)}
              </select>
            </div>
          </div>
        </AccordionStep>

        <AccordionStep title="Step 3: Review and Create Recipes" isActive={activeStep === 3} onToggle={() => toggleStep(3)}>
            <div className="mb-4 space-y-2 text-sm text-stone-600">
                <p><strong className="font-semibold text-stone-700">Cuisine:</strong> {preferences.cuisine}</p>
                <p><strong className="font-semibold text-stone-700">Diet:</strong> {preferences.dietaryRestrictions}</p>
                <p><strong className="font-semibold text-stone-700">Ingredients:</strong> {preferences.includeIngredients.join(', ') || 'Any'}</p>
            </div>
             <button
              type="submit"
              disabled={isLoading}
              className="w-full flex items-center justify-center bg-green-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-transform duration-150 ease-in-out hover:scale-105 disabled:bg-stone-400 disabled:cursor-not-allowed disabled:scale-100"
            >
              {isLoading ? (
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
              ) : (
                <>
                  <SparklesIcon className="h-5 w-5 mr-2" />
                  Find My Meal
                </>
              )}
            </button>
        </AccordionStep>
      </form>
    </div>
  );
};

export default PreferenceForm;