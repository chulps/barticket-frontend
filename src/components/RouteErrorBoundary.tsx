import { Component, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { useI18n } from "../i18n";

// Keep the shell, authentication, menu data and modal host mounted on a route
// failure. Never reload the document: a payment may still be in flight and a
// dialog may contain unsaved work. Navigation resets only the failed route.
class RouteFailure extends Component<{ children: ReactNode; ja: boolean; path: string }, { failed: boolean; path: string }> {
  state = { failed: false, path: this.props.path };
  static getDerivedStateFromProps(props: { path: string }, state: { path: string }) {
    return props.path !== state.path ? { failed: false, path: props.path } : null;
  }
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return <section role="alert" style={{ padding: "var(--space-4)" }}>
      <h2>{this.props.ja ? "この画面を開けませんでした" : "This screen could not be opened"}</h2>
      <p>{this.props.ja
        ? "アプリは再起動していません。開いている入力画面を確認し、上のナビゲーションから別の画面に移動できます。"
        : "The app has not restarted. Review any open dialog; you can use the navigation above to open another screen."}</p>
      <p>{this.props.ja
        ? "更新が必要な場合は、未保存の作業を完了し、支払いの結果を確認してからページを再読み込みしてください。支払いを再送信しないでください。"
        : "If an update is needed, finish unsaved work and verify any payment outcome before manually refreshing the page. Do not resubmit a payment."}</p>
    </section>;
  }
}
export default function RouteErrorBoundary({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const { locale } = useI18n();
  return <RouteFailure path={pathname} ja={locale === "ja"}>{children}</RouteFailure>;
}
