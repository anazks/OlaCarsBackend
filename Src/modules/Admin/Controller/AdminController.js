
const  {loginAdmin} = require('../Repo/AdminRepo.js')
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
module.exports = {
  login
}