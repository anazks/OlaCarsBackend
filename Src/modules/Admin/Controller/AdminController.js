
const  {loginAdmin,refreshAccessToken} = require('../Repo/AdminRepo.js')
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const tokens = await loginAdmin(email, password);

    return res.status(200).json({
      success: true,
      ...tokens,
    });
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: error.message,
    });
  }
};
 const refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    const newToken = await refreshAccessToken(refreshToken);

    return res.json(newToken);
  } catch (error) {
    return res.status(403).json({
      message: "Invalid refresh token",
    });
  }
};
module.exports = {
  login,
  refreshToken
}