import axios from 'axios';
import toast from 'react-hot-toast';

export const api = axios.create({ baseURL: '/api' });

export const getToken = () => { try { return localStorage.getItem('token'); } catch { return null; } };
export const setToken = (t: string | null) => { try { t ? localStorage.setItem('token', t) : localStorage.removeItem('token'); } catch { /* ignore */ } };

api.interceptors.request.use((c) => {
  const t = getToken();
  if (t) c.headers.Authorization = `Bearer ${t}`;
  return c;
});

api.interceptors.response.use(
  (r) => r,
  (e) => {
    if (e.response?.status === 401 && !location.pathname.startsWith('/login')) {
      setToken(null);
      location.href = '/login';
    }
    return Promise.reject(e);
  },
);

export const errMsg = (e: any): string => e?.response?.data?.message || e?.message || 'حدث خطأ';
export const toastErr = (e: any) => {
  if (e?.response?.status === 402) toast.error(errMsg(e) + ' — اذهب إلى الاشتراك للترقية');
  else toast.error(errMsg(e));
};
