import { redirect } from "next/navigation";

/** F17: the two per-kind situation libraries became one at /vision/situations. */
export default function CueSituationsPage() {
  redirect("/vision/situations");
}
