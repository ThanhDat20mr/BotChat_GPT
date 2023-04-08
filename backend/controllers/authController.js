const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/userModel");
const sendMail = require("../utils/mailer");

const authController = {
  register: async (req, res) => {
    try {
      console.log(req.body);
      const { name, email, password, avatar } = req.body;
      console.log(">>>>>>" + name);

      if (!name || !email || !password) {
        res.status(400).json("Please enter all the required fields");
        return;
      }

      const checkExists = await User.findOne({ email });

      if (checkExists) {
        res.status(400).json("User already exists");
        return;
      }

      //Hash password
      const saltRounds = 10;
      const salt = await bcrypt.genSalt(saltRounds);
      const hash = await bcrypt.hash(password, salt);

      const newUser = await new User({
        name,
        email,
        avatar,
        password: hash,
      });

      const user = await User.create(newUser);

      res.status(200).json(user);
    } catch (err) {
      res.status(500).json(err);
    }
  },
  login: async (req, res) => {
    try {
      const { email, password } = req.body;
      const user = await User.findOne({ email });
      if (!user) {
        return res.status(404).json("Wrong username");
      }

      const validPassword = await bcrypt.compare(password, user.password);
      if (!validPassword) {
        return res.status(404).json("Wrong password");
      }

      if (user && validPassword) {
        const newAccessToken = authController.generateAccessToken(user);
        const newRefreshToken = authController.generateRefreshToken(user);

        await User.updateOne(
          { email: user.email },
          { refreshToken: newRefreshToken }
        );

        const { password, refreshToken, ...rest } = user._doc;

        return res
          .cookie("refreshToken", newRefreshToken, {
            httpOnly: true,
            sameSite: "strict",
            scure: false,
          })
          .status(200)
          .json({ ...rest, accessToken: newAccessToken });
      }
    } catch (err) {
      res.status(500).json(err);
    }
  },
  logout: (req, res, next) => {
    try {
      res
        .clearCookie("refreshToken", {
          sameSite: "none",
          scure: true,
        })
        .status(200)
        .json("User has been logged out");
    } catch (err) {
      return res.status(500).json(err);
    }
  },
  sendRestPasswordLink: async (req, res) => {
    const { email } = req.body;
    console.log(email);
    try {
      if (!email) {
        return res.status(400).json("Email is not null");
      }

      const checkEmail = await User.findOne({ email });

      if (!checkEmail) {
        return res.status(404).json("Email is not found");
      }

      const token = authController.generateTokenForgotPassword(checkEmail);

      await sendMail(
        email,
        "Reset password",
        `<a href="${process.env.APP_URL}/resetpassword?email=${email}&token=${token}"> Reset Password </a>`
      );

      return res.status(200).json("Send link reset password success");
    } catch (err) {
      return res.status(500).json(err);
    }
  },
  resetPassword: async (req, res) => {
    const { newPassword, token, email } = req.body;

    try {
      if (!email && !token) {
        return res.status(400).json("Token or email must not be null");
      }

      if (!newPassword) {
        return res.status(400).json("Password must not be null");
      }

      const user = await User.findOne({ email });

      if (!user) {
        return res.status(400).json("Email not found");
      }

      await jwt.verify(
        token,
        process.env.JWT_FORGOT_PASSWORD,
        async (err, userInfo) => {
          if (err) {
            return res.status(403).json("URL is not valid!");
          }

          //Hash password
          const salt = await bcrypt.genSalt(
            parseInt(process.env.BCRYPT_SALT_ROUNDS)
          );
          const hash = await bcrypt.hash(newPassword, salt);

          const updateUser = await User.findByIdAndUpdate(user._id, {
            password: hash,
          });

          const { password, refreshToken, ...other } = updateUser._doc;

          return res.status(200).json(other);
        }
      );
    } catch (err) {
      console.log(err);
      return res.status(500).json(err);
    }
  },
  refreshToken: async (req, res) => {
    console.log({ ...req.cookies });
    const refreshToken = req.cookies.refreshToken;
    console.log(refreshToken);
    if (!refreshToken) {
      return res.status(401).json("You're not authenticated!");
    }

    const checkRefreshToken = await User.findOne({ refreshToken });

    if (!checkRefreshToken) {
      return res.status(403).json("Token is not valid");
    }

    jwt.verify(refreshToken, process.env.JWT_REFRESH_TOKEN, (err, user) => {
      if (err) {
        return res.status(403).json("Token is not valid");
      }

      const accessToken = authController.generateAccessToken(user);

      res.status(200).json(accessToken);
    });
  },
  generateTokenForgotPassword: (user) => {
    return jwt.sign(
      {
        email: user.email,
      },
      process.env.JWT_FORGOT_PASSWORD,
      {
        expiresIn: "2m",
      }
    );
  },
  generateAccessToken: (user) => {
    return jwt.sign(
      {
        id: user.id,
      },
      process.env.JWT_ACCESS_TOKEN,
      {
        expiresIn: "5m",
      }
    );
  },
  generateRefreshToken: (user) => {
    return jwt.sign(
      {
        id: user.id,
      },
      process.env.JWT_REFRESH_TOKEN,
      {
        expiresIn: "200d",
      }
    );
  },
};

module.exports = authController;
