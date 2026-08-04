import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './tema.css';
import { avviaAspetto } from './lib/tema';

// Tema e modalità colore salvati (o predefiniti) PRIMA del primo render:
// niente lampo bianco per chi usa la notturna.
avviaAspetto();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
