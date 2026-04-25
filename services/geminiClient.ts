export async function getFoodRecommendations(preferences: any) {
  const resp = await fetch('/api/recommendations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(preferences),
  });
  if (!resp.ok) throw new Error(`Recommendations request failed: ${resp.status}`);
  return resp.json();
}

export async function getNearbyStores(latitude: number, longitude: number) {
  const resp = await fetch('/api/nearby-stores', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ latitude, longitude }),
  });
  if (!resp.ok) throw new Error(`Nearby stores request failed: ${resp.status}`);
  return resp.json();
}

export async function getNearbyStoresWithQuery(latitude: number, longitude: number, q?: string) {
  const body: any = { latitude, longitude };
  if (q) body.q = q;
  const resp = await fetch('/api/nearby-stores', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`Nearby stores request failed: ${resp.status}`);
  return resp.json();
}

export async function sendChat(messages: any[]) {
  const resp = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
  });
  if (!resp.ok) throw new Error(`Chat request failed: ${resp.status}`);
  return resp.json();
}

export async function getFullRecipe(dishName: string, description: string, preferences: any) {
  const resp = await fetch('/api/recipe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dishName, description, preferences }),
  });
  if (!resp.ok) throw new Error(`Recipe request failed: ${resp.status}`);
  return resp.json();
}

export async function generateImage(dishName: string, description: string, ingredients: string[], preferences?: any) {
  const resp = await fetch('/api/generate-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dishName, description, ingredients, preferences }),
  });
  if (!resp.ok) throw new Error(`Generate image request failed: ${resp.status}`);
  return resp.json();
}

export default {
  getFoodRecommendations,
  getNearbyStores,
  sendChat,
  getFullRecipe,
  generateImage,
};
