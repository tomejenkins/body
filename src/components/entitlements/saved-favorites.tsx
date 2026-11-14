import { loadStartOptions } from "@/features/workout-selection/queries";
import { FavoriteActions } from "@/components/workouts/favorite-actions";
// Expiration restricts launching, not viewing or managing existing structures.
export async function SavedFavorites() {
  const { favorites } = await loadStartOptions();
  return (
    <section className="favorite-workouts" aria-label="Your Favorites">
      <h2>Your Favorites</h2>
      {favorites.length ? (
        <ul>
          {favorites.map((f) => (
            <li key={f.id} className="favorite-shortcut">
              <div>
                <h3>{f.name}</h3>
                <p>
                  {f.movements} movements ·{" "}
                  {f.attribution.program ?? f.attribution.workout}
                  {f.attribution.day ? ` · ${f.attribution.day}` : ""}
                </p>
              </div>
              <FavoriteActions id={f.id} name={f.name} />
            </li>
          ))}
        </ul>
      ) : (
        <p>No saved Favorites.</p>
      )}
    </section>
  );
}
