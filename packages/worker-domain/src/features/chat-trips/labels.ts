type TripProjectLabel = {
  title: string;
  origin: string | null;
  destination: string | null;
};

export function formatTripProjectLabel(project: Pick<TripProjectLabel, "title" | "origin" | "destination">) {
  const route = [project.origin, project.destination].filter(Boolean).join(" → ");

  return route ? `${project.title} (${route})` : project.title;
}
