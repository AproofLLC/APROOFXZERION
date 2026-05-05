import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "./ui/button";

type Props = { children: ReactNode };

type State = { hasError: boolean; message: string };

/**
 * Prevents a full white screen on render errors; recovery is reload or home.
 */
export class AppErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(err: Error): State {
    return { hasError: true, message: err.message || "Unexpected error" };
  }

  override componentDidCatch(err: Error, info: ErrorInfo) {
    console.error("[AppErrorBoundary]", err, info.componentStack);
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-background">
          <div className="max-w-md w-full rounded-xl border border-border bg-card p-6 space-y-4 text-center">
            <h1 className="text-lg font-semibold">Something went wrong</h1>
            <p className="text-sm text-muted-foreground">
              The UI hit an unexpected error. You can reload or return home—your session is unchanged.
            </p>
            <p className="text-xs font-mono text-muted-foreground break-all">{this.state.message}</p>
            <div className="flex flex-wrap gap-2 justify-center">
              <Button type="button" onClick={() => window.location.reload()}>
                Reload
              </Button>
              <Button type="button" variant="outline" onClick={() => window.location.assign("/")}>
                Home
              </Button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
