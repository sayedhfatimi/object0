import type { ErrorInfo, ReactNode } from "react";
import { Component } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-base-content">
          <i className="fa-solid fa-bug text-5xl text-error/60" />
          <h2 className="font-bold text-lg">Something went wrong</h2>
          <p className="max-w-md text-center text-base-content/60 text-sm">
            {this.state.error?.message || "An unexpected error occurred."}
          </p>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={this.handleReset}
          >
            <i className="fa-solid fa-arrows-rotate mr-1" />
            Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
