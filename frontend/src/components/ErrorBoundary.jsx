// FILE PATH: frontend/src/components/ErrorBoundary.jsx
//
// Without this, a render error ANYWHERE in the app unmounts the whole React tree and leaves a blank white page with nothing
// visible to the person (the error only shows up in the browser console). It is used twice:
//
//   level="app"    around the whole application (main.jsx). Last line of defence: shows a full-screen "reload" card.
//   level="route"  around the pages (App.jsx). A crash in ONE page shows the card for that page only; the session, the store,
//                  the language and the cart stay alive, and moving to another page (resetKey = the path) clears the error.
//
// It deliberately uses no context and no layout (they may be what failed): only the translation function and plain markup.
import { Component } from 'react';
import { t } from '../utils/i18n';

// After a release the browser may still hold an old page that asks for a script file that no longer exists.
const isStaleBuildError = (error) =>
  /dynamically imported module|Importing a module script failed|Loading chunk|Failed to fetch dynamically/i.test(String(error?.message || error || ''));

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // Kept in production too — it is the only trace of what broke when the card below is all the person sees.
    console.error('Unhandled render error:', error, info?.componentStack);
  }

  componentDidUpdate(prevProps) {
    // Navigating to another page (route level) gives that page a fresh start.
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) this.setState({ hasError: false, error: null });
  }

  tryAgain = () => this.setState({ hasError: false, error: null });

  reload = () => window.location.reload();

  goHome = () => { window.location.href = '/dashboard'; };

  render() {
    if (!this.state.hasError) return this.props.children;

    const stale = isStaleBuildError(this.state.error);
    const route = this.props.level === 'route';
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4 text-center" role="alert">
        <div className="max-w-sm w-full space-y-3">
          <h1 className="text-lg font-semibold text-gray-900">{t(stale ? 'ui_error_update_title' : 'ui_error_title')}</h1>
          <p className="text-sm text-gray-500">{t(stale ? 'ui_error_update_body' : 'ui_error_body')}</p>
          <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
            <button type="button" onClick={this.reload} className="px-4 py-2 text-sm rounded bg-primary text-white hover:opacity-90">{t('ui_error_reload')}</button>
            {route && !stale && <button type="button" onClick={this.tryAgain} className="px-4 py-2 text-sm rounded border border-gray-300 text-gray-700 hover:bg-gray-50">{t('ui_error_try_again')}</button>}
            {route && <button type="button" onClick={this.goHome} className="px-4 py-2 text-sm rounded border border-gray-300 text-gray-700 hover:bg-gray-50">{t('ui_go_dashboard')}</button>}
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
