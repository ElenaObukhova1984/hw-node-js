const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const path = require("path");
const fs = require("fs/promises");
const gravatar = require("gravatar");
const Jimp = require("jimp");
const { nanoid } = require("nanoid");

const {User} = require("../models/user");

const { HttpError, ctrlWrapper,sendEmail } = require("../helpers");

const { SECRET_KEY,BASE_URL } = process.env;

const avatarsDir = path.join(__dirname, "../", "public", "avatars");

const register = async(req, res)=> {
    const {email, password} = req.body;
    const user = await User.findOne({email});

    if(user){
        throw HttpError(409, "Email already in use");
    }

    const hashPassword = await bcrypt.hash(password, 10);
    const avatarURL = gravatar.url(email);
    const verificationToken = nanoid();

    const newUser = await User.create({...req.body, password: hashPassword, avatarURL, verificationToken});
    
    const verifyEmail = {
        to: email,
        subject: "Verify email",
        html: `<a target="_blanc" href="${BASE_URL}/api/auth/verify/${verificationToken}">Click verify email</a>`
    };

    await sendEmail(verifyEmail);
 
    res.status(201).json({
        email: newUser.email,
        subscription: newUser.subscription,
    })
}

const verifyEmail = async (req, res) => {
    const { verificationToken } = req.params;
    const user = await User.findOne({ verificationToken });
    if (!user) {
        throw HttpError(401, "Email not found")
    }
    await User.findByIdAndUpdate(user._id, { verify: true, verificationToken: "" });
    res.json({
        message:"Email verify success"
    })
}

const resendVerifyEmail = async (req, res) => {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) {
        throw HttpError(401, "Email not found")
    }
    if (user.verify) {
        throw HttpError(401, "Email already verify")
    }
    const verifyEmail = {
        to: email,
        subject: "Verify email",
        html: `<a target="_blanc" href="${BASE_URL}/api/auth/verify/${verificationToken}">Click verify email</a>`
    };
    await sendEmail(verifyEmail);
    res.json({
        message:"Verify email send success"
    })
}

const login = async(req, res)=> {
    const {email, password} = req.body;
    const user = await User.findOne({email});
    if(!user){
        throw HttpError(401, "Email or password is wrong");
    }

    if (!user.verify) {
       throw HttpError(401, "Email not verify"); 
    }


    const passwordCompare = await bcrypt.compare(password, user.password);
    if(!passwordCompare) {
        throw HttpError(401, "Email or password is wrong");
    }

    const payload = {
        id: user._id,
    }

    const token = jwt.sign(payload, SECRET_KEY, {expiresIn: "23h"});
    await User.findByIdAndUpdate(user._id, {token});

     res.status(200).json({
      token,
      user: {
            email,
            subscription: user.subscription,
    },
  })
}

const getCurrent = async(req, res)=> {
    const {email, subscription} = req.user;

    res.status(200).json({
        email,
        subscription,
    })
}

const logout = async(req, res) => {
    const {_id} = req.user;
    await User.findByIdAndUpdate(_id, {token: ""});

    res.status(204).json({
        message: "Logout success"
    })
}

const updateAvatar = async (req, res) => {
    const { _id } = req.user;
    const { path: tempUpload, originalname } = req.file;
    const filename = `${_id}_${originalname}`;
    const resultUpload = path.join(avatarsDir, filename);
    
    await fs.rename(tempUpload, resultUpload);

   Jimp.read(resultUpload, (err, avatar) => { 
    if (err) throw err;
    avatar
        .resize(250, 250)
        .write(resultUpload)
    })
    
    const avatarURL = path.join("avatars", filename);
    await User.findByIdAndUpdate(_id, { avatarURL });

    res.json({
        avatarURL,
    })

}


module.exports = {
    register: ctrlWrapper(register),
    verifyEmail: ctrlWrapper(verifyEmail),
    resendVerifyEmail:ctrlWrapper(resendVerifyEmail),
    login: ctrlWrapper(login),
    getCurrent: ctrlWrapper(getCurrent),
    logout: ctrlWrapper(logout),
    updateAvatar:ctrlWrapper(updateAvatar),
}
