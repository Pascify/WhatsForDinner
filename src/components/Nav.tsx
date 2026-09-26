import Link from "next/link";
import { logout } from "@/app/actions/auth";

const LINKS = [
  { href: "/" as const, label: "This week" },
  { href: "/preferences" as const, label: "Preferences" },
  { href: "/meals" as const, label: "Meals" },
];

export function Nav({ isAdmin }: { isAdmin?: boolean }) {
  return (
    <nav className="mb-8 flex flex-wrap items-center gap-4 border-b border-stone-200 pb-3 text-sm dark:border-stone-800">
      <span className="font-semibold">WhatsForDinner 🍽️</span>
      {LINKS.map((link) => (
        <Link key={link.href} href={link.href} className="text-stone-600 hover:underline dark:text-stone-400">
          {link.label}
        </Link>
      ))}
      {isAdmin && (
        <Link href="/admin" className="text-stone-600 hover:underline dark:text-stone-400">
          Admin
        </Link>
      )}
      <form action={logout} className="ml-auto">
        <button className="text-stone-500 hover:underline">Log out</button>
      </form>
    </nav>
  );
}
