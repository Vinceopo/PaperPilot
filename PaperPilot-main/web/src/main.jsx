import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import "./index.css";

/** PayMongo return page for checkouts started in the mobile app. */
function AppCheckoutReturn({ status }) {
  const paid = status === "success";
  const appLink = `paperpilot://billing?status=${paid ? "success" : "canceled"}`;
  React.useEffect(() => {
    window.location.replace(appLink);
  }, [appLink]);
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f8f9fb] p-6">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <h1 className="text-lg font-bold text-[#172033]">
          {paid ? "Payment received" : "Payment canceled"}
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          {paid
            ? "Returning to the PaperPilot app to activate your plan…"
            : "No charges were made. Returning to the PaperPilot app…"}
        </p>
        <a
          href={appLink}
          className="mt-5 inline-flex rounded-lg bg-[#16bfa8] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#12ae99]"
        >
          Open the PaperPilot app
        </a>
      </div>
    </main>
  );
}

const params = new URLSearchParams(window.location.search);
const appCheckoutStatus = params.get("app") === "1" ? params.get("billing") : null;

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      {appCheckoutStatus ? <AppCheckoutReturn status={appCheckoutStatus} /> : <App />}
    </ErrorBoundary>
  </React.StrictMode>
);
