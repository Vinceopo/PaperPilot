import { Component } from "react";

/**
 * Catches render crashes so the page does not stay a blank dark screen.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("PaperPilot UI crash:", error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    const message =
      this.state.error?.message ||
      "Something went wrong while loading PaperPilot. Refresh the page to continue.";
    return (
      <main className="grid min-h-screen place-items-center bg-[#f3f5f7] p-6 text-[#172033]">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <h1 className="text-lg font-bold">PaperPilot hit a display error</h1>
          <p className="mt-2 text-sm text-slate-600">{String(message)}</p>
          <button
            type="button"
            className="mt-5 rounded-lg bg-[#16bfa8] px-5 py-2.5 text-sm font-bold text-[#092823] hover:bg-[#12ae99]"
            onClick={() => window.location.reload()}
          >
            Refresh page
          </button>
        </div>
      </main>
    );
  }
}
