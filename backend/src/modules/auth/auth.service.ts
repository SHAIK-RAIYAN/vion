import { db } from "../../prisma/db";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { OAuth2Client } from "google-auth-library";
import {
  signInUserSchema,
  signUpUserSchema,
  googleAuthSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  type SignInUser,
  type SignupUser,
} from "./auth.schema";

import { Temporal } from "temporal-polyfill";
import { GOOGLE_CLIENT_ID, JWT_SECRET, SALT_ROUNDS } from "../../config/config";
import { AppError } from "../../utils/AppError";

const { User } = db.orm.public;

async function signUpUser(input: SignupUser) {
  const data = signUpUserSchema.parse(input);

  const userExists = await User.first({ email: data.email });
  if (userExists) {
    throw new Error("User already exists with the given email");
  }

  const hashedPass = await bcrypt.hash(data.password, SALT_ROUNDS);

  const dob = Temporal.PlainDate.from(data.dob)
    .toZonedDateTime({
      timeZone: "UTC",
      plainTime: Temporal.PlainTime.from("00:00"),
    })
    .toInstant();

  const result = await User.select(
    "id",
    "email",
    "firstName",
    "lastName",
    "gender",
    "dob",
    "createdAt",
  ).create({
    ...data,
    password: hashedPass,
    dob,
  });
  if (!result) {
    throw new Error("Error while creating User.");
  }

  return result;
}

async function signInUser(input: SignInUser) {
  const data = await signInUserSchema.parse(input);

  const userExists = await User.first({ email: data.email });
  if (!userExists) {
    throw new Error("User does not exists");
  }

  const isCorrectPass = await bcrypt.compare(
    data.password,
    userExists.password,
  );
  if (!isCorrectPass) {
    throw new Error("Incorrect password");
  }

  if (!JWT_SECRET) {
    throw new Error("Jwt secret is not defined");
  }

  const dob = userExists.dob
    ? Temporal.Instant.from(userExists.dob)
        .toZonedDateTimeISO("UTC")
        .toPlainDate()
        .toString()
    : undefined;

  const token = jwt.sign(
    {
      id: userExists.id,
      email: userExists.email,
      gender: userExists.gender,
      firstName: userExists.firstName,
      lastName: userExists.lastName,
      dob: dob,
      createdAt: userExists.createdAt.toString(),
    },
    JWT_SECRET,
    {
      expiresIn: "7d",
    },
  );

  const safeUser = {
    id: userExists.id,
    email: userExists.email,
    gender: userExists.gender,
    firstName: userExists.firstName,
    lastName: userExists.lastName,
    dob: dob,
    createdAt: userExists.createdAt.toString(),
  };

  return { token, user: safeUser };
}

const googleClient = new OAuth2Client();

async function googleAuth(input: { idToken: string }) {
  const { idToken } = googleAuthSchema.parse(input);

  if (!GOOGLE_CLIENT_ID) {
    throw new AppError(
      "Google Client ID is not configured on the server. Please set GOOGLE_CLIENT_ID in your environment.",
      500,
    );
  }

  let ticket;
  try {
    ticket = await googleClient.verifyIdToken({
      idToken,
      audience: GOOGLE_CLIENT_ID,
    });
  } catch (error: any) {
    throw new AppError(
      "Invalid or expired Google token: " + (error.message || "Verification failed"),
      401,
    );
  }

  const payload = ticket.getPayload();
  if (!payload) {
    throw new AppError("Invalid Google token payload.", 401);
  }

  // 1. Verify email status
  if (!payload.email || !payload.email_verified) {
    throw new AppError(
      "Google email is unverified or missing. A verified Google email is required to sign in.",
      400,
    );
  }

  // 2. Validate token issuer
  const validIssuers = ["accounts.google.com", "https://accounts.google.com"];
  if (!payload.iss || !validIssuers.includes(payload.iss)) {
    throw new AppError("Invalid Google token issuer.", 401);
  }

  const email = payload.email.toLowerCase().trim();

  // 3. Find or safely create account
  let user = await User.first({ email });

  if (!user) {
    const rawFirstName = payload.given_name || payload.name?.split(" ")[0] || "Google";
    const rawLastName = payload.family_name || payload.name?.split(" ").slice(1).join(" ") || "User";
    const firstName = rawFirstName.trim().slice(0, 50) || "Google";
    const lastName = rawLastName.trim().slice(0, 50) || "User";

    // Since password is non-nullable in the fixed Prisma schema, generate an unguessable bcrypt hash
    const randomPassword = crypto.randomBytes(32).toString("hex");
    const hashedPassword = await bcrypt.hash(randomPassword, SALT_ROUNDS);

    try {
      await User.create({
        email,
        password: hashedPassword,
        firstName,
        lastName,
        gender: "OTHER",
        dob: null,
      });
      user = await User.first({ email });
    } catch {
      // Handle potential race condition / concurrent creation
      user = await User.first({ email });
    }
  }

  if (!user) {
    throw new AppError("Failed to provision account for verified Google user.", 500);
  }

  if (!JWT_SECRET) {
    throw new AppError("JWT secret is not defined on the server.", 500);
  }

  const dob = user.dob
    ? Temporal.Instant.from(user.dob)
        .toZonedDateTimeISO("UTC")
        .toPlainDate()
        .toString()
    : undefined;

  const token = jwt.sign(
    {
      id: user.id,
      email: user.email,
      gender: user.gender,
      firstName: user.firstName,
      lastName: user.lastName,
      dob,
      createdAt: user.createdAt.toString(),
    },
    JWT_SECRET,
    {
      expiresIn: "7d",
    },
  );

  return { token, user };
}

async function forgotPassword(input: { email: string }) {
  const data = forgotPasswordSchema.parse(input);
  const user = await User.first({ email: data.email });
  if (!user) {
    // Avoid user enumeration
    return { message: "If an account exists with this email, a reset token has been generated." };
  }

  const resetToken = jwt.sign(
    { id: user.id, purpose: "password_reset" },
    JWT_SECRET,
    { expiresIn: "1h" },
  );

  return {
    message: "Password reset token generated successfully",
    resetToken,
  };
}

async function resetPassword(input: { token: string; newPassword: string }) {
  const data = resetPasswordSchema.parse(input);

  let payload: any;
  try {
    payload = jwt.verify(data.token, JWT_SECRET);
  } catch {
    throw new AppError("Invalid or expired reset token.", 400);
  }

  if (payload.purpose !== "password_reset" || !payload.id) {
    throw new AppError("Invalid reset token.", 400);
  }

  const user = await User.first({ id: payload.id });
  if (!user) {
    throw new AppError("User not found.", 404);
  }

  const hashedPassword = await bcrypt.hash(data.newPassword, SALT_ROUNDS);
  await User.where({ id: user.id }).update({ password: hashedPassword });

  return { message: "Password reset successful. Please sign in with your new password." };
}

export { signUpUser, signInUser, googleAuth, forgotPassword, resetPassword };

