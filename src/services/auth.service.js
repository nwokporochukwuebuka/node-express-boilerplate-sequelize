const httpStatus = require('http-status');
const tokenService = require('./token.service');
const userService = require('./user.service');
const { db } = require('../models');
const ApiError = require('../utils/ApiError');
const { tokenTypes } = require('../config/tokens');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const fs = require('fs');
const path = require('path');
const logger = require('../config/logger');
const uploader = require('../utils/cloudinaryUpload');

/**
 * Login with username and password
 * @param {string} email
 * @param {string} password
 * @returns {Promise<User>}
 */
const loginUserWithEmailAndPassword = async (email, password) => {
  const user = await userService.getUserByEmail(email);
  if (!user || !(await userService.isPasswordMatch(password, user.dataValues))) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Incorrect email or password');
  }
  return user;
};

const verify2factorAuthentication = async (token, id) => {
  // find the user
  const user = await userService.getUserById(id);

  // verify the user
  const verified = speakeasy.totp.verify({
    secret: user.dataValues.secret,
    encoding: 'base32',
    token: token,
    window: 1,
  });
  // update the database
  if (!verified) {
    return false;
  }

  await userService.updateUserById(user.dataValues.id, { enable2fa: true });
  return verified;
};

const generateSecret = () => {
  const secret = speakeasy.generateSecret({
    name: 'My boiler plate', // change this to something hard to guess
  });
  return secret.base32;
};

/**
 * Logout
 * @param {string} refreshToken
 * @returns {Promise}
 */
const logout = async (refreshToken) => {
  const refreshTokenDoc = await db.findOne({ where: { token: refreshToken, type: tokenTypes.REFRESH, blacklisted: false } });
  if (!refreshTokenDoc) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Not found');
  }
  await refreshTokenDoc.remove();
};

/**
 * Refresh auth tokens
 * @param {string} refreshToken
 * @returns {Promise<Object>}
 */
const refreshAuth = async (refreshToken) => {
  try {
    const refreshTokenDoc = await tokenService.verifyToken(refreshToken, tokenTypes.REFRESH);
    const user = await userService.getUserById(refreshTokenDoc.user);
    if (!user) {
      throw new Error();
    }
    await refreshTokenDoc.remove();
    return tokenService.generateAuthTokens(user);
  } catch (error) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Please authenticate');
  }
};

/**
 * Reset password
 * @param {string} resetPasswordToken
 * @param {string} newPassword
 * @returns {Promise}
 */
const resetPassword = async (resetPasswordToken, newPassword) => {
  try {
    const resetPasswordTokenDoc = await tokenService.verifyToken(resetPasswordToken, tokenTypes.RESET_PASSWORD);
    const user = await userService.getUserById(resetPasswordTokenDoc.user);
    if (!user) {
      throw new Error();
    }
    await userService.updateUserById(user.id, { password: newPassword });
    await db.tokens.destroy({ where: { user: user.id, type: tokenTypes.RESET_PASSWORD } });
  } catch (error) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Password reset failed');
  }
};

/**
 * Verify email
 * @param {string} verifyEmailToken
 * @returns {Promise}
 */
const verifyEmail = async (verifyEmailToken) => {
  try {
    const verifyEmailTokenDoc = await tokenService.verifyToken(verifyEmailToken, tokenTypes.VERIFY_EMAIL);
    const user = await userService.getUserById(verifyEmailTokenDoc.user);
    if (!user) {
      throw new Error();
    }
    await db.tokens.destroy({ where: { user: user.id, type: tokenTypes.VERIFY_EMAIL } });
    await userService.updateUserById(user.id, { isEmailVerified: true });
  } catch (error) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Email verification failed');
  }
};

const twoFactorAuthentication = async (id) => {
  const secret = generateSecret();

  // update database
  await userService.updateUserById(id, { secret });

  const otpauth_url = speakeasy.otpauthURL({
    secret: secret,
    label: 'My boiler plate',
    issuer: 'Nwokporo Chukwuebuka',
    encoding: 'base32',
  });

  // genrating QR Code
  const qrCodeImg = await qrcode.toDataURL(otpauth_url);
  const splitImg = qrCodeImg.split(',')[1];

  fs.writeFile(path.join(__dirname, `../assets/images/qrcode/${id}.png`), splitImg, 'base64', (err) => {
    if (err) {
      logger.error(err);
    }
  });

  // upload to cloudinary
  uploader(path.join(__dirname, `../assets/images/qrcode/${id}.png`));

  return { img: qrCodeImg };
};

module.exports = {
  generateSecret,
  twoFactorAuthentication,
  loginUserWithEmailAndPassword,
  logout,
  refreshAuth,
  resetPassword,
  verifyEmail,
  verify2factorAuthentication,
};
