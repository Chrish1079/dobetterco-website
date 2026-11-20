const { connectBlobs, getPublicStock } = require("./_lib/inventory");

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: cors, body: "" };
  }

  if (event.httpMethod !== "GET") {
    return { statusCode: 405, headers: cors, body: "Method Not Allowed" };
  }

  try {
    connectBlobs(event);
    const stock = await getPublicStock();
    return {
      statusCode: 200,
      headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
      body: JSON.stringify({ stock }),
    };
  } catch (err) {
    console.error(err);
    return {
      statusCode: 502,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Could not load inventory." }),
    };
  }
};