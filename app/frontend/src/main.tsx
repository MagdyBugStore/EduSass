import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { Toaster } from 'react-hot-toast';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';

const qc = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false, staleTime: 15_000 } } });

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <App />
        <Toaster position="top-center" toastOptions={{ style: { fontFamily: '"Inter", "Tajawal", sans-serif', fontSize: 13, background: 'rgb(var(--surface))', color: 'rgb(var(--text))', border: '1px solid rgb(var(--border))' } }} />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
