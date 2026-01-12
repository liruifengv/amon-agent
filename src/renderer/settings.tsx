import React from 'react';
import ReactDOM from 'react-dom/client';
import SettingsWindow from './components/Settings/SettingsWindow';
import './styles/globals.css';

const root = document.getElementById('root');
if (root) {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <SettingsWindow />
    </React.StrictMode>
  );
}
