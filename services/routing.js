const axios = require("axios");
const { logger } = require("./logging");

const geoRoutingApiKey = process.env.GEOCODING_API_KEY;

exports.getDrivingRouteMetrics = async (fromLat, fromLng, toLat, toLng) => {
  if (!geoRoutingApiKey) {
    throw new Error("ROUTING_API_KEY_MISSING");
  }

  try {
    const response = await axios.get("https://api.geoapify.com/v1/routing", {
      params: {
        waypoints: `${fromLat},${fromLng}|${toLat},${toLng}`,
        mode: "drive",
        apiKey: geoRoutingApiKey,
      },
      timeout: 10000,
    });

    if (response.status !== 200) {
      throw new Error("ROUTING_REQUEST_FAILED");
    }

    const feature = response.data?.features?.[0];
    const properties = feature?.properties;
    const distanceMeters = properties?.distance;
    const durationSeconds = properties?.time;

    if (typeof distanceMeters !== "number") {
      throw new Error("ROUTING_DISTANCE_MISSING");
    }

    return {
      distanceKm: distanceMeters / 1000,
      durationMin:
        typeof durationSeconds === "number" ? durationSeconds / 60 : null,
    };
  } catch (error) {
    logger("error", `[routing] ${error.message}`);
    throw error;
  }
};
