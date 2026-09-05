import zod from "zod";
const updateUserSchema = zod.object({
  firstName: zod.string().trim().min(1).max(50).optional(),
  lastName: zod.string().trim().min(1).max(50).optional(),
  gender: zod.enum(["MALE", "FEMALE", "OTHER"]).optional(),
});

type UpdateUserType = zod.infer<typeof updateUserSchema>;

export { updateUserSchema };
export type { UpdateUserType };
