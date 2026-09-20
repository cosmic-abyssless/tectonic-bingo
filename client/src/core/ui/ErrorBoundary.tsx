import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertIcon } from "./icons";
import { Button } from "./Button";
import { EmptyState } from "./Card";
import { reportClientError } from "../logging/reportClientError";

interface Props {
  children: ReactNode;
}

interface State {
  failed: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, _info: ErrorInfo): void {
    reportClientError(error.message, "ErrorBoundary");
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="mx-auto max-w-lg px-4 py-16">
        <EmptyState
          icon={<AlertIcon />}
          title="Something broke"
          action={
            <Button variant="primary" onPress={() => window.location.reload()}>
              Reload
            </Button>
          }
        >
          Reload the page. If it happens again, send a bug report from the header.
        </EmptyState>
      </div>
    );
  }
}
