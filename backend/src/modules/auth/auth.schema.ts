import zod from "zod";

const signUpUserSchema = zod.object({
  email: zod.email(),
  password: zod.string().min(8),
  firstName: zod.string(),
  lastName: zod.string(),
  gender: zod.enum(["MALE", "FEMALE", "OTHER"]),
  dob: zod.date(),
});

const signInUserSchema = zod.object({
  email: zod.email(),
  password: zod.string().min(8),
});

type SignupUser = zod.infer<typeof signUpUserSchema>;
type SignInUser = zod.infer<typeof signInUserSchema>;

export { signUpUserSchema, signInUserSchema };

export type { SignupUser, SignInUser };
