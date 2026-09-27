const fallback = 'http://localhost:3000';

export const API_BASE_URL = (process.env.EXPO_PUBLIC_API_URL ?? fallback).replace(/\/$/, '');

if (__DEV__) {
  console.warn(`[agri-rescue] API_BASE_URL=${API_BASE_URL}`);
}
