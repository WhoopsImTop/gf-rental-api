const hereApiKey = process.env.HERE_API_KEY;

if (!hereApiKey) {
  console.log('GEOCODING-SERVICE: NOT AVAILABLE');
  return;
}

const axios = require("axios");
const { logger } = require("./logging");

exports.getGeoData = async (address) => {
  try {
    logger('geoCoder', 'Fetching geodata for address: ' + address);
    const response = await axios.get(
      `https://geocode.search.hereapi.com/v1/geocode?q=${address}&apiKey=${hereApiKey}`
    );
    if (response.status !== 200) {
      throw new Error("Error fetching data");
    }
    if (response.data.items.length === 0) {
      throw new Error("No data found");
    }
    return response.data.items[0].position;
  } catch (error) {
    logger('error', error.message);
    throw new Error(error);
  }
};
