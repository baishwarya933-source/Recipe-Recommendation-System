export interface UserPreferences {
  cuisine: string;
  dietaryRestrictions: string;
  includeIngredients: string[];
}

export interface Recommendation {
  dishName: string;
  description: string;
  ingredients: string[];
  imageBase64?: string;
  imageUrl?: string;
  instructions?: string[];
}

export interface NearbyStore {
  name: string;
  uri: string;
}

export interface HistoryItem {
  recommendation: Recommendation;
  preferences: UserPreferences;
}
