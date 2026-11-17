import type { ObjectId } from "mongodb";

export interface HolidayDoc {
  _id?: ObjectId;
  date: string;         // ISO "YYYY-MM-DD" — unique key
  name: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface HolidayPublic {
  date: string;         // ISO "YYYY-MM-DD"
  name: string;
  description?: string;
}
