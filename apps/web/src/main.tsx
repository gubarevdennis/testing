import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import 'katex/dist/katex.min.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/ui.css';
import './styles/layout.css';
import './styles/editor.css';
import './styles/pages.css';
import './styles/appearance.css';
import { App } from './App';
import { applyTheme, useUi } from './state/ui';
import { reportError } from './lib/telemetry';
import { installPresetStyles } from './theme/appearance';

installPresetStyles();
applyTheme(useUi.getState().theme);
// Ask the browser not to evict local document copies and queued changes under storage pressure.
void navigator.storage?.persist?.().catch(() => undefined);
window.addEventListener('error', (e) => reportError('window', e.message));
window.addEventListener('unhandledrejection', (e) => reportError('promise', String((e.reason as Error)?.message ?? e.reason)));

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  // App shell cache so that the application opens offline and local changes can be recovered.
  navigator.serviceWorker.register('/sw.js').catch(() => undefined);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
