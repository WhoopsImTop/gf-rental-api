const geoCodingApiKey = process.env.GEOCODING_API_KEY;

if (!geoCodingApiKey) {
  console.log('GEOCODING-SERVICE: NOT AVAILABLE');
  return;
}

const axios = require("axios");
const { logger } = require("./logging");

exports.getGeoData = async (address) => {
  try {
    logger('geoCoder', 'Fetching geodata for address: ' + address);
    const response = await axios.get(
      `https://api.geoapify.com/v1/geocode/search?text=${address}&apiKey=${geoCodingApiKey}`
    );
    if (response.status !== 200) {
      throw new Error("Error fetching data");
    }
    if (response.data.features.length === 0) {
      throw new Error("No data found");
    }
    //check if one of the results has country_code DE
    const result = response.data.features.find(feature => feature.properties.country_code === 'de');
    return result ? result.properties : response.data.features[0].properties;
  } catch (error) {
    logger('error', error.message);
    throw new Error(error);
  }
};
