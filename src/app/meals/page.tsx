import { redirect } from "next/navigation";
import { createMeal, toggleMeal } from "@/app/actions/meals";
import { Badge, Button, Card, Input, PageHeader, QuietButton } from "@/components/ui";
import { Nav } from "@/components/Nav";
import { currentUser } from "@/lib/auth/session";
import { catalogFor } from "@/lib/portal/meals";
import { TAG_GROUPS } from "@/lib/plan/types";

export const dynamic = "force-dynamic";

const NEW_MEAL_TAGS = [
  ...TAG_GROUPS.base,
  ...TAG_GROUPS.protein,
  ...TAG_GROUPS.style,
  ...TAG_GROUPS.diet,
  ...TAG_GROUPS.vibe,
];

export default async function MealsPage() {
  const doc = await currentUser();
  if (!doc) redirect("/login");

  const catalog = await catalogFor(doc._id.toHexString());
  const active = catalog.filter((meal) => !meal.hidden).length;

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
      <Nav isAdmin={doc.role === "admin"} />
      <PageHeader title={`Meals (${active} in rotation)`} />

      <Card className="mb-6">
        <h2 className="mb-3 font-medium">Add your own</h2>
        <form action={createMeal} className="space-y-3">
          <Input name="name" placeholder="Chicken Karahi" required maxLength={60} />
          <div className="flex flex-wrap gap-2">
            {NEW_MEAL_TAGS.map((tag) => (
              <label
                key={tag}
                className="rounded-full border border-stone-300 px-2 py-0.5 text-xs dark:border-stone-700"
              >
                <input type="checkbox" name="tags" value={tag} className="mr-1" />
                {tag}
              </label>
            ))}
          </div>
          <p className="text-xs text-stone-500">
            Tags are what rules match on, so a meal with no tags can only be picked at random.
          </p>
          <Button type="submit">Add meal</Button>
        </form>
      </Card>

      <ul className="space-y-2">
        {catalog.map((meal) => (
          <li key={meal.id}>
            <Card className="flex items-center justify-between gap-3 py-3">
              <div className={meal.hidden ? "opacity-50" : undefined}>
                <p className="font-medium">
                  {meal.name} {meal.own && <Badge>yours</Badge>}
                </p>
                <p className="text-xs text-stone-500">{meal.tags.join(" · ") || "no tags"}</p>
              </div>
              <form action={toggleMeal}>
                <input type="hidden" name="mealId" value={meal.id} />
                <input type="hidden" name="hidden" value={String(!meal.hidden)} />
                <QuietButton type="submit">{meal.hidden ? "Bring back" : "Hide"}</QuietButton>
              </form>
            </Card>
          </li>
        ))}
      </ul>
    </main>
  );
}
