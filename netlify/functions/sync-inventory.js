const { resetInventoryFromCatalog } = require("./_lib/inventory");

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: cors, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: cors, body: "Method Not Allowed" };
  }

  const secret = process.env.INVENTORY_ADMIN_SECRET;
  if (!secret) {
    return json(503, { error: "INVENTORY_ADMIN_SECRET is not configured on Netlify." });
  }

  const auth = event.headers.authorization || event.headers.Authorization || "";
  if (auth !== `Bearer ${secret}`) {
    return json(401, { error: "Unauthorized" });
  }

  try {
    const stock = await resetInventoryFromCatalog();
    return json(200, { ok: true, stock });
  } catch (err) {
    console.error(err);
    return json(502, { error: "Could not sync inventory." });
  }
};

function json(statusCode, data) {
  return {
    statusCode,
    headers: { ...cors, "Content-Type": "application/json" },
    body: JSON.stringify(data),
  };
}