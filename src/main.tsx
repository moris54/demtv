import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

class StartupBoundary extends React.Component<React.PropsWithChildren, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "#070b0f", color: "#eef4f7", fontFamily: "system-ui, sans-serif", textAlign: "center" }}><div><h1 style={{ margin: "0 0 10px", fontSize: 22 }}>Uygulama açılamadı</h1><p style={{ margin: "0 0 18px", color: "#a9b7bf" }}>Tarayıcı önbelleği veya eski WebView nedeniyle başlangıç tamamlanamadı.</p><button onClick={() => window.location.reload()} style={{ minHeight: 46, padding: "0 18px", border: 0, borderRadius: 12, background: "#ff6b57", color: "#180d0a", fontWeight: 700 }}>Tekrar dene</button></div></main>;
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(<React.StrictMode><StartupBoundary><App /></StartupBoundary></React.StrictMode>);
