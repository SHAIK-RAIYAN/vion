import { db } from "../../prisma/db";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import {
  signInUserSchema,
  signUpUserSchema,
  type SignInUser,
  type SignupUser,
} from "./auth.schema";
import "temporal-polyfill/full/global";
import { JWT_SECRET, SALT_ROUNDS } from "../../config/config";

const { User } = db.orm.public;

async function signUpUser(input: SignupUser) {
  const data = signUpUserSchema.parse(input);

  const userExists = await User.first({ email: data.email });
  if (userExists) {
    throw new Error("User already exists with the given email");
  }

  const hashedPass = await bcrypt.hash(data.password, SALT_ROUNDS);

  const result = await User.create({
    ...data,
    password: hashedPass,
    dob: Temporal.Instant.fromEpochMilliseconds(data.dob.getTime()),
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

  const token = jwt.sign(
    {
      id: userExists.id,
      email: userExists.email,
      gender: userExists.gender,
      firstName: userExists.firstName,
      lastName: userExists.lastName,
      dob: userExists.dob,
      createdAt: userExists.createdAt,
    },
    JWT_SECRET,
    {
      expiresIn: "7d",
    },
  );

  return token;
}

export { signUpUser, signInUser };
