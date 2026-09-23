const fallback = 'http://localhost:3000';

export const API_BASE_URL = (process.env.EXPO_PUBLIC_API_URL ?? fallback).replace(/\/$/, '');
