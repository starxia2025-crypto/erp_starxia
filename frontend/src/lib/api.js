const backendUrl = process.env.REACT_APP_BACKEND_URL?.trim();

export const API_BASE = backendUrl ? `${backendUrl}/api` : "/api";
