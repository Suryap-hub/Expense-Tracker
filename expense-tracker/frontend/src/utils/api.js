import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || '/api';

const api = axios.create({
  baseURL: API_URL,
  timeout: 30000,
});

// Request interceptor - attach token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor - handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Auth
export const authAPI = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
  me: () => api.get('/auth/me'),
  updateProfile: (data) => api.put('/auth/profile', data),
};

// Transactions
export const transactionAPI = {
  getAll: (params) => api.get('/transactions', { params }),
  getSummary: (params) => api.get('/transactions/summary', { params }),
  getTrends: () => api.get('/transactions/trends'),
  create: (data) => api.post('/transactions', data),
  update: (id, data) => api.put(`/transactions/${id}`, data),
  delete: (id) => api.delete(`/transactions/${id}`),
};

// Budget
export const budgetAPI = {
  get: () => api.get('/budgets'),
  update: (data) => api.put('/budgets', data),
};

// AI
export const aiAPI = {
  categorize: (text) => api.post('/ai/categorize', { text }),
  getInsights: () => api.post('/ai/insights'),
  scanReceipt: (formData) => api.post('/ai/receipt', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  predictBudget: () => api.post('/ai/budget-predict'),
};

export default api;
