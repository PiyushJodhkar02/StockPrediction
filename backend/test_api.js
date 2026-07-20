async function test() {
  const res = await fetch("http://localhost:4000/api/dashboard/RELIANCE.NS");
  const data = await res.json();
  console.log("LEVELS:", data.levels);
}
test().catch(console.error);
