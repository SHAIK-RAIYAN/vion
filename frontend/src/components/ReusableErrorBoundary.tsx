import React, { Component, type ErrorInfo, type ReactNode } from "react";

export interface ReusableErrorBoundaryProps {
  children?: ReactNode;
  fallback?: ReactNode;
  fallbackRender?: (
    error: Error | null,
    resetErrorBoundary: () => void,
  ) => ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  onReset?: () => void;
}

export interface ReusableErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ReusableErrorBoundary extends Component<
  ReusableErrorBoundaryProps,
  ReusableErrorBoundaryState
> {
  constructor(props: ReusableErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ReusableErrorBoundaryState {
    return { hasError: true, error };
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
      return (
        this.props.fallback || (
          <div className="error-fallback">Component execution halted.</div>
        )
      );
    }
    return this.props.children;
  }
}

export default ReusableErrorBoundary;
