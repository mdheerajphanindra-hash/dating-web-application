const jwt = require('jsonwebtoken');

function generateToken(user) {
  return jwt.sign(
    { id: user._id.toString(), role: user.role },
    process.env.JWT_SECRET || 'dating-app-secret',
    { expiresIn: '7d' }
  );
}

module.exports = generateToken;
