async function test() {
  const res = await fetch("http://localhost:4000/api/dashboard/RELIANCE.NS/live-intraday?range=1D");
  const data = await res.json();
  console.log("Response:", data);
}
test().catch(console.error);
