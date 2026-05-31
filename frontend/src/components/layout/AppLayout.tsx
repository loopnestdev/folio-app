import { Component, useState, type ReactNode, type ErrorInfo } from 'react';
import { Outlet } from 'react-router-dom';
import { Topnav } from './Topnav';
import { Sidebar } from './Sidebar';

// ── Error boundary — wraps each page so a runtime crash never unmounts the
// sidebar/nav. The user sees an inline error with a "Try again" button. ──
interface EBState { hasError: boolean; message: string }
class PageErrorBoundary extends Component<{ children: ReactNode }, EBState> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }
  static getDerivedStateFromError(err: Error): EBState {
    return { hasError: true, message: err.message };
  }
  componentDidCatch(err: Error, info: ErrorInfo) {
    console.error('[PageErrorBoundary]', err, info.componentStack);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4 text-center px-6">
          <div className="text-[48px]">⚠️</div>
          <h2 className="text-[22px] font-semibold text-[var(--c-ink)]">Something went wrong</h2>
          <p className="text-[15px] text-[var(--c-ink-mute)] max-w-md">{this.state.message}</p>
          <button
            className="mt-2 px-4 py-2 rounded-xl bg-[var(--c-primary)] text-white text-[15px] font-medium hover:opacity-90"
            onClick={() => this.setState({ hasError: false, message: '' })}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <Topnav onMenuClick={() => setSidebarOpen(true)} />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <main className="flex-1 overflow-y-auto bg-[var(--c-canvas-soft)]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <PageErrorBoundary>
              <Outlet />
            </PageErrorBoundary>
          </div>
        </main>
      </div>
    </div>
  );
}
