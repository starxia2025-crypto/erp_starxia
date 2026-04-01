const backendUrl = process.env.REACT_APP_BACKEND_URL?.trim();

export const API_BASE = backendUrl ? `${backendUrl}/api` : "/api";

export const getApiErrorMessage = (error, fallback) =>
  error?.response?.data?.detail || error?.message || fallback;
