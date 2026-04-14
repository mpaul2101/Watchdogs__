export async function getMetrics() {
  const response = await fetch("http://localhost:8000/api/metrics");

  if (!response.ok) {
    throw new Error("Failed to fetch metrics");
  }

  return response.json();
}