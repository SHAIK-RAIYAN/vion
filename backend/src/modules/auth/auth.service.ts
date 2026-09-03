import { db } from "../../prisma/db";
import {
  signInUserSchema,
  signUpUserSchema,
  type SignInUser,
  type SignupUser,
} from "./auth.schema";
import "temporal-polyfill/full/global";

const { User } = db.orm.public;

async function signUpUser(input: SignupUser) {
  const data = signUpUserSchema.parse(input);

  const userExists = await User.first({ email: data.email });
  if (userExists) {
    throw new Error("User already exists with the given email");
  }

  const result = await User.create({
    ...data,
    dob: Temporal.Instant.fromEpochMilliseconds(data.dob.getTime()),
  });
  if (!result) {
    throw new Error("Error while creating User.");
  }

  return result;
}

async function signInUser(input: SignInUser) {
  const data = await signInUserSchema.parse(input);

  //
}

export { signUpUser, signInUser };
