import { Component, type ReactNode } from 'react';
import { reportError } from '../lib/telemetry';

/** Never leaves the user on a blank screen: explains what happened and offers a way back. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    reportError('render', error.message);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="center-screen">
        <div className="empty-state">
          <div className="empty-icon">⚠️</div>
          <h3>Не удалось отобразить экран</h3>
          <p>Ваши изменения в документах сохранены на устройстве и будут синхронизированы. Попробуйте обновить страницу.</p>
          <div className="row">
            <button className="btn" onClick={() => this.setState({ error: null })}>Повторить</button>
            <button className="btn primary" onClick={() => window.location.reload()}>Обновить страницу</button>
          </div>
          <details className="small muted"><summary>Подробности</summary>{this.state.error.message}</details>
        </div>
      </div>
    );
  }
}
