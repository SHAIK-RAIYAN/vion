import zod from "zod";

const signUpUserSchema = zod.object({
  email: zod.email(),
  password: zod.string().min(8),
  firstName: zod.string().trim().min(1).max(50),
  lastName: zod.string().trim().min(1).max(50),
  gender: zod.enum(["MALE", "FEMALE", "OTHER"]),
  dob: zod.iso.date(),
});

const signInUserSchema = zod.object({
  email: zod.email(),
  password: zod.string().min(8),
});

const googleAuthSchema = zod.object({
  idToken: zod.string().min(1, "Google ID token is required"),
});

type SignupUser = zod.infer<typeof signUpUserSchema>;
type SignInUser = zod.infer<typeof signInUserSchema>;
type GoogleAuthInput = zod.infer<typeof googleAuthSchema>;

export { signUpUserSchema, signInUserSchema, googleAuthSchema };

export type { SignupUser, SignInUser, GoogleAuthInput };
