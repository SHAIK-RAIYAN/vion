export {};

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        gender: "MALE" | "FEMALE" | "OTHER";
        firstName: string;
        lastName: string;
        dob: string;
        createdAt: string;
      };
    }
  }
}
