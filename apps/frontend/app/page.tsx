import { redirect } from "next/navigation";

export default function Page() {
  redirect("/login"); // yoki redirect("/dashboard") login bo'lsa
}