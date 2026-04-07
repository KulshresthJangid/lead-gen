import axios from 'axios';
import toast from 'react-hot-toast';

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL
    ? `${import.meta.env.VITE_API_URL}/api`
    : '/api',
  headers: { 'Content-Type': 'application/json' },
});

// Request interceptor — can be extended for auth headers
apiClient.interceptors.request.use((config) => config);

// Response interceptor — handle common errors
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    if (status === 429) {
      toast.error('Server busy — please slow down');
    } else if (status === 503) {
      toast.error('Service temporarily unavailable');
    }
    return Promise.reject(error);
  },
);

export default apiClient;
