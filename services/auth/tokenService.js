const jwt = require('jsonwebtoken');

const secretKey = process.env.JWT_SECRET; // Sicher und privat halten
const tokenExpiry = '12h';

function createToken(payload) {
    return jwt.sign(payload, secretKey, { expiresIn: tokenExpiry });
}

function verifyToken(token) {
    try {
        return jwt.verify(token, secretKey);
    } catch (error) {
        return null; // Invalid token
    }
}

module.exports = { createToken, verifyToken };
