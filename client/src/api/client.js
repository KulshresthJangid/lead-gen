import axios from 'axios';
import toast from 'react-hot-toast';
import { TOKEN_KEY } from '../context/AuthContext.jsx';

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL
    ? `${import.meta.env.VITE_API_URL}/api`
    : '/api',
  headers: { 'Content-Type': 'application/json' },
});

// Request interceptor — attach stored JWT if present
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor — handle common errors
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    if (status === 401) {
      // Token missing or expired — clear storage and force reload to login
      localStorage.removeItem(TOKEN_KEY);
      window.location.reload();
    } else if (status === 429) {
      toast.error('Server busy — please slow down');
    } else if (status === 503) {
      toast.error('Service temporarily unavailable');
    }
    return Promise.reject(error);
  },
);

export default apiClient;
