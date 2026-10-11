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

const forgotPasswordSchema = zod.object({
  email: zod.email(),
});

const resetPasswordSchema = zod.object({
  token: zod.string().min(1, "Reset token is required"),
  newPassword: zod.string().min(8, "Password must be at least 8 characters"),
});

type SignupUser = zod.infer<typeof signUpUserSchema>;
type SignInUser = zod.infer<typeof signInUserSchema>;
type GoogleAuthInput = zod.infer<typeof googleAuthSchema>;
type ForgotPasswordInput = zod.infer<typeof forgotPasswordSchema>;
type ResetPasswordInput = zod.infer<typeof resetPasswordSchema>;

export {
  signUpUserSchema,
  signInUserSchema,
  googleAuthSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
};

export type {
  SignupUser,
  SignInUser,
  GoogleAuthInput,
  ForgotPasswordInput,
  ResetPasswordInput,
};

