import { UserPreferences, Recommendation, NearbyStore } from '../types';

// Frontend should call backend endpoints; avoid using server-only libraries in the browser.
const jsonPost = async (url: string, body: any) => {
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`Request to ${url} failed: ${resp.status} ${resp.statusText} ${text}`);
  }
  return resp.json();
};

const getFoodRecommendations = async (preferences: UserPreferences): Promise<Recommendation[]> => {
  // POST to backend proxy which handles AI/image generation and caching server-side
  const payload = { ...preferences };
  const baseUrl = process.env.VITE_API_BASE_URL || '';
  const url = baseUrl ? `${baseUrl}/api/recommendations` : `/api/recommendations`;
  const data = await jsonPost(url, payload);
  // Expect server to return an array of Recommendation-like objects
  return data as Recommendation[];
};

export const getFullRecipe = async (dishName: string, description: string, preferences: UserPreferences): Promise<Pick<Recommendation, 'ingredients' | 'instructions'>> => {
  const url = `/api/recipe`;
  const data = await jsonPost(url, { dishName, description, preferences });
  return data as Pick<Recommendation, 'ingredients' | 'instructions'>;
};

export const getNearbyStores = async (latitude: number, longitude: number): Promise<NearbyStore[]> => {
  const url = `/api/nearby-stores`;
  const data = await jsonPost(url, { latitude, longitude });
  return data as NearbyStore[];
};

export { getFoodRecommendations };