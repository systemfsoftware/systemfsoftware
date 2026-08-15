import { apiConnection } from "@/lib/client";

import { AppProviders } from "./components/providers/app-providers";

/** Renders the benchmark workspace entry screen. */
export function App() {
  return (
    <AppProviders>
      <main className="shell">
        <section className="panel">
          <p className="eyebrow">Requirement-driven benchmark</p>
          <h1>{{name}}</h1>
          <p>
            The workspace is ready. Read every document under{" "}
            <code>docs/analysis</code>, then implement the application and its
            verification from those requirements.
          </p>
          <dl>
            <div>
              <dt>API host</dt>
              <dd>{apiConnection.host}</dd>
            </div>
            <div>
              <dt>SDK mode</dt>
              <dd>{apiConnection.simulate === true ? "simulate" : "live"}</dd>
            </div>
          </dl>
        </section>
      </main>
    </AppProviders>
  );
}
