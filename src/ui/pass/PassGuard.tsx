import { Component, type ReactNode } from 'react';

/** The mountain is only for joy: if it fails, the ride screen simply goes on without it. */
export class PassGuard extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? null : this.props.children; }
}
