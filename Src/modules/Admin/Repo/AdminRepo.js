import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import Admin from "../model/adminModel.js";
import {jwtConfig} from '../../../config/jwtConfig.js'


export const loginAdmin = async (email, password) => {
  const admin = await Admin.findOne({ email });

  if (!admin) throw new Error("Invalid credentials");

  const isMatch = await bcrypt.compare(password, admin.passwordHash);
  if (!isMatch) throw new Error("Invalid credentials");

  if (admin.status !== "ACTIVE")
    throw new Error("Account not active");

  const accessToken = jwt.sign(
    { id: admin._id, role: admin.role },
    process.env.JWT_SECRET,
    { expiresIn: jwtConfig.accessTokenExpiry }
  );

  const refreshToken = jwt.sign(
    { id: admin._id },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: jwtConfig.refreshTokenExpiry }
  );

  admin.refreshToken = refreshToken;
  await admin.save();

  return { accessToken, refreshToken };
};

export const refreshAccessToken = async (token) => {
  const decoded = jwt.verify(
    token,
    process.env.JWT_REFRESH_SECRET
  );

  const admin = await Admin.findById(decoded.id);

  if (!admin || admin.refreshToken !== token)
    throw new Error("Invalid refresh token");

  const newAccessToken = jwt.sign(
    { id: admin._id, role: admin.role },
    process.env.JWT_SECRET,
    { expiresIn: jwtConfig.accessTokenExpiry }
  );

  return { accessToken: newAccessToken };
};