import { redirect } from "next/navigation";

// Стартовая страница системы — список заказов (PRD, «Карта экранов»).
export default function Home() {
  redirect("/orders");
}
