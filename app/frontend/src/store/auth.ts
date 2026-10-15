import { create } from 'zustand';
import { api, setToken } from '../lib/api';

export interface Me {
  id: string; name: string; email?: string; photo?: string; role: string; schoolId?: string;
  school?: { id: string; name: string; plan: string; tier: number; maxStudents: number; status: string; color?: string; modules: string[] };
}

interface AuthState {
  me: Me | null; loading: boolean;
  load: () => Promise<void>;
  login: (login: string, password: string) => Promise<void>;
  register: (d: any) => Promise<void>;
  logout: () => void;
  has: (module: string) => boolean;
}

export const useAuth = create<AuthState>((set, get) => ({
  me: null,
  loading: true,
  load: async () => {
    try { set({ me: (await api.get('/auth/me')).data }); } catch { set({ me: null }); } finally { set({ loading: false }); }
  },
  login: async (login, password) => {
    const { data } = await api.post('/auth/login', { login, password });
    setToken(data.token); set({ me: data.user });
  },
  register: async (d) => {
    const { data } = await api.post('/auth/register-school', d);
    setToken(data.token); set({ me: data.user });
  },
  logout: () => { setToken(null); set({ me: null }); },
  has: (m) => !!get().me?.school?.modules.includes(m),
}));
