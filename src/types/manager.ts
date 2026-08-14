import type { ObjectId } from "mongodb";

export interface ManagerDoc {
  _id?: ObjectId;
  email: string;
  passwordHash: string;
  name: string;
  team: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ManagerPublic {
  email: string;
  name: string;
  team: string;
}
