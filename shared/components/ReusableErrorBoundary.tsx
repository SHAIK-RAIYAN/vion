import React, { Component, type ErrorInfo, type ReactNode } from "react";

export interface ReusableErrorBoundaryProps {
  children?: ReactNode;
  /**
   * Static fallback element or JSX to render when an error occurs.
   */
  fallback?: ReactNode;
  /**
   * Dynamic fallback render function receiving the caught Error and a reset callback.
   */
  fallbackRender?: (
    error: Error | null,
    resetErrorBoundary: () => void,
  ) => ReactNode;
  /**
   * Callback fired when an error is caught, useful for logging/telemetry.
   */
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  /**
   * Callback fired immediately when the boundary is reset.
   */
  onReset?: () => void;
  /**
   * Array of values that, when changed (shallow comparison), automatically resets the error boundary.
   * Useful for route changes or ID changes (e.g., [videoId]).
   */
  resetKeys?: unknown[];
}

export interface ReusableErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  prevResetKeys?: unknown[];
}

/**
 * All-Rounder Reusable Error Boundary for React
 *
 * Catches JavaScript errors anywhere in its child component tree,
 * logs errors, and displays a localized fallback UI without crashing
 * the whole page.
 */
export class ReusableErrorBoundary extends Component<
  ReusableErrorBoundaryProps,
  ReusableErrorBoundaryState
> {
  constructor(props: ReusableErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      prevResetKeys: props.resetKeys,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ReusableErrorBoundaryState> {
    return { hasError: true, error };
  }

  static getDerivedStateFromProps(
    nextProps: ReusableErrorBoundaryProps,
    prevState: ReusableErrorBoundaryState,
  ): Partial<ReusableErrorBoundaryState> | null {
    const { hasError, prevResetKeys } = prevState;
    const { resetKeys } = nextProps;

    // Auto-reset when resetKeys change
    if (hasError && resetKeys && prevResetKeys) {
      const keysChanged =
        resetKeys.length !== prevResetKeys.length ||
        resetKeys.some((key, i) => !Object.is(key, prevResetKeys[i]));

      if (keysChanged) {
        return {
          hasError: false,
          error: null,
          prevResetKeys: resetKeys,
        };
      }
    }

    return { prevResetKeys: resetKeys };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  resetError = (): void => {
    if (this.props.onReset) {
      this.props.onReset();
    }
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallbackRender) {
        return this.props.fallbackRender(this.state.error, this.resetError);
      }

      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default sleek dark-mode fallback UI
      return (
        <div
          role="alert"
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px 20px",
            margin: "12px 0",
            borderRadius: "12px",
            backgroundColor: "rgba(239, 68, 68, 0.08)",
            border: "1px solid rgba(239, 68, 68, 0.25)",
            color: "#f87171",
            fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
            textAlign: "center",
          }}
        >
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ marginBottom: "12px" }}
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <h3
            style={{
              margin: "0 0 8px 0",
              fontSize: "16px",
              fontWeight: 600,
              color: "#fca5a5",
            }}
          >
            Component Execution Halted
          </h3>
          <p
            style={{
              margin: "0 0 16px 0",
              fontSize: "13px",
              color: "#e2e8f0",
              maxWidth: "400px",
            }}
          >
            {this.state.error?.message || "An unexpected error occurred in this section."}
          </p>
          <button
            onClick={this.resetError}
            style={{
              cursor: "pointer",
              padding: "8px 18px",
              borderRadius: "8px",
              border: "none",
              backgroundColor: "#ef4444",
              color: "#ffffff",
              fontSize: "13px",
              fontWeight: 500,
              transition: "background-color 0.2s ease",
            }}
            onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "#dc2626")}
            onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "#ef4444")}
          >
            Retry Component
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ReusableErrorBoundary;
