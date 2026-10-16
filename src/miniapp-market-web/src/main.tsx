import { DesignSystemProvider } from '@opc-team/ui';
import '@opc-team/ui/styles.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import '@opc-team/theme/default.css';
import App from './App';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <DesignSystemProvider>
      <App />
    </DesignSystemProvider>
  </React.StrictMode>,
);
