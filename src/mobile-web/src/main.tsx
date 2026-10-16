import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/reset.scss';
import '@opc-team/theme/default.css';
import '@opc-team/ui/mobile.css';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
