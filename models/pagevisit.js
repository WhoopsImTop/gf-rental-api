'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class PageVisit extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
    }
  }
  PageVisit.init({
    // Cookielose, täglich wechselnde Besucher-ID (siehe services/analytics/visitorId.js).
    // Ältere Zeilen enthalten noch die frühere sessionStorage-ID.
    session_id: DataTypes.STRING,
    // Zufällige ID pro Seitenaufruf (nur im JS-Speicher), um die Verweildauer nachzutragen.
    pageview_id: DataTypes.STRING(32),
    // Wird nicht mehr befüllt; IP-Adressen werden nie gespeichert.
    ip_address: DataTypes.STRING,
    country: DataTypes.STRING,
    city: DataTypes.STRING(128),
    hostname: DataTypes.STRING(128),
    // Nur Hostname des Referrers, nie die vollständige URL.
    referrer: DataTypes.STRING,
    source: DataTypes.STRING(64),
    channel: DataTypes.STRING(32),
    utm_source: DataTypes.STRING(128),
    utm_medium: DataTypes.STRING(128),
    // utm_campaign
    campaign: DataTypes.STRING,
    device: DataTypes.STRING(16),
    browser: DataTypes.STRING(32),
    os: DataTypes.STRING(32),
    // Pfad ohne Query-String
    page_url: DataTypes.TEXT,
    duration_seconds: DataTypes.INTEGER,
    visited_at: DataTypes.DATE
  }, {
    sequelize,
    modelName: 'PageVisit',
  });
  return PageVisit;
};
