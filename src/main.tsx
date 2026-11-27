import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ensureSeed } from '@/db/repo';
import { App } from '@/app/App';
import './index.css';

const root = createRoot(document.getElementById('root')!);

ensureSeed()
  .catch((e: unknown) => console.error('Initialisation de la base impossible', e))
  .finally(() =>
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    ),
  );
