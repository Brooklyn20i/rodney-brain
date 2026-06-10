import React from 'react';
import ReactDOM from 'react-dom/client';
import { CadenceProvider } from './lib/store';
import { App } from './App';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <CadenceProvider>
      <App />
    </CadenceProvider>
  </React.StrictMode>,
);
