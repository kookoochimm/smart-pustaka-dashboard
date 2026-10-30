// API base URL for local development and cloud deployment.
// Cloudflare Pages: set VITE_API_BASE_URL to the deployed Render API URL + /api.
// Local development: Vite proxies /api to http://localhost:5002.
const API_URL = (import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/$/, "");

export default API_URL;
