const jwtConfig = {
  accessTokenExpiry: "10h",
  refreshTokenExpiry: "3650d", // 10 years to stay logged in indefinitely
};

module.exports = { jwtConfig };