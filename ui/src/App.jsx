import { useEffect, useState } from "react";

const API_BASE = "http://localhost:8000";

function App() {
  const [diff, setDiff] = useState("");
  const [review, setReview] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);

  const runReview = async () => {
    setLoading(true);
    setReview(null);

    const res = await fetch(`${API_BASE}/ai/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ diff }),
    });

    const data = await res.json();
    setReview(data);
    setLoading(false);

    loadHistory();
  };

  const loadHistory = async () => {
    const res = await fetch(`${API_BASE}/reviews?limit=5`);
    const data = await res.json();
    setHistory(data.items);
  };

  useEffect(() => {
    loadHistory();
  }, []);

  return (
    <div style={{ padding: "2rem", fontFamily: "sans-serif", maxWidth: 900 }}>
      <h1>DevSync</h1>
      <p>AI-Powered Code Review & Deployment Simulator</p>

      <textarea
        rows={8}
        style={{ width: "100%" }}
        placeholder="Paste your code diff here..."
        value={diff}
        onChange={(e) => setDiff(e.target.value)}
      />

      <br />
      <button onClick={runReview} disabled={loading} style={{ marginTop: "1rem" }}>
        {loading ? "Running review..." : "Run Review"}
      </button>

      {review && (
        <div style={{ marginTop: "2rem" }}>
          <h2>Review Result</h2>
          <p><b>Summary:</b> {review.summary}</p>

          <b>Risks:</b>
          <ul>
            {review.risks.map((r, i) => <li key={i}>{r}</li>)}
          </ul>

          <b>Improvements:</b>
          <ul>
            {review.improvements.map((i, idx) => <li key={idx}>{i}</li>)}
          </ul>

          <p><small>Model: {review.model}</small></p>
        </div>
      )}

      <hr style={{ margin: "2rem 0" }} />

      <h2>Recent Reviews</h2>
      {history.map((h) => (
        <div key={h.id} style={{ marginBottom: "1rem" }}>
          <p><b>{h.summary}</b></p>
          <small>{h.created_at} — {h.model}</small>
        </div>
      ))}
    </div>
  );
}

export default App;
