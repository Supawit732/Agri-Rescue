import { Platform } from 'react-native';

// Web builds are served by the same Express server as the API (see
// server/src/app.ts), so default to a relative base there — it works no
// matter what host/port the build is deployed to. Native builds (Expo Go /
// standalone) have no same-origin server, so they still need an explicit
// EXPO_PUBLIC_API_URL and fall back to the local dev server.
const fallback = Platform.OS === 'web' ? '' : 'http://localhost:3000';

export const API_BASE_URL = (process.env.EXPO_PUBLIC_API_URL ?? fallback).replace(/\/$/, '');

if (__DEV__) {
  console.warn(`[agri-rescue] API_BASE_URL=${API_BASE_URL}`);
}
