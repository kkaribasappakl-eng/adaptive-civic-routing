import React from 'react';
import { ShieldAlert, RefreshCw, Home } from 'lucide-react';

/**
 * Top-level React Error Boundary
 * Catches unhandled runtime UI errors and renders a civic recovery card
 * preventing blank-screen crashes.
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[Civic UI ErrorBoundary Caught]:', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReload = () => {
    window.location.reload();
  };

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-slate-900 border border-red-500/30 rounded-2xl p-6 shadow-2xl space-y-5 text-center">
            <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center mx-auto shadow-inner">
              <ShieldAlert className="w-7 h-7" />
            </div>

            <div className="space-y-2">
              <h2 className="text-xl font-bold text-white tracking-tight">
                Civic Workspace Encountered an Error
              </h2>
              <p className="text-xs text-slate-400 leading-relaxed">
                An unexpected component rendering issue occurred. The system protected application state to prevent corruption.
              </p>
            </div>

            {this.state.error?.message && (
              <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 text-left">
                <span className="text-[10px] font-mono text-slate-500 block uppercase">Error Diagnostic</span>
                <span className="text-xs font-mono text-red-400 break-words block mt-1">
                  {this.state.error.message}
                </span>
              </div>
            )}

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={this.handleReset}
                className="flex-1 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 transition flex items-center justify-center gap-2"
              >
                <Home className="w-3.5 h-3.5" />
                Recover State
              </button>
              <button
                type="button"
                onClick={this.handleReload}
                className="flex-1 px-4 py-2.5 bg-civic-600 hover:bg-civic-500 text-white text-xs font-semibold rounded-xl shadow-lg shadow-civic-600/30 transition flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Reload Application
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
